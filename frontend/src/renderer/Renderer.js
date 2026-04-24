import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { PostProcessing } from './PostProcessing.js';

export class Renderer {
  constructor({ canvas, particleSystem, particleMesh, trailLength = 0.95, bloomStrength = 1.0 }) {
    this._canvas         = canvas;
    this._particleSystem = particleSystem;
    this._particleMesh   = particleMesh;
    this._trailLength    = trailLength;
    this._bloomStrength  = bloomStrength;
    this._time   = 0;
    this._lastTs = null;
  }

  init() {
    this._renderer = new THREE.WebGLRenderer({ canvas: this._canvas, antialias: false });
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

    window.addEventListener('resize', () => this._onResize());
  }

  _onResize() {
    const w = window.innerWidth, h = window.innerHeight;
    this._camera.aspect = w / h;
    this._camera.updateProjectionMatrix();
    this._renderer.setSize(w, h);
    this._post.resize(w, h);
  }

  start() {
    requestAnimationFrame(ts => this._loop(ts));
  }

  _loop(ts) {
    requestAnimationFrame(ts2 => this._loop(ts2));
    const dt = this._lastTs === null ? 0.016 : Math.min((ts - this._lastTs) / 1000, 0.05);
    this._lastTs = ts;
    this.tick(dt, this._time);
    this._time += dt;
  }

  tick(dt, time) {
    this._particleSystem.update(dt, time);
    this._particleMesh.sync();
    this._controls.update();
    this._post.render();
  }

  setTrailLength(v)   { this._post.setTrailLength(v); }
  setBloomStrength(v) { this._post.setBloomStrength(v); }
}
