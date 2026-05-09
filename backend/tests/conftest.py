import pytest
from unittest.mock import AsyncMock, patch


@pytest.fixture(autouse=True)
def mock_db_init():
    # Empêche le lifespan de tenter une vraie connexion DB pendant les tests
    with patch("src.main.init_db", new_callable=AsyncMock):
        yield
