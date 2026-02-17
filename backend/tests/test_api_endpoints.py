"""Integration tests for key backend API endpoints.

Uses FastAPI TestClient with mocked Ollama to test /health and /api/models
without needing a running Ollama or external services.
"""
import sys
import os
import pytest
from unittest.mock import AsyncMock, patch

sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))


@pytest.fixture
def test_client():
    """Create an httpx AsyncClient wrapping the FastAPI app."""
    from httpx import AsyncClient, ASGITransport
    from app.main import app
    transport = ASGITransport(app=app)
    return AsyncClient(transport=transport, base_url="http://test")


@pytest.mark.asyncio
async def test_health_endpoint(test_client):
    """GET /health returns a healthy status."""
    response = await test_client.get("/health")
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "healthy"
    assert "ollama" in data
    assert "memory" in data


@pytest.mark.asyncio
async def test_models_endpoint(test_client):
    """GET /api/models returns a models list with mocked ollama."""
    mock_models = [
        {"name": "llama3.1:8b", "size": 4000000000, "modified_at": "2024-01-01T00:00:00Z"},
        {"name": "tinyllama:latest", "size": 1000000000, "modified_at": "2024-01-01T00:00:00Z"},
    ]
    # Patch where ollama_client is used (app.main), not where it's defined
    with patch("app.main.ollama_client") as mock_ollama:
        mock_ollama.list_models = AsyncMock(return_value=mock_models)
        response = await test_client.get("/api/models")

    assert response.status_code == 200
    data = response.json()
    assert "models" in data
    assert len(data["models"]) == 2
    assert data["models"][0]["name"] == "llama3.1:8b"


@pytest.mark.asyncio
async def test_models_endpoint_handles_ollama_error(test_client):
    """GET /api/models returns empty list when Ollama is unavailable."""
    with patch("app.main.ollama_client") as mock_ollama:
        mock_ollama.list_models = AsyncMock(side_effect=Exception("Connection refused"))
        response = await test_client.get("/api/models")

    assert response.status_code == 200
    data = response.json()
    assert data["models"] == []
    assert "error" in data
