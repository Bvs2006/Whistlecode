from __future__ import annotations
import base64
from typing import Dict, Any, Optional

def is_playwright_installed() -> bool:
    try:
        import playwright  # noqa: F401
        return True
    except Exception:
        return False


class BrowserAutomationService:
    """Manages browser sessions, live URL validation, DOM extraction and screenshots."""

    @classmethod
    async def probe(cls) -> Dict[str, Any]:
        if is_playwright_installed():
            return {
                "status": "success",
                "message": "Playwright is installed and ready for headless browser automation.",
                "tools_available": ["navigate", "extract_dom", "capture_screenshot", "verify_page"],
            }
        return {
            "status": "unavailable",
            "message": "Playwright is not installed. Browser automation is offline.",
        }

    @classmethod
    async def capture_page_preview(cls, url: str) -> Dict[str, Any]:
        """Safely navigates to a URL in headless Chromium, extracts title and text snippet."""
        if not is_playwright_installed():
            raise RuntimeError("Playwright is not installed.")

        from playwright.async_api import async_playwright
        async with async_playwright() as p:
            browser = await p.chromium.launch(headless=True)
            try:
                page = await browser.new_page()
                await page.goto(url, timeout=15000, wait_until="domcontentloaded")
                title = await page.title()
                text_content = await page.evaluate("() => document.body.innerText.slice(0, 2000)")
                screenshot_bytes = await page.screenshot(type="jpeg", quality=60)
                screenshot_b64 = base64.b64encode(screenshot_bytes).decode("ascii")
                return {
                    "url": url,
                    "title": title,
                    "text_preview": text_content,
                    "screenshot_b64": f"data:image/jpeg;base64,{screenshot_b64}",
                }
            finally:
                await browser.close()


browser_service = BrowserAutomationService()
