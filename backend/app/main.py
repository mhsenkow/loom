"""
Loom Backend - FastAPI + Socket.IO Server
Personal Intelligence OS
"""

import socketio
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
import uvicorn

from app.routers import modules
from app.services.ollama_client import OllamaClient
from app.services.vector_store import VectorStore

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
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # In production, restrict to Electron origin
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include routers
app.include_router(modules.router, prefix="/api/modules", tags=["modules"])

# Initialize services
ollama_client = OllamaClient()
vector_store = VectorStore()


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
    models = await ollama_client.list_models()
    return {"models": models}


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
    """Handle chat/AI processing requests"""
    prompt = data.get('prompt', '')
    model = data.get('model', 'llama2')
    
    print(f"[LOOM] Chat request from {sid}: {prompt[:50]}...")
    
    # Emit processing start
    await sio.emit('ai_status', {'status': 'running', 'message': 'Processing...'}, room=sid)
    
    try:
        # Stream response from Ollama
        async for chunk in ollama_client.stream_chat(prompt, model):
            await sio.emit('ai_chunk', {'content': chunk}, room=sid)
        
        # Emit completion
        await sio.emit('ai_status', {'status': 'success', 'message': 'Complete'}, room=sid)
        
    except Exception as e:
        await sio.emit('ai_status', {'status': 'error', 'message': str(e)}, room=sid)


@sio.event
async def execute_module(sid, data):
    """Execute a module in the circuit"""
    module_id = data.get('module_id')
    module_type = data.get('type')
    inputs = data.get('inputs', {})
    
    print(f"[LOOM] Executing module {module_id} ({module_type})")
    
    await sio.emit('module_status', {
        'module_id': module_id,
        'status': 'running',
    }, room=sid)
    
    # TODO: Implement actual module execution logic
    
    await sio.emit('module_status', {
        'module_id': module_id,
        'status': 'success',
        'output': {'result': 'Module executed successfully'},
    }, room=sid)


# Wrap FastAPI with Socket.IO ASGI app
socket_app = socketio.ASGIApp(sio, app)


def start():
    """Start the server"""
    uvicorn.run(
        "app.main:socket_app",
        host="0.0.0.0",
        port=8000,
        reload=True,
        log_level="info",
    )


if __name__ == "__main__":
    start()
