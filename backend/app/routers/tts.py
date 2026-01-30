"""
TTS router: Orpheus-TTS and other backends.
Orpheus: https://github.com/canopyai/Orpheus-TTS
Set ORPHEUS_TTS_URL to your Orpheus/Baseten inference URL, or pass endpointOverride in the request.
"""

import asyncio
import logging
import os
import re
from pathlib import Path
from typing import Optional

import httpx
from fastapi import APIRouter, HTTPException, BackgroundTasks, UploadFile, File, Form
from fastapi.responses import Response, FileResponse
from pydantic import BaseModel, Field

from app.services.tts_service import (
    get_tts_state,
    download_orpheus_model,
    check_orpheus_cached,
    run_local_orpheus_cpp_sync,
    run_local_orpheus_sync,
)
from app.services.prosody_engine import (
    naturalize_text,
    get_dynamic_temperature,
    get_pause_duration_ms,
)

router = APIRouter()

# Long-term storage: backend/data/tts/ (same pattern as data/images, data/music)
def _tts_data_dir() -> Path:
    base = Path(__file__).resolve().parent.parent.parent
    d = base / "data" / "tts"
    d.mkdir(parents=True, exist_ok=True)
    return d


def _safe_entry_id(entry_id: str) -> str:
    """Allow only safe chars for filenames (alphanumeric, dash, underscore). No dots."""
    if not entry_id or len(entry_id) > 200:
        return ""
    return re.sub(r"[^a-zA-Z0-9_\-]", "", entry_id) or ""


ORPHEUS_TTS_URL = os.environ.get("ORPHEUS_TTS_URL", "").strip()
# Optional: for Baseten (and similar) use ORPHEUS_TTS_API_KEY; sent as Authorization: Api-Key <key>
ORPHEUS_TTS_API_KEY = os.environ.get("ORPHEUS_TTS_API_KEY", "").strip() or os.environ.get("BASETEN_API_KEY", "").strip()


class OrpheusParams(BaseModel):
    voice: str = Field("tara", description="Orpheus voice: tara, leah, jess, leo, dan, mia, zac, zoe")
    temperature: float = Field(0.7, ge=0.0, le=2.0)
    repetition_penalty: float = Field(1.1, ge=1.0, le=2.0)
    reading_style: Optional[str] = Field(
        None,
        description="neutral | expressive | calm | sick (sniffling) | unsure | angry | sad — strong temp override + emotive tags",
    )
    endpoint_override: Optional[str] = Field(None, description="Override ORPHEUS_TTS_URL for this request")
    # Naturalization: makes speech more human-like
    naturalize: bool = Field(True, description="Enable prosody engine: emotive tags, breath pauses, natural cadence")
    breath_frequency: float = Field(0.35, ge=0.0, le=1.0, description="How often to insert breath pauses (0-1)")
    dynamic_temperature: bool = Field(True, description="Auto-adjust temperature based on text emotion")


class TTSSpeakRequest(BaseModel):
    text: str = Field(..., min_length=1)
    model_type: str = Field("orpheus", description="tts model: browser | orpheus")
    orpheus: Optional[OrpheusParams] = Field(None, description="Used when model_type is orpheus")


@router.post("/speak")
async def tts_speak(request: TTSSpeakRequest):
    """Generate speech via Orpheus-TTS. Returns audio/wav bytes."""
    try:
        if request.model_type != "orpheus":
            raise HTTPException(
                status_code=400,
                detail="Use model_type='orpheus' or use browser TTS from the frontend.",
            )
        if not request.orpheus:
            raise HTTPException(status_code=400, detail="orpheus params required when model_type is orpheus")

        endpoint = request.orpheus.endpoint_override or ORPHEUS_TTS_URL
        voice = request.orpheus.voice
        temperature = request.orpheus.temperature
        repetition_penalty = request.orpheus.repetition_penalty
        style = (request.orpheus.reading_style or "neutral").strip().lower()
        
        # === PROSODY ENGINE: Naturalize text for human-like speech ===
        text_for_prompt = request.text
        prosody_metadata = {}
        
        if request.orpheus.naturalize:
            # Apply prosody engine: emotive tags, breath pauses, emphasis pauses
            text_for_prompt, prosody_metadata = naturalize_text(
                text_for_prompt,
                reading_style=style if style != "neutral" else None,
                enable_emotion_detection=True,
                breath_frequency=request.orpheus.breath_frequency,
                thoughtfulness=0.3 if style in ("calm", "unsure") else 0.15,
            )
            logging.getLogger(__name__).debug(
                "Prosody engine: %s -> %s chars, emotion=%s, transforms=%s",
                prosody_metadata.get('original_length'),
                prosody_metadata.get('final_length'),
                prosody_metadata.get('detected_emotion'),
                prosody_metadata.get('applied_transforms'),
            )
        
        # === DYNAMIC TEMPERATURE: Adjust based on text emotion ===
        if request.orpheus.dynamic_temperature:
            temperature = get_dynamic_temperature(text_for_prompt, temperature, style if style != "neutral" else None)
        
        # === READING STYLE: Strong temperature overrides (after dynamic adjustment) ===
        if style == "expressive":
            temperature = max(temperature, 1.45)
        elif style == "calm":
            temperature = min(temperature, 0.22)
        elif style == "sick":
            # Prosody engine already adds <sniffle> tags, but ensure at least one
            if "<sniffle>" not in text_for_prompt:
                text_for_prompt = "<sniffle> " + text_for_prompt
            temperature = min(temperature, 0.5)
        elif style == "unsure":
            if "<sigh>" not in text_for_prompt:
                text_for_prompt = "<sigh> " + text_for_prompt
            temperature = max(temperature, 1.35)
        elif style == "angry":
            temperature = max(temperature, 1.5)
        elif style == "sad":
            if "<sigh>" not in text_for_prompt and "<sob>" not in text_for_prompt:
                text_for_prompt = "<sigh> " + text_for_prompt
            temperature = min(temperature, 0.28)
        
        # Orpheus prompt format: "{voice}: {text}"
        prompt = f"{voice}: {text_for_prompt}"

        # No URL set: try local inference (Mac/CPU via orpheus-cpp, then CUDA via orpheus-speech)
        if not endpoint:
            loop = asyncio.get_event_loop()
            # 1) Try orpheus-cpp first (works on Mac Metal and CPU)
            try:
                audio_bytes = await loop.run_in_executor(
                    None,
                    lambda: run_local_orpheus_cpp_sync(text=text_for_prompt, voice=voice),
                )
                if audio_bytes is not None:
                    return Response(content=audio_bytes, media_type="audio/wav")
            except Exception as e:
                logging.getLogger(__name__).exception("TTS local inference (orpheus-cpp) failed (502): %s", e)
                raise HTTPException(status_code=502, detail=str(e)) from e

            # 2) Fall back to orpheus-speech (CUDA) if model was downloaded
            if check_orpheus_cached():
                try:
                    audio_bytes = await loop.run_in_executor(
                        None,
                        lambda: run_local_orpheus_sync(
                            prompt=prompt,
                            voice=voice,
                            temperature=temperature,
                            repetition_penalty=repetition_penalty,
                        ),
                    )
                except Exception as e:
                    logging.getLogger(__name__).exception("TTS local inference failed (502): %s", e)
                    raise HTTPException(status_code=502, detail=str(e)) from e
                if audio_bytes is not None:
                    return Response(content=audio_bytes, media_type="audio/wav")
                logging.getLogger(__name__).warning(
                    "TTS 503: Model cached but orpheus-speech not available (pip install orpheus-speech in backend env)"
                )
                raise HTTPException(
                    status_code=503,
                    detail="Model is downloaded but local inference needs orpheus-speech. Run: pip install orpheus-speech. Or set ORPHEUS_TTS_URL for remote inference.",
                )
            logging.getLogger(__name__).warning(
                "TTS 503: No URL and no local Orpheus. On Mac: make install-orpheus-mac. Or set ORPHEUS_TTS_URL."
            )
            raise HTTPException(
                status_code=503,
                detail="Orpheus TTS URL not configured. On Mac run: make install-orpheus-mac (orpheus-cpp). Or set ORPHEUS_TTS_URL for remote inference.",
            )

        # Remote inference (use adjusted temperature from reading_style)
        body = {
            "prompt": prompt,
            "voice": voice,
            "temperature": temperature,
            "repetition_penalty": repetition_penalty,
        }
        api_key = ORPHEUS_TTS_API_KEY
        headers = {}
        if api_key:
            headers["Authorization"] = f"Api-Key {api_key}"

        async with httpx.AsyncClient(timeout=120.0) as client:
            r = await client.post(endpoint, json=body, headers=headers if api_key else None)
            r.raise_for_status()
            content_type = r.headers.get("content-type", "")

            if "application/json" in content_type:
                data = r.json()
                b64 = data.get("data") or data.get("output") or data.get("audio_base64") or data.get("audio")
                if b64 is None:
                    raise HTTPException(status_code=502, detail="Orpheus API returned JSON without audio data")
                import base64
                audio_bytes = base64.b64decode(b64)
                return Response(content=audio_bytes, media_type="audio/wav")
            return Response(content=r.content, media_type="audio/wav")
    except HTTPException:
        raise
    except httpx.HTTPStatusError as e:
        raise HTTPException(status_code=e.response.status_code, detail=e.response.text or str(e))
    except Exception as e:
        logging.getLogger(__name__).exception("TTS speak failed")
        raise HTTPException(status_code=502, detail=str(e)) from e


@router.get("/status")
async def tts_status():
    """Return Orpheus TTS config and model download status."""
    state = get_tts_state()
    check_orpheus_cached()
    return {
        "orpheus_configured": bool(ORPHEUS_TTS_URL),
        "message": "Set ORPHEUS_TTS_URL to your Orpheus/Baseten inference URL to use Orpheus TTS.",
        "orpheus_downloading": state.is_downloading,
        "orpheus_download_progress": state.download_progress,
        "orpheus_download_message": state.download_message,
        "orpheus_model_cached": state.model_cached,
        "orpheus_error": state.error,
    }


@router.post("/download-model")
async def tts_download_model(background_tasks: BackgroundTasks):
    """Start downloading the Orpheus TTS model from Hugging Face (canopylabs/orpheus-3b-0.1-ft)."""
    state = get_tts_state()
    if state.is_downloading:
        return {"status": "already_downloading", "message": "Orpheus model download is already in progress."}
    if state.model_cached or check_orpheus_cached():
        return {"status": "already_cached", "message": "Orpheus model is already downloaded."}
    background_tasks.add_task(download_orpheus_model)
    return {"status": "started", "message": "Orpheus model download started. Check GET /api/tts/status for progress."}


# --- Prosody hints for streaming TTS ---

class PauseHintRequest(BaseModel):
    sentence: str = Field(..., min_length=1)


@router.post("/pause-hint")
async def tts_pause_hint(request: PauseHintRequest):
    """Return suggested pause duration (ms) after a sentence for natural pacing."""
    duration = get_pause_duration_ms(request.sentence)
    return {"pause_ms": duration, "sentence": request.sentence}


# --- Long-term TTS recordings (data/tts folder) ---

@router.post("/files")
async def tts_save_file(entry_id: str = Form(...), file: UploadFile = File(...)):
    """Save a TTS WAV recording for an entry. Stored under data/tts/{entry_id}.wav."""
    safe_id = _safe_entry_id(entry_id)
    if not safe_id:
        raise HTTPException(status_code=400, detail="Invalid entry_id")
    path = _tts_data_dir() / f"{safe_id}.wav"
    try:
        content = await file.read()
        path.write_bytes(content)
        return {"status": "saved", "entry_id": entry_id, "path": str(path)}
    except Exception as e:
        logging.getLogger(__name__).exception("TTS save file failed: %s", e)
        raise HTTPException(status_code=500, detail=str(e)) from e


@router.get("/files/{entry_id}")
async def tts_get_file(entry_id: str):
    """Return a saved TTS WAV file for an entry, or 404."""
    safe_id = _safe_entry_id(entry_id)
    if not safe_id:
        raise HTTPException(status_code=400, detail="Invalid entry_id")
    path = _tts_data_dir() / f"{safe_id}.wav"
    if not path.is_file():
        raise HTTPException(status_code=404, detail="No TTS recording for this entry")
    return FileResponse(path, media_type="audio/wav")
