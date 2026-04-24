# Radial Alpha Fade — Design Spec

**Date:** 2026-04-24  
**Status:** Approved

---

## Problem

Les particules sont confinées dans un cube de demi-taille `bounds = 50`. Quand la caméra dézoome, les bords du cube deviennent visibles : les trails s'arrêtent net, créant une arête artificielle qui rompt l'illusion.

Le projet prévoit un export GIF/vidéo pour wallpaper animé — le rendu doit être propre à tout angle/distance.

---

## Solution retenue : Radial alpha fade via vertex colors

Chaque particule est colorée selon sa distance au centre du monde. Les particules proches du centre restent blanches (pleine luminosité). Les particules qui s'approchent de la limite `bounds` s'assombrissent progressivement vers le noir. Avec `AdditiveBlending`, noir = transparent : le fondu est gratuit, sans shader custom.

Le résultat visuel est une sphère lumineuse aux bords organiques — une nébuleuse — avec fond noir pur à l'extérieur. Parfait pour export wallpaper.

---

## Architecture

Aucun changement à la simulation (ParticleSystem, FlowField). Aucun changement au pipeline de rendu (PostProcessing, Controls, PresetPanel).

### ParticleMesh.js

- Ajouter un `Float32Array colors` de taille `MAX_COUNT * 3` (RGB par particule)
- Activer `vertexColors: true` sur `PointsMaterial`, supprimer `color: 0xffffff` (remplacé par les vertex colors)
- Modifier la signature de `sync()` : `sync(positions, count, bounds)`
  - Pour chaque particule `i` dans `[0, count)` :
    - Calculer `dist = sqrt(x² + y² + z²)`
    - Calculer `t = smoothstep(0.75 * bounds, bounds, dist)` → `t = 0` au centre, `t = 1` à la limite
    - Facteur luminosité `f = 1 - t`
    - Écrire `colors[i*3] = colors[i*3+1] = colors[i*3+2] = f`
  - `colors.needsUpdate = true`
  - `positions.needsUpdate = true`

`smoothstep(edge0, edge1, x) = clamp((x - edge0) / (edge1 - edge0), 0, 1)` puis `t = t * t * (3 - 2 * t)`.

La zone de fondu commence à 75 % du rayon (r = 37.5) et atteint le noir à r = 50. Les particules au-delà de `bounds` (juste avant le wrap) sont invisibles — l'arête du cube disparaît.

### ParticleSystem.js

- Ajouter un getter public `get count() { return this._count; }` pour exposer le nombre de particules actives.

### Renderer.js

- Dans `tick()`, passer `particleSystem.positions` et `bounds` à `particleMesh.sync()` :
  ```js
  this._particleMesh.sync(this._particleSystem.positions, this._particleSystem.count, this._bounds);
  ```
- Stocker `bounds` dans `this._bounds` (passé via le constructeur)

### main.js

- Passer `bounds` au `Renderer` lors de l'instanciation

---

## Ce qui ne change pas

- `ParticleSystem.js` — wrap cubique inchangé, simulation identique
- `PostProcessing.js` — accumulation buffer inchangé
- `Controls.js` — sliders inchangés
- `PresetPanel.js` — inchangé
- `FlowField.js` — inchangé

---

## Compatibilité export vidéo/GIF

Le fondu est purement visuel (vertex colors). L'export capturera exactement ce qui est rendu à l'écran : fond noir pur, sphère lumineuse avec bords organiques. Résultat propre à cadrer en loop pour wallpaper animé.
