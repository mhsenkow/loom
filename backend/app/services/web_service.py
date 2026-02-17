import asyncio
import re
from pathlib import Path
import time
import httpx
import os
import base64
import logging

logger = logging.getLogger(__name__)

# Playwright and BeautifulSoup are optional (lazy import) so Docker slim image can start without them.


def _get_playwright():
    """Lazy import so Docker image without playwright can start."""
    try:
        from playwright.async_api import async_playwright
        return async_playwright
    except ImportError:
        return None


def _get_BeautifulSoup():
    """Lazy import so Docker image without bs4 can start."""
    try:
        from bs4 import BeautifulSoup
        return BeautifulSoup
    except ImportError:
        return None


# Stealth mode to avoid bot detection (only used when playwright is used)
try:
    from playwright_stealth import stealth_async
    HAS_STEALTH = True
except ImportError:
    HAS_STEALTH = False
    logger.warning("playwright-stealth not installed, using default browser")

# Readability for clean article extraction
try:
    from readability import Document
    HAS_READABILITY = True
except ImportError:
    HAS_READABILITY = False
    logger.warning("readability-lxml not installed, using fallback extraction")

# PyMuPDF for PDF extraction
try:
    import fitz  # pymupdf
    HAS_PYMUPDF = True
except ImportError:
    HAS_PYMUPDF = False
    logger.warning("pymupdf not installed, PDF support disabled")

# DuckDuckGo for search (new package name)
try:
    from ddgs import DDGS
    HAS_DDGS = True
except ImportError:
    try:
        from duckduckgo_search import DDGS  # fallback
        HAS_DDGS = True
    except ImportError:
        HAS_DDGS = False
        logger.warning("ddgs not installed, /research disabled")


class WebService:
    def __init__(self):
        self.browser = None
        self.playwright = None
        self.current_context = None
        self.current_page = None

    async def _ensure_browser(self):
        async_playwright = _get_playwright()
        if async_playwright is None:
            raise RuntimeError(
                "Playwright is not installed. Install with: pip install playwright && playwright install chromium. "
                "Web browsing and /research will be disabled until then."
            )
        if not self.playwright:
            self.playwright = await async_playwright().start()
        if not self.browser:
            self.browser = await self.playwright.chromium.launch(headless=True)

    def _extract_text(self, html: str) -> str:
        """Extract clean text using Readability (Mozilla Reader View) with BeautifulSoup fallback."""
        BeautifulSoup = _get_BeautifulSoup()
        if HAS_READABILITY and BeautifulSoup is not None:
            try:
                doc = Document(html)
                article_html = doc.summary()
                soup = BeautifulSoup(article_html, 'html.parser')
                text = soup.get_text(separator='\n', strip=True)
                if len(text) > 200:
                    return text
            except Exception as e:
                logger.debug("Readability failed, using fallback: %s", e)
        
        if BeautifulSoup is not None:
            soup = BeautifulSoup(html, 'html.parser')
            for tag in soup(["script", "style", "nav", "footer", "iframe", "header", "aside"]):
                tag.decompose()
            return soup.get_text(separator=' ', strip=True)
        # Fallback: strip tags with regex (no bs4)
        text = re.sub(r'<script[^>]*>.*?</script>', '', html, flags=re.DOTALL | re.IGNORECASE)
        text = re.sub(r'<style[^>]*>.*?</style>', '', text, flags=re.DOTALL | re.IGNORECASE)
        text = re.sub(r'<[^>]+>', ' ', text)
        return ' '.join(text.split())

    async def _capture_page_state(self, page, url: str, analyze_vision: bool) -> dict:
        """Helper to capture screenshot, text, and optional vision analysis."""
        try:
            title = await page.title()
            
            # Screenshot
            images_dir = Path(__file__).parent.parent.parent / "data" / "images"
            images_dir.mkdir(parents=True, exist_ok=True)
            timestamp = int(time.time() * 1000)
            filename = f"web_{timestamp}.png"
            filepath = images_dir / filename
            
            await page.screenshot(path=str(filepath), full_page=False)
            screenshot_url = f"/api/images/files/{filename}"
            
            # Extract text
            html = await page.content()
            text = self._extract_text(html)
            
            # Truncate
            if len(text) > 12000:
                text = text[:12000] + "\n\n... (truncated)"
            
            result = {
                "status": "success",
                "url": url,
                "title": title,
                "text_content": text,
                "screenshot_url": screenshot_url,
                "screenshot_path": str(filepath),
                "timestamp": timestamp
            }
            
            if analyze_vision:
                vision_result = await self._analyze_screenshot(filepath)
                if vision_result:
                    result["vision_analysis"] = vision_result
                    
            return result
        except Exception as e:
            logger.exception("capture_page_state_error")
            return {"status": "error", "error": str(e), "url": url}

    async def visit(self, url: str, analyze_vision: bool = True, stateful: bool = True) -> dict:
        """
        Visits a URL.
        If stateful=True (default), keeps the page open for interaction.
        If stateful=False (for research), closes page after capture.
        """
        await self._ensure_browser()
        
        # If stateful and we have a page, close it to start fresh (or could reuse?)
        # Let's start fresh for /visit
        if stateful:
            await self.close_session()

        context = await self.browser.new_context(
            viewport={"width": 1280, "height": 800},
            user_agent="Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
        )
        page = await context.new_page()
        
        if HAS_STEALTH:
            await stealth_async(page)
        
        try:
            logger.info("visiting_url url=%s", url)

            # Handle PDF URLs directly
            if url.lower().endswith('.pdf') or url.lower().endswith('.pdf/'):
                return await self._handle_pdf(url)

            await page.goto(url, wait_until="domcontentloaded", timeout=30000)
            await page.wait_for_timeout(2000)
            
            # Update state if stateful
            if stateful:
                self.current_context = context
                self.current_page = page
            
            result = await self._capture_page_state(page, url, analyze_vision)
            
            if not stateful:
                await context.close()
                
            return result
            
        except Exception as e:
            await context.close()
            logger.exception("web_visit_error url=%s", url)
            return {
                "status": "error",
                "error": str(e),
                "url": url
            }

    async def _handle_pdf(self, url: str) -> dict:
        """Download and process PDF using PyMuPDF."""
        if not HAS_PYMUPDF:
            return {"status": "error", "error": "PDF processing not available (install pymupdf)", "url": url}
        
        try:
            logger.info("processing_pdf url=%s", url)
            
            # Use headers to mimic browser (avoid 403 blocks)
            headers = {
                "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
            }
            
            async with httpx.AsyncClient(follow_redirects=True, timeout=30.0) as client:
                response = await client.get(url, headers=headers)
                if response.status_code != 200:
                    return {"status": "error", "error": f"Failed to download PDF: {response.status_code} {response.reason_phrase}", "url": url}
                pdf_data = response.content

            # Open with PyMuPDF
            doc = fitz.open(stream=pdf_data, filetype="pdf")
            
            # Extract text
            text_content = ""
            for page in doc:
                text_content += page.get_text() + "\n\n"
            
            # Truncate if too long (same as visit)
            if len(text_content) > 12000:
                text_content = text_content[:12000] + "\n\n... (extract truncated)"
            
            # Render first page as image
            pix = doc[0].get_pixmap()
            
            images_dir = Path(__file__).parent.parent.parent / "data" / "images"
            images_dir.mkdir(parents=True, exist_ok=True)
            timestamp = int(time.time() * 1000)
            filename = f"web_pdf_{timestamp}.png"
            filepath = images_dir / filename
            
            pix.save(str(filepath))
            screenshot_url = f"/api/images/files/{filename}"
            
            return {
                "status": "success",
                "url": url,
                "title": f"PDF Document ({doc.page_count} pages)",
                "text_content": text_content,
                "screenshot_url": screenshot_url,
                "screenshot_path": str(filepath),
                "timestamp": timestamp,
                "vision_analysis": "This is a PDF document. Vision analysis is active on the first page."
            }
            
        except Exception as e:
            logger.exception("pdf_processing_error url=%s", url)
            return {"status": "error", "error": f"PDF Error: {str(e)}", "url": url}

    async def interact_click(self, query: str) -> dict:
        """Click on an element described by text or selector."""
        if not self.current_page:
            return {"status": "error", "error": "No active web session. Use /visit first."}
        
        try:
            # Try exact text, then partial text, then role
            # This is a simple heuristic. A better way uses LLM to find selector.
            # providing text=query is powerful in Playwright
            
            logger.info("clicking_query query=%s", query)
            
            # Simple heuristic: try to find by text
            # Playwright's get_by_text is case-insensitive usually? No.
            # let's try a few locators
            
            # 1. Try generic text locator first
            try:
                await self.current_page.click(f"text={query}", timeout=2000)
            except:
                # 2. Try role button with name
                try:
                    await self.current_page.get_by_role("button", name=query).click(timeout=2000)
                except:
                    # 3. Try link with name
                    await self.current_page.get_by_role("link", name=query).click(timeout=3000)
            
            await self.current_page.wait_for_timeout(2000)
            return await self._capture_page_state(self.current_page, self.current_page.url, analyze_vision=False)
            
        except Exception as e:
            return {"status": "error", "error": f"Failed to click '{query}': {str(e)}"}

    async def interact_type(self, query: str, text: str) -> dict:
        """Type text into an input field found by query."""
        if not self.current_page:
            return {"status": "error", "error": "No active web session."}
        
        try:
            logger.info("typing_into_query query=%s", query)
            await self.current_page.fill(f"text={query}", text) # Naive
            # Real impl needs better locator logic or AI locator resolution.
            # Fallback to get_by_placeholder?
            # For now, simplistic.
            
            return await self._capture_page_state(self.current_page, self.current_page.url, analyze_vision=False)
        except Exception as e:
             return {"status": "error", "error": f"Failed to type: {str(e)}"}

    async def interact_scroll(self, direction: str) -> dict:
        """Scroll 'up' or 'down'."""
        if not self.current_page:
             return {"status": "error", "error": "No active web session."}
        
        try:
            if direction == "up":
                await self.current_page.evaluate("window.scrollBy(0, -window.innerHeight)")
            else:
                await self.current_page.evaluate("window.scrollBy(0, window.innerHeight)")
            
            await self.current_page.wait_for_timeout(1000)
            return await self._capture_page_state(self.current_page, self.current_page.url, analyze_vision=False)
        except Exception as e:
             return {"status": "error", "error": f"Scroll failed: {str(e)}"}
             
    async def go_back(self) -> dict:
        if not self.current_page:
             return {"status": "error", "error": "No active web session."}
        try:
            await self.current_page.go_back()
            await self.current_page.wait_for_timeout(2000)
            return await self._capture_page_state(self.current_page, self.current_page.url, analyze_vision=False)
        except Exception as e:
             return {"status": "error", "error": f"Back failed: {str(e)}"}

    async def close_session(self):
        if self.current_context:
            await self.current_context.close()
            self.current_context = None
            self.current_page = None

    async def _analyze_screenshot(self, filepath: Path) -> str:
        """Analyze screenshot using vision model via internal API."""
        try:
            import base64
            with open(filepath, "rb") as f:
                image_b64 = base64.b64encode(f.read()).decode()
            
            api_base_url = os.getenv("LOOM_INTERNAL_API_BASE_URL", "http://localhost:8000").rstrip("/")
            async with httpx.AsyncClient(timeout=60.0) as client:
                response = await client.post(
                    f"{api_base_url}/api/images/analyze",
                    json={
                        "image_base64": image_b64,
                        "prompt": "Describe what you see on this webpage screenshot. Focus on visual elements like charts, images, layout, and any important visual information that wouldn't be captured in text."
                    }
                )
                if response.status_code == 200:
                    data = response.json()
                    if data.get("success"):
                        return data.get("analysis", "")
        except Exception as e:
            logger.exception("vision_analysis_failed")
        return None

    async def research(self, query: str, max_results: int = 3) -> dict:
        """Deep search: search DuckDuckGo, visit top results, extract content."""
        if not HAS_DDGS:
            return {"status": "error", "error": "DuckDuckGo search not installed"}
        
        await self._ensure_browser()
        logger.info("researching_query query=%s", query)
        
        try:
            import concurrent.futures
            def do_search():
                ddgs = DDGS()
                return list(ddgs.text(query, max_results=max_results))
            
            loop = asyncio.get_event_loop()
            with concurrent.futures.ThreadPoolExecutor() as executor:
                results = await loop.run_in_executor(executor, do_search)
            
            if not results:
                return {"status": "error", "error": "No search results found"}
            
            sources = []
            for i, result in enumerate(results):
                url = result.get("href") or result.get("link")
                title = result.get("title", "Untitled")
                if not url: continue
                
                logger.debug("visiting_search_result index=%s total=%s title=%s", i + 1, len(results), title[:50])
                try:
                    # stateful=False for research to keep it isolated
                    page_result = await self.visit(url, analyze_vision=False, stateful=False)
                    if page_result.get("status") == "success":
                        sources.append({
                            "title": page_result.get("title", title),
                            "url": url,
                            "content": page_result.get("text_content", "")[:4000],
                            "screenshot_url": page_result.get("screenshot_url")
                        })
                except Exception as e:
                    logger.warning("failed_to_visit_search_result url=%s error=%s", url, e)
                    continue
            
            if not sources:
                return {"status": "error", "error": "Failed to fetch any search results"}
            
            return {
                "status": "success",
                "query": query,
                "sources": sources,
                "source_count": len(sources)
            }
        except Exception as e:
            logger.exception("research_error")
            return {"status": "error", "error": str(e)}

    async def cleanup(self):
        await self.close_session()
        if self.browser:
            await self.browser.close()
            self.browser = None
        if self.playwright:
            await self.playwright.stop()
            self.playwright = None


# Global instance
web_service = WebService()
