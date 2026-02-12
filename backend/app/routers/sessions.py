"""
Sessions API endpoints for terminal session persistence with media tracking.
"""

from fastapi import APIRouter, HTTPException
from fastapi.responses import FileResponse
from pydantic import BaseModel
from typing import Optional, List
import os
import subprocess
import sys
import time
import logging
from pathlib import Path

from app.services.storage import (
    get_sessions,
    get_session,
    save_session as storage_save_session,
    delete_session as storage_delete_session,
)

router = APIRouter()
logger = logging.getLogger("loom.router.sessions")


class SaveSessionRequest(BaseModel):
    name: str
    entries: list
    mediaFiles: Optional[List[str]] = []


class DeleteSessionRequest(BaseModel):
    name: str
    deleteMedia: bool = False  # Whether to also delete associated media files


@router.get("")
async def list_sessions():
    """List all saved sessions (index only, no entries)."""
    sessions = get_sessions()
    return {
        "sessions": sessions,
        "count": len(sessions),
    }


@router.get("/data-path")
async def get_data_path():
    """Get the absolute path to the data folder."""
    data_dir = Path(__file__).resolve().parent.parent.parent / "data"
    return {
        "path": str(data_dir),
        "exists": data_dir.exists(),
        "images": str(data_dir / "images"),
        "music": str(data_dir / "music"),
    }


@router.get("/{name}")
async def load_session(name: str):
    """Load a session with full entries."""
    session = get_session(name)
    if not session:
        raise HTTPException(status_code=404, detail=f"Session '{name}' not found")
    return session


@router.post("")
async def create_or_update_session(request: SaveSessionRequest):
    """Save or update a session."""
    saved_at = time.time()
    session = storage_save_session(
        name=request.name,
        entries=request.entries,
        media_files=request.mediaFiles or [],
        saved_at=saved_at,
    )
    return {
        "status": "saved",
        "session": session,
    }


@router.delete("/{name}")
async def remove_session(name: str, delete_media: bool = False):
    """Delete a session and optionally its media files."""
    # Get session first to find media files
    session = get_session(name)
    if not session:
        raise HTTPException(status_code=404, detail=f"Session '{name}' not found")
    
    # Optionally delete media files
    deleted_files = []
    if delete_media and session.get("mediaFiles"):
        data_dir = Path(__file__).resolve().parent.parent.parent / "data"
        for media_path in session["mediaFiles"]:
            try:
                # Media paths are relative like "/api/music/files/gen_123.wav"
                # Extract filename and check both images and music folders
                filename = media_path.split("/")[-1] if "/" in media_path else media_path
                for folder in ["images", "music"]:
                    full_path = data_dir / folder / filename
                    if full_path.exists():
                        full_path.unlink()
                        deleted_files.append(str(full_path))
            except Exception as e:
                logger.warning("delete_media_file_failed media_path=%s error=%s", media_path, e)
    
    # Delete session from DB
    success = storage_delete_session(name)
    if not success:
        raise HTTPException(status_code=500, detail="Failed to delete session")
    
    return {
        "status": "deleted",
        "name": name,
        "deletedMediaFiles": deleted_files,
    }


@router.post("/open-folder")
async def open_data_folder():
    """Open the data folder in Finder (Mac) or file explorer."""
    data_dir = Path(__file__).resolve().parent.parent.parent / "data"
    
    if not data_dir.exists():
        data_dir.mkdir(parents=True, exist_ok=True)
    
    try:
        if sys.platform == "darwin":
            # macOS - use 'open' command
            subprocess.run(["open", str(data_dir)], check=True)
        elif sys.platform == "win32":
            # Windows - use 'explorer' command
            subprocess.run(["explorer", str(data_dir)], check=True)
        else:
            # Linux - try xdg-open
            subprocess.run(["xdg-open", str(data_dir)], check=True)
        
        return {
            "status": "opened",
            "path": str(data_dir),
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to open folder: {e}")


def _resolve_model_folder(target: str) -> Path:
    normalized = target.strip().lower()
    if normalized == "ollama":
        configured = os.getenv("OLLAMA_MODELS", "").strip()
        if configured:
            return Path(configured).expanduser()
        return Path.home() / ".ollama" / "models"
    if normalized == "diffusion":
        return Path(__file__).resolve().parent.parent.parent / "models" / "diffusion"
    if normalized == "music":
        return Path.home() / ".cache" / "ace-step" / "checkpoints"
    raise HTTPException(status_code=400, detail=f"Unknown model folder target: {target}")


@router.post("/open-model-folder")
async def open_model_folder(target: str = "ollama"):
    """Open a model storage folder in Finder (Mac) or file explorer."""
    folder = _resolve_model_folder(target)
    folder.mkdir(parents=True, exist_ok=True)

    try:
        if sys.platform == "darwin":
            subprocess.run(["open", str(folder)], check=True)
        elif sys.platform == "win32":
            subprocess.run(["explorer", str(folder)], check=True)
        else:
            subprocess.run(["xdg-open", str(folder)], check=True)

        return {
            "status": "opened",
            "target": target,
            "path": str(folder),
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to open model folder: {e}")
