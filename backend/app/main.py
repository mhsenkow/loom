"""
Loom Backend - FastAPI + Socket.IO Server
Personal Intelligence OS
"""

import socketio
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
import uvicorn
import sys
import os
from pathlib import Path

# Ensure backend directory is in Python path for subprocess imports
backend_dir = Path(__file__).parent.parent
if str(backend_dir) not in sys.path:
    sys.path.insert(0, str(backend_dir))

from app.routers import modules, images, files, circuits, search
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

# CORS middleware for Electron renderer
# Allow all localhost origins for local development
import re
def is_localhost_origin(origin: str) -> bool:
    """Check if origin is localhost or 127.0.0.1 on any port"""
    if not origin:
        return False
    pattern = r'^https?://(localhost|127\.0\.0\.1)(:\d+)?$'
    return bool(re.match(pattern, origin))

app.add_middleware(
    CORSMiddleware,
    allow_origin_regex=r'https?://(localhost|127\.0\.0\.1)(:\d+)?',  # Allow any localhost port
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allow_headers=["*"],
    expose_headers=["*"],
    max_age=0,  # Disable preflight caching to avoid browser cache issues
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


@app.get("/health")
async def health_check():
    ollama_status = await ollama_client.check_connection()
    return {
        "status": "healthy",
        "ollama": ollama_status,
        "vector_store": vector_store.is_connected(),
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
    """Handle chat/AI processing requests with optional RAG"""
    prompt = data.get('prompt', '')
    model = data.get('model', 'llama2')
    use_rag = data.get('use_rag', False)  # Enable RAG retrieval
    rag_collection = data.get('rag_collection', None)
    rag_n_results = data.get('rag_n_results', 5)
    
    print(f"[LOOM] Chat request from {sid}: {prompt[:50]}... (RAG: {use_rag})")
    
    # Emit processing start
    await sio.emit('ai_status', {'status': 'running', 'message': 'Processing...'}, room=sid)
    
    try:
        # Retrieve relevant context if RAG is enabled
        final_prompt = prompt
        if use_rag and vector_store.is_connected():
            try:
                context = await vector_store.search_for_rag(
                    query=prompt,
                    n_results=rag_n_results,
                    collection_name=rag_collection,
                )
                if context:
                    final_prompt = f"""Use the following context to answer the question. If the context doesn't contain relevant information, use your general knowledge.

Context:
{context}

Question: {prompt}

Answer:"""
                    await sio.emit('ai_status', {
                        'status': 'running',
                        'message': f'Retrieved {rag_n_results} relevant documents'
                    }, room=sid)
            except Exception as e:
                print(f"[LOOM] RAG retrieval error: {e}")
                # Continue without RAG context
        
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
