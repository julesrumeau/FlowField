const EXPORT_URL      = '/export-api/export';
const RECORD_DURATION = 10_000;
const EXPORT_WIDTH    = 1920;
const EXPORT_HEIGHT   = 1080;
const EXPORT_FPS      = 60;

export class VideoExporter {
  constructor({ renderer }) {
    this._renderer = renderer;
  }

  async export() {
    const btn   = document.getElementById('btn-export');
    const msg   = document.getElementById('export-msg');
    const origW = window.innerWidth;
    const origH = window.innerHeight;

    try {
      this._renderer.resize(EXPORT_WIDTH, EXPORT_HEIGHT);

      const mimeType = MediaRecorder.isTypeSupported('video/webm;codecs=vp9')
        ? 'video/webm;codecs=vp9'
        : 'video/webm';

      const stream   = this._renderer.canvas.captureStream(EXPORT_FPS);
      const recorder = new MediaRecorder(stream, { mimeType });
      const chunks   = [];

      recorder.ondataavailable = e => { if (e.data.size > 0) chunks.push(e.data); };

      this._setStatus(btn, 'recording');

      const blob = await new Promise((resolve, reject) => {
        recorder.onstop  = () => resolve(new Blob(chunks, { type: mimeType }));
        recorder.onerror = reject;
        recorder.start();
        setTimeout(() => recorder.stop(), RECORD_DURATION);
      });

      this._setStatus(btn, 'encoding');

      const formData = new FormData();
      formData.append('file', blob, 'capture.webm');

      const response = await fetch(EXPORT_URL, { method: 'POST', body: formData });

      if (!response.ok) {
        const err = await response.json();
        throw new Error(err.detail ?? 'Export failed');
      }

      const mp4Blob = await response.blob();
      const url     = URL.createObjectURL(mp4Blob);
      const a       = document.createElement('a');
      a.href        = url;
      a.download    = 'flowfield.mp4';
      a.click();
      URL.revokeObjectURL(url);

      this._setStatus(btn, 'idle');
    } catch (err) {
      console.error('Export error:', err);
      msg.textContent = err.message || 'Erreur export';
      this._setStatus(btn, 'error');
      setTimeout(() => { msg.textContent = ''; this._setStatus(btn, 'idle'); }, 3000);
    } finally {
      this._renderer.resize(origW, origH);
    }
  }

  _setStatus(btn, status) {
    const labels = { recording: 'Enregistrement…', encoding: 'Encodage…' };
    btn.textContent = labels[status] ?? 'Export MP4';
    btn.disabled    = status === 'recording' || status === 'encoding';
  }
}
