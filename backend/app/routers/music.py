
from fastapi import APIRouter, HTTPException, BackgroundTasks
from pydantic import BaseModel, Field
from typing import Optional
from app.services.music_service import music_service
import os
from fastapi.responses import FileResponse

router = APIRouter()

class MusicGenerationRequest(BaseModel):
    prompt: str = Field(..., description="Description of the music style and mood")
    lyrics: Optional[str] = Field(None, description="Lyrics to include in the song")
    use_lyrics: bool = Field(False, description="Whether to generate vocals/lyrics")
    duration: int = Field(10, ge=5, le=300, description="Duration in seconds")
    guidance_scale: float = Field(7.0, description="Creativity level (Low to High)")
    steps: int = Field(20, description="Complexity/Texture level")

@router.post("/generate")
async def generate_music(request: MusicGenerationRequest):
    try:
        audio_url = await music_service.generate(
            prompt=request.prompt,
            lyrics=request.lyrics if request.use_lyrics else None,
            duration=request.duration,
            guidance_scale=request.guidance_scale,
            steps=request.steps
        )
        return {"status": "success", "audio_url": audio_url}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/status")
async def get_status():
    """Returns detailed status of music model readiness."""
    return {
        "model_ready": music_service.model is not None,
        "model_downloading": music_service.is_downloading,
        "download_progress": music_service.download_progress,
        "download_message": music_service.download_message,
        "has_ace_step": music_service.has_ace_step,
        "device": music_service.device,
        "model_name": "ACE-Step-v1-3.5B",
        "model_size_gb": 13.0,
        "setup_required": not music_service.model and not music_service.is_downloading,
    }

@router.post("/download-model")
async def download_model(background_tasks: BackgroundTasks):
    """Initiates model download in the background."""
    if music_service.is_downloading:
        return {"status": "already_downloading", "message": "Model download is already in progress."}
    
    if music_service.model is not None:
        return {"status": "already_ready", "message": "Model is already loaded."}
    
    # Start download in background
    background_tasks.add_task(music_service.download_and_load_model)
    return {"status": "started", "message": "Model download started. Check /status for progress."}

@router.get("/files/{filename}")
async def get_music_file(filename: str):
    # Security: basic traversal prevention
    if ".." in filename or "/" in filename:
        raise HTTPException(status_code=400, detail="Invalid filename")
        
    path = os.path.join("data/music", filename)
    if not os.path.exists(path):
        raise HTTPException(status_code=404, detail="File not found")
        
    return FileResponse(path, media_type="audio/wav")

