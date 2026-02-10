"""
REST endpoints for managing cloud AI providers.
"""

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from app.services.provider_manager import provider_manager

router = APIRouter()


class ConnectRequest(BaseModel):
    api_key: str


# ------------------------------------------------------------------
# Provider listing
# ------------------------------------------------------------------


@router.get("/")
async def list_providers():
    """List all cloud providers and their connection status."""
    return {"providers": provider_manager.list_providers()}


# ------------------------------------------------------------------
# Provider models
# ------------------------------------------------------------------


@router.get("/{name}/models")
async def provider_models(name: str):
    """List available models for a specific provider."""
    prov = provider_manager.get_provider(name)
    if not prov:
        raise HTTPException(status_code=404, detail=f"Unknown provider: {name}")
    if not prov.is_connected:
        raise HTTPException(status_code=400, detail=f"Provider {name} is not connected")
    try:
        models = await prov.list_models()
        return {"provider": name, "models": models}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# ------------------------------------------------------------------
# Connect / disconnect
# ------------------------------------------------------------------


@router.post("/{name}/connect")
async def connect_provider(name: str, req: ConnectRequest):
    """Save an API key and validate the connection."""
    prov = provider_manager.get_provider(name)
    if not prov:
        raise HTTPException(status_code=404, detail=f"Unknown provider: {name}")

    valid = await provider_manager.connect_provider(name, req.api_key)
    if not valid:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid API key for {prov.display_name}. Please check the key and try again.",
        )
    return {"status": "connected", "provider": name, "display_name": prov.display_name}


@router.delete("/{name}/disconnect")
async def disconnect_provider(name: str):
    """Remove an API key."""
    ok = provider_manager.disconnect_provider(name)
    if not ok:
        raise HTTPException(status_code=404, detail=f"Unknown provider: {name}")
    return {"status": "disconnected", "provider": name}


# ------------------------------------------------------------------
# Unified model list (all providers)
# ------------------------------------------------------------------


@router.get("/models/all")
async def all_models():
    """Return a unified list of models from local (Ollama) + all connected cloud providers."""
    models = await provider_manager.list_all_models()
    return {"models": models}
