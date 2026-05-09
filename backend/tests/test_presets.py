from unittest.mock import AsyncMock, MagicMock, patch

from fastapi.testclient import TestClient

from src.main import app

client = TestClient(app)

VALID_PARAMS = {
    "speed": 1.0,
    "turbulence": 0.3,
    "noiseScale": 1.2,
    "particleCount": 80000,
    "size": 1.5,
    "trailLength": 0.95,
    "bloomStrength": 1.0,
}

MOCK_ROW = {
    "id": "123e4567-e89b-12d3-a456-426614174000",
    "nom": "Test",
    "seed": 0,
    "params": VALID_PARAMS,
    "created_at": "2026-05-09T00:00:00",
}


def make_mock_pool():
    pool = MagicMock()
    pool.fetchrow = AsyncMock()
    pool.fetch = AsyncMock()
    pool.execute = AsyncMock()
    return pool


# ── POST /presets/ ────────────────────────────────────────────────────────────

def test_create_preset_returns_201():
    mock_pool = make_mock_pool()
    mock_pool.fetchrow.return_value = MOCK_ROW

    with patch("src.routes.presets.get_pool", AsyncMock(return_value=mock_pool)):
        response = client.post(
            "/presets/",
            json={"nom": "Test", "seed": 0, "params": VALID_PARAMS},
        )

    assert response.status_code == 201


def test_create_preset_empty_nom_returns_422():
    with patch("src.routes.presets.get_pool", AsyncMock(return_value=MagicMock())):
        response = client.post(
            "/presets/",
            json={"nom": "", "seed": 0, "params": VALID_PARAMS},
        )

    assert response.status_code == 422


def test_create_preset_speed_out_of_range_returns_422():
    bad_params = {**VALID_PARAMS, "speed": 999.0}

    with patch("src.routes.presets.get_pool", AsyncMock(return_value=MagicMock())):
        response = client.post(
            "/presets/",
            json={"nom": "Test", "seed": 0, "params": bad_params},
        )

    assert response.status_code == 422


def test_create_preset_missing_param_key_returns_422():
    incomplete = {k: v for k, v in VALID_PARAMS.items() if k != "bloomStrength"}

    with patch("src.routes.presets.get_pool", AsyncMock(return_value=MagicMock())):
        response = client.post(
            "/presets/",
            json={"nom": "Test", "seed": 0, "params": incomplete},
        )

    assert response.status_code == 422


def test_create_preset_particle_count_too_high_returns_422():
    bad_params = {**VALID_PARAMS, "particleCount": 999999}

    with patch("src.routes.presets.get_pool", AsyncMock(return_value=MagicMock())):
        response = client.post(
            "/presets/",
            json={"nom": "Test", "seed": 0, "params": bad_params},
        )

    assert response.status_code == 422


# ── GET /presets/ ─────────────────────────────────────────────────────────────

def test_list_presets_empty_returns_200():
    mock_pool = make_mock_pool()
    mock_pool.fetch.return_value = []

    with patch("src.routes.presets.get_pool", AsyncMock(return_value=mock_pool)):
        response = client.get("/presets/")

    assert response.status_code == 200
    assert response.json() == []


def test_list_presets_returns_items():
    mock_pool = make_mock_pool()
    mock_pool.fetch.return_value = [MOCK_ROW]

    with patch("src.routes.presets.get_pool", AsyncMock(return_value=mock_pool)):
        response = client.get("/presets/")

    assert response.status_code == 200
    data = response.json()
    assert len(data) == 1
    assert data[0]["nom"] == "Test"


# ── DELETE /presets/{id} ──────────────────────────────────────────────────────

def test_delete_preset_success_returns_204():
    mock_pool = make_mock_pool()
    mock_pool.execute.return_value = "DELETE 1"

    with patch("src.routes.presets.get_pool", AsyncMock(return_value=mock_pool)):
        response = client.delete("/presets/123e4567-e89b-12d3-a456-426614174000")

    assert response.status_code == 204


def test_delete_preset_not_found_returns_404():
    mock_pool = make_mock_pool()
    mock_pool.execute.return_value = "DELETE 0"

    with patch("src.routes.presets.get_pool", AsyncMock(return_value=mock_pool)):
        response = client.delete("/presets/123e4567-e89b-12d3-a456-426614174000")

    assert response.status_code == 404


def test_delete_preset_invalid_uuid_returns_422():
    with patch("src.routes.presets.get_pool", AsyncMock(return_value=MagicMock())):
        response = client.delete("/presets/not-a-uuid")

    assert response.status_code == 422
