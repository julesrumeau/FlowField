# Radial Alpha Fade Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Faire disparaître les bords visibles du cube de simulation en fondant les particules vers le noir à mesure qu'elles s'approchent de la limite, créant une sphère lumineuse aux bords organiques.

**Architecture:** On ajoute un `BufferAttribute` de couleurs (RGB) à la géométrie des particules. À chaque frame, `sync()` recalcule la luminosité de chaque particule active selon sa distance au centre via un smoothstep. Avec `AdditiveBlending`, RGB noir = transparent : pas de shader custom nécessaire.

**Tech Stack:** Three.js 0.165.0 (PointsMaterial vertexColors, BufferAttribute), JavaScript ES modules

---

### Task 1 : Exposer le compte de particules actives dans ParticleSystem

**Files:**
- Modify: `frontend/src/simulation/ParticleSystem.js`

- [ ] **Ajouter le getter `count` après `setCount()`**

Dans `frontend/src/simulation/ParticleSystem.js`, après la méthode `setCount()` (ligne 46), ajouter :

```js
  get count() { return this._count; }
```

Le fichier doit ressembler à ceci autour du getter :

```js
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

  get count() { return this._count; }
```

- [ ] **Commit**

```bash
git add frontend/src/simulation/ParticleSystem.js
git commit -m "feat: expose count getter on ParticleSystem"
```

---

### Task 2 : Ajouter le buffer de couleurs et le radial fade dans ParticleMesh

**Files:**
- Modify: `frontend/src/renderer/ParticleMesh.js`

- [ ] **Réécrire ParticleMesh.js en entier**

Remplacer le contenu de `frontend/src/renderer/ParticleMesh.js` par :

```js
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
```

- [ ] **Commit**

```bash
git add frontend/src/renderer/ParticleMesh.js
git commit -m "feat: add radial alpha fade via vertex colors in ParticleMesh"
```

---

### Task 3 : Mettre à jour Renderer pour passer bounds à sync()

**Files:**
- Modify: `frontend/src/renderer/Renderer.js`

- [ ] **Stocker `bounds` dans le constructeur**

Dans le constructeur de `Renderer`, ajouter `bounds` au destructuring et le stocker :

```js
constructor({ canvas, particleSystem, particleMesh, trailLength = 0.95, bloomStrength = 1.0, bounds }) {
  this._canvas         = canvas;
  this._particleSystem = particleSystem;
  this._particleMesh   = particleMesh;
  this._trailLength    = trailLength;
  this._bloomStrength  = bloomStrength;
  this._bounds         = bounds;
  this._time   = 0;
  this._lastTs = null;
}
```

- [ ] **Mettre à jour `tick()` pour appeler le nouveau sync()**

Remplacer la ligne `this._particleMesh.sync()` dans `tick()` par :

```js
tick(dt, time) {
  this._particleSystem.update(dt, time);
  this._particleMesh.sync(this._particleSystem.positions, this._particleSystem.count, this._bounds);
  this._controls.update();
  this._post.render();
}
```

- [ ] **Commit**

```bash
git add frontend/src/renderer/Renderer.js
git commit -m "feat: pass bounds to ParticleMesh.sync in Renderer"
```

---

### Task 4 : Passer bounds au Renderer dans main.js + vérification visuelle

**Files:**
- Modify: `frontend/src/main.js`

- [ ] **Ajouter `bounds` à l'instanciation du Renderer**

Dans `frontend/src/main.js`, remplacer :

```js
const renderer = new Renderer({ canvas, particleSystem, particleMesh, trailLength, bloomStrength });
```

par :

```js
const renderer = new Renderer({ canvas, particleSystem, particleMesh, trailLength, bloomStrength, bounds });
```

- [ ] **Vérifier visuellement dans le navigateur**

Lancer l'application (`docker compose up` ou servir `frontend/src/` localement). Vérifier :

1. La simulation démarre normalement, les particules sont visibles
2. En dézoomant progressivement, les bords du cube ne forment plus d'arête nette — la simulation s'estompe en sphère lumineuse
3. En orbiting à 360°, le fondu reste cohérent (pas d'artefact de face)
4. Le slider `particleCount` fonctionne toujours (augmenter/diminuer le nombre de particules)
5. Tous les autres sliders (speed, turbulence, noiseScale, size, trailLength, bloomStrength) fonctionnent inchangés

- [ ] **Commit final**

```bash
git add frontend/src/main.js
git commit -m "feat: wire bounds into Renderer for radial alpha fade"
```
