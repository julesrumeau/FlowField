import * as THREE from 'three';
import { TEXTURE_WIDTH, TEXTURE_HEIGHT } from '../simulation/ParticleSystem.js';

const MAX_COUNT = TEXTURE_WIDTH * TEXTURE_HEIGHT;

const VERTEX_SHADER = `
  attribute float aIndex;           // index unique de la particule, de 0 à MAX_COUNT-1
  uniform sampler2D texturePosition; // texture GPU contenant toutes les positions
  uniform float u_size;
  uniform float u_count;
  uniform float u_bounds;

  varying float vAlpha;

  void main() {
    // Les particules au-delà du nombre actif sont envoyées hors champ (z=9999)
    // et rendues avec une taille nulle : elles ne s'affichent pas, sans branchement coûteux
    if (aIndex >= u_count) {
      gl_Position  = vec4(0.0, 0.0, 9999.0, 1.0);
      gl_PointSize = 0.0;
      vAlpha = 0.0;
      return;
    }

    // Astuce centrale : on convertit l'index en coordonnées UV pour lire la texture de positions.
    // Les positions restent sur le GPU — aucun readback CPU-GPU (qui serait très lent).
    float col = mod(aIndex, ${TEXTURE_WIDTH}.0);
    float row = floor(aIndex / ${TEXTURE_WIDTH}.0);
    vec2 uv   = (vec2(col, row) + 0.5) / vec2(${TEXTURE_WIDTH}.0, ${TEXTURE_HEIGHT}.0);
    vec3 pos  = texture2D(texturePosition, uv).xyz;

    // Fondu radial : les particules proches des bords de la scène deviennent transparentes.
    // Le bruit sinusoïdal sur la distance rend la frontière irrégulière (organique)
    // plutôt qu'une sphère parfaite avec un bord visible.
    float dist      = length(pos);
    float noiseFade = (sin(pos.x * 0.11) + sin(pos.y * 0.13) + sin(pos.z * 0.17)) * 0.2;
    float d         = dist + noiseFade * u_bounds * 0.15;
    float fadeStart = u_bounds * 0.4;
    float t         = smoothstep(fadeStart, u_bounds, d);
    vAlpha          = 1.0 - t * t;

    // Taille perspective : les particules lointaines apparaissent plus petites (300/-z)
    vec4 mvPosition  = modelViewMatrix * vec4(pos, 1.0);
    gl_PointSize     = u_size * (300.0 / -mvPosition.z);
    gl_Position      = projectionMatrix * mvPosition;
  }
`;

const FRAGMENT_SHADER = `
  varying float vAlpha;

  void main() {
    // gl_PointCoord est en [0,1] sur chaque point rendu.
    // On centre en [-0.5, 0.5] puis on calcule un rayon normalisé [0, 1].
    vec2  uv = gl_PointCoord - vec2(0.5);
    float r  = length(uv) * 2.0;
    // Dégradé circulaire : plein au centre, transparent sur les bords
    // Le discard évite de rasteriser les pixels transparents (optimisation)
    float a1 = mix(1.0, 0.9, smoothstep(0.0, 0.8, r));
    float a2 = mix(0.9, 0.0, smoothstep(0.8, 1.0, r));
    float circleAlpha = r < 0.8 ? a1 : a2;
    if (circleAlpha < 0.01) discard;
    // Couleur blanche pure : l'effet coloré vient du bloom et de l'AdditiveBlending
    gl_FragColor = vec4(1.0, 1.0, 1.0, circleAlpha * vAlpha);
  }
`;

export class ParticleMesh {
  constructor({ bounds = 50, count = MAX_COUNT } = {}) {
    // On crée un tableau d'indices [0, 1, 2, ..., 524287] passé une seule fois au GPU.
    // Le vertex shader convertit cet index en UV pour lire la position dans la texture GPU.
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
      // AdditiveBlending : les pixels se cumulent → zones denses plus lumineuses
      // C'est ce qui crée l'effet de lueur là où les particules se concentrent
      blending:       THREE.AdditiveBlending,
      depthWrite:     false,   // pas d'écriture dans le depth buffer (transparent)
      depthTest:      false,   // pas de test de profondeur : toutes les particules sont visibles
      transparent:    true,
    });

    this.mesh = new THREE.Points(geometry, this._material);
    this.mesh.frustumCulled = false;   // on gère soi-même la visibilité (wrap toroïdal)
    this.mesh.geometry.setDrawRange(0, count);
  }

  setPositionTexture(tex) { this._material.uniforms.texturePosition.value = tex; }
  setSize(n)              { this._material.uniforms.u_size.value  = n; }
  setCount(n)             { this._material.uniforms.u_count.value = n; this.mesh.geometry.setDrawRange(0, n); }
}
