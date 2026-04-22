# CLAUDE.md — FlowField

Document de référence architectural pour le projet FlowField.
À destination de tout développeur (ou IA) intervenant sur le projet.

---

## Présentation du projet

**FlowField** est une application web de simulation et rendu génératif en temps réel.
Des particules suivent un champ vectoriel 3D généré par du bruit OpenSimplex, produisant un rendu organique et fluide inspiré de l'art génératif.

L'utilisateur peut :
- Visualiser la simulation en temps réel avec des paramètres ajustables
- Sauvegarder et recharger des presets de paramètres
- Exporter la simulation en GIF et le télécharger localement

---

## Stack technique

| Couche | Technologie | Justification |
|---|---|---|
| Simulation & rendu | Three.js (WebGL) | 100k+ particules à 60fps via GPU client, écosystème riche (bloom, trails, post-processing) |
| Export GIF | CCapture.js / MediaRecorder (client) | Le client a la simulation — cohérent qu'il génère lui-même ses exports, téléchargement local uniquement |
| Backend | Python + FastAPI | Documentation Swagger auto-générée, validation Pydantic, async natif avec asyncpg |
| Base de données | PostgreSQL | Stockage presets |
| Serveur frontend | Nginx | Sert les assets statiques |
| Orchestration | Docker Compose | 3 services, `docker compose up` sans intervention |

---

## Architecture

### Vue d'ensemble

```
┌─────────────────────────────────────────────────────┐
│  Service 1 — Nginx                                  │
│  Sert le frontend statique (HTML + JS + Three.js)   │
└─────────────────────────────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────┐
│  Service 2 — Python + FastAPI                       │
│  POST   /presets        sauvegarder un preset       │
│  GET    /presets        lister tous les presets     │
│  DELETE /presets/:id    supprimer un preset         │
└─────────────────────────────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────┐
│  Service 3 — PostgreSQL                             │
│  table presets (id, nom, seed, params jsonb, date)  │
└─────────────────────────────────────────────────────┘
```

### Structure des dossiers

```
flowfield/
├── docker-compose.yml
├── CLAUDE.md
├── README.md
│
├── frontend/                     # Service Nginx + Three.js
│   ├── Dockerfile
│   ├── nginx.conf
│   └── src/
│       ├── index.html
│       ├── main.js               # Point d'entrée, orchestration
│       ├── simulation/
│       │   ├── FlowField.js      # Génération champ vectoriel OpenSimplex
│       │   ├── ParticleSystem.js # Update positions particules
│       │   └── noise.js          # Implémentation OpenSimplex
│       ├── renderer/
│       │   ├── Renderer.js       # Setup Three.js, camera, scene
│       │   ├── ParticleMesh.js   # BufferGeometry, shaders particules
│       │   └── PostProcessing.js # Bloom, depth of field
│       ├── export/
│       │   └── GifExporter.js    # Capture frames + encodage, téléchargement local
│       ├── api/
│       │   └── client.js         # Appels REST vers FastAPI
│       └── ui/
│           ├── Controls.js       # Sliders paramètres
│           └── PresetPanel.js    # UI sauvegarde/chargement presets
│
└── backend/                      # Service Python + FastAPI
    ├── Dockerfile
    ├── requirements.txt
    └── src/
        ├── main.py               # Point d'entrée FastAPI
        ├── db/
        │   ├── client.py         # Connexion PostgreSQL (asyncpg)
        │   └── migrations/
        │       └── 001_init.sql  # Schéma SQL
        ├── routes/
        │   └── presets.py        # Routes CRUD presets
        └── config.py             # Variables d'environnement
```

---

## Choix architecturaux

### Fat client — simulation côté client

**Décision :** toute la logique de simulation et de rendu tourne dans le navigateur (Three.js/WebGL).

**Justification :** la règle "le backend fait les calculs" s'applique aux données métier partagées (prix, stock, règles de gestion). Ici la simulation est un rendu génératif local, sans état partagé entre utilisateurs, sans donnée sensible. Dupliquer la simulation côté serveur créerait deux sources de vérité sans valeur ajoutée. C'est le pattern **fat client**, utilisé par Figma, les éditeurs graphiques, les outils de création — la logique applicative vit là où est l'affichage.

**Ce que ça permet :**
- 100k+ particules à 60fps via GPU client (WebGL BufferGeometry)
- Effets visuels riches (bloom, trails, depth of field) via Three.js
- Zéro latence réseau sur la simulation

### Export GIF côté client — téléchargement local

**Décision :** le frontend capture ses propres frames et encode le GIF via CCapture.js ou MediaRecorder. Le fichier est téléchargé directement sur la machine de l'utilisateur, sans stockage serveur.

**Justification :** le client est la seule entité qui a accès au rendu. Faire générer le GIF par le serveur impliquerait soit de streamer les frames (couplage fort, volume réseau élevé), soit de dupliquer la simulation serveur (deux sources de vérité). Le client génère et télécharge ce qu'il affiche — c'est cohérent et sans complexité serveur inutile.

### Python + FastAPI pour le backend

**Décision :** backend en Python/FastAPI, CRUD pur sur les presets.

**Justification :** FastAPI génère automatiquement une documentation Swagger interactive sur `/docs` — utile en démo sans effort supplémentaire. La validation des données est automatique via Pydantic. L'async natif avec `asyncio` + `asyncpg` garantit des performances sans compromis pour les requêtes DB. Le backend est intentionnellement minimal — il fait exactement ce dont l'application a besoin.

---

## Schéma de base de données

```sql
CREATE TABLE presets (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    nom         VARCHAR(100) NOT NULL,
    seed        INTEGER NOT NULL,
    params      JSONB NOT NULL,
    created_at  TIMESTAMP DEFAULT NOW()
);
```

### Structure du champ `params` (JSONB)

```json
{
  "noiseScale": 1.2,
  "speed": 0.8,
  "turbulence": 0.3,
  "trailLength": 0.95,
  "particleCount": 80000,
  "colorMode": "monochrome"
}
```

---

## Paramètres de simulation

| Paramètre | Type | Plage | Description |
|---|---|---|---|
| `seed` | integer | 0 – 999999 | Graine du champ vectoriel |
| `noiseScale` | float | 0.1 – 5.0 | Densité des tourbillons |
| `speed` | float | 0.1 – 5.0 | Vitesse de déplacement des particules |
| `turbulence` | float | 0.0 – 1.0 | Chaos vs fluidité |
| `trailLength` | float | 0.8 – 0.99 | Persistance des trails (alpha decay) |
| `particleCount` | integer | 1000 – 150000 | Nombre de particules actives |
| `colorMode` | enum | monochrome / accent / spectrum | Mode de coloration |

---

## API REST

### Presets

```
POST   /presets        Créer un preset
GET    /presets        Lister tous les presets
DELETE /presets/:id    Supprimer un preset
```

**POST /presets — body**
```json
{
  "nom": "Tourbillon rouge",
  "seed": 42,
  "params": { "noiseScale": 1.2, "speed": 0.8 }
}
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
      - db

  db:
    image: postgres:16-alpine
    environment:
      - POSTGRES_USER=flowfield
      - POSTGRES_PASSWORD=flowfield
      - POSTGRES_DB=flowfield
    volumes:
      - pg_data:/var/lib/postgresql/data

volumes:
  pg_data:
```

---

## Arguments à l'oral

**Sur le fat client**
> "La règle 'le backend fait les calculs' s'applique aux données métier partagées. Ici la simulation est un rendu génératif local — la dupliquer serveur créerait deux sources de vérité sans valeur ajoutée. C'est le pattern fat client, utilisé par Figma ou les éditeurs graphiques."

**Sur l'export GIF côté client**
> "Le serveur n'a pas accès au rendu. Faire générer le GIF serveur impliquerait de streamer les frames ou dupliquer la simulation — deux options qui créent un couplage fort ou une incohérence. Le client génère et télécharge ce qu'il affiche."

**Sur FastAPI**
> "Python + FastAPI pour sa lisibilité, sa validation automatique via Pydantic et sa documentation Swagger auto-générée sur `/docs`. Le backend est intentionnellement simple — il fait exactement ce dont l'application a besoin, sans over-engineering."

**Extension naturelle si question sur les limites**
> "L'extension logique serait d'ajouter une galerie publique partagée — les GIFs uploadés côté serveur, avec un UUID localStorage pour identifier les contributeurs sans friction d'authentification. Ou une authentification légère si on voulait isoler les presets par utilisateur."
