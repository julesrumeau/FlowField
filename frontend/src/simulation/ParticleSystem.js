import * as THREE from 'three';
import { GPUComputationRenderer } from 'three/addons/misc/GPUComputationRenderer.js';
import { velocityShader } from './shaders/velocityShader.js';
import { positionShader } from './shaders/positionShader.js';

export const TEXTURE_WIDTH  = 1024;
export const TEXTURE_HEIGHT = 512;
const MAX_COUNT = TEXTURE_WIDTH * TEXTURE_HEIGHT;

function buildPermTexture(seed) {
  const src = new Uint8Array(256);
  for (let i = 0; i < 256; i++) src[i] = i;
  let s = (seed ^ 0x45FA91C3) >>> 0;
  for (let i = 255; i > 0; i--) {
    s = (s * 1664525 + 1013904223) >>> 0;
    const j = s % (i + 1);
    const tmp = src[i]; src[i] = src[j]; src[j] = tmp;
  }
  const data = new Uint8Array(512 * 4);
  for (let i = 0; i < 512; i++) data[i * 4] = src[i % 256];
  const tex = new THREE.DataTexture(data, 16, 32, THREE.RGBAFormat, THREE.UnsignedByteType);
  tex.minFilter = THREE.NearestFilter;
  tex.magFilter = THREE.NearestFilter;
  tex.wrapS     = THREE.ClampToEdgeWrapping;
  tex.wrapT     = THREE.ClampToEdgeWrapping;
  tex.needsUpdate = true;
  return tex;
}

export class ParticleSystem {
  constructor({ particleCount, speed, turbulence, noiseScale, bounds, seed }) {
    this._count      = Math.max(1000, Math.min(Math.round(particleCount), MAX_COUNT));
    this._speed      = speed;
    this._turbulence = turbulence;
    this._noiseScale = noiseScale;
    this._bounds     = bounds;
    this._seedOffset = (seed % 1000) * 0.001;
    this._permTex    = buildPermTexture(seed);
    this._gpuCompute = null;
    this._velVar     = null;
    this._posVar     = null;
  }

  init(threeRenderer) {
    this._gpuCompute = new GPUComputationRenderer(TEXTURE_WIDTH, TEXTURE_HEIGHT, threeRenderer);

    // Position init — random within bounds
    const posTex  = this._gpuCompute.createTexture();
    const posData = posTex.image.data;
    for (let i = 0; i < MAX_COUNT; i++) {
      posData[i * 4]     = (Math.random() * 2 - 1) * this._bounds;
      posData[i * 4 + 1] = (Math.random() * 2 - 1) * this._bounds;
      posData[i * 4 + 2] = (Math.random() * 2 - 1) * this._bounds;
      posData[i * 4 + 3] = 0;
    }

    // Velocity init — zeros (Float32Array default)
    const velTex = this._gpuCompute.createTexture();

    this._velVar = this._gpuCompute.addVariable('textureVelocity', velocityShader, velTex);
    this._posVar = this._gpuCompute.addVariable('texturePosition', positionShader, posTex);

    this._gpuCompute.setVariableDependencies(this._velVar, [this._velVar, this._posVar]);
    this._gpuCompute.setVariableDependencies(this._posVar, [this._posVar, this._velVar]);

    const err = this._gpuCompute.init();
    if (err !== null) console.error('GPUComputationRenderer init error:', err);

    const vu = this._velVar.material.uniforms;
    vu.u_time       = { value: 0 };
    vu.u_speed      = { value: this._speed };
    vu.u_turbulence = { value: this._turbulence };
    vu.u_noiseScale = { value: this._noiseScale };
    vu.u_seedOffset = { value: this._seedOffset };
    vu.tPerm        = { value: this._permTex };

    const pu = this._posVar.material.uniforms;
    pu.u_dt     = { value: 0.016 };
    pu.u_bounds = { value: this._bounds };
  }

  update(dt, time) {
    this._velVar.material.uniforms.u_time.value = time;
    this._posVar.material.uniforms.u_dt.value   = dt;
    this._gpuCompute.compute();
  }

  getPositionTexture() {
    return this._gpuCompute.getCurrentRenderTarget(this._posVar).texture;
  }

  setParams({ speed, turbulence, noiseScale }) {
    if (speed      !== undefined) { this._speed      = speed;      this._velVar.material.uniforms.u_speed.value      = speed;      }
    if (turbulence !== undefined) { this._turbulence = turbulence; this._velVar.material.uniforms.u_turbulence.value = turbulence; }
    if (noiseScale !== undefined) { this._noiseScale = noiseScale; this._velVar.material.uniforms.u_noiseScale.value = noiseScale; }
  }

  setCount(n) {
    this._count = Math.max(1000, Math.min(Math.round(n), MAX_COUNT));
  }

  get count() { return this._count; }
}
