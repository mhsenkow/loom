from unittest.mock import AsyncMock

import pytest

from app.services.provider_manager import ProviderManager


def test_pick_quick_from_catalog_prefers_free_cloud():
    manager = ProviderManager()
    catalog = [
        {
            "id": "llama3.1:8b",
            "name": "llama3.1:8b",
            "provider_type": "local",
            "supports_quick": True,
            "size_gb": 4.6,
        },
        {
            "id": "openrouter:meta-llama/llama-3.1-8b-instruct:free",
            "name": "meta-llama/llama-3.1-8b-instruct:free",
            "provider": "openrouter",
            "provider_type": "cloud",
            "supports_quick": True,
            "is_free": True,
            "cost_tier": "free",
        },
        {
            "id": "openai:gpt-4o",
            "name": "gpt-4o",
            "provider": "openai",
            "provider_type": "cloud",
            "supports_quick": True,
            "is_free": False,
            "cost_tier": "premium",
        },
    ]

    picked = manager._pick_quick_from_catalog(catalog)
    assert picked["provider_type"] == "cloud"
    assert picked["provider"] == "openrouter"
    assert "free" in picked["reason"]


@pytest.mark.asyncio
async def test_suggest_quick_model_falls_back_to_local_active(monkeypatch):
    manager = ProviderManager()
    monkeypatch.setattr(
        manager,
        "list_all_models",
        AsyncMock(
            return_value=[
                {
                    "id": "tinyllama",
                    "name": "tinyllama",
                    "provider_type": "local",
                    "supports_quick": True,
                    "size_gb": 0.6,
                },
                {
                    "id": "llama3.1:8b",
                    "name": "llama3.1:8b",
                    "provider_type": "local",
                    "supports_quick": True,
                    "size_gb": 4.6,
                },
            ]
        ),
    )

    picked = await manager.suggest_quick_model(active_model="tinyllama")
    assert picked["provider_type"] == "local"
    assert picked["model"] == "tinyllama"


@pytest.mark.asyncio
async def test_resolve_model_target_prefers_local_ollama_name(monkeypatch):
    manager = ProviderManager()
    monkeypatch.setattr(
        "app.services.provider_manager.ollama_client.list_models",
        AsyncMock(return_value=[{"name": "mistral:latest"}]),
    )

    provider, model = await manager.resolve_model_target("mistral:latest")
    assert provider == "ollama"
    assert model == "mistral:latest"


@pytest.mark.asyncio
async def test_resolve_model_target_normalizes_mistral_alias(monkeypatch):
    manager = ProviderManager()
    monkeypatch.setattr(
        "app.services.provider_manager.ollama_client.list_models",
        AsyncMock(return_value=[]),
    )

    provider, model = await manager.resolve_model_target("mistral:latest")
    assert provider == "mistral"
    assert model == "mistral-small-latest"
