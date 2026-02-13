import os
from fastapi import APIRouter, Depends, Header, HTTPException
from pydantic import BaseModel, Field, HttpUrl, field_validator
from typing import Optional, List
from app.services.web_service import web_service

router = APIRouter(
    tags=["web"],
    responses={404: {"description": "Not found"}},
)

class WebVisitRequest(BaseModel):
    url: HttpUrl
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
    query: str = Field(min_length=2, max_length=500)
    max_results: int = Field(default=3, ge=1, le=10)

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

class InteractionRequest(BaseModel):
    query: Optional[str] = Field(default=None, max_length=300)  # For click/type
    text: Optional[str] = Field(default=None, max_length=5000)  # For type
    direction: Optional[str] = "down"  # For scroll

    @field_validator("direction")
    @classmethod
    def validate_direction(cls, value: Optional[str]) -> Optional[str]:
        if value is None:
            return value
        normalized = value.lower()
        if normalized not in {"up", "down"}:
            raise ValueError("direction must be 'up' or 'down'")
        return normalized


def require_web_api_key(x_loom_api_key: Optional[str] = Header(default=None)) -> None:
    configured_key = os.getenv("LOOM_WEB_API_KEY", "").strip()
    if not configured_key:
        return
    if x_loom_api_key != configured_key:
        raise HTTPException(status_code=401, detail="Invalid or missing API key")

@router.post("/visit", response_model=WebVisitResponse)
async def visit_website(request: WebVisitRequest, _: None = Depends(require_web_api_key)):
    """
    Visit a website using headless browser.
    Returns: title, cleaned article text (via Readability), screenshot, and optional vision analysis.
    """
    try:
        # Default to stateful=True for manual visits
        result = await web_service.visit(str(request.url), analyze_vision=request.analyze_vision, stateful=True)
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/click", response_model=WebVisitResponse)
async def click_element(request: InteractionRequest, _: None = Depends(require_web_api_key)):
    """Click an element on the current page."""
    if not request.query:
        raise HTTPException(status_code=400, detail="Missing click query")
    try:
        result = await web_service.interact_click(request.query)
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/type", response_model=WebVisitResponse)
async def type_text(request: InteractionRequest, _: None = Depends(require_web_api_key)):
    """Type text into an element."""
    if not request.query:
        raise HTTPException(status_code=400, detail="Missing target query")
    if not request.text:
        raise HTTPException(status_code=400, detail="Missing text to type")
    try:
        result = await web_service.interact_type(request.query, request.text)
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/scroll", response_model=WebVisitResponse)
async def scroll_page(request: InteractionRequest, _: None = Depends(require_web_api_key)):
    """Scroll the current page."""
    try:
        result = await web_service.interact_scroll(request.direction)
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/back", response_model=WebVisitResponse)
async def go_back(_: None = Depends(require_web_api_key)):
    """Go back in browser history."""
    try:
        result = await web_service.go_back()
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/research", response_model=ResearchResponse)
async def deep_research(request: ResearchRequest, _: None = Depends(require_web_api_key)):
    """
    Deep Search: Searches DuckDuckGo, visits top results, extracts content.
    Returns combined research context from multiple sources.
    """
    try:
        result = await web_service.research(request.query, max_results=request.max_results)
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

# ... existing code ...

class FetchRequest(BaseModel):
    url: HttpUrl
    method: str = "GET"
    headers: Optional[dict] = None
    body: Optional[str] = None
    timeout: float = 30.0

@router.post("/fetch")
async def proxy_fetch(req: FetchRequest, _: None = Depends(require_web_api_key)):
    """
    Proxy a web request through the backend to avoid CORS.
    """
    import httpx
    try:
        async with httpx.AsyncClient(verify=False) as client:
            resp = await client.request(
                req.method,
                str(req.url),
                headers=req.headers,
                content=req.body,
                timeout=req.timeout,
                follow_redirects=True
            )
            return {
                "status": resp.status_code,
                "text": resp.text,
                "headers": dict(resp.headers),
            }
    except Exception as e:
        # Log error for debugging
        print(f"Fetch Proxy Error: {e}")
        raise HTTPException(status_code=500, detail=str(e))

