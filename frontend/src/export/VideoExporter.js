const EXPORT_URL    = '/export-api/export';
const EXPORT_WIDTH  = 1920;
const EXPORT_HEIGHT = 1080;
const EXPORT_FPS    = 60;
const TOTAL_FRAMES  = 300; // 5 s @ 60 fps

export class VideoExporter {
  constructor({ renderer }) {
    this._renderer = renderer;
  }

  async export() {
    const overlay   = document.getElementById('export-overlay');
    const label     = document.getElementById('export-overlay-label');
    const barFill   = document.getElementById('export-overlay-bar-fill');
    const btn       = document.getElementById('btn-export');
    const msg       = document.getElementById('export-msg');
    const origW     = window.innerWidth;
    const origH     = window.innerHeight;

    const setProgress = (pct, text) => {
      label.textContent  = text;
      barFill.style.width = `${pct}%`;
    };

    try {
      this._renderer.pause();
      this._renderer.threeRenderer.setPixelRatio(1);
      this._renderer.resize(EXPORT_WIDTH, EXPORT_HEIGHT);

      overlay.style.display = 'flex';
      btn.disabled = true;

      const frames    = [];
      const dt        = 1 / EXPORT_FPS;
      const startTime = this._renderer.currentTime;

      for (let i = 0; i < TOTAL_FRAMES; i++) {
        const pct = Math.round(i / TOTAL_FRAMES * 100);
        setProgress(pct, `Capture ${pct}%`);

        this._renderer.tick(dt, startTime + i * dt);

        const blob = await new Promise((resolve, reject) => {
          this._renderer.canvas.toBlob(
            b => b ? resolve(b) : reject(new Error('toBlob failed')),
            'image/jpeg', 0.95,
          );
        });
        frames.push(blob);
      }

      setProgress(100, 'Encodage…');

      const formData = new FormData();
      formData.append('fps', String(EXPORT_FPS));
      frames.forEach((blob, i) =>
        formData.append('frames', blob, `frame_${String(i).padStart(4, '0')}.jpg`),
      );

      const response = await fetch(EXPORT_URL, { method: 'POST', body: formData });
      if (!response.ok) {
        const ct     = response.headers.get('content-type') ?? '';
        const errMsg = ct.includes('application/json')
          ? ((await response.json()).detail ?? 'Export failed')
          : `Export failed (HTTP ${response.status})`;
        throw new Error(errMsg);
      }

      const mp4Blob = await response.blob();
      const url     = URL.createObjectURL(mp4Blob);
      const a       = document.createElement('a');
      a.href     = url;
      a.download = 'flowfield.mp4';
      a.click();
      URL.revokeObjectURL(url);

    } catch (err) {
      console.error('Export error:', err);
      msg.textContent = err.message || 'Erreur export';
      setTimeout(() => { msg.textContent = ''; }, 3000);
    } finally {
      overlay.style.display = 'none';
      this._renderer.threeRenderer.setPixelRatio(window.devicePixelRatio);
      this._renderer.resize(origW, origH);
      this._renderer.resume();
      btn.disabled = false;
    }
  }
}
