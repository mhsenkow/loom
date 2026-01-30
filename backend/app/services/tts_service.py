"""
Orpheus-TTS model download and optional local inference.
- Mac / no GPU: orpheus-cpp + llama-cpp-python (Metal on Apple Silicon).
- CUDA: orpheus-speech (vllm).
"""

import io
import asyncio
import logging
import os
import sys
from typing import Optional

logger = logging.getLogger(__name__)

# Hugging Face repo (finetuned prod model). For orpheus-speech package use canopylabs/orpheus-tts-0.1-finetune-prod if different.
ORPHEUS_REPO_ID = os.environ.get("ORPHEUS_HF_REPO", "canopylabs/orpheus-3b-0.1-ft")
# Model name for orpheus_tts.OrpheusModel (may match repo or be e.g. canopylabs/orpheus-tts-0.1-finetune-prod)
ORPHEUS_LOCAL_MODEL_NAME = os.environ.get("ORPHEUS_LOCAL_MODEL_NAME", ORPHEUS_REPO_ID)


class TTSDownloadState:
    def __init__(self):
        self.is_downloading = False
        self.download_progress = 0.0
        self.download_message = ""
        self.model_cached = False
        self.error = None

    def reset(self):
        self.is_downloading = False
        self.download_progress = 0.0
        self.download_message = ""
        self.error = None


_tts_state = TTSDownloadState()


def _check_cache_sync() -> bool:
    """Check if model is already in Hugging Face cache."""
    try:
        from huggingface_hub import scan_cache_dir
        for repo in scan_cache_dir().repos:
            if repo.repo_id == ORPHEUS_REPO_ID:
                return True
        return False
    except Exception:
        return False


def _download_sync():
    """Run snapshot_download in this thread. Updates _tts_state."""
    global _tts_state
    _tts_state.is_downloading = True
    _tts_state.download_progress = 0.0
    _tts_state.download_message = "Downloading Orpheus model from Hugging Face..."
    _tts_state.error = None
    try:
        from huggingface_hub import snapshot_download
        _tts_state.download_message = f"Downloading {ORPHEUS_REPO_ID} (this may take a while)..."
        snapshot_download(
            repo_id=ORPHEUS_REPO_ID,
            resume_download=True,
            local_files_only=False,
        )
        _tts_state.download_progress = 100.0
        _tts_state.download_message = "Orpheus model ready."
        _tts_state.model_cached = True
        logger.info("Orpheus TTS model downloaded successfully.")
    except Exception as e:
        _tts_state.error = str(e)
        _tts_state.download_message = f"Download failed: {e}"
        logger.exception("Orpheus model download failed")
    finally:
        _tts_state.is_downloading = False


async def download_orpheus_model():
    """Start Orpheus model download in a background thread."""
    if _tts_state.is_downloading:
        return
    if _tts_state.model_cached:
        return
    loop = asyncio.get_event_loop()
    await loop.run_in_executor(None, _download_sync)


def get_tts_state() -> TTSDownloadState:
    return _tts_state


def check_orpheus_cached() -> bool:
    """Update and return whether model is cached."""
    if _tts_state.model_cached:
        return True
    _tts_state.model_cached = _check_cache_sync()
    return _tts_state.model_cached


def run_local_orpheus_cpp_sync(text: str, voice: str = "tara") -> Optional[bytes]:
    """
    Run Orpheus TTS locally via orpheus-cpp (llama.cpp backend). Works on Mac (Metal) and CPU.
    Returns WAV bytes or None if orpheus-cpp not installed.
    """
    # Suppress verbose ggml Metal "skipping kernel_* (not supported)" messages on Mac
    os.environ["LLAMA_LOG_LEVEL"] = os.environ.get("LLAMA_LOG_LEVEL", "ERROR")
    try:
        from orpheus_cpp import OrpheusCpp
    except ImportError:
        logger.info("orpheus-cpp not installed; cannot run local Orpheus on Mac/CPU")
        return None

    import wave
    import numpy as np

    try:
        # Redirect stderr (fd 2) during init to suppress ggml Metal "skipping kernel" messages (C-level prints)
        stderr_fd = sys.stderr.fileno()
        stderr_copy = os.dup(stderr_fd)
        try:
            with open(os.devnull, "w") as devnull:
                os.dup2(devnull.fileno(), stderr_fd)
            try:
                orpheus = OrpheusCpp(verbose=False, lang="en", n_gpu_layers=-1)
            except TypeError:
                orpheus = OrpheusCpp(verbose=False, lang="en")
        finally:
            os.dup2(stderr_copy, stderr_fd)
            os.close(stderr_copy)
    except Exception as e:
        logger.exception("OrpheusCpp init failed")
        raise RuntimeError(f"Orpheus-cpp init failed: {e}") from e

    try:
        chunks = []
        for _sr, chunk in orpheus.stream_tts_sync(text, options={"voice_id": voice}):
            if chunk is not None and chunk.size > 0:
                chunks.append(chunk)
        if not chunks:
            raise RuntimeError("Orpheus-cpp produced no audio")
        audio = np.concatenate(chunks, axis=1).squeeze()
        if audio.dtype == np.float32 or audio.dtype == np.float64:
            audio = (np.clip(audio, -1.0, 1.0) * 32767).astype(np.int16)
        elif audio.dtype != np.int16:
            audio = audio.astype(np.int16)
        buf = io.BytesIO()
        with wave.open(buf, "wb") as wf:
            wf.setnchannels(1)
            wf.setsampwidth(2)
            wf.setframerate(24000)
            wf.writeframes(audio.tobytes())
        buf.seek(0)
        return buf.read()
    except Exception as e:
        logger.exception("Orpheus-cpp inference failed")
        raise RuntimeError(f"Orpheus-cpp inference failed: {e}") from e


def run_local_orpheus_sync(
    prompt: str,
    voice: str = "tara",
    temperature: float = 0.7,
    repetition_penalty: float = 1.1,
) -> Optional[bytes]:
    """
    Run Orpheus TTS locally using the downloaded model. Returns WAV bytes or None if orpheus-speech not installed.
    Call from a thread (e.g. run_in_executor); loading and inference are blocking.
    """
    try:
        from orpheus_tts import OrpheusModel
    except ImportError:
        logger.info("orpheus-speech not installed; cannot run local Orpheus inference")
        return None
    except Exception as e:
        err_msg = str(e).lower()
        if "cuda" in err_msg or "torch not compiled" in err_msg:
            raise RuntimeError(
                "Local Orpheus requires a CUDA GPU (NVIDIA). On Mac (M1/M2/M3) use Browser TTS or set ORPHEUS_TTS_URL (e.g. Baseten) for remote inference."
            ) from e
        raise

    import wave

    try:
        model = OrpheusModel(
            model_name=ORPHEUS_LOCAL_MODEL_NAME,
            max_model_len=2048,
        )
    except Exception as e:
        logger.exception("Failed to load Orpheus model for local inference")
        err_msg = str(e).lower()
        if "cuda" in err_msg or "torch not compiled" in err_msg:
            raise RuntimeError(
                "Local Orpheus requires a CUDA GPU (NVIDIA). On Mac use Browser TTS or set ORPHEUS_TTS_URL (e.g. Baseten)."
            ) from e
        raise RuntimeError(f"Orpheus model load failed: {e}") from e

    try:
        syn_tokens = model.generate_speech(prompt=prompt, voice=voice)
        buf = io.BytesIO()
        with wave.open(buf, "wb") as wf:
            wf.setnchannels(1)
            wf.setsampwidth(2)
            wf.setframerate(24000)
            for audio_chunk in syn_tokens:
                if audio_chunk:
                    wf.writeframes(audio_chunk)
        buf.seek(0)
        return buf.read()
    except Exception as e:
        logger.exception("Local Orpheus inference failed")
        err_msg = str(e).lower()
        if "cuda" in err_msg or "torch not compiled" in err_msg:
            raise RuntimeError(
                "Local Orpheus requires a CUDA GPU (NVIDIA). On Mac use Browser TTS or set ORPHEUS_TTS_URL (e.g. Baseten)."
            ) from e
        raise RuntimeError(f"Orpheus inference failed: {e}") from e
