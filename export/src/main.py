import shutil
import subprocess
import uuid
from pathlib import Path

from fastapi import FastAPI, File, HTTPException, UploadFile
from fastapi.responses import FileResponse
from starlette.background import BackgroundTask

app = FastAPI()


@app.post("/export")
async def export_video(file: UploadFile = File(...)):
    work_dir = Path(f"/tmp/{uuid.uuid4()}")
    work_dir.mkdir()
    input_path = work_dir / "input.webm"
    output_path = work_dir / "output.mp4"

    try:
        input_path.write_bytes(await file.read())

        result = subprocess.run(
            [
                "ffmpeg", "-y", "-i", str(input_path),
                "-c:v", "libx264",
                "-crf", "18",
                "-preset", "fast",
                "-pix_fmt", "yuv420p",
                "-movflags", "+faststart",
                str(output_path),
            ],
            capture_output=True,
            text=True,
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
    except HTTPException:
        raise
    except Exception as e:
        shutil.rmtree(work_dir, ignore_errors=True)
        raise HTTPException(status_code=500, detail=str(e))
