
from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel
from typing import Dict, Any, List, Optional
from app.services.scheduler_service import scheduler_service, run_circuit_job_wrapper
from app.services import storage
# circuit_runner imported inside wrapper if needed, or by service.
import logging
import uuid

router = APIRouter()
logger = logging.getLogger("loom.api.scheduler")

class ScheduleJobRequest(BaseModel):
    circuit_name: str
    cron_expression: str  # 5 fields or 6 fields (with seconds)
    job_name: Optional[str] = None

class JobResponse(BaseModel):
    id: str
    name: str
    next_run_time: Optional[str]
    trigger: str

class SchedulerRunResponse(BaseModel):
    runId: str
    circuitName: str
    jobId: Optional[str]
    trigger: str
    status: str
    startedAt: float
    finishedAt: Optional[float]
    durationMs: Optional[int]
    error: Optional[str]

class RunNowRequest(BaseModel):
    circuit_name: str

class LogRunRequest(BaseModel):
    circuit_name: str
    status: str
    run_id: Optional[str] = None
    job_id: Optional[str] = None
    trigger: str = "manual-ui"
    started_at: float
    finished_at: Optional[float] = None
    error: Optional[str] = None


def _normalize_epoch(value: float) -> float:
    # Accept milliseconds from frontend and normalize to seconds.
    return value / 1000.0 if value > 100_000_000_000 else value

@router.get("/jobs", response_model=List[JobResponse])
async def list_jobs():
    return scheduler_service.list_jobs()


@router.get("/runs", response_model=List[SchedulerRunResponse])
async def list_runs(
    circuit_name: Optional[str] = None,
    job_id: Optional[str] = None,
    limit: int = Query(default=200, ge=1, le=1000),
):
    return storage.list_scheduler_runs(circuit_name=circuit_name, job_id=job_id, limit=limit)

@router.post("/jobs", response_model=Dict[str, str])
async def create_job(request: ScheduleJobRequest):
    try:
        cron_args = scheduler_service.parse_cron_expression(request.cron_expression.strip())
        if not cron_args:
            raise HTTPException(
                status_code=400,
                detail="Invalid cron expression. Expected 5 fields (m h dom mon dow) or 6 fields (s m h dom mon dow).",
            )
        scheduled_job_id = str(uuid.uuid4())
        job_id = scheduler_service.add_job(
            func=run_circuit_job_wrapper,
            trigger_type='cron',
            trigger_args=cron_args,
            job_id=scheduled_job_id,
            name=request.job_name or f"Circuit: {request.circuit_name}",
            func_kwargs={
                "circuit_name": request.circuit_name,
                "job_id": scheduled_job_id,
                "trigger": "scheduled",
            },
        )
        
        return {"id": job_id, "status": "scheduled"}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error creating job: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@router.delete("/jobs/{job_id}")
async def delete_job(job_id: str):
    success = scheduler_service.remove_job(job_id)
    if not success:
        raise HTTPException(status_code=404, detail="Job not found")
    return {"status": "deleted"}

@router.post("/run-now", response_model=Dict[str, str])
async def run_now(request: RunNowRequest):
    run_id = scheduler_service.run_now(request.circuit_name.strip())
    return {"status": "queued", "run_id": run_id}

@router.post("/runs/log", response_model=SchedulerRunResponse)
async def log_run(request: LogRunRequest):
    run_id = request.run_id or str(uuid.uuid4())
    started_at = _normalize_epoch(request.started_at)
    finished_at = _normalize_epoch(request.finished_at) if request.finished_at is not None else None
    return storage.upsert_scheduler_run(
        run_id=run_id,
        circuit_name=request.circuit_name.strip(),
        job_id=request.job_id,
        trigger=request.trigger,
        status=request.status,
        started_at=started_at,
        finished_at=finished_at,
        error=request.error,
    )


@router.post("/seed-sample", response_model=Dict[str, Any])
async def seed_sample_schedule():
    """Create (or re-sync) the tiny starter scheduled circuit."""
    seeded = scheduler_service.ensure_sample_schedule(force=True)
    return {"status": "seeded" if seeded else "skipped", "circuit": seeded}
