# Design — Simulation Core + Renderer (étape 1/2)

**Date :** 2026-04-22
**Scope :** FlowField.js, ParticleSystem.js, noise.js, Renderer.js, ParticleMesh.js, main.js, index.html

---

## Contexte

Première étape du frontend FlowField : simulation de particules 3D suivant un champ vectoriel OpenSimplex, rendu Three.js avec caméra orbitale. Pas de trails, pas de post-processing, pas d'UI controls, pas de presets — uniquement la simulation qui tourne.

---

## Décisions structurantes

| Décision | Choix | Raison |
|---|---|---|
| Chargement Three.js | CDN + importmap | Pas d'étape de build, Docker simple |
| Noise | Implémentation OpenSimplex directe dans noise.js | Pas de dépendance CDN fragile, conforme CLAUDE.md |
| Simulation | CPU (Float32Array) + GPU rendu | Suffisant pour 80k particules, lisible, standard Three.js |
| Dimensions | 3D pur | Caméra orbitale, observation sous tous les angles |
| Respawn | Aléatoire dans le cube | Densité uniforme depuis n'importe quel angle de vue |
| Volume | Cube centré [-50, 50]³ | Simple, symétrique |

---

## Architecture

```
noise.js          →  OpenSimplex 3D auto-contenu, expose createNoise(seed)
FlowField.js      →  getVector(x, y, z, time) → direction
ParticleSystem.js →  Float32Array positions + velocities, update loop CPU
ParticleMesh.js   →  BufferGeometry Points, sync positions → GPU
Renderer.js       →  scene, caméra, OrbitControls, boucle rAF
main.js           →  instanciation et câblage
index.html        →  importmap + canvas
```

**Flux chaque frame :**
```
Renderer.tick(dt, time)
  → ParticleSystem.update(dt, time)
      → FlowField.getVector(x, y, z, time)   // 3 appels noise par particule
  → ParticleMesh.sync()                       // needsUpdate = true
  → renderer.render(scene, camera)
```

---

## noise.js

Portage JavaScript de l'algorithme OpenSimplex (KdotJPG). Auto-contenu, pas de dépendance externe.

```js
export function createNoise(seed) {
  // table de permutation initialisée avec seed
  return {
    noise3D(x, y, z) → Number  // retourne [-1, 1]
  }
}
```

---

## FlowField.js

Génère un vecteur direction pour toute position dans l'espace. Le champ évolue dans le temps via la dimension `time`.

```js
class FlowField {
  constructor({ noiseScale, seed })
  getVector(x, y, z, time) → { x, y, z }  // composantes dans [-1, 1]
}
```

**Technique :** 3 appels noise avec offsets larges (0, 100, 200) pour décorréler les axes x/y/z. Le seed décale les coordonnées de bruit pour obtenir un champ différent.

```
vx = noise3D(x * noiseScale,       y * noiseScale,       z * noiseScale + time)
vy = noise3D(x * noiseScale + 100, y * noiseScale + 100, z * noiseScale + time)
vz = noise3D(x * noiseScale + 200, y * noiseScale + 200, z * noiseScale + time)
```

---

## ParticleSystem.js

Maintient deux Float32Array et les met à jour chaque frame sur le CPU.

```js
class ParticleSystem {
  constructor({ particleCount, flowField, speed, turbulence, bounds })

  positions: Float32Array   // exposé — partagé avec BufferGeometry
  update(dt, time)          // appelé par Renderer chaque frame
  setParams({ speed, turbulence })
}
```

**Initialisation :** positions aléatoires dans `[-bounds, bounds]³`, velocities à zéro.

**Update par particule :**
1. `target = flowField.getVector(pos, time) * speed`
2. `vel = lerp(vel, target, turbulence)`
3. `pos += vel * dt`
4. Si `|pos.x| > bounds || |pos.y| > bounds || |pos.z| > bounds` → respawn aléatoire, velocity = 0

**Paramètre turbulence :**
- `1.0` → suit le champ instantanément (chaotique)
- `0.0` → inertie maximale (fluide)

---

## ParticleMesh.js

```js
class ParticleMesh {
  constructor(positions: Float32Array)
  // crée BufferGeometry + PointsMaterial + Points, ajouté à la scène
  sync()  // geometry.attributes.position.needsUpdate = true
}
```

**Material :** `PointsMaterial` — taille 1.5px, `sizeAttenuation: true`, `blending: AdditiveBlending`, couleur blanche. Le blending additif crée un effet lumineux naturel sur fond noir.

---

## Renderer.js

```js
class Renderer {
  constructor({ canvas, particleSystem, particleMesh })
  init()   // WebGLRenderer, scene, PerspectiveCamera (FOV 60, z=150), OrbitControls
  start()  // lance requestAnimationFrame
  tick(dt, time)
}
```

---

## main.js

```js
const flowField      = new FlowField({ noiseScale, seed })
const particleSystem = new ParticleSystem({ particleCount, flowField, speed, turbulence, bounds: 50 })
const particleMesh   = new ParticleMesh(particleSystem.positions)
const renderer       = new Renderer({ canvas, particleSystem, particleMesh })
renderer.init()
renderer.start()
```

---

## index.html

- `<script type="importmap">` : Three.js r165 + addons (OrbitControls) depuis jsDelivr
- `<canvas id="canvas">` plein écran (CSS: width/height 100vw/100vh)
- `<script type="module" src="./main.js">`
- Fond `#0a0a0f` (repris du placeholder existant)

---

## Hors scope (étapes suivantes)

- Trails / alpha decay (PostProcessing)
- Bloom (PostProcessing)
- UI controls / sliders
- Presets (API)
- Export GIF
