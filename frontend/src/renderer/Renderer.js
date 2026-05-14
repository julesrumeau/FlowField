import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { PostProcessing } from './PostProcessing.js';

export class Renderer {
  constructor({ canvas, particleSystem, particleMesh, trailLength = 0.95, bloomStrength = 1.0, stats }) {
    this._canvas         = canvas;
    this._particleSystem = particleSystem;
    this._particleMesh   = particleMesh;
    this._trailLength    = trailLength;
    this._bloomStrength  = bloomStrength;
    this._time   = 0;
    this._lastTs = null;
    this._stats  = stats;
  }

  init() {
    this._paused   = false;
    // antialias:false car les particules sont petites et le bloom masque les aliasings.
    // preserveDrawingBuffer:true obligatoire pour captureStream() : sans ça, WebGL vide
    // le canvas après chaque présentation à l'écran et l'enregistrement capte un canvas vide.
    this._renderer = new THREE.WebGLRenderer({ canvas: this._canvas, antialias: false, preserveDrawingBuffer: true });
    this._renderer.setPixelRatio(window.devicePixelRatio);
    this._renderer.setSize(window.innerWidth, window.innerHeight);

    this._scene = new THREE.Scene();
    this._scene.add(this._particleMesh.mesh);

    this._camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 1000);
    this._camera.position.z = 150;

    this._controls = new OrbitControls(this._camera, this._canvas);
    this._controls.enableDamping = true;

    this._post = new PostProcessing({
      renderer:      this._renderer,
      scene:         this._scene,
      camera:        this._camera,
      trailLength:   this._trailLength,
      bloomStrength: this._bloomStrength,
    });

    this._onResizeBound = () => this._onResize();
    window.addEventListener('resize', this._onResizeBound);
  }

  get canvas()        { return this._canvas;   }
  get threeRenderer() { return this._renderer; }

  resize(w, h) {
    this._camera.aspect = w / h;
    this._camera.updateProjectionMatrix();
    this._renderer.setSize(w, h);
    this._post.resize(w, h);
  }

  _onResize() { this.resize(window.innerWidth, window.innerHeight); }

  get currentTime() { return this._time; }

  pause()  { this._paused = true; }
  resume() { this._paused = false; this._lastTs = null; requestAnimationFrame(ts => this._loop(ts)); }

  start() { requestAnimationFrame(ts => this._loop(ts)); }

  _loop(ts) {
    if (this._paused) return;
    requestAnimationFrame(ts2 => this._loop(ts2));
    // dt = temps écoulé depuis la dernière frame en secondes.
    // Min(dt, 0.05) plafonne à 50ms pour éviter un saut brutal si l'onglet est mis en pause.
    const dt = this._lastTs === null ? 0.016 : Math.min((ts - this._lastTs) / 1000, 0.05);
    this._lastTs = ts;
    try {
      this.tick(dt, this._time);
    } catch (err) {
      console.error('Renderer tick error:', err);
      return;
    }
    this._time += dt;
  }

  tick(dt, time) {
    this._stats?.begin();
    this._particleSystem.update(dt, time);
    this._particleMesh.setPositionTexture(this._particleSystem.getPositionTexture());
    this._controls.update();
    this._post.render();
    this._stats?.end();
  }

  setTrailLength(v)   { this._post.setTrailLength(v);   }
  setBloomStrength(v) { this._post.setBloomStrength(v); }

  dispose() {
    window.removeEventListener('resize', this._onResizeBound);
    this._controls.dispose();
    this._renderer.dispose();
  }
}
