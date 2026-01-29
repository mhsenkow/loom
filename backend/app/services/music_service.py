
import os
import torch
import soundfile as sf
import numpy as np
import logging
from fastapi import HTTPException

# Monkey-patch torchaudio.save to use soundfile backend (fixes torchcodec issue in torchaudio 2.10+)
def _patched_torchaudio_save(filepath, audio_tensor, sample_rate, **kwargs):
    """Save audio using soundfile instead of torchaudio's broken torchcodec path."""
    # Convert tensor to numpy
    audio_np = audio_tensor.cpu().numpy()
    
    # soundfile expects (samples, channels), torchaudio uses (channels, samples) by default
    if len(audio_np.shape) > 1 and audio_np.shape[0] < audio_np.shape[1]:
        audio_np = audio_np.T
    
    sf.write(filepath, audio_np, sample_rate)

try:
    import torchaudio
    torchaudio.save = _patched_torchaudio_save
    logging.getLogger(__name__).info("Patched torchaudio.save to use soundfile backend")
except ImportError:
    pass

# Configure logging
logger = logging.getLogger(__name__)

# Model configuration
MODEL_CACHE_DIR = os.path.expanduser("~/.cache/ace-step/checkpoints")

class MusicService:
    def __init__(self):
        self.model = None
        self.has_loaded = False
        self.device = "mps" if torch.backends.mps.is_available() else ("cuda" if torch.cuda.is_available() else "cpu")
        
        # Status tracking for UI
        self.is_downloading = False
        self.download_progress = 0.0
        self.download_message = ""
        self.has_ace_step = self._check_ace_step()
        
    def _check_ace_step(self) -> bool:
        """Check if ACE-Step is installed."""
        try:
            from acestep.pipeline_ace_step import ACEStepPipeline
            return True
        except ImportError:
            return False
    
    def _check_model_exists(self) -> bool:
        """Check if model files exist locally."""
        # ACE-Step stores models in ~/.cache/ace-step/checkpoints
        return os.path.exists(MODEL_CACHE_DIR) and len(os.listdir(MODEL_CACHE_DIR)) > 0
        
    async def download_and_load_model(self):
        """
        Downloads ACE-Step model and loads it.
        ACE-Step auto-downloads models on first use.
        """
        if self.is_downloading:
            return
            
        self.is_downloading = True
        self.download_progress = 0.0
        self.download_message = "Starting ACE-Step setup..."
        
        try:
            if not self.has_ace_step:
                self.download_message = "ACE-Step not installed. Please run: pip install git+https://github.com/ace-step/ACE-Step.git"
                logger.error("ACE-Step not installed")
                return
            
            self.download_message = "Loading ACE-Step model (will auto-download if needed, ~13GB)..."
            logger.info("Loading ACE-Step model...")
            
            # Import and initialize ACE-Step
            from acestep.pipeline_ace_step import ACEStepPipeline
            
            self.download_progress = 50.0
            self.download_message = "Initializing pipeline..."
            
            # ACE-Step will auto-download models to ~/.cache/ace-step/checkpoints
            # Use bf16=False on macOS
            use_bf16 = self.device != "mps"
            
            self.model = ACEStepPipeline(
                checkpoint_path=None,  # Auto-download to default location
                device_id=0 if self.device == "cuda" else None,
                bf16=use_bf16,
            )
            
            self.has_loaded = True
            self.download_progress = 100.0
            self.download_message = "Model ready!"
            logger.info("ACE-Step model loaded successfully.")
            
        except ImportError as e:
            self.download_message = f"Import error: {str(e)}. Make sure ACE-Step is installed correctly."
            logger.error(f"ACE-Step import failed: {e}")
        except Exception as e:
            self.download_message = f"Setup failed: {str(e)}"
            logger.error(f"Model setup failed: {e}")
        finally:
            self.is_downloading = False
        
    async def load_model(self):
        """
        Loads the ACE-Step model. Models auto-download on first use.
        """
        if self.has_loaded:
            return

        logger.info(f"Loading ACE-Step model on {self.device}...")
        
        if not self.has_ace_step:
            logger.warning("ACE-Step not installed. Music generation will work in MOCK mode.")
            logger.warning("To install: pip install git+https://github.com/ace-step/ACE-Step.git")
            self.has_loaded = True
            return
        
        try:
            from acestep.pipeline_ace_step import ACEStepPipeline
            
            # ACE-Step auto-downloads models
            use_bf16 = self.device != "mps"
            
            self.model = ACEStepPipeline(
                checkpoint_path=None,
                device_id=0 if self.device == "cuda" else None,
                bf16=use_bf16,
            )
            
            self.has_loaded = True
            logger.info("ACE-Step model loaded successfully.")
        except Exception as e:
            logger.error(f"Failed to load ACE-Step: {e}")
            logger.warning("Falling back to mock mode.")
            self.has_loaded = True

    async def generate(
        self,
        prompt: str,
        lyrics: str = None,
        duration: int = 10,
        guidance_scale: float = 7.0,
        steps: int = 20,
        seed: int = None,
        task: str = "text2music",
        source_audio_path: str = None,
        ref_audio_strength: float = 0.5,
        repaint_start: float = None,
        repaint_end: float = None,
        target_prompt: str = None,
        target_lyrics: str = None
    ):
        """
        Generates music based on the prompt using ACE-Step.
        Returns tuple (audio_url_path, used_seed)
        """
        if not self.has_loaded:
            await self.load_model()

        # Handle seed
        if seed is None:
            seed = torch.randint(0, 2**32 - 1, (1,)).item()
        
        logger.info(f"Generating music: '{prompt}' ({duration}s), Seed: {seed}, Task: {task}")
        
        # Set seed for reproducibility
        torch.manual_seed(seed)
        if self.device == "cuda":
            torch.cuda.manual_seed(seed)
        
        output_dir = "data/music"
        os.makedirs(output_dir, exist_ok=True)
        # Include seed in filename to avoid collisions and allow caching of specific seeds
        filename = f"gen_{abs(hash(prompt + (lyrics or '') + str(seed)))}.wav"
        filepath = os.path.join(output_dir, filename)

        # Handle source audio path if provided
        # Convert /api/music/files/filename to local path
        local_source_path = None
        if source_audio_path:
            if source_audio_path.startswith("http"):
                # Extract filename from URL
                # Assuming format like http://localhost:8000/api/music/files/gen_123.wav
                 fname = source_audio_path.split("/")[-1]
                 local_source_path = os.path.join("data/music", fname)
            elif source_audio_path.startswith("/api/music/files"):
                 fname = source_audio_path.split("/")[-1]
                 local_source_path = os.path.join("data/music", fname)
            else:
                 local_source_path = source_audio_path
            
            if not os.path.exists(local_source_path):
                logger.warning(f"Source audio file not found: {local_source_path}")
                # We might want to throw error or fallback, but for now let's log and proceed
                # (ACE-Step will likely fail if it needs the file)

        try:
            if self.model:
                # Real Inference with ACE-Step
                logger.info("Running inference with ACE-Step...")
                
                try:
                    # Map task-specific parameters
                    # For audio2audio, we use ref_audio_input
                    ref_audio_input = None
                    if task == "audio2audio":
                        ref_audio_input = local_source_path
                    
                    # For edit/repaint/extend, we use src_audio_path
                    src_audio_path_arg = None
                    if task in ["edit", "repaint", "extend"]:
                        src_audio_path_arg = local_source_path

                    # ACE-Step __call__ interface
                    result = self.model(
                        prompt=prompt,
                        lyrics=lyrics if lyrics else "",
                        audio_duration=float(duration),
                        guidance_scale=guidance_scale,
                        infer_step=steps,
                        save_path=filepath,
                        format="wav",
                        task=task,
                        ref_audio_input=ref_audio_input,
                        src_audio_path=src_audio_path_arg,
                        audio2audio_enable=(task == "audio2audio"),
                        ref_audio_strength=ref_audio_strength,
                        repaint_start=repaint_start if repaint_start is not None else 0,
                        repaint_end=repaint_end if repaint_end is not None else 0,
                        edit_target_prompt=target_prompt,
                        edit_target_lyrics=target_lyrics,
                    )
                except Exception as e:
                    # ACE-Step may throw torchcodec error after saving the file
                    # Check if the file was actually saved
                    if os.path.exists(filepath) and os.path.getsize(filepath) > 0:
                        logger.warning(f"ACE-Step threw error but file was saved: {e}")
                    else:
                        raise e
                
                # Result contains saved file path info
                logger.info(f"Audio saved to {filepath}")
                
            else:
                # MOCK IMPLEMENTATION (Sine wave fallback)
                logger.warning("Using mock generation (model not loaded).")
                sr = 44100
                t = np.linspace(0, duration, int(sr * duration), False)
                
                # Use the provided seed for the mock generation too
                rng = np.random.RandomState(seed % (2**32))
                
                # Create a more interesting mock sound
                freq1 = 440 + (rng.randint(0, 220))
                freq2 = freq1 * 1.5  # Perfect fifth
                audio = 0.3 * np.sin(2 * np.pi * freq1 * t) + 0.2 * np.sin(2 * np.pi * freq2 * t)
                
                # Add envelope
                envelope = np.minimum(t / 0.1, 1.0) * np.minimum((duration - t) / 0.5, 1.0)
                audio = audio * envelope
                
                sf.write(filepath, audio.astype(np.float32), sr)
            
            # Return relative path and seed
            return f"/api/music/files/{filename}", seed

        except Exception as e:
            logger.error(f"Generation failed: {e}")
            raise HTTPException(status_code=500, detail=f"Generation failed: {str(e)}")

music_service = MusicService()
