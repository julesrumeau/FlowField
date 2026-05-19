# FlowField

Simulation de champ vectoriel 3D en temps réel. Des particules suivent un champ de bruit de Perlin calculé entièrement sur GPU, avec trails, bloom et export vidéo.

---

## Démarrage

**Prérequis :** Docker et Docker Compose.

```bash
docker compose up --build
```

Ouvrir [http://localhost](http://localhost).

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

| Service | Port exposé | Rôle |
|---|---|---|
| frontend (Nginx) | 80 | Assets statiques + reverse proxy vers les backends |
| backend (FastAPI) | interne 8000 | CRUD presets |
| export (FastAPI + ffmpeg) | interne 8001 | Conversion WebM → MP4 |
| db (PostgreSQL 16) | interne | Stockage presets |

Tous les accès passent par Nginx (port 80). Les ports internes ne sont pas exposés.

---

## API

### Backend — presets (`/api/`)

```
GET    /api/health              État de l'API et de la base de données
GET    /api/presets/            Liste tous les presets (ordre antéchronologique)
POST   /api/presets/            Crée un preset
DELETE /api/presets/{id}        Supprime un preset (404 si inexistant)
```

Documentation Swagger interactive : [http://localhost/api/docs](http://localhost/api/docs)

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
GET    /export-api/health       État du service et disponibilité de ffmpeg
POST   /export-api/export       Reçoit un blob WebM, retourne un fichier MP4
```

Documentation Swagger interactive : [http://localhost/export-api/docs](http://localhost/export-api/docs)

---

## Tests

```bash
cd export
pip install -r requirements.txt
pytest
```

5 tests couvrent : corps vide, codec avc1 (remux), codec vp9 (ré-encodage), erreur ffmpeg, réponse MP4.
