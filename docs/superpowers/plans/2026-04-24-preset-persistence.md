# Preset Persistence Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ajouter un panneau "Presets" en haut à droite permettant de sauvegarder, charger et supprimer des états de simulation persistés en PostgreSQL.

**Architecture:** `api/client.js` centralise les appels REST. `PresetPanel.js` gère l'UI (panneau + popup). `Controls.js` est étendu avec `getParams()` / `setParams()` pour lire/écrire les sliders. `main.js` câble le tout.

**Tech Stack:** Vanilla JS ES modules, Three.js 0.165.0 (CDN), FastAPI backend existant sur `/api/presets/` via proxy Nginx.

> **Note tests :** Ce projet n'a pas de framework de test (pas de Node.js, pas de bundler). Chaque tâche se termine par une vérification manuelle dans le navigateur. Prérequis : `docker compose up` lancé depuis la racine du projet.

---

### Task 1 : CSS — styles panneau et popup dans `index.html`

**Files:**
- Modify: `frontend/src/index.html`

- [ ] **Step 1 : Ajouter les styles dans le bloc `<style>` existant**

Ouvrir `frontend/src/index.html`. Repérer la fermeture `</style>` (ligne ~57). Insérer juste avant :

```css
    #preset-panel {
      position: fixed;
      top: 16px;
      right: 16px;
      display: flex;
      flex-direction: column;
      gap: 8px;
      z-index: 10;
      width: 200px;
    }
    .preset-header {
      color: rgba(255,255,255,0.5);
      font-family: monospace;
      font-size: 12px;
      font-weight: bold;
    }
    .preset-save-btn {
      background: none;
      border: 1px solid rgba(255,255,255,0.2);
      color: rgba(255,255,255,0.6);
      font-family: monospace;
      font-size: 11px;
      padding: 4px 8px;
      cursor: pointer;
      text-align: left;
    }
    .preset-save-btn:hover {
      border-color: rgba(255,255,255,0.5);
      color: rgba(255,255,255,0.9);
    }
    .preset-list {
      display: flex;
      flex-direction: column;
      gap: 2px;
      max-height: 60vh;
      overflow-y: auto;
    }
    .preset-row {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 2px 0;
    }
    .preset-name {
      color: rgba(255,255,255,0.6);
      font-family: monospace;
      font-size: 11px;
      cursor: pointer;
      flex: 1;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .preset-name:hover { color: rgba(255,255,255,0.9); }
    .preset-delete {
      background: none;
      border: none;
      color: rgba(255,255,255,0.3);
      font-size: 10px;
      cursor: pointer;
      padding: 0 4px;
      flex-shrink: 0;
    }
    .preset-delete:hover { color: rgba(255,80,80,0.8); }
    .preset-error {
      color: rgba(255,80,80,0.8);
      font-family: monospace;
      font-size: 10px;
      min-height: 14px;
    }
    #preset-popup-overlay {
      position: fixed;
      inset: 0;
      background: rgba(0,0,0,0.6);
      display: flex;
      align-items: center;
      justify-content: center;
      z-index: 100;
    }
    .popup-box {
      background: #1a1a2a;
      border: 1px solid rgba(255,255,255,0.15);
      padding: 16px;
      display: flex;
      flex-direction: column;
      gap: 12px;
      min-width: 240px;
    }
    .popup-input {
      background: none;
      border: 1px solid rgba(255,255,255,0.2);
      color: rgba(255,255,255,0.9);
      font-family: monospace;
      font-size: 12px;
      padding: 6px 8px;
      outline: none;
    }
    .popup-input:focus { border-color: rgba(255,255,255,0.5); }
    .popup-actions {
      display: flex;
      gap: 8px;
      justify-content: flex-end;
    }
    .popup-confirm, .popup-cancel {
      background: none;
      border: 1px solid rgba(255,255,255,0.2);
      color: rgba(255,255,255,0.6);
      font-family: monospace;
      font-size: 11px;
      padding: 4px 10px;
      cursor: pointer;
    }
    .popup-confirm:hover {
      border-color: rgba(255,255,255,0.5);
      color: rgba(255,255,255,0.9);
    }
    .popup-cancel:hover {
      border-color: rgba(255,80,80,0.4);
      color: rgba(255,80,80,0.8);
    }
```

- [ ] **Step 2 : Commit**

```bash
git add frontend/src/index.html
git commit -m "style: add preset panel and popup CSS"
```

---

### Task 2 : Créer `api/client.js`

**Files:**
- Create: `frontend/src/api/client.js`

- [ ] **Step 1 : Créer le fichier**

Créer `frontend/src/api/client.js` avec ce contenu exact :

```js
const BASE = '/api';

export async function listPresets() {
  const res = await fetch(`${BASE}/presets/`);
  if (!res.ok) throw new Error(`listPresets: ${res.status}`);
  return res.json();
}

export async function savePreset(nom, params) {
  const res = await fetch(`${BASE}/presets/`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ nom, seed: 0, params }),
  });
  if (!res.ok) throw new Error(`savePreset: ${res.status}`);
  return res.json();
}

export async function deletePreset(id) {
  const res = await fetch(`${BASE}/presets/${id}`, { method: 'DELETE' });
  if (!res.ok) throw new Error(`deletePreset: ${res.status}`);
}
```

- [ ] **Step 2 : Vérification manuelle**

Avec `docker compose up` actif, ouvrir `http://localhost` dans le navigateur.
Ouvrir la console DevTools (F12) et coller :

```js
import('/api/../src/api/client.js').catch(() => {
  // test direct via fetch si import échoue depuis la console
  fetch('/api/presets/').then(r => r.json()).then(console.log);
});
```

Résultat attendu : tableau JSON (vide `[]` si aucun preset, ou liste existante).

- [ ] **Step 3 : Commit**

```bash
git add frontend/src/api/client.js
git commit -m "feat: add api/client.js with listPresets, savePreset, deletePreset"
```

---

### Task 3 : Modifier `Controls.js` — `_inputs`, `getParams()`, `setParams()`

**Files:**
- Modify: `frontend/src/ui/Controls.js`

- [ ] **Step 1 : Ajouter `this._inputs = {}` dans le constructeur**

Dans `Controls.js`, remplacer le constructeur actuel :

```js
  constructor({ particleSystem, particleMesh, flowField, renderer }) {
    this._ps       = particleSystem;
    this._pm       = particleMesh;
    this._ff       = flowField;
    this._renderer = renderer;
    document.body.appendChild(this._build());
  }
```

par :

```js
  constructor({ particleSystem, particleMesh, flowField, renderer }) {
    this._ps       = particleSystem;
    this._pm       = particleMesh;
    this._ff       = flowField;
    this._renderer = renderer;
    this._inputs   = {};
    document.body.appendChild(this._build());
  }
```

- [ ] **Step 2 : Stocker chaque input dans `_row()`**

Dans `_row()`, repérer la ligne `input.addEventListener('input', ...`. Juste avant, ajouter :

```js
    this._inputs[key] = input;
```

La méthode `_row()` complète doit ressembler à :

```js
  _row({ key, label, min, max, step, value }) {
    const row = document.createElement('div');
    row.className = 'ctrl-row';

    const lbl = document.createElement('span');
    lbl.className = 'ctrl-label';
    lbl.textContent = label;

    const val = document.createElement('span');
    val.className = 'ctrl-value';
    val.textContent = value.toFixed(2);

    const input = document.createElement('input');
    input.type  = 'range';
    input.min   = min;
    input.max   = max;
    input.step  = step;
    input.value = value;

    this._inputs[key] = input;

    input.addEventListener('input', () => {
      const v = parseFloat(input.value);
      val.textContent = v.toFixed(2);
      this._apply(key, v);
    });

    row.appendChild(lbl);
    row.appendChild(input);
    row.appendChild(val);
    return row;
  }
```

- [ ] **Step 3 : Ajouter `getParams()` et `setParams()`**

Après la méthode `_apply()`, ajouter les deux méthodes suivantes :

```js
  getParams() {
    const result = {};
    for (const [key, input] of Object.entries(this._inputs)) {
      result[key] = parseFloat(input.value);
    }
    return result;
  }

  setParams(params) {
    for (const [key, value] of Object.entries(params)) {
      if (this._inputs[key]) {
        this._inputs[key].value = value;
        this._inputs[key].dispatchEvent(new Event('input'));
      }
    }
  }
```

- [ ] **Step 4 : Vérification manuelle**

Avec `docker compose up` actif, ouvrir `http://localhost`.
Dans la console DevTools, les modules ES ne sont pas directement accessibles depuis la console.
Vérification visuelle : bouger les sliders → les valeurs affichées changent encore normalement.
Aucune erreur dans la console.

- [ ] **Step 5 : Commit**

```bash
git add frontend/src/ui/Controls.js
git commit -m "feat: add getParams and setParams to Controls"
```

---

### Task 4 : Créer `PresetPanel.js`

**Files:**
- Create: `frontend/src/ui/PresetPanel.js`

- [ ] **Step 1 : Créer le fichier**

Créer `frontend/src/ui/PresetPanel.js` avec ce contenu :

```js
import { listPresets, savePreset, deletePreset } from '../api/client.js';

export class PresetPanel {
  constructor({ controls }) {
    this._controls = controls;
    this._panel    = this._build();
    document.body.appendChild(this._panel);
    this._loadList();
  }

  _build() {
    const panel = document.createElement('div');
    panel.id = 'preset-panel';

    const header = document.createElement('div');
    header.className = 'preset-header';
    header.textContent = 'PRESETS';

    const saveBtn = document.createElement('button');
    saveBtn.className = 'preset-save-btn';
    saveBtn.textContent = 'Save current';
    saveBtn.addEventListener('click', () => this._openPopup());

    this._errorMsg = document.createElement('div');
    this._errorMsg.className = 'preset-error';

    this._list = document.createElement('div');
    this._list.className = 'preset-list';

    panel.appendChild(header);
    panel.appendChild(saveBtn);
    panel.appendChild(this._errorMsg);
    panel.appendChild(this._list);
    return panel;
  }

  async _loadList() {
    try {
      const presets = await listPresets();
      this._renderList(presets);
    } catch {
      this._list.textContent = 'Erreur chargement';
    }
  }

  _renderList(presets) {
    this._list.innerHTML = '';
    for (const preset of presets) {
      this._list.appendChild(this._row(preset));
    }
  }

  _row(preset) {
    const row = document.createElement('div');
    row.className = 'preset-row';

    const name = document.createElement('span');
    name.className = 'preset-name';
    name.textContent = preset.nom;
    name.title = preset.nom;
    name.addEventListener('click', () => this._controls.setParams(preset.params));

    const del = document.createElement('button');
    del.className = 'preset-delete';
    del.textContent = '✕';
    del.addEventListener('click', () => this._delete(preset.id, row));

    row.appendChild(name);
    row.appendChild(del);
    return row;
  }

  async _delete(id, row) {
    row.remove();
    try {
      await deletePreset(id);
    } catch (e) {
      console.error('deletePreset failed:', e);
    }
  }

  _openPopup() {
    const overlay = document.createElement('div');
    overlay.id = 'preset-popup-overlay';

    const box = document.createElement('div');
    box.className = 'popup-box';

    const input = document.createElement('input');
    input.type        = 'text';
    input.placeholder = 'Nom du preset';
    input.className   = 'popup-input';

    const actions = document.createElement('div');
    actions.className = 'popup-actions';

    const confirmBtn = document.createElement('button');
    confirmBtn.textContent = 'Sauvegarder';
    confirmBtn.className   = 'popup-confirm';

    const cancelBtn = document.createElement('button');
    cancelBtn.textContent = 'Annuler';
    cancelBtn.className   = 'popup-cancel';

    actions.appendChild(confirmBtn);
    actions.appendChild(cancelBtn);
    box.appendChild(input);
    box.appendChild(actions);
    overlay.appendChild(box);
    document.body.appendChild(overlay);

    setTimeout(() => input.focus(), 0);

    const close = () => overlay.remove();

    cancelBtn.addEventListener('click', close);
    overlay.addEventListener('click', e => { if (e.target === overlay) close(); });

    const submit = async () => {
      const nom = input.value.trim();
      if (!nom) return;
      close();
      try {
        await savePreset(nom, this._controls.getParams());
        await this._loadList();
      } catch {
        this._errorMsg.textContent = 'Erreur lors de la sauvegarde';
        setTimeout(() => { this._errorMsg.textContent = ''; }, 3000);
      }
    };

    confirmBtn.addEventListener('click', submit);
    input.addEventListener('keydown', e => {
      if (e.key === 'Enter')  submit();
      if (e.key === 'Escape') close();
    });
  }
}
```

- [ ] **Step 2 : Commit**

```bash
git add frontend/src/ui/PresetPanel.js
git commit -m "feat: add PresetPanel with save popup, list, load and delete"
```

---

### Task 5 : Câbler `main.js`

**Files:**
- Modify: `frontend/src/main.js`

- [ ] **Step 1 : Modifier `main.js`**

Remplacer le contenu entier de `frontend/src/main.js` par :

```js
import { FlowField }      from './simulation/FlowField.js';
import { ParticleSystem } from './simulation/ParticleSystem.js';
import { ParticleMesh }   from './renderer/ParticleMesh.js';
import { Renderer }       from './renderer/Renderer.js';
import { Controls }       from './ui/Controls.js';
import { PresetPanel }    from './ui/PresetPanel.js';

const canvas = document.getElementById('canvas');

const noiseScale     = 1.2;
const seed           = 42;
const speed          = 0.8;
const turbulence     = 0.3;
const particleCount  = 80000;
const bounds         = 50;
const trailLength    = 0.95;
const bloomStrength  = 1.0;

const flowField      = new FlowField({ noiseScale, seed });
const particleSystem = new ParticleSystem({ particleCount, flowField, speed, turbulence, bounds });
const particleMesh   = new ParticleMesh(particleSystem.positions);
const renderer       = new Renderer({ canvas, particleSystem, particleMesh, trailLength, bloomStrength });

renderer.init();
renderer.start();

const controls = new Controls({ particleSystem, particleMesh, flowField, renderer });
new PresetPanel({ controls });
```

- [ ] **Step 2 : Commit**

```bash
git add frontend/src/main.js
git commit -m "feat: wire PresetPanel into main"
```

---

### Task 6 : Vérification end-to-end dans le navigateur

**Prérequis :** `docker compose up` depuis la racine du projet.

- [ ] **Step 1 : Rebuild et ouvrir**

```bash
docker compose up --build
```

Ouvrir `http://localhost`. Vérifier :
- La simulation tourne normalement
- Le panneau "PRESETS" est visible en haut à droite
- Aucune erreur dans la console DevTools

- [ ] **Step 2 : Tester "Save current"**

1. Bouger quelques sliders (Speed, Bloom, etc.)
2. Cliquer "Save current" → la popup s'ouvre
3. Taper un nom (ex : "Test 1") → Enter
4. La popup se ferme, le preset "Test 1" apparaît dans la liste
5. Vérifier dans `http://localhost:8000/docs` → GET /presets/ → le preset est bien en DB

- [ ] **Step 3 : Tester "charger" un preset**

1. Sauvegarder un deuxième preset avec des valeurs différentes ("Test 2")
2. Modifier les sliders manuellement
3. Cliquer sur "Test 1" dans la liste → les sliders reviennent aux valeurs du preset
4. Vérifier visuellement que la simulation change

- [ ] **Step 4 : Tester la suppression**

1. Cliquer ✕ sur "Test 1" → la ligne disparaît immédiatement
2. Recharger la page → "Test 1" n'est plus dans la liste

- [ ] **Step 5 : Tester la popup — cas limites**

1. Cliquer "Save current" → laisser le champ vide → cliquer "Sauvegarder" → rien ne se passe (pas d'envoi)
2. Cliquer "Save current" → Escape → la popup se ferme
3. Cliquer "Save current" → cliquer en dehors de la popup → la popup se ferme

- [ ] **Step 6 : Commit final si tout est OK**

```bash
git add -A
git commit -m "feat: preset persistence complete — save, load, delete"
```
