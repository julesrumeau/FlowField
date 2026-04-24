# Preset Persistence — Design Spec

**Date :** 2026-04-24
**Branche :** fix/flow-field

---

## Objectif

Permettre à l'utilisateur de sauvegarder l'état courant des 7 paramètres de simulation, de les retrouver dans une liste persistée en base de données, de les recharger d'un clic, et de les supprimer.

---

## Nouveaux fichiers

| Fichier | Rôle |
|---|---|
| `frontend/src/api/client.js` | Appels REST vers le backend FastAPI |
| `frontend/src/ui/PresetPanel.js` | Panneau presets + popup save |

## Fichiers modifiés

| Fichier | Modification |
|---|---|
| `frontend/src/ui/Controls.js` | Ajout `getParams()`, `setParams()`, stockage `_inputs` |
| `frontend/src/main.js` | Instanciation `PresetPanel` |
| `frontend/src/index.html` | Styles CSS panneau + popup |

---

## `api/client.js`

Trois fonctions exportées. URLs relatives — Nginx proxifie `/api/` → `backend:8000`.

```js
export async function listPresets()             // GET  /api/presets/
export async function savePreset(nom, params)   // POST /api/presets/
export async function deletePreset(id)          // DELETE /api/presets/{id}
```

- `seed` n'est pas inclus dans `params` (pas de slider seed côté UI).
- Chaque fonction `throw` si la réponse HTTP est en erreur, pour que l'appelant puisse réagir.
- `savePreset` envoie `{ nom, seed: 0, params }` — le backend exige `seed` (NOT NULL), on fixe à 0 en attendant un éventuel slider seed.

---

## `PresetPanel.js`

### Layout

Panneau fixe en haut à droite (`position: fixed; top: 16px; right: 16px`).
Même style visuel que Controls : fond transparent, monospace, `rgba(255,255,255,0.5)`.

```
┌─────────────────────────┐
│  PRESETS                │
│  [Save current]         │
├─────────────────────────┤
│  Tourbillon lent    [✕] │
│  Chaos rapide       [✕] │
│  Brume douce        [✕] │
│  ...                    │  ← scrollable, max-height: 60vh
└─────────────────────────┘
```

### Popup save

Overlay plein écran semi-transparent centré. Contenu :
- Input texte (`placeholder="Nom du preset"`, autofocus)
- Bouton "Sauvegarder" + bouton "Annuler"
- Enter = confirmer, Escape = annuler
- Nom vide → rien ne se passe (pas d'envoi)

### Interactions

| Action | Comportement |
|---|---|
| Init | `listPresets()` → render liste |
| Clic "Save current" | Ouvre popup |
| Confirm popup | `savePreset(nom, controls.getParams())` → refresh liste complète |
| Clic nom preset | `controls.setParams(preset.params)` — applique + met à jour sliders |
| Clic ✕ | `deletePreset(id)` → retire la ligne du DOM (pas de refetch) |

### Gestion d'erreurs

- Erreur réseau ou HTTP sur listPresets → affiche "Erreur chargement" dans la liste
- Erreur sur savePreset → ferme la popup, affiche un message d'erreur discret sous le bouton Save
- Erreur sur deletePreset → log console uniquement (optimistic delete déjà effectué)

---

## Modifications `Controls.js`

### `_inputs`

Dans `_row()`, stocker chaque `<input>` dans `this._inputs[key]` au lieu de le laisser en variable locale.

```js
constructor(...) {
  this._inputs = {};
  // ...
}

_row({ key, ... }) {
  // ...
  this._inputs[key] = input;
  // ...
}
```

### `getParams()`

Lit les valeurs courantes des 7 sliders depuis le DOM.

```js
getParams() {
  const result = {};
  for (const [key, input] of Object.entries(this._inputs)) {
    result[key] = parseFloat(input.value);
  }
  return result;
}
```

### `setParams(params)`

Pour chaque clé connue, met à jour le slider ET appelle `_apply()`.

```js
setParams(params) {
  for (const [key, value] of Object.entries(params)) {
    if (this._inputs[key]) {
      this._inputs[key].value = value;
      // mettre à jour l'affichage de la valeur
      this._inputs[key].dispatchEvent(new Event('input'));
    }
  }
}
```

> Utiliser `dispatchEvent('input')` évite de dupliquer la logique de `_apply()`.

---

## Modifications `main.js`

```js
import { PresetPanel } from './ui/PresetPanel.js';

// après instanciation de Controls :
const controls = new Controls({ particleSystem, particleMesh, flowField, renderer });
new PresetPanel({ controls });
```

---

## Styles CSS (`index.html`)

Ajoutés dans le `<style>` existant :

- `#preset-panel` — position fixed, top/right, même police/couleur que controls
- `.preset-list` — overflow-y: auto, max-height: 60vh
- `.preset-row` — flex, space-between, hover highlight discret
- `.preset-name` — cursor pointer
- `.preset-delete` — bouton minimaliste, couleur rouge au hover
- `#preset-popup-overlay` — fixed, inset 0, fond semi-transparent, centré flex
- `.popup-box` — fond sombre, padding, input + boutons

---

## Ce qui n'est pas dans ce scope

- Slider `seed` et sa persistence
- Export GIF
- Authentification / isolation par utilisateur
- Pagination de la liste (scroll suffisant)
