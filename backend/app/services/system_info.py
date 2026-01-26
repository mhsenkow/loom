"""
System information and hardware detection for model recommendations
"""
import platform
import psutil
import os
from typing import Dict, List, Tuple

def get_system_info() -> Dict:
    """Get system hardware information"""
    info = {
        "platform": platform.system(),
        "platform_version": platform.version(),
        "architecture": platform.machine(),
        "cpu_count": psutil.cpu_count(logical=True),
        "cpu_cores": psutil.cpu_count(logical=False),
        "ram_gb": round(psutil.virtual_memory().total / (1024**3), 2),
        "ram_available_gb": round(psutil.virtual_memory().available / (1024**3), 2),
        "gpu_available": False,
        "gpu_type": None,
    }
    
    # Check for GPU (Apple Silicon MPS, CUDA, etc.)
    try:
        import torch
        if torch.backends.mps.is_available():
            info["gpu_available"] = True
            info["gpu_type"] = "Apple Silicon (MPS)"
        elif torch.cuda.is_available():
            info["gpu_available"] = True
            gpu_name = torch.cuda.get_device_name(0) if torch.cuda.device_count() > 0 else "NVIDIA GPU"
            info["gpu_type"] = f"NVIDIA ({gpu_name})"
            info["gpu_memory_gb"] = round(torch.cuda.get_device_properties(0).total_memory / (1024**3), 2) if torch.cuda.device_count() > 0 else None
    except ImportError:
        pass
    except Exception as e:
        print(f"[LOOM] Error detecting GPU: {e}")
    
    return info


def suggest_models(ram_gb: float, gpu_available: bool = False, gpu_memory_gb: float = None) -> List[Tuple[str, str, str]]:
    """
    Suggest Ollama models based on system specs
    Returns list of (model_name, description, reason) tuples
    """
    suggestions = []
    
    # Model database with size requirements
    models_db = {
        # Small models (1-4GB)
        "phi3:mini": {
            "size_gb": 2.3,
            "description": "Microsoft Phi-3 Mini - Fast, efficient, good for coding",
            "ram_min": 4,
            "gpu_optional": True,
        },
        "tinyllama": {
            "size_gb": 0.6,
            "description": "TinyLlama - Ultra-lightweight, fastest inference",
            "ram_min": 2,
            "gpu_optional": True,
        },
        "gemma:2b": {
            "size_gb": 1.4,
            "description": "Google Gemma 2B - Small but capable",
            "ram_min": 4,
            "gpu_optional": True,
        },
        
        # Medium models (4-8GB)
        "llama3.1:8b": {
            "size_gb": 4.7,
            "description": "Llama 3.1 8B - Excellent balance of quality and speed",
            "ram_min": 8,
            "gpu_recommended": True,
        },
        "mistral": {
            "size_gb": 4.1,
            "description": "Mistral 7B - Great for general tasks",
            "ram_min": 8,
            "gpu_recommended": True,
        },
        "neural-chat": {
            "size_gb": 4.4,
            "description": "Neural Chat - Optimized for conversations",
            "ram_min": 8,
            "gpu_recommended": True,
        },
        "codellama:7b": {
            "size_gb": 3.8,
            "description": "CodeLlama 7B - Specialized for coding tasks",
            "ram_min": 8,
            "gpu_recommended": True,
        },
        
        # Large models (8-16GB)
        "llama3.1:70b": {
            "size_gb": 40,
            "description": "Llama 3.1 70B - Best quality, requires significant RAM",
            "ram_min": 48,
            "gpu_required": True,
        },
        "mistral-nemo": {
            "size_gb": 12,
            "description": "Mistral Nemo - High quality, large model",
            "ram_min": 16,
            "gpu_required": True,
        },
        "codellama:13b": {
            "size_gb": 7.3,
            "description": "CodeLlama 13B - Better coding performance",
            "ram_min": 16,
            "gpu_recommended": True,
        },
        "llama3:70b": {
            "size_gb": 40,
            "description": "Llama 3 70B - High quality, very large",
            "ram_min": 48,
            "gpu_required": True,
        },
        
        # Specialized models
        "nomic-embed-text": {
            "size_gb": 0.3,
            "description": "Nomic Embed - For embeddings/vector search",
            "ram_min": 2,
            "gpu_optional": True,
        },
        "llama3.2:3b": {
            "size_gb": 2.0,
            "description": "Llama 3.2 3B - New, efficient model",
            "ram_min": 4,
            "gpu_optional": True,
        },
    }
    
    # Filter and rank suggestions
    for model_name, model_info in models_db.items():
        size_gb = model_info["size_gb"]
        ram_min = model_info["ram_min"]
        
        # Skip if not enough RAM
        if ram_gb < ram_min:
            continue
        
        # Determine if suitable
        suitable = True
        reason_parts = []
        
        if ram_gb >= ram_min * 1.5:
            reason_parts.append("plenty of RAM")
        elif ram_gb >= ram_min:
            reason_parts.append("sufficient RAM")
        
        if gpu_available:
            if model_info.get("gpu_required"):
                reason_parts.append("GPU available")
            elif model_info.get("gpu_recommended"):
                reason_parts.append("GPU recommended")
        else:
            if model_info.get("gpu_required"):
                suitable = False
            elif model_info.get("gpu_recommended"):
                reason_parts.append("may be slow without GPU")
        
        if suitable:
            reason = f"Good fit: {', '.join(reason_parts)}" if reason_parts else "Compatible with your system"
            suggestions.append((model_name, model_info["description"], reason))
    
    # Sort by size (smaller first for easier recommendations)
    suggestions.sort(key=lambda x: models_db[x[0]]["size_gb"])
    
    return suggestions


def get_model_suggestions() -> Dict:
    """Get system info and model suggestions"""
    system_info = get_system_info()
    ram_gb = system_info["ram_gb"]
    gpu_available = system_info["gpu_available"]
    gpu_memory_gb = system_info.get("gpu_memory_gb")
    
    suggestions = suggest_models(ram_gb, gpu_available, gpu_memory_gb)
    
    return {
        "system": system_info,
        "suggestions": [
            {
                "model": model,
                "description": desc,
                "reason": reason,
            }
            for model, desc, reason in suggestions
        ],
    }
