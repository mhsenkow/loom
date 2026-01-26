"""
Module management REST endpoints
Uses persistent storage (SQLite) and supports module execution.
"""

from fastapi import APIRouter, HTTPException
from typing import Optional
import uuid

from app.models.module import (
    Module,
    ModuleCreate,
    ModuleUpdate,
    ModuleStatus,
    ModuleType,
    Position,
    ExecuteModuleRequest,
)
from app.services import storage
from app.services.ollama_client import ollama_client
from app.services.module_executor import run_module as execute_module_logic
from app.services.vector_store import VectorStore

# Get vector store instance (will be set from main.py)
_vector_store: Optional[VectorStore] = None

def set_vector_store(store: VectorStore):
    """Set the vector store instance"""
    global _vector_store
    _vector_store = store


router = APIRouter()


def _storage_to_module(d: dict) -> Module:
    pos = d.get("position") or {}
    try:
        mtype = ModuleType(d["type"])
    except ValueError:
        mtype = ModuleType.DATA_INPUT
    try:
        st = ModuleStatus(d.get("status", "idle"))
    except ValueError:
        st = ModuleStatus.IDLE
    return Module(
        id=d["id"],
        type=mtype,
        content=d.get("content", ""),
        position=Position(x=float(pos.get("x", 0)), y=float(pos.get("y", 0))),
        inputs=[],
        outputs={},
        status=st,
        metadata=d.get("metadata") or {},
    )


@router.get("/")
async def list_modules() -> list[Module]:
    """List all modules"""
    rows = storage.get_modules()
    return [_storage_to_module(r) for r in rows]


@router.get("/{module_id}")
async def get_module(module_id: str) -> Module:
    """Get a specific module by ID"""
    d = storage.get_module(module_id)
    if not d:
        raise HTTPException(status_code=404, detail="Module not found")
    return _storage_to_module(d)


@router.post("/")
async def create_module(module_data: ModuleCreate) -> Module:
    """Create a new module (or update if it already exists)"""
    try:
        # Use provided ID or generate UUID
        module_id = module_data.id if module_data.id else str(uuid.uuid4())
        pos = module_data.position.model_dump() if module_data.position is not None else {"x": 0, "y": 0}
        
        # Get type as string value
        type_str = module_data.type.value if hasattr(module_data.type, 'value') else str(module_data.type)
        
        storage.create_module(
            module_id,
            type_str,
            module_data.content or "",
            pos,
        )
        d = storage.get_module(module_id)
        if not d:
            raise HTTPException(status_code=500, detail="Failed to retrieve created module")
        return _storage_to_module(d)
    except HTTPException:
        raise
    except Exception as e:
        import traceback
        print(f"[LOOM] Error creating module: {e}")
        print(traceback.format_exc())
        raise HTTPException(status_code=500, detail=f"Failed to create module: {str(e)}")


@router.patch("/{module_id}")
async def update_module(module_id: str, update_data: ModuleUpdate) -> Module:
    """Update a module"""
    if not storage.get_module(module_id):
        raise HTTPException(status_code=404, detail="Module not found")
    updates = update_data.model_dump(exclude_unset=True)
    storage.update_module(module_id, updates)
    d = storage.get_module(module_id)
    return _storage_to_module(d)


@router.delete("/{module_id}")
async def delete_module(module_id: str) -> dict:
    """Delete a module"""
    if not storage.delete_module(module_id):
        raise HTTPException(status_code=404, detail="Module not found")
    return {"status": "deleted", "module_id": module_id}


@router.post("/{module_id}/execute")
async def execute_module(module_id: str, body: Optional[ExecuteModuleRequest] = None) -> dict:
    """Run a module and return its output. Request body: { inputs?: {}, model?: string }."""
    d = storage.get_module(module_id)
    if not d:
        raise HTTPException(status_code=404, detail="Module not found")
    req = body or ExecuteModuleRequest()
    inputs = req.inputs
    model = req.model
    mtype = d.get("type", "")
    content = d.get("content", "")
    storage.update_module(module_id, {"status": "running"})
    try:
        result = await execute_module_logic(
            mtype, content, inputs,
            ollama=ollama_client, model=model,
            vector_store=_vector_store,
        )
        storage.update_module(module_id, {"status": "success"})
        return {"status": "success", "module_id": module_id, "output": result}
    except Exception as e:
        storage.update_module(module_id, {"status": "error"})
        raise HTTPException(status_code=500, detail=str(e))
