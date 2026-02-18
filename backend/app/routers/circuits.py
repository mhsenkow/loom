"""
Circuits API for persistent storage of saved circuits.
Skill-sourced circuits are merged in so they appear alongside saved ones.
"""

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import Optional, Any

from app.services import storage
from app.services.file_loader import file_loader
from app.services.skill_loader import get_skills_dir, get_circuits_from_skills

router = APIRouter()


class CircuitSave(BaseModel):
    name: str
    description: Optional[str] = None
    cells: list[Any]
    modelSlots: dict[str, str] = {"A": "", "B": "", "C": ""}


def _normalize_circuit(c: dict) -> dict:
    """Ensure circuit has savedAt and modelSlots for frontend."""
    out = dict(c)
    if "savedAt" not in out:
        import time
        out["savedAt"] = time.time()
    if "modelSlots" not in out:
        out["modelSlots"] = {"A": "", "B": "", "C": ""}
    return out


@router.get("/")
async def list_circuits() -> dict[str, Any]:
    """List all circuits: from skills first, then saved (saved overwrite same name)."""
    skills_dir = get_skills_dir(file_loader.get_data_folder())
    from_skills = get_circuits_from_skills(skills_dir)
    from_storage = storage.get_circuits()
    merged = {}
    for name, c in from_skills.items():
        merged[name] = _normalize_circuit(c)
    for name, c in from_storage.items():
        merged[name] = _normalize_circuit(c)
    return merged


@router.get("/{name}")
async def get_circuit(name: str) -> dict[str, Any]:
    """Get a single circuit by name (from storage or skills)."""
    c = storage.get_circuit(name)
    if c:
        return _normalize_circuit(c)
    skills_dir = get_skills_dir(file_loader.get_data_folder())
    from_skills = get_circuits_from_skills(skills_dir)
    if name in from_skills:
        return _normalize_circuit(from_skills[name])
    raise HTTPException(status_code=404, detail="Circuit not found")


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
    try:
        from app.services.scheduler_service import scheduler_service
        scheduler_service.sync_circuit_jobs(name, [])
    except Exception:
        pass
    if not storage.delete_circuit(name):
        raise HTTPException(status_code=404, detail="Circuit not found")
    return {"status": "deleted", "name": name}
