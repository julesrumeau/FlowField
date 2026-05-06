const EXPORT_URL = '/export-api/export';
const PREFERRED_CODECS = [
  'video/webm;codecs=avc1',
  'video/webm;codecs=vp9',
  'video/webm;codecs=vp8',
  'video/webm',
];
const BITRATE = 8_000_000;

export class VideoExporter {
  constructor({ renderer }) {
    this._renderer = renderer;
    this._recorder  = null;
    this._chunks    = [];
    this._startTime = 0;
    this._savedDpr  = null;
  }

  _reduceDpr() {
    this._savedDpr = this._renderer.threeRenderer.getPixelRatio();
    this._renderer.threeRenderer.setPixelRatio(1);
    this._renderer.resize(window.innerWidth, window.innerHeight);
  }

  _restoreDpr() {
    if (this._savedDpr === null) return;
    this._renderer.threeRenderer.setPixelRatio(this._savedDpr);
    this._renderer.resize(window.innerWidth, window.innerHeight);
    this._savedDpr = null;
  }

  startRecording() {
    const btnStart = document.getElementById('btn-record-start');
    const btnStop  = document.getElementById('btn-record-stop');
    const rec      = document.getElementById('rec-indicator');
    const msg      = document.getElementById('export-msg');

    const mimeType = PREFERRED_CODECS.find(c => MediaRecorder.isTypeSupported(c));
    if (!mimeType) {
      msg.textContent = 'Aucun codec WebM supporté';
      setTimeout(() => { msg.textContent = ''; }, 3000);
      return;
    }

    this._chunks    = [];
    this._startTime = Date.now();

    // DPR→1 : divise par 4 le nombre de pixels dans le trail buffer et les passes bloom
    // (sur écran retina DPR=2). Réduit la contention mémoire GPU avec l'encodeur vidéo.
    // La vidéo capturée est en 1920×1080 natif, ce qui est le bon compromis qualité/perf.
    this._reduceDpr();

    // captureStream(0) = mode manuel : Chrome ne copie rien automatiquement au compositor.
    // On soumet chaque frame via requestFrame() dans notre propre RAF, ce qui supprime la
    // synchronisation implicite compositor↔GPU qui causait la chute 60→30fps.
    const stream = this._renderer.canvas.captureStream(0);
    this._track = stream.getVideoTracks()[0];

    this._recorder = new MediaRecorder(stream, {
      mimeType,
      videoBitsPerSecond: BITRATE,
    });

    this._recorder.ondataavailable = e => {
      if (e.data.size > 0) this._chunks.push(e.data);
    };

    this._recorder.onstop = () => this._onStop(mimeType, btnStart, btnStop, rec, msg);

    this._recorder.start();
    btnStart.disabled = true;
    btnStop.disabled  = false;
    rec.style.display = 'inline';

    // RAF dédié à la soumission de frames : tourne en parallèle du RAF du renderer,
    // s'arrête dès que le recorder devient inactif.
    const submitFrame = () => {
      if (this._recorder?.state === 'recording') {
        this._track.requestFrame();
        requestAnimationFrame(submitFrame);
      }
    };
    requestAnimationFrame(submitFrame);
  }

  stopRecording() {
    if (this._recorder && this._recorder.state !== 'inactive') {
      this._recorder.stop();
    }
    this._track = null;
  }

  async _onStop(mimeType, btnStart, btnStop, rec, msg) {
    rec.style.display = 'none';
    btnStop.disabled  = true;
    // Restauration immédiate : le renderer revient en qualité pleine pendant que l'upload se fait.
    this._restoreDpr();

    const duration = Date.now() - this._startTime;
    if (duration < 1000) {
      msg.textContent = 'Enregistrement trop court';
      setTimeout(() => { msg.textContent = ''; }, 3000);
      btnStart.disabled = false;
      return;
    }

    const blob = new Blob(this._chunks, { type: mimeType });

    try {
      const response = await fetch(EXPORT_URL, {
        method: 'POST',
        headers: { 'Content-Type': mimeType },
        body: blob,
      });

      if (!response.ok) {
        const ct     = response.headers.get('content-type') ?? '';
        const errMsg = ct.includes('application/json')
          ? ((await response.json()).detail ?? 'Export échoué')
          : `Export échoué (HTTP ${response.status})`;
        throw new Error(errMsg);
      }

      const mp4Blob = await response.blob();
      const url     = URL.createObjectURL(mp4Blob);
      const a       = document.createElement('a');
      a.href        = url;
      a.download    = 'flowfield.mp4';
      a.click();
      URL.revokeObjectURL(url);

    } catch (err) {
      console.error('Export error:', err);
      msg.textContent = err.message || 'Erreur export';
      setTimeout(() => { msg.textContent = ''; }, 3000);
    } finally {
      btnStart.disabled = false;
    }
  }
}
