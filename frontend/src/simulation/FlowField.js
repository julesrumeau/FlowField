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

    // Two independent rotations in different planes of noise-space.
    // Incommensurable rates (0.05 / 0.031 ≈ golden ratio) → never exactly repeats.
    // Rotating rather than translating avoids a dominant scroll direction.
    const t1 = time * 0.05;
    const t2 = time * 0.031;

    const ct1 = Math.cos(t1), st1 = Math.sin(t1);
    const ct2 = Math.cos(t2), st2 = Math.sin(t2);

    // theta field: slow rotation in the xz noise-plane
    const nx1 = (x * ct1 - z * st1) * s + o;
    const ny1 = y * s + o;
    const nz1 = (x * st1 + z * ct1) * s + o;

    // phi field: slow rotation in the xy noise-plane (different axis + rate)
    const nx2 = (x * ct2 - y * st2) * s + o + 100;
    const ny2 = (x * st2 + y * ct2) * s + o + 100;
    const nz2 = z * s + o + 100;

    const theta = this._noise.noise3D(nx1, ny1, nz1) * Math.PI * 2;
    const phi   = this._noise.noise3D(nx2, ny2, nz2) * Math.PI;

    const sinPhi = Math.sin(phi);
    return {
      x: Math.cos(theta) * sinPhi,
      y: Math.sin(theta) * sinPhi,
      z: Math.cos(phi),
    };
  }
}
