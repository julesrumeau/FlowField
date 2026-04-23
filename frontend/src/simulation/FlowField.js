import { createNoise } from './noise.js';

export class FlowField {
  constructor({ noiseScale, seed }) {
    this.noiseScale = noiseScale;
    this._noise = createNoise(seed);
    this._seedOffset = (seed % 1000) * 0.001;
  }

  getVector(x, y, z, time) {
    const s = this.noiseScale;
    const o = this._seedOffset;

    // Three independent noise fields sampled at the particle position.
    // Incommensurable time rates → field never exactly repeats.
    // Normalising the result gives a uniform direction distribution on the sphere —
    // the 3D equivalent of angle = noise(x,y)*2π in classic 2D flow fields.
    const vx = this._noise.noise3D(x * s + o,       y * s + o,       z * s + time * 0.031 + o);
    const vy = this._noise.noise3D(x * s + o + 100, y * s + o + 100, z * s + time * 0.050 + o + 100);
    const vz = this._noise.noise3D(x * s + o + 200, y * s + o + 200, z * s + time * 0.041 + o + 200);

    const len = Math.sqrt(vx * vx + vy * vy + vz * vz) || 1;
    return { x: vx / len, y: vy / len, z: vz / len };
  }
}

