"""
Image generation API endpoints
Supports: HuggingFace API, Local diffusers (MPS/CUDA), ComfyUI
"""

from fastapi import APIRouter, HTTPException, BackgroundTasks
from fastapi.responses import FileResponse
from pydantic import BaseModel
from typing import Optional
from pathlib import Path
import asyncio
import logging

from app.services.image_gen import image_gen_service
from app.services.local_image_gen import local_image_gen

router = APIRouter()
logger = logging.getLogger("loom.router.images")


class ImageGenRequest(BaseModel):
    prompt: str
    model: str = "sdxl"
    negative_prompt: str = ""
    width: int = 1024
    height: int = 1024
    steps: int = 30
    guidance_scale: float = 7.5
    seed: Optional[int] = None
    provider: str = "local"  # "local", "huggingface", "comfyui", or "ollama"
    input_image: Optional[str] = None  # Base64 image data for image-to-image editing


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
        # Auto-detect cloud provider from model prefix (e.g., "openai:dall-e-3")
        # Only split on known cloud providers, not Ollama version tags like ":fp16"
        provider = request.provider
        model = request.model
        if ":" in model:
            prefix = model.split(":", 1)[0]
            if prefix in ("openai", "gemini", "google"):
                provider = prefix if prefix != "google" else "gemini"
                model = model.split(":", 1)[1]

        if provider == "ollama":
            # Use Ollama image generation models (like flux2-klein)
            from app.services.ollama_client import ollama_client
            image_data = await ollama_client.generate_image(
                prompt=request.prompt,
                model=model,
                input_image=request.input_image,  # For image-to-image editing
            )
            return {
                "status": "success",
                "image": image_data,
                "model": model or "auto-detected",
                "provider": "ollama",
            }
        elif provider == "local":
            # Use local diffusers with MPS/CUDA
            result = await local_image_gen.generate(
                prompt=request.prompt,
                model=model,
                negative_prompt=request.negative_prompt,
                width=request.width,
                height=request.height,
                steps=request.steps,
                guidance_scale=request.guidance_scale,
                seed=request.seed,
            )
        elif provider == "huggingface":
            # Use HuggingFace Inference API
            result = await image_gen_service.generate_hf(
                prompt=request.prompt,
                model=model,
                negative_prompt=request.negative_prompt,
                width=request.width,
                height=request.height,
            )
        elif provider == "comfyui":
            # Use local ComfyUI
            result = await image_gen_service.generate_comfyui(
                prompt=request.prompt,
                model=model,
                negative_prompt=request.negative_prompt,
                width=request.width,
                height=request.height,
            )
        elif provider == "openai":
            # Use OpenAI DALL-E
            from app.services.provider_manager import provider_manager
            openai_provider = provider_manager.get_provider("openai")
            if not openai_provider or not openai_provider._api_key:
                raise ValueError("OpenAI not connected. Add your API key in ☁ Providers.")
            import openai as openai_sdk
            client = openai_sdk.AsyncOpenAI(api_key=openai_provider._api_key)
            dalle_model = model if model and model.startswith("dall-e") else "dall-e-3"
            size = "1024x1024"
            if request.width > 1024 or request.height > 1792:
                size = "1792x1024"
            elif request.height > request.width:
                size = "1024x1792"

            response = await client.images.generate(
                model=dalle_model,
                prompt=request.prompt,
                n=1,
                size=size,
                response_format="b64_json",
            )
            image_b64 = response.data[0].b64_json
            result = {
                "status": "success",
                "image": f"data:image/png;base64,{image_b64}",
                "model": dalle_model,
                "provider": "openai",
            }
        elif provider == "gemini":
            # Use Google Gemini Imagen
            from app.services.provider_manager import provider_manager
            gemini_provider = provider_manager.get_provider("gemini")
            if not gemini_provider or not gemini_provider._api_key:
                raise ValueError("Gemini not connected. Add your API key in ☁ Providers.")
            from google import genai
            client = genai.Client(api_key=gemini_provider._api_key)
            imagen_model = model if model and "imagen" in model else "imagen-3.0-generate-002"
            response = await asyncio.to_thread(
                client.models.generate_images,
                model=imagen_model,
                prompt=request.prompt,
                config=genai.types.GenerateImagesConfig(
                    number_of_images=1,
                ),
            )
            if response.generated_images and len(response.generated_images) > 0:
                import base64
                image_bytes = response.generated_images[0].image.image_bytes
                image_b64 = base64.b64encode(image_bytes).decode("utf-8")
                result = {
                    "status": "success",
                    "image": f"data:image/png;base64,{image_b64}",
                    "model": imagen_model,
                    "provider": "gemini",
                }
            else:
                raise RuntimeError("Gemini Imagen returned no images")
        else:
            raise ValueError(f"Unknown provider: {provider}")
        
        return result
    
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except RuntimeError as e:
        raise HTTPException(status_code=500, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Image generation failed: {e}")


@router.get("/models")
async def list_models():
    """List available image models - only actually downloaded/available ones"""
    from app.services.ollama_client import ollama_client
    
    # Get Ollama image generation models (actually downloaded)
    ollama_image_models = []
    try:
        ollama_models = await ollama_client.list_models()
        image_gen_keywords = ['flux', 'flux2', 'stable-diffusion']
        for m in ollama_models:
            name = m.get("name", "").lower()
            if any(keyword in name for keyword in image_gen_keywords):
                ollama_image_models.append({
                    "name": m.get("name"),
                    "type": "ollama",
                    "vram": "varies",
                })
    except Exception as e:
        logger.warning("failed_to_fetch_ollama_image_models error=%s", e)
    
    # Get local diffusers models (only if actually downloaded/cached)
    local_models = []
    try:
        from pathlib import Path
        models_dir = local_image_gen.models_dir
        
        # Check for local .safetensors files
        for f in models_dir.glob("**/*.safetensors"):
            local_models.append({
                "name": f.stem,
                "path": str(f),
                "type": "local",
                "vram": "varies",
            })
        
        # For predefined models, check if they're actually cached
        # Only include if they exist in HuggingFace cache
        from app.services.local_image_gen import MODELS
        cache_dir = Path.home() / ".cache" / "huggingface" / "hub"
        
        for name, info in MODELS.items():
            repo_id = info["repo"].replace("/", "--")
            cache_path = cache_dir / f"models--{repo_id}"
            # Check if model files exist in cache
            if cache_path.exists():
                # Look for model files (safetensors, bin, etc.)
                has_model_files = any(cache_path.rglob("*.safetensors")) or any(cache_path.rglob("*.bin"))
                if has_model_files:
                    local_models.append({
                        "name": name,
                        "repo": info["repo"],
                        "type": info["type"],
                        "vram": info["vram"],
                    })
    except Exception as e:
        logger.warning("failed_to_check_local_image_models error=%s", e)
    
    # Combine both sources - Ollama models first (they're actually downloaded)
    all_models = ollama_image_models + local_models
    
    return {
        "local": all_models,  # All actually available models
        "ollama": ollama_image_models,
        "diffusers": local_models,
        "huggingface": list(image_gen_service.MODELS.keys()),
        "hf_models": list(image_gen_service.MODELS.keys()),  # Alias for frontend
        "device": local_image_gen.device,
        "current_model": local_image_gen.current_model,
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


@router.get("/files/{filename}")
async def get_image_file(filename: str):
    """Serve a saved image file"""
    images_dir = Path(__file__).parent.parent.parent / "data" / "images"
    filepath = images_dir / filename
    
    if not filepath.exists():
        raise HTTPException(status_code=404, detail=f"Image not found: {filename}")
    
    # Security: ensure the file is within the images directory
    try:
        filepath.resolve().relative_to(images_dir.resolve())
    except ValueError:
        raise HTTPException(status_code=403, detail="Access denied")
    
    return FileResponse(
        path=str(filepath),
        media_type="image/png",
        filename=filename,
    )



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


@router.get("/check-image-gen-models")
async def check_image_gen_models():
    """Check for available image generation models and return recommendations"""
    from app.services.ollama_client import ollama_client
    
    try:
        models = await ollama_client.list_models()
        image_gen_keywords = ['flux', 'flux2', 'stable-diffusion']
        
        available = []
        for m in models:
            name = m.get("name", "").lower()
            if any(keyword in name for keyword in image_gen_keywords):
                available.append(m.get("name"))
        
        # Recommended models if none available
        recommendations = [
            {"name": "x/flux2-klein", "description": "FLUX.2 Klein - Fast, great text rendering, macOS only", "size": "~5.7GB (4B) or ~12GB (9B)"},
            {"name": "x/flux2-klein:4b", "description": "FLUX.2 Klein 4B - Smaller, faster version", "size": "~5.7GB"},
            {"name": "x/flux2-klein:9b", "description": "FLUX.2 Klein 9B - Higher quality version", "size": "~12GB"},
        ]
        
        return {
            "available": available,
            "recommendations": recommendations,
            "has_image_gen_model": len(available) > 0,
        }
    except Exception as e:
        return {
            "available": [],
            "recommendations": [],
            "has_image_gen_model": False,
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
