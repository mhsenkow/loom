"""
Cloud AI provider abstraction layer.

Provides a unified interface for cloud AI providers (OpenAI, Anthropic, Gemini,
Mistral, DeepSeek) alongside the existing local Ollama integration.
"""

from abc import ABC, abstractmethod
import inspect
from typing import Any, AsyncGenerator, Optional


class CloudProvider(ABC):
    """Base class for cloud AI providers."""

    name: str  # "openai", "anthropic", "gemini", "mistral", "deepseek"
    display_name: str  # "OpenAI (ChatGPT)", etc.
    key_url: str  # URL where users get their API key
    key_hint: str  # Placeholder text for the key input
    supports_chat: bool = True
    supports_quick: bool = True
    free_tier_available: bool = False
    notes: str = ""

    def __init__(self, api_key: Optional[str] = None):
        self._api_key = api_key
        self._client = None

    @property
    def is_connected(self) -> bool:
        return self._api_key is not None and len(self._api_key) > 0

    def set_api_key(self, api_key: str):
        self._api_key = api_key
        self._client = None  # Force re-init

    def clear_api_key(self):
        self._api_key = None
        self._client = None

    @abstractmethod
    async def validate_key(self) -> bool:
        """Quick validation that the API key works."""
        ...

    @abstractmethod
    async def list_models(self) -> list[dict]:
        """List available models. Returns [{name, display_name, context_window}]."""
        ...

    @abstractmethod
    async def chat(
        self,
        prompt: str,
        model: str,
        system_prompt: Optional[str] = None,
    ) -> str:
        """Send a chat message and get a complete response."""
        ...

    @abstractmethod
    async def stream_chat(
        self,
        prompt: str,
        model: str,
        system_prompt: Optional[str] = None,
    ) -> AsyncGenerator[str, None]:
        """Stream a chat response token by token."""
        ...

    def _chat_not_supported_message(self) -> str:
        display = self.display_name or self.name
        return f"{display} is integrated as a jobs/device-cloud provider and does not support direct chat completions in Loom yet."

    async def _unsupported_chat(self) -> str:
        raise RuntimeError(self._chat_not_supported_message())

    async def _unsupported_stream_chat(self) -> AsyncGenerator[str, None]:
        # This keeps the function an async generator while still surfacing the same error.
        raise RuntimeError(self._chat_not_supported_message())
        if False:
            yield ""


# ---------------------------------------------------------------------------
# OpenAI Provider
# ---------------------------------------------------------------------------


class OpenAIProvider(CloudProvider):
    name = "openai"
    display_name = "OpenAI (ChatGPT)"
    key_url = "https://platform.openai.com/api-keys"
    key_hint = "sk-..."

    CURATED_MODELS = [
        {"name": "gpt-4o", "display_name": "GPT-4o", "context_window": 128000, "cost_tier": "premium"},
        {"name": "gpt-4o-mini", "display_name": "GPT-4o Mini", "context_window": 128000, "cost_tier": "economy"},
        {"name": "gpt-4.1", "display_name": "GPT-4.1", "context_window": 1047576, "cost_tier": "premium"},
        {"name": "gpt-4.1-mini", "display_name": "GPT-4.1 Mini", "context_window": 1047576, "cost_tier": "economy"},
        {"name": "gpt-4.1-nano", "display_name": "GPT-4.1 Nano", "context_window": 1047576, "cost_tier": "economy"},
        {"name": "o3-mini", "display_name": "o3-mini (Reasoning)", "context_window": 200000, "cost_tier": "economy"},
    ]

    def _get_client(self):
        if self._client is None:
            from openai import AsyncOpenAI
            self._client = AsyncOpenAI(api_key=self._api_key)
        return self._client

    async def validate_key(self) -> bool:
        try:
            client = self._get_client()
            await client.models.list()
            return True
        except Exception:
            self._client = None
            return False

    async def list_models(self) -> list[dict]:
        return self.CURATED_MODELS

    async def chat(self, prompt: str, model: str, system_prompt: Optional[str] = None) -> str:
        client = self._get_client()
        messages = []
        if system_prompt:
            messages.append({"role": "system", "content": system_prompt})
        messages.append({"role": "user", "content": prompt})

        response = await client.chat.completions.create(
            model=model,
            messages=messages,
        )
        return response.choices[0].message.content or ""

    async def stream_chat(self, prompt: str, model: str, system_prompt: Optional[str] = None) -> AsyncGenerator[str, None]:
        client = self._get_client()
        messages = []
        if system_prompt:
            messages.append({"role": "system", "content": system_prompt})
        messages.append({"role": "user", "content": prompt})

        stream = await client.chat.completions.create(
            model=model,
            messages=messages,
            stream=True,
        )
        async for chunk in stream:
            delta = chunk.choices[0].delta if chunk.choices else None
            if delta and delta.content:
                yield delta.content


# ---------------------------------------------------------------------------
# Anthropic Provider
# ---------------------------------------------------------------------------


class AnthropicProvider(CloudProvider):
    name = "anthropic"
    display_name = "Anthropic (Claude)"
    key_url = "https://console.anthropic.com/settings/keys"
    key_hint = "sk-ant-..."

    CURATED_MODELS = [
        {"name": "claude-sonnet-4-20250514", "display_name": "Claude Sonnet 4", "context_window": 200000, "cost_tier": "premium"},
        {"name": "claude-3-5-haiku-20241022", "display_name": "Claude 3.5 Haiku", "context_window": 200000, "cost_tier": "economy"},
        {"name": "claude-3-5-sonnet-20241022", "display_name": "Claude 3.5 Sonnet", "context_window": 200000, "cost_tier": "premium"},
    ]

    def _get_client(self):
        if self._client is None:
            from anthropic import AsyncAnthropic
            self._client = AsyncAnthropic(api_key=self._api_key)
        return self._client

    async def validate_key(self) -> bool:
        try:
            client = self._get_client()
            # Quick validation: send a tiny message
            await client.messages.create(
                model="claude-3-5-haiku-20241022",
                max_tokens=5,
                messages=[{"role": "user", "content": "hi"}],
            )
            return True
        except Exception:
            self._client = None
            return False

    async def list_models(self) -> list[dict]:
        return self.CURATED_MODELS

    async def chat(self, prompt: str, model: str, system_prompt: Optional[str] = None) -> str:
        client = self._get_client()
        kwargs = {
            "model": model,
            "max_tokens": 8192,
            "messages": [{"role": "user", "content": prompt}],
        }
        if system_prompt:
            kwargs["system"] = system_prompt

        response = await client.messages.create(**kwargs)
        return response.content[0].text if response.content else ""

    async def stream_chat(self, prompt: str, model: str, system_prompt: Optional[str] = None) -> AsyncGenerator[str, None]:
        client = self._get_client()
        kwargs = {
            "model": model,
            "max_tokens": 8192,
            "messages": [{"role": "user", "content": prompt}],
            "stream": True,
        }
        if system_prompt:
            kwargs["system"] = system_prompt

        async with client.messages.stream(**kwargs) as stream:
            async for text in stream.text_stream:
                yield text


# ---------------------------------------------------------------------------
# Google Gemini Provider
# ---------------------------------------------------------------------------


class GeminiProvider(CloudProvider):
    name = "gemini"
    display_name = "Google Gemini"
    key_url = "https://aistudio.google.com/apikey"
    key_hint = "AIza..."

    free_tier_available = True
    CURATED_MODELS = [
        {"name": "gemini-2.0-flash", "display_name": "Gemini 2.0 Flash", "context_window": 1048576, "is_free": True, "cost_tier": "free"},
        {"name": "gemini-2.5-flash-preview-05-20", "display_name": "Gemini 2.5 Flash", "context_window": 1048576, "is_free": True, "cost_tier": "free"},
        {"name": "gemini-2.5-pro-preview-05-06", "display_name": "Gemini 2.5 Pro", "context_window": 1048576, "cost_tier": "premium"},
    ]

    def _get_client(self):
        if self._client is None:
            from google import genai
            self._client = genai.Client(api_key=self._api_key)
        return self._client

    async def validate_key(self) -> bool:
        try:
            client = self._get_client()
            # List models to validate key
            models = []
            for m in client.models.list():
                models.append(m)
                if len(models) >= 1:
                    break
            return len(models) > 0
        except Exception:
            self._client = None
            return False

    async def list_models(self) -> list[dict]:
        return self.CURATED_MODELS

    async def chat(self, prompt: str, model: str, system_prompt: Optional[str] = None) -> str:
        client = self._get_client()
        config = {}
        if system_prompt:
            config["system_instruction"] = system_prompt

        response = client.models.generate_content(
            model=model,
            contents=prompt,
            config=config if config else None,
        )
        return response.text or ""

    async def stream_chat(self, prompt: str, model: str, system_prompt: Optional[str] = None) -> AsyncGenerator[str, None]:
        client = self._get_client()
        config = {}
        if system_prompt:
            config["system_instruction"] = system_prompt

        # google-genai uses sync streaming; run in executor for async compat
        import asyncio
        loop = asyncio.get_event_loop()

        response = client.models.generate_content_stream(
            model=model,
            contents=prompt,
            config=config if config else None,
        )
        for chunk in response:
            if chunk.text:
                yield chunk.text


# ---------------------------------------------------------------------------
# Mistral Provider
# ---------------------------------------------------------------------------


class MistralProvider(CloudProvider):
    name = "mistral"
    display_name = "Mistral AI"
    key_url = "https://console.mistral.ai/api-keys"
    key_hint = "..."

    CURATED_MODELS = [
        {"name": "mistral-large-latest", "display_name": "Mistral Large", "context_window": 128000, "cost_tier": "premium"},
        {"name": "mistral-medium-latest", "display_name": "Mistral Medium", "context_window": 128000, "cost_tier": "standard"},
        {"name": "mistral-small-latest", "display_name": "Mistral Small", "context_window": 128000, "cost_tier": "economy"},
        {"name": "codestral-latest", "display_name": "Codestral", "context_window": 256000, "cost_tier": "economy"},
    ]
    _TASK_AGENT_HINTS = {
        "code": "You are handling a coding-heavy request. Prioritize actionable implementation details and concrete fixes.",
        "research": "You are handling a research-heavy request. Focus on synthesis, open questions, and clear next actions.",
        "planning": "You are handling a planning-heavy request. Respond with prioritized steps and risk-aware sequencing.",
        "clarify": "You are handling an ambiguous request. Ask one concise clarifying question if required, otherwise proceed directly.",
        "general": "You are handling a general request. Be concise, practical, and useful.",
    }

    def _get_client(self):
        if self._client is None:
            from mistralai import Mistral
            self._client = Mistral(api_key=self._api_key)
        return self._client

    def set_api_key(self, api_key: str):
        super().set_api_key(api_key)
        setattr(self, "_agent_id_cache", {})

    def clear_api_key(self):
        super().clear_api_key()
        setattr(self, "_agent_id_cache", {})

    async def validate_key(self) -> bool:
        try:
            client = self._get_client()
            await client.models.list_async()
            return True
        except Exception:
            self._client = None
            return False

    async def list_models(self) -> list[dict]:
        return self.CURATED_MODELS

    async def chat(self, prompt: str, model: str, system_prompt: Optional[str] = None) -> str:
        client = self._get_client()
        messages = []
        if system_prompt:
            messages.append({"role": "system", "content": system_prompt})
        messages.append({"role": "user", "content": prompt})

        response = await client.chat.complete_async(
            model=model,
            messages=messages,
        )
        return response.choices[0].message.content or ""

    async def stream_chat(self, prompt: str, model: str, system_prompt: Optional[str] = None) -> AsyncGenerator[str, None]:
        client = self._get_client()
        messages = []
        if system_prompt:
            messages.append({"role": "system", "content": system_prompt})
        messages.append({"role": "user", "content": prompt})

        stream = await client.chat.stream_async(
            model=model,
            messages=messages,
        )
        async for event in stream:
            if event.data and event.data.choices:
                delta = event.data.choices[0].delta
                if delta and delta.content:
                    yield delta.content

    def _build_agent_instructions(self, task: str) -> str:
        task_hint = self._TASK_AGENT_HINTS.get(task, self._TASK_AGENT_HINTS["general"])
        return (
            "You are LOOM, a helpful assistant in a terminal UI.\n"
            "Return exactly one assistant reply to the latest user request.\n"
            "Never role-play both sides of a conversation.\n"
            f"{task_hint}"
        )

    async def _maybe_await(self, value: Any) -> Any:
        if inspect.isawaitable(value):
            return await value
        return value

    def _extract_agent_id(self, payload: Any) -> str:
        if payload is None:
            return ""
        if isinstance(payload, dict):
            if isinstance(payload.get("id"), str):
                return payload["id"]
            if isinstance(payload.get("agent_id"), str):
                return payload["agent_id"]
            agent_obj = payload.get("agent")
            if isinstance(agent_obj, dict):
                return str(agent_obj.get("id") or agent_obj.get("agent_id") or "")
        for attr in ("id", "agent_id"):
            value = getattr(payload, attr, None)
            if isinstance(value, str) and value.strip():
                return value.strip()
        nested = getattr(payload, "agent", None)
        if nested is not None:
            for attr in ("id", "agent_id"):
                value = getattr(nested, attr, None)
                if isinstance(value, str) and value.strip():
                    return value.strip()
        return ""

    def _extract_text_segments(self, payload: Any) -> list[str]:
        segments: list[str] = []
        seen_nodes: set[int] = set()

        def walk(node: Any):
            if node is None:
                return
            node_id = id(node)
            if node_id in seen_nodes:
                return
            seen_nodes.add(node_id)

            if isinstance(node, str):
                text = node.strip()
                if text:
                    segments.append(text)
                return

            if isinstance(node, (list, tuple)):
                for item in node:
                    walk(item)
                return

            if isinstance(node, dict):
                direct_text = node.get("text")
                if isinstance(direct_text, str) and direct_text.strip():
                    segments.append(direct_text.strip())
                direct_content = node.get("content")
                if isinstance(direct_content, str) and direct_content.strip():
                    segments.append(direct_content.strip())
                for key in ("outputs", "output", "messages", "message", "choices", "delta", "parts", "content", "data", "result"):
                    if key in node:
                        walk(node[key])
                return

            for attr in ("text", "content", "output_text", "outputs", "output", "messages", "message", "choices", "delta", "parts", "data", "result"):
                if hasattr(node, attr):
                    walk(getattr(node, attr))

        walk(payload)
        unique: list[str] = []
        seen_text: set[str] = set()
        for item in segments:
            key = item.strip()
            if not key or key in seen_text:
                continue
            seen_text.add(key)
            unique.append(key)
        return unique

    async def _create_or_reuse_agent(self, client: Any, model: str, task: str) -> str:
        cache = getattr(self, "_agent_id_cache", None)
        if not isinstance(cache, dict):
            cache = {}
            setattr(self, "_agent_id_cache", cache)

        cache_key = f"{model}::{task}"
        cached_id = str(cache.get(cache_key) or "").strip()
        if cached_id:
            return cached_id

        beta = getattr(client, "beta", None)
        agents_api = getattr(beta, "agents", None) if beta is not None else None
        if agents_api is None:
            raise RuntimeError("Mistral beta agents API is unavailable in this SDK version.")

        create_fn = getattr(agents_api, "create", None) or getattr(agents_api, "create_async", None)
        if not callable(create_fn):
            raise RuntimeError("Mistral beta agents.create API is unavailable.")

        payload = {
            "model": model,
            "name": f"loom-{task}",
            "instructions": self._build_agent_instructions(task),
        }
        created = await self._maybe_await(create_fn(**payload))
        agent_id = self._extract_agent_id(created)
        if not agent_id:
            raise RuntimeError("Mistral agent creation succeeded but no agent id was returned.")

        cache[cache_key] = agent_id
        return agent_id

    async def chat_with_agent(
        self,
        prompt: str,
        model: str,
        *,
        task: str = "general",
        system_prompt: Optional[str] = None,
    ) -> str:
        client = self._get_client()
        agent_id = await self._create_or_reuse_agent(client, model, task)

        beta = getattr(client, "beta", None)
        conversations_api = getattr(beta, "conversations", None) if beta is not None else None
        if conversations_api is None:
            raise RuntimeError("Mistral beta conversations API is unavailable in this SDK version.")

        start_fn = getattr(conversations_api, "start", None) or getattr(conversations_api, "create", None)
        if not callable(start_fn):
            raise RuntimeError("Mistral beta conversations.start API is unavailable.")

        payload_prompt = prompt
        if system_prompt:
            payload_prompt = f"[SYSTEM]\n{system_prompt}\n\n[USER]\n{prompt}"

        attempts = (
            {"agent_id": agent_id, "inputs": [{"role": "user", "content": payload_prompt}]},
            {"agent_id": agent_id, "input": payload_prompt},
            {"agent_id": agent_id, "messages": [{"role": "user", "content": payload_prompt}]},
        )

        last_error: Optional[Exception] = None
        for kwargs in attempts:
            try:
                response = await self._maybe_await(start_fn(**kwargs))
                text = "\n".join(self._extract_text_segments(response)).strip()
                if text:
                    return text
            except TypeError:
                # Method signature can vary across SDK versions.
                continue
            except Exception as exc:  # noqa: BLE001
                last_error = exc
                break

        if last_error is not None:
            raise last_error
        raise RuntimeError("Mistral agent conversation returned no text.")

    async def stream_chat_with_agent(
        self,
        prompt: str,
        model: str,
        *,
        task: str = "general",
        system_prompt: Optional[str] = None,
    ) -> AsyncGenerator[str, None]:
        text = await self.chat_with_agent(prompt, model, task=task, system_prompt=system_prompt)
        if not text:
            return
        chunk_size = 220
        for index in range(0, len(text), chunk_size):
            yield text[index:index + chunk_size]


# ---------------------------------------------------------------------------
# DeepSeek Provider (uses OpenAI-compatible API)
# ---------------------------------------------------------------------------


class DeepSeekProvider(CloudProvider):
    name = "deepseek"
    display_name = "DeepSeek"
    key_url = "https://platform.deepseek.com/api_keys"
    key_hint = "sk-..."

    CURATED_MODELS = [
        {"name": "deepseek-chat", "display_name": "DeepSeek V3", "context_window": 64000, "cost_tier": "economy"},
        {"name": "deepseek-reasoner", "display_name": "DeepSeek R1 (Reasoning)", "context_window": 64000, "cost_tier": "standard"},
    ]

    def _get_client(self):
        if self._client is None:
            from openai import AsyncOpenAI
            self._client = AsyncOpenAI(
                api_key=self._api_key,
                base_url="https://api.deepseek.com",
            )
        return self._client

    async def validate_key(self) -> bool:
        try:
            client = self._get_client()
            await client.models.list()
            return True
        except Exception:
            self._client = None
            return False

    async def list_models(self) -> list[dict]:
        return self.CURATED_MODELS

    async def chat(self, prompt: str, model: str, system_prompt: Optional[str] = None) -> str:
        client = self._get_client()
        messages = []
        if system_prompt:
            messages.append({"role": "system", "content": system_prompt})
        messages.append({"role": "user", "content": prompt})

        response = await client.chat.completions.create(
            model=model,
            messages=messages,
        )
        return response.choices[0].message.content or ""

    async def stream_chat(self, prompt: str, model: str, system_prompt: Optional[str] = None) -> AsyncGenerator[str, None]:
        client = self._get_client()
        messages = []
        if system_prompt:
            messages.append({"role": "system", "content": system_prompt})
        messages.append({"role": "user", "content": prompt})

        stream = await client.chat.completions.create(
            model=model,
            messages=messages,
            stream=True,
        )
        async for chunk in stream:
            delta = chunk.choices[0].delta if chunk.choices else None
            if delta and delta.content:
                yield delta.content


# ---------------------------------------------------------------------------
# OpenRouter Provider (OpenAI-compatible; includes free-tier models)
# ---------------------------------------------------------------------------


class OpenRouterProvider(CloudProvider):
    name = "openrouter"
    display_name = "OpenRouter"
    key_url = "https://openrouter.ai/keys"
    key_hint = "sk-or-v1-..."
    free_tier_available = True

    CURATED_FALLBACK_MODELS = [
        {
            "name": "google/gemini-2.0-flash-exp:free",
            "display_name": "Gemini 2.0 Flash (Free)",
            "is_free": True,
            "cost_tier": "free",
        },
        {
            "name": "meta-llama/llama-3.1-8b-instruct:free",
            "display_name": "Llama 3.1 8B Instruct (Free)",
            "is_free": True,
            "cost_tier": "free",
        },
        {
            "name": "qwen/qwen-2.5-7b-instruct:free",
            "display_name": "Qwen 2.5 7B Instruct (Free)",
            "is_free": True,
            "cost_tier": "free",
        },
    ]

    QUICK_HINTS = ("flash", "nano", "mini", "haiku", "small", ":free")

    def _get_client(self):
        if self._client is None:
            from openai import AsyncOpenAI

            self._client = AsyncOpenAI(
                api_key=self._api_key,
                base_url="https://openrouter.ai/api/v1",
                default_headers={"X-Title": "Loom"},
            )
        return self._client

    async def validate_key(self) -> bool:
        try:
            client = self._get_client()
            await client.models.list()
            return True
        except Exception:
            self._client = None
            return False

    async def list_models(self) -> list[dict]:
        try:
            client = self._get_client()
            response = await client.models.list()
            models: list[dict] = []
            seen: set[str] = set()
            for model in getattr(response, "data", []) or []:
                model_name = str(getattr(model, "id", "") or "").strip()
                if not model_name or model_name in seen:
                    continue
                seen.add(model_name)
                lower = model_name.lower()
                is_free = ":free" in lower or lower.endswith("-free")
                quick = any(hint in lower for hint in self.QUICK_HINTS)
                if not is_free and not quick:
                    continue
                models.append(
                    {
                        "name": model_name,
                        "display_name": model_name,
                        "context_window": getattr(model, "context_length", None),
                        "is_free": is_free,
                        "cost_tier": "free" if is_free else "economy",
                        "supports_quick": True,
                    }
                )

            if models:
                models.sort(
                    key=lambda m: (
                        0 if m.get("is_free") else 1,
                        0 if ":free" in str(m.get("name", "")).lower() else 1,
                        str(m.get("name", "")).lower(),
                    )
                )
                return models[:24]
        except Exception:
            pass

        return self.CURATED_FALLBACK_MODELS

    async def chat(self, prompt: str, model: str, system_prompt: Optional[str] = None) -> str:
        client = self._get_client()
        messages = []
        if system_prompt:
            messages.append({"role": "system", "content": system_prompt})
        messages.append({"role": "user", "content": prompt})

        response = await client.chat.completions.create(
            model=model,
            messages=messages,
        )
        return response.choices[0].message.content or ""

    async def stream_chat(self, prompt: str, model: str, system_prompt: Optional[str] = None) -> AsyncGenerator[str, None]:
        client = self._get_client()
        messages = []
        if system_prompt:
            messages.append({"role": "system", "content": system_prompt})
        messages.append({"role": "user", "content": prompt})

        stream = await client.chat.completions.create(
            model=model,
            messages=messages,
            stream=True,
        )
        async for chunk in stream:
            delta = chunk.choices[0].delta if chunk.choices else None
            if delta and delta.content:
                yield delta.content


# ---------------------------------------------------------------------------
# Qualcomm QDC (device cloud connector - no direct chat completions)
# ---------------------------------------------------------------------------


class QualcommQDCProvider(CloudProvider):
    name = "qdc"
    display_name = "Qualcomm QDC"
    key_url = "https://qdc.qualcomm.com/"
    key_hint = "QDC token"
    supports_chat = False
    supports_quick = False
    notes = "QDC is integrated as a device/job cloud target. Direct chat completions are not exposed in Loom yet."

    async def validate_key(self) -> bool:
        # Placeholder acceptance: token is stored for future QDC job APIs.
        return bool(self._api_key and str(self._api_key).strip())

    async def list_models(self) -> list[dict]:
        return []

    async def chat(self, prompt: str, model: str, system_prompt: Optional[str] = None) -> str:  # noqa: ARG002
        return await self._unsupported_chat()

    async def stream_chat(
        self,
        prompt: str,
        model: str,
        system_prompt: Optional[str] = None,  # noqa: ARG002
    ) -> AsyncGenerator[str, None]:
        async for chunk in self._unsupported_stream_chat():
            yield chunk


# ---------------------------------------------------------------------------
# Provider registry
# ---------------------------------------------------------------------------

ALL_PROVIDERS: dict[str, type[CloudProvider]] = {
    "openai": OpenAIProvider,
    "anthropic": AnthropicProvider,
    "gemini": GeminiProvider,
    "mistral": MistralProvider,
    "deepseek": DeepSeekProvider,
    "openrouter": OpenRouterProvider,
    "qdc": QualcommQDCProvider,
}
