"""
Image generation API endpoints
Supports: HuggingFace API, Local diffusers (MPS/CUDA), ComfyUI
"""

from fastapi import APIRouter, HTTPException, BackgroundTasks
from pydantic import BaseModel
from typing import Optional
import asyncio

from app.services.image_gen import image_gen_service
from app.services.local_image_gen import local_image_gen

router = APIRouter()


class ImageGenRequest(BaseModel):
    prompt: str
    model: str = "sdxl"
    negative_prompt: str = ""
    width: int = 1024
    height: int = 1024
    steps: int = 30
    guidance_scale: float = 7.5
    seed: Optional[int] = None
    provider: str = "local"  # "local", "huggingface", or "comfyui"


class SetTokenRequest(BaseModel):
    token: str


class SetComfyUIRequest(BaseModel):
    url: str


class DownloadModelRequest(BaseModel):
    url: str
    name: str


@router.post("/generate")
async def generate_image(request: ImageGenRequest):
    """Generate an image from a text prompt"""
    try:
        if request.provider == "local":
            # Use local diffusers with MPS/CUDA
            result = await local_image_gen.generate(
                prompt=request.prompt,
                model=request.model,
                negative_prompt=request.negative_prompt,
                width=request.width,
                height=request.height,
                steps=request.steps,
                guidance_scale=request.guidance_scale,
                seed=request.seed,
            )
        elif request.provider == "huggingface":
            # Use HuggingFace Inference API
            result = await image_gen_service.generate_hf(
                prompt=request.prompt,
                model=request.model,
                negative_prompt=request.negative_prompt,
                width=request.width,
                height=request.height,
            )
        elif request.provider == "comfyui":
            # Use local ComfyUI
            result = await image_gen_service.generate_comfyui(
                prompt=request.prompt,
                model=request.model,
                negative_prompt=request.negative_prompt,
                width=request.width,
                height=request.height,
            )
        else:
            raise ValueError(f"Unknown provider: {request.provider}")
        
        return result
    
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except RuntimeError as e:
        raise HTTPException(status_code=500, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Image generation failed: {e}")


@router.get("/models")
async def list_models():
    """List available image models"""
    return {
        "local": local_image_gen.list_models(),
        "huggingface": list(image_gen_service.MODELS.keys()),
        "device": local_image_gen.device,
    }


@router.post("/models/load")
async def load_model(model: str):
    """Pre-load a model into memory"""
    try:
        local_image_gen.load_model(model)
        return {"status": "ok", "model": model, "message": f"Model {model} loaded"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/models/unload")
async def unload_model():
    """Unload current model to free memory"""
    local_image_gen.unload_model()
    return {"status": "ok", "message": "Model unloaded"}


@router.post("/models/download")
async def download_model(request: DownloadModelRequest):
    """Download a model from CivitAI or other URL"""
    try:
        path = local_image_gen.download_civitai_model(request.url, request.name)
        return {"status": "ok", "path": path, "name": request.name}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/config/huggingface")
async def set_hf_token(request: SetTokenRequest):
    """Set HuggingFace API token"""
    image_gen_service.set_hf_token(request.token)
    local_image_gen.set_hf_token(request.token)
    return {"status": "ok", "message": "HuggingFace token set"}


@router.post("/config/comfyui")
async def set_comfyui_url(request: SetComfyUIRequest):
    """Set ComfyUI URL"""
    image_gen_service.set_comfyui_url(request.url)
    return {"status": "ok", "message": "ComfyUI URL set"}


@router.get("/config/comfyui/check")
async def check_comfyui():
    """Check if ComfyUI is running"""
    is_running = await image_gen_service.check_comfyui()
    return {"running": is_running}


@router.get("/status")
async def get_status():
    """Get image generation status"""
    return {
        "device": local_image_gen.device,
        "current_model": local_image_gen.current_model,
        "models_dir": str(local_image_gen.models_dir),
    }
