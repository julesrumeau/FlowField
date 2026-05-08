# CLAUDE.md — FlowField

Document de référence architectural pour le projet FlowField.
À destination de tout développeur (ou IA) intervenant sur le projet.

---

## Présentation du projet

**FlowField** est une application web de simulation et rendu génératif en temps réel.
Des particules suivent un champ vectoriel 3D calculé par du bruit de Perlin implémenté en GLSL, produisant un rendu organique et fluide inspiré de l'art génératif.

L'utilisateur peut :
- Visualiser la simulation en temps réel avec des paramètres ajustables via des sliders
- Naviguer dans la scène 3D (OrbitControls : rotate, zoom, pan)
- Sauvegarder et recharger des presets de paramètres (CRUD complet via l'API)
- Enregistrer la simulation en MP4 et le télécharger localement

---

## Stack technique

| Couche | Technologie | Justification |
|---|---|---|
| Simulation (physique) | GLSL via GPUComputationRenderer | Calcul vélocité + position sur GPU — impossible à 524k particules en JS CPU |
| Rendu | Three.js 0.165.0 (WebGL) | Points GPU, shaders custom, EffectComposer |
| Chargement Three.js | Import map + CDN jsDelivr | Zéro bundler, chargement natif ES modules |
| Post-processing | UnrealBloomPass + accumulation buffer custom | Trails O(1) via WebGLRenderTarget, bloom via EffectComposer |
| Export vidéo | MediaRecorder (client) + FastAPI + ffmpeg (service dédié) | Client enregistre, service convertit WebM → MP4 |
| Backend presets | Python + FastAPI | Swagger auto-généré, validation Pydantic, async natif avec asyncpg |
| Base de données | PostgreSQL | Stockage presets |
| Serveur frontend | Nginx | Assets statiques, proxy `/api/` et `/export-api/` |
| Orchestration | Docker Compose | 4 services, `docker compose up` sans intervention |

---

## Architecture

### Vue d'ensemble

```
┌─────────────────────────────────────────────────────┐
│  Service 1 — Nginx (port 80)                        │
│  Sert le frontend statique (HTML + JS + Three.js)   │
│  Proxy /api/        → backend:8000                  │
│  Proxy /export-api/ → export:8001                   │
└─────────────────────────────────────────────────────┘
              │                        │
              ▼                        ▼
┌─────────────────────┐   ┌────────────────────────────┐
│  Service 2 — FastAPI│   │  Service 3 — FastAPI+ffmpeg│
│  (port 8000)        │   │  (port 8001)               │
│  GET    /health     │   │  POST /export              │
│  POST   /presets/   │   │  Reçoit WebM, retourne MP4 │
│  GET    /presets/   │   └────────────────────────────┘
│  DELETE /presets/id │
└─────────────────────┘
              │
              ▼
┌─────────────────────────────────────────────────────┐
│  Service 4 — PostgreSQL (healthcheck pg_isready)    │
│  table presets (id, nom, seed, params jsonb, date)  │
└─────────────────────────────────────────────────────┘
```

### Structure des dossiers

```
flowfield/
├── docker-compose.yml         # Build local, credentials hardcodés (dev)
├── compose.yaml               # Images registry, DB_PASSWORD env var (prod/déploiement)
├── CLAUDE.md
│
├── frontend/                  # Service Nginx + Three.js
│   ├── Dockerfile
│   ├── nginx.conf             # Proxy /api/ et /export-api/, client_max_body_size 500M
│   └── src/
│       ├── index.html         # Importmap CDN Three.js, UI overlay + controls CSS
│       ├── main.js            # Point d'entrée, câblage des modules
│       ├── simulation/
│       │   ├── ParticleSystem.js  # GPUComputationRenderer, init textures, uniforms
│       │   └── shaders/
│       │       ├── velocityShader.js  # Bruit de Perlin 3D GLSL + lerp vélocité
│       │       └── positionShader.js  # Intégration Euler + wrap toroïdal
│       ├── renderer/
│       │   ├── Renderer.js        # WebGLRenderer, OrbitControls, boucle RAF
│       │   ├── ParticleMesh.js    # THREE.Points, vertex shader lit la texture GPU
│       │   └── PostProcessing.js  # Trails (WebGLRenderTarget + fade quad) + UnrealBloomPass
│       ├── export/
│       │   └── VideoExporter.js   # MediaRecorder captureStream(0) → WebM → /export-api/
│       ├── services/
│       │   └── client.js          # Fetch vers /api/ (listPresets, savePreset, deletePreset)
│       └── ui/
│           ├── Controls.js        # 7 sliders live
│           └── PresetPanel.js     # UI save/load/delete presets
│
├── backend/                   # Service Python + FastAPI (presets CRUD)
│   ├── Dockerfile
│   ├── requirements.txt       # Versions pinnées
│   └── src/
│       ├── main.py            # FastAPI, CORS, lifespan init_db
│       ├── config.py          # DATABASE_URL depuis env
│       ├── db/
│       │   ├── client.py      # Pool asyncpg, codec JSONB, migration au démarrage
│       │   └── migrations/
│       │       └── 001_init.sql
│       └── routes/
│           └── presets.py     # CRUD presets (Pydantic PresetIn)
│
└── export/                    # Service Python + ffmpeg (conversion vidéo)
    ├── Dockerfile             # python:3.12-slim + apt install ffmpeg
    ├── requirements.txt
    ├── src/
    │   └── main.py            # POST /export : WebM → MP4 via subprocess ffmpeg
    └── tests/
        └── test_export.py     # 5 tests (empty body, codec avc1, vp9, ffmpeg error, success)
```

---

## Choix architecturaux

### GPU simulation — GPUComputationRenderer + GLSL

**Décision :** la simulation (calcul vélocités + positions) tourne entièrement sur GPU via `GPUComputationRenderer` (Three.js).

**Implémentation :**
- Deux textures RGBA float `TEXTURE_WIDTH × TEXTURE_HEIGHT` (1024 × 512 = 524 288 particules max) stockent les vélocités et positions
- `velocityShader.glsl` : lit la position courante, calcule le vecteur du champ via bruit de Perlin 3D implémenté en GLSL (table de permutation passée en `DataTexture`), applique `vel += (target - vel) * turbulence`
- `positionShader.glsl` : intègre `pos += vel * dt`, wrap toroïdal sur les 3 axes
- `ParticleMesh.js` : vertex shader lit la texture de positions via un attribut `aIndex` flottant → pas de readback CPU

**Pourquoi :** JavaScript ne peut pas mettre à jour 500k positions à 60fps. Le calcul du bruit de Perlin par particule à chaque frame est O(n) et trivial à paralléliser sur GPU. Le CPU ne touche plus aux données de simulation après `init()`.

### Fat client — simulation et rendu côté client

**Décision :** toute la logique de simulation et de rendu tourne dans le navigateur.

**Justification :** la règle "le backend fait les calculs" s'applique aux données métier partagées. Ici la simulation est un rendu génératif local, sans état partagé entre utilisateurs. Dupliquer la simulation serveur créerait deux sources de vérité sans valeur ajoutée. C'est le pattern **fat client**, utilisé par Figma, les éditeurs graphiques, les outils de création.

### Pipeline de rendu — trails via accumulation buffer

**Décision :** les trails sont réalisés par un buffer d'accumulation, pas par alpha decay sur les particules.

**Implémentation :**
1. Chaque frame, on rend dans un `WebGLRenderTarget` (trail buffer) :
   - Un quad plein écran noir avec `opacity = 1 - trailLength` (efface progressivement)
   - Les nouvelles positions des particules par-dessus
2. Le trail buffer est affiché via un `RenderPass` dans l'`EffectComposer`
3. L'`UnrealBloomPass` ajoute l'effet de lueur

**Pourquoi :** trails visuellement denses en O(1) mémoire quelle que soit la durée. Le fade est purement 2D, indépendant de la simulation.

### Export vidéo — MediaRecorder côté client + service ffmpeg dédié

**Décision :** le client enregistre via `MediaRecorder` (WebM), envoie au service export, récupère un MP4.

**Implémentation :**
- `captureStream(0)` (mode manuel) + `requestFrame()` dans un RAF dédié : évite la chute de framerate causée par la synchronisation implicite compositor↔GPU du mode automatique
- Le service export détecte le codec WebM reçu : si `avc1` (H.264), remux direct (`-c copy`, rapide) ; sinon ré-encodage `libx264` avec `crf 18`
- ffmpeg est isolé dans son propre service pour ne pas alourdir l'image du backend métier

**Pourquoi :** le serveur n'a pas accès au rendu WebGL. Streamer les frames vers le serveur pour qu'il encode créerait un couplage fort. Le client enregistre ce qu'il affiche, le service encode uniquement.

### Import map CDN — zéro bundler

**Décision :** Three.js chargé depuis jsDelivr via `<script type="importmap">`. Aucun build step.

**Pourquoi :** simplicité maximale. Nginx sert des fichiers statiques, aucun tooling à maintenir.

### Python + FastAPI pour le backend presets

**Décision :** backend CRUD minimal en Python/FastAPI.

**Justification :** documentation Swagger auto-générée sur `/docs`, validation automatique via Pydantic, async natif avec `asyncpg`. Le backend est intentionnellement minimal — il fait exactement ce dont l'application a besoin.

CORS configuré avec `allow_origins=["*"]` — choix assumé pour un projet sans authentification ni données sensibles. À restreindre si on ajoutait de l'auth.

### Deux fichiers Compose

- `docker-compose.yml` — `build:` local, credentials `flowfield:flowfield` hardcodés → usage développement
- `compose.yaml` — images depuis le registry GitLab CI, `${DB_PASSWORD}` depuis l'environnement → usage déploiement (Ansible/Kubernetes)

---

## Paramètres de simulation

| Paramètre | Type | Plage (slider) | Description |
|---|---|---|---|
| `speed` | float | 0.1 – 50.0 | Vitesse de déplacement des particules |
| `turbulence` | float | 0.01 – 1.0 | Facteur lerp vélocité → target (chaos vs inertie) |
| `noiseScale` | float | 0.1 – 5.0 | Densité des tourbillons du champ |
| `particleCount` | integer | 1 000 – 300 000 | Nombre de particules actives (MAX_COUNT = 524 288) |
| `size` | float | 0.2 – 8.0 | Taille visuelle des particules |
| `trailLength` | float | 0.0 – 0.99 | Persistance des trails (fade = 1 - trailLength) |
| `bloomStrength` | float | 0.0 – 3.0 | Intensité du bloom (UnrealBloomPass.strength) |
| `seed` | integer | — | Graine du champ (constructeur uniquement, fixé à 42) |

> **Note :** `turbulence` agit comme un lissage exponentiel (`vel += (target - vel) * turbulence`), pas comme du chaos au sens strict.

> **Limitation connue :** les presets sauvegardent les paramètres visuels (sliders) mais pas le `seed` de la simulation. Le champ `seed` en base est toujours `0` — les presets restaurent une configuration de rendu, pas un état exact reproductible.

---

## Schéma de base de données

```sql
CREATE TABLE IF NOT EXISTS presets (
    id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    nom        VARCHAR(100) NOT NULL,
    seed       INTEGER NOT NULL,
    params     JSONB NOT NULL,
    created_at TIMESTAMP DEFAULT NOW()
);
```

### Structure du champ `params` (JSONB)

```json
{
  "speed": 0.8,
  "turbulence": 0.3,
  "noiseScale": 1.2,
  "particleCount": 80000,
  "size": 1.5,
  "trailLength": 0.95,
  "bloomStrength": 1.0
}
```

---

## API REST

### Backend presets (port 8000, proxy `/api/`)

```
GET    /health          État de l'API et de la DB
POST   /presets/        Créer un preset
GET    /presets/        Lister tous les presets (ORDER BY created_at DESC)
DELETE /presets/{id}    Supprimer un preset (404 si inexistant)
```

### Service export (port 8001, proxy `/export-api/`)

```
POST   /export          Reçoit un blob WebM, retourne un fichier MP4
```

---

## État d'implémentation

| Module | État | Notes |
|---|---|---|
| ParticleSystem.js | ✅ Implémenté | GPUComputationRenderer, 2 textures float, uniforms |
| velocityShader.glsl | ✅ Implémenté | Perlin 3D GLSL, table perm en DataTexture, lerp turbulence |
| positionShader.glsl | ✅ Implémenté | Intégration Euler, wrap toroïdal |
| ParticleMesh.js | ✅ Implémenté | Vertex shader GPU, alpha fade radial, AdditiveBlending |
| PostProcessing.js | ✅ Implémenté | Accumulation buffer + UnrealBloomPass |
| Renderer.js | ✅ Implémenté | OrbitControls, boucle RAF, resize |
| Controls.js | ✅ Implémenté | 7 sliders live |
| PresetPanel.js | ✅ Implémenté | Save/load/delete presets, popup nom, empty state |
| services/client.js | ✅ Implémenté | Fetch /api/, gestion erreurs HTTP |
| VideoExporter.js | ✅ Implémenté | MediaRecorder, captureStream(0), envoi /export-api/ |
| Backend CRUD presets | ✅ Implémenté | FastAPI + asyncpg + PostgreSQL |
| Service export | ✅ Implémenté | FastAPI + ffmpeg, 5 tests |

---

## Arguments à l'oral

**Sur le GPU**
> "JavaScript ne peut pas mettre à jour 500k positions à 60fps. GPUComputationRenderer exécute le calcul du bruit de Perlin et l'intégration des positions dans des fragment shaders GLSL — le CPU ne touche plus aux données de simulation après l'initialisation."

**Sur le fat client**
> "La règle 'le backend fait les calculs' s'applique aux données métier partagées. Ici la simulation est un rendu génératif local — la dupliquer serveur créerait deux sources de vérité sans valeur ajoutée. C'est le pattern fat client, utilisé par Figma ou les éditeurs graphiques."

**Sur les trails par accumulation buffer**
> "Les trails ne sont pas stockés en mémoire — c'est un fade progressif d'un buffer GPU. Chaque frame on dessine un quad noir semi-transparent par-dessus le buffer, puis on stamp les nouvelles positions. C'est O(1) en mémoire quelle que soit la durée de la simulation."

**Sur l'export vidéo**
> "Le serveur n'a pas accès au rendu WebGL. On utilise MediaRecorder avec captureStream(0) — mode manuel qui soumet chaque frame explicitement via requestFrame() pour éviter la chute de framerate. Le service export reçoit le WebM et le remuxe ou ré-encode selon le codec. ffmpeg est isolé dans son propre conteneur pour ne pas alourdir l'image du backend métier."

**Sur l'import map sans bundler**
> "Aucun build step. Nginx sert des fichiers statiques, l'import map résout Three.js depuis CDN. C'est le bon choix pour un projet qui n'a pas besoin de tree-shaking ou de transpilation."

**Sur FastAPI**
> "Python + FastAPI pour sa lisibilité, sa validation automatique via Pydantic et sa documentation Swagger auto-générée sur `/docs`. Le backend est intentionnellement simple — il fait exactement ce dont l'application a besoin, sans over-engineering."

**Extension naturelle si question sur les limites**
> "L'extension logique serait d'ajouter une galerie publique — les vidéos uploadées côté serveur avec un UUID localStorage pour identifier les contributeurs sans friction d'authentification. Ou une authentification légère si on voulait isoler les presets par utilisateur."
