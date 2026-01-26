"""
Ollama client service for AI processing
"""

from typing import AsyncGenerator, Optional
from ollama import AsyncClient


class OllamaClient:
    """
    Client for interacting with local Ollama instance
    """
    
    def __init__(self, host: str = "http://localhost:11434"):
        self.host = host
        self.client = AsyncClient(host=host)
        self._default_model = "llama3.1:8b"  # Updated default
    
    async def check_connection(self) -> dict:
        """Check if Ollama is running and accessible"""
        try:
            models = await self.list_models()
            return {
                "connected": True,
                "models_available": len(models),
            }
        except Exception as e:
            return {
                "connected": False,
                "error": str(e),
            }
    
    async def list_models(self) -> list[dict]:
        """List all available models"""
        try:
            response = await self.client.list()
            models_list = response.get("models", []) if isinstance(response, dict) else getattr(response, 'models', [])
            
            result = []
            for model in models_list:
                # Handle both dict and object responses
                if isinstance(model, dict):
                    name = model.get("name", "unknown")
                    size = model.get("size", 0)
                    modified_at = model.get("modified_at", "")
                else:
                    # Object with attributes
                    name = getattr(model, 'name', None) or getattr(model, 'model', 'unknown')
                    size = getattr(model, 'size', 0)
                    modified_at = str(getattr(model, 'modified_at', ''))
                
                result.append({
                    "name": name,
                    "size": size,
                    "modified_at": modified_at,
                })
            
            return result
        except Exception as e:
            print(f"[LOOM] Error listing models: {e}")
            return []
    
    async def get_first_available_model(self) -> Optional[str]:
        """Get the first available chat model (not embedding models)"""
        models = await self.list_models()
        for model in models:
            name = model.get("name", "")
            # Skip embedding models
            if "embed" not in name.lower():
                return name
        return None
    
    async def chat(
        self, 
        prompt: str, 
        model: Optional[str] = None,
        system_prompt: Optional[str] = None,
    ) -> str:
        """
        Send a chat message and get a complete response
        """
        model = model or self._default_model
        
        messages = []
        
        if system_prompt:
            messages.append({
                "role": "system",
                "content": system_prompt,
            })
        
        messages.append({
            "role": "user",
            "content": prompt,
        })
        
        try:
            response = await self.client.chat(
                model=model,
                messages=messages,
            )
            # Handle both dict and object responses
            if isinstance(response, dict):
                return response.get("message", {}).get("content", "")
            else:
                message = getattr(response, 'message', None)
                if message:
                    return getattr(message, 'content', '') if not isinstance(message, dict) else message.get('content', '')
                return ""
        except Exception as e:
            raise RuntimeError(f"Ollama chat error: {e}")
    
    async def stream_chat(
        self,
        prompt: str,
        model: Optional[str] = None,
        system_prompt: Optional[str] = None,
    ) -> AsyncGenerator[str, None]:
        """
        Stream a chat response token by token
        """
        model = model or self._default_model
        
        messages = []
        
        if system_prompt:
            messages.append({
                "role": "system",
                "content": system_prompt,
            })
        
        messages.append({
            "role": "user",
            "content": prompt,
        })
        
        try:
            stream = await self.client.chat(
                model=model,
                messages=messages,
                stream=True,
            )
            async for chunk in stream:
                # Handle both dict and object responses
                if isinstance(chunk, dict):
                    content = chunk.get("message", {}).get("content", "")
                else:
                    message = getattr(chunk, 'message', None)
                    if message:
                        content = getattr(message, 'content', '') if not isinstance(message, dict) else message.get('content', '')
                    else:
                        content = ""
                
                if content:
                    yield content
        except Exception as e:
            raise RuntimeError(f"Ollama stream error: {e}")
    
    async def generate(
        self,
        prompt: str,
        model: Optional[str] = None,
        context: Optional[list] = None,
    ) -> dict:
        """
        Generate a completion (non-chat mode)
        """
        model = model or self._default_model
        
        try:
            response = await self.client.generate(
                model=model,
                prompt=prompt,
                context=context,
            )
            if isinstance(response, dict):
                return {
                    "response": response.get("response", ""),
                    "context": response.get("context", []),
                    "total_duration": response.get("total_duration", 0),
                    "eval_count": response.get("eval_count", 0),
                }
            else:
                return {
                    "response": getattr(response, 'response', ''),
                    "context": getattr(response, 'context', []),
                    "total_duration": getattr(response, 'total_duration', 0),
                    "eval_count": getattr(response, 'eval_count', 0),
                }
        except Exception as e:
            raise RuntimeError(f"Ollama generate error: {e}")
    
    async def embed(
        self,
        text: str,
        model: str = "nomic-embed-text",
    ) -> list[float]:
        """
        Generate embeddings for text
        """
        try:
            response = await self.client.embeddings(
                model=model,
                prompt=text,
            )
            if isinstance(response, dict):
                return response.get("embedding", [])
            else:
                return getattr(response, 'embedding', [])
        except Exception as e:
            raise RuntimeError(f"Ollama embed error: {e}")
    
    async def pull_model(self, model_name: str) -> AsyncGenerator[dict, None]:
        """
        Pull/download a model from Ollama and stream progress updates
        Yields progress dicts with status, completed, total, etc.
        """
        try:
            print(f"[LOOM] Starting pull for model: {model_name}")
            
            # Try to get the pull stream - handle different API versions
            pull_result = self.client.pull(model=model_name, stream=True)
            
            # Check if it's a coroutine (needs to be awaited first)
            import inspect
            if inspect.iscoroutine(pull_result):
                pull_result = await pull_result
            
            # Now iterate over the async generator
            async for progress in pull_result:
                # Handle both dict and object responses
                if isinstance(progress, dict):
                    status = progress.get("status", "")
                    completed = progress.get("completed")
                    total = progress.get("total")
                    digest = progress.get("digest", "")
                    error = progress.get("error")
                else:
                    status = getattr(progress, 'status', '')
                    completed = getattr(progress, 'completed', None)
                    total = getattr(progress, 'total', None)
                    digest = getattr(progress, 'digest', '')
                    error = getattr(progress, 'error', None)
                
                # Ensure completed and total are integers, default to 0 if None
                completed = int(completed) if completed is not None else 0
                total = int(total) if total is not None else 0
                
                result = {
                    "status": status,
                    "completed": completed,
                    "total": total,
                    "digest": digest or "",
                }
                
                # Include error if present
                if error:
                    result["error"] = str(error)
                    print(f"[LOOM] Pull error in progress: {error}")
                
                yield result
                
        except Exception as e:
            import traceback
            error_details = traceback.format_exc()
            print(f"[LOOM] Exception in pull_model for {model_name}: {e}")
            print(f"[LOOM] Traceback: {error_details}")
            yield {
                "status": "error",
                "error": str(e),
                "message": f"Failed to pull model: {str(e)}",
            }
    
    def set_default_model(self, model: str):
        """Set the default model for operations"""
        self._default_model = model
    
    async def analyze_image(
        self,
        image_base64: str,
        prompt: str = "Describe this image in detail. What do you see?",
        model: Optional[str] = None,
    ) -> str:
        """
        Analyze an image using a vision model
        image_base64: Base64-encoded image data (with or without data URL prefix)
        prompt: The question/prompt about the image
        model: Vision model to use (defaults to first available vision model)
        """
        # Remove data URL prefix if present
        if image_base64.startswith('data:image'):
            image_base64 = image_base64.split(',')[1]
        
        # Validate base64 length (should be substantial for an image)
        if len(image_base64) < 100:
            raise ValueError("Image data too short - may be invalid base64")
        
        # Try to find a vision model if not specified
        if not model:
            models = await self.list_models()
            # Look for common vision model names
            vision_models = ['llava', 'bakllava', 'moondream', 'llama-vision']
            for m in models:
                name = m.get("name", "").lower()
                if any(vm in name for vm in vision_models):
                    model = m.get("name")
                    print(f"[LOOM] Using vision model: {model}")
                    break
            
            # Fallback to default if no vision model found
            if not model:
                print(f"[LOOM] Warning: No vision model found, using default: {self._default_model}")
                print(f"[LOOM] Available models: {[m.get('name') for m in models]}")
                model = self._default_model
        
        # Ollama Python client format: images should be in the message content
        # Format according to Ollama docs: messages with images array in the message
        messages = [{
            "role": "user",
            "content": prompt,
            "images": [image_base64],  # Images go in the message object
        }]
        
        try:
            print(f"[LOOM] Analyzing image with model: {model}, image size: {len(image_base64)} chars")
            response = await self.client.chat(
                model=model,
                messages=messages,
            )
            # Handle both dict and object responses
            if isinstance(response, dict):
                content = response.get("message", {}).get("content", "")
            else:
                message = getattr(response, 'message', None)
                if message:
                    content = getattr(message, 'content', '') if not isinstance(message, dict) else message.get('content', '')
                else:
                    content = ""
            
            if not content:
                raise RuntimeError("Empty response from vision model - model may not support vision")
            
            print(f"[LOOM] Vision analysis complete, response length: {len(content)}")
            return content
        except Exception as e:
            error_msg = f"Ollama vision analysis error: {e}"
            print(f"[LOOM] {error_msg}")
            raise RuntimeError(error_msg)


# Singleton for use by main, routers, and module executor
ollama_client = OllamaClient()
