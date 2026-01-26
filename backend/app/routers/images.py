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


class ImageAnalysisRequest(BaseModel):
    image_base64: str  # Base64-encoded image
    prompt: Optional[str] = "Describe this image in detail. What do you see? List the key elements, objects, text, and any notable features."
    model: Optional[str] = None  # Vision model to use


@router.get("/check-vision-models")
async def check_vision_models():
    """Check for available vision models and return recommendations"""
    from app.services.ollama_client import ollama_client
    
    try:
        models = await ollama_client.list_models()
        vision_keywords = ['llava', 'bakllava', 'moondream', 'llama-vision']
        
        available = []
        for m in models:
            name = m.get("name", "").lower()
            if any(keyword in name for keyword in vision_keywords):
                available.append(m.get("name"))
        
        # Recommended models if none available
        recommendations = [
            {"name": "llava:7b", "description": "LLaVA 7B - Best balance of quality and speed", "size": "~4.3GB"},
            {"name": "llava:13b", "description": "LLaVA 13B - Higher quality, more accurate", "size": "~7.3GB"},
            {"name": "bakllava", "description": "BakLLaVA - Fast and efficient vision model", "size": "~3.8GB"},
            {"name": "moondream", "description": "Moondream - Lightweight vision model", "size": "~1.6GB"},
        ]
        
        return {
            "available": available,
            "recommendations": recommendations,
            "has_vision_model": len(available) > 0,
        }
    except Exception as e:
        return {
            "available": [],
            "recommendations": [],
            "has_vision_model": False,
            "error": str(e),
        }


@router.post("/analyze")
async def analyze_image(request: ImageAnalysisRequest):
    """Analyze an image using a vision model"""
    from app.services.ollama_client import ollama_client
    
    try:
        # Check if image data is valid
        if not request.image_base64 or len(request.image_base64) < 100:
            raise HTTPException(status_code=400, detail="Invalid or empty image data")
        
        # First check for vision models
        models = await ollama_client.list_models()
        vision_keywords = ['llava', 'bakllava', 'moondream', 'llama-vision']
        available_vision = [m.get("name") for m in models if any(keyword in m.get("name", "").lower() for keyword in vision_keywords)]
        
        # If no vision model and none specified, return early with recommendations
        if not request.model and not available_vision:
            recommendations = [
                {"name": "llava:7b", "description": "LLaVA 7B - Best balance of quality and speed", "size": "~4.3GB"},
                {"name": "llava:13b", "description": "LLaVA 13B - Higher quality, more accurate", "size": "~7.3GB"},
                {"name": "bakllava", "description": "BakLLaVA - Fast and efficient vision model", "size": "~3.8GB"},
                {"name": "moondream", "description": "Moondream - Lightweight vision model", "size": "~1.6GB"},
            ]
            return {
                "success": False,
                "status": "no-model",
                "available_vision_models": [],
                "recommended_models": recommendations,
                "error": "No vision models found. Please install one to analyze images.",
            }
        
        analysis = await ollama_client.analyze_image(
            image_base64=request.image_base64,
            prompt=request.prompt,
            model=request.model,
        )
        
        # Check if analysis suggests the model didn't see the image
        if not analysis or "no image" in analysis.lower() or "don't have an image" in analysis.lower():
            error_msg = "Vision model did not receive the image. "
            if not available_vision:
                error_msg += "No vision models detected. Please install one."
            else:
                error_msg += f"Available vision models: {', '.join(available_vision)}. Try specifying one explicitly."
            
            raise HTTPException(status_code=400, detail=error_msg)
        
        return {
            "success": True,
            "analysis": analysis,
            "model": request.model or "auto-detected",
            "available_vision_models": available_vision,
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Image analysis failed: {str(e)}")
