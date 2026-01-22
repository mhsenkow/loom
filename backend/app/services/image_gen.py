"""
Image generation service - HuggingFace + ComfyUI support
"""

import httpx
import base64
from typing import Optional
import os


class ImageGenService:
    """
    Image generation via HuggingFace Inference API or local ComfyUI
    """
    
    # Popular models on HuggingFace
    MODELS = {
        "sdxl": "stabilityai/stable-diffusion-xl-base-1.0",
        "sd-1.5": "runwayml/stable-diffusion-v1-5",
        "flux-schnell": "black-forest-labs/FLUX.1-schnell",
        "flux-dev": "black-forest-labs/FLUX.1-dev",
    }
    
    def __init__(self):
        self.hf_token: Optional[str] = None
        self.comfyui_url: Optional[str] = None
    
    def set_hf_token(self, token: str):
        """Set HuggingFace API token"""
        self.hf_token = token
    
    def set_comfyui_url(self, url: str):
        """Set ComfyUI API URL"""
        self.comfyui_url = url
    
    async def generate_hf(
        self,
        prompt: str,
        model: str = "sdxl",
        negative_prompt: str = "",
        width: int = 1024,
        height: int = 1024,
    ) -> dict:
        """
        Generate image using HuggingFace Inference API
        Returns base64-encoded image
        """
        if not self.hf_token:
            raise ValueError("HuggingFace token not set. Add it in Settings.")
        
        model_id = self.MODELS.get(model, model)
        url = f"https://api-inference.huggingface.co/models/{model_id}"
        
        headers = {
            "Authorization": f"Bearer {self.hf_token}",
            "Content-Type": "application/json",
        }
        
        payload = {
            "inputs": prompt,
            "parameters": {
                "negative_prompt": negative_prompt,
                "width": width,
                "height": height,
            },
        }
        
        async with httpx.AsyncClient(timeout=120.0) as client:
            response = await client.post(url, json=payload, headers=headers)
            
            if response.status_code == 503:
                # Model is loading
                return {
                    "status": "loading",
                    "message": "Model is loading, please try again in a moment...",
                }
            
            if response.status_code != 200:
                error_msg = response.text
                try:
                    error_data = response.json()
                    error_msg = error_data.get("error", error_msg)
                except:
                    pass
                raise RuntimeError(f"HuggingFace API error: {error_msg}")
            
            # Response is raw image bytes
            image_bytes = response.content
            image_base64 = base64.b64encode(image_bytes).decode("utf-8")
            
            return {
                "status": "success",
                "image": f"data:image/png;base64,{image_base64}",
                "model": model_id,
            }
    
    async def check_comfyui(self) -> bool:
        """Check if ComfyUI is running"""
        if not self.comfyui_url:
            return False
        
        try:
            async with httpx.AsyncClient(timeout=5.0) as client:
                response = await client.get(f"{self.comfyui_url}/system_stats")
                return response.status_code == 200
        except:
            return False
    
    async def generate_comfyui(
        self,
        prompt: str,
        model: str = "default",
        negative_prompt: str = "",
        width: int = 1024,
        height: int = 1024,
    ) -> dict:
        """
        Generate image using local ComfyUI
        This is a simplified implementation - ComfyUI uses workflows
        """
        if not self.comfyui_url:
            raise ValueError("ComfyUI URL not set. Add it in Settings.")
        
        # Basic txt2img workflow for ComfyUI
        # In practice, you'd want to use proper workflow JSON
        workflow = {
            "prompt": {
                "3": {
                    "class_type": "KSampler",
                    "inputs": {
                        "seed": -1,  # Random
                        "steps": 20,
                        "cfg": 7,
                        "sampler_name": "euler",
                        "scheduler": "normal",
                        "denoise": 1,
                        "model": ["4", 0],
                        "positive": ["6", 0],
                        "negative": ["7", 0],
                        "latent_image": ["5", 0],
                    }
                },
                "4": {
                    "class_type": "CheckpointLoaderSimple",
                    "inputs": {"ckpt_name": model}
                },
                "5": {
                    "class_type": "EmptyLatentImage",
                    "inputs": {"width": width, "height": height, "batch_size": 1}
                },
                "6": {
                    "class_type": "CLIPTextEncode",
                    "inputs": {"text": prompt, "clip": ["4", 1]}
                },
                "7": {
                    "class_type": "CLIPTextEncode",
                    "inputs": {"text": negative_prompt, "clip": ["4", 1]}
                },
                "8": {
                    "class_type": "VAEDecode",
                    "inputs": {"samples": ["3", 0], "vae": ["4", 2]}
                },
                "9": {
                    "class_type": "SaveImage",
                    "inputs": {"filename_prefix": "loom", "images": ["8", 0]}
                }
            }
        }
        
        async with httpx.AsyncClient(timeout=300.0) as client:
            # Queue the prompt
            response = await client.post(
                f"{self.comfyui_url}/prompt",
                json=workflow,
            )
            
            if response.status_code != 200:
                raise RuntimeError(f"ComfyUI error: {response.text}")
            
            result = response.json()
            prompt_id = result.get("prompt_id")
            
            # Poll for completion
            # In practice, you'd use websocket for real-time updates
            import asyncio
            for _ in range(60):  # 5 minute timeout
                await asyncio.sleep(5)
                
                history = await client.get(f"{self.comfyui_url}/history/{prompt_id}")
                if history.status_code == 200:
                    data = history.json()
                    if prompt_id in data:
                        outputs = data[prompt_id].get("outputs", {})
                        if "9" in outputs:
                            images = outputs["9"].get("images", [])
                            if images:
                                # Get the image
                                img_info = images[0]
                                img_response = await client.get(
                                    f"{self.comfyui_url}/view",
                                    params={
                                        "filename": img_info["filename"],
                                        "subfolder": img_info.get("subfolder", ""),
                                        "type": img_info.get("type", "output"),
                                    }
                                )
                                if img_response.status_code == 200:
                                    image_base64 = base64.b64encode(img_response.content).decode("utf-8")
                                    return {
                                        "status": "success",
                                        "image": f"data:image/png;base64,{image_base64}",
                                        "model": model,
                                    }
            
            raise RuntimeError("ComfyUI generation timed out")


# Singleton instance
image_gen_service = ImageGenService()
