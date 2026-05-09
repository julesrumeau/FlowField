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

    content_type = request.headers.get("content-type", "")
    use_copy = "avc1" in content_type

    work_dir = Path(f"/tmp/{uuid.uuid4()}")
    work_dir.mkdir()
    input_path = work_dir / "input.webm"
    output_path = work_dir / "output.mp4"

    input_path.write_bytes(body)

    try:
        if use_copy:
            ffmpeg_cmd = [
                "ffmpeg", "-y",
                "-i", str(input_path),
                "-c", "copy",
                "-movflags", "+faststart",
                str(output_path),
            ]
        else:
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

        result = await asyncio.to_thread(
            subprocess.run, ffmpeg_cmd, capture_output=True, text=True, timeout=300
        )

        if result.returncode != 0:
            shutil.rmtree(work_dir, ignore_errors=True)
            raise HTTPException(status_code=422, detail=result.stderr)

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
