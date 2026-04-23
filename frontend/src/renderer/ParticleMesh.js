import * as THREE from 'three';

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
    });

    this.mesh = new THREE.Points(geometry, material);
    this._geometry = geometry;
  }

  sync() {
    this._geometry.attributes.position.needsUpdate = true;
  }
}
