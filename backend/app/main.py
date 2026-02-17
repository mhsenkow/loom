"""
Loom Backend - FastAPI + Socket.IO Server
Personal Intelligence OS
"""

import socketio
import asyncio
from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import HTMLResponse, FileResponse, JSONResponse
import uvicorn
import sys
import os
import time
import uuid
import logging
import re
from collections import defaultdict, deque
from contextlib import asynccontextmanager
from pathlib import Path
from starlette.exceptions import HTTPException as StarletteHTTPException

# Mac/Unix performance: Use uvloop for faster async I/O if available
try:
    import uvloop
    uvloop.install()
except ImportError:
    pass  # uvloop not available, use default event loop

# Ensure backend directory is in Python path for subprocess imports
backend_dir = Path(__file__).parent.parent
if str(backend_dir) not in sys.path:
    sys.path.insert(0, str(backend_dir))

from app.routers import modules, images, files, circuits, search, remote, code_context, music, sessions, web, tts, qdc, system, scheduler, share, connectors, extensions
from app.routers import providers as providers_router
from app.services.ollama_client import ollama_client
from app.services.provider_manager import provider_manager
from app.services.cloud_provider import ALL_PROVIDERS
from app.services.vector_store import VectorStore, vector_store
from app.services.storage import get_module as storage_get_module, init_db as storage_init_db
from app.services.module_executor import run_module as execute_module_logic
from app.services.file_loader import file_loader
from app.services.orchestrator import orchestrator
from app.services.housekeeping import cleanup_generated_media
from app.services.web_service import web_service
from app.services.qdc_service import qdc_service
from app.services.scheduler_service import scheduler_service
from app.services.share_service import share_service

logger = logging.getLogger(__name__)

# Optional: serve built frontend from backend (e.g. Docker single-container)
SERVE_FRONTEND = os.getenv("LOOM_SERVE_FRONTEND", "").strip().lower() in ("1", "true", "yes")
FRONTEND_DIST = os.getenv("LOOM_FRONTEND_DIST") or str(backend_dir / "frontend_dist")
FRONTEND_DIST_PATH = Path(FRONTEND_DIST)

async def _initialize_services() -> None:
    storage_init_db()
    vector_store.set_ollama_client(ollama_client)
    scheduler_service.start()  # Start scheduler
    try:
        from app.services.telegram_listener import get_telegram_listener
        get_telegram_listener(sio).start()
    except Exception as e:
        logger.warning("Telegram listener not started: %s", e)
    if SERVE_FRONTEND:
        logger.info("Open the app in your browser: http://localhost:8000")
    # Log mobile chat URL so users can connect from phone on same Wi‑Fi
    try:
        local_ip = _get_local_ip()
        if local_ip != '127.0.0.1':
            logger.info("Chat from phone (same Wi‑Fi): http://%s:8000/chat", local_ip)
    except Exception:
        pass

# ... (lines omitted)

async def _shutdown_services() -> None:
    try:
        from app.services.telegram_listener import get_telegram_listener
        get_telegram_listener(sio).stop()
    except Exception:
        logger.exception("telegram_listener_stop_failed")
    try:
        await web_service.cleanup()
    except Exception:
        logger.exception("web_service_cleanup_failed")
    
    try:
        scheduler_service.stop()
    except Exception:
        logger.exception("scheduler_stop_failed")

    try:
        share_service.stop()
    except Exception:
        logger.exception("share_service_stop_failed")


# Create FastAPI app
@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup
    app.state.sio = sio
    await _initialize_services()
    yield
    # Shutdown
    await _shutdown_services()

app = FastAPI(
    title="Loom Backend",
    description="Personal Intelligence OS Backend",
    version="0.1.0",
    lifespan=lifespan
)

# Configure CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # In production, replace with specific origins
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Initialize Socket.IO
# Allow all origins for now to simplify local development
sio = socketio.AsyncServer(async_mode='asgi', cors_allowed_origins='*')


# Wrap FastAPI with Socket.IO
# This is the ASGI application that should be run by uvicorn
socket_app = socketio.ASGIApp(sio, app)

# Global Session Tracking for Auto-Model
_session_auto_model = {}

# Constants
LOG_LEVEL = os.getenv("LOG_LEVEL", "INFO")
ACCESS_LOG_ENABLED = os.getenv("ACCESS_LOG_ENABLED", "True").lower() == "true"

TERMINAL_CHAT_SYSTEM_PROMPT = """You are LOOM, a Personal Intelligence OS. You are a knowledgeable, helpful AI assistant running locally.

Guidelines:
- Be concise and direct. Avoid unnecessary preamble.
- Use markdown formatting (headings, lists, code blocks) for readability.
- When discussing code, use fenced code blocks with language tags.
- If you're unsure, say so honestly rather than fabricating information.
- Tailor your response length to the complexity of the question.
- For creative tasks, be imaginative. For technical tasks, be precise."""

# Include routers
app.include_router(modules.router, prefix="/api/modules", tags=["modules"])
app.include_router(images.router, prefix="/api/images", tags=["images"])
app.include_router(files.router, prefix="/api/files", tags=["files"])
app.include_router(circuits.router, prefix="/api/circuits", tags=["circuits"])
app.include_router(search.router, prefix="/api/search", tags=["search"])
app.include_router(remote.router, prefix="/api/remote", tags=["remote"])
app.include_router(code_context.router, prefix="/api/code-context", tags=["code-context"])
app.include_router(music.router, prefix="/api/music", tags=["music"])
app.include_router(sessions.router, prefix="/api/sessions", tags=["sessions"])
app.include_router(web.router, prefix="/api/web", tags=["web"])
app.include_router(tts.router, prefix="/api/tts", tags=["tts"])
app.include_router(providers_router.router, prefix="/api/providers", tags=["providers"])
app.include_router(qdc.router, prefix="/api/qdc", tags=["qdc"])
app.include_router(system.router, prefix="/api/system", tags=["system"])
app.include_router(scheduler.router, prefix="/api/scheduler", tags=["scheduler"])
app.include_router(share.router, prefix="/api/share", tags=["share"])
app.include_router(connectors.router, prefix="/api/connectors", tags=["connectors"])
app.include_router(extensions.router, prefix="/api/extensions", tags=["extensions"])


# REST Endpoints (when not serving frontend, / returns API info)
if not SERVE_FRONTEND:
    @app.get("/")
    async def root():
        return {
            "name": "Loom Backend",
            "version": "0.1.0",
            "status": "online",
        }


def _get_local_ip() -> str:
    """Get this machine's LAN IP for mobile/same-network access. Tries several methods."""
    import socket
    # 1. UDP trick: connect to non-routable address to see which interface would be used
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        s.settimeout(0)
        try:
            s.connect(('10.254.254.254', 1))
            ip = s.getsockname()[0]
            if ip and ip != '127.0.0.1':
                return ip
        finally:
            s.close()
    except Exception:
        pass
    # 2. Hostname resolution (often gives LAN IP on macOS/Linux)
    try:
        ip = socket.gethostbyname(socket.gethostname())
        if ip and ip != '127.0.0.1':
            return ip
    except Exception:
        pass
    # 3. Fallback: try common WiFi interface on macOS (en0)
    try:
        import subprocess
        result = subprocess.run(
            ['ipconfig', 'getifaddr', 'en0'],
            capture_output=True, text=True, timeout=1
        )
        if result.returncode == 0 and result.stdout.strip():
            return result.stdout.strip()
    except Exception:
        pass
    return '127.0.0.1'


@app.get("/network-info")
async def network_info():
    """Get local network IP address for easy mobile access (chat from phone on same Wi-Fi)."""
    try:
        ip = _get_local_ip()
        return {
            "local_ip": ip,
            "port": 8000,
            "chat_url": f"http://{ip}:8000/chat",
            "api_url": f"http://{ip}:8000",
        }
    except Exception as e:
        return {
            "local_ip": "unknown",
            "port": 8000,
            "chat_url": "http://127.0.0.1:8000/chat",
            "api_url": "http://127.0.0.1:8000",
            "error": str(e),
        }


@app.get("/favicon.ico")
async def favicon():
    """Return empty favicon to avoid 404"""
    from fastapi.responses import Response
    return Response(content="", media_type="image/x-icon")


@app.get("/test")
async def test_endpoint():
    """Simple test endpoint to verify connectivity"""
    return {
        "status": "ok",
        "message": "Backend is reachable",
        "timestamp": __import__('time').time()
    }


@app.get("/diagnostics", response_class=HTMLResponse)
async def diagnostics_page():
    """Serve diagnostics page for troubleshooting"""
    diagnostics_path = Path(__file__).parent / "diagnostics.html"
    if diagnostics_path.exists():
        return FileResponse(diagnostics_path)
    else:
        return HTMLResponse(content="<h1>Diagnostics page not found</h1>")


@app.get("/chat", response_class=HTMLResponse)
async def chat_page():
    """Serve mobile-friendly chat interface. Open this URL on your phone (same Wi‑Fi) to chat."""
    # Resolve backend dir: main.py is in backend/app/, so parent.parent is backend/
    backend_dir = Path(__file__).resolve().parent.parent
    chat_html_path = backend_dir / "chat.html"
    if chat_html_path.exists():
        return FileResponse(chat_html_path)
    # If file doesn't exist, return inline HTML
    else:
        # Return a simple inline HTML if file doesn't exist yet
        return HTMLResponse(content="""
        <!DOCTYPE html>
        <html>
        <head>
            <title>Loom Chat</title>
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <style>
                body { font-family: system-ui; margin: 0; padding: 0; background: #0a0a0a; color: #00ff00; }
                .container { max-width: 100%; height: 100vh; display: flex; flex-direction: column; }
                .messages { flex: 1; overflow-y: auto; padding: 1rem; }
                .input-area { padding: 1rem; border-top: 1px solid #333; }
                input { width: 100%; padding: 0.75rem; background: #1a1a1a; border: 1px solid #333; color: #00ff00; }
            </style>
        </head>
        <body>
            <div class="container">
                <div class="messages" id="messages"></div>
                <div class="input-area">
                    <input type="text" id="input" placeholder="Type your message..." />
                </div>
            </div>
            <script src="/socket.io/socket.io.js"></script>
            <script>
                const socket = io();
                const messages = document.getElementById('messages');
                const input = document.getElementById('input');
                
                socket.on('connect', () => {
                    addMessage('Connected to Loom', 'system');
                });
                
                input.addEventListener('keypress', (e) => {
                    if (e.key === 'Enter') {
                        const msg = input.value;
                        if (msg) {
                            addMessage(msg, 'user');
                            socket.emit('chat', { prompt: msg, model: 'llama3.1:8b' });
                            input.value = '';
                        }
                    }
                });
                
                socket.on('ai_chunk', (data) => {
                    addMessage(data.content, 'ai', true);
                });
                
                function addMessage(text, type, append = false) {
                    const div = document.createElement('div');
                    div.textContent = text;
                    div.style.marginBottom = '0.5rem';
                    div.style.color = type === 'user' ? '#00ff00' : type === 'ai' ? '#00aaff' : '#888';
                    if (append && messages.lastChild && messages.lastChild.classList.contains('ai')) {
                        messages.lastChild.textContent += text;
                    } else {
                        div.classList.add(type);
                        messages.appendChild(div);
                    }
                    messages.scrollTop = messages.scrollHeight;
                }
            </script>
        </body>
        </html>
        """)


@app.get("/health")
async def health_check():
    ollama_status = await ollama_client.check_connection()
    
    # Include system memory info and model memory usage
    try:
        from app.services.system_info import get_system_info
        system_info = get_system_info()
        ram_total = system_info.get("ram_gb", 0)
        ram_available = system_info.get("ram_available_gb", 0)
        ram_system_used = round(ram_total - ram_available, 2)
        
        # Get running models - Ollama usually has one model loaded at a time.
        running_models = await ollama_client.get_running_models()
        model_memory_gb = 0
        loaded_model_name = None
        model_memory_source = "none"
        has_loaded_model = bool(running_models)
        
        # Ollama typically only has one model loaded at a time
        if has_loaded_model:
            # Get the first (and usually only) loaded model
            loaded_model = running_models[0]
            size_vram_bytes = loaded_model.get("size_vram", 0) or 0
            size_bytes = loaded_model.get("size", 0) or loaded_model.get("size_disk", 0) or 0
            selected_size_bytes = size_vram_bytes or size_bytes
            if selected_size_bytes:
                model_memory_source = "size_vram" if size_vram_bytes else "model_size"
                model_memory_gb = round(selected_size_bytes / (1024**3), 2)
            
            # Get model name - try different possible keys
            loaded_model_name = (
                loaded_model.get("name") or 
                loaded_model.get("model") or 
                loaded_model.get("model_name") or
                None
            )
            
            # If still None, try to get from memory info
            if not loaded_model_name:
                memory_info = loaded_model.get("memory", {})
                if isinstance(memory_info, dict):
                    loaded_model_name = memory_info.get("model") or memory_info.get("name")
            
            # Final fallback
            if not loaded_model_name:
                loaded_model_name = None
        
        # `ram_available_gb` already excludes currently used memory.
        # Do not subtract model footprint again (double-count).
        ram_available_for_models = round(max(0, ram_available), 2)
        
        # Optional process-level signal from the local ollama daemon.
        ollama_process_rss_gb = None
        try:
            import psutil
            ollama_rss = 0
            for proc in psutil.process_iter(["name", "memory_info"]):
                name = str(proc.info.get("name") or "").lower()
                if "ollama" not in name:
                    continue
                mem = proc.info.get("memory_info")
                if mem:
                    ollama_rss += int(getattr(mem, "rss", 0) or 0)
            if ollama_rss > 0:
                ollama_process_rss_gb = round(ollama_rss / (1024**3), 2)
        except Exception:
            ollama_process_rss_gb = None
        
        # Get default model that will be used if none is loaded
        default_model = ollama_client._default_model if hasattr(ollama_client, '_default_model') else "llama3.1:8b"
        
        memory_info = {
            "ram_total_gb": ram_total,
            "ram_available_gb": ram_available,
            "ram_system_used_gb": ram_system_used,
            "ram_model_used_gb": round(model_memory_gb, 2),
            "ram_model_used_source": model_memory_source,
            "ram_available_for_models_gb": ram_available_for_models,
            "ram_used_percent": round((ram_system_used / ram_total) * 100, 1) if ram_total > 0 else 0,
            "loaded_model_name": loaded_model_name,
            "default_model": default_model,  # Model that will be used if none is loaded
            "model_status": "loaded" if has_loaded_model else "unloaded (will load on first use)",
            "ollama_process_rss_gb": ollama_process_rss_gb,
        }
    except Exception:
        logger.exception("error_getting_system_memory_info")
        memory_info = {}
    
    return {
        "status": "healthy",
        "ollama": ollama_status,
        "vector_store": vector_store.is_connected(),
        "memory": memory_info,
    }


@app.get("/api/models")
async def list_models():
    """List available Ollama models"""
    try:
        models = await ollama_client.list_models()
        logger.debug("models_list_count=%s", len(models))
        # Ensure all values are JSON-serializable (modified_at can be a datetime)
        safe_models = []
        for m in models:
            safe_models.append({
                "name": str(m.get("name", "unknown")),
                "size": m.get("size", 0),
                "modified_at": str(m.get("modified_at", "")),
            })
        return JSONResponse(content={"models": safe_models})
    except Exception as e:
        logger.exception("error_fetching_models")
        return JSONResponse(content={"models": [], "error": str(e)})


@app.get("/api/suggest-models")
async def suggest_models():
    """Get model suggestions based on system hardware"""
    try:
        from app.services.system_info import get_model_suggestions
        suggestions = get_model_suggestions()
        return suggestions
    except Exception as e:
        logger.exception("error_getting_model_suggestions")
        return {"error": str(e), "system": {}, "suggestions": []}


@app.get("/api/model-info/{model_name}")
async def get_model_info(model_name: str):
    """Get information about a specific model"""
    try:
        from app.services.system_info import suggest_models, get_system_info
        system_info = get_system_info()
        
        # Get model database
        models_db = {
            "mistral": {"size_gb": 4.1, "description": "Mistral 7B - Fast, efficient, great for general tasks", "use": "General purpose chat and reasoning"},
            "mistral:latest": {"size_gb": 4.1, "description": "Mistral 7B - Fast, efficient, great for general tasks", "use": "General purpose chat and reasoning"},
            "llama3.1:8b": {"size_gb": 4.7, "description": "Llama 3.1 8B - Excellent balance of quality and speed", "use": "Best overall performance"},
            "llama3.1:70b": {"size_gb": 40, "description": "Llama 3.1 70B - Highest quality, requires significant RAM", "use": "Complex reasoning and analysis"},
            "phi3:mini": {"size_gb": 2.3, "description": "Microsoft Phi-3 Mini - Ultra-efficient, great for coding", "use": "Fast inference, coding tasks"},
            "codellama": {"size_gb": 3.8, "description": "CodeLlama - Specialized for code generation", "use": "Programming and code assistance"},
            "codellama:7b": {"size_gb": 3.8, "description": "CodeLlama 7B - Specialized for code generation", "use": "Programming and code assistance"},
            "tinyllama": {"size_gb": 0.6, "description": "TinyLlama - Ultra-lightweight, fastest inference", "use": "Quick responses, low resource"},
            "gemma:2b": {"size_gb": 1.4, "description": "Google Gemma 2B - Small but capable", "use": "Lightweight general purpose"},
            "llama3.2:3b": {"size_gb": 2.0, "description": "Llama 3.2 3B - New, efficient model", "use": "Fast inference, general purpose"},
        }
        
        # Try exact match first, then base name
        model_key = model_name
        if model_key not in models_db:
            model_key = model_name.split(':')[0]
        
        if model_key in models_db:
            info = models_db[model_key]
            return {
                "model": model_name,
                "size_gb": info["size_gb"],
                "size": f"~{info['size_gb']}GB",
                "description": info["description"],
                "use": info["use"],
            }
        else:
            return {"model": model_name, "size": "Unknown", "description": "Model information not available", "use": "General purpose"}
    except Exception as e:
        logger.exception("error_getting_model_info model=%s", model_name)
        return {"model": model_name, "size": "Unknown", "description": "Model information not available", "use": "General purpose"}

@app.get("/api/orchestrator/settings")
async def get_orchestrator_settings():
    """Get current orchestrator preferences"""
    return orchestrator.get_settings()

@app.post("/api/orchestrator/settings")
async def update_orchestrator_settings(settings: dict):
    """Update orchestrator preferences"""
    orchestrator.update_settings(settings)
    return {"status": "success", "settings": orchestrator.get_settings()}


# Serve built frontend when LOOM_SERVE_FRONTEND is set (e.g. Docker)
if SERVE_FRONTEND and FRONTEND_DIST_PATH.is_dir() and (FRONTEND_DIST_PATH / "index.html").exists():
    from fastapi.staticfiles import StaticFiles
    app.mount("/", StaticFiles(directory=FRONTEND_DIST, html=True), name="frontend")
    logger.info("Serving frontend from %s", FRONTEND_DIST)


@sio.event
async def connect(sid, environ):
    logger.info("socket_client_connected sid=%s", sid)
    try:
        from app.services.telegram_listener import get_telegram_listener
        get_telegram_listener(sio).client_connected(sid)
    except Exception:
        pass
    await sio.emit('system', {'type': 'connected', 'message': 'Connected to Loom Backend'}, room=sid)


@sio.event
async def disconnect(sid):
    _session_auto_model.pop(sid, None)
    try:
        from app.services.telegram_listener import get_telegram_listener
        get_telegram_listener(sio).client_disconnected(sid)
    except Exception:
        pass
    logger.info("socket_client_disconnected sid=%s", sid)


# ── Chat helper functions ──

def _build_conversation_profile_block(profile: dict | None) -> str:
    """Build a system prompt block from conversation profile settings."""
    if not profile:
        return ""
    parts = []
    if profile.get("name"):
        parts.append(f"User name: {profile['name']}")
    if profile.get("role"):
        parts.append(f"User role: {profile['role']}")
    if profile.get("context"):
        parts.append(f"Context: {profile['context']}")
    if profile.get("preferences"):
        parts.append(f"Preferences: {profile['preferences']}")
    if not parts:
        return ""
    return "Conversation Profile (apply only when relevant):\n" + "\n".join(parts)


def _parse_feedback_profile(raw: dict | None) -> dict:
    """Parse user-specified feedback/tone profile from the frontend."""
    if not raw or not isinstance(raw, dict):
        return {}
    return {
        "verbosity": str(raw.get("verbosity", "normal")),
        "tone": str(raw.get("tone", "neutral")),
        "detail_level": str(raw.get("detail_level", "moderate")),
    }


def _parse_agent_mode(raw) -> str:
    """Parse the agent mode setting (auto, none, etc.)."""
    if not raw:
        return "none"
    mode = str(raw).lower().strip()
    if mode in ("auto", "none", "always"):
        return mode
    return "none"


def _infer_chat_intelligence(prompt: str) -> dict:
    """Lightweight prompt analysis — returns metadata about the user's request."""
    prompt_lower = prompt.lower()
    task = "general"
    if any(kw in prompt_lower for kw in ("code", "function", "debug", "error", "fix", "implement", "syntax")):
        task = "code"
    elif any(kw in prompt_lower for kw in ("explain", "what is", "how does", "summary", "describe")):
        task = "explanation"
    elif any(kw in prompt_lower for kw in ("write", "draft", "compose", "create a")):
        task = "creative"
    return {
        "task": task,
        "response_contract": "direct",
        "confidence": 0.5,
        "uncertainty": 0.3,
        "complexity": 0.3,
        "ask_clarifying_question": False,
        "latest_user_message": prompt[:500],
    }


def _build_behavior_policy(intelligence: dict, feedback_profile: dict) -> str:
    """Build a behavior policy block for the AI system prompt based on intelligence and feedback."""
    parts = []
    task = intelligence.get("task", "general")
    parts.append(f"Task type: {task}")
    verbosity = feedback_profile.get("verbosity", "normal")
    if verbosity == "concise":
        parts.append("Be concise and direct. Avoid unnecessary detail.")
    elif verbosity == "verbose":
        parts.append("Provide thorough, detailed explanations.")
    tone = feedback_profile.get("tone", "neutral")
    if tone == "friendly":
        parts.append("Use a warm, friendly tone.")
    elif tone == "professional":
        parts.append("Use a professional, formal tone.")
    return "Behavior Policy:\n" + "\n".join(f"- {p}" for p in parts)


def _is_local_model(model_str: str) -> bool:
    """Check whether a model string refers to a local (Ollama) model vs cloud."""
    if not model_str:
        return True
    # Cloud models use provider:model format (e.g. "openai:gpt-4", "gemini:...")
    cloud_prefixes = ("openai:", "gemini:", "anthropic:", "mistral:", "groq:", "deepseek:")
    return not any(model_str.startswith(p) for p in cloud_prefixes)


def _sanitize_assistant_output(text: str) -> str:
    """Strip common LLM artifacts from streamed output."""
    if not text:
        return ""
    # Remove repeated assistant role tags that some models emit
    import re
    text = re.sub(r'<\|assistant\|>\s*', '', text)
    text = re.sub(r'<\|end\|>\s*', '', text)
    text = re.sub(r'<\|im_end\|>\s*', '', text)
    text = re.sub(r'<\|im_start\|>assistant\s*', '', text)
    # Strip leading/trailing whitespace
    return text.strip()


@sio.event
async def chat(sid, data):
    """Handle chat/AI processing requests with optional RAG and code context"""
    prompt = str(data.get('prompt', '') or '')
    raw_prompt = str(data.get('raw_prompt', '') or '').strip()
    if not raw_prompt:
        raw_prompt = prompt
    context_mode = str(data.get('context_mode', 'input') or 'input').lower()
    if context_mode not in {'input', 'key', 'full'}:
        context_mode = 'input'
    source = str(data.get('source', 'other') or 'other').lower()
    client_request_id = str(data.get('client_request_id', '') or '').strip()
    conversation_profile = data.get('conversation_profile')
    conversation_profile_block = _build_conversation_profile_block(conversation_profile)
    feedback_profile = _parse_feedback_profile(data.get('feedback_profile'))
    agent_mode = _parse_agent_mode(data.get('agent_mode'))
    intelligence = _infer_chat_intelligence(raw_prompt or prompt)

    requested_model = data.get('model', 'auto')
    requested_model_str = str(requested_model or "")
    is_auto_mode = requested_model_str.lower() == "auto"
    previous_auto_model = _session_auto_model.get(sid) if is_auto_mode else None
    orchestration_prompt = raw_prompt or prompt
    if conversation_profile_block:
        orchestration_prompt = f"{conversation_profile_block}\n\nLatest User Message:\n{orchestration_prompt}"
    
    # --- ORCHESTRATION LAYER ---
    try:
        if is_auto_mode:
            analysis = await orchestrator.analyze(orchestration_prompt, last_model=previous_auto_model)

            # 1. Circuit Detection
            if analysis.action == 'circuit' and analysis.circuit_name:
                await sio.emit('orchestrator_event', {
                    'type': 'circuit_suggestion',
                    'circuit': analysis.circuit_name,
                    'reason': analysis.reasoning
                }, room=sid)
                # We could return here if we want to stop chat, but usually
                # we let chat proceed or wait for user confirmation.
                # For now, let's notify and continue chat unless user strictly blocked it.

            # 2. Auto Model Selection
            if analysis.model_name:
                requested_model = analysis.model_name
                switched = bool(previous_auto_model and previous_auto_model != requested_model)
                await sio.emit('orchestrator_event', {
                    'type': 'model_switched' if switched else 'model_selected',
                    'model': requested_model,
                    'previous_model': previous_auto_model,
                    'switched': switched,
                    'reason': analysis.reasoning,
                }, room=sid)
                _session_auto_model[sid] = requested_model
            else:
                requested_model = 'llama3.1:8b'  # Fallback
                _session_auto_model[sid] = requested_model
        else:
            # In manual model mode, keep routing lightweight but still suggest circuits.
            circuit_match = orchestrator.detect_circuit_intent(orchestration_prompt)
            if circuit_match:
                await sio.emit('orchestrator_event', {
                    'type': 'circuit_suggestion',
                    'circuit': circuit_match,
                    'reason': 'Detected circuit intent from latest user message.'
                }, room=sid)

    except Exception:
        logger.exception("orchestrator_analysis_error")
        if is_auto_mode:
            requested_model = 'llama3.1:8b'
            _session_auto_model[sid] = requested_model

    model = requested_model
    use_rag = data.get('use_rag', False)  # Enable RAG retrieval
    rag_collection = data.get('rag_collection', None)
    rag_n_results = data.get('rag_n_results', 5)
    use_code_context = data.get('use_code_context', False)  # Enable code context
    code_context_collection = data.get('code_context_collection', 'loom_code_context')
    
    logger.debug(
        "chat_request sid=%s source=%s mode=%s rag=%s code_context=%s profile=%s agent_mode=%s contract=%s confidence=%.2f uncertainty=%.2f prompt_len=%s raw_len=%s prompt_preview=%s",
        sid,
        source,
        context_mode,
        use_rag,
        use_code_context,
        bool(conversation_profile_block),
        agent_mode,
        intelligence.get("response_contract"),
        float(intelligence.get("confidence") or 0.0),
        float(intelligence.get("uncertainty") or 0.0),
        len(prompt),
        len(raw_prompt),
        raw_prompt[:50] if raw_prompt else prompt[:50],
    )
    
    route = "local" if _is_local_model(str(model)) else "cloud"
    response_contract = str(intelligence.get("response_contract") or "direct")
    confidence = float(intelligence.get("confidence") or 0.0)
    ask_clarifying = bool(intelligence.get("ask_clarifying_question") or False)
    base_provenance = ["conversation", "local_model" if route == "local" else "cloud_model"]
    if conversation_profile_block:
        base_provenance.append("goals_memory")
    if use_code_context:
        base_provenance.append("code_context")
    if use_rag:
        base_provenance.append("retrieval")

    await sio.emit('ai_meta', {
        'phase': 'dispatch',
        'request_id': client_request_id or None,
        'route': route,
        'confidence': confidence,
        'response_contract': response_contract,
        'provenance': base_provenance,
        'requires_clarification': ask_clarifying,
        'agent_mode': agent_mode,
        'agent_used': False,
    }, room=sid)

    # Emit processing start
    await sio.emit('ai_status', {
        'status': 'running',
        'message': 'Processing...',
        'request_id': client_request_id or None,
        'route': route,
        'confidence': confidence,
        'response_contract': response_contract,
        'provenance': base_provenance,
        'requires_clarification': ask_clarifying,
        'agent_mode': agent_mode,
        'agent_used': False,
    }, room=sid)
    
    try:
        # Retrieve relevant context if RAG or code context is enabled
        final_prompt = prompt
        retrieval_query = raw_prompt or prompt
        context_parts = []
        
        # Code context (priority - more specific)
        if use_code_context and vector_store.is_connected():
            try:
                logger.debug("searching_code_context collection=%s", code_context_collection)
                code_context = await vector_store.search_for_rag(
                    query=retrieval_query,
                    n_results=5,
                    collection_name=code_context_collection,
                )
                if code_context:
                    logger.debug("code_context_found chars=%s", len(code_context))
                    context_parts.append(f"Code Context:\n{code_context}")
                    await sio.emit('ai_status', {
                        'status': 'running',
                        'message': 'Retrieved code context'
                    }, room=sid)
                else:
                    logger.debug("code_context_not_found prompt_preview=%s", retrieval_query[:50])
            except Exception:
                logger.exception("code_context_retrieval_error")
        
        # General RAG context
        if use_rag and vector_store.is_connected():
            try:
                rag_context = await vector_store.search_for_rag(
                    query=retrieval_query,
                    n_results=rag_n_results,
                    collection_name=rag_collection,
                )
                if rag_context:
                    context_parts.append(f"Document Context:\n{rag_context}")
                    await sio.emit('ai_status', {
                        'status': 'running',
                        'message': f'Retrieved {rag_n_results} relevant documents'
                    }, room=sid)
            except Exception:
                logger.exception("rag_retrieval_error")
        
        # Combine contexts if any
        if context_parts:
            context_block = "\n\n---\n\n".join(context_parts)
            final_prompt = f"""You have access to the following code context from the user's project. Use this information to answer their question accurately. If the context contains relevant information, prioritize it over general knowledge.

{context_block}

---

User Question: {prompt}

Instructions:
- If the code context contains relevant information about the project structure, files, or code, use it to provide specific, accurate answers.
- You can reference specific files, functions, and code patterns from the context.
- If the context doesn't contain relevant information, you can use your general knowledge, but mention that the specific information wasn't found in the project context.

Answer:"""

        system_prompt = TERMINAL_CHAT_SYSTEM_PROMPT if source == 'terminal' else None
        if system_prompt:
            policy_block = _build_behavior_policy(intelligence, feedback_profile)
            system_prompt = f"{system_prompt}\n\n{policy_block}"
            if (
                conversation_profile_block
                and "Conversation Profile (apply only when relevant):" not in prompt
            ):
                system_prompt = f"{system_prompt}\n\n{conversation_profile_block}"

        # Stream primary response (with anti-loop sanitization)
        parsed_provider, parsed_model_name = await provider_manager.resolve_model_target(str(model))
        task_label = str(intelligence.get("task") or "general")
        use_mistral_agent = False
        raw_stream = ""
        emitted_len = 0
        if agent_mode == "auto" and parsed_provider == "mistral":
            mistral_provider = provider_manager.get_provider("mistral")
            stream_with_agent = getattr(mistral_provider, "stream_chat_with_agent", None)
            if callable(stream_with_agent):
                try:
                    await sio.emit('ai_meta', {
                        'phase': 'agent_dispatch',
                        'request_id': client_request_id or None,
                        'route': route,
                        'confidence': confidence,
                        'response_contract': response_contract,
                        'provenance': [*base_provenance, 'mistral_agent'],
                        'agent_mode': agent_mode,
                        'agent_used': True,
                        'agent_provider': 'mistral',
                        'agent_task': task_label,
                    }, room=sid)
                    await sio.emit('ai_status', {
                        'status': 'running',
                        'message': 'Spawning Mistral task agent...',
                        'request_id': client_request_id or None,
                        'route': route,
                        'confidence': confidence,
                        'response_contract': response_contract,
                        'provenance': [*base_provenance, 'mistral_agent'],
                        'requires_clarification': ask_clarifying,
                        'agent_mode': agent_mode,
                        'agent_used': True,
                    }, room=sid)
                    async for chunk in stream_with_agent(
                        final_prompt,
                        parsed_model_name,
                        task=task_label,
                        system_prompt=system_prompt,
                    ):
                        raw_stream += chunk
                        sanitized = _sanitize_assistant_output(raw_stream)
                        delta = sanitized[emitted_len:]
                        if delta:
                            await sio.emit('ai_chunk', {'content': delta, 'request_id': client_request_id or None}, room=sid)
                            emitted_len = len(sanitized)
                    use_mistral_agent = True
                except Exception:
                    logger.exception("mistral_agent_path_failed sid=%s model=%s task=%s", sid, model, task_label)
                    await sio.emit('ai_meta', {
                        'phase': 'agent_fallback',
                        'request_id': client_request_id or None,
                        'route': route,
                        'confidence': confidence,
                        'response_contract': response_contract,
                        'provenance': base_provenance,
                        'agent_mode': agent_mode,
                        'agent_used': False,
                        'agent_provider': 'mistral',
                    }, room=sid)

        if not use_mistral_agent:
            async for chunk in provider_manager.stream_chat(final_prompt, model, system_prompt=system_prompt):
                raw_stream += chunk
                sanitized = _sanitize_assistant_output(raw_stream)
                delta = sanitized[emitted_len:]
                if delta:
                    await sio.emit('ai_chunk', {'content': delta, 'request_id': client_request_id or None}, room=sid)
                    emitted_len = len(sanitized)

        primary_response = _sanitize_assistant_output(raw_stream)
        refinement_model = None
        should_refine = (
            source == 'terminal'
            and route == 'local'
            and (
                float(intelligence.get("uncertainty") or 0.0) >= 0.58
                or float(intelligence.get("complexity") or 0.0) >= 0.68
            )
        )

        if should_refine:
            try:
                refinement_pick = await provider_manager.suggest_refinement_model(
                    active_model=str(model),
                    task=str(intelligence.get("task") or "general"),
                )
                if refinement_pick and refinement_pick.get("model"):
                    refinement_model = str(refinement_pick["model"])
            except Exception:
                refinement_model = None

        if refinement_model:
            try:
                await sio.emit('ai_meta', {
                    'phase': 'refine',
                    'request_id': client_request_id or None,
                    'route': 'hybrid',
                    'confidence': confidence,
                    'response_contract': response_contract,
                    'provenance': [*base_provenance, 'cloud_refinement'],
                    'refinement_model': refinement_model,
                }, room=sid)
                await sio.emit('ai_status', {
                    'status': 'running',
                    'message': f'Refining with {refinement_model}...',
                    'request_id': client_request_id or None,
                    'route': 'hybrid',
                    'confidence': min(0.99, confidence + 0.08),
                    'response_contract': response_contract,
                    'provenance': [*base_provenance, 'cloud_refinement'],
                    'requires_clarification': ask_clarifying,
                }, room=sid)

                refinement_prompt = (
                    "You are improving a draft assistant response.\n"
                    "Return exactly one improved assistant reply.\n"
                    "Preserve factual correctness and avoid adding unsupported claims.\n"
                    "Do not include labels like 'Draft' or 'Final'.\n\n"
                    f"Latest user request:\n{intelligence.get('latest_user_message')}\n\n"
                    f"Draft reply:\n{primary_response}\n\n"
                    "Improved reply:"
                )
                await sio.emit('ai_chunk', {'content': "\n\n[cloud-refinement]\n", 'request_id': client_request_id or None}, room=sid)

                refine_raw = ""
                refine_emitted_len = 0
                async for refine_chunk in provider_manager.stream_chat(refinement_prompt, refinement_model, system_prompt=system_prompt):
                    refine_raw += refine_chunk
                    refine_sanitized = _sanitize_assistant_output(refine_raw)
                    refine_delta = refine_sanitized[refine_emitted_len:]
                    if refine_delta:
                        await sio.emit('ai_chunk', {'content': refine_delta, 'request_id': client_request_id or None}, room=sid)
                        refine_emitted_len = len(refine_sanitized)
            except Exception:
                logger.exception("cloud_refinement_failed model=%s", refinement_model)
                refinement_model = None

        completion_provenance = list(base_provenance)
        if use_mistral_agent:
            completion_provenance.append('mistral_agent')
        if refinement_model:
            completion_provenance.append('cloud_refinement')

        # Emit completion
        await sio.emit('ai_status', {
            'status': 'success',
            'message': 'Complete',
            'model': model,
            'request_id': client_request_id or None,
            'route': 'hybrid' if refinement_model else route,
            'confidence': min(0.99, confidence + (0.08 if refinement_model else 0.0)),
            'response_contract': response_contract,
            'provenance': completion_provenance,
            'refined_by': refinement_model,
            'requires_clarification': ask_clarifying,
            'agent_mode': agent_mode,
            'agent_used': use_mistral_agent,
        }, room=sid)

    except Exception as e:
        await sio.emit('ai_status', {
            'status': 'error',
            'message': str(e),
            'request_id': client_request_id or None,
            'route': route,
            'confidence': confidence,
            'response_contract': response_contract,
            'provenance': base_provenance,
            'agent_mode': agent_mode,
            'agent_used': False,
        }, room=sid)


@sio.event
async def pull_model(sid, data):
    """Pull/download an Ollama model with progress updates"""
    model_name = data.get('model', '').strip()
    
    if not model_name:
        await sio.emit('pull_status', {
            'status': 'error',
            'message': 'No model name provided'
        }, room=sid)
        return
    
    # Normalize model name (add :latest if no tag specified)
    if ':' not in model_name:
        model_name = f"{model_name}:latest"
    
    logger.info("pull_model_request sid=%s model=%s", sid, model_name)
    
    # Check if Ollama is accessible first
    try:
        ollama_status = await ollama_client.check_connection()
        if not ollama_status.get('connected'):
            error_msg = ollama_status.get('error', 'Ollama is not running or not accessible')
            await sio.emit('pull_status', {
                'status': 'error',
                'model': model_name,
                'message': f'Ollama connection failed: {error_msg}',
                'error': error_msg,
            }, room=sid)
            return
    except Exception as e:
        await sio.emit('pull_status', {
            'status': 'error',
            'model': model_name,
            'message': f'Cannot connect to Ollama: {str(e)}',
            'error': str(e),
        }, room=sid)
        return
    
    try:
        # Stream pull progress
        error_occurred = False
        last_completed = 0
        last_ts = time.monotonic()
        
        async for progress in ollama_client.pull_model(model_name):
            status = progress.get('status', '')
            completed = progress.get('completed', 0) or 0
            total = progress.get('total', 0) or 0
            error = progress.get('error')
            
            # Ensure completed and total are integers
            try:
                completed = int(completed) if completed is not None else 0
                total = int(total) if total is not None else 0
            except (ValueError, TypeError):
                completed = 0
                total = 0
            
            # Check for error in progress
            if status == 'error' or error:
                error_occurred = True
                error_message = error or progress.get('message', 'Unknown error occurred')
                logger.warning("pull_model_progress_error model=%s error=%s", model_name, error_message)
                await sio.emit('pull_status', {
                    'status': 'error',
                    'model': model_name,
                    'message': error_message,
                    'error': error_message,
                }, room=sid)
                return
            
            # Calculate percentage if we have both
            percent = None
            if total and total > 0:
                percent = int((completed / total) * 100)

            now_ts = time.monotonic()
            elapsed = max(0.001, now_ts - last_ts)
            speed_bps = max(0.0, (completed - last_completed) / elapsed)
            last_completed = completed
            last_ts = now_ts
            eta_seconds = None
            if total and speed_bps > 0:
                eta_seconds = int(max(0, total - completed) / speed_bps)
            
            # Build progress message
            progress_msg = status
            if total > 0:
                mb_completed = completed / (1024 * 1024)
                mb_total = total / (1024 * 1024)
                speed_mb_s = speed_bps / (1024 * 1024)
                if percent is not None:
                    progress_msg = f"{status}... {percent}% ({mb_completed:.1f}MB / {mb_total:.1f}MB @ {speed_mb_s:.1f}MB/s)"
                else:
                    progress_msg = f"{status}... {mb_completed:.1f}MB / {mb_total:.1f}MB @ {speed_mb_s:.1f}MB/s"
            
            await sio.emit('pull_status', {
                'status': status,
                'model': model_name,
                'completed': completed,
                'total': total,
                'percent': percent,
                'message': progress_msg,
                'speed_bps': speed_bps if speed_bps > 0 else None,
                'eta_seconds': eta_seconds,
            }, room=sid)
        
        # Check if we completed successfully (no error occurred)
        if not error_occurred:
            # Pull completed successfully
            await sio.emit('pull_status', {
                'status': 'success',
                'model': model_name,
                'message': f'Model "{model_name}" downloaded successfully',
            }, room=sid)
            
            # Refresh models list
            try:
                models = await ollama_client.list_models()
                await sio.emit('models_updated', {'models': models}, room=sid)
            except Exception:
                logger.exception("error_refreshing_models_after_pull model=%s", model_name)
        
    except Exception as e:
        logger.exception("error_pulling_model model=%s", model_name)
        await sio.emit('pull_status', {
            'status': 'error',
            'model': model_name,
            'message': f'Failed to pull model: {str(e)}',
            'error': str(e),
        }, room=sid)


@sio.event
async def pull_image_model(sid, data):
    """Download/prepare an image generation model"""
    model_name = data.get('model', '').strip()
    
    if not model_name:
        await sio.emit('pull_image_status', {
            'status': 'error',
            'message': 'No model name provided'
        }, room=sid)
        return
    
    logger.info("pull_image_model_request sid=%s model=%s", sid, model_name)
    
    try:
        from app.services.local_image_gen import local_image_gen
        
        # Check if model is in our list
        from app.services.local_image_gen import MODELS
        if model_name not in MODELS:
            await sio.emit('pull_image_status', {
                'status': 'error',
                'model': model_name,
                'message': f'Unknown model: {model_name}. Available: {", ".join(MODELS.keys())}',
                'error': f'Model {model_name} not found',
            }, room=sid)
            return
        
        model_info = MODELS[model_name]
        
        # Send initial status
        await sio.emit('pull_image_status', {
            'status': 'starting',
            'model': model_name,
            'message': f'Preparing to download {model_name}...',
            'repo': model_info['repo'],
        }, room=sid)
        
        try:
            loop = asyncio.get_running_loop()
            progress_queue: asyncio.Queue[dict | None] = asyncio.Queue()

            def progress_callback(payload: dict):
                loop.call_soon_threadsafe(progress_queue.put_nowait, payload)

            async def emit_progress_stream():
                while True:
                    update = await progress_queue.get()
                    if update is None:
                        break
                    emit_payload = {
                        'status': update.get('status', 'downloading'),
                        'model': model_name,
                        'message': update.get('message'),
                        'repo': model_info.get('repo'),
                        'completed': update.get('completed'),
                        'total': update.get('total'),
                        'percent': update.get('percent'),
                        'speed_bps': update.get('speed_bps'),
                        'eta_seconds': update.get('eta_seconds'),
                        'file_name': update.get('file_name'),
                        'files_completed': update.get('files_completed'),
                        'files_total': update.get('files_total'),
                    }
                    await sio.emit('pull_image_status', emit_payload, room=sid)

            emitter_task = asyncio.create_task(emit_progress_stream())
            try:
                await loop.run_in_executor(None, lambda: local_image_gen.load_model(model_name, progress_callback=progress_callback))
            finally:
                await progress_queue.put(None)
                await emitter_task

            await sio.emit('pull_image_status', {
                'status': 'success',
                'model': model_name,
                'message': f'Model {model_name} is ready!',
                'percent': 100,
            }, room=sid)
        except Exception as e:
            error_msg = str(e)
            # Check if it's a HuggingFace token issue
            if 'token' in error_msg.lower() or 'authentication' in error_msg.lower():
                error_msg = f"Model requires HuggingFace token. Set it with: /set-hf-token <your-token>\n\nGet a token from: https://huggingface.co/settings/tokens"
            
            await sio.emit('pull_image_status', {
                'status': 'error',
                'model': model_name,
                'message': f'Failed to load model: {error_msg}',
                'error': error_msg,
            }, room=sid)
    
    except Exception as e:
        logger.exception("error_pulling_image_model model=%s", model_name)
        await sio.emit('pull_image_status', {
            'status': 'error',
            'model': model_name,
            'message': f'Failed to pull model: {str(e)}',
            'error': str(e),
        }, room=sid)


@sio.event
async def execute_module(sid, data):
    """Execute a module in the circuit"""
    module_id = data.get('module_id')
    module_type = data.get('type')
    inputs = data.get('inputs', {}) or {}
    content = data.get('content')
    model = data.get('model')
    
    if not module_type and module_id:
        mod = storage_get_module(module_id)
        if mod:
            module_type = mod.get('type', '')
            if content is None or content == '':
                content = mod.get('content', '')
    
    if not module_type:
        await sio.emit('module_status', {
            'module_id': module_id,
            'status': 'error',
            'output': {'error': 'Missing type or module_id'},
        }, room=sid)
        return
    
    if content is None:
        content = ''
    
    logger.debug("execute_module module_id=%s module_type=%s", module_id, module_type)
    
    await sio.emit('module_status', {
        'module_id': module_id,
        'status': 'running',
    }, room=sid)
    
    try:
        result = await execute_module_logic(
            module_type, content, inputs,
            ollama=ollama_client, model=model,
            vector_store=vector_store,
            provider_manager=provider_manager,
        )
        await sio.emit('module_status', {
            'module_id': module_id,
            'status': 'success',
            'output': {'result': result},
        }, room=sid)
    except Exception as e:
        await sio.emit('module_status', {
            'module_id': module_id,
            'status': 'error',
            'output': {'error': str(e)},
        }, room=sid)


# Wrap FastAPI with Socket.IO ASGI app
socket_app = socketio.ASGIApp(sio, app)


def start():
    """Start the server"""
    # Ensure backend directory is in PYTHONPATH for subprocess imports
    backend_path = Path(__file__).parent.parent
    pythonpath = os.environ.get('PYTHONPATH', '')
    if str(backend_path) not in pythonpath.split(os.pathsep):
        os.environ['PYTHONPATH'] = f"{backend_path}{os.pathsep}{pythonpath}" if pythonpath else str(backend_path)
    
    # Change to backend directory to ensure imports work
    original_cwd = os.getcwd()
    try:
        os.chdir(backend_path)
        # Use string import for reload to work properly, but ensure path is set
        uvicorn.run(
            "app.main:socket_app",
            host="0.0.0.0",
            port=8000,
            reload=True,
            log_level=LOG_LEVEL.lower(),
            access_log=ACCESS_LOG_ENABLED,
            reload_dirs=[str(backend_path)],  # Tell uvicorn where to watch for changes
        )
    finally:
        # Restore original working directory
        os.chdir(original_cwd)


if __name__ == "__main__":
    start()
