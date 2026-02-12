from unittest.mock import AsyncMock

import pytest

import app.services.orchestrator as orchestrator_module


def test_extract_latest_user_message_prefers_last_user_line():
    service = orchestrator_module.OrchestratorService()
    prompt = (
        "Previous conversation:\n\n"
        "User: first question\n\n"
        "Assistant: answer\n\n"
        "User: second question"
    )
    assert service.extract_latest_user_message(prompt) == "second question"


def test_parse_router_json_recovers_embedded_object():
    service = orchestrator_module.OrchestratorService()
    parsed = service._parse_router_json(
        "route=ok {\"task\":\"fast\",\"complexity\":0.2,\"signal\":0.9} done"
    )
    assert parsed is not None
    assert parsed["task"] == "fast"
    assert parsed["complexity"] == 0.2
    assert parsed["signal"] == 0.9


@pytest.mark.asyncio
async def test_classify_with_router_model_uses_small_model(monkeypatch):
    service = orchestrator_module.OrchestratorService()
    candidates = [
        {"id": "llama3.1:8b", "name": "llama3.1:8b", "provider_type": "local", "size_gb": 4.7},
        {"id": "tinyllama", "name": "tinyllama", "provider_type": "local", "size_gb": 0.6},
    ]

    async def fake_chat(prompt: str, model: str, system_prompt=None) -> str:  # noqa: ARG001
        assert model == "tinyllama"
        return "{\"task\":\"reasoning\",\"complexity\":0.7,\"signal\":0.6}"

    monkeypatch.setattr(orchestrator_module.ollama_client, "chat", fake_chat)

    result = await service._classify_with_router_model("Compare two designs", candidates)
    assert result is not None
    assert result["task"] == "reasoning"
    assert result["router_model"] == "tinyllama"


@pytest.mark.asyncio
async def test_select_best_model_uses_router_signal(monkeypatch):
    service = orchestrator_module.OrchestratorService()
    monkeypatch.setattr(
        service,
        "_list_candidate_models",
        AsyncMock(
            return_value=[
                {"id": "tinyllama", "name": "tinyllama", "provider_type": "local", "size_gb": 0.6, "context_window": None},
                {"id": "codellama:7b", "name": "codellama:7b", "provider_type": "local", "size_gb": 3.8, "context_window": None},
            ]
        ),
    )
    monkeypatch.setattr(orchestrator_module, "get_system_info", lambda: {"ram_gb": 16, "gpu_available": True})
    monkeypatch.setattr(
        service,
        "_classify_with_router_model",
        AsyncMock(return_value={"task": "code", "complexity": 0.3, "signal_strength": 0.9, "router_model": "tinyllama"}),
    )

    result = await service.select_best_model("help me fix this bug")
    assert result["name"] == "codellama:7b"
    assert "router=tinyllama" in result["reason"]


@pytest.mark.asyncio
async def test_analyze_circuit_still_returns_chat_model(monkeypatch):
    service = orchestrator_module.OrchestratorService()
    monkeypatch.setattr(service, "detect_circuit_intent", lambda _: "my-circuit")
    monkeypatch.setattr(
        service,
        "select_best_model",
        AsyncMock(return_value={"name": "llama3.1:8b", "reason": "route"}),
    )

    result = await service.analyze("run my-circuit")
    assert result.action == "circuit"
    assert result.circuit_name == "my-circuit"
    assert result.model_name == "llama3.1:8b"
