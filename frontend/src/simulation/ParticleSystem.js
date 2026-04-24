const MAX_COUNT = 150000;

export class ParticleSystem {
  constructor({ particleCount, flowField, speed, turbulence, bounds }) {
    this._count = Math.min(particleCount, MAX_COUNT);
    this._flowField = flowField;
    this._speed = speed;
    this._turbulence = turbulence;
    this._bounds = bounds;

    this.positions   = new Float32Array(MAX_COUNT * 3);
    this._velocities = new Float32Array(MAX_COUNT * 3);

    this._init();
  }

  _init() {
    const b = this._bounds;
    for (let i = 0; i < this._count; i++) {
      this.positions[i * 3]     = (Math.random() * 2 - 1) * b;
      this.positions[i * 3 + 1] = (Math.random() * 2 - 1) * b;
      this.positions[i * 3 + 2] = (Math.random() * 2 - 1) * b;
    }
  }


  setParams({ speed, turbulence }) {
    if (speed      !== undefined) this._speed      = speed;
    if (turbulence !== undefined) this._turbulence = turbulence;
  }

  setCount(n) {
    const prev = this._count;
    this._count = Math.max(1000, Math.min(Math.round(n), MAX_COUNT));
    if (this._count > prev) {
      const b = this._bounds;
      for (let i = prev; i < this._count; i++) {
        this.positions[i * 3]     = (Math.random() * 2 - 1) * b;
        this.positions[i * 3 + 1] = (Math.random() * 2 - 1) * b;
        this.positions[i * 3 + 2] = (Math.random() * 2 - 1) * b;
        this._velocities[i * 3]     = 0;
        this._velocities[i * 3 + 1] = 0;
        this._velocities[i * 3 + 2] = 0;
      }
    }
  }

  update(dt, time) {
    const b = this._bounds;
    const t = this._turbulence;
    const s = this._speed;

    for (let i = 0; i < this._count; i++) {
      const i3 = i * 3;
      const px = this.positions[i3];
      const py = this.positions[i3 + 1];
      const pz = this.positions[i3 + 2];

      const v = this._flowField.getVector(px, py, pz, time);

      const tx = v.x * s;
      const ty = v.y * s;
      const tz = v.z * s;

      this._velocities[i3]     += (tx - this._velocities[i3])     * t;
      this._velocities[i3 + 1] += (ty - this._velocities[i3 + 1]) * t;
      this._velocities[i3 + 2] += (tz - this._velocities[i3 + 2]) * t;

      this.positions[i3]     += this._velocities[i3]     * dt;
      this.positions[i3 + 1] += this._velocities[i3 + 1] * dt;
      this.positions[i3 + 2] += this._velocities[i3 + 2] * dt;

      if (this.positions[i3]     >  b) this.positions[i3]     = -b;
      if (this.positions[i3]     < -b) this.positions[i3]     =  b;
      if (this.positions[i3 + 1] >  b) this.positions[i3 + 1] = -b;
      if (this.positions[i3 + 1] < -b) this.positions[i3 + 1] =  b;
      if (this.positions[i3 + 2] >  b) this.positions[i3 + 2] = -b;
      if (this.positions[i3 + 2] < -b) this.positions[i3 + 2] =  b;
    }
  }
}
