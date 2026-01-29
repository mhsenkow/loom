import asyncio
from playwright.async_api import async_playwright
from pathlib import Path
import time
import httpx
from bs4 import BeautifulSoup

# Stealth mode to avoid bot detection
try:
    from playwright_stealth import stealth_async
    HAS_STEALTH = True
except ImportError:
    HAS_STEALTH = False
    print("[LOOM] playwright-stealth not installed, using default browser")

# Readability for clean article extraction
try:
    from readability import Document
    HAS_READABILITY = True
except ImportError:
    HAS_READABILITY = False
    print("[LOOM] readability-lxml not installed, using fallback extraction")

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
        print("[LOOM] ddgs not installed, /research disabled")


class WebService:
    def __init__(self):
        self.browser = None
        self.playwright = None

    async def _ensure_browser(self):
        if not self.playwright:
            self.playwright = await async_playwright().start()
        if not self.browser:
            self.browser = await self.playwright.chromium.launch(headless=True)

    def _extract_text(self, html: str) -> str:
        """Extract clean text using Readability (Mozilla Reader View) with BeautifulSoup fallback."""
        if HAS_READABILITY:
            try:
                doc = Document(html)
                # Get the cleaned article HTML
                article_html = doc.summary()
                # Convert to plain text
                soup = BeautifulSoup(article_html, 'html.parser')
                text = soup.get_text(separator='\n', strip=True)
                if len(text) > 200:  # Readability succeeded
                    return text
            except Exception as e:
                print(f"[LOOM] Readability failed, using fallback: {e}")
        
        # Fallback: naive BeautifulSoup extraction
        soup = BeautifulSoup(html, 'html.parser')
        for tag in soup(["script", "style", "nav", "footer", "iframe", "header", "aside"]):
            tag.decompose()
        return soup.get_text(separator=' ', strip=True)

    async def visit(self, url: str, analyze_vision: bool = True) -> dict:
        """
        Visits a URL, captures screenshot and text content.
        Optionally triggers vision analysis on the screenshot.
        """
        await self._ensure_browser()
        
        context = await self.browser.new_context(
            viewport={"width": 1280, "height": 800},
            user_agent="Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
        )
        page = await context.new_page()
        
        # Apply stealth to avoid bot detection
        if HAS_STEALTH:
            await stealth_async(page)
        
        try:
            print(f"[LOOM] Visiting {url}...")
            await page.goto(url, wait_until="domcontentloaded", timeout=30000)
            await page.wait_for_timeout(2000)
            
            title = await page.title()
            
            # Screenshot
            images_dir = Path(__file__).parent.parent.parent / "data" / "images"
            images_dir.mkdir(parents=True, exist_ok=True)
            timestamp = int(time.time() * 1000)
            filename = f"web_{timestamp}.png"
            filepath = images_dir / filename
            
            await page.screenshot(path=str(filepath), full_page=False)
            screenshot_url = f"/api/images/files/{filename}"
            
            # Extract text using Readability
            html = await page.content()
            text = self._extract_text(html)
            
            # Truncate if too long
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
            
            # Vision analysis (call local endpoint)
            if analyze_vision:
                vision_result = await self._analyze_screenshot(filepath)
                if vision_result:
                    result["vision_analysis"] = vision_result
            
            return result
            
        except Exception as e:
            print(f"[LOOM] Web visit error: {e}")
            return {
                "status": "error",
                "error": str(e),
                "url": url
            }
        finally:
            await context.close()

    async def _analyze_screenshot(self, filepath: Path) -> str:
        """Analyze screenshot using vision model via internal API."""
        try:
            import base64
            with open(filepath, "rb") as f:
                image_b64 = base64.b64encode(f.read()).decode()
            
            async with httpx.AsyncClient(timeout=60.0) as client:
                response = await client.post(
                    "http://localhost:8000/api/images/analyze",
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
            print(f"[LOOM] Vision analysis failed: {e}")
        return None

    async def research(self, query: str, max_results: int = 3) -> dict:
        """
        Deep search: search DuckDuckGo, visit top results, extract content.
        Returns combined research context.
        """
        if not HAS_DDGS:
            return {
                "status": "error",
                "error": "DuckDuckGo search not installed"
            }
        
        await self._ensure_browser()
        
        print(f"[LOOM] Researching: {query}")
        
        try:
            # Search DuckDuckGo (sync call wrapped for async)
            import concurrent.futures
            
            def do_search():
                ddgs = DDGS()
                return list(ddgs.text(query, max_results=max_results))
            
            loop = asyncio.get_event_loop()
            with concurrent.futures.ThreadPoolExecutor() as executor:
                results = await loop.run_in_executor(executor, do_search)
            
            if not results:
                return {
                    "status": "error",
                    "error": "No search results found"
                }
            
            # Visit each result
            sources = []
            for i, result in enumerate(results):
                url = result.get("href") or result.get("link")
                title = result.get("title", "Untitled")
                
                if not url:
                    continue
                
                print(f"[LOOM] Visiting result {i+1}/{len(results)}: {title[:50]}...")
                
                try:
                    page_result = await self.visit(url, analyze_vision=False)
                    if page_result.get("status") == "success":
                        sources.append({
                            "title": page_result.get("title", title),
                            "url": url,
                            "content": page_result.get("text_content", "")[:4000],  # Limit per source
                            "screenshot_url": page_result.get("screenshot_url")
                        })
                except Exception as e:
                    print(f"[LOOM] Failed to visit {url}: {e}")
                    continue
            
            if not sources:
                return {
                    "status": "error",
                    "error": "Failed to fetch any search results"
                }
            
            return {
                "status": "success",
                "query": query,
                "sources": sources,
                "source_count": len(sources)
            }
            
        except Exception as e:
            print(f"[LOOM] Research error: {e}")
            return {
                "status": "error",
                "error": str(e)
            }

    async def cleanup(self):
        if self.browser:
            await self.browser.close()
            self.browser = None
        if self.playwright:
            await self.playwright.stop()
            self.playwright = None


# Global instance
web_service = WebService()
