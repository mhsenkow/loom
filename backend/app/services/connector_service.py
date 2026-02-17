"""
Connector service: persist and use Telegram/Discord tokens.
- Load/save connectors.json (telegram token, optional default chat_id).
- Send message to Telegram via Bot API.
"""

import json
import logging
from pathlib import Path
from typing import Any, Optional

import httpx

logger = logging.getLogger("loom.connector_service")

_DATA_DIR = Path(__file__).resolve().parent.parent.parent / "data"
_CONNECTORS_FILE = _DATA_DIR / "connectors.json"

TELEGRAM_SEND_URL = "https://api.telegram.org/bot{token}/sendMessage"
TELEGRAM_EDIT_MESSAGE_URL = "https://api.telegram.org/bot{token}/editMessageText"
TELEGRAM_SEND_PHOTO_URL = "https://api.telegram.org/bot{token}/sendPhoto"
TELEGRAM_CHAT_ACTION_URL = "https://api.telegram.org/bot{token}/sendChatAction"


def _load_connectors() -> dict[str, Any]:
    if not _CONNECTORS_FILE.exists():
        return {}
    try:
        return json.loads(_CONNECTORS_FILE.read_text())
    except Exception as e:
        logger.warning("Failed to load connectors: %s", e)
        return {}


def _save_connectors(data: dict[str, Any]) -> None:
    _DATA_DIR.mkdir(parents=True, exist_ok=True)
    _CONNECTORS_FILE.write_text(json.dumps(data, indent=2))


def get_connector_status() -> dict[str, Any]:
    """Return status for all connectors (telegram, discord)."""
    data = _load_connectors()
    telegram = data.get("telegram") or {}
    return {
        "telegram": {
            "connected": bool(telegram.get("token")),
            "username": telegram.get("username"),
            "default_chat_id": telegram.get("default_chat_id"),
        },
        "discord": {
            "connected": bool((data.get("discord") or {}).get("token")),
            "username": None,
        },
    }


def connect_telegram(token: str, username: Optional[str] = None) -> None:
    """Save Telegram bot token (and optional username)."""
    data = _load_connectors()
    data["telegram"] = {
        "token": token.strip(),
        "username": username,
    }
    _save_connectors(data)


def disconnect_telegram() -> None:
    """Remove Telegram token."""
    data = _load_connectors()
    data["telegram"] = {}
    _save_connectors(data)


def get_telegram_token() -> Optional[str]:
    """Return saved Telegram token or None."""
    data = _load_connectors()
    return (data.get("telegram") or {}).get("token")


def get_telegram_default_chat_id() -> Optional[str]:
    """Return default Telegram chat_id or None."""
    data = _load_connectors()
    return (data.get("telegram") or {}).get("default_chat_id")


async def send_telegram_message(
    text: str,
    chat_id: Optional[str] = None,
) -> str:
    """
    Send a message via Telegram Bot API.
    If chat_id is None/empty, uses default_chat_id from config, or fails.
    Returns success message or raises RuntimeError.
    """
    token = get_telegram_token()
    if not token:
        raise RuntimeError("Telegram not connected. Add a bot token in Settings → Connections.")
    data = _load_connectors()
    telegram = data.get("telegram") or {}
    target = (chat_id or "").strip() or telegram.get("default_chat_id")
    if not target:
        raise RuntimeError(
            "No Telegram chat_id. Send a DM to your bot first, then add default_chat_id to data/connectors.json, "
            "or use the Telegram cell with chat_id in content (future)."
        )
    url = TELEGRAM_SEND_URL.format(token=token)
    payload = {"chat_id": target, "text": text}
    try:
        async with httpx.AsyncClient(timeout=15.0) as client:
            resp = await client.post(url, json=payload)
            out = resp.json()
    except Exception as e:
        raise RuntimeError(f"Telegram send failed: {e}") from e
    if not out.get("ok"):
        desc = out.get("description", "Unknown error")
        raise RuntimeError(f"Telegram API error: {desc}")
    return f"Sent to Telegram (chat_id={target})"


async def send_telegram_message_with_id(
    text: str,
    chat_id: Optional[str] = None,
) -> tuple[str, int]:
    """Send a message and return (message_str, message_id). Raises RuntimeError on failure."""
    token = get_telegram_token()
    if not token:
        raise RuntimeError("Telegram not connected.")
    data = _load_connectors()
    telegram = data.get("telegram") or {}
    target = (chat_id or "").strip() or telegram.get("default_chat_id")
    if not target:
        raise RuntimeError("No Telegram chat_id.")
    url = TELEGRAM_SEND_URL.format(token=token)
    payload = {"chat_id": target, "text": text}
    async with httpx.AsyncClient(timeout=15.0) as client:
        resp = await client.post(url, json=payload)
        out = resp.json()
    if not out.get("ok"):
        desc = out.get("description", "Unknown error")
        raise RuntimeError(f"Telegram API error: {desc}")
    msg_id = (out.get("result") or {}).get("message_id")
    if msg_id is None:
        raise RuntimeError("Telegram API did not return message_id")
    return f"Sent (chat_id={target})", int(msg_id)


async def edit_telegram_message(
    chat_id: Optional[str],
    message_id: int,
    text: str,
) -> None:
    """Edit an existing message sent by the bot. Raises RuntimeError on failure."""
    token = get_telegram_token()
    if not token:
        raise RuntimeError("Telegram not connected.")
    data = _load_connectors()
    telegram = data.get("telegram") or {}
    target = (chat_id or "").strip() or telegram.get("default_chat_id")
    if not target:
        raise RuntimeError("No Telegram chat_id.")
    url = TELEGRAM_EDIT_MESSAGE_URL.format(token=token)
    payload = {"chat_id": target, "message_id": message_id, "text": text[:4096]}
    async with httpx.AsyncClient(timeout=10.0) as client:
        resp = await client.post(url, json=payload)
        out = resp.json()
    if not out.get("ok"):
        desc = out.get("description", "Unknown error")
        raise RuntimeError(f"Telegram edit error: {desc}")


async def send_telegram_chat_action(
    chat_id: Optional[str] = None,
    action: str = "typing",
) -> None:
    """
    Send a chat action (e.g. "typing") so the user sees "replying..." while the bot is thinking.
    Telegram shows it for ~5 seconds; call every 4s while generating.
    """
    token = get_telegram_token()
    if not token:
        return
    data = _load_connectors()
    telegram = data.get("telegram") or {}
    target = (chat_id or "").strip() or telegram.get("default_chat_id")
    if not target:
        return
    url = TELEGRAM_CHAT_ACTION_URL.format(token=token)
    payload = {"chat_id": target, "action": action}
    try:
        async with httpx.AsyncClient(timeout=5.0) as client:
            await client.post(url, json=payload)
    except Exception as e:
        logger.debug("Telegram sendChatAction failed: %s", e)


async def send_telegram_photo(
    chat_id: Optional[str],
    image_base64: str,
    caption: Optional[str] = None,
) -> None:
    """
    Send a photo to a Telegram chat. image_base64 can be raw base64 or a data URL (data:image/...;base64,...).
    Raises RuntimeError on failure.
    """
    import base64
    token = get_telegram_token()
    if not token:
        raise RuntimeError("Telegram not connected.")
    data_conn = _load_connectors()
    telegram = data_conn.get("telegram") or {}
    target = (chat_id or "").strip() or telegram.get("default_chat_id")
    if not target:
        raise RuntimeError("No Telegram chat_id.")
    raw = image_base64.strip()
    if raw.startswith("data:"):
        raw = raw.split(",", 1)[-1] if "," in raw else ""
    try:
        image_bytes = base64.b64decode(raw)
    except Exception as e:
        raise RuntimeError(f"Invalid base64 image: {e}") from e
    if not image_bytes:
        raise RuntimeError("Empty image data.")
    url = TELEGRAM_SEND_PHOTO_URL.format(token=token)
    payload: dict[str, Any] = {"chat_id": target}
    if caption:
        payload["caption"] = caption[:1024]
    try:
        async with httpx.AsyncClient(timeout=60.0) as client:
            resp = await client.post(
                url,
                data=payload,
                files={"photo": ("image.png", image_bytes, "image/png")},
            )
            out = resp.json()
    except Exception as e:
        raise RuntimeError(f"Telegram sendPhoto failed: {e}") from e
    if not out.get("ok"):
        desc = out.get("description", "Unknown error")
        raise RuntimeError(f"Telegram API error: {desc}")
