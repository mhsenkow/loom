"""
Provider manager — registry for all AI providers (local Ollama + cloud).

Handles:
  - Loading / saving API keys from disk (backend/data/cloud_providers.json)
  - Routing chat requests to the correct provider based on model prefix
  - Providing a unified model listing
"""

import json
import os
from pathlib import Path
from typing import AsyncGenerator, Optional

from app.services.cloud_provider import ALL_PROVIDERS, CloudProvider
from app.services.ollama_client import ollama_client


# Where API keys are persisted (lives next to the SQLite DBs in backend/data/)
_DATA_DIR = Path(__file__).resolve().parent.parent.parent / "data"
_KEYS_FILE = _DATA_DIR / "cloud_providers.json"


class ProviderManager:
    """Central registry for all AI providers."""

    def __init__(self):
        self._providers: dict[str, CloudProvider] = {}
        self._load_keys()

    # ------------------------------------------------------------------
    # Key persistence
    # ------------------------------------------------------------------

    def _load_keys(self):
        """Load saved API keys and instantiate providers."""
        saved: dict[str, str] = {}
        if _KEYS_FILE.exists():
            try:
                saved = json.loads(_KEYS_FILE.read_text())
            except Exception:
                saved = {}

        for name, cls in ALL_PROVIDERS.items():
            key = saved.get(name)
            self._providers[name] = cls(api_key=key)

    def _save_keys(self):
        """Persist current API keys to disk."""
        _DATA_DIR.mkdir(parents=True, exist_ok=True)
        keys = {}
        for name, prov in self._providers.items():
            if prov._api_key:
                keys[name] = prov._api_key
        _KEYS_FILE.write_text(json.dumps(keys, indent=2))

    # ------------------------------------------------------------------
    # Provider management
    # ------------------------------------------------------------------

    def get_provider(self, name: str) -> Optional[CloudProvider]:
        return self._providers.get(name)

    def list_providers(self) -> list[dict]:
        """Return metadata for every cloud provider."""
        result = []
        for name, prov in self._providers.items():
            result.append({
                "name": prov.name,
                "display_name": prov.display_name,
                "connected": prov.is_connected,
                "key_url": prov.key_url,
                "key_hint": prov.key_hint,
            })
        return result

    async def connect_provider(self, name: str, api_key: str) -> bool:
        """Set an API key and validate it. Returns True if valid."""
        prov = self._providers.get(name)
        if not prov:
            return False
        prov.set_api_key(api_key)
        valid = await prov.validate_key()
        if valid:
            self._save_keys()
        else:
            prov.clear_api_key()
        return valid

    def disconnect_provider(self, name: str) -> bool:
        prov = self._providers.get(name)
        if not prov:
            return False
        prov.clear_api_key()
        self._save_keys()
        return True

    # ------------------------------------------------------------------
    # Unified model listing
    # ------------------------------------------------------------------

    async def list_all_models(self) -> list[dict]:
        """Return a unified list of models from all sources (local + cloud)."""
        models = []

        # Local Ollama models
        try:
            ollama_models = await ollama_client.list_models()
            for m in ollama_models:
                name = m if isinstance(m, str) else m.get("name", "")
                if not name or "embed" in name.lower():
                    continue
                models.append({
                    "id": name,  # bare name = Ollama
                    "name": name,
                    "display_name": name,
                    "provider": "ollama",
                    "provider_type": "local",
                })
        except Exception:
            pass

        # Cloud providers
        for prov_name, prov in self._providers.items():
            if not prov.is_connected:
                continue
            try:
                prov_models = await prov.list_models()
                for m in prov_models:
                    models.append({
                        "id": f"{prov_name}:{m['name']}",
                        "name": m["name"],
                        "display_name": m.get("display_name", m["name"]),
                        "provider": prov_name,
                        "provider_type": "cloud",
                        "context_window": m.get("context_window"),
                    })
            except Exception:
                pass

        return models

    # ------------------------------------------------------------------
    # Routing chat to the right provider
    # ------------------------------------------------------------------

    def _parse_model_id(self, model_id: str) -> tuple[str, str]:
        """
        Parse a model identifier into (provider, model_name).

        Examples:
            "openai:gpt-4o"          -> ("openai", "gpt-4o")
            "anthropic:claude-sonnet-4-20250514" -> ("anthropic", "claude-sonnet-4-20250514")
            "llama3.1:8b"            -> ("ollama", "llama3.1:8b")
            "gemini:gemini-2.0-flash" -> ("gemini", "gemini-2.0-flash")
        """
        # Check for cloud provider prefix
        for prefix in ALL_PROVIDERS:
            if model_id.startswith(f"{prefix}:"):
                return prefix, model_id[len(prefix) + 1:]
        # No recognized prefix → Ollama
        return "ollama", model_id

    async def chat(
        self,
        prompt: str,
        model_id: str,
        system_prompt: Optional[str] = None,
    ) -> str:
        provider, model_name = self._parse_model_id(model_id)

        if provider == "ollama":
            return await ollama_client.chat(prompt, model=model_name, system_prompt=system_prompt)

        prov = self._providers.get(provider)
        if not prov or not prov.is_connected:
            raise RuntimeError(f"Provider '{provider}' is not connected. Set up your API key first.")
        return await prov.chat(prompt, model_name, system_prompt=system_prompt)

    async def stream_chat(
        self,
        prompt: str,
        model_id: str,
        system_prompt: Optional[str] = None,
    ) -> AsyncGenerator[str, None]:
        provider, model_name = self._parse_model_id(model_id)

        if provider == "ollama":
            async for chunk in ollama_client.stream_chat(prompt, model=model_name, system_prompt=system_prompt):
                yield chunk
            return

        prov = self._providers.get(provider)
        if not prov or not prov.is_connected:
            raise RuntimeError(f"Provider '{provider}' is not connected. Set up your API key first.")
        async for chunk in prov.stream_chat(prompt, model_name, system_prompt=system_prompt):
            yield chunk


# Singleton
provider_manager = ProviderManager()
