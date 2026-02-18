
import logging
import asyncio
from apscheduler.schedulers.asyncio import AsyncIOScheduler
from apscheduler.triggers.cron import CronTrigger
from apscheduler.jobstores.sqlalchemy import SQLAlchemyJobStore
from typing import Dict, Any, List, Optional
import uuid

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

    def add_job(
        self,
        func,
        trigger_type: str,
        trigger_args: Dict[str, Any],
        job_id: str = None,
        name: str = None,
        func_kwargs: Optional[Dict[str, Any]] = None,
        **job_options,
    ):
        """
        Add a job to the scheduler.
        
        Args:
            func: The function to execute.
            trigger_type: 'cron', 'interval', 'date'
            trigger_args: dict of args for the trigger (e.g. {'hour': 12, 'minute': 0} for cron)
            job_id: Optional ID for the job.
            name: Optional name for the job.
            func_kwargs: Keyword arguments to pass to the scheduled function.
            **job_options: Additional APScheduler job options.
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
                kwargs=func_kwargs or {},
                **job_options,
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

    @staticmethod
    def parse_cron_expression(cron_expression: str) -> Optional[Dict[str, str]]:
        """
        Parse a cron string into APScheduler CronTrigger kwargs.
        Supports:
        - 5 fields: minute hour day month day_of_week
        - 6 fields: second minute hour day month day_of_week
        """
        parts = cron_expression.split()
        if len(parts) == 5:
            return {
                "minute": parts[0],
                "hour": parts[1],
                "day": parts[2],
                "month": parts[3],
                "day_of_week": parts[4],
            }
        if len(parts) == 6:
            return {
                "second": parts[0],
                "minute": parts[1],
                "hour": parts[2],
                "day": parts[3],
                "month": parts[4],
                "day_of_week": parts[5],
            }
        return None

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
            
            trigger_args = self.parse_cron_expression(cron_expression)
            if not trigger_args:
                logger.warning(f"Invalid cron expression for cell {cell_id}: {cron_expression}")
                continue
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
                    func_kwargs={"circuit_name": circuit_name, "job_id": job_id, "trigger": "scheduled"},
                )
            except Exception as e:
                logger.error(f"Failed to schedule job {job_id}: {e}")

    def run_now(self, circuit_name: str) -> str:
        """Trigger a circuit immediately in the background and return run_id."""
        run_id = f"manual-{uuid.uuid4()}"
        asyncio.create_task(
            run_circuit_job_wrapper(
                circuit_name=circuit_name,
                job_id=f"manual:{circuit_name}",
                trigger="manual",
                run_id=run_id,
            )
        )
        return run_id

    def ensure_sample_schedule(self, force: bool = False) -> Optional[str]:
        """
        Seed a tiny scheduled circuit on a fresh install so Calendar has an immediate example.
        Returns the seeded circuit name if created, else None.
        """
        try:
            from app.services import storage
            circuit_name = "sample-hourly-pulse"
            circuits = storage.get_circuits()
            existing_jobs = [job for job in self.scheduler.get_jobs() if job.id.startswith("circuit:")]

            # If sample already exists, ensure its cron jobs are synced.
            existing_sample = circuits.get(circuit_name)
            if existing_sample:
                cron_cells = [
                    c for c in (existing_sample.get("cells") or [])
                    if isinstance(c, dict) and c.get("type") == "cron_trigger"
                ]
                if cron_cells:
                    self.sync_circuit_jobs(circuit_name, cron_cells)
                return circuit_name

            # Startup seed only on a fresh workspace unless explicitly forced.
            if not force and (circuits or existing_jobs):
                return None

            import time
            saved_at = time.time()

            cells = [
                {
                    "id": "sample-cron-1",
                    "type": "cron_trigger",
                    "label": "EVERY HOUR",
                    "content": "0 * * * *",
                    "status": "idle",
                    "inputMode": "none",
                    "position": {"x": 48, "y": 48},
                },
                {
                    "id": "sample-input-1",
                    "type": "data_input",
                    "label": "MESSAGE",
                    "content": "LOOM sample schedule is active.",
                    "status": "idle",
                    "inputMode": "none",
                    "position": {"x": 48, "y": 188},
                },
                {
                    "id": "sample-log-1",
                    "type": "log_entry",
                    "label": "OUTPUT",
                    "content": "",
                    "status": "idle",
                    "inputMode": "previous",
                    "inputs": [{"moduleId": "sample-input-1", "portId": "output"}],
                    "position": {"x": 48, "y": 328},
                },
            ]

            storage.save_circuit(
                circuit_name,
                "Starter sample: hourly schedule pulse.",
                cells,
                {"A": "", "B": "", "C": "", "IMAGE": ""},
                saved_at,
            )
            self.sync_circuit_jobs(circuit_name, [cells[0]])
            logger.info("Seeded starter scheduled circuit: %s", circuit_name)
            return circuit_name
        except Exception as e:
            logger.warning("Failed to seed starter schedule: %s", e)
            return None

async def run_circuit_job_wrapper(
    circuit_name: str,
    job_id: Optional[str] = None,
    trigger: str = "scheduled",
    run_id: Optional[str] = None,
):
    """Wrapper to run circuit from scheduler."""
    import time
    from app.services import storage
    from app.services.circuit_runner import circuit_runner
    started_at = time.time()
    run_id = run_id or str(uuid.uuid4())
    logger.info(f"Scheduler triggering circuit: {circuit_name}")
    try:
        storage.upsert_scheduler_run(
            run_id=run_id,
            circuit_name=circuit_name,
            job_id=job_id,
            trigger=trigger,
            status="running",
            started_at=started_at,
        )
    except Exception as e:
        logger.warning("Failed to write scheduler run start: %s", e)

    try:
        await circuit_runner.run_circuit(circuit_name)
        finished_at = time.time()
        try:
            storage.upsert_scheduler_run(
                run_id=run_id,
                circuit_name=circuit_name,
                job_id=job_id,
                trigger=trigger,
                status="success",
                started_at=started_at,
                finished_at=finished_at,
            )
        except Exception as e:
            logger.warning("Failed to write scheduler run success: %s", e)
    except Exception as e:
        finished_at = time.time()
        try:
            storage.upsert_scheduler_run(
                run_id=run_id,
                circuit_name=circuit_name,
                job_id=job_id,
                trigger=trigger,
                status="failed",
                started_at=started_at,
                finished_at=finished_at,
                error=str(e),
            )
        except Exception as storage_error:
            logger.warning("Failed to write scheduler run failure: %s", storage_error)
        logger.error(f"Error running scheduled circuit {circuit_name}: {e}")

# Singleton
scheduler_service = SchedulerService()
