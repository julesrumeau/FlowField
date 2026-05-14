const EXPORT_URL = '/export-api/export';

// Ordre de préférence des codecs : on tente d'abord H.264 dans WebM (avc1) car le
// service export peut alors faire un remux direct (rapide, sans ré-encodage).
// VP9 et VP8 sont des fallbacks si le navigateur ne supporte pas avc1.
const PREFERRED_CODECS = [
  'video/webm;codecs=avc1',   // H.264 → remux direct côté serveur
  'video/webm;codecs=vp9',    // VP9  → ré-encodage libx264
  'video/webm;codecs=vp8',    // VP8  → ré-encodage libx264
  'video/webm',               // codec laissé au choix du navigateur
];
const BITRATE = 8_000_000;   // 8 Mbps : qualité suffisante pour du WebGL animé

export class VideoExporter {
  constructor({ renderer }) {
    this._renderer = renderer;
    this._recorder  = null;
    this._chunks    = [];
    this._startTime = 0;
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

    // captureStream(0) = mode MANUEL de capture.
    // captureStream(60) (mode auto) force le navigateur à synchroniser le canvas avec
    // le compositor à chaque frame → ralentit le rendu de 60 à ~30fps pendant l'enregistrement.
    // Avec 0, on contrôle soi-même quand chaque frame est soumise via requestFrame().
    const stream = this._renderer.canvas.captureStream(0);
    this._track = stream.getVideoTracks()[0];

    this._recorder = new MediaRecorder(stream, {
      mimeType,
      videoBitsPerSecond: BITRATE,
    });

    // ondataavailable : MediaRecorder émet des chunks de données encodées périodiquement.
    // On les accumule dans un tableau pour les assembler en un seul Blob à la fin.
    this._recorder.ondataavailable = e => {
      if (e.data.size > 0) this._chunks.push(e.data);
    };

    this._recorder.onstop = () => this._onStop(mimeType, btnStart, btnStop, rec, msg);

    this._recorder.start();
    btnStart.disabled = true;
    btnStop.disabled  = false;
    rec.style.display = 'inline';

    // RAF dédié uniquement à la soumission de frames au stream vidéo.
    // Il tourne en parallèle du RAF du renderer (qui gère la simulation et l'affichage).
    // requestFrame() dit au stream "la frame actuelle du canvas est prête, enregistre-la".
    const submitFrame = () => {
      if (this._recorder?.state === 'recording' && this._track) {
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
