from unittest.mock import AsyncMock, MagicMock, patch

from fastapi.testclient import TestClient

from src.main import app

client = TestClient(app)


def test_health_status_always_ok():
    # Sans pool disponible, db = "ko" mais status reste "ok"
    response = client.get("/health")
    assert response.status_code == 200
    assert response.json()["status"] == "ok"


def test_health_db_ok_when_pool_reachable():
    mock_conn = AsyncMock()
    mock_conn.fetchval.return_value = 1

    mock_cm = AsyncMock()
    mock_cm.__aenter__.return_value = mock_conn
    mock_cm.__aexit__.return_value = False

    mock_pool = MagicMock()
    mock_pool.acquire.return_value = mock_cm

    with patch("src.main.get_pool", AsyncMock(return_value=mock_pool)):
        response = client.get("/health")

    assert response.status_code == 200
    assert response.json() == {"status": "ok", "db": "ok"}


def test_health_db_ko_when_pool_raises():
    with patch("src.main.get_pool", AsyncMock(side_effect=Exception("connection refused"))):
        response = client.get("/health")

    assert response.status_code == 200
    assert response.json() == {"status": "ok", "db": "ko"}
