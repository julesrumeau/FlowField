import * as THREE from 'three';
import { GPUComputationRenderer } from 'three/addons/misc/GPUComputationRenderer.js';
import { velocityShader } from './shaders/velocityShader.js';
import { positionShader } from './shaders/positionShader.js';

// 1024 × 512 = 524 288 particules maximum simultanées
// On utilise une texture GPU pour stocker les données, donc la taille doit être une puissance de 2
export const TEXTURE_WIDTH  = 1024;
export const TEXTURE_HEIGHT = 512;
const MAX_COUNT = TEXTURE_WIDTH * TEXTURE_HEIGHT;

// Construit la table de permutation du bruit de Perlin et la encode dans une texture GPU.
// Le shader GLSL ne peut pas accéder à des tableaux JS : on doit donc passer
// les 512 valeurs via une texture (format 16 colonnes × 32 lignes = 512 pixels).
function buildPermTexture(seed) {
  // Table initiale [0, 1, 2, ..., 255]
  const src = new Uint8Array(256);
  for (let i = 0; i < 256; i++) src[i] = i;

  // Mélange déterministe par l'algorithme Fisher-Yates avec un LCG seedé.
  // On n'utilise pas Math.random() car il n'est pas seedable en JavaScript.
  // La formule LCG (s = s*1664525 + 1013904223) est la référence "Numerical Recipes" :
  // même seed → même mélange → même champ de particules à chaque lancement.
  let s = (seed ^ 0x45FA91C3) >>> 0;
  for (let i = 255; i > 0; i--) {
    s = (s * 1664525 + 1013904223) >>> 0;
    const j = s % (i + 1);
    const tmp = src[i]; src[i] = src[j]; src[j] = tmp;
  }

  // On double la table (512 valeurs) pour éviter les modulos dans le shader
  const data = new Uint8Array(512 * 4);
  for (let i = 0; i < 512; i++) data[i * 4] = src[i % 256];

  // NearestFilter indispensable : on veut lire des entiers exacts, pas une interpolation
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
    // GPUComputationRenderer crée deux paires de textures RGBA float (ping-pong buffer) :
    // pendant qu'on lit la texture A, on écrit dans B ; à la frame suivante on inverse.
    // Résultat : toute la simulation tourne sur le GPU, le CPU n'y touche plus après init().
    this._gpuCompute = new GPUComputationRenderer(TEXTURE_WIDTH, TEXTURE_HEIGHT, threeRenderer);

    // Positions initiales : réparties aléatoirement dans le cube [-bounds, +bounds]
    const posTex  = this._gpuCompute.createTexture();
    const posData = posTex.image.data;
    for (let i = 0; i < MAX_COUNT; i++) {
      posData[i * 4]     = (Math.random() * 2 - 1) * this._bounds;
      posData[i * 4 + 1] = (Math.random() * 2 - 1) * this._bounds;
      posData[i * 4 + 2] = (Math.random() * 2 - 1) * this._bounds;
      posData[i * 4 + 3] = 0;
    }

    // Vélocités initiales à zéro (Float32Array est initialisé à 0 par défaut)
    const velTex = this._gpuCompute.createTexture();

    // On déclare les deux "variables" GPU (chacune = une texture + un shader)
    this._velVar = this._gpuCompute.addVariable('textureVelocity', velocityShader, velTex);
    this._posVar = this._gpuCompute.addVariable('texturePosition', positionShader, posTex);

    // Déclaration des dépendances : le shader de vélocité a besoin de lire la position
    // (pour savoir où est la particule dans le champ) et sa propre vélocité (pour le lissage).
    // Le shader de position a besoin des deux pour l'intégration.
    this._gpuCompute.setVariableDependencies(this._velVar, [this._velVar, this._posVar]);
    this._gpuCompute.setVariableDependencies(this._posVar, [this._posVar, this._velVar]);

    const err = this._gpuCompute.init();
    if (err !== null) throw new Error(`GPUComputationRenderer init failed: ${err}`);

    // Uniforms du velocity shader : paramètres modifiables en temps réel via les sliders
    const vu = this._velVar.material.uniforms;
    vu.u_time       = { value: 0 };
    vu.u_speed      = { value: this._speed };
    vu.u_turbulence = { value: this._turbulence };
    vu.u_noiseScale = { value: this._noiseScale };
    vu.u_seedOffset = { value: this._seedOffset };
    vu.tPerm        = { value: this._permTex };   // table de permutation du bruit de Perlin

    const pu = this._posVar.material.uniforms;
    pu.u_dt     = { value: 0.016 };   // delta time par défaut (sera mis à jour à chaque frame)
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
