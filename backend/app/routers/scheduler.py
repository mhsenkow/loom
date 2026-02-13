
from fastapi import APIRouter, HTTPException, BackgroundTasks
from pydantic import BaseModel
from typing import Dict, Any, List, Optional
from app.services.scheduler_service import scheduler_service, run_circuit_job_wrapper
# circuit_runner imported inside wrapper if needed, or by service.
import logging

router = APIRouter(prefix="/api/scheduler", tags=["scheduler"])
logger = logging.getLogger("loom.api.scheduler")

class ScheduleJobRequest(BaseModel):
    circuit_name: str
    cron_expression: str  # e.g. "0 12 * * *" (minute hour day month day_of_week)
    job_name: Optional[str] = None

class JobResponse(BaseModel):
    id: str
    name: str
    next_run_time: Optional[str]
    trigger: str

@router.get("/jobs", response_model=List[JobResponse])
async def list_jobs():
    return scheduler_service.list_jobs()

@router.post("/jobs", response_model=Dict[str, str])
async def create_job(request: ScheduleJobRequest):
    try:
        # Parse cron expression roughly
        # This is a simplification. A real implementation would parse it properly.
        # Format: minute hour day month day_of_week
        parts = request.cron_expression.split()
        if len(parts) != 5:
            raise HTTPException(status_code=400, detail="Invalid cron expression. Expected 5 fields.")
        
        cron_args = {
            "minute": parts[0],
            "hour": parts[1],
            "day": parts[2],
            "month": parts[3],
            "day_of_week": parts[4]
        }
        
        # Clean up '*' to omit from args or handle as None/defaults by APScheduler?
        # APScheduler CronTrigger defaults to '*' for omitted args.
        # But we passed them as strings which is fine for CronTrigger.
        
        job_id = scheduler_service.add_job(
            func=run_circuit_job_wrapper,
            trigger_type='cron',
            trigger_args=cron_args,
            name=request.job_name or f"Circuit: {request.circuit_name}",
            circuit_name=request.circuit_name
        )
        
        return {"id": job_id, "status": "scheduled"}
        
    except Exception as e:
        logger.error(f"Error creating job: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@router.delete("/jobs/{job_id}")
async def delete_job(job_id: str):
    success = scheduler_service.remove_job(job_id)
    if not success:
        raise HTTPException(status_code=404, detail="Job not found")
    return {"status": "deleted"}
