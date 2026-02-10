
from typing import Dict, List, Optional, Any
from pydantic import BaseModel
import re
from app.services.ollama_client import ollama_client
from app.services.system_info import get_system_info
from app.services.storage import get_circuits

class OrchestratorSettings(BaseModel):
    weight_speed: float = 0.5
    weight_cost: float = 0.5
    weight_quality: float = 0.5
    auto_run_circuits: bool = False
    prefer_local: bool = True

class OrchestrationResult(BaseModel):
    action: str  # "chat" or "circuit"
    model_name: Optional[str] = None
    circuit_name: Optional[str] = None
    reasoning: str

class OrchestratorService:
    def __init__(self):
        self.settings = OrchestratorSettings()
        # Quality Tiers (Hand-tuned estimates)
        self.quality_tiers = {
            "llama3.1:70b": 0.95,
            "llama3:70b": 0.95,
            "mistral-nemo": 0.85,
            "llama3.1:8b": 0.80,
            "mistral": 0.75,
            "gemma:2b": 0.60,
            "phi3:mini": 0.65,
            "tinyllama": 0.40,
        }

    def update_settings(self, new_settings: Dict):
        """Update orchestrator weights and preferences"""
        self.settings = OrchestratorSettings(**new_settings)

    def get_settings(self) -> Dict:
        return self.settings.dict()

    async def select_best_model(self) -> Dict[str, Any]:
        """
        Rank available models based on current weights and system stats.
        Returns the best model info.
        """
        models = await ollama_client.list_models()
        if not models:
            return {"name": "llama3.1:8b", "reason": "No models found, using default"}
            
        system = get_system_info()
        ram_gb = system.get("ram_gb", 8)
        gpu_available = system.get("gpu_available", False)

        scored_models = []

        for m in models:
            name = m.get("name", "unknown")
            size_gb = float(m.get("size", 0)) / (1024**3)
            
            # 1. Cost Score (Local is usually free/cheap in terms of money, but 'expensive' in resources)
            # Interpreting "Cost" weight as "Financial Cost Efficiency".
            # Local models = 1.0 (Free). Cloud models (if we had them) = 0.0-0.5.
            score_cost = 1.0 

            # 2. Speed Score (Hardware dependent)
            # If model fits in RAM + GPU, it's fast.
            score_speed = 0.5
            if size_gb < (ram_gb * 0.8):
                score_speed = 0.8
                if gpu_available:
                     score_speed = 0.95
            if size_gb > ram_gb:
                score_speed = 0.1 # Swapping likely

            # 3. Quality Score (Based on tiers or size heuristic)
            base_key = name.split(':')[0]
            score_quality = self.quality_tiers.get(name) or self.quality_tiers.get(base_key)
            if not score_quality:
                # Heuristic: Larger is usually better quality (up to a point)
                score_quality = min(0.9, size_gb / 20.0) 

            # Weighted Sum
            total_score = (
                (score_cost * self.settings.weight_cost) +
                (score_speed * self.settings.weight_speed) +
                (score_quality * self.settings.weight_quality)
            )

            scored_models.append({
                "name": name,
                "score": total_score,
                "details": {
                    "cost": score_cost,
                    "speed": score_speed,
                    "quality": score_quality
                }
            })

        # Sort by score desc
        scored_models.sort(key=lambda x: x["score"], reverse=True)
        best = scored_models[0]
        
        return {
            "name": best["name"],
            "reason": f"Top ranked (Score: {best['score']:.2f}) | Q:{best['details']['quality']:.2f} S:{best['details']['speed']:.2f} C:{best['details']['cost']:.2f}"
        }

    def detect_circuit_intent(self, user_message: str) -> Optional[str]:
        """
        Analyze user message to see if it matches a known Circuit description.
        """
        circuits = get_circuits()
        message = user_message.lower()

        best_match = None
        max_score = 0

        for name, data in circuits.items():
            score = 0
            desc = (data.get("description") or "").lower()
            
            # 1. Exact Name Match
            if name.lower() in message:
                score += 5
            
            # 2. Keyword matching from description
            # Simple dumb implementation: check word overlap
            keywords = [w for w in desc.split() if len(w) > 4]
            for kw in keywords:
                if kw in message:
                    score += 1

            if score > max_score and score > 2: # Threshold
                max_score = score
                best_match = name
        
        return best_match

    async def analyze(self, user_message: str) -> OrchestrationResult:
        """
        Main entry point. Decides whether to Chat or Run Circuit.
        """
        # 1. Check Circuit Intent
        circuit_match = self.detect_circuit_intent(user_message)
        if circuit_match:
            return OrchestrationResult(
                action="circuit",
                circuit_name=circuit_match,
                reasoning=f"Detected intent for circuit '{circuit_match}'"
            )

        # 2. Select Model for Chat
        best_model = await self.select_best_model() # This is now async
        
        return OrchestrationResult(
            action="chat",
            model_name=best_model["name"],
            reasoning=best_model["reason"]
        )

# Singleton
orchestrator = OrchestratorService()
