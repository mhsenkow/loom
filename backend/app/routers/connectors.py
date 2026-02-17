"""
Connectors API: Telegram, Discord (verify, connect, status, send).
Serves downloaded Telegram files. Starts/stops Telegram listener on connect/disconnect.
"""

import httpx
from pathlib import Path
from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import FileResponse
from pydantic import BaseModel, Field

from app.services.connector_service import (
    get_connector_status,
    connect_telegram,
    disconnect_telegram,
    send_telegram_message,
    send_telegram_message_with_id,
    edit_telegram_message,
    send_telegram_chat_action,
    send_telegram_photo,
    get_telegram_default_chat_id,
)
from app.services.telegram_conversation import append_assistant as telegram_append_assistant

router = APIRouter()

# Idempotency: only send one reply per (chat_id, message_id) or per (chat_id, update_id). Second POST returns 200 without sending.
_telegram_replied_ids: set[tuple[str, int]] = set()
_telegram_replied_update_ids: set[tuple[str, int]] = set()
_telegram_replied_max = 500


def _telegram_already_replied(chat_id: str, message_id: int | None, update_id: int | None) -> bool:
    if update_id is not None and (chat_id, update_id) in _telegram_replied_update_ids:
        return True
    if message_id is not None and (chat_id, message_id) in _telegram_replied_ids:
        return True
    return False


def _telegram_mark_replied(chat_id: str, message_id: int | None, update_id: int | None) -> None:
    if len(_telegram_replied_ids) + len(_telegram_replied_update_ids) >= _telegram_replied_max:
        _telegram_replied_ids.clear()
        _telegram_replied_update_ids.clear()
    if update_id is not None:
        _telegram_replied_update_ids.add((chat_id, update_id))
    if message_id is not None:
        _telegram_replied_ids.add((chat_id, message_id))

TELEGRAM_GET_ME = "https://api.telegram.org/bot{token}/getMe"


class TelegramVerifyRequest(BaseModel):
    token: str = Field(..., min_length=1, description="Bot token from @BotFather")


class TelegramConnectRequest(BaseModel):
    token: str = Field(..., min_length=1)
    username: str | None = None


class TelegramSendRequest(BaseModel):
    message: str = Field(..., min_length=1)
    chat_id: str | None = None
    in_reply_to_message_id: int | None = None  # idempotency: only one reply per message
    in_reply_to_update_id: int | None = None  # idempotency: one reply per Telegram update (preferred)


class TelegramTypingRequest(BaseModel):
    chat_id: str | None = None


class TelegramSendStatusRequest(BaseModel):
    chat_id: str | None = None
    text: str = Field(..., min_length=1)


class TelegramEditMessageRequest(BaseModel):
    chat_id: str = Field(..., min_length=1)
    message_id: int = Field(..., gt=0)
    text: str = Field(..., min_length=1)
    append_to_conversation: bool = False
    in_reply_to_message_id: int | None = None
    in_reply_to_update_id: int | None = None


class TelegramSendPhotoRequest(BaseModel):
    chat_id: str | None = None
    image_base64: str = Field(..., min_length=1)
    caption: str | None = None
    in_reply_to_message_id: int | None = None
    in_reply_to_update_id: int | None = None


@router.get("/status")
async def connectors_status():
    """Return connection status for Telegram and Discord."""
    return get_connector_status()


@router.post("/telegram/verify")
async def verify_telegram_token(request: TelegramVerifyRequest):
    """Verify a Telegram bot token by calling getMe. Returns bot username if valid."""
    token = request.token.strip()
    if not token:
        raise HTTPException(status_code=400, detail="Token is empty")
    url = TELEGRAM_GET_ME.format(token=token)
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            resp = await client.get(url)
            data = resp.json()
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Telegram API request failed: {e}")
    if not data.get("ok"):
        detail = data.get("description", "Invalid token or Telegram error")
        raise HTTPException(status_code=400, detail=detail)
    result = data.get("result", {})
    username = result.get("username") or ""
    return {
        "ok": True,
        "username": f"@{username}" if username else None,
        "id": result.get("id"),
    }


_DATA_DIR = Path(__file__).resolve().parent.parent.parent / "data"
_TELEGRAM_FILES_DIR = _DATA_DIR / "telegram"


@router.get("/telegram/files/{filename}")
async def serve_telegram_file(filename: str):
    """Serve a downloaded Telegram file (image, voice, audio, document)."""
    if ".." in filename or "/" in filename or "\\" in filename:
        raise HTTPException(status_code=400, detail="Invalid filename")
    path = _TELEGRAM_FILES_DIR / filename
    if not path.is_file():
        raise HTTPException(status_code=404, detail="File not found")
    return FileResponse(path)


@router.post("/telegram")
async def connect_telegram_endpoint(request: Request, body: TelegramConnectRequest):
    """Save Telegram bot token and mark as connected. Starts the Telegram listener."""
    token = body.token.strip()
    if not token:
        raise HTTPException(status_code=400, detail="Token is empty")
    # Verify first
    url = TELEGRAM_GET_ME.format(token=token)
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            resp = await client.get(url)
            data = resp.json()
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Telegram API request failed: {e}")
    if not data.get("ok"):
        detail = data.get("description", "Invalid token or Telegram error")
        raise HTTPException(status_code=400, detail=detail)
    result = data.get("result", {})
    username = result.get("username") or ""
    connect_telegram(token=token, username=f"@{username}" if username else None)
    try:
        sio = getattr(request.app.state, "sio", None)
        if sio:
            from app.services.telegram_listener import get_telegram_listener
            get_telegram_listener(sio).start()
    except Exception:
        pass
    return get_connector_status()


@router.delete("/telegram")
async def disconnect_telegram_endpoint(request: Request):
    """Remove Telegram token and disconnect. Stops the Telegram listener."""
    disconnect_telegram()
    try:
        sio = getattr(request.app.state, "sio", None)
        if sio:
            from app.services.telegram_listener import get_telegram_listener
            get_telegram_listener(sio).stop()
    except Exception:
        pass
    return get_connector_status()


@router.post("/telegram/typing")
async def send_telegram_typing(request: TelegramTypingRequest):
    """Send 'typing' chat action so the user sees the bot is replying."""
    await send_telegram_chat_action(chat_id=request.chat_id, action="typing")
    return {"ok": True}


@router.post("/telegram/send-status")
async def send_telegram_status(request: TelegramSendStatusRequest):
    """Send a status message (e.g. 'Thinking…' or 'Llama thinking…') and return message_id for later edit. Does not append to conversation."""
    try:
        _, message_id = await send_telegram_message_with_id(text=request.text, chat_id=request.chat_id or None)
        return {"ok": True, "message_id": message_id}
    except RuntimeError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.post("/telegram/send-photo")
async def send_telegram_photo_endpoint(request: TelegramSendPhotoRequest):
    """Send a photo to Telegram (e.g. /dream result). Optionally mark idempotency with in_reply_to_*."""
    chat_id = (request.chat_id or "").strip() or get_telegram_default_chat_id()
    chat_id = chat_id or ""
    if chat_id and (request.in_reply_to_update_id is not None or request.in_reply_to_message_id is not None):
        if _telegram_already_replied(chat_id, request.in_reply_to_message_id, request.in_reply_to_update_id):
            return {"ok": True, "message": "Already sent (idempotent)", "skipped": True}
    try:
        await send_telegram_photo(
            chat_id=request.chat_id or None,
            image_base64=request.image_base64,
            caption=request.caption,
        )
        if chat_id and (request.in_reply_to_update_id is not None or request.in_reply_to_message_id is not None):
            _telegram_mark_replied(chat_id, request.in_reply_to_message_id, request.in_reply_to_update_id)
        return {"ok": True, "message": "Photo sent"}
    except RuntimeError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.post("/telegram/edit-message")
async def edit_telegram_message_endpoint(request: TelegramEditMessageRequest):
    """Edit a message sent by the bot. If append_to_conversation true, appends the new text to the conversation store. Optionally marks idempotency when in_reply_to_* provided."""
    try:
        await edit_telegram_message(chat_id=request.chat_id, message_id=request.message_id, text=request.text)
        if request.append_to_conversation:
            try:
                telegram_append_assistant(request.chat_id, request.text)
            except Exception:
                pass
        if request.append_to_conversation and (request.in_reply_to_message_id is not None or request.in_reply_to_update_id is not None):
            _telegram_mark_replied(request.chat_id, request.in_reply_to_message_id, request.in_reply_to_update_id)
        return {"ok": True}
    except RuntimeError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.get("/telegram/conversation")
async def get_telegram_conversation(chat_id: str | None = None):
    """Return the stored Telegram conversation for the given chat (or default chat)."""
    from app.services.telegram_conversation import get_history
    default = get_telegram_default_chat_id() if chat_id is None else None
    messages = get_history(chat_id=chat_id, default_chat_id=default)
    return {"messages": messages}


@router.post("/telegram/send")
async def send_telegram_endpoint(request: TelegramSendRequest):
    """Send a message via the connected Telegram bot. One reply per in_reply_to_update_id or in_reply_to_message_id."""
    chat_id = (request.chat_id or "").strip() or get_telegram_default_chat_id()
    chat_id = chat_id or ""
    if chat_id and (request.in_reply_to_update_id is not None or request.in_reply_to_message_id is not None):
        if _telegram_already_replied(chat_id, request.in_reply_to_message_id, request.in_reply_to_update_id):
            return {"ok": True, "message": "Already sent (idempotent)", "skipped": True}
    try:
        msg = await send_telegram_message(text=request.message, chat_id=request.chat_id or None)
        if chat_id and (request.in_reply_to_update_id is not None or request.in_reply_to_message_id is not None):
            _telegram_mark_replied(chat_id, request.in_reply_to_message_id, request.in_reply_to_update_id)
        if chat_id:
            try:
                telegram_append_assistant(chat_id, request.message)
            except Exception:
                pass
        return {"ok": True, "message": msg}
    except RuntimeError as e:
        raise HTTPException(status_code=400, detail=str(e))
