"""
Provider manager — registry for all AI providers (local Ollama + cloud).

Handles:
  - Loading / saving API keys from disk (backend/data/cloud_providers.json)
  - Routing chat requests to the correct provider based on model prefix
  - Providing a unified model listing
"""

import json
from pathlib import Path
from typing import AsyncGenerator, Optional

from app.services.cloud_provider import ALL_PROVIDERS, CloudProvider
from app.services.ollama_client import ollama_client


# Where API keys are persisted (lives next to the SQLite DBs in backend/data/)
_DATA_DIR = Path(__file__).resolve().parent.parent.parent / "data"
_KEYS_FILE = _DATA_DIR / "cloud_providers.json"
_CHAT_MODEL_EXCLUDE_KEYWORDS = (
    "embed",
    "flux",
    "sdxl",
    "stable-diffusion",
    "vision",
    "llava",
    "bakllava",
    "moondream",
)
_QUICK_HINTS = ("flash", "nano", "mini", "haiku", "small", "tiny", ":free")


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
                "supports_chat": bool(getattr(prov, "supports_chat", True)),
                "supports_quick": bool(getattr(prov, "supports_quick", True)),
                "free_tier_available": bool(getattr(prov, "free_tier_available", False)),
                "notes": str(getattr(prov, "notes", "") or ""),
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
                size_bytes = 0
                if isinstance(m, dict):
                    size_bytes = int(m.get("size") or 0)
                size_gb = (size_bytes / (1024 ** 3)) if size_bytes > 0 else 0
                models.append({
                    "id": name,  # bare name = Ollama
                    "name": name,
                    "display_name": name,
                    "provider": "ollama",
                    "provider_type": "local",
                    "supports_quick": True,
                    "is_free": True,
                    "cost_tier": "free",
                    "size_gb": size_gb,
                })
        except Exception:
            pass

        # Cloud providers
        for prov_name, prov in self._providers.items():
            if not prov.is_connected or not getattr(prov, "supports_chat", True):
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
                        "is_free": bool(m.get("is_free", False)),
                        "cost_tier": m.get("cost_tier"),
                        "supports_quick": bool(m.get("supports_quick", getattr(prov, "supports_quick", True))),
                        "provider_free_tier_available": bool(getattr(prov, "free_tier_available", False)),
                    })
            except Exception:
                pass

        return models

    def _is_likely_chat_model(self, model_name: str) -> bool:
        lower = model_name.lower()
        return not any(keyword in lower for keyword in _CHAT_MODEL_EXCLUDE_KEYWORDS)

    def _cost_tier_score(self, tier: Optional[str]) -> float:
        normalized = str(tier or "").strip().lower()
        if normalized == "free":
            return 0.36
        if normalized == "economy":
            return 0.22
        if normalized == "standard":
            return 0.08
        if normalized == "premium":
            return -0.08
        return 0.0

    def _quick_cloud_score(self, model: dict) -> float:
        model_text = f"{model.get('id', '')} {model.get('name', '')}".lower()
        score = 0.52

        if model.get("is_free"):
            score += 0.34
        if model.get("provider_free_tier_available"):
            score += 0.06

        score += self._cost_tier_score(model.get("cost_tier"))

        if any(hint in model_text for hint in _QUICK_HINTS):
            score += 0.20
        if "reason" in model_text or "pro" in model_text:
            score -= 0.14

        return score

    def _quick_local_score(self, model: dict, active_model: Optional[str]) -> float:
        model_id = str(model.get("id") or model.get("name") or "")
        model_text = model_id.lower()
        score = 0.40

        if any(hint in model_text for hint in _QUICK_HINTS):
            score += 0.24
        if active_model and model_id == active_model:
            score += 0.12

        size_gb = float(model.get("size_gb") or 0)
        if size_gb > 0:
            score -= min(0.25, size_gb * 0.035)
        return score

    def _pick_quick_from_catalog(self, models: list[dict], active_model: Optional[str] = None) -> dict:
        chat_models = [m for m in models if self._is_likely_chat_model(str(m.get("name") or m.get("id") or ""))]

        cloud_candidates = [
            m for m in chat_models
            if str(m.get("provider_type") or "") == "cloud" and bool(m.get("supports_quick", True))
        ]
        if cloud_candidates:
            scored = sorted(
                cloud_candidates,
                key=lambda m: self._quick_cloud_score(m),
                reverse=True,
            )
            best = scored[0]
            reason_bits = []
            if best.get("is_free"):
                reason_bits.append("free-tier")
            elif best.get("cost_tier"):
                reason_bits.append(str(best.get("cost_tier")))
            if any(hint in str(best.get("id", "")).lower() for hint in _QUICK_HINTS):
                reason_bits.append("fast-family")
            reason = " + ".join(reason_bits) if reason_bits else "cloud quick candidate"
            return {
                "model": best["id"],
                "provider_type": "cloud",
                "provider": best.get("provider"),
                "reason": reason,
            }

        local_candidates = [m for m in chat_models if str(m.get("provider_type") or "local") == "local"]
        if local_candidates:
            scored = sorted(
                local_candidates,
                key=lambda m: self._quick_local_score(m, active_model),
                reverse=True,
            )
            best = scored[0]
            return {
                "model": best["id"],
                "provider_type": "local",
                "provider": "ollama",
                "reason": "tiny/fast local fallback",
            }

        fallback = active_model or "llama3.1:8b"
        return {
            "model": fallback,
            "provider_type": "local",
            "provider": "ollama",
            "reason": "default fallback",
        }

    async def suggest_quick_model(self, active_model: Optional[str] = None) -> dict:
        """Pick a fast and low-cost model for non-critical prompts."""
        models = await self.list_all_models()
        return self._pick_quick_from_catalog(models, active_model=active_model)

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
        if not getattr(prov, "supports_chat", True):
            raise RuntimeError(
                f"Provider '{provider}' is connected, but direct chat is not supported in Loom for this provider."
            )
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
        if not getattr(prov, "supports_chat", True):
            raise RuntimeError(
                f"Provider '{provider}' is connected, but direct chat is not supported in Loom for this provider."
            )
        async for chunk in prov.stream_chat(prompt, model_name, system_prompt=system_prompt):
            yield chunk


# Singleton
provider_manager = ProviderManager()
