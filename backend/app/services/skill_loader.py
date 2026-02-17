"""
Load skills from the extensions directory (data/skills).
Each skill is a folder with SKILL.md (YAML frontmatter + optional circuits).
Compatible with Agent Skills spec (name, description) and LOOM extension (circuits).
"""

import json
import logging
import re
import shutil
import uuid
import zipfile
from pathlib import Path
from typing import Any, Optional

import httpx

logger = logging.getLogger("loom.skill_loader")

# Default skills dir when no data folder is set (backend/data/skills)
def _default_skills_dir() -> Path:
    base = Path(__file__).resolve().parent.parent.parent
    return base / "data" / "skills"


def get_skills_dir(data_folder: Optional[str]) -> Path:
    """Resolve skills directory: data_folder/skills or default."""
    if data_folder:
        p = Path(data_folder).expanduser().resolve() / "skills"
        p.mkdir(parents=True, exist_ok=True)
        return p
    d = _default_skills_dir()
    d.mkdir(parents=True, exist_ok=True)
    return d


def _parse_frontmatter(content: str) -> tuple[Optional[dict], str]:
    """Extract YAML frontmatter from SKILL.md. Returns (frontmatter_dict, rest)."""
    match = re.match(r"^---\s*\n(.*?)\n---\s*\n?(.*)$", content, re.DOTALL)
    if not match:
        return None, content
    yaml_block, rest = match.group(1), match.group(2)
    try:
        import yaml
        data = yaml.safe_load(yaml_block)
        return data if isinstance(data, dict) else None, rest
    except Exception as e:
        logger.warning("skill_loader: failed to parse frontmatter: %s", e)
        return None, rest


def _ensure_cell_ids(cells: list[dict]) -> list[dict]:
    """Ensure each cell has id and status for LOOM."""
    out = []
    for i, c in enumerate(cells):
        if not isinstance(c, dict):
            continue
        cell = dict(c)
        if not cell.get("id"):
            cell["id"] = f"skill-cell-{uuid.uuid4().hex[:8]}"
        if "status" not in cell:
            cell["status"] = "idle"
        if "output" not in cell:
            cell["output"] = ""
        out.append(cell)
    return out


def load_skill_manifest(skill_dir: Path) -> Optional[dict]:
    """
    Load and parse SKILL.md from a skill directory.
    Returns manifest dict (frontmatter + optional "body" = markdown after frontmatter) or None.
    For instruction-only Agent Skills, "body" is used to synthesize a single runnable circuit.
    """
    skill_md = skill_dir / "SKILL.md"
    skill_json = skill_dir / "skill.json"
    content = None
    if skill_md.exists():
        content = skill_md.read_text(encoding="utf-8", errors="replace")
    elif skill_json.exists():
        try:
            return json.loads(skill_json.read_text(encoding="utf-8"))
        except json.JSONDecodeError as e:
            logger.warning("skill_loader: invalid skill.json in %s: %s", skill_dir, e)
            return None
    else:
        return None
    if content is None:
        return None
    front, body = _parse_frontmatter(content)
    if not front:
        return None
    front = dict(front)
    if body and body.strip():
        front["body"] = body.strip()
    return front


def _slug(name: str) -> str:
    """Turn skill name into a safe circuit id (lowercase, hyphens)."""
    s = re.sub(r"[^\w\s\-]", "", str(name).strip())
    s = re.sub(r"[-\s]+", "-", s).strip("-").lower()
    return s or "skill"


def _suggest_helper_cell_for_step(step_text: str) -> Optional[dict]:
    """
    If the step text strongly suggests a non-AI cell type, return one cell to prepend
    (e.g. vector_search, data_loader, image_gen, script_execution). Otherwise None.
    """
    t = step_text.lower().strip()
    # Vector search: "search the knowledge base", "look up", "semantic search"
    if re.search(r"\b(?:search|look up|lookup|find in|query)\s+(?:the\s+)?(?:knowledge\s+base|index|vector|documents?)", t) or "semantic search" in t:
        return {"type": "vector_search", "label": "Search", "content": "", "inputMode": "previous"}
    # Data loader: "load the file", "read from file", "from the file at"
    if re.search(r"\b(?:load|read|fetch)\s+(?:the\s+)?(?:file|document|path)", t) or re.search(r"from\s+the\s+file\s+(?:at|path)", t):
        return {"type": "data_loader", "label": "Load file", "content": "", "inputMode": "previous", "readMode": "auto"}
    # Image gen: "generate (an) image", "create (an) image", "draw"
    if re.search(r"\b(?:generate|create|draw|make)\s+(?:an?\s+)?image", t) or "image generation" in t:
        return {"type": "image_gen", "label": "Image", "content": "", "inputMode": "previous"}
    # Script/code: "run (the) script", "execute (the) code", "run the following python"
    if re.search(r"\b(?:run|execute)\s+(?:the\s+)?(?:script|code|python)", t) or re.search(r"run\s+the\s+following\s+(?:script|code)", t):
        return {"type": "script_execution", "label": "Script", "content": "# Use {{input}} as script or paste code below", "inputMode": "previous"}
    return None


def _split_skill_body_into_steps(body: str) -> list[str]:
    """
    Heuristic: detect multi-step structure in skill body. Returns 1 or more instruction blocks.
    If we find clear steps (## Step N, ## N., or numbered list), return multiple; else one.
    """
    if not body or not body.strip():
        return []
    body = body.strip()
    # Split before headings like "## Step 1", "## Step 2", "## 1.", "## 2. Introduction"
    by_heading = re.split(r"\n(?=##\s+(?:Step\s+)?\d+[.:])", body)
    steps = [s.strip() for s in by_heading if s.strip()]
    if len(steps) >= 2:
        # First segment might be a short intro; if it's long, treat as single-step
        first = steps[0]
        if len(first) > 400 and not first.lstrip().startswith("##"):
            return [body]
        return steps
    # Split on top-level numbered list (line start with "1." or "2." etc.)
    by_numbered = re.split(r"(?m)^(\d+[.)]\s+)", body)
    if len(by_numbered) >= 3:  # intro, "1. ", content1, "2. ", content2, ...
        out = []
        for i in range(1, len(by_numbered), 2):
            if i + 1 < len(by_numbered):
                block = (by_numbered[i] + by_numbered[i + 1]).strip()
                if len(block) > 80:  # substantial step
                    out.append(block)
        if len(out) >= 2:
            return out
    return [body]


def circuits_from_manifest(manifest: dict, skill_id: str) -> dict[str, dict[str, Any]]:
    """
    Build LOOM circuit dicts from manifest.
    - If manifest has a non-empty "circuits" list, use those (LOOM extension).
    - If no circuits but has "body" (markdown instructions), synthesize one circuit so
      instruction-only Agent Skills (e.g. anthropics/skills) become 1:1 runnable in LOOM.
    Returns { circuit_name: { name, description, cells, modelSlots, savedAt, source } }.
    """
    import time
    circuits_list = manifest.get("circuits") or []
    if isinstance(circuits_list, list) and len(circuits_list) > 0:
        out = {}
        for item in circuits_list:
            if not isinstance(item, dict):
                continue
            cid = item.get("id") or item.get("name") or ("circuit_" + uuid.uuid4().hex[:6])
            name = str(cid)
            cells = item.get("cells")
            if not isinstance(cells, list):
                cells = []
            cells = _ensure_cell_ids(cells)
            desc = item.get("description") or ""
            model_slots = item.get("modelSlots") or item.get("model_slots") or {"A": "", "B": "", "C": ""}
            out[name] = {
                "name": name,
                "description": desc,
                "cells": cells,
                "modelSlots": model_slots,
                "savedAt": time.time(),
                "source": "skill",
                "skillId": skill_id,
            }
        return out

    # Instruction-only skill (Agent Skills format): synthesize one or more circuits
    body = manifest.get("body") or ""
    name_raw = manifest.get("name") or manifest.get("id") or skill_id
    circuit_name = _slug(name_raw)
    if not circuit_name:
        circuit_name = "skill_" + skill_id
    desc = manifest.get("description") or ""
    instruction = body or desc
    if desc and body:
        instruction = f"{desc}\n\n---\n\n{body}"
    elif not instruction:
        return {}
    # Auto-detect multi-step: if body has clear steps, use multiple AI cells for better results
    steps = _split_skill_body_into_steps(body) if body else [instruction]
    if not steps:
        steps = [instruction]
    cells = [{"type": "data_input", "label": "Input", "content": "", "inputMode": "none"}]
    for i, step_text in enumerate(steps):
        # Suggest a functional cell (vector_search, data_loader, image_gen, script) when step text matches
        helper = _suggest_helper_cell_for_step(step_text)
        if helper:
            cells.append(helper)
        if len(steps) > 1:
            prompt = (
                f"You are following a skill. This is step {i + 1} of {len(steps)}.\n\n"
                "## Full skill context\n\n" + (desc + "\n\n---\n\n" if desc else "") + "## Instructions for this step only\n\n" + step_text + "\n\nUse the previous step's output (or user input for step 1) as your input."
            )
            label = f"Step {i + 1}"
        else:
            prompt = (
                "You are following a skill. Apply these instructions to the user's input from the previous step.\n\n"
                "## Skill instructions\n\n" + instruction
            )
            label = "Skill"
        cells.append({"type": "ai_processor", "label": label, "content": prompt, "modelSlot": "A", "inputMode": "previous"})
    cells.append({"type": "log_entry", "label": "OUTPUT", "content": "", "inputMode": "previous"})
    cells = _ensure_cell_ids(cells)
    return {
        circuit_name: {
            "name": circuit_name,
            "description": desc or f"Runs the {name_raw} skill.",
            "cells": cells,
            "modelSlots": {"A": "", "B": "", "C": ""},
            "savedAt": time.time(),
            "source": "skill",
            "skillId": skill_id,
        }
    }


def scan_installed_skills(skills_dir: Path) -> list[dict[str, Any]]:
    """
    Scan skills_dir for skill folders (each with SKILL.md or skill.json).
    Returns list of { id, name, version, description, path, circuitCount }.
    """
    result = []
    if not skills_dir.exists():
        return result
    for path in skills_dir.iterdir():
        if not path.is_dir() or path.name.startswith("."):
            continue
        manifest = load_skill_manifest(path)
        if not manifest:
            continue
        skill_id = path.name
        name = manifest.get("name") or manifest.get("id") or skill_id
        version = manifest.get("version") or "0.0.0"
        description = manifest.get("description") or ""
        circuits = circuits_from_manifest(manifest, skill_id)
        result.append({
            "id": skill_id,
            "name": name,
            "version": version,
            "description": description,
            "path": str(path),
            "circuitCount": len(circuits),
        })
    return result


def get_circuits_from_skills(skills_dir: Path) -> dict[str, dict[str, Any]]:
    """
    Load all circuits from installed skills. Returns { circuit_name: circuit_dict }.
    Later-encountered skill overwrites if same circuit name; we scan in sorted order.
    """
    merged = {}
    if not skills_dir.exists():
        return merged
    for path in sorted(skills_dir.iterdir()):
        if not path.is_dir() or path.name.startswith("."):
            continue
        manifest = load_skill_manifest(path)
        if not manifest:
            continue
        skill_id = path.name
        for name, circuit in circuits_from_manifest(manifest, skill_id).items():
            merged[name] = circuit
    return merged


def install_from_path(source_path: str, skills_dir: Path) -> dict[str, Any]:
    """
    Install a skill from a local folder. Copies into skills_dir / <id>.
    Returns { id, name, version, error? }.
    """
    src = Path(source_path).expanduser().resolve()
    if not src.is_dir():
        return {"ok": False, "error": "Path is not a directory"}
    manifest = load_skill_manifest(src)
    if not manifest:
        return {"ok": False, "error": "No SKILL.md or skill.json found"}
    skill_id = manifest.get("id") or manifest.get("name") or src.name
    skill_id = re.sub(r"[^\w\-]", "_", str(skill_id).strip()).strip("_") or "skill"
    dest = skills_dir / skill_id
    if dest.exists():
        shutil.rmtree(dest)
    try:
        shutil.copytree(src, dest, ignore=shutil.ignore_patterns(".git", "__pycache__", "*.pyc", ".DS_Store"))
    except Exception as e:
        logger.exception("install_from_path failed")
        return {"ok": False, "error": str(e)}
    return {
        "ok": True,
        "id": skill_id,
        "name": manifest.get("name") or skill_id,
        "version": manifest.get("version") or "0.0.0",
    }


async def install_from_url(url: str, skills_dir: Path) -> dict[str, Any]:
    """
    Install a skill from a URL (zip or GitHub repo). Returns { ok, id?, name?, error? }.
    """
    url = url.strip()
    if not url:
        return {"ok": False, "error": "URL is required"}
    # GitHub: turn repo URL into zipball
    if "github.com" in url and not url.rstrip("/").endswith(".zip"):
        url = url.rstrip("/").replace("github.com/", "api.github.com/repos/") + "/zipball/main"
    try:
        async with httpx.AsyncClient(follow_redirects=True, timeout=30.0) as client:
            r = await client.get(url)
            r.raise_for_status()
            data = r.content
    except Exception as e:
        logger.warning("install_from_url fetch failed: %s", e)
        return {"ok": False, "error": f"Download failed: {e}"}
    if not data[:4] == b"PK\x03\x04":
        return {"ok": False, "error": "URL did not return a ZIP file"}
    skills_dir.mkdir(parents=True, exist_ok=True)
    temp_zip = skills_dir / f"_tmp_{uuid.uuid4().hex}.zip"
    try:
        temp_zip.write_bytes(data)
        with zipfile.ZipFile(temp_zip, "r") as zf:
            names = zf.namelist()
            if not names:
                return {"ok": False, "error": "ZIP is empty"}
            # Top-level folder in zip (e.g. repo-main-abc123/)
            root = names[0].split("/")[0]
            has_skill_md = any("SKILL.md" in n or "skill.json" in n for n in names)
            if not has_skill_md:
                return {"ok": False, "error": "ZIP has no SKILL.md or skill.json"}
            dest = skills_dir / root
            if dest.exists():
                shutil.rmtree(dest)
            zf.extractall(skills_dir)
        # Parse to get id/name
        manifest = load_skill_manifest(dest)
        if not manifest:
            return {"ok": False, "error": "Could not read skill manifest after extract"}
        skill_id = manifest.get("id") or manifest.get("name") or root
        skill_id = re.sub(r"[^\w\-]", "_", str(skill_id).strip()).strip("_") or "skill"
        if skill_id != root and (skills_dir / skill_id).exists():
            shutil.rmtree(skills_dir / skill_id, ignore_errors=True)
        if skill_id != root:
            (skills_dir / root).rename(skills_dir / skill_id)
            dest = skills_dir / skill_id
        return {
            "ok": True,
            "id": skill_id,
            "name": manifest.get("name") or skill_id,
            "version": manifest.get("version") or "0.0.0",
        }
    except Exception as e:
        logger.exception("install_from_url extract failed")
        return {"ok": False, "error": str(e)}
    finally:
        if temp_zip.exists():
            temp_zip.unlink(missing_ok=True)
