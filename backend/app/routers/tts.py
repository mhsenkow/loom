"""
TTS router: Orpheus-TTS and other backends.
Orpheus: https://github.com/canopyai/Orpheus-TTS
Set ORPHEUS_TTS_URL to your Orpheus/Baseten inference URL, or pass endpointOverride in the request.
"""

import asyncio
import logging
import os
from typing import Optional

import httpx
from fastapi import APIRouter, HTTPException, BackgroundTasks
from fastapi.responses import Response
from pydantic import BaseModel, Field

from app.services.tts_service import (
    get_tts_state,
    download_orpheus_model,
    check_orpheus_cached,
    run_local_orpheus_cpp_sync,
    run_local_orpheus_sync,
)

router = APIRouter()

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
        # Reading style: strong temperature override + Orpheus emotive tags (see Orpheus README)
        style = (request.orpheus.reading_style or "neutral").strip().lower()
        text_for_prompt = request.text
        if style == "expressive":
            temperature = max(temperature, 1.45)
        elif style == "calm":
            temperature = min(temperature, 0.22)
        elif style == "sick":
            text_for_prompt = "<sniffle> <sniffle> " + request.text
            temperature = min(temperature, 0.5)
        elif style == "unsure":
            text_for_prompt = "<sigh> " + request.text
            temperature = max(temperature, 1.35)
        elif style == "angry":
            temperature = max(temperature, 1.5)
        elif style == "sad":
            text_for_prompt = "<sigh> " + request.text
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
