"""
Telegram getUpdates listener: receive messages, photos, voice, audio, documents from your bot.
Emits telegram_inbound via Socket.IO so the frontend can show them in the terminal feed.
Downloads files to data/telegram/ and reports URL path for serving.
"""

import asyncio
import logging
import re
from pathlib import Path
from typing import Any, Optional

import httpx

from app.services.connector_service import (
    get_telegram_token,
    _load_connectors,
    _save_connectors,
)
from app.services.telegram_conversation import append_user as telegram_append_user

logger = logging.getLogger("loom.telegram_listener")

_DATA_DIR = Path(__file__).resolve().parent.parent.parent / "data"
_TELEGRAM_FILES_DIR = _DATA_DIR / "telegram"

TELEGRAM_GET_UPDATES = "https://api.telegram.org/bot{token}/getUpdates"
TELEGRAM_GET_FILE = "https://api.telegram.org/bot{token}/getFile"
TELEGRAM_FILE_DOWNLOAD = "https://api.telegram.org/file/bot{token}/{file_path}"

# Safe filename: chat_id_msg_id_suffix.ext
def _safe_filename(chat_id: int, message_id: int, kind: str, ext: str) -> str:
    safe = re.sub(r"[^\w\-.]", "_", f"{chat_id}_{message_id}_{kind}")[:80]
    return f"{safe}.{ext}" if ext else safe


async def _download_file(token: str, file_id: str, dest_path: Path) -> bool:
    """Get file_path from getFile, then download to dest_path. Returns True on success."""
    try:
        async with httpx.AsyncClient(timeout=30.0) as client:
            r = await client.get(TELEGRAM_GET_FILE.format(token=token), params={"file_id": file_id})
            data = r.json()
        if not data.get("ok"):
            return False
        file_path = data.get("result", {}).get("file_path")
        if not file_path:
            return False
        url = TELEGRAM_FILE_DOWNLOAD.format(token=token, file_path=file_path)
        async with httpx.AsyncClient(timeout=60.0) as client:
            r = await client.get(url)
            r.raise_for_status()
        dest_path.parent.mkdir(parents=True, exist_ok=True)
        dest_path.write_bytes(r.content)
        return True
    except Exception as e:
        logger.warning("Telegram file download failed: %s", e)
        return False


def _get_file_id_from_message(message: dict) -> tuple[Optional[str], str, str]:
    """Return (file_id, kind, ext) for photo/voice/audio/document. Else (None, '', '')."""
    if message.get("photo"):
        # Photo is list of sizes; take largest (last)
        sizes = message["photo"]
        if sizes:
            f = sizes[-1]
            return str(f.get("file_id")), "photo", "jpg"
    if message.get("voice"):
        f = message["voice"]
        return str(f.get("file_id")), "voice", "ogg"
    if message.get("audio"):
        f = message["audio"]
        ext = (f.get("file_name") or "").split(".")[-1] or "m4a"
        return str(f.get("file_id")), "audio", ext
    if message.get("document"):
        f = message["document"]
        ext = (f.get("file_name") or "").split(".")[-1] or "bin"
        return str(f.get("file_id")), "document", ext
    return None, "", ""


class TelegramListener:
    """Long-poll getUpdates and emit telegram_inbound to Socket.IO."""

    def __init__(self, sio: Any):
        self._sio = sio
        self._offset: int = 0
        self._running = False
        self._task: Optional[asyncio.Task] = None
        self._primary_sid: Optional[str] = None  # only this client gets telegram_inbound (avoids 4x reply with 4 tabs)
        self._all_sids: set = set()  # track all connected so we can promote when primary leaves

    def client_connected(self, sid: str) -> None:
        """Call from main connect: track client; first one becomes primary."""
        self._all_sids.add(sid)
        if self._primary_sid is None:
            self._primary_sid = sid
            logger.debug("Telegram primary sid set to %s", sid)

    def client_disconnected(self, sid: str) -> None:
        """Call from main disconnect: if primary left, promote another client."""
        self._all_sids.discard(sid)
        if self._primary_sid == sid:
            self._primary_sid = next(iter(self._all_sids), None) if self._all_sids else None
            logger.debug("Telegram primary sid cleared, new primary=%s", self._primary_sid)

    async def _emit(self, event: str, payload: dict) -> None:
        """Emit to primary client only if set, else broadcast (so one tab replies, not all)."""
        if self._primary_sid:
            await self._sio.emit(event, payload, room=self._primary_sid)
        else:
            await self._sio.emit(event, payload)

    def start(self) -> None:
        token = get_telegram_token()
        if not token:
            return
        if self._running:
            return
        self._running = True
        self._task = asyncio.create_task(self._run(token))
        logger.info("Telegram listener started")

    def stop(self) -> None:
        self._running = False
        if self._task:
            self._task.cancel()
            self._task = None
        logger.info("Telegram listener stopped")

    async def _run(self, token: str) -> None:
        _TELEGRAM_FILES_DIR.mkdir(parents=True, exist_ok=True)
        while self._running:
            try:
                async with httpx.AsyncClient(timeout=35.0) as client:
                    resp = await client.get(
                        TELEGRAM_GET_UPDATES.format(token=token),
                        params={"offset": self._offset, "timeout": 30},
                    )
                data = resp.json()
                if not data.get("ok"):
                    logger.warning("Telegram getUpdates error: %s", data.get("description"))
                    await asyncio.sleep(5)
                    continue
                results = data.get("result") or []
                for upd in results:
                    self._offset = upd.get("update_id", 0) + 1
                    await self._process_update(token, upd)
            except asyncio.CancelledError:
                break
            except Exception as e:
                logger.exception("Telegram listener error: %s", e)
                await asyncio.sleep(5)

    async def _process_update(self, token: str, update: dict) -> None:
        message = update.get("message") or update.get("channel_post")
        if not message:
            return
        update_id = update.get("update_id")
        chat_id = message.get("chat", {}).get("id")
        message_id = message.get("message_id")
        from_user = message.get("from") or {}
        username = (from_user.get("username") or "").strip()
        from_name = (from_user.get("first_name") or "") + " " + (from_user.get("last_name") or "")
        from_name = from_name.strip() or username or str(from_user.get("id", "?"))
        from_label = f"@{username}" if username else from_name

        # Save default_chat_id on first message from this chat
        try:
            data = _load_connectors()
            tg = data.get("telegram") or {}
            if not tg.get("default_chat_id") and chat_id is not None:
                tg["default_chat_id"] = str(chat_id)
                data["telegram"] = tg
                _save_connectors(data)
        except Exception:
            pass

        text = (message.get("text") or message.get("caption") or "").strip()
        file_id, kind, ext = _get_file_id_from_message(message)

        if file_id:
            dest_name = _safe_filename(chat_id, message_id, kind, ext)
            dest_path = _TELEGRAM_FILES_DIR / dest_name
            ok = await _download_file(token, file_id, dest_path)
            if ok:
                # Filename only; frontend uses /api/connectors/telegram/files/<name>
                file_url_path = dest_name
                if kind == "photo":
                    payload = {
                        "type": "image",
                        "update_id": update_id,
                        "from_username": from_label,
                        "from_id": from_user.get("id"),
                        "chat_id": chat_id,
                        "message_id": message_id,
                        "content": f"From Telegram: {from_label} sent an image",
                        "image_url_path": file_url_path,
                        "caption": text or None,
                    }
                elif kind in ("voice", "audio", "document"):
                    payload = {
                        "type": "audio",
                        "update_id": update_id,
                        "from_username": from_label,
                        "from_id": from_user.get("id"),
                        "chat_id": chat_id,
                        "message_id": message_id,
                        "content": f"From Telegram: {from_label} sent {'voice' if kind == 'voice' else 'audio' if kind == 'audio' else 'a file'}",
                        "audio_url_path": file_url_path,
                        "caption": text or None,
                    }
                else:
                    payload = {
                        "type": "system",
                        "update_id": update_id,
                        "from_username": from_label,
                        "chat_id": chat_id,
                        "message_id": message_id,
                        "content": f"From Telegram: {from_label} sent a file",
                        "file_url_path": file_url_path,
                        "caption": text or None,
                    }
                await self._emit("telegram_inbound", payload)
            else:
                await self._emit("telegram_inbound", {
                    "type": "system",
                    "update_id": update_id,
                    "from_username": from_label,
                    "chat_id": chat_id,
                    "message_id": message_id,
                    "content": f"From Telegram: {from_label} sent a file (download failed)",
                })
        if text and not file_id:
            try:
                telegram_append_user(str(chat_id), text, message_id=message_id)
            except Exception:
                pass
            await self._emit("telegram_inbound", {
                "type": "text",
                "update_id": update_id,
                "from_username": from_label,
                "from_id": from_user.get("id"),
                "chat_id": chat_id,
                "message_id": message_id,
                "text": text,
                "content": f"From Telegram ({from_label}): {text}",
            })
        elif text and file_id:
            try:
                telegram_append_user(str(chat_id), text or "(media)", message_id=message_id)
            except Exception:
                pass
            # Already sent media; caption is in payload above
            pass


# Singleton listener instance (started with sio from main)
_listener: Optional[TelegramListener] = None


def get_telegram_listener(sio: Any) -> TelegramListener:
    global _listener
    if _listener is None:
        _listener = TelegramListener(sio)
    return _listener
