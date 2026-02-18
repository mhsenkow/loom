"""
Persistent storage for modules and circuits using SQLite.
"""

import json
import sqlite3
from pathlib import Path
from typing import Any, Optional

SCHEMA_VERSION = 2

# DB path: project root / data / loom.db
def _db_path() -> Path:
    base = Path(__file__).resolve().parent.parent.parent
    data_dir = base / "data"
    data_dir.mkdir(parents=True, exist_ok=True)
    return data_dir / "loom.db"


def _get_conn() -> sqlite3.Connection:
    path = str(_db_path())
    conn = sqlite3.connect(path)
    conn.row_factory = sqlite3.Row
    return conn


def _ensure_migrations_table(conn: sqlite3.Connection) -> None:
    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS schema_migrations (
            version INTEGER PRIMARY KEY,
            applied_at REAL NOT NULL
        );
        """
    )


def _applied_versions(conn: sqlite3.Connection) -> set[int]:
    rows = conn.execute("SELECT version FROM schema_migrations").fetchall()
    return {int(r["version"]) for r in rows}


def _apply_migration_1(conn: sqlite3.Connection) -> None:
    conn.executescript(
        """
        CREATE TABLE IF NOT EXISTS modules (
            id TEXT PRIMARY KEY,
            type TEXT NOT NULL,
            content TEXT DEFAULT '',
            position_x REAL DEFAULT 0,
            position_y REAL DEFAULT 0,
            status TEXT DEFAULT 'idle',
            metadata TEXT DEFAULT '{}',
            created_at REAL,
            updated_at REAL
        );
        CREATE TABLE IF NOT EXISTS circuits (
            name TEXT PRIMARY KEY,
            description TEXT,
            cells TEXT NOT NULL,
            model_slots TEXT NOT NULL,
            saved_at REAL NOT NULL
        );
        CREATE TABLE IF NOT EXISTS sessions (
            name TEXT PRIMARY KEY,
            entries TEXT NOT NULL,
            media_files TEXT DEFAULT '[]',
            entry_count INTEGER DEFAULT 0,
            saved_at REAL NOT NULL
        );
        """
    )


def _apply_migration_2(conn: sqlite3.Connection) -> None:
    conn.executescript(
        """
        CREATE TABLE IF NOT EXISTS scheduler_runs (
            run_id TEXT PRIMARY KEY,
            circuit_name TEXT NOT NULL,
            job_id TEXT,
            trigger TEXT NOT NULL DEFAULT 'scheduled',
            status TEXT NOT NULL,
            started_at REAL NOT NULL,
            finished_at REAL,
            duration_ms INTEGER,
            error TEXT
        );
        CREATE INDEX IF NOT EXISTS idx_scheduler_runs_started_at
            ON scheduler_runs(started_at DESC);
        CREATE INDEX IF NOT EXISTS idx_scheduler_runs_circuit_name
            ON scheduler_runs(circuit_name);
        CREATE INDEX IF NOT EXISTS idx_scheduler_runs_job_id
            ON scheduler_runs(job_id);
        """
    )


MIGRATIONS: list[tuple[int, Any]] = [
    (1, _apply_migration_1),
    (2, _apply_migration_2),
]


def init_db() -> None:
    """Initialize SQLite schema and apply pending migrations."""
    conn = _get_conn()
    try:
        _ensure_migrations_table(conn)
        applied = _applied_versions(conn)
        import time
        for version, migration_fn in MIGRATIONS:
            if version in applied:
                continue
            migration_fn(conn)
            conn.execute(
                "INSERT INTO schema_migrations (version, applied_at) VALUES (?, ?)",
                (version, time.time()),
            )
        conn.commit()
    finally:
        conn.close()


# --- Modules ---

def get_modules() -> list[dict[str, Any]]:
    init_db()
    conn = _get_conn()
    try:
        rows = conn.execute(
            "SELECT id, type, content, position_x, position_y, status, metadata FROM modules"
        ).fetchall()
        return [_row_to_module(r) for r in rows]
    finally:
        conn.close()


def get_module(module_id: str) -> Optional[dict[str, Any]]:
    init_db()
    conn = _get_conn()
    try:
        row = conn.execute(
            "SELECT id, type, content, position_x, position_y, status, metadata FROM modules WHERE id = ?",
            (module_id,),
        ).fetchone()
        return _row_to_module(row) if row else None
    finally:
        conn.close()


def _row_to_module(row: sqlite3.Row) -> dict[str, Any]:
    import time
    meta = row["metadata"]
    if isinstance(meta, str):
        try:
            meta = json.loads(meta) if meta else {}
        except json.JSONDecodeError:
            meta = {}
    return {
        "id": row["id"],
        "type": row["type"],
        "content": row["content"] or "",
        "position": {"x": float(row["position_x"] or 0), "y": float(row["position_y"] or 0)},
        "status": row["status"] or "idle",
        "metadata": meta,
    }


def create_module(module_id: str, type: str, content: str = "", position: Optional[dict] = None) -> dict[str, Any]:
    import time
    init_db()
    pos = position or {"x": 0, "y": 0}
    now = time.time()
    conn = _get_conn()
    try:
        # Check if module already exists
        existing = get_module(module_id)
        if existing:
            # Module exists - update it instead of failing
            updates = {
                "content": content,
                "position": pos,
            }
            update_module(module_id, updates)
            return get_module(module_id) or {}
        
        # Module doesn't exist - create it
        conn.execute(
            """INSERT INTO modules (id, type, content, position_x, position_y, status, metadata, created_at, updated_at)
               VALUES (?, ?, ?, ?, ?, 'idle', '{}', ?, ?)""",
            (module_id, type, content, pos.get("x", 0), pos.get("y", 0), now, now),
        )
        conn.commit()
        return get_module(module_id) or {}
    finally:
        conn.close()


def update_module(module_id: str, updates: dict[str, Any]) -> Optional[dict[str, Any]]:
    import time
    init_db()
    conn = _get_conn()
    try:
        allowed = {"content", "position", "status", "metadata"}
        sets = []
        args = []
        for k, v in updates.items():
            if k not in allowed:
                continue
            if k == "position":
                sets.append("position_x = ?")
                args.append(v.get("x", 0) if isinstance(v, dict) else 0)
                sets.append("position_y = ?")
                args.append(v.get("y", 0) if isinstance(v, dict) else 0)
            elif k == "metadata":
                sets.append("metadata = ?")
                args.append(json.dumps(v) if isinstance(v, dict) else "{}")
            else:
                sets.append(f"{k} = ?")
                args.append(v)
        if not sets:
            return get_module(module_id)
        sets.append("updated_at = ?")
        args.append(time.time())
        args.append(module_id)
        conn.execute(
            f"UPDATE modules SET {', '.join(sets)} WHERE id = ?",
            args,
        )
        conn.commit()
        return get_module(module_id)
    finally:
        conn.close()


def delete_module(module_id: str) -> bool:
    init_db()
    conn = _get_conn()
    try:
        cur = conn.execute("DELETE FROM modules WHERE id = ?", (module_id,))
        conn.commit()
        return cur.rowcount > 0
    finally:
        conn.close()


# --- Circuits ---

def get_circuits() -> dict[str, dict[str, Any]]:
    """Return { name: circuit }."""
    init_db()
    conn = _get_conn()
    try:
        rows = conn.execute(
            "SELECT name, description, cells, model_slots, saved_at FROM circuits"
        ).fetchall()
        out = {}
        for r in rows:
            try:
                cells = json.loads(r["cells"]) if r["cells"] else []
                slots = json.loads(r["model_slots"]) if r["model_slots"] else {"A": "", "B": "", "C": ""}
            except json.JSONDecodeError:
                cells = []
                slots = {"A": "", "B": "", "C": ""}
            out[r["name"]] = {
                "name": r["name"],
                "description": r["description"] or None,
                "cells": cells,
                "modelSlots": slots,
                "savedAt": float(r["saved_at"]),
            }
        return out
    finally:
        conn.close()


def get_circuit(name: str) -> Optional[dict[str, Any]]:
    init_db()
    conn = _get_conn()
    try:
        row = conn.execute(
            "SELECT name, description, cells, model_slots, saved_at FROM circuits WHERE name = ?",
            (name,),
        ).fetchone()
        if not row:
            return None
        try:
            cells = json.loads(row["cells"]) if row["cells"] else []
            slots = json.loads(row["model_slots"]) if row["model_slots"] else {"A": "", "B": "", "C": ""}
        except json.JSONDecodeError:
            cells = []
            slots = {"A": "", "B": "", "C": ""}
        return {
            "name": row["name"],
            "description": row["description"] or None,
            "cells": cells,
            "modelSlots": slots,
            "savedAt": float(row["saved_at"]),
        }
    finally:
        conn.close()


def save_circuit(name: str, description: Optional[str], cells: list, model_slots: dict, saved_at: float) -> dict[str, Any]:
    init_db()
    conn = _get_conn()
    try:
        conn.execute(
            """INSERT INTO circuits (name, description, cells, model_slots, saved_at)
               VALUES (?, ?, ?, ?, ?)
               ON CONFLICT(name) DO UPDATE SET
                 description = excluded.description,
                 cells = excluded.cells,
                 model_slots = excluded.model_slots,
                 saved_at = excluded.saved_at""",
            (name, description or "", json.dumps(cells), json.dumps(model_slots), saved_at),
        )
        conn.commit()
        return get_circuit(name) or {}
    finally:
        conn.close()


def delete_circuit(name: str) -> bool:
    init_db()
    conn = _get_conn()
    try:
        cur = conn.execute("DELETE FROM circuits WHERE name = ?", (name,))
        conn.commit()
        return cur.rowcount > 0
    finally:
        conn.close()


# --- Sessions ---

def get_sessions() -> dict[str, dict[str, Any]]:
    """Return session index: { name: { savedAt, entryCount, mediaFiles } }."""
    init_db()
    conn = _get_conn()
    try:
        rows = conn.execute(
            "SELECT name, entry_count, media_files, saved_at FROM sessions"
        ).fetchall()
        out = {}
        for r in rows:
            try:
                media = json.loads(r["media_files"]) if r["media_files"] else []
            except json.JSONDecodeError:
                media = []
            out[r["name"]] = {
                "name": r["name"],
                "entryCount": r["entry_count"],
                "mediaFiles": media,
                "savedAt": float(r["saved_at"]),
            }
        return out
    finally:
        conn.close()


def get_session(name: str) -> Optional[dict[str, Any]]:
    """Get a session with its full entries."""
    init_db()
    conn = _get_conn()
    try:
        row = conn.execute(
            "SELECT name, entries, media_files, entry_count, saved_at FROM sessions WHERE name = ?",
            (name,),
        ).fetchone()
        if not row:
            return None
        try:
            entries = json.loads(row["entries"]) if row["entries"] else []
            media = json.loads(row["media_files"]) if row["media_files"] else []
        except json.JSONDecodeError:
            entries = []
            media = []
        return {
            "name": row["name"],
            "entries": entries,
            "mediaFiles": media,
            "entryCount": row["entry_count"],
            "savedAt": float(row["saved_at"]),
        }
    finally:
        conn.close()


def save_session(name: str, entries: list, media_files: list, saved_at: float) -> dict[str, Any]:
    """Save or update a session."""
    init_db()
    conn = _get_conn()
    try:
        entry_count = len(entries)
        conn.execute(
            """INSERT INTO sessions (name, entries, media_files, entry_count, saved_at)
               VALUES (?, ?, ?, ?, ?)
               ON CONFLICT(name) DO UPDATE SET
                 entries = excluded.entries,
                 media_files = excluded.media_files,
                 entry_count = excluded.entry_count,
                 saved_at = excluded.saved_at""",
            (name, json.dumps(entries), json.dumps(media_files), entry_count, saved_at),
        )
        conn.commit()
        return get_session(name) or {}
    finally:
        conn.close()


def delete_session(name: str) -> bool:
    """Delete a session."""
    init_db()
    conn = _get_conn()
    try:
        cur = conn.execute("DELETE FROM sessions WHERE name = ?", (name,))
        conn.commit()
        return cur.rowcount > 0
    finally:
        conn.close()


# --- Scheduler Runs ---

def upsert_scheduler_run(
    run_id: str,
    circuit_name: str,
    status: str,
    started_at: float,
    *,
    job_id: Optional[str] = None,
    trigger: str = "scheduled",
    finished_at: Optional[float] = None,
    error: Optional[str] = None,
) -> dict[str, Any]:
    """Create or update a scheduler run record."""
    init_db()
    conn = _get_conn()
    try:
        duration_ms: Optional[int] = None
        if finished_at is not None:
            duration_ms = max(0, int((finished_at - started_at) * 1000))
        conn.execute(
            """
            INSERT INTO scheduler_runs
                (run_id, circuit_name, job_id, trigger, status, started_at, finished_at, duration_ms, error)
            VALUES
                (?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(run_id) DO UPDATE SET
                circuit_name = excluded.circuit_name,
                job_id = excluded.job_id,
                trigger = excluded.trigger,
                status = excluded.status,
                started_at = excluded.started_at,
                finished_at = excluded.finished_at,
                duration_ms = excluded.duration_ms,
                error = excluded.error
            """,
            (
                run_id,
                circuit_name,
                job_id,
                trigger,
                status,
                started_at,
                finished_at,
                duration_ms,
                error,
            ),
        )
        conn.commit()
        row = conn.execute(
            """
            SELECT run_id, circuit_name, job_id, trigger, status, started_at, finished_at, duration_ms, error
            FROM scheduler_runs
            WHERE run_id = ?
            """,
            (run_id,),
        ).fetchone()
        return _row_to_scheduler_run(row) if row else {}
    finally:
        conn.close()


def list_scheduler_runs(
    *,
    circuit_name: Optional[str] = None,
    job_id: Optional[str] = None,
    limit: int = 200,
) -> list[dict[str, Any]]:
    """Return recent scheduler runs (newest first)."""
    init_db()
    conn = _get_conn()
    try:
        safe_limit = max(1, min(int(limit), 1000))
        where: list[str] = []
        args: list[Any] = []
        if circuit_name:
            where.append("circuit_name = ?")
            args.append(circuit_name)
        if job_id:
            where.append("job_id = ?")
            args.append(job_id)
        where_sql = f"WHERE {' AND '.join(where)}" if where else ""
        rows = conn.execute(
            f"""
            SELECT run_id, circuit_name, job_id, trigger, status, started_at, finished_at, duration_ms, error
            FROM scheduler_runs
            {where_sql}
            ORDER BY started_at DESC
            LIMIT ?
            """,
            (*args, safe_limit),
        ).fetchall()
        return [_row_to_scheduler_run(r) for r in rows]
    finally:
        conn.close()


def _row_to_scheduler_run(row: sqlite3.Row) -> dict[str, Any]:
    return {
        "runId": row["run_id"],
        "circuitName": row["circuit_name"],
        "jobId": row["job_id"] or None,
        "trigger": row["trigger"] or "scheduled",
        "status": row["status"],
        "startedAt": float(row["started_at"]),
        "finishedAt": float(row["finished_at"]) if row["finished_at"] is not None else None,
        "durationMs": int(row["duration_ms"]) if row["duration_ms"] is not None else None,
        "error": row["error"] or None,
    }
