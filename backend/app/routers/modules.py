"""
Module management REST endpoints
"""

from fastapi import APIRouter, HTTPException
from typing import Optional
import uuid

from app.models.module import (
    Module,
    ModuleCreate,
    ModuleUpdate,
    ModuleStatus,
    Position,
)

router = APIRouter()

# In-memory storage for development
_modules: dict[str, Module] = {}


@router.get("/")
async def list_modules() -> list[Module]:
    """List all modules"""
    return list(_modules.values())


@router.get("/{module_id}")
async def get_module(module_id: str) -> Module:
    """Get a specific module by ID"""
    if module_id not in _modules:
        raise HTTPException(status_code=404, detail="Module not found")
    return _modules[module_id]


@router.post("/")
async def create_module(module_data: ModuleCreate) -> Module:
    """Create a new module"""
    module_id = str(uuid.uuid4())
    
    module = Module(
        id=module_id,
        type=module_data.type,
        content=module_data.content,
        position=module_data.position or Position(x=0, y=0),
    )
    
    _modules[module_id] = module
    return module


@router.patch("/{module_id}")
async def update_module(module_id: str, update_data: ModuleUpdate) -> Module:
    """Update a module"""
    if module_id not in _modules:
        raise HTTPException(status_code=404, detail="Module not found")
    
    module = _modules[module_id]
    update_dict = update_data.model_dump(exclude_unset=True)
    
    for field, value in update_dict.items():
        setattr(module, field, value)
    
    _modules[module_id] = module
    return module


@router.delete("/{module_id}")
async def delete_module(module_id: str) -> dict:
    """Delete a module"""
    if module_id not in _modules:
        raise HTTPException(status_code=404, detail="Module not found")
    
    del _modules[module_id]
    return {"status": "deleted", "module_id": module_id}


@router.post("/{module_id}/execute")
async def execute_module(module_id: str) -> dict:
    """Trigger module execution"""
    if module_id not in _modules:
        raise HTTPException(status_code=404, detail="Module not found")
    
    module = _modules[module_id]
    module.status = ModuleStatus.RUNNING
    _modules[module_id] = module
    
    # TODO: Actual execution logic via Socket.IO
    
    return {
        "status": "executing",
        "module_id": module_id,
        "type": module.type,
    }
