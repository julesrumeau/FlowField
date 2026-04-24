# CLAUDE.md — FlowField

Document de référence architectural pour le projet FlowField.
À destination de tout développeur (ou IA) intervenant sur le projet.

---

## Présentation du projet

**FlowField** est une application web de simulation et rendu génératif en temps réel.
Des particules suivent un champ vectoriel 3D généré par du bruit OpenSimplex, produisant un rendu organique et fluide inspiré de l'art génératif.

L'utilisateur peut :
- Visualiser la simulation en temps réel avec des paramètres ajustables via des sliders
- Naviguer dans la scène 3D (OrbitControls : rotate, zoom, pan)
- *(à venir)* Sauvegarder et recharger des presets de paramètres
- *(à venir)* Exporter la simulation en GIF et le télécharger localement

---

## Stack technique

| Couche | Technologie | Justification |
|---|---|---|
| Simulation & rendu | Three.js 0.165.0 (WebGL) | 100k+ particules à 60fps via GPU client, EffectComposer pour post-processing |
| Chargement Three.js | Import map + CDN jsDelivr | Zéro bundler, chargement natif ES modules dans le navigateur |
| Post-processing | UnrealBloomPass + accumulation buffer custom | Trails persistants via WebGLRenderTarget, bloom via EffectComposer |
| Backend | Python + FastAPI | Documentation Swagger auto-générée, validation Pydantic, async natif avec asyncpg |
| Base de données | PostgreSQL | Stockage presets |
| Serveur frontend | Nginx | Sert les assets statiques, proxifie `/api/` vers le backend |
| Orchestration | Docker Compose | 3 services, `docker compose up` sans intervention |

---

## Architecture

### Vue d'ensemble

```
┌─────────────────────────────────────────────────────┐
│  Service 1 — Nginx (port 80)                        │
│  Sert le frontend statique (HTML + JS + Three.js)   │
│  Proxy /api/ → backend:8000                         │
└─────────────────────────────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────┐
│  Service 2 — Python + FastAPI (port 8000)           │
│  GET    /health         état API + DB               │
│  POST   /presets        sauvegarder un preset       │
│  GET    /presets        lister tous les presets     │
│  DELETE /presets/:id    supprimer un preset         │
└─────────────────────────────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────┐
│  Service 3 — PostgreSQL (healthcheck pg_isready)    │
│  table presets (id, nom, seed, params jsonb, date)  │
└─────────────────────────────────────────────────────┘
```

### Structure des dossiers (état actuel)

```
flowfield/
├── docker-compose.yml
├── CLAUDE.md
│
├── frontend/                     # Service Nginx + Three.js
│   ├── Dockerfile
│   ├── nginx.conf
│   └── src/
│       ├── index.html            # Importmap CDN Three.js, UI overlay + controls CSS
│       ├── main.js               # Point d'entrée, instanciation et câblage des modules
│       ├── simulation/
│       │   ├── FlowField.js      # Champ vectoriel 3D OpenSimplex (3 axes, normalisé)
│       │   ├── ParticleSystem.js # Update CPU positions + vélocités (lerp turbulence)
│       │   └── noise.js          # Implémentation OpenSimplex noise
│       ├── renderer/
│       │   ├── Renderer.js       # WebGLRenderer, PerspectiveCamera, OrbitControls, boucle RAF
│       │   ├── ParticleMesh.js   # THREE.Points, AdditiveBlending, texture circulaire canvas
│       │   └── PostProcessing.js # Trails (WebGLRenderTarget + fade quad) + UnrealBloomPass
│       └── ui/
│           └── Controls.js       # 7 sliders live (speed, turbulence, noiseScale, particles, size, trails, bloom)
│
│   # Pas encore implémenté :
│   #   export/GifExporter.js
│   #   api/client.js
│   #   ui/PresetPanel.js
│
└── backend/                      # Service Python + FastAPI
    ├── Dockerfile
    ├── requirements.txt
    └── src/
        ├── main.py               # Point d'entrée FastAPI, CORS, lifespan init_db
        ├── config.py             # DATABASE_URL depuis env
        ├── db/
        │   ├── client.py         # Pool asyncpg, codec JSONB, auto-migration au démarrage
        │   └── migrations/
        │       └── 001_init.sql  # CREATE TABLE IF NOT EXISTS presets
        └── routes/
            └── presets.py        # CRUD presets (Pydantic PresetIn)
```

---

## Choix architecturaux

### Fat client — simulation côté client

**Décision :** toute la logique de simulation et de rendu tourne dans le navigateur (Three.js/WebGL).

**Justification :** la règle "le backend fait les calculs" s'applique aux données métier partagées (prix, stock, règles de gestion). Ici la simulation est un rendu génératif local, sans état partagé entre utilisateurs, sans donnée sensible. Dupliquer la simulation côté serveur créerait deux sources de vérité sans valeur ajoutée. C'est le pattern **fat client**, utilisé par Figma, les éditeurs graphiques, les outils de création — la logique applicative vit là où est l'affichage.

**Ce que ça permet :**
- 100k+ particules à 60fps via GPU client (WebGL BufferGeometry + THREE.Points)
- Trails persistants via accumulation buffer (WebGLRenderTarget + fade quad noir semi-transparent)
- Bloom via EffectComposer (UnrealBloomPass)
- Navigation 3D interactive (OrbitControls)

### Pipeline de rendu — trails via accumulation buffer

**Décision :** les trails ne sont pas réalisés par alpha decay sur les particules mais par un buffer d'accumulation.

**Implémentation :**
1. Chaque frame, on rend dans un `WebGLRenderTarget` (le trail buffer) :
   - Un quad plein écran noir avec `opacity = 1 - trailLength` (efface progressivement)
   - Les nouvelles positions des particules par-dessus
2. Le trail buffer est affiché via un RenderPass dans l'EffectComposer
3. L'UnrealBloomPass ajoute l'effet de lueur sur le résultat

**Pourquoi :** permet des trails visuellement denses sans stocker d'historique de positions. Le fade est purement 2D, indépendant de la simulation.

### Import map CDN — zéro bundler

**Décision :** Three.js est chargé directement depuis jsDelivr via une `<script type="importmap">` dans `index.html`. Aucun build step (Vite, Webpack, etc.).

```html
<script type="importmap">
{
  "imports": {
    "three": "https://cdn.jsdelivr.net/npm/three@0.165.0/build/three.module.js",
    "three/addons/": "https://cdn.jsdelivr.net/npm/three@0.165.0/examples/jsm/"
  }
}
</script>
```

**Pourquoi :** simplicité maximale. Nginx sert des fichiers statiques, aucun tooling à maintenir.

### Export GIF côté client — téléchargement local *(planifié)*

**Décision :** le frontend capturera ses propres frames et encodera le GIF via CCapture.js ou MediaRecorder. Le fichier sera téléchargé directement, sans stockage serveur.

**Justification :** le client est la seule entité qui a accès au rendu. Faire générer le GIF par le serveur impliquerait soit de streamer les frames (couplage fort), soit de dupliquer la simulation serveur. Le client génère et télécharge ce qu'il affiche.

### Python + FastAPI pour le backend

**Décision :** backend en Python/FastAPI, CRUD pur sur les presets.

**Justification :** FastAPI génère automatiquement une documentation Swagger interactive sur `/docs`. La validation des données est automatique via Pydantic. L'async natif avec `asyncio` + `asyncpg` garantit des performances sans compromis pour les requêtes DB. Le backend est intentionnellement minimal.

---

## Paramètres de simulation

| Paramètre | Type | Plage (slider) | Description |
|---|---|---|---|
| `speed` | float | 0.1 – 50.0 | Vitesse de déplacement des particules |
| `turbulence` | float | 0.01 – 1.0 | Facteur lerp vélocité → target (chaos vs inertie) |
| `noiseScale` | float | 0.1 – 5.0 | Densité des tourbillons du champ |
| `particleCount` | integer | 1 000 – 150 000 | Nombre de particules actives (MAX_COUNT = 150 000) |
| `size` | float | 0.2 – 8.0 | Taille visuelle des particules (PointsMaterial.size) |
| `trailLength` | float | 0.0 – 0.99 | Persistance des trails (opacity fade = 1 - trailLength) |
| `bloomStrength` | float | 0.0 – 3.0 | Intensité du bloom (UnrealBloomPass.strength) |
| `seed` | integer | — | Graine du champ vectoriel (constructeur uniquement) |

> **Note :** `turbulence` agit comme un facteur de lissage exponentiel (`velocity += (target - velocity) * turbulence`), pas comme du chaos au sens strict.

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

### Endpoints

```
GET    /health          État de l'API et de la DB
POST   /presets/        Créer un preset
GET    /presets/        Lister tous les presets (ORDER BY created_at DESC)
DELETE /presets/{id}    Supprimer un preset (404 si inexistant)
```

**POST /presets/ — body**
```json
{
  "nom": "Tourbillon lent",
  "seed": 42,
  "params": { "speed": 0.8, "noiseScale": 1.2, "trailLength": 0.95 }
}
```

**GET /health — réponse**
```json
{ "status": "ok", "db": "ok" }
```

---

## docker-compose.yml

```yaml
services:
  frontend:
    build: ./frontend
    ports:
      - "80:80"
    depends_on:
      - backend

  backend:
    build: ./backend
    ports:
      - "8000:8000"
    environment:
      - DATABASE_URL=postgresql://flowfield:flowfield@db:5432/flowfield
    depends_on:
      db:
        condition: service_healthy   # attend que la DB soit prête

  db:
    image: postgres:16-alpine
    environment:
      - POSTGRES_USER=flowfield
      - POSTGRES_PASSWORD=flowfield
      - POSTGRES_DB=flowfield
    volumes:
      - pg_data:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U flowfield -d flowfield"]
      interval: 5s
      timeout: 5s
      retries: 5

volumes:
  pg_data:
```

---

## État d'implémentation

| Module | État | Notes |
|---|---|---|
| FlowField.js | ✅ Implémenté | 3 champs OpenSimplex 3D, normalisés |
| ParticleSystem.js | ✅ Implémenté | CPU, lerp vélocité, wrap bounds cubiques |
| ParticleMesh.js | ✅ Implémenté | THREE.Points, AdditiveBlending, texture radiale |
| PostProcessing.js | ✅ Implémenté | Accumulation buffer + UnrealBloomPass |
| Renderer.js | ✅ Implémenté | OrbitControls, boucle RAF, resize |
| Controls.js | ✅ Implémenté | 7 sliders, modification live |
| Backend CRUD presets | ✅ Implémenté | FastAPI + asyncpg + PostgreSQL |
| PresetPanel.js | ⏳ Planifié | UI sauvegarde/chargement presets |
| api/client.js | ⏳ Planifié | Appels REST vers FastAPI |
| GifExporter.js | ⏳ Planifié | Export GIF client-side |

---

## Arguments à l'oral

**Sur le fat client**
> "La règle 'le backend fait les calculs' s'applique aux données métier partagées. Ici la simulation est un rendu génératif local — la dupliquer serveur créerait deux sources de vérité sans valeur ajoutée. C'est le pattern fat client, utilisé par Figma ou les éditeurs graphiques."

**Sur les trails par accumulation buffer**
> "Les trails ne sont pas stockés en mémoire — c'est un fade progressif d'un buffer GPU. Chaque frame on dessine un quad noir semi-transparent par-dessus le buffer, puis on stamp les nouvelles positions. C'est O(1) en mémoire quelle que soit la durée de la simulation."

**Sur l'import map sans bundler**
> "Aucun build step. Nginx sert des fichiers statiques, l'import map résout Three.js depuis CDN. C'est le bon choix pour un projet qui n'a pas besoin de tree-shaking ou de transpilation."

**Sur l'export GIF côté client**
> "Le serveur n'a pas accès au rendu. Faire générer le GIF serveur impliquerait de streamer les frames ou dupliquer la simulation — deux options qui créent un couplage fort ou une incohérence. Le client génère et télécharge ce qu'il affiche."

**Sur FastAPI**
> "Python + FastAPI pour sa lisibilité, sa validation automatique via Pydantic et sa documentation Swagger auto-générée sur `/docs`. Le backend est intentionnellement simple — il fait exactement ce dont l'application a besoin, sans over-engineering."

**Extension naturelle si question sur les limites**
> "L'extension logique serait d'ajouter une galerie publique partagée — les GIFs uploadés côté serveur, avec un UUID localStorage pour identifier les contributeurs sans friction d'authentification. Ou une authentification légère si on voulait isoler les presets par utilisateur."
