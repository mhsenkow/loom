"""
Loom Backend - FastAPI + Socket.IO Server
Personal Intelligence OS
"""

import socketio
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import HTMLResponse, FileResponse
import uvicorn
import sys
import os
from pathlib import Path

# Ensure backend directory is in Python path for subprocess imports
backend_dir = Path(__file__).parent.parent
if str(backend_dir) not in sys.path:
    sys.path.insert(0, str(backend_dir))

from app.routers import modules, images, files, circuits, search, remote, code_context, music
from app.services.ollama_client import ollama_client
from app.services.vector_store import VectorStore
from app.services.storage import get_module as storage_get_module, init_db as storage_init_db
from app.services.module_executor import run_module as execute_module_logic
from app.services.file_loader import file_loader


# Create Socket.IO server
sio = socketio.AsyncServer(
    async_mode='asgi',
    cors_allowed_origins='*',
    logger=True,
)

# Create FastAPI app
app = FastAPI(
    title="Loom Backend",
    description="Personal Intelligence OS - The Deck",
    version="0.1.0",
)

# CORS middleware - Allow all origins for development
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Allow all origins for development
    allow_credentials=False,  # Must be False when using "*"
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=["*"],
)

# Initialize services
vector_store = VectorStore()

# Set vector store for search router (must be after vector_store creation)
search.set_vector_store(vector_store)

# Also set for modules router
from app.routers import modules
modules.set_vector_store(vector_store)

# Include routers
app.include_router(modules.router, prefix="/api/modules", tags=["modules"])
app.include_router(images.router, prefix="/api/images", tags=["images"])
app.include_router(files.router, prefix="/api/files", tags=["files"])
app.include_router(circuits.router, prefix="/api/circuits", tags=["circuits"])
app.include_router(search.router, prefix="/api/search", tags=["search"])
app.include_router(remote.router, prefix="/api/remote", tags=["remote"])
app.include_router(code_context.router, prefix="/api/code-context", tags=["code-context"])
app.include_router(music.router, prefix="/api/music", tags=["music"])

# Initialize database on startup
@app.on_event("startup")
async def startup_event():
    """Initialize database and services on startup"""
    storage_init_db()
    
    # Auto-configure default data folder if not set
    if not file_loader.get_data_folder():
        default_data_folder = os.path.join(
            os.path.dirname(__file__),
            "..", "..", "data", "files"
        )
        default_data_folder = os.path.abspath(default_data_folder)
        success = file_loader.set_data_folder(default_data_folder, create=True)
        if success:
            print(f"[LOOM] Auto-configured data folder: {default_data_folder}")
        else:
            print(f"[LOOM] Warning: Could not auto-configure data folder: {default_data_folder}")
    
    # Connect Ollama client to vector store for embedding generation
    vector_store.set_ollama_client(ollama_client)
    print("[LOOM] Database initialized")
    print(f"[LOOM] VectorStore ready with {vector_store.count()} documents")


# REST Endpoints
@app.get("/")
async def root():
    return {
        "name": "Loom Backend",
        "version": "0.1.0",
        "status": "online",
    }


@app.get("/network-info")
async def network_info():
    """Get local network IP address for easy mobile access"""
    import socket
    try:
        # Connect to a remote address to determine local IP
        # This doesn't actually send data, just determines the route
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        s.settimeout(0)
        try:
            # Try to connect to a non-routable address
            s.connect(('10.254.254.254', 1))
            ip = s.getsockname()[0]
        except Exception:
            ip = '127.0.0.1'
        finally:
            s.close()
        
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
    """Serve mobile-friendly chat interface"""
    # Try multiple possible paths
    possible_paths = [
        Path(__file__).parent / "chat.html",  # backend/chat.html
        Path(__file__).parent.parent / "chat.html",  # loom/chat.html
    ]
    
    for chat_html_path in possible_paths:
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
        
        # Get running models - Ollama only loads one model at a time
        running_models = await ollama_client.get_running_models()
        model_memory_gb = 0
        loaded_model_name = None
        
        # Ollama typically only has one model loaded at a time
        if running_models and len(running_models) > 0:
            # Get the first (and usually only) loaded model
            loaded_model = running_models[0]
            size_bytes = loaded_model.get("size", 0)
            if size_bytes:
                model_memory_gb = round(size_bytes / (1024**3), 2)
            
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
                loaded_model_name = "unknown"
        
        # Calculate available RAM for more models
        ram_available_for_models = max(0, round(ram_available - model_memory_gb, 2))
        
        # Get default model that will be used if none is loaded
        default_model = ollama_client._default_model if hasattr(ollama_client, '_default_model') else "llama3.1:8b"
        
        memory_info = {
            "ram_total_gb": ram_total,
            "ram_available_gb": ram_available,
            "ram_system_used_gb": ram_system_used,
            "ram_model_used_gb": round(model_memory_gb, 2),
            "ram_available_for_models_gb": ram_available_for_models,
            "ram_used_percent": round((ram_system_used / ram_total) * 100, 1) if ram_total > 0 else 0,
            "loaded_model_name": loaded_model_name if loaded_model_name and loaded_model_name != "unknown" else None,
            "default_model": default_model,  # Model that will be used if none is loaded
            "model_status": "loaded" if loaded_model_name else "unloaded (will load on first use)",
        }
    except Exception as e:
        print(f"[LOOM] Error getting system memory info: {e}")
        import traceback
        traceback.print_exc()
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
        print(f"[LOOM] Returning {len(models)} models: {[m.get('name', 'unknown') if isinstance(m, dict) else getattr(m, 'name', 'unknown') for m in models]}")
        return {"models": models}
    except Exception as e:
        print(f"[LOOM] Error fetching models: {e}")
        import traceback
        traceback.print_exc()
        # Return empty list instead of failing - frontend can handle this
        return {"models": [], "error": str(e)}


@app.get("/api/suggest-models")
async def suggest_models():
    """Get model suggestions based on system hardware"""
    try:
        from app.services.system_info import get_model_suggestions
        suggestions = get_model_suggestions()
        return suggestions
    except Exception as e:
        print(f"[LOOM] Error getting model suggestions: {e}")
        import traceback
        traceback.print_exc()
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
        print(f"[LOOM] Error getting model info: {e}")
        return {"error": str(e), "model": model_name}


# Socket.IO Events
@sio.event
async def connect(sid, environ):
    print(f"[LOOM] Client connected: {sid}")
    await sio.emit('system', {'type': 'connected', 'message': 'Connected to Loom Backend'}, room=sid)


@sio.event
async def disconnect(sid):
    print(f"[LOOM] Client disconnected: {sid}")


@sio.event
async def chat(sid, data):
    """Handle chat/AI processing requests with optional RAG and code context"""
    prompt = data.get('prompt', '')
    model = data.get('model', 'llama3.1:8b')
    use_rag = data.get('use_rag', False)  # Enable RAG retrieval
    rag_collection = data.get('rag_collection', None)
    rag_n_results = data.get('rag_n_results', 5)
    use_code_context = data.get('use_code_context', False)  # Enable code context
    code_context_collection = data.get('code_context_collection', 'loom_code_context')
    
    print(f"[LOOM] Chat request from {sid}: {prompt[:50]}... (RAG: {use_rag}, Code: {use_code_context})")
    
    # Emit processing start
    await sio.emit('ai_status', {'status': 'running', 'message': 'Processing...'}, room=sid)
    
    try:
        # Retrieve relevant context if RAG or code context is enabled
        final_prompt = prompt
        context_parts = []
        
        # Code context (priority - more specific)
        if use_code_context and vector_store.is_connected():
            try:
                print(f"[LOOM] Searching code context collection: {code_context_collection}")
                code_context = await vector_store.search_for_rag(
                    query=prompt,
                    n_results=5,
                    collection_name=code_context_collection,
                )
                if code_context:
                    print(f"[LOOM] Found code context: {len(code_context)} chars")
                    context_parts.append(f"Code Context:\n{code_context}")
                    await sio.emit('ai_status', {
                        'status': 'running',
                        'message': 'Retrieved code context'
                    }, room=sid)
                else:
                    print(f"[LOOM] No code context found for query: {prompt[:50]}")
            except Exception as e:
                print(f"[LOOM] Code context retrieval error: {e}")
                import traceback
                traceback.print_exc()
        
        # General RAG context
        if use_rag and vector_store.is_connected():
            try:
                rag_context = await vector_store.search_for_rag(
                    query=prompt,
                    n_results=rag_n_results,
                    collection_name=rag_collection,
                )
                if rag_context:
                    context_parts.append(f"Document Context:\n{rag_context}")
                    await sio.emit('ai_status', {
                        'status': 'running',
                        'message': f'Retrieved {rag_n_results} relevant documents'
                    }, room=sid)
            except Exception as e:
                print(f"[LOOM] RAG retrieval error: {e}")
        
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
        
        # Stream response from Ollama
        async for chunk in ollama_client.stream_chat(final_prompt, model):
            await sio.emit('ai_chunk', {'content': chunk}, room=sid)
        
        # Emit completion
        await sio.emit('ai_status', {'status': 'success', 'message': 'Complete'}, room=sid)
        
    except Exception as e:
        await sio.emit('ai_status', {'status': 'error', 'message': str(e)}, room=sid)


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
    
    print(f"[LOOM] Pull request for model: {model_name}")
    
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
        error_message = None
        
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
                print(f"[LOOM] Pull error for {model_name}: {error_message}")
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
            
            # Build progress message
            progress_msg = status
            if total > 0:
                mb_completed = completed / (1024 * 1024)
                mb_total = total / (1024 * 1024)
                if percent is not None:
                    progress_msg = f"{status}... {percent}% ({mb_completed:.1f}MB / {mb_total:.1f}MB)"
                else:
                    progress_msg = f"{status}... {mb_completed:.1f}MB / {mb_total:.1f}MB"
            
            await sio.emit('pull_status', {
                'status': status,
                'model': model_name,
                'completed': completed,
                'total': total,
                'percent': percent,
                'message': progress_msg,
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
            except Exception as e:
                print(f"[LOOM] Error refreshing models list: {e}")
        
    except Exception as e:
        import traceback
        error_details = traceback.format_exc()
        print(f"[LOOM] Error pulling model {model_name}: {e}")
        print(f"[LOOM] Traceback: {error_details}")
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
    
    print(f"[LOOM] Pull request for image model: {model_name}")
    
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
        
        # Try to load the model (this will download if needed)
        # Note: This is a blocking operation, but diffusers handles progress internally
        try:
            local_image_gen.load_model(model_name)
            await sio.emit('pull_image_status', {
                'status': 'success',
                'model': model_name,
                'message': f'Model {model_name} is ready!',
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
        import traceback
        error_details = traceback.format_exc()
        print(f"[LOOM] Error pulling image model {model_name}: {e}")
        print(f"[LOOM] Traceback: {error_details}")
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
    
    print(f"[LOOM] Executing module {module_id} ({module_type})")
    
    await sio.emit('module_status', {
        'module_id': module_id,
        'status': 'running',
    }, room=sid)
    
    try:
        result = await execute_module_logic(
            module_type, content, inputs,
            ollama=ollama_client, model=model,
            vector_store=vector_store,
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
            log_level="info",
            reload_dirs=[str(backend_path)],  # Tell uvicorn where to watch for changes
        )
    finally:
        # Restore original working directory
        os.chdir(original_cwd)


if __name__ == "__main__":
    start()
