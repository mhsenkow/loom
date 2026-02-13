
from typing import Any, Dict, Optional
import asyncio
import json
import re

from pydantic import BaseModel

from app.services.ollama_client import ollama_client
from app.services.provider_manager import provider_manager
from app.services.storage import get_circuits
from app.services.system_info import get_system_info


class OrchestratorSettings(BaseModel):
    weight_speed: float = 0.5
    weight_cost: float = 0.5
    weight_quality: float = 0.5
    auto_run_circuits: bool = False
    prefer_local: bool = True
    min_switch_delta: float = 0.12
    use_router_model: bool = True
    router_model: Optional[str] = None
    router_timeout_ms: int = 1400


class OrchestrationResult(BaseModel):
    action: str  # "chat" or "circuit"
    model_name: Optional[str] = None
    circuit_name: Optional[str] = None
    reasoning: str


class OrchestratorService:
    CODE_HINTS = (
        "code",
        "bug",
        "debug",
        "stack trace",
        "exception",
        "function",
        "refactor",
        "typescript",
        "javascript",
        "python",
        "sql",
        "api",
        "endpoint",
        "test",
        "compile",
        "repository",
        "regex",
    )
    REASONING_HINTS = (
        "analyze",
        "analysis",
        "tradeoff",
        "compare",
        "design",
        "architecture",
        "strategy",
        "plan",
        "evaluate",
        "why",
        "prove",
    )
    CREATIVE_HINTS = (
        "brainstorm",
        "story",
        "poem",
        "slogan",
        "name ideas",
        "creative",
    )
    FAST_HINTS = (
        "quick",
        "brief",
        "short answer",
        "one sentence",
        "tldr",
    )
    CODE_MODEL_HINTS = ("code", "coder", "codestral", "codellama", "deepseek", "phi")
    REASONING_MODEL_HINTS = ("reason", "o3", "r1", "70b", "large", "pro")
    FAST_MODEL_HINTS = ("mini", "nano", "flash", "haiku", "small", "tiny")
    ECONOMY_MODEL_HINTS = ("mini", "nano", "flash", "haiku", "small", "cheap")
    CREATIVE_MODEL_HINTS = ("sonnet", "opus", "gpt-4o", "llama", "mistral")
    ROUTER_MODEL_HINTS = (
        "tinyllama",
        "phi3:mini",
        "phi3",
        "gemma:2b",
        "gemma2:2b",
        "llama3.2:1b",
        "llama3.2:3b",
        "qwen2.5:1.5b",
        "qwen2.5:3b",
    )

    def __init__(self):
        self.settings = OrchestratorSettings()
        self.quality_tiers = {
            # Local
            "llama3.1:70b": 0.95,
            "llama3:70b": 0.95,
            "llama3.1:8b": 0.80,
            "mistral-nemo": 0.85,
            "mistral": 0.75,
            "gemma:2b": 0.60,
            "phi3:mini": 0.65,
            "tinyllama": 0.40,
            "codellama": 0.74,
            "codellama:7b": 0.74,
            # Cloud-ish / prefixed IDs
            "openai:gpt-4o": 0.94,
            "openai:gpt-4.1": 0.95,
            "openai:o3-mini": 0.90,
            "anthropic:claude-sonnet-4-20250514": 0.96,
            "anthropic:claude-3-5-haiku-20241022": 0.78,
            "gemini:gemini-2.5-pro-preview-05-06": 0.95,
            "gemini:gemini-2.5-flash-preview-05-20": 0.82,
            "mistral:codestral-latest": 0.84,
            "deepseek:deepseek-reasoner": 0.92,
            "deepseek:deepseek-chat": 0.82,
        }

    def update_settings(self, new_settings: Dict[str, Any]):
        """Update orchestrator weights and preferences."""
        self.settings = OrchestratorSettings(**new_settings)

    def get_settings(self) -> Dict[str, Any]:
        return self.settings.model_dump()

    def extract_latest_user_message(self, user_message: str) -> str:
        """
        Extract the most recent user utterance from an enhanced prompt payload.
        Falls back to the original text when no structured markers are found.
        """
        if not user_message:
            return ""

        user_matches = re.findall(r"(?im)^User:\s*(.+)$", user_message)
        if user_matches:
            return user_matches[-1].strip()

        question_matches = re.findall(r"(?is)User Question:\s*(.+)$", user_message)
        if question_matches:
            return question_matches[-1].strip()

        latest_matches = re.findall(
            r"(?is)Latest User Message:\s*(.+?)(?:\n\s*Assistant Reply:|\Z)",
            user_message,
        )
        if latest_matches:
            return latest_matches[-1].strip()

        return user_message.strip()

    def _infer_prompt_profile(self, user_message: str) -> Dict[str, Any]:
        focus_message = self.extract_latest_user_message(user_message)
        lower = focus_message.lower()

        word_count = len(re.findall(r"\b[\w'-]+\b", focus_message))
        code_hits = sum(1 for hint in self.CODE_HINTS if hint in lower)
        reasoning_hits = sum(1 for hint in self.REASONING_HINTS if hint in lower)
        creative_hits = sum(1 for hint in self.CREATIVE_HINTS if hint in lower)
        fast_hits = sum(1 for hint in self.FAST_HINTS if hint in lower)
        has_code_block = "```" in user_message or "```" in focus_message
        has_conversation_context = "previous conversation:" in user_message.lower()

        if has_code_block:
            code_hits += 2

        complexity = min(
            1.0,
            (word_count / 100.0)
            + (0.20 if reasoning_hits > 0 else 0.0)
            + (0.08 if has_conversation_context else 0.0),
        )

        task = "general"
        if code_hits >= max(2, reasoning_hits):
            task = "code"
        elif reasoning_hits >= 2 or (word_count > 55 and fast_hits == 0):
            task = "reasoning"
        elif creative_hits > 0:
            task = "creative"
        elif word_count <= 14 or fast_hits > 0:
            task = "fast"

        signal_strength = min(
            0.7,
            0.20
            + (0.13 * min(code_hits, 3))
            + (0.11 * min(reasoning_hits, 3))
            + (0.08 * min(creative_hits, 2))
            + (0.07 * min(fast_hits, 2)),
        )

        return {
            "task": task,
            "focus_message": focus_message,
            "word_count": word_count,
            "complexity": complexity,
            "signal_strength": signal_strength,
        }

    def _pick_router_model(self, candidates: list[Dict[str, Any]]) -> Optional[str]:
        configured = (self.settings.router_model or "").strip()
        local_candidates = [
            model for model in candidates
            if str(model.get("provider_type") or "local") == "local"
        ]
        if not local_candidates:
            return None

        if configured:
            for model in local_candidates:
                if model.get("id") == configured or model.get("name") == configured:
                    return str(model.get("id") or model.get("name"))

        # Prefer explicitly small/fast families first.
        model_text_map = []
        for model in local_candidates:
            model_text = f"{model.get('id', '')} {model.get('name', '')}".lower()
            model_text_map.append((model, model_text))
        for model, model_text in model_text_map:
            if any(hint in model_text for hint in self.ROUTER_MODEL_HINTS):
                return str(model.get("id") or model.get("name"))

        # Fallback to the smallest local model.
        smallest = sorted(local_candidates, key=lambda m: float(m.get("size_gb") or 0.0))
        if smallest:
            smallest_size = float(smallest[0].get("size_gb") or 0.0)
            # Don't use a heavy model as the router unless explicitly configured.
            if smallest_size <= 4.0 or smallest_size == 0.0:
                return str(smallest[0].get("id") or smallest[0].get("name"))
        return None

    def _parse_router_json(self, text: str) -> Optional[Dict[str, Any]]:
        if not text:
            return None
        candidate = text.strip()
        try:
            parsed = json.loads(candidate)
            return parsed if isinstance(parsed, dict) else None
        except Exception:
            pass

        # Attempt to recover JSON object from mixed output.
        match = re.search(r"\{[\s\S]*\}", text)
        if not match:
            return None
        try:
            parsed = json.loads(match.group(0))
            return parsed if isinstance(parsed, dict) else None
        except Exception:
            return None

    async def _classify_with_router_model(
        self,
        focus_message: str,
        candidates: list[Dict[str, Any]],
    ) -> Optional[Dict[str, Any]]:
        if not self.settings.use_router_model:
            return None
        if not focus_message.strip():
            return None

        router_model = self._pick_router_model(candidates)
        if not router_model:
            return None

        prompt = (
            "Classify the user's request intent for model routing.\n"
            "Return ONLY minified JSON with keys task, complexity, signal.\n"
            "task must be one of: code, reasoning, creative, fast, general.\n"
            "complexity must be a number 0 to 1.\n"
            "signal must be a number 0 to 1 for confidence.\n"
            f"User request: {focus_message}"
        )

        try:
            timeout_s = max(0.2, float(self.settings.router_timeout_ms) / 1000.0)
            raw = await asyncio.wait_for(
                ollama_client.chat(prompt=prompt, model=router_model),
                timeout=timeout_s,
            )
            parsed = self._parse_router_json(raw or "")
            if not parsed:
                return None
            task = str(parsed.get("task") or "").strip().lower()
            if task not in {"code", "reasoning", "creative", "fast", "general"}:
                return None
            complexity = float(parsed.get("complexity") or 0.0)
            signal = float(parsed.get("signal") or 0.0)
            return {
                "task": task,
                "complexity": max(0.0, min(1.0, complexity)),
                "signal_strength": max(0.0, min(1.0, signal)),
                "router_model": router_model,
            }
        except Exception:
            return None

    async def _list_candidate_models(self) -> list[Dict[str, Any]]:
        candidates: list[Dict[str, Any]] = []
        local_sizes: dict[str, float] = {}

        # Local model sizes (for speed/quality estimation)
        try:
            local_models = await ollama_client.list_models()
            for model in local_models:
                if isinstance(model, str):
                    local_sizes[model] = 0.0
                    continue
                name = model.get("name")
                if not name:
                    continue
                size_bytes = float(model.get("size") or 0.0)
                local_sizes[name] = size_bytes / (1024 ** 3) if size_bytes > 0 else 0.0
        except Exception:
            pass

        try:
            unified_models = await provider_manager.list_all_models()
        except Exception:
            unified_models = []

        seen: set[str] = set()
        for model in unified_models:
            model_id = str(model.get("id") or model.get("name") or "").strip()
            if not model_id or model_id in seen:
                continue
            seen.add(model_id)
            model_name = str(model.get("name") or model_id)
            provider_type = str(model.get("provider_type") or "local")
            size_gb = float(model.get("size_gb") or 0.0)
            if provider_type == "local" and size_gb <= 0:
                size_gb = float(local_sizes.get(model_name) or local_sizes.get(model_id) or 0.0)
            candidates.append(
                {
                    "id": model_id,
                    "name": model_name,
                    "provider_type": provider_type,
                    "size_gb": size_gb,
                    "context_window": model.get("context_window"),
                }
            )

        if candidates:
            return candidates

        # Fallback: local only
        for name, size_gb in local_sizes.items():
            candidates.append(
                {
                    "id": name,
                    "name": name,
                    "provider_type": "local",
                    "size_gb": size_gb,
                    "context_window": None,
                }
            )

        if not candidates:
            candidates.append(
                {
                    "id": "llama3.1:8b",
                    "name": "llama3.1:8b",
                    "provider_type": "local",
                    "size_gb": 0.0,
                    "context_window": None,
                }
            )

        return candidates

    def _model_affinities(self, model: Dict[str, Any]) -> Dict[str, float]:
        model_text = f"{model.get('id', '')} {model.get('name', '')}".lower()

        code_affinity = 0.35
        if any(hint in model_text for hint in self.CODE_MODEL_HINTS):
            code_affinity = 0.92

        reasoning_affinity = 0.45
        if any(hint in model_text for hint in self.REASONING_MODEL_HINTS):
            reasoning_affinity = 0.90

        creative_affinity = 0.50
        if any(hint in model_text for hint in self.CREATIVE_MODEL_HINTS):
            creative_affinity = 0.78

        speed_hint = 0.60
        if any(hint in model_text for hint in self.FAST_MODEL_HINTS):
            speed_hint = 0.93
        elif any(hint in model_text for hint in self.REASONING_MODEL_HINTS):
            speed_hint = 0.45

        return {
            "code": code_affinity,
            "reasoning": reasoning_affinity,
            "creative": creative_affinity,
            "speed_hint": speed_hint,
        }

    def _score_quality(self, model: Dict[str, Any]) -> float:
        model_id = str(model.get("id") or "")
        model_name = str(model.get("name") or model_id)
        base_name = model_name.split(":")[0]
        context_window = model.get("context_window")
        size_gb = float(model.get("size_gb") or 0.0)
        provider_type = str(model.get("provider_type") or "local")

        quality = (
            self.quality_tiers.get(model_id)
            or self.quality_tiers.get(model_name)
            or self.quality_tiers.get(base_name)
        )

        if quality is None:
            if size_gb > 0:
                quality = min(0.95, 0.45 + (size_gb / 40.0))
            elif provider_type == "cloud":
                quality = 0.82
            else:
                quality = 0.68

        if isinstance(context_window, (int, float)) and context_window >= 500_000:
            quality = min(0.98, quality + 0.06)

        return float(max(0.0, min(1.0, quality)))

    def _score_speed(self, model: Dict[str, Any], system: Dict[str, Any]) -> float:
        provider_type = str(model.get("provider_type") or "local")
        affinities = self._model_affinities(model)
        size_gb = float(model.get("size_gb") or 0.0)

        if provider_type != "local":
            return affinities["speed_hint"]

        ram_gb = float(system.get("ram_gb") or 8.0)
        gpu_available = bool(system.get("gpu_available") or False)

        if size_gb <= 0:
            return 0.75 if gpu_available else 0.58

        if size_gb <= (ram_gb * 0.35):
            return 0.96 if gpu_available else 0.85
        if size_gb <= (ram_gb * 0.75):
            return 0.87 if gpu_available else 0.74
        if size_gb <= ram_gb:
            return 0.66 if gpu_available else 0.55
        return 0.20

    def _score_cost_efficiency(self, model: Dict[str, Any]) -> float:
        provider_type = str(model.get("provider_type") or "local")
        model_text = f"{model.get('id', '')} {model.get('name', '')}".lower()

        if provider_type == "local":
            return 1.0

        cloud_cost = 0.24
        if any(hint in model_text for hint in self.ECONOMY_MODEL_HINTS):
            cloud_cost = 0.52
        if any(hint in model_text for hint in ("pro", "reasoner", "large")):
            cloud_cost = min(cloud_cost, 0.22)
        return cloud_cost

    def _intent_score(
        self,
        task: str,
        quality: float,
        speed: float,
        cost: float,
        affinities: Dict[str, float],
    ) -> float:
        if task == "code":
            return (0.62 * affinities["code"]) + (0.20 * affinities["reasoning"]) + (0.18 * quality)
        if task == "reasoning":
            return (0.58 * affinities["reasoning"]) + (0.32 * quality) + (0.10 * (1.0 - speed))
        if task == "creative":
            return (0.45 * affinities["creative"]) + (0.40 * quality) + (0.15 * affinities["reasoning"])
        if task == "fast":
            return (0.62 * speed) + (0.25 * cost) + (0.13 * (1.0 - affinities["reasoning"]))
        return (0.34 * quality) + (0.34 * speed) + (0.18 * cost) + (0.14 * affinities["reasoning"])

    async def select_best_model(
        self,
        user_message: str,
        last_model: Optional[str] = None,
    ) -> Dict[str, Any]:
        """
        Rank available models using weighted base scoring + per-turn intent scoring.
        """
        candidates = await self._list_candidate_models()
        if not candidates:
            return {"name": "llama3.1:8b", "reason": "No models found, using default"}

        system = get_system_info()
        profile = self._infer_prompt_profile(user_message)
        router_profile = await self._classify_with_router_model(profile["focus_message"], candidates)
        task = profile["task"]
        blend = profile["signal_strength"]
        complexity = profile["complexity"]
        router_used = None
        if router_profile:
            task = router_profile["task"]
            blend = max(blend, router_profile["signal_strength"])
            complexity = max(complexity, router_profile["complexity"])
            router_used = router_profile["router_model"]

        weight_total = max(
            0.0001,
            self.settings.weight_cost + self.settings.weight_speed + self.settings.weight_quality,
        )

        scored_models: list[Dict[str, Any]] = []
        for model in candidates:
            cost = self._score_cost_efficiency(model)
            speed = self._score_speed(model, system)
            quality = self._score_quality(model)
            affinities = self._model_affinities(model)
            intent = self._intent_score(task, quality, speed, cost, affinities)

            base = (
                (cost * self.settings.weight_cost)
                + (speed * self.settings.weight_speed)
                + (quality * self.settings.weight_quality)
            ) / weight_total

            total = (base * (1.0 - blend)) + (intent * blend)

            # Complexity boosts quality-centric models on long/complex asks.
            if complexity >= 0.60:
                total += 0.08 * (quality - 0.5)

            # Local preference should influence tie-breaks, not dominate.
            if model.get("provider_type") == "local":
                total += 0.04 if self.settings.prefer_local else -0.01
            else:
                total += -0.04 if self.settings.prefer_local else 0.02

            # Mild stickiness to avoid model thrashing.
            if last_model and model.get("id") == last_model:
                total += 0.06

            scored_models.append(
                {
                    "id": model["id"],
                    "name": model["name"],
                    "provider_type": model.get("provider_type", "local"),
                    "score": total,
                    "details": {
                        "base": base,
                        "intent": intent,
                        "cost": cost,
                        "speed": speed,
                        "quality": quality,
                    },
                }
            )

        scored_models.sort(key=lambda item: item["score"], reverse=True)
        selected = scored_models[0]

        if last_model and selected["id"] != last_model:
            previous = next((m for m in scored_models if m["id"] == last_model), None)
            if previous and (selected["score"] - previous["score"]) < self.settings.min_switch_delta:
                selected = previous

        reason = (
            f"Intent:{task} | Selected:{selected['id']} "
            f"(score={selected['score']:.2f}, "
            f"base={selected['details']['base']:.2f}, intent={selected['details']['intent']:.2f}, "
            f"Q={selected['details']['quality']:.2f} S={selected['details']['speed']:.2f} C={selected['details']['cost']:.2f}, "
            f"blend={blend:.2f}, complexity={complexity:.2f}, "
            f"router={router_used or 'heuristic'})"
        )

        return {"name": selected["id"], "reason": reason}

    def detect_circuit_intent(self, user_message: str) -> Optional[str]:
        """
        Analyze the latest user utterance to see if it matches a known circuit.
        """
        circuits = get_circuits()
        message = self.extract_latest_user_message(user_message).lower()
        message_tokens = set(re.findall(r"\b[a-z0-9_]+\b", message))

        best_match = None
        max_score = 0

        for name, data in circuits.items():
            score = 0
            name_l = name.lower()
            desc = str(data.get("description") or "").lower()

            if re.search(rf"\b{re.escape(name_l)}\b", message):
                score += 5

            keywords = {w for w in re.findall(r"\b[a-z0-9_]+\b", desc) if len(w) > 4}
            overlap = keywords & message_tokens
            score += len(overlap)

            if score > max_score and score > 2:
                max_score = score
                best_match = name

        return best_match

    async def analyze(
        self,
        user_message: str,
        last_model: Optional[str] = None,
    ) -> OrchestrationResult:
        """
        Main entry point. Decides whether to chat or suggest a circuit.
        """
        best_model = await self.select_best_model(user_message, last_model=last_model)
        circuit_match = self.detect_circuit_intent(user_message)
        if circuit_match:
            return OrchestrationResult(
                action="circuit",
                circuit_name=circuit_match,
                model_name=best_model["name"],
                reasoning=f"Detected intent for circuit '{circuit_match}' | {best_model['reason']}",
            )

        return OrchestrationResult(
            action="chat",
            model_name=best_model["name"],
            reasoning=best_model["reason"],
        )


# Singleton
orchestrator = OrchestratorService()
