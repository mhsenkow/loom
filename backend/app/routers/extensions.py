"""
Extensions API: skills sources, install from URL/path, list installed.
"""

import json
import logging
from pathlib import Path
from typing import Any, Optional

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from app.services.file_loader import file_loader
from app.services.skill_loader import (
    get_skills_dir,
    scan_installed_skills,
    get_circuits_from_skills,
    install_from_path,
    install_from_url,
)

logger = logging.getLogger("loom.router.extensions")

router = APIRouter()

SOURCES_FILENAME = "extensions_sources.json"


def _sources_path() -> Path:
    data = file_loader.get_data_folder()
    if data:
        return Path(data).expanduser().resolve() / SOURCES_FILENAME
    base = Path(__file__).resolve().parent.parent.parent
    return base / "data" / SOURCES_FILENAME


def _load_sources() -> list[dict]:
    p = _sources_path()
    if not p.exists():
        return []
    try:
        data = json.loads(p.read_text(encoding="utf-8"))
        return data if isinstance(data, list) else []
    except Exception:
        return []


def _save_sources(sources: list[dict]) -> None:
    p = _sources_path()
    p.parent.mkdir(parents=True, exist_ok=True)
    p.write_text(json.dumps(sources, indent=2), encoding="utf-8")


class AddSourceBody(BaseModel):
    url: Optional[str] = None
    label: Optional[str] = None


class InstallBody(BaseModel):
    url: Optional[str] = None
    path: Optional[str] = None


@router.get("/sources")
async def list_sources() -> list[dict]:
    """List configured extension sources (registries or labels)."""
    return _load_sources()


@router.post("/sources")
async def add_source(body: AddSourceBody) -> dict:
    """Add a source (URL or label for display)."""
    sources = _load_sources()
    entry = {}
    if body.url:
        entry["url"] = body.url.strip()
        entry["label"] = (body.label or body.url).strip() or entry["url"]
    elif body.label:
        entry["label"] = body.label.strip()
    else:
        raise HTTPException(status_code=400, detail="Provide url or label")
    entry["id"] = f"src_{len(sources)}_{hash(entry.get('url', entry.get('label', ''))) % 10000}"
    sources.append(entry)
    _save_sources(sources)
    return {"ok": True, "sources": sources}


@router.delete("/sources/{source_id}")
async def remove_source(source_id: str) -> dict:
    """Remove a source by id."""
    sources = [s for s in _load_sources() if s.get("id") != source_id]
    _save_sources(sources)
    return {"ok": True, "sources": sources}


@router.get("/installed")
async def list_installed() -> list[dict]:
    """List installed skills (from data/skills)."""
    skills_dir = get_skills_dir(file_loader.get_data_folder())
    return scan_installed_skills(skills_dir)


def _resolve_sample_skill_path(path: str) -> str:
    """If path is the built-in sample, resolve to repo root / sample-skill."""
    p = (path or "").strip()
    if p in ("sample-skill", "./sample-skill", "sample_skill"):
        repo_root = Path(__file__).resolve().parent.parent.parent.parent
        sample = repo_root / "sample-skill"
        if sample.is_dir() and (sample / "SKILL.md").exists():
            return str(sample)
    return path


@router.post("/install")
async def install_extension(body: InstallBody) -> dict:
    """Install a skill from URL (zip or GitHub repo) or local path."""
    skills_dir = get_skills_dir(file_loader.get_data_folder())
    if body.url:
        result = await install_from_url(body.url, skills_dir)
    elif body.path:
        resolved = _resolve_sample_skill_path(body.path)
        result = install_from_path(resolved, skills_dir)
    else:
        raise HTTPException(status_code=400, detail="Provide url or path")
    if not result.get("ok"):
        raise HTTPException(status_code=400, detail=result.get("error", "Install failed"))
    return result


@router.delete("/installed/{skill_id}")
async def uninstall_extension(skill_id: str) -> dict:
    """Remove an installed skill by id (folder name)."""
    import shutil
    skills_dir = get_skills_dir(file_loader.get_data_folder())
    target = skills_dir / skill_id
    if not target.exists() or not target.is_dir():
        raise HTTPException(status_code=404, detail="Skill not found")
    try:
        shutil.rmtree(target)
    except Exception as e:
        logger.exception("uninstall failed")
        raise HTTPException(status_code=500, detail=str(e))
    return {"ok": True, "id": skill_id}


@router.get("/circuits")
async def list_skill_circuits() -> dict[str, Any]:
    """List circuits that come from installed skills (for merging with main circuit list)."""
    skills_dir = get_skills_dir(file_loader.get_data_folder())
    return get_circuits_from_skills(skills_dir)
