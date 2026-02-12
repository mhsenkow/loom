from unittest.mock import AsyncMock, MagicMock

import pytest

from app.services import module_executor
from app.services.module_executor import run_module


@pytest.mark.asyncio
async def test_data_input_prefers_content():
    ollama = MagicMock()
    result = await run_module("data_input", "content", {"input": "fallback"}, ollama=ollama)
    assert result == "content"


@pytest.mark.asyncio
async def test_log_entry_returns_input():
    ollama = MagicMock()
    result = await run_module("log_entry", "", {"input": "log me"}, ollama=ollama)
    assert result == "log me"


@pytest.mark.asyncio
async def test_ai_processor_uses_provider_manager_when_available():
    ollama = MagicMock()
    ollama.chat = AsyncMock(return_value="ollama")
    provider_manager = MagicMock()
    provider_manager.chat = AsyncMock(return_value="provider")

    result = await run_module(
        "ai_processor",
        "Summarize: {{input}}",
        {"input": "alpha"},
        ollama=ollama,
        model="test-model",
        provider_manager=provider_manager,
    )

    assert result == "provider"
    provider_manager.chat.assert_awaited_once_with("Summarize: alpha", "test-model")
    ollama.chat.assert_not_called()


@pytest.mark.asyncio
async def test_ai_processor_falls_back_to_ollama():
    ollama = MagicMock()
    ollama.chat = AsyncMock(return_value="ok")

    result = await run_module(
        "ai_processor",
        "Instruction",
        {"input": "payload"},
        ollama=ollama,
        model="llama3.1:8b",
    )

    assert result == "ok"
    ollama.chat.assert_awaited_once_with("Instruction\n\n---\n\npayload", model="llama3.1:8b")


@pytest.mark.asyncio
async def test_script_execution_replaces_placeholder():
    ollama = MagicMock()
    result = await run_module(
        "script_execution",
        '{"wrapped":"{{input}}"}',
        {"input": "value"},
        ollama=ollama,
    )
    assert result == '{"wrapped":"value"}'


@pytest.mark.asyncio
async def test_data_loader_reads_file(monkeypatch):
    ollama = MagicMock()
    mock_read = MagicMock(return_value={"content": "file content"})
    monkeypatch.setattr(module_executor.file_loader, "read_file", mock_read)

    result = await run_module("data_loader", "/tmp/file.txt", {}, ollama=ollama)

    assert result == "file content"
    mock_read.assert_called_once()


@pytest.mark.asyncio
async def test_data_loader_requires_path():
    ollama = MagicMock()
    with pytest.raises(ValueError, match="No file path specified"):
        await run_module("data_loader", "", {}, ollama=ollama)


@pytest.mark.asyncio
async def test_image_gen_returns_image(monkeypatch):
    ollama = MagicMock()
    monkeypatch.setattr(
        module_executor.local_image_gen,
        "generate",
        AsyncMock(return_value={"image": "data:image/png;base64,abc"}),
    )

    result = await run_module(
        "image_gen",
        "negative prompt",
        {"input": "a landscape"},
        ollama=ollama,
        model="sdxl",
    )

    assert result == "data:image/png;base64,abc"


@pytest.mark.asyncio
async def test_vector_index_requires_store():
    ollama = MagicMock()
    with pytest.raises(RuntimeError, match="Vector store not available"):
        await run_module("vector_index", "/tmp/file.txt", {}, ollama=ollama, vector_store=None)


@pytest.mark.asyncio
async def test_vector_index_success(monkeypatch):
    ollama = MagicMock()
    vector_store = MagicMock()

    class FakeIndexer:
        def __init__(self, _store):
            self._store = _store

        async def index_file(self, **_kwargs):
            return {"success": True, "chunk_count": 3, "file_id": "file-123"}

    monkeypatch.setattr(module_executor, "DocumentIndexer", FakeIndexer)

    result = await run_module(
        "vector_index",
        "/tmp/file.txt",
        {},
        ollama=ollama,
        vector_store=vector_store,
    )

    assert "Indexed '/tmp/file.txt'" in result
    assert "3 chunks created" in result
    assert "file-123" in result


@pytest.mark.asyncio
async def test_vector_search_formats_results():
    ollama = MagicMock()
    vector_store = MagicMock()
    vector_store.is_connected.return_value = True
    vector_store.query = AsyncMock(
        return_value=[
            {
                "similarity": 0.91,
                "content": "Result body",
                "metadata": {"file_path": "docs/readme.md"},
            }
        ]
    )

    result = await run_module(
        "vector_search",
        "query text",
        {"n_results": "2"},
        ollama=ollama,
        vector_store=vector_store,
    )

    assert "Found 1 results" in result
    assert "docs/readme.md" in result
    assert "Result body" in result


@pytest.mark.asyncio
async def test_vector_search_handles_empty_results():
    ollama = MagicMock()
    vector_store = MagicMock()
    vector_store.is_connected.return_value = True
    vector_store.query = AsyncMock(return_value=[])

    result = await run_module(
        "vector_search",
        "query text",
        {},
        ollama=ollama,
        vector_store=vector_store,
    )

    assert "No results found" in result


@pytest.mark.asyncio
async def test_unknown_module_type_passes_input_through():
    ollama = MagicMock()
    result = await run_module("unknown_type", "content", {"input": "fallback"}, ollama=ollama)
    assert result == "fallback"
