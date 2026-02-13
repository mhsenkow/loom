"""
QDC REST endpoints for async remote job orchestration.
"""

from __future__ import annotations

from typing import Optional

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from app.services.provider_manager import provider_manager
from app.services.qdc_service import qdc_service

router = APIRouter()


class UploadRequest(BaseModel):
    path: str = Field(..., description="Local file/folder path to upload as QDC artifact")


class PackageRequest(BaseModel):
    path: str = Field(..., description="Local file/folder path to package into a QDC-ready zip")
    package_name: Optional[str] = Field(None, description="Optional output package name")
    startup_command: Optional[str] = Field(
        None,
        description="Optional startup command written into loom_qdc_run scripts",
    )
    package_kind: str = Field("application", description="application or model")


class CreateJobRequest(BaseModel):
    prompt: str = Field(..., description="Remote task prompt/instructions")
    artifact_id: Optional[str] = Field(None, description="Previously uploaded artifact id")
    artifact_path: Optional[str] = Field(None, description="Optional local path to upload before job start")
    target: str = Field("auto", description="Target device/profile")
    priority: str = Field("normal", description="Job priority")
    sid: Optional[str] = Field(None, description="Optional socket session id for live progress events")


class RerunRequest(BaseModel):
    sid: Optional[str] = Field(None, description="Optional socket session id for live progress events")


class PackageAndRunRequest(BaseModel):
    path: str = Field(..., description="Local file/folder path to package")
    prompt: str = Field(..., description="Remote task prompt/instructions")
    package_name: Optional[str] = Field(None, description="Optional output package name")
    startup_command: Optional[str] = Field(
        None,
        description="Optional startup command written into loom_qdc_run scripts",
    )
    package_kind: str = Field("application", description="application or model")
    target: str = Field("auto", description="Target device/profile")
    priority: str = Field("normal", description="Job priority")
    sid: Optional[str] = Field(None, description="Optional socket session id for live progress events")


@router.get("/status")
async def qdc_status():
    provider = provider_manager.get_provider("qdc")
    return {
        "mode": qdc_service.mode,
        "provider_connected": bool(provider and provider.is_connected),
        "supports_chat": bool(getattr(provider, "supports_chat", False)) if provider else False,
        "supports_quick": bool(getattr(provider, "supports_quick", False)) if provider else False,
        "jobs": len(qdc_service.list_jobs(limit=9999)),
        "artifacts": len(qdc_service.list_artifacts()),
    }


@router.get("/artifacts")
async def list_artifacts():
    return {"artifacts": qdc_service.list_artifacts()}


@router.post("/upload")
async def upload_artifact(req: UploadRequest):
    try:
        artifact = await qdc_service.upload_artifact(req.path)
        return {"status": "uploaded", "artifact": artifact}
    except (FileNotFoundError, ValueError) as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))


@router.post("/package")
async def package_artifact(req: PackageRequest):
    try:
        package = await qdc_service.create_package(
            req.path,
            package_name=req.package_name,
            startup_command=req.startup_command,
            package_kind=req.package_kind,
        )
        return {"status": "packaged", "package": package}
    except (FileNotFoundError, ValueError) as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))


@router.post("/jobs")
async def create_job(req: CreateJobRequest):
    try:
        job = await qdc_service.create_job(
            prompt=req.prompt,
            artifact_id=req.artifact_id,
            artifact_path=req.artifact_path,
            target=req.target,
            priority=req.priority,
            sid=req.sid,
        )
        return {"status": "started", "job": job}
    except (FileNotFoundError, ValueError) as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))


@router.post("/package-and-run")
async def package_and_run(req: PackageAndRunRequest):
    try:
        payload = await qdc_service.package_and_run(
            path_value=req.path,
            prompt=req.prompt,
            package_name=req.package_name,
            startup_command=req.startup_command,
            package_kind=req.package_kind,
            target=req.target,
            priority=req.priority,
            sid=req.sid,
        )
        return {"status": "started", **payload}
    except (FileNotFoundError, ValueError) as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))


@router.get("/jobs")
async def list_jobs(limit: int = 50):
    return {"jobs": qdc_service.list_jobs(limit=limit)}


@router.get("/jobs/{job_id}")
async def get_job(job_id: str):
    job = qdc_service.get_job(job_id)
    if not job:
        raise HTTPException(status_code=404, detail="QDC job not found")
    return {"job": job}


@router.get("/jobs/{job_id}/logs")
async def get_job_logs(job_id: str):
    try:
        return {"job_id": job_id, "logs": qdc_service.get_job_logs(job_id)}
    except KeyError:
        raise HTTPException(status_code=404, detail="QDC job not found")


@router.get("/jobs/{job_id}/results")
async def get_job_results(job_id: str):
    try:
        return {"job_id": job_id, "result": qdc_service.get_job_result(job_id)}
    except KeyError:
        raise HTTPException(status_code=404, detail="QDC job not found")


@router.post("/jobs/{job_id}/rerun")
async def rerun_job(job_id: str, req: RerunRequest):
    try:
        job = await qdc_service.rerun_job(job_id, sid=req.sid)
        return {"status": "started", "job": job}
    except KeyError:
        raise HTTPException(status_code=404, detail="QDC job not found")
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))


@router.post("/jobs/{job_id}/cancel")
async def cancel_job(job_id: str):
    try:
        job = await qdc_service.cancel_job(job_id)
        return {"status": "canceled", "job": job}
    except KeyError:
        raise HTTPException(status_code=404, detail="QDC job not found")
