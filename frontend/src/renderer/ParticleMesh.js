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

export class ParticleMesh {
  constructor(positions) {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));

    const material = new THREE.PointsMaterial({
      size: 1.5,
      sizeAttenuation: true,
      blending: THREE.AdditiveBlending,
      color: 0xffffff,
      transparent: true,
      depthWrite: false,
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

  sync() {
    this._geometry.attributes.position.needsUpdate = true;
  }
}
