# FlowField

Simulation de champ vectoriel 3D en temps réel. Des particules suivent un champ de bruit de Perlin calculé entièrement sur GPU, avec trails, bloom et export vidéo.

---

## Démarrage

**Prérequis :** Docker et Docker Compose.

```bash
docker compose -f docker-compose.yml up --build
```

Ouvrir [http://localhost](http://localhost).

> `docker-compose.yml` — build local, credentials embarqués, usage développement.
> `compose.yaml` — images depuis le registry CI, variable `DB_PASSWORD` requise, usage déploiement.

---

## Fonctionnalités

| Fonctionnalité | Description |
|---|---|
| Simulation GPU | Jusqu'à 300 000 particules à 60 fps via GPUComputationRenderer + GLSL |
| Paramètres live | 7 sliders : vitesse, turbulence, échelle du bruit, nombre de particules, taille, trails, bloom |
| Navigation 3D | OrbitControls : rotation, zoom, pan |
| Presets | Sauvegarde, chargement et suppression de configurations via l'API |
| Export vidéo | Enregistrement MP4 directement depuis le navigateur |

---

## Services

| Service | Port | Rôle |
|---|---|---|
| frontend (Nginx) | 80 | Assets statiques + proxy API |
| backend (FastAPI) | 8000 | CRUD presets + healthcheck |
| export (FastAPI + ffmpeg) | 8001 | Conversion WebM → MP4 |
| db (PostgreSQL 16) | — | Stockage presets |

---

## API

### Backend — presets (`/api/`)

```
GET    /api/health              État de l'API et de la base de données
GET    /api/presets/            Liste tous les presets (ordre antéchronologique)
POST   /api/presets/            Crée un preset
DELETE /api/presets/{id}        Supprime un preset (404 si inexistant)
```

Documentation Swagger interactive : [http://localhost:8000/docs](http://localhost:8000/docs)

**POST /api/presets/ — corps**
```json
{
  "nom": "Tourbillon lent",
  "seed": 0,
  "params": {
    "speed": 0.8,
    "turbulence": 0.3,
    "noiseScale": 1.2,
    "particleCount": 80000,
    "size": 1.5,
    "trailLength": 0.95,
    "bloomStrength": 1.0
  }
}
```

### Service export (`/export-api/`)

```
POST   /export-api/export       Reçoit un blob WebM, retourne un fichier MP4
```

---

## Tests

```bash
cd export
pip install -r requirements.txt
pytest
```

5 tests couvrent : corps vide, codec avc1 (remux), codec vp9 (ré-encodage), erreur ffmpeg, réponse MP4.
