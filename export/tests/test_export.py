from pathlib import Path
from unittest.mock import MagicMock, patch

from fastapi.testclient import TestClient

from src.main import app

client = TestClient(app)


def test_export_ffmpeg_error_returns_422():
    mock_result = MagicMock()
    mock_result.returncode = 1
    mock_result.stderr = "FFmpeg error: invalid codec"

    with patch("src.main.subprocess.run", return_value=mock_result):
        response = client.post(
            "/export",
            files={"file": ("capture.webm", b"fake webm data", "video/webm")},
        )

    assert response.status_code == 422
    assert "FFmpeg error" in response.json()["detail"]


def test_export_success_returns_mp4():
    fake_mp4 = b"fake mp4 bytes"

    def fake_ffmpeg(cmd, **kwargs):
        output_path = Path(cmd[-1])
        output_path.write_bytes(fake_mp4)
        result = MagicMock()
        result.returncode = 0
        result.stderr = ""
        return result

    with patch("src.main.subprocess.run", side_effect=fake_ffmpeg):
        response = client.post(
            "/export",
            files={"file": ("capture.webm", b"fake webm data", "video/webm")},
        )

    assert response.status_code == 200
    assert "video/mp4" in response.headers["content-type"]
    assert response.content == fake_mp4
