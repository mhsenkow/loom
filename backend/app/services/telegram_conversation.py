"""
Single persistent conversation store for Telegram: one thread per chat_id.
Append user messages (from listener) and assistant replies (on send).
Stored in data/telegram_conversation.json.
"""

import json
import logging
from pathlib import Path
from typing import Any

logger = logging.getLogger("loom.telegram_conversation")

_DATA_DIR = Path(__file__).resolve().parent.parent.parent / "data"
_STORE_PATH = _DATA_DIR / "telegram_conversation.json"


def _load_store() -> dict[str, Any]:
    if not _STORE_PATH.is_file():
        return {"chats": {}}
    try:
        data = json.loads(_STORE_PATH.read_text(encoding="utf-8"))
        return data if isinstance(data, dict) and "chats" in data else {"chats": {}}
    except Exception as e:
        logger.warning("Failed to load Telegram conversation store: %s", e)
        return {"chats": {}}


def _save_store(data: dict[str, Any]) -> None:
    try:
        _DATA_DIR.mkdir(parents=True, exist_ok=True)
        _STORE_PATH.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")
    except Exception as e:
        logger.warning("Failed to save Telegram conversation store: %s", e)


def append_user(chat_id: str | int, content: str, message_id: int | None = None) -> None:
    """Append a user message to the conversation for this chat."""
    key = str(chat_id)
    data = _load_store()
    chats = data.setdefault("chats", {})
    messages = chats.setdefault(key, [])
    messages.append({
        "role": "user",
        "content": content,
        "message_id": message_id,
        "ts": None,  # optional: could add iso ts
    })
    # Keep last 500 messages per chat to avoid huge files
    chats[key] = messages[-500:]
    _save_store(data)


def append_assistant(chat_id: str | int, content: str) -> None:
    """Append an assistant reply to the conversation for this chat."""
    key = str(chat_id)
    data = _load_store()
    chats = data.setdefault("chats", {})
    messages = chats.setdefault(key, [])
    messages.append({"role": "assistant", "content": content, "ts": None})
    chats[key] = messages[-500:]
    _save_store(data)


def get_history(
    chat_id: str | int | None = None,
    limit: int = 100,
    default_chat_id: str | None = None,
) -> list[dict[str, Any]]:
    """
    Return messages for the given chat_id (or default_chat_id / first chat if None).
    Each item: { "role": "user"|"assistant", "content": str, "message_id"?: int }.
    """
    data = _load_store()
    chats = data.get("chats") or {}
    if not chats:
        return []
    if chat_id is not None:
        key = str(chat_id)
        messages = chats.get(key, [])
    else:
        key = None
        if default_chat_id and str(default_chat_id) in chats:
            key = str(default_chat_id)
        if not key:
            keys = list(chats.keys())
            key = keys[-1] if keys else None
        messages = chats.get(key, []) if key else []
    return messages[-limit:]
