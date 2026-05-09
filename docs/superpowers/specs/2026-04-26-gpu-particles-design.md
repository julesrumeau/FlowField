# GPU Particles Design — GPUComputationRenderer

**Date:** 2026-04-26
**Objectif:** Déplacer le calcul de simulation (noise + intégration) du thread CPU principal vers le GPU via `GPUComputationRenderer` (Three.js addon). Cible : 150k particules à 60fps stable.

**Contrainte absolue :** comportement visuel et physique identique à l'implémentation CPU actuelle. Même bruit, mêmes formules, mêmes paramètres — uniquement le site d'exécution change.

---

## Problème actuel

`ParticleSystem.update()` appelle `FlowField.getVector()` une fois par particule par frame, chacun faisant 3 appels `noise3D`. À 100k particules : **300 000 évaluations Perlin/frame** sur le thread principal JavaScript → 25fps.

---

## Architecture cible

### Infrastructure GPU

`GPUComputationRenderer` (`three/addons/misc/GPUComputationRenderer.js`) gère deux textures `RGBA32F` en ping-pong :

| Texture | Contenu | Format |
|---|---|---|
| `texturePosition` | `xyz` = position monde, `w` inutilisé | RGBA32F, 512×512 |
| `textureVelocity` | `xyz` = vélocité, `w` inutilisé | RGBA32F, 512×512 |

Taille : `TEXTURE_WIDTH = TEXTURE_HEIGHT = 512`, soit 262 144 slots — couvre MAX_COUNT = 150 000 avec marge. Ces constantes sont exportées depuis `ParticleSystem.js` et importées par `ParticleMesh.js` pour que les deux soient toujours en accord.

### Pipeline par frame

```
textureVelocity[N] ──┐
texturePosition[N] ──┤──► velocityShader ──► textureVelocity[N+1]
                     │
texturePosition[N] ──┤
textureVelocity[N+1]─┴──► positionShader ──► texturePosition[N+1]
                                                      │
                                                      ▼
                                              vertex shader (rendu)
                                              lit texturePosition[N+1]
```

Le velocity shader s'exécute en premier (dependency order de GPUComputationRenderer), puis le position shader utilise la vélocité fraîche. Zéro transfert CPU↔GPU sur le hot path — positions et vélocités ne quittent jamais le GPU.

---

## Parité comportementale

### Bruit — règles de parité exacte

Le bruit actuel est le **Perlin noise amélioré de Ken Perlin (2002)**, seeded via LCG + Fisher-Yates. La parité est garantie par :

1. La table `perm[512]` est générée côté JS (exactement comme aujourd'hui dans `noise.js`)
2. Elle est uploadée **une seule fois** en tant que `DataTexture` RGBA8 16×32 = 512 px
3. Le shader GLSL réimplémente `noise3D` avec les mêmes lookups `perm[perm[X+perm[Y]]+Z]`, `fade()`, `lerp()`, `grad()`
4. `u_seedOffset = (seed % 1000) * 0.001` est passé en uniform

Les 3 champs indépendants **doivent** utiliser les mêmes constantes que le JS actuel :

```glsl
float vx = noise3D(pos.x*s + o,          pos.y*s + o,          pos.z*s + t*0.031 + o        );
float vy = noise3D(pos.x*s + o + 100.0,  pos.y*s + o + 100.0,  pos.z*s + t*0.050 + o + 100.0);
float vz = noise3D(pos.x*s + o + 200.0,  pos.y*s + o + 200.0,  pos.z*s + t*0.041 + o + 200.0);
```

> `noise3D(x, y, z)` prend trois scalaires séparés — **pas un vecteur**. L'écriture `pos*s` serait une multiplication vec3, ce qui est faux ici.

Normalisation avec guard longueur zéro :
```glsl
float len = length(vec3(vx, vy, vz));
if (len < 0.0001) len = 1.0;
vec3 dir = vec3(vx, vy, vz) / len;
```

### Vélocité — parité exacte

```glsl
// velocityShader
vec3 target = dir * u_speed;
vel += (target - vel) * u_turbulence;
```

Même formule EMA que le JS : `this._velocities[i3] += (tx - this._velocities[i3]) * t`

### Position — parité exacte

```glsl
// positionShader
pos.xyz += vel.xyz * u_dt;
// wrap bounds axe par axe
if (pos.x >  u_bounds) pos.x = -u_bounds;
if (pos.x < -u_bounds) pos.x =  u_bounds;
if (pos.y >  u_bounds) pos.y = -u_bounds;
if (pos.y < -u_bounds) pos.y =  u_bounds;
if (pos.z >  u_bounds) pos.z = -u_bounds;
if (pos.z < -u_bounds) pos.z =  u_bounds;
```

`u_dt` est passé chaque frame depuis `Renderer.tick()` avec le même clamp `Math.min(rawDt, 0.05)`.

---

## Uniforms

### velocityShader

| Uniform | Type | Source |
|---|---|---|
| `texturePosition` | sampler2D | auto (GPUComputationRenderer) |
| `textureVelocity` | sampler2D | auto (GPUComputationRenderer) |
| `u_time` | float | `Renderer._time` |
| `u_speed` | float | slider speed |
| `u_turbulence` | float | slider turbulence |
| `u_noiseScale` | float | slider noiseScale |
| `u_seedOffset` | float | `(seed % 1000) * 0.001` (fixe) |
| `tPerm` | sampler2D | table perm uploadée une fois |

### positionShader

| Uniform | Type | Source |
|---|---|---|
| `texturePosition` | sampler2D | auto |
| `textureVelocity` | sampler2D | auto |
| `u_dt` | float | delta time clampé |
| `u_bounds` | float | bounds (fixe = 50) |

### Vertex shader (ParticleMesh)

| Uniform | Type | Source |
|---|---|---|
| `texturePosition` | sampler2D | `gpuCompute.getCurrentRenderTarget(posVar).texture` |
| `u_size` | float | slider size |
| `u_count` | float | particleCount actif |
| `u_bounds` | float | bounds (fixe = 50) — utilisé par la formule de fade radial |

---

## Gestion du count dynamique

Les 512×512 slots existent toujours sur le GPU. Le vertex shader reçoit `u_count` :

```glsl
if (aIndex >= u_count) {
  gl_Position = vec4(0.0, 0.0, 9999.0, 1.0); // derrière le far plane
  gl_PointSize = 0.0;
  return;
}
```

Les slots inactifs continuent d'évoluer dans les compute shaders (pas de branchement, SIMD-friendly) mais ne sont jamais rendus. L'activation de nouvelles particules (slider count ↑) est instantanée — les slots ont déjà des positions valides.

---

## Fichiers

| Action | Fichier | Responsabilité |
|---|---|---|
| Remplacer | `simulation/ParticleSystem.js` | GPUComputationRenderer, init textures perm, exposition des uniforms |
| Créer | `simulation/shaders/velocityShader.js` | GLSL string — noise3D + lerp vélocité |
| Créer | `simulation/shaders/positionShader.js` | GLSL string — intégration + wrap bounds |
| Remplacer | `renderer/ParticleMesh.js` | ShaderMaterial, attribut `aIndex`, vertex/fragment shader |
| Modifier | `renderer/Renderer.js` | `tick()` : `gpuCompute.compute()`, mise à jour uniforms dt/time |
| Modifier | `main.js` | Passer le `renderer` Three.js à `GPUParticleSystem` (requis par GPUComputationRenderer) |
| Supprimer | `simulation/FlowField.js` | Remplacé par velocityShader |
| Supprimer | `simulation/noise.js` | Remplacé par velocityShader (perm table générée et uploadée depuis ParticleSystem) |

`Controls.js`, `PostProcessing.js`, `index.html`, `nginx.conf`, `docker-compose.yml` — **non touchés**.

---

## Initialisation des textures

```js
// ParticleSystem — positions initiales (même logique que _init() actuel)
const posTex = gpuCompute.createTexture();
for (let i = 0; i < MAX_COUNT; i++) {
  posTex.image.data[i * 4]     = (Math.random() * 2 - 1) * bounds;
  posTex.image.data[i * 4 + 1] = (Math.random() * 2 - 1) * bounds;
  posTex.image.data[i * 4 + 2] = (Math.random() * 2 - 1) * bounds;
  posTex.image.data[i * 4 + 3] = 0;
}

// Vélocités : zéro
const velTex = gpuCompute.createTexture(); // Float32Array déjà initialisée à 0
```

La table perm est générée par la même fonction LCG + Fisher-Yates actuellement dans `noise.js` — cette logique est **inlinée dans `ParticleSystem.js`** (pas de fichier séparé). `noise.js` est ensuite supprimé. La table est packée dans une `DataTexture` RGBA8 :

```js
// perm[512] → texture 16×32, channel R = valeur uint8
const data = new Uint8Array(512 * 4);
for (let i = 0; i < 512; i++) data[i * 4] = perm[i];
const permTex = new THREE.DataTexture(data, 16, 32, THREE.RGBAFormat, THREE.UnsignedByteType);
```

---

## Changements dans Controls.js

`Controls.js` appelle actuellement des méthodes sur `ParticleSystem` et `ParticleMesh`. Après refactoring :

- `speed`, `turbulence`, `noiseScale` → `particleSystem.setParams()` met à jour les uniforms du velocityShader
- `particleCount` → `particleSystem.setCount()` met à jour `u_count` dans le vertex shader uniform (via `particleMesh.setCount()`)
- `size` → `particleMesh.setSize()` met à jour `u_size`
- `trailLength`, `bloomStrength` → inchangés (passent par `renderer`)

L'interface publique de `ParticleSystem` et `ParticleMesh` reste la même du point de vue de `Controls.js`.

---

## Fade radial alpha — migration CPU → vertex shader

Le CPU actuel calcule le fade dans `ParticleMesh.sync()` et l'écrit dans le buffer `color` (Float32Array) chaque frame. Dans la version GPU, **aucun CPU-side buffer `color` n'existe plus** — le fade est calculé entièrement dans le vertex shader via `vAlpha` (varying → fragment shader).

**Formule — identique à `sync()`** :

```glsl
float dist      = length(pos);
float noiseFade = (sin(pos.x * 0.11) + sin(pos.y * 0.13) + sin(pos.z * 0.17)) * 0.2;
float d         = dist + noiseFade * u_bounds * 0.15;
float fadeStart = u_bounds * 0.4;
float t         = smoothstep(fadeStart, u_bounds, d);
vAlpha          = 1.0 - t * t;
```

**Fragment shader** — remplace la `CanvasTexture` radiale et applique `vAlpha` :

```glsl
vec2  uv = gl_PointCoord - vec2(0.5);
float r  = length(uv) * 2.0;
float a1 = mix(1.0, 0.9, smoothstep(0.0, 0.8, r));
float a2 = mix(0.9, 0.0, smoothstep(0.8, 1.0, r));
float circleAlpha = r < 0.8 ? a1 : a2;
if (circleAlpha < 0.01) discard;
gl_FragColor = vec4(1.0, 1.0, 1.0, circleAlpha * vAlpha);
```

La `CanvasTexture` CPU (64×64 canvas) et le buffer `color` sont supprimés — tout passe par le shader.

---

## Culling des particules inactives — vertex shader vs setDrawRange

Le CPU actuel utilise `geometry.setDrawRange(0, count)` pour ne dessiner que les particules actives. Dans la version GPU, `setDrawRange` **est supprimé** : les 512×512 = 262 144 slots sont toujours soumis au vertex shader.

**Pourquoi :** les slots inactifs évoluent dans les compute shaders (SIMD-friendly, sans branchement). Les pousser derrière le far plane dans le vertex shader est gratuit. `setDrawRange` en revanche forcerait un rebind de la géométrie chaque fois que le count change.

**Culling dans le vertex shader** :

```glsl
if (aIndex >= u_count) {
  gl_Position  = vec4(0.0, 0.0, 9999.0, 1.0); // derrière le far plane
  gl_PointSize = 0.0;
  vAlpha       = 0.0;
  return;
}
```

`u_count` est mis à jour via `particleMesh.setCount(n)` depuis `Controls.js` quand le slider change (identique à l'ancien `setDrawCount`).

---

## Changements Renderer.js

La seule modification substantielle est dans `tick()`. Le `bounds` n'est plus passé au constructeur (le vertex shader le porte en uniform), et le `threeRenderer` getter est ajouté.

**Avant (`tick()` CPU) :**

```js
tick(dt, time) {
  this._particleSystem.update(dt, time);
  this._particleMesh.sync(this._particleSystem.positions, this._particleSystem.count, this._bounds);
  this._controls.update();
  this._post.render();
}
```

**Après (`tick()` GPU) :**

```js
tick(dt, time) {
  this._particleSystem.update(dt, time);
  this._particleMesh.setPositionTexture(this._particleSystem.getPositionTexture());
  this._controls.update();
  this._post.render();
}
```

`setPositionTexture()` met à jour l'uniform `texturePosition` du ShaderMaterial — aucun transfert CPU↔GPU, juste une référence à la texture déjà sur le GPU.

**Getter ajouté :**

```js
get threeRenderer() { return this._renderer; }
```

Requis pour passer le `WebGLRenderer` à `GPUComputationRenderer` dans `ParticleSystem.init()`.

**Resize :** aucun changement — le GPUComputationRenderer est fixé à 512×512 et ne dépend pas de la taille de la fenêtre. L'appel `this._post.resize(w, h)` est conservé tel quel.

---

## Changements main.js — ordre d'initialisation

**Contrainte absolue :** `particleSystem.init(threeRenderer)` doit être appelé **après** `renderer.init()` — le `THREE.WebGLRenderer` n'existe qu'après `renderer.init()`.

```js
renderer.init();
particleSystem.init(renderer.threeRenderer); // GPUComputationRenderer crée ici
renderer.start();
```

Appeler `particleSystem.init()` avant `renderer.init()` produit une erreur : `renderer.threeRenderer` est `undefined`.

**Différences avec le main.js CPU :**

| CPU | GPU |
|---|---|
| `new FlowField({ noiseScale, seed })` | supprimé |
| `new ParticleSystem({ ..., flowField })` | `new ParticleSystem({ ..., noiseScale, seed })` (pas de flowField) |
| `new ParticleMesh(particleSystem.positions)` | `new ParticleMesh({ bounds })` (pas de Float32Array positions) |
| `renderer.init(); renderer.start()` | `renderer.init(); particleSystem.init(renderer.threeRenderer); renderer.start()` |
| `new Controls({ ..., flowField })` | `new Controls({ ... })` (pas de flowField) |

`VideoExporter` et `PresetPanel` sont inchangés — `VideoExporter` utilise `renderer.canvas` qui existe toujours.

---

## Prérequis WebGL2

`GPUComputationRenderer` requiert **WebGL2** pour les textures flottantes `RGBA32F`. `THREE.WebGLRenderer` crée un contexte WebGL2 par défaut depuis Three.js r118+ — aucune configuration supplémentaire n'est nécessaire.

En cas d'échec d'initialisation, `gpuCompute.init()` retourne une string d'erreur (non-null) :

```js
const err = this._gpuCompute.init();
if (err !== null) console.error('GPUComputationRenderer init error:', err);
```

Navigateurs cibles : tous les navigateurs modernes (Chrome, Firefox, Safari 15+, Edge) supportent WebGL2 RGBA32F.

---

## Tests de non-régression

Avant de merger :

1. Lancer la simulation et comparer visuellement avec la version CPU (même seed, mêmes paramètres) — le champ doit être identique
2. Vérifier chaque slider : speed, turbulence, noiseScale, particleCount, size, trailLength, bloomStrength
3. Vérifier le wrap bounds (particules qui disparaissent d'un côté réapparaissent de l'autre)
4. Vérifier OrbitControls non dégradés
5. Vérifier PostProcessing (trails + bloom) non dégradés
6. Mesurer fps à 100k et 150k particules
