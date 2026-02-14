"""
Share API endpoints for publishing chat via Cloudflare Tunnel.
"""

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from app.services.share_service import share_service

router = APIRouter()


class ShareStartRequest(BaseModel):
    target_url: str = Field(default="http://127.0.0.1:8000")


@router.get("/status")
async def get_share_status():
    return share_service.get_status()


@router.post("/start")
async def start_share(request: ShareStartRequest):
    try:
        return share_service.start(target_url=request.target_url)
    except RuntimeError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))


@router.post("/stop")
async def stop_share():
    try:
        return share_service.stop()
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))

