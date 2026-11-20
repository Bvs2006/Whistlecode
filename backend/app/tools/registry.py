from __future__ import annotations

from typing import Any, Callable
import inspect

from pydantic import BaseModel, Field

from app.documents.service import DocumentGenerationError, analyze_rows, generate_document
from app.tools.filesystem import FilesystemScopeError, list_directory, read_text, write_text, sandbox_root


class ToolSpec(BaseModel):
    id: str
    name: str
    description: str
    category: str
    input_schema: dict[str, Any] = Field(default_factory=dict)
    output_schema: dict[str, Any] = Field(default_factory=dict)
    required_permissions: list[str]
    integration_id: str
    timeout_seconds: float = 30
    retry_limit: int = 0
    risk: str
    enabled: bool = True


class ToolPermissionError(Exception):
    def __init__(self, missing: list[str]):
        self.missing = missing
        super().__init__("Missing permissions: " + ", ".join(missing))


def _specs() -> list[ToolSpec]:
    return [
        ToolSpec(
            id="fs.list_directory",
            name="List sandbox folder",
            description="Lists files inside the approved WhistleCode sandbox.",
            category="filesystem",
            input_schema={"type": "object", "properties": {"path": {"type": "string"}}},
            output_schema={"type": "object", "properties": {"entries": {"type": "array"}}},
            required_permissions=["read_file"],
            integration_id="integ_local_desktop",
            risk="low",
        ),
        ToolSpec(
            id="fs.read_text",
            name="Read sandbox text",
            description="Reads a text file from the approved sandbox, up to 1 MB.",
            category="filesystem",
            input_schema={"type": "object", "properties": {"path": {"type": "string"}}, "required": ["path"]},
            output_schema={"type": "object", "properties": {"text": {"type": "string"}}},
            required_permissions=["read_file"],
            integration_id="integ_local_desktop",
            risk="medium",
        ),
        ToolSpec(
            id="fs.write_text",
            name="Write sandbox text",
            description="Writes a text file inside the approved sandbox.",
            category="filesystem",
            input_schema={"type": "object", "properties": {"path": {"type": "string"}, "text": {"type": "string"}}, "required": ["path", "text"]},
            output_schema={"type": "object", "properties": {"bytes": {"type": "integer"}}},
            required_permissions=["write_file"],
            integration_id="integ_local_desktop",
            risk="high",
        ),
        ToolSpec(
            id="doc.generate_docx",
            name="DOCX generator",
            description="Creates a Word document from the supplied topic and outline.",
            category="documents",
            input_schema={"type": "object", "properties": {"topic": {"type": "string"}, "bullets": {"type": "array"}}, "required": ["topic"]},
            output_schema={"type": "object", "properties": {"download_path": {"type": "string"}}},
            required_permissions=["write_file"],
            integration_id="integ_local_desktop",
            risk="medium",
        ),
        ToolSpec(
            id="doc.generate_pptx",
            name="PPTX generator",
            description="Creates an editable PowerPoint file from the supplied outline.",
            category="documents",
            input_schema={"type": "object", "properties": {"topic": {"type": "string"}, "slide_count": {"type": "integer"}}, "required": ["topic"]},
            output_schema={"type": "object", "properties": {"download_path": {"type": "string"}}},
            required_permissions=["write_file"],
            integration_id="integ_local_desktop",
            risk="medium",
        ),
        ToolSpec(
            id="doc.generate_pdf",
            name="PDF generator",
            description="Creates a PDF from the supplied notes.",
            category="documents",
            input_schema={"type": "object", "properties": {"topic": {"type": "string"}, "bullets": {"type": "array"}}, "required": ["topic"]},
            output_schema={"type": "object", "properties": {"download_path": {"type": "string"}}},
            required_permissions=["write_file"],
            integration_id="integ_local_desktop",
            risk="medium",
        ),
        ToolSpec(
            id="doc.analyze_xlsx",
            name="Excel analyst",
            description="Sums numeric columns in supplied rows and writes an xlsx report.",
            category="documents",
            input_schema={"type": "object", "properties": {"topic": {"type": "string"}, "rows": {"type": "array"}}, "required": ["topic", "rows"]},
            output_schema={"type": "object", "properties": {"analysis": {"type": "object"}}},
            required_permissions=["write_file"],
            integration_id="integ_local_desktop",
            risk="medium",
        ),
        ToolSpec(
            id="browser.navigate",
            name="Open website",
            description="Opens a website in a controlled Chromium session and returns page metadata.",
            category="browser",
            input_schema={"type": "object", "properties": {"url": {"type": "string"}}, "required": ["url"]},
            output_schema={"type": "object", "properties": {"url": {"type": "string"}, "title": {"type": "string"}}},
            required_permissions=["browser_control"],
            integration_id="integ_browser",
            risk="high",
            enabled=True,
        ),
        ToolSpec(
            id="browser.extract",
            name="Extract page text",
            description="Reads visible text from a website after navigating to it.",
            category="browser",
            input_schema={"type": "object", "properties": {"url": {"type": "string"}}, "required": ["url"]},
            output_schema={"type": "object", "properties": {"title": {"type": "string"}, "text": {"type": "string"}}},
            required_permissions=["browser_control", "network_access"],
            integration_id="integ_browser",
            risk="medium",
            enabled=True,
        ),
        ToolSpec(
            id="browser.screenshot",
            name="Capture browser screenshot",
            description="Captures a screenshot of a website in a temporary Chromium session.",
            category="browser",
            input_schema={"type": "object", "properties": {"url": {"type": "string"}}, "required": ["url"]},
            output_schema={"type": "object", "properties": {"download_path": {"type": "string"}}},
            required_permissions=["browser_control", "network_access"],
            integration_id="integ_browser",
            risk="medium",
            enabled=True,
        ),
        ToolSpec(
            id="mcp.call_tool",
            name="Call MCP tool",
            description="Registered but disabled. Newly discovered MCP tools are not executed automatically.",
            category="mcp",
            input_schema={"type": "object", "properties": {"server_id": {"type": "string"}, "tool_name": {"type": "string"}}},
            output_schema={"type": "object"},
            required_permissions=["mcp_execution"],
            integration_id="integ_mcp_servers",
            risk="high",
            enabled=False,
        ),
    ]


TOOLS: dict[str, ToolSpec] = {spec.id: spec for spec in _specs()}

_EXECUTORS: dict[str, Callable[[dict[str, Any]], Any]] = {
    "fs.list_directory": lambda args: list_directory(str(args.get("path") or "")),
    "fs.read_text": lambda args: read_text(str(args.get("path") or "")),
    "fs.write_text": lambda args: write_text(str(args.get("path") or ""), str(args.get("text") or "")),
    "doc.generate_docx": lambda args: generate_document("docx", args),
    "doc.generate_pptx": lambda args: generate_document("pptx", args),
    "doc.generate_pdf": lambda args: generate_document("pdf", args),
    "doc.analyze_xlsx": lambda args: _analyze_and_write(args),
    "browser.navigate": lambda args: _browser_page(args),
    "browser.extract": lambda args: _browser_page(args),
    "browser.screenshot": lambda args: _browser_screenshot(args),
}


def list_tools() -> list[ToolSpec]:
    return list(TOOLS.values())


def get_tool(tool_id: str) -> ToolSpec | None:
    return TOOLS.get(tool_id)


async def execute_tool(tool_id: str, arguments: dict[str, Any] | None, granted_permissions: list[str] | None) -> dict[str, Any]:
    spec = TOOLS.get(tool_id)
    if spec is None:
        raise KeyError(tool_id)
    granted = set(granted_permissions or [])
    missing = [permission for permission in spec.required_permissions if permission not in granted]
    if missing:
        raise ToolPermissionError(missing)
    if not spec.enabled:
        return {
            "status": "disabled",
            "tool_id": tool_id,
            "message": spec.description,
        }
    try:
        result = _EXECUTORS[tool_id](arguments or {})
        if inspect.isawaitable(result):
            result = await result
    except (FilesystemScopeError, DocumentGenerationError) as exc:
        return {"status": "error", "tool_id": tool_id, "message": str(exc)}
    return {"status": "success", "tool_id": tool_id, "result": result}


def _browser_url(arguments: dict[str, Any]) -> str:
    url = str(arguments.get("url") or "").strip()
    if not (url.startswith("http://") or url.startswith("https://")):
        raise DocumentGenerationError("Enter a complete browser URL beginning with http:// or https://.")
    return url


async def _browser_page(arguments: dict[str, Any]) -> dict[str, Any]:
    url = _browser_url(arguments)
    try:
        from playwright.async_api import async_playwright
        async with async_playwright() as playwright:
            browser = await playwright.chromium.launch(headless=True)
            try:
                page = await browser.new_page(viewport={"width": 1280, "height": 800})
                await page.goto(url, timeout=20_000, wait_until="domcontentloaded")
                title = await page.title()
                text = await page.evaluate("() => document.body ? document.body.innerText.slice(0, 12000) : ''")
                return {"url": page.url, "title": title, "text": text}
            finally:
                await browser.close()
    except Exception as exc:
        raise DocumentGenerationError(f"Browser action could not be completed: {exc}") from exc


async def _browser_screenshot(arguments: dict[str, Any]) -> dict[str, Any]:
    data = await _browser_page(arguments)
    url = str(data["url"])
    try:
        from playwright.async_api import async_playwright
        import uuid
        root = sandbox_root()
        filename = f"browser-{uuid.uuid4().hex[:10]}.png"
        target = root / filename
        async with async_playwright() as playwright:
            browser = await playwright.chromium.launch(headless=True)
            try:
                page = await browser.new_page(viewport={"width": 1280, "height": 800})
                await page.goto(url, timeout=20_000, wait_until="domcontentloaded")
                await page.screenshot(path=str(target), full_page=True)
            finally:
                await browser.close()
        return {"download_path": f"/api/artifacts/{filename}", "filename": filename, "url": url, "title": data["title"]}
    except Exception as exc:
        raise DocumentGenerationError(f"Screenshot could not be captured: {exc}") from exc


def _analyze_and_write(arguments: dict[str, Any]) -> dict[str, Any]:
    rows = arguments.get("rows")
    if not isinstance(rows, list):
        raise DocumentGenerationError("rows must be a list of rows.")
    analysis = analyze_rows(rows)
    artifact = generate_document("xlsx", arguments)
    artifact["analysis"] = analysis
    return artifact
