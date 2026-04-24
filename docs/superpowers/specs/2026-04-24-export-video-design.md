# Export Vidéo MP4 — Design Spec

**Date:** 2026-04-24  
**Status:** Approved

---

## Problème

L'utilisateur veut exporter la simulation FlowField en vidéo MP4 pour l'utiliser comme wallpaper animé dans Wallpaper Engine. Le rendu est entièrement client-side (WebGL) — le serveur n'a pas accès aux frames. Il faut donc capturer côté client et encoder côté serveur.

---

## Solution retenue : MediaRecorder → FastAPI export service → FFmpeg → MP4

Le frontend capture la simulation via l'API native `MediaRecorder` (WebM) et envoie le blob au nouveau service `export`. Ce service encode en MP4 H.264 via FFmpeg et retourne le fichier. Le browser déclenche le téléchargement.

**Format de sortie :** MP4 H.264, 1920×1080, 60fps, 10 secondes — compatible Wallpaper Engine "Video Wallpaper".

---

## Architecture

### Services Docker Compose (état final : 4 services)

```
Nginx :80
  /          → fichiers statiques frontend
  /api/      → backend:8000   (presets CRUD, PostgreSQL)
  /export-api/ → export:8001  (encodage vidéo, stateless)

backend:8000   FastAPI + asyncpg + PostgreSQL  [existant]
export:8001    FastAPI + FFmpeg                [nouveau]
db:5432        PostgreSQL                      [existant]
```

### Nouveau service `export/`

```
export/
├── Dockerfile        (python:3.12-slim + ffmpeg via apt-get)
├── requirements.txt  (fastapi, uvicorn, python-multipart, aiofiles)
└── src/
    └── main.py       (FastAPI app, un seul endpoint POST /export)
```

Stateless — pas de base de données, pas de volume persistant. Les fichiers temporaires vivent dans `/tmp/{uuid}/` et sont supprimés après chaque requête.

---

## Service Export — FastAPI

### Endpoint

```
POST /export
Content-Type: multipart/form-data
Body:
  - file: UploadFile  (blob WebM capturé par MediaRecorder)

Réponse (succès):
  HTTP 200
  Content-Type: video/mp4
  Content-Disposition: attachment; filename="flowfield.mp4"
  Body: fichier MP4

Réponse (erreur FFmpeg):
  HTTP 422
  Body: { "detail": "<stderr FFmpeg>" }
```

### Flow interne

1. Reçoit le WebM, l'écrit dans `/tmp/{uuid}/input.webm`
2. Lance FFmpeg (subprocess synchrone) :
   ```
   ffmpeg -y -i input.webm
     -c:v libx264
     -crf 18
     -preset fast
     -pix_fmt yuv420p
     -movflags +faststart
     output.mp4
   ```
   - `crf 18` : haute qualité (bloom et gradients préservés)
   - `pix_fmt yuv420p` : compatibilité maximale Wallpaper Engine
   - `movflags +faststart` : métadonnées en tête de fichier
3. Si FFmpeg exit code ≠ 0 → HTTP 422 avec stderr
4. Retourne `FileResponse(output.mp4)`
5. `finally` : supprime `/tmp/{uuid}/` dans tous les cas

### Dockerfile export

```dockerfile
FROM python:3.12-slim
RUN apt-get update && apt-get install -y ffmpeg && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY src/ ./src/
CMD ["uvicorn", "src.main:app", "--host", "0.0.0.0", "--port", "8001"]
```

---

## Frontend

### Modifications `frontend/src/renderer/Renderer.js`

Ajouter deux membres publics nécessaires à `VideoExporter` :

```js
get canvas() { return this._canvas; }

resize(w, h) {
  this._camera.aspect = w / h;
  this._camera.updateProjectionMatrix();
  this._renderer.setSize(w, h);
  this._post.resize(w, h);
}
```

`_onResize()` devient un appel à `this.resize(window.innerWidth, window.innerHeight)`.

### Nouveau fichier : `frontend/src/export/VideoExporter.js`

Responsabilité unique : capturer la simulation et l'envoyer au service export.

**API publique :**
```js
export class VideoExporter {
  constructor({ renderer })  // reçoit l'instance Renderer
  async export()             // démarre capture → upload → téléchargement
}
```

**Flow de capture dans `export()` :**

1. Redimensionne le renderer à 1920×1080 via `renderer.resize(1920, 1080)`
2. Sélectionne le MIME type MediaRecorder avec fallback :
   `'video/webm;codecs=vp9'` si supporté, sinon `'video/webm'`
3. `renderer.canvas.captureStream(60)` → `new MediaRecorder(stream, { mimeType })`
3. Enregistre 10 secondes (`setTimeout` + `recorder.stop()`)
4. Assemble les chunks `ondataavailable` en `Blob`
5. Restore la taille originale du renderer (`window.innerWidth × window.innerHeight`)
6. `POST /export-api/export` — FormData avec le blob WebM
7. Reçoit le MP4 → crée un `<a>` avec `URL.createObjectURL` → `.click()` → revoke URL

### États UI

Bouton "Export MP4" dans l'overlay `index.html` :

| État | Label bouton | Interaction |
|---|---|---|
| idle | Export MP4 | cliquable |
| recording | Enregistrement… | désactivé |
| encoding | Encodage… | désactivé |
| done | Export MP4 | téléchargement déclenché automatiquement |
| error | Export MP4 | message d'erreur 3s, puis retour idle |

Les sliders et le PresetPanel restent actifs pendant l'enregistrement.

### Câblage dans `main.js`

`canvas` n'est plus passé directement à `VideoExporter` — il passe par `renderer.canvas`.

```js
import { VideoExporter } from './export/VideoExporter.js';
const exporter = new VideoExporter({ renderer });
document.getElementById('btn-export').addEventListener('click', () => exporter.export());
```

---

## Modifications infrastructure

### `docker-compose.yml`

Ajouter le service `export` :

```yaml
export:
  build: ./export
  ports:
    - "8001:8001"
```

Pas de `depends_on` DB — service stateless.

### `frontend/nginx.conf`

Ajouter le bloc proxy :

```nginx
location /export-api/ {
    proxy_pass http://export:8001/;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    client_max_body_size 100M;
    proxy_read_timeout 120s;
}
```

`client_max_body_size 100M` : le blob WebM 10s à 1080p peut peser ~30-50MB.
`proxy_read_timeout 120s` : laisse le temps à FFmpeg d'encoder.

---

## Ce qui ne change pas

- `backend/` — presets CRUD inchangé
- `frontend/src/simulation/` — simulation inchangée
- `frontend/src/renderer/PostProcessing.js` — inchangé
- `frontend/src/renderer/ParticleMesh.js` — inchangé
- `frontend/src/ui/Controls.js` — sliders inchangés
- `frontend/src/ui/PresetPanel.js` — inchangé
