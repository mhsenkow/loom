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
    
    # Sync scheduler jobs for cron triggers
    try:
        from app.services.scheduler_service import scheduler_service
        cron_cells = [c for c in body.cells if isinstance(c, dict) and c.get("type") == "cron_trigger"]
        if cron_cells:
            scheduler_service.sync_circuit_jobs(body.name, cron_cells)
        else:
            # Also need to clear jobs if no cron cells exist anymore!
            # sync_circuit_jobs handles this by receiving empty list -> removing all jobs for circuit prefix
            scheduler_service.sync_circuit_jobs(body.name, [])
    except Exception as e:
        # Don't fail the save if scheduler sync fails, but log it
        print(f"Failed to sync scheduler jobs: {e}")

    return storage.get_circuit(body.name) or {}


@router.delete("/{name}")
async def delete_circuit(name: str) -> dict:
    """Delete a circuit by name."""
    if not storage.delete_circuit(name):
        raise HTTPException(status_code=404, detail="Circuit not found")
    return {"status": "deleted", "name": name}
