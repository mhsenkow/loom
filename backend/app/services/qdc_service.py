"""
QDC service (Qualcomm device cloud lane).

Current implementation provides a reliable async job lane with a mock execution backend.
It is designed so live QDC API calls can be added behind the same interface later.
"""

from __future__ import annotations

import asyncio
import logging
import os
import time
import uuid
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Awaitable, Callable, Optional

logger = logging.getLogger("loom.qdc")

EventEmitter = Callable[[str, dict[str, Any]], Awaitable[None]]


def _now() -> float:
    return time.time()


def _iso_ts(ts: float) -> str:
    return time.strftime("%Y-%m-%d %H:%M:%S", time.localtime(ts))


@dataclass
class QDCArtifact:
    id: str
    path: str
    name: str
    size_bytes: int
    status: str
    created_at: float

    def to_dict(self) -> dict[str, Any]:
        return {
            "id": self.id,
            "path": self.path,
            "name": self.name,
            "size_bytes": self.size_bytes,
            "status": self.status,
            "created_at": self.created_at,
        }


@dataclass
class QDCJob:
    id: str
    prompt: str
    artifact_id: Optional[str]
    target: str
    priority: str
    status: str
    created_at: float
    updated_at: float
    mode: str
    logs: list[str] = field(default_factory=list)
    result: dict[str, Any] = field(default_factory=dict)
    error: Optional[str] = None

    def to_dict(self) -> dict[str, Any]:
        return {
            "id": self.id,
            "prompt": self.prompt,
            "artifact_id": self.artifact_id,
            "target": self.target,
            "priority": self.priority,
            "status": self.status,
            "created_at": self.created_at,
            "updated_at": self.updated_at,
            "mode": self.mode,
            "logs": list(self.logs),
            "result": dict(self.result),
            "error": self.error,
        }


class QDCService:
    """Async QDC lane with in-memory job tracking."""

    TERMINAL_STATES = {"succeeded", "failed", "canceled"}

    def __init__(self):
        self.mode = os.getenv("LOOM_QDC_MODE", "mock").strip().lower() or "mock"
        if self.mode != "mock":
            # Keep a deterministic fallback until live endpoint integration is configured.
            self.mode = "mock"
        self.mock_step_s = max(0.05, float(os.getenv("LOOM_QDC_MOCK_STEP_S", "0.35")))

        self._artifacts: dict[str, QDCArtifact] = {}
        self._jobs: dict[str, QDCJob] = {}
        self._job_tasks: dict[str, asyncio.Task[Any]] = {}
        self._event_emitter: Optional[EventEmitter] = None
        self._lock = asyncio.Lock()

    def set_event_emitter(self, emitter: Optional[EventEmitter]) -> None:
        self._event_emitter = emitter

    def _resolve_path(self, path_value: str) -> Path:
        raw = (path_value or "").strip()
        if not raw:
            raise ValueError("No artifact path provided")

        p = Path(raw).expanduser()
        if p.is_absolute():
            return p

        # Backend usually runs from ./backend. Relative paths should map to workspace root first.
        workspace_root = Path.cwd().resolve().parent
        return (workspace_root / p).resolve()

    def _estimate_path_size(self, p: Path) -> int:
        if not p.exists():
            raise FileNotFoundError(f"Path not found: {p}")
        if p.is_file():
            return int(p.stat().st_size)

        total = 0
        scanned = 0
        for child in p.rglob("*"):
            if child.is_file():
                try:
                    total += int(child.stat().st_size)
                    scanned += 1
                except Exception:
                    continue
                if scanned >= 20000:
                    break
        return total

    async def _emit_event(self, sid: Optional[str], payload: dict[str, Any]) -> None:
        if not sid or not self._event_emitter:
            return
        try:
            await self._event_emitter(sid, payload)
        except Exception:
            logger.exception("qdc_emit_event_failed sid=%s", sid)

    def _append_log(self, job: QDCJob, line: str) -> None:
        stamped = f"[{_iso_ts(_now())}] {line}"
        job.logs.append(stamped)
        job.updated_at = _now()

    async def upload_artifact(self, path_value: str) -> dict[str, Any]:
        path = self._resolve_path(path_value)
        size_bytes = self._estimate_path_size(path)
        artifact_id = f"qdc-artifact-{uuid.uuid4().hex[:10]}"
        now = _now()
        artifact = QDCArtifact(
            id=artifact_id,
            path=str(path),
            name=path.name,
            size_bytes=size_bytes,
            status="uploaded",
            created_at=now,
        )

        async with self._lock:
            self._artifacts[artifact_id] = artifact

        return artifact.to_dict()

    async def create_job(
        self,
        *,
        prompt: str,
        artifact_id: Optional[str] = None,
        artifact_path: Optional[str] = None,
        target: str = "auto",
        priority: str = "normal",
        sid: Optional[str] = None,
    ) -> dict[str, Any]:
        cleaned_prompt = (prompt or "").strip()
        if not cleaned_prompt:
            raise ValueError("Prompt is required")

        resolved_artifact_id = artifact_id
        if artifact_path:
            artifact = await self.upload_artifact(artifact_path)
            resolved_artifact_id = artifact["id"]

        if resolved_artifact_id:
            async with self._lock:
                if resolved_artifact_id not in self._artifacts:
                    raise ValueError(f"Unknown artifact_id: {resolved_artifact_id}")

        now = _now()
        job_id = f"qdc-job-{uuid.uuid4().hex[:10]}"
        job = QDCJob(
            id=job_id,
            prompt=cleaned_prompt,
            artifact_id=resolved_artifact_id,
            target=(target or "auto").strip() or "auto",
            priority=(priority or "normal").strip() or "normal",
            status="queued",
            created_at=now,
            updated_at=now,
            mode=self.mode,
        )
        self._append_log(job, "Job queued")

        async with self._lock:
            self._jobs[job_id] = job
            self._job_tasks[job_id] = asyncio.create_task(self._run_job(job_id, sid))

        await self._emit_event(
            sid,
            {
                "type": "qdc_job_update",
                "job_id": job_id,
                "status": "queued",
                "message": "QDC job queued",
            },
        )

        return job.to_dict()

    async def _run_job(self, job_id: str, sid: Optional[str]) -> None:
        async with self._lock:
            job = self._jobs.get(job_id)
            if not job:
                return

        try:
            step = self.mock_step_s
            await asyncio.sleep(step)
            await self._update_job(job_id, sid, status="uploading", message="Uploading artifact and preparing runtime")
            await asyncio.sleep(step)
            await self._update_job(job_id, sid, status="running", message="Running remote QDC job")

            progress_steps = [22, 48, 76, 100]
            for pct in progress_steps:
                await asyncio.sleep(step if pct < 100 else max(0.05, step * 0.4))
                await self._emit_event(
                    sid,
                    {
                        "type": "qdc_job_progress",
                        "job_id": job_id,
                        "status": "running",
                        "progress": pct,
                        "message": f"QDC progress {pct}%",
                    },
                )

            async with self._lock:
                job = self._jobs.get(job_id)
                if not job:
                    return
                job.status = "succeeded"
                job.updated_at = _now()
                summary = (
                    "Remote QDC lane completed. "
                    f"Target={job.target}, Priority={job.priority}, "
                    f"Artifact={job.artifact_id or 'none'}."
                )
                job.result = {
                    "summary": summary,
                    "artifact_id": job.artifact_id,
                    "target": job.target,
                    "mode": job.mode,
                }
                self._append_log(job, "Job completed successfully")

            await self._emit_event(
                sid,
                {
                    "type": "qdc_job_update",
                    "job_id": job_id,
                    "status": "succeeded",
                    "message": "QDC job completed",
                },
            )
        except asyncio.CancelledError:
            async with self._lock:
                job = self._jobs.get(job_id)
                if job:
                    job.status = "canceled"
                    job.updated_at = _now()
                    self._append_log(job, "Job canceled")
            raise
        except Exception as exc:
            async with self._lock:
                job = self._jobs.get(job_id)
                if job:
                    job.status = "failed"
                    job.error = str(exc)
                    job.updated_at = _now()
                    self._append_log(job, f"Job failed: {exc}")
            await self._emit_event(
                sid,
                {
                    "type": "qdc_job_update",
                    "job_id": job_id,
                    "status": "failed",
                    "message": str(exc),
                },
            )
        finally:
            async with self._lock:
                self._job_tasks.pop(job_id, None)

    async def _update_job(self, job_id: str, sid: Optional[str], *, status: str, message: str) -> None:
        async with self._lock:
            job = self._jobs.get(job_id)
            if not job:
                return
            job.status = status
            job.updated_at = _now()
            self._append_log(job, message)

        await self._emit_event(
            sid,
            {
                "type": "qdc_job_update",
                "job_id": job_id,
                "status": status,
                "message": message,
            },
        )

    def list_artifacts(self) -> list[dict[str, Any]]:
        artifacts = [artifact.to_dict() for artifact in self._artifacts.values()]
        artifacts.sort(key=lambda item: float(item.get("created_at") or 0), reverse=True)
        return artifacts

    def list_jobs(self, limit: int = 50) -> list[dict[str, Any]]:
        jobs = [job.to_dict() for job in self._jobs.values()]
        jobs.sort(key=lambda item: float(item.get("created_at") or 0), reverse=True)
        return jobs[: max(1, min(limit, 200))]

    def get_job(self, job_id: str) -> Optional[dict[str, Any]]:
        job = self._jobs.get(job_id)
        return job.to_dict() if job else None

    def get_job_logs(self, job_id: str) -> list[str]:
        job = self._jobs.get(job_id)
        if not job:
            raise KeyError(job_id)
        return list(job.logs)

    def get_job_result(self, job_id: str) -> dict[str, Any]:
        job = self._jobs.get(job_id)
        if not job:
            raise KeyError(job_id)
        if not job.result:
            return {}
        return dict(job.result)

    async def cancel_job(self, job_id: str) -> dict[str, Any]:
        async with self._lock:
            task = self._job_tasks.get(job_id)
            job = self._jobs.get(job_id)
            if not job:
                raise KeyError(job_id)
            if not task:
                return job.to_dict()
            task.cancel()

        try:
            await task
        except asyncio.CancelledError:
            pass

        job_now = self._jobs.get(job_id)
        return job_now.to_dict() if job_now else {}

    async def rerun_job(self, job_id: str, sid: Optional[str] = None) -> dict[str, Any]:
        job = self._jobs.get(job_id)
        if not job:
            raise KeyError(job_id)
        return await self.create_job(
            prompt=job.prompt,
            artifact_id=job.artifact_id,
            target=job.target,
            priority=job.priority,
            sid=sid,
        )

    async def wait_for_job(self, job_id: str, timeout_s: float = 180.0) -> dict[str, Any]:
        end = _now() + max(0.1, timeout_s)
        while _now() < end:
            job = self._jobs.get(job_id)
            if not job:
                raise KeyError(job_id)
            if job.status in self.TERMINAL_STATES:
                return job.to_dict()
            await asyncio.sleep(0.35)
        raise TimeoutError(f"Timed out waiting for QDC job {job_id}")


qdc_service = QDCService()
