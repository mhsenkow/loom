"""
Local image generation using diffusers with MPS (Apple Silicon) support
Optimized for high-memory Macs
"""

import torch
import gc
import logging
import threading
import time
from typing import Callable, Optional
from pathlib import Path
import base64
from io import BytesIO

logger = logging.getLogger("loom.image.local")

DownloadProgressCallback = Callable[[dict], None]


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

    def _emit_progress(self, callback: Optional[DownloadProgressCallback], payload: dict):
        if not callback:
            return
        try:
            callback(payload)
        except Exception:
            logger.exception("image_model_progress_callback_failed")

    def _get_model_local_dir(self, model_name: str) -> Path:
        return self.models_dir / "huggingface" / model_name

    def _safe_file_size(self, path: Path) -> int:
        try:
            return path.stat().st_size
        except OSError:
            return 0

    def _scan_download_dir(self, model_dir: Path) -> tuple[int, Optional[str]]:
        total_bytes = 0
        newest_file: Optional[str] = None
        newest_mtime = 0.0

        if not model_dir.exists():
            return 0, None

        try:
            for file_path in model_dir.rglob("*"):
                if not file_path.is_file():
                    continue
                size = self._safe_file_size(file_path)
                total_bytes += size
                try:
                    mtime = file_path.stat().st_mtime
                except OSError:
                    mtime = 0.0
                if mtime >= newest_mtime:
                    newest_mtime = mtime
                    newest_file = str(file_path.relative_to(model_dir))
        except Exception:
            logger.exception("failed_scanning_model_download_dir dir=%s", model_dir)

        return total_bytes, newest_file

    def _fetch_repo_file_metadata(self, repo_id: str) -> list[tuple[str, int]]:
        try:
            from huggingface_hub import HfApi

            api = HfApi()
            info = api.model_info(repo_id, files_metadata=True, token=self.hf_token or None)
            siblings = getattr(info, "siblings", []) or []

            files: list[tuple[str, int]] = []
            for sibling in siblings:
                rel = getattr(sibling, "rfilename", None) or getattr(sibling, "path", None)
                if not isinstance(rel, str) or not rel.strip():
                    continue
                raw_size = getattr(sibling, "size", None)
                size = int(raw_size) if isinstance(raw_size, int) and raw_size > 0 else 0
                files.append((rel, size))
            return files
        except Exception:
            logger.exception("failed_fetching_repo_metadata repo=%s", repo_id)
            return []

    def _is_diffusers_model_downloaded(self, model_dir: Path) -> bool:
        marker_files = [
            model_dir / "model_index.json",
            model_dir / "README.md",
        ]
        return any(marker.exists() for marker in marker_files)

    def get_model_local_dir(self, model_name: str) -> Path:
        return self._get_model_local_dir(model_name)

    def is_model_downloaded(self, model_name: str) -> bool:
        if model_name not in MODELS:
            return False
        model_dir = self._get_model_local_dir(model_name)
        if self._is_diffusers_model_downloaded(model_dir):
            return True

        # Backward compatibility with older cache-based installs.
        repo_id = MODELS[model_name]["repo"].replace("/", "--")
        legacy_cache_path = Path.home() / ".cache" / "huggingface" / "hub" / f"models--{repo_id}"
        snapshots_dir = legacy_cache_path / "snapshots"
        if snapshots_dir.exists():
            try:
                for snapshot in snapshots_dir.iterdir():
                    if snapshot.is_dir() and (snapshot / "model_index.json").exists():
                        return True
            except OSError:
                return False
        return False

    def _ensure_model_downloaded(
        self,
        model_name: str,
        repo_id: str,
        progress_callback: Optional[DownloadProgressCallback] = None,
    ) -> Path:
        model_dir = self._get_model_local_dir(model_name)
        model_dir.mkdir(parents=True, exist_ok=True)

        if self._is_diffusers_model_downloaded(model_dir):
            self._emit_progress(progress_callback, {
                "status": "success",
                "message": f"Model files already available for {model_name}.",
                "percent": 100,
                "completed": 1,
                "total": 1,
                "files_completed": 1,
                "files_total": 1,
            })
            return model_dir

        repo_files = self._fetch_repo_file_metadata(repo_id)
        files_total = len(repo_files)
        expected_total_bytes = sum(size for _, size in repo_files if size > 0)

        self._emit_progress(progress_callback, {
            "status": "starting",
            "message": f"Getting {model_name} ready for download...",
            "percent": 0,
            "completed": 0,
            "total": expected_total_bytes,
            "files_completed": 0,
            "files_total": files_total,
        })

        result: dict[str, object] = {"error": None}
        done = threading.Event()

        def _download_worker() -> None:
            try:
                from huggingface_hub import snapshot_download

                snapshot_download(
                    repo_id=repo_id,
                    local_dir=str(model_dir),
                    token=self.hf_token or None,
                    resume_download=True,
                    local_dir_use_symlinks=False,
                    max_workers=4,
                )
            except Exception as exc:  # pragma: no cover - network/runtime specific
                result["error"] = exc
            finally:
                done.set()

        worker = threading.Thread(target=_download_worker, daemon=True)
        worker.start()

        last_emit_ms = 0.0
        last_completed = 0
        last_t = time.monotonic()

        while not done.wait(0.35):
            completed_bytes, newest_file = self._scan_download_dir(model_dir)
            now = time.monotonic()
            delta_bytes = max(0, completed_bytes - last_completed)
            delta_t = max(0.001, now - last_t)
            speed_bps = delta_bytes / delta_t if delta_bytes > 0 else 0.0
            last_completed = completed_bytes
            last_t = now

            files_completed = 0
            for rel, _ in repo_files:
                if (model_dir / rel).is_file():
                    files_completed += 1

            percent: Optional[int] = None
            if expected_total_bytes > 0:
                percent = min(99, int((completed_bytes / expected_total_bytes) * 100))
            elif files_total > 0:
                percent = min(99, int((files_completed / files_total) * 100))

            eta_seconds: Optional[int] = None
            if expected_total_bytes > 0 and speed_bps > 0:
                remaining = max(0, expected_total_bytes - completed_bytes)
                eta_seconds = int(remaining / speed_bps)

            now_ms = time.time() * 1000
            if now_ms - last_emit_ms >= 500:
                message = "Downloading model files..."
                if newest_file:
                    message = f"Downloading {newest_file}..."
                self._emit_progress(progress_callback, {
                    "status": "downloading",
                    "message": message,
                    "percent": percent,
                    "completed": completed_bytes,
                    "total": expected_total_bytes,
                    "speed_bps": speed_bps if speed_bps > 0 else None,
                    "eta_seconds": eta_seconds,
                    "file_name": newest_file,
                    "files_completed": files_completed,
                    "files_total": files_total,
                })
                last_emit_ms = now_ms

        worker.join()
        error = result.get("error")
        if error:
            raise error if isinstance(error, Exception) else RuntimeError(str(error))

        final_completed, newest_file = self._scan_download_dir(model_dir)
        final_files_completed = files_total
        if files_total > 0:
            final_files_completed = sum(1 for rel, _ in repo_files if (model_dir / rel).is_file())
        self._emit_progress(progress_callback, {
            "status": "downloading",
            "message": "Finalizing downloaded files...",
            "percent": 100,
            "completed": final_completed,
            "total": expected_total_bytes,
            "file_name": newest_file,
            "files_completed": final_files_completed,
            "files_total": files_total,
        })
        return model_dir
    
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
    
    def load_model(
        self,
        model_name: str,
        progress_callback: Optional[DownloadProgressCallback] = None,
    ) -> bool:
        """Load a model into memory"""
        if self.current_model == model_name and self.pipe is not None:
            self._emit_progress(progress_callback, {
                "status": "success",
                "message": f"{model_name} is already loaded.",
                "percent": 100,
                "completed": 1,
                "total": 1,
                "files_completed": 1,
                "files_total": 1,
            })
            return True  # Already loaded
        
        # Unload current model
        self.unload_model()
        
        logger.info("loading_image_model model=%s", model_name)
        
        try:
            if model_name in MODELS:
                model_info = MODELS[model_name]
                repo = model_info["repo"]
                model_type = model_info["type"]
                model_dir = self._ensure_model_downloaded(model_name, repo, progress_callback)
                self._emit_progress(progress_callback, {
                    "status": "loading",
                    "message": "Loading model into memory...",
                    "percent": 100,
                })
                
                # Import the right pipeline
                if model_type == "sdxl":
                    from diffusers import StableDiffusionXLPipeline
                    self.pipe = StableDiffusionXLPipeline.from_pretrained(
                        str(model_dir),
                        torch_dtype=torch.float16,
                        use_safetensors=True,
                        variant="fp16",
                        local_files_only=True,
                    )
                elif model_type == "sd3":
                    from diffusers import StableDiffusion3Pipeline
                    self.pipe = StableDiffusion3Pipeline.from_pretrained(
                        str(model_dir),
                        torch_dtype=torch.float16,
                        local_files_only=True,
                    )
                elif model_type == "flux":
                    from diffusers import FluxPipeline
                    self.pipe = FluxPipeline.from_pretrained(
                        str(model_dir),
                        torch_dtype=torch.bfloat16,
                        local_files_only=True,
                    )
                elif model_type == "sd15":
                    from diffusers import StableDiffusionPipeline
                    self.pipe = StableDiffusionPipeline.from_pretrained(
                        str(model_dir),
                        torch_dtype=torch.float16,
                        safety_checker=None,
                        local_files_only=True,
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
                self._emit_progress(progress_callback, {
                    "status": "success",
                    "message": f"Model {model_name} is ready.",
                    "percent": 100,
                    "completed": 1,
                    "total": 1,
                    "files_completed": 1,
                    "files_total": 1,
                })
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
            self._emit_progress(progress_callback, {
                "status": "error",
                "message": f"Failed to load {model_name}.",
            })
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
