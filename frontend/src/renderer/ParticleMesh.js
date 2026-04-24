import * as THREE from 'three';

function makeCircleTexture() {
  const size = 64;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d');
  const r = size / 2;
  const g = ctx.createRadialGradient(r, r, 0, r, r, r);
  g.addColorStop(0.0, 'rgba(255,255,255,1.0)');
  g.addColorStop(0.4, 'rgba(255,255,255,0.9)');
  g.addColorStop(1.0, 'rgba(255,255,255,0.0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  return new THREE.CanvasTexture(canvas);
}

function smoothstep(edge0, edge1, x) {
  const t = Math.max(0, Math.min(1, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

export class ParticleMesh {
  constructor(positions) {
    const maxCount = positions.length / 3;
    this._colors = new Float32Array(maxCount * 3);

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute('color', new THREE.BufferAttribute(this._colors, 3));

    const material = new THREE.PointsMaterial({
      size: 1.5,
      sizeAttenuation: true,
      blending: THREE.AdditiveBlending,
      vertexColors: true,
      transparent: true,
      depthWrite: false,
      depthTest: false,
      map: makeCircleTexture(),
      alphaTest: 0.01,
    });

    this.mesh = new THREE.Points(geometry, material);
    this._geometry = geometry;
    this._material = material;
  }

  setDrawCount(n) {
    this._geometry.setDrawRange(0, n);
  }

  setSize(n) {
    this._material.size = n;
  }

  sync(positions, count, bounds) {
    const colors = this._colors;
    const fadeStart = bounds * 0.75;

    for (let i = 0; i < count; i++) {
      const x = positions[i * 3];
      const y = positions[i * 3 + 1];
      const z = positions[i * 3 + 2];
      const dist = Math.sqrt(x * x + y * y + z * z);
      const f = 1 - smoothstep(fadeStart, bounds, dist);
      colors[i * 3]     = f;
      colors[i * 3 + 1] = f;
      colors[i * 3 + 2] = f;
    }

    this._geometry.attributes.color.needsUpdate    = true;
    this._geometry.attributes.position.needsUpdate = true;
  }
}
