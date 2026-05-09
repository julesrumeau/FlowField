from pathlib import Path
from unittest.mock import MagicMock, patch

from fastapi.testclient import TestClient

from src.main import app

client = TestClient(app)


def test_empty_body_returns_422():
    response = client.post(
        "/export",
        content=b"",
        headers={"content-type": "video/webm"},
    )
    assert response.status_code == 422
    assert response.json()["detail"] == "No video data provided"


def test_avc1_codec_uses_copy():
    fake_mp4 = b"fake mp4 bytes"

    def fake_ffmpeg(cmd, **kwargs):
        Path(cmd[-1]).write_bytes(fake_mp4)
        result = MagicMock()
        result.returncode = 0
        result.stderr = ""
        return result

    with patch("src.main.subprocess.run", side_effect=fake_ffmpeg) as mock_run:
        response = client.post(
            "/export",
            content=b"fake webm data",
            headers={"content-type": "video/webm;codecs=avc1"},
        )

    assert response.status_code == 200
    cmd = mock_run.call_args[0][0]
    assert "-c" in cmd
    idx = cmd.index("-c")
    assert cmd[idx + 1] == "copy"
    assert "libx264" not in cmd


def test_vp9_codec_uses_libx264():
    fake_mp4 = b"fake mp4 bytes"

    def fake_ffmpeg(cmd, **kwargs):
        Path(cmd[-1]).write_bytes(fake_mp4)
        result = MagicMock()
        result.returncode = 0
        result.stderr = ""
        return result

    with patch("src.main.subprocess.run", side_effect=fake_ffmpeg) as mock_run:
        response = client.post(
            "/export",
            content=b"fake webm data",
            headers={"content-type": "video/webm;codecs=vp9"},
        )

    assert response.status_code == 200
    cmd = mock_run.call_args[0][0]
    assert "-c:v" in cmd
    idx = cmd.index("-c:v")
    assert cmd[idx + 1] == "libx264"


def test_ffmpeg_error_returns_422():
    mock_result = MagicMock()
    mock_result.returncode = 1
    mock_result.stderr = "FFmpeg error: invalid input"

    with patch("src.main.subprocess.run", return_value=mock_result):
        response = client.post(
            "/export",
            content=b"fake webm data",
            headers={"content-type": "video/webm"},
        )

    assert response.status_code == 422
    assert "FFmpeg error" in response.json()["detail"]


def test_success_returns_mp4():
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
            content=b"fake webm data",
            headers={"content-type": "video/webm"},
        )

    assert response.status_code == 200
    assert "video/mp4" in response.headers["content-type"]
    assert response.content == fake_mp4


def test_ffmpeg_timeout_returns_422():
    import subprocess as sp

    with patch("src.main.subprocess.run", side_effect=sp.TimeoutExpired(cmd="ffmpeg", timeout=300)):
        response = client.post(
            "/export",
            content=b"fake webm data",
            headers={"content-type": "video/webm"},
        )

    assert response.status_code == 422
    assert "timed out" in response.json()["detail"].lower()
