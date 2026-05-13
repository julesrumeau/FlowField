import * as THREE from 'three';
import { TEXTURE_WIDTH, TEXTURE_HEIGHT } from '../simulation/ParticleSystem.js';

const MAX_COUNT = TEXTURE_WIDTH * TEXTURE_HEIGHT;

const VERTEX_SHADER = `
  attribute float aIndex;
  uniform sampler2D texturePosition;
  uniform float u_size;
  uniform float u_count;
  uniform float u_bounds;

  varying float vAlpha;

  void main() {
    if (aIndex >= u_count) {
      gl_Position  = vec4(0.0, 0.0, 9999.0, 1.0);
      gl_PointSize = 0.0;
      vAlpha = 0.0;
      return;
    }

    float col = mod(aIndex, ${TEXTURE_WIDTH}.0);
    float row = floor(aIndex / ${TEXTURE_WIDTH}.0);
    vec2 uv   = (vec2(col, row) + 0.5) / vec2(${TEXTURE_WIDTH}.0, ${TEXTURE_HEIGHT}.0);
    vec3 pos  = texture2D(texturePosition, uv).xyz;

    // Radial alpha fade: particles near the bounds dissolve progressively
    float dist      = length(pos);
    float noiseFade = (sin(pos.x * 0.11) + sin(pos.y * 0.13) + sin(pos.z * 0.17)) * 0.2;
    float d         = dist + noiseFade * u_bounds * 0.15;
    float fadeStart = u_bounds * 0.4;
    float t         = smoothstep(fadeStart, u_bounds, d);
    vAlpha          = 1.0 - t * t;

    vec4 mvPosition  = modelViewMatrix * vec4(pos, 1.0);
    gl_PointSize     = u_size * (300.0 / -mvPosition.z);
    gl_Position      = projectionMatrix * mvPosition;
  }
`;

const FRAGMENT_SHADER = `
  varying float vAlpha;

  void main() {
    // Circular radial gradient matching the former CanvasTexture
    vec2  uv = gl_PointCoord - vec2(0.5);
    float r  = length(uv) * 2.0;
    float a1 = mix(1.0, 0.9, smoothstep(0.0, 0.8, r));
    float a2 = mix(0.9, 0.0, smoothstep(0.8, 1.0, r));
    float circleAlpha = r < 0.8 ? a1 : a2;
    if (circleAlpha < 0.01) discard;
    gl_FragColor = vec4(1.0, 1.0, 1.0, circleAlpha * vAlpha);
  }
`;

export class ParticleMesh {
  constructor({ bounds = 50, count = MAX_COUNT } = {}) {
    const indices = new Float32Array(MAX_COUNT);
    for (let i = 0; i < MAX_COUNT; i++) indices[i] = i;

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('aIndex', new THREE.BufferAttribute(indices, 1));
    geometry.setDrawRange(0, MAX_COUNT);

    this._material = new THREE.ShaderMaterial({
      uniforms: {
        texturePosition: { value: null },
        u_size:          { value: 1.5 },
        u_count:         { value: MAX_COUNT },
        u_bounds:        { value: bounds },
      },
      vertexShader:   VERTEX_SHADER,
      fragmentShader: FRAGMENT_SHADER,
      blending:       THREE.AdditiveBlending,
      depthWrite:     false,
      depthTest:      false,
      transparent:    true,
    });

    this.mesh = new THREE.Points(geometry, this._material);
    this.mesh.frustumCulled = false;
    this.mesh.geometry.setDrawRange(0, count);
  }

  setPositionTexture(tex) { this._material.uniforms.texturePosition.value = tex; }
  setSize(n)              { this._material.uniforms.u_size.value  = n; }
  setCount(n)             { this._material.uniforms.u_count.value = n; this.mesh.geometry.setDrawRange(0, n); }
}
