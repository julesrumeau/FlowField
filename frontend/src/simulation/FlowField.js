import { createNoise } from './noise.js';

export class FlowField {
  constructor({ noiseScale, seed }) {
    this.noiseScale = noiseScale;
    this._noise = createNoise(seed);
    // Seed offset shifts the noise space to produce a distinct field per seed
    this._seedOffset = (seed % 1000) * 0.001;
  }

  getVector(x, y, z, time) {
    const s = this.noiseScale;
    const o = this._seedOffset;
    const nx = x * s + o;
    const ny = y * s + o;
    const nz = z * s + time;

    return {
      x: this._noise.noise3D(nx,       ny,       nz),
      y: this._noise.noise3D(nx + 100, ny + 100, nz),
      z: this._noise.noise3D(nx + 200, ny + 200, nz),
    };
  }
}
