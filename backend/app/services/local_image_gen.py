"""
Local image generation using diffusers with MPS (Apple Silicon) support
Optimized for high-memory Macs
"""

import torch
import gc
import logging
from typing import Optional
from pathlib import Path
import base64
from io import BytesIO

logger = logging.getLogger("loom.image.local")


def get_device():
    """Get the best available device"""
    if torch.backends.mps.is_available():
        return "mps"
    elif torch.cuda.is_available():
        return "cuda"
    else:
        return "cpu"


def get_models_dir() -> Path:
    """Get the models directory"""
    models_dir = Path(__file__).parent.parent.parent / "models" / "diffusion"
    models_dir.mkdir(parents=True, exist_ok=True)
    return models_dir


# Predefined models that work well with MPS
MODELS = {
    # HuggingFace models
    "sdxl": {
        "repo": "stabilityai/stable-diffusion-xl-base-1.0",
        "type": "sdxl",
        "vram": "8GB",
    },
    "sdxl-turbo": {
        "repo": "stabilityai/sdxl-turbo",
        "type": "sdxl",
        "vram": "8GB",
        "steps": 4,  # Turbo needs fewer steps
    },
    "sd-3": {
        "repo": "stabilityai/stable-diffusion-3-medium-diffusers",
        "type": "sd3",
        "vram": "16GB",
    },
    "flux-schnell": {
        "repo": "black-forest-labs/FLUX.1-schnell",
        "type": "flux",
        "vram": "32GB",
    },
    "flux-dev": {
        "repo": "black-forest-labs/FLUX.1-dev",
        "type": "flux",
        "vram": "32GB",
    },
    # Smaller models for testing
    "sd-1.5": {
        "repo": "runwayml/stable-diffusion-v1-5",
        "type": "sd15",
        "vram": "4GB",
    },
}


class LocalImageGenerator:
    """
    Local image generation using diffusers
    Optimized for Apple Silicon with MPS
    """
    
    def __init__(self):
        self.device = get_device()
        self.models_dir = get_models_dir()
        self.current_model: Optional[str] = None
        self.pipe = None
        self.hf_token: Optional[str] = None
        
        logger.info("local_image_generator_initialized device=%s", self.device)
        if self.device == "mps":
            logger.info("local_image_generator_mps_enabled")
    
    def set_hf_token(self, token: str):
        """Set HuggingFace token for gated models"""
        self.hf_token = token
    
    def list_models(self) -> list[dict]:
        """List available models"""
        models = []
        for name, info in MODELS.items():
            models.append({
                "name": name,
                "repo": info["repo"],
                "type": info["type"],
                "vram": info["vram"],
            })
        
        # Also list any local .safetensors files
        for f in self.models_dir.glob("**/*.safetensors"):
            models.append({
                "name": f.stem,
                "path": str(f),
                "type": "local",
                "vram": "varies",
            })
        
        return models
    
    def load_model(self, model_name: str) -> bool:
        """Load a model into memory"""
        if self.current_model == model_name and self.pipe is not None:
            return True  # Already loaded
        
        # Unload current model
        self.unload_model()
        
        logger.info("loading_image_model model=%s", model_name)
        
        try:
            if model_name in MODELS:
                model_info = MODELS[model_name]
                repo = model_info["repo"]
                model_type = model_info["type"]
                
                # Import the right pipeline
                if model_type == "sdxl":
                    from diffusers import StableDiffusionXLPipeline
                    self.pipe = StableDiffusionXLPipeline.from_pretrained(
                        repo,
                        torch_dtype=torch.float16,
                        use_auth_token=self.hf_token,
                        use_safetensors=True,
                        variant="fp16",
                    )
                elif model_type == "sd3":
                    from diffusers import StableDiffusion3Pipeline
                    self.pipe = StableDiffusion3Pipeline.from_pretrained(
                        repo,
                        torch_dtype=torch.float16,
                        use_auth_token=self.hf_token,
                    )
                elif model_type == "flux":
                    from diffusers import FluxPipeline
                    self.pipe = FluxPipeline.from_pretrained(
                        repo,
                        torch_dtype=torch.bfloat16,
                        use_auth_token=self.hf_token,
                    )
                elif model_type == "sd15":
                    from diffusers import StableDiffusionPipeline
                    self.pipe = StableDiffusionPipeline.from_pretrained(
                        repo,
                        torch_dtype=torch.float16,
                        use_auth_token=self.hf_token,
                        safety_checker=None,
                    )
                else:
                    raise ValueError(f"Unknown model type: {model_type}")
                
                # Move to device
                self.pipe = self.pipe.to(self.device)
                
                # Enable optimizations
                if hasattr(self.pipe, 'enable_attention_slicing'):
                    self.pipe.enable_attention_slicing()
                
                self.current_model = model_name
                logger.info("image_model_loaded model=%s", model_name)
                return True
            
            else:
                # Try to load as local safetensors
                local_path = self.models_dir / f"{model_name}.safetensors"
                if local_path.exists():
                    from diffusers import StableDiffusionPipeline
                    self.pipe = StableDiffusionPipeline.from_single_file(
                        str(local_path),
                        torch_dtype=torch.float16,
                    )
                    self.pipe = self.pipe.to(self.device)
                    self.current_model = model_name
                    return True
                else:
                    raise ValueError(f"Model not found: {model_name}")
        
        except Exception:
            logger.exception("image_model_load_failed model=%s", model_name)
            self.pipe = None
            self.current_model = None
            raise
        
        return False
    
    def unload_model(self):
        """Unload current model to free memory"""
        if self.pipe is not None:
            del self.pipe
            self.pipe = None
            self.current_model = None
            gc.collect()
            if self.device == "mps":
                torch.mps.empty_cache()
            elif self.device == "cuda":
                torch.cuda.empty_cache()
            logger.info("image_model_unloaded")
    
    async def generate(
        self,
        prompt: str,
        model: str = "sdxl",
        negative_prompt: str = "",
        width: int = 1024,
        height: int = 1024,
        steps: int = 30,
        guidance_scale: float = 7.5,
        seed: Optional[int] = None,
    ) -> dict:
        """Generate an image"""
        
        # Load model if needed
        if self.current_model != model:
            self.load_model(model)
        
        if self.pipe is None:
            raise RuntimeError("No model loaded")
        
        # Get model-specific defaults
        model_info = MODELS.get(model, {})
        if "steps" in model_info:
            steps = model_info["steps"]
        
        # Set up generator for reproducibility
        generator = None
        if seed is not None:
            if self.device == "mps":
                # MPS needs CPU generator
                generator = torch.Generator("cpu").manual_seed(seed)
            else:
                generator = torch.Generator(self.device).manual_seed(seed)
        
        logger.info(
            "image_generation_started model=%s size=%sx%s steps=%s prompt_preview=%s",
            model,
            width,
            height,
            steps,
            prompt[:80],
        )
        
        try:
            # Generate
            result = self.pipe(
                prompt=prompt,
                negative_prompt=negative_prompt if negative_prompt else None,
                width=width,
                height=height,
                num_inference_steps=steps,
                guidance_scale=guidance_scale,
                generator=generator,
            )
            
            image = result.images[0]
            
            # Save to disk for session persistence
            import time
            images_dir = Path(__file__).parent.parent.parent / "data" / "images"
            images_dir.mkdir(parents=True, exist_ok=True)
            timestamp = int(time.time() * 1000)
            prompt_hash = abs(hash(prompt)) % 10**8
            filename = f"gen_{timestamp}_{prompt_hash}.png"
            filepath = images_dir / filename
            image.save(str(filepath), format="PNG")
            file_url = f"/api/images/files/{filename}"
            logger.info("image_generation_saved path=%s", filepath)
            
            # Convert to base64 for immediate display
            buffer = BytesIO()
            image.save(buffer, format="PNG")
            image_base64 = base64.b64encode(buffer.getvalue()).decode("utf-8")
            
            return {
                "status": "success",
                "image": f"data:image/png;base64,{image_base64}",
                "file_url": file_url,
                "filename": filename,
                "model": model,
                "seed": seed,
            }
        
        except Exception as e:
            logger.exception("image_generation_failed model=%s", model)
            raise RuntimeError(f"Generation failed: {e}")
    
    def download_civitai_model(self, url: str, name: str) -> str:
        """Download a model from CivitAI"""
        import httpx
        
        save_path = self.models_dir / f"{name}.safetensors"
        
        if save_path.exists():
            return str(save_path)
        
        logger.info("civitai_download_started name=%s url=%s", name, url)
        
        with httpx.stream("GET", url, follow_redirects=True) as response:
            response.raise_for_status()
            total = int(response.headers.get("content-length", 0))
            
            with open(save_path, "wb") as f:
                downloaded = 0
                last_progress_bucket = -1
                for chunk in response.iter_bytes(chunk_size=8192):
                    f.write(chunk)
                    downloaded += len(chunk)
                    if total:
                        pct = (downloaded / total) * 100
                        bucket = int(pct // 10)
                        if bucket > last_progress_bucket:
                            logger.info("civitai_download_progress name=%s progress=%.1f%%", name, pct)
                            last_progress_bucket = bucket
        
        logger.info("civitai_download_completed name=%s path=%s", name, save_path)
        return str(save_path)


# Singleton
local_image_gen = LocalImageGenerator()
