from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import Optional, List
from app.services.web_service import web_service

router = APIRouter(
    tags=["web"],
    responses={404: {"description": "Not found"}},
)

class WebVisitRequest(BaseModel):
    url: str
    analyze_vision: bool = True  # Whether to run vision analysis on screenshot

class WebVisitResponse(BaseModel):
    status: str
    url: str
    title: Optional[str] = None
    text_content: Optional[str] = None
    screenshot_url: Optional[str] = None
    vision_analysis: Optional[str] = None  # Visual understanding of the page
    error: Optional[str] = None

class ResearchRequest(BaseModel):
    query: str
    max_results: int = 3

class SourceInfo(BaseModel):
    title: str
    url: str
    content: str
    screenshot_url: Optional[str] = None

class ResearchResponse(BaseModel):
    status: str
    query: Optional[str] = None
    sources: Optional[List[SourceInfo]] = None
    source_count: Optional[int] = None
    error: Optional[str] = None

@router.post("/visit", response_model=WebVisitResponse)
async def visit_website(request: WebVisitRequest):
    """
    Visit a website using headless browser.
    Returns: title, cleaned article text (via Readability), screenshot, and optional vision analysis.
    """
    try:
        result = await web_service.visit(request.url, analyze_vision=request.analyze_vision)
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/research", response_model=ResearchResponse)
async def deep_research(request: ResearchRequest):
    """
    Deep Search: Searches DuckDuckGo, visits top results, extracts content.
    Returns combined research context from multiple sources.
    """
    try:
        result = await web_service.research(request.query, max_results=request.max_results)
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.on_event("shutdown")
async def shutdown_event():
    await web_service.cleanup()
