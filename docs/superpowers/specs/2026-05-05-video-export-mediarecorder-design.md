# Design — Export vidéo via MediaRecorder

**Date :** 2026-05-05  
**Statut :** approuvé  
**Contexte :** remplace l'approche frame-by-frame (`canvas.toBlob()` × 300) qui bridait l'animation à 2fps pendant la capture.

---

## Problème

L'implémentation actuelle (`VideoExporter.js`) :
1. Pause le renderer
2. Redimensionne le canvas à 1920×1080
3. Boucle 300 fois : `renderer.tick()` + `canvas.toBlob()` → JPEG
4. Envoie 300 fichiers en multipart (~60 MB) au service export
5. ffmpeg assemble les frames en MP4

Le goulot d'étranglement est `canvas.toBlob()` à 1920×1080 : GPU readback (VRAM → RAM) + encodage JPEG software, séquentiel. Résultat : 2fps perçus pendant la capture, animation bloquée.

---

## Solution retenue

**MediaRecorder + remux backend.**

`canvas.captureStream()` alimente un `MediaRecorder` qui encode via le chip vidéo hardware du GPU (circuit dédié, séparé du pipeline 3D WebGL). L'utilisateur enregistre en temps réel via Start/Stop. À l'arrêt, un seul blob WebM est envoyé au backend qui le remuxe en MP4 avec ffmpeg.

Impact perf estimé : **0–2 fps** de perte pendant l'enregistrement.

---

## Architecture

```
Frontend                          Backend (export service)
─────────────────────────────     ────────────────────────────
canvas.captureStream(60)          POST /export
  └─ MediaRecorder (H.264/VP9)      Content-Type: video/webm
       └─ chunks ondataavailable     body: raw WebM bytes
            └─ Blob WebM              └─ ffmpeg -c copy → MP4
                 └─ fetch POST ───►        └─ FileResponse MP4
                                   ◄── téléchargement MP4
```

Deux services Docker distincts inchangés : `frontend` (Nginx) et `export` (FastAPI+ffmpeg). Nginx proxifie `/export-api/` → service export.

---

## Frontend — `VideoExporter.js`

### Supprimé
- Loop `toBlob()` frame par frame
- Resize canvas à 1920×1080 pendant l'export
- Envoi multipart (300 fichiers)
- Constantes `TOTAL_FRAMES`, `EXPORT_WIDTH`, `EXPORT_HEIGHT`

### Ajouté
- `_startRecording()` : crée `MediaRecorder` avec sélection de codec par priorité
- `_stopRecording()` : arrête le recorder, assemble les chunks, envoie au backend
- Deux boutons dans `index.html` : `#btn-record-start` / `#btn-record-stop`
- Indicateur "REC" visible pendant l'enregistrement (remplace la barre de progression)

### Sélection de codec (ordre de priorité)
```js
const PREFERRED_CODECS = [
  'video/webm;codecs=avc1',  // H.264 dans WebM → remux -c copy côté backend
  'video/webm;codecs=vp9',   // VP9 → ré-encodage libx264 côté backend
  'video/webm;codecs=vp8',   // fallback
  'video/webm',              // fallback générique
];
```
Si aucun codec n'est supporté (`MediaRecorder.isTypeSupported`), une erreur est affichée avant de lancer.

### Bitrate
`videoBitsPerSecond: 8_000_000` (8 Mbps) — qualité haute pour du 1080p, ~60 MB/min.

### Comportement Start/Stop
- **Start** : désactive `#btn-record-start`, active `#btn-record-stop`, affiche indicateur REC
- **Stop** : désactive `#btn-record-stop`, envoie blob, réactive `#btn-record-start` au retour
- Durée minimum : si le blob fait < 1 seconde d'enregistrement, affiche "Enregistrement trop court" et annule l'envoi

---

## Backend — `export/src/main.py`

### Endpoint modifié

```
POST /export
Content-Type: video/webm
Body: <raw WebM bytes>
```

Remplace la signature `UploadFile[]` par `Request.body()` (lecture du body brut).

### Pipeline ffmpeg

**Cas H.264 (avc1) :** remux sans ré-encodage
```bash
ffmpeg -y -i input.webm -c copy -movflags +faststart output.mp4
```

**Cas VP8/VP9 :** ré-encodage libx264
```bash
ffmpeg -y -i input.webm -c:v libx264 -crf 18 -preset fast -pix_fmt yuv420p -movflags +faststart output.mp4
```

La détection du codec se fait par lecture du header `Content-Type` de la requête. Si le header contient `avc1`, on utilise `-c copy` ; sinon on ré-encode avec libx264.

### Réponses
| Code | Condition |
|---|---|
| 200 | MP4 généré, FileResponse avec cleanup background |
| 422 | Body vide, ffmpeg error (stderr inclus dans detail) |
| 500 | Erreur interne inattendue |

---

## Contrat API

```
POST /export
Content-Type: video/webm          (ou video/webm;codecs=avc1, etc.)
Body: <raw WebM bytes>

← 200  Content-Type: video/mp4
        Content-Disposition: attachment; filename="flowfield.mp4"
← 422  { "detail": "<raison>" }
← 500  { "detail": "<raison>" }
```

---

## Gestion d'erreurs

| Cas | Comportement frontend | Comportement backend |
|---|---|---|
| Aucun codec WebM supporté | Alerte avant démarrage, bouton désactivé | — |
| Stop < 1 seconde | Message "Enregistrement trop court", pas d'envoi | — |
| Body vide reçu | — | 422 `"No video data provided"` |
| ffmpeg échoue | Message d'erreur affiché 3s | 422 avec stderr |
| Réseau coupé | `fetch` rejette → message d'erreur, bouton réactivé | — |

---

## Comparaison avec l'implémentation actuelle

| Critère | Avant | Après |
|---|---|---|
| Impact perf pendant capture | Animation bloquée (~2fps) | 0–2fps de perte |
| Payload envoyé au backend | ~60 MB (300 JPEGs multipart) | ~3–60 MB (1 blob WebM) |
| Durée fixe/libre | 5s fixe | Start/Stop libre |
| Résolution | 1920×1080 forcée | Résolution display native |
| Backend : travail ffmpeg | Assemble 300 frames | Remuxe 1 fichier (quasi-instantané si H.264) |

---

## Hors périmètre

- Prévisualisation du MP4 avant téléchargement
- Choix de résolution par l'utilisateur
- Export GIF (décision architecturale antérieure : client-side via CCapture)
- Authentification / rate limiting sur le service export
