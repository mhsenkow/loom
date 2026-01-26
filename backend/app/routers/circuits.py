"""
Circuits API for persistent storage of saved circuits.
"""

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import Optional, Any

from app.services import storage

router = APIRouter()


class CircuitSave(BaseModel):
    name: str
    description: Optional[str] = None
    cells: list[Any]
    modelSlots: dict[str, str] = {"A": "", "B": "", "C": ""}


@router.get("/")
async def list_circuits() -> dict[str, Any]:
    """List all saved circuits. Returns { name: circuit }."""
    return storage.get_circuits()


@router.get("/{name}")
async def get_circuit(name: str) -> dict[str, Any]:
    """Get a single circuit by name."""
    c = storage.get_circuit(name)
    if not c:
        raise HTTPException(status_code=404, detail="Circuit not found")
    return c


@router.post("/")
async def save_circuit(body: CircuitSave) -> dict[str, Any]:
    """Create or update a circuit."""
    import time
    saved_at = time.time()
    storage.save_circuit(
        body.name,
        body.description,
        body.cells,
        body.modelSlots or {"A": "", "B": "", "C": ""},
        saved_at,
    )
    return storage.get_circuit(body.name) or {}


@router.delete("/{name}")
async def delete_circuit(name: str) -> dict:
    """Delete a circuit by name."""
    if not storage.delete_circuit(name):
        raise HTTPException(status_code=404, detail="Circuit not found")
    return {"status": "deleted", "name": name}
