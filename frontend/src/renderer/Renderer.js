import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

export class Renderer {
  constructor({ canvas, particleSystem, particleMesh }) {
    this._canvas = canvas;
    this._particleSystem = particleSystem;
    this._particleMesh = particleMesh;
    this._time = 0;
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

    window.addEventListener('resize', () => this._onResize());
  }

  _onResize() {
    this._camera.aspect = window.innerWidth / window.innerHeight;
    this._camera.updateProjectionMatrix();
    this._renderer.setSize(window.innerWidth, window.innerHeight);
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
    this._renderer.render(this._scene, this._camera);
  }
}
