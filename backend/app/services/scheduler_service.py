
import logging
from apscheduler.schedulers.asyncio import AsyncIOScheduler
from apscheduler.triggers.cron import CronTrigger
from apscheduler.jobstores.sqlalchemy import SQLAlchemyJobStore
from typing import Dict, Any, List, Optional
import os
import uuid
from datetime import datetime

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("loom.scheduler")

class SchedulerService:
    def __init__(self, db_url: str = "sqlite:///jobs.sqlite"):
        # Use SQLAlchemyJobStore for persistence
        jobstores = {
            'default': SQLAlchemyJobStore(url=db_url)
        }
        self.scheduler = AsyncIOScheduler(jobstores=jobstores)
        self.running = False
        
    def start(self):
        """Start the scheduler if not already running."""
        if not self.running:
            try:
                self.scheduler.start()
                self.running = True
                logger.info("Scheduler started successfully.")
            except Exception as e:
                logger.error(f"Failed to start scheduler: {e}")

    def stop(self):
        """Shutdown the scheduler."""
        if self.running:
            self.scheduler.shutdown()
            self.running = False
            logger.info("Scheduler stopped.")

    def list_jobs(self) -> List[Dict[str, Any]]:
        """List all currently scheduled jobs."""
        jobs = []
        for job in self.scheduler.get_jobs():
            jobs.append({
                "id": job.id,
                "name": job.name,
                "next_run_time": job.next_run_time.isoformat() if job.next_run_time else None,
                "trigger": str(job.trigger),
                # "args": job.args, # arguments might not be serializable
                # "kwargs": job.kwargs
            })
        return jobs

    def add_job(self, func, trigger_type: str, trigger_args: Dict[str, Any], job_id: str = None, name: str = None, **kwargs):
        """
        Add a job to the scheduler.
        
        Args:
            func: The function to execute.
            trigger_type: 'cron', 'interval', 'date'
            trigger_args: dict of args for the trigger (e.g. {'hour': 12, 'minute': 0} for cron)
            job_id: Optional ID for the job.
            name: Optional name for the job.
            **kwargs: Additional arguments to pass to the function.
        """
        if not job_id:
            job_id = str(uuid.uuid4())
            
        try:
            trigger = None
            if trigger_type == 'cron':
                trigger = CronTrigger(**trigger_args)
            # Add other trigger types as needed
            else:
                raise ValueError(f"Unsupported trigger type: {trigger_type}")

            job = self.scheduler.add_job(
                func,
                trigger=trigger,
                id=job_id,
                name=name,
                replace_existing=True,
                **kwargs # Pass kwargs to the job function
            )
            logger.info(f"Added job {job_id}: {name} with trigger {trigger}")
            return job.id
        except Exception as e:
            logger.error(f"Failed to add job: {e}")
            raise

    def remove_job(self, job_id: str) -> bool:
        """Remove a job by ID."""
        try:
            self.scheduler.remove_job(job_id)
            logger.info(f"Removed job {job_id}")
            return True
        except Exception as e:
            # Job might not exist
            logger.warning(f"Failed to remove job {job_id}: {e}")
            return False

    def sync_circuit_jobs(self, circuit_name: str, cron_cells: List[Dict[str, Any]]):
        """
        Synchronize scheduled jobs for a circuit based on its cron cells.
        
        Args:
            circuit_name: The name of the circuit.
            cron_cells: List of cell dictionaries of type 'cron_trigger'.
        """
        logger.info(f"Syncing jobs for circuit {circuit_name} with {len(cron_cells)} cron cells.")
        
        # 1. Identify existing jobs for this circuit
        # We use a prefix convention for job IDs: "circuit:{circuit_name}:{cell_id}"
        prefix = f"circuit:{circuit_name}:"
        existing_jobs = [job for job in self.scheduler.get_jobs() if job.id.startswith(prefix)]
        existing_job_ids = set(job.id for job in existing_jobs)
        
        # 2. Identify desired jobs from cron cells
        desired_jobs = {}
        for cell in cron_cells:
            cell_id = cell.get("id")
            cron_expression = cell.get("content", "").strip()
            
            if not cell_id or not cron_expression:
                continue
                
            job_id = f"{prefix}{cell_id}"
            
            # Parse cron expression (simple split usually: min hour day month day-of-week)
            # If standard 5 part cron: * * * * *
            parts = cron_expression.split()
            if len(parts) != 5:
                logger.warning(f"Invalid cron expression for cell {cell_id}: {cron_expression}")
                continue
                
            trigger_args = {
                "minute": parts[0],
                "hour": parts[1],
                "day": parts[2],
                "month": parts[3],
                "day_of_week": parts[4]
            }
            
            desired_jobs[job_id] = trigger_args

        # 3. Remove jobs that are no longer needed
        desired_job_ids = set(desired_jobs.keys())
        jobs_to_remove = existing_job_ids - desired_job_ids
        
        for job_id in jobs_to_remove:
            self.remove_job(job_id)
            
        # 4. Add/Update jobs
        # APScheduler add_job with replace_existing=True handles updates if ID matches
        for job_id, trigger_args in desired_jobs.items():
            try:
                self.add_job(
                    func=run_circuit_job_wrapper,
                    trigger_type='cron',
                    trigger_args=trigger_args,
                    job_id=job_id,
                    name=f"Circuit: {circuit_name}",
                    circuit_name=circuit_name # kwarg passed to wrapper
                )
            except Exception as e:
                logger.error(f"Failed to schedule job {job_id}: {e}")

async def run_circuit_job_wrapper(circuit_name: str):
    """Wrapper to run circuit from scheduler."""
    from app.services.circuit_runner import circuit_runner
    logger.info(f"Scheduler triggering circuit: {circuit_name}")
    try:
        await circuit_runner.run_circuit(circuit_name)
    except Exception as e:
        logger.error(f"Error running scheduled circuit {circuit_name}: {e}")

# Singleton
scheduler_service = SchedulerService()

