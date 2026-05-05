from pathlib import Path
from unittest.mock import MagicMock, patch

from fastapi.testclient import TestClient

from src.main import app

client = TestClient(app)

FAKE_FRAME = ("frames", ("frame_0000.jpg", b"fake jpeg data", "image/jpeg"))


def test_export_no_frames_returns_422():
    response = client.post("/export", data={"fps": "60"})
    assert response.status_code == 422


def test_export_ffmpeg_error_returns_422():
    mock_result = MagicMock()
    mock_result.returncode = 1
    mock_result.stderr = "FFmpeg error: invalid codec"

    with patch("src.main.subprocess.run", return_value=mock_result):
        response = client.post("/export", data={"fps": "60"}, files=[FAKE_FRAME])

    assert response.status_code == 422
    assert "FFmpeg error" in response.json()["detail"]


def test_export_success_returns_mp4():
    fake_mp4 = b"fake mp4 bytes"

    def fake_ffmpeg(cmd, **kwargs):
        Path(cmd[-1]).write_bytes(fake_mp4)
        result = MagicMock()
        result.returncode = 0
        result.stderr = ""
        return result

    with patch("src.main.subprocess.run", side_effect=fake_ffmpeg):
        response = client.post(
            "/export",
            data={"fps": "60"},
            files=[
                ("frames", ("frame_0000.jpg", b"fake jpeg 0", "image/jpeg")),
                ("frames", ("frame_0001.jpg", b"fake jpeg 1", "image/jpeg")),
            ],
        )

    assert response.status_code == 200
    assert "video/mp4" in response.headers["content-type"]
    assert response.content == fake_mp4
