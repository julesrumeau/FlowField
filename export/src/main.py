import asyncio
import shutil
import subprocess
import uuid
from pathlib import Path

from fastapi import FastAPI, HTTPException, Request
from fastapi.responses import FileResponse
from starlette.background import BackgroundTask

app = FastAPI()


@app.post("/export")
async def export_video(request: Request):
    body = await request.body()
    if not body:
        raise HTTPException(status_code=422, detail="No video data provided")

    # Le client envoie le codec dans le Content-Type (ex: "video/webm;codecs=avc1").
    # Si c'est avc1 (H.264), la vidéo est déjà encodée en H.264 → on peut juste
    # changer le container (WebM→MP4) sans ré-encoder : rapide et sans perte de qualité.
    content_type = request.headers.get("content-type", "")
    use_copy = "avc1" in content_type

    # Dossier temporaire unique par requête (UUID) pour éviter les collisions entre
    # exports simultanés. Supprimé automatiquement après envoi de la réponse.
    work_dir = Path(f"/tmp/{uuid.uuid4()}")
    work_dir.mkdir()
    input_path = work_dir / "input.webm"
    output_path = work_dir / "output.mp4"

    input_path.write_bytes(body)

    try:
        if use_copy:
            # Remux direct : on copie les streams sans ré-encoder (-c copy).
            # +faststart : déplace l'en-tête MP4 au début du fichier pour permettre
            # la lecture en streaming (le navigateur peut lire avant la fin du téléchargement).
            ffmpeg_cmd = [
                "ffmpeg", "-y",
                "-i", str(input_path),
                "-c", "copy",
                "-movflags", "+faststart",
                str(output_path),
            ]
        else:
            # Ré-encodage en H.264 avec libx264.
            # crf=18 : qualité quasi-lossless (0=lossless, 51=pire qualité).
            # yuv420p : format de couleur compatible avec tous les lecteurs vidéo.
            ffmpeg_cmd = [
                "ffmpeg", "-y",
                "-i", str(input_path),
                "-c:v", "libx264",
                "-crf", "18",
                "-preset", "fast",
                "-pix_fmt", "yuv420p",
                "-movflags", "+faststart",
                str(output_path),
            ]

        # asyncio.to_thread exécute subprocess.run dans un thread OS séparé.
        # Sans ça, ffmpeg bloquerait la boucle d'événements FastAPI pendant l'encodage,
        # rendant le serveur incapable de traiter d'autres requêtes.
        result = await asyncio.to_thread(
            subprocess.run, ffmpeg_cmd, capture_output=True, text=True, timeout=300
        )

        if result.returncode != 0:
            shutil.rmtree(work_dir, ignore_errors=True)
            raise HTTPException(status_code=422, detail=result.stderr)

        # BackgroundTask supprime le dossier temporaire APRÈS que la réponse est envoyée.
        # Si on supprimait avant, le fichier n'existerait plus quand FastAPI essaierait
        # de le streamer vers le client.
        return FileResponse(
            str(output_path),
            media_type="video/mp4",
            headers={"Content-Disposition": 'attachment; filename="flowfield.mp4"'},
            background=BackgroundTask(shutil.rmtree, work_dir, ignore_errors=True),
        )
    except subprocess.TimeoutExpired:
        shutil.rmtree(work_dir, ignore_errors=True)
        raise HTTPException(status_code=422, detail="FFmpeg conversion timed out (> 5 min)")
    except HTTPException:
        raise
    except Exception as e:
        shutil.rmtree(work_dir, ignore_errors=True)
        raise HTTPException(status_code=500, detail=str(e))
