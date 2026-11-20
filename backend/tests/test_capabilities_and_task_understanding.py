import pytest
import json
from typing import Dict, Any, List, Optional, AsyncGenerator
from fastapi.testclient import TestClient
from backend.app.main import app
from backend.app.capabilities.models import Capability, TaskRepresentation, TaskInput, TargetHints
from backend.app.capabilities.registry import CapabilityRegistry, capability_registry
from backend.app.capabilities.task_understanding import understand_task
from backend.app.integrations.ai_providers import BaseAIProvider


class MockDeterministicAIProvider(BaseAIProvider):
    """Deterministic mock provider simulating structured LLM output for task understanding."""

    def __init__(self):
        super().__init__("Mock Deterministic Provider")

    async def generate_text(
        self,
        messages: List[Dict[str, str]],
        temperature: float = 0.2,
        max_tokens: int = 2048,
        response_format: Optional[str] = None,
    ) -> str:
        user_msg = next((m["content"] for m in reversed(messages) if m["role"] == "user"), "")

        # 1. Web Portal Login
        if "portal.example.com" in user_msg:
            return json.dumps({
                "intent": "Log in to portal and check invoices",
                "category": "browser_navigation",
                "operations": ["navigate", "type", "click", "assert"],
                "required_tools": ["playwright_browser"],
                "inputs": {
                    "username": {"name": "username", "type": "string", "value": "admin", "is_missing": False},
                    "password": {"name": "password", "type": "string", "value": None, "is_missing": True, "description": "User password"}
                },
                "expected_output": "User logged in and invoice list displayed",
                "permissions": ["network_access", "browser_control"],
                "surfaces": ["browser"],
                "target_hints": {
                    "urls": ["https://portal.example.com"],
                    "app_names": [],
                    "paths": []
                },
                "surface_confidence": 0.98
            })

        # 2. Product Price Extraction
        if "store.test/products" in user_msg:
            return json.dumps({
                "intent": "Extract price of item #5 from store",
                "category": "data_extraction",
                "operations": ["navigate", "extract"],
                "required_tools": ["playwright_browser"],
                "inputs": {
                    "item_id": {"name": "item_id", "type": "string", "value": "#5", "is_missing": False}
                },
                "expected_output": "Price string of item #5",
                "permissions": ["network_access", "browser_control"],
                "surfaces": ["browser"],
                "target_hints": {
                    "urls": ["https://store.test/products"],
                    "app_names": [],
                    "paths": []
                },
                "surface_confidence": 0.95
            })

        # 3. Desktop Calculator
        if "Calculator" in user_msg:
            return json.dumps({
                "intent": "Perform arithmetic multiplication in Calculator",
                "category": "desktop_ui",
                "operations": ["click", "type"],
                "required_tools": ["desktop_driver"],
                "inputs": {
                    "expression": {"name": "expression", "type": "string", "value": "45 * 12", "is_missing": False}
                },
                "expected_output": "Calculation result displayed on screen",
                "permissions": ["desktop_control"],
                "surfaces": ["desktop"],
                "target_hints": {
                    "urls": [],
                    "app_names": ["Calculator"],
                    "paths": []
                },
                "surface_confidence": 0.99
            })

        # 4. Local CSV Report
        if "sales.csv" in user_msg:
            return json.dumps({
                "intent": "Summarize revenue from local sales CSV",
                "category": "document_processing",
                "operations": ["read", "extract"],
                "required_tools": ["filesystem"],
                "inputs": {
                    "file_path": {"name": "file_path", "type": "string", "value": "/sandbox/sales.csv", "is_missing": False}
                },
                "expected_output": "Total revenue summary",
                "permissions": ["read_file"],
                "surfaces": ["file"],
                "target_hints": {
                    "urls": [],
                    "app_names": [],
                    "paths": ["/sandbox/sales.csv"]
                },
                "surface_confidence": 0.96
            })

        # 5. Customer Feedback Form (missing email)
        if "survey.site/q1" in user_msg:
            return json.dumps({
                "intent": "Submit customer feedback form",
                "category": "form_filling",
                "operations": ["navigate", "type", "submit"],
                "required_tools": ["playwright_browser"],
                "inputs": {
                    "feedback": {"name": "feedback", "type": "string", "value": "Great service", "is_missing": False},
                    "email": {"name": "email", "type": "string", "value": None, "is_missing": True, "description": "Customer contact email"}
                },
                "expected_output": "Form submitted confirmation message",
                "permissions": ["network_access", "browser_control"],
                "surfaces": ["browser"],
                "target_hints": {
                    "urls": ["https://survey.site/q1"],
                    "app_names": [],
                    "paths": []
                },
                "surface_confidence": 0.95
            })

        # 6. Email Classification
        if "support tickets" in user_msg or "inbox" in user_msg:
            return json.dumps({
                "intent": "Classify incoming support tickets by urgency",
                "category": "general",
                "operations": ["read", "classify"],
                "required_tools": ["llm_classifier"],
                "inputs": {
                    "inbox_folder": {"name": "inbox_folder", "type": "string", "value": "inbox", "is_missing": False}
                },
                "expected_output": "Tagged tickets with categories and priority",
                "permissions": ["read_email"],
                "surfaces": ["browser", "file"],
                "target_hints": {
                    "urls": [],
                    "app_names": [],
                    "paths": []
                },
                "surface_confidence": 0.85
            })

        # 7. Desktop Notepad Text Writing
        if "Notepad.exe" in user_msg or "Notepad" in user_msg:
            return json.dumps({
                "intent": "Open Notepad and record meeting notes",
                "category": "desktop_ui",
                "operations": ["launch", "type", "save"],
                "required_tools": ["desktop_driver"],
                "inputs": {
                    "notes_content": {"name": "notes_content", "type": "string", "value": "Meeting Notes", "is_missing": False}
                },
                "expected_output": "Notes written inside active Notepad window",
                "permissions": ["desktop_control"],
                "surfaces": ["desktop"],
                "target_hints": {
                    "urls": [],
                    "app_names": ["Notepad.exe"],
                    "paths": []
                },
                "surface_confidence": 0.99
            })

        # 8. Web to File Export
        if "admin.internal" in user_msg:
            return json.dumps({
                "intent": "Scrape user table and save to JSON",
                "category": "data_extraction",
                "operations": ["navigate", "extract", "write"],
                "required_tools": ["playwright_browser", "filesystem"],
                "inputs": {
                    "destination": {"name": "destination", "type": "string", "value": "/sandbox/users.json", "is_missing": False}
                },
                "expected_output": "Structured users JSON saved on disk",
                "permissions": ["network_access", "browser_control", "write_file"],
                "surfaces": ["browser", "file"],
                "target_hints": {
                    "urls": ["https://admin.internal"],
                    "app_names": [],
                    "paths": ["/sandbox/users.json"]
                },
                "surface_confidence": 0.94
            })

        # 9. Invoice PDF Extraction
        if "inv_101.pdf" in user_msg:
            return json.dumps({
                "intent": "Extract vendor name and total from invoice PDF",
                "category": "document_processing",
                "operations": ["read", "extract"],
                "required_tools": ["pdf_reader"],
                "inputs": {
                    "pdf_path": {"name": "pdf_path", "type": "string", "value": "/sandbox/invoices/inv_101.pdf", "is_missing": False}
                },
                "expected_output": "Extracted vendor name and numeric total amount",
                "permissions": ["read_file"],
                "surfaces": ["file"],
                "target_hints": {
                    "urls": [],
                    "app_names": [],
                    "paths": ["/sandbox/invoices/inv_101.pdf"]
                },
                "surface_confidence": 0.97
            })

        # 10. Search and Extract Documentation
        if "docs.whistlecode.org" in user_msg:
            return json.dumps({
                "intent": "Search WhistleCode documentation for driver registry",
                "category": "browser_navigation",
                "operations": ["navigate", "type", "click", "extract"],
                "required_tools": ["playwright_browser"],
                "inputs": {
                    "search_query": {"name": "search_query", "type": "string", "value": "driver registry", "is_missing": False}
                },
                "expected_output": "Extracted documentation snippet",
                "permissions": ["network_access", "browser_control"],
                "surfaces": ["browser"],
                "target_hints": {
                    "urls": ["https://docs.whistlecode.org"],
                    "app_names": [],
                    "paths": []
                },
                "surface_confidence": 0.98
            })

        # Default fallback
        return json.dumps({
            "intent": "Generic automation task",
            "category": "general",
            "operations": ["execute"],
            "required_tools": [],
            "inputs": {},
            "expected_output": "Task completed",
            "permissions": [],
            "surfaces": ["browser"],
            "target_hints": {"urls": [], "app_names": [], "paths": []},
            "surface_confidence": 0.70
        })

    async def stream_text(self, messages: List[Dict[str, str]], temperature: float = 0.4) -> AsyncGenerator[str, None]:
        text = await self.generate_text(messages)
        yield text

    async def test_connection(self) -> Dict[str, Any]:
        return {"status": "connected"}


@pytest.mark.asyncio
async def test_10_sample_prompts_produce_valid_task_representation():
    """Step 3 Test: 10 sample prompts parse into valid TaskRepresentation (using deterministic mock)."""
    mock_provider = MockDeterministicAIProvider()

    prompts = [
        # 1. Browser Login
        "Log in to https://portal.example.com with user admin and check recent invoices",
        # 2. Browser Extraction
        "Go to https://store.test/products and extract the price of item #5",
        # 3. Desktop App
        "Open Calculator app and compute 45 * 12",
        # 4. Local File Summary
        "Read /sandbox/sales.csv and summarize total revenue",
        # 5. Form filling with missing field
        "Submit the customer feedback form at https://survey.site/q1 without email",
        # 6. Email classification
        "Classify incoming customer support tickets in inbox by urgency",
        # 7. Desktop Notepad
        "Open Notepad.exe and write meeting notes",
        # 8. Multi-surface Web to File
        "Scrape user table from https://admin.internal and save to /sandbox/users.json",
        # 9. Invoice PDF
        "Extract total and vendor name from /sandbox/invoices/inv_101.pdf",
        # 10. Documentation search
        "Search https://docs.whistlecode.org for 'driver registry' and extract snippet"
    ]

    assert len(prompts) == 10

    for idx, prompt in enumerate(prompts):
        task_rep = await understand_task(prompt, ai_provider=mock_provider)
        assert isinstance(task_rep, TaskRepresentation)
        assert task_rep.intent, f"Prompt {idx+1} must have an intent"
        assert task_rep.category, f"Prompt {idx+1} must have a category"
        assert len(task_rep.operations) > 0, f"Prompt {idx+1} must specify operations"
        assert len(task_rep.surfaces) > 0, f"Prompt {idx+1} must specify at least one surface"
        assert 0.0 <= task_rep.surface_confidence <= 1.0

        # Verify specific expectations per prompt
        if "portal.example.com" in prompt:
            assert "browser" in task_rep.surfaces
            assert "https://portal.example.com" in task_rep.target_hints.urls
            assert task_rep.inputs["password"].is_missing is True
        elif "Calculator" in prompt:
            assert "desktop" in task_rep.surfaces
            assert "Calculator" in task_rep.target_hints.app_names
        elif "sales.csv" in prompt:
            assert "file" in task_rep.surfaces
            assert "/sandbox/sales.csv" in task_rep.target_hints.paths
        elif "survey.site" in prompt:
            assert task_rep.inputs["email"].is_missing is True
        elif "admin.internal" in prompt:
            assert "browser" in task_rep.surfaces
            assert "file" in task_rep.surfaces


@pytest.mark.asyncio
async def test_task_understanding_repair_retry():
    """Verifies that bounded validation retries succeed if the first attempt returns markdown/malformed JSON."""
    class FlakyProvider(BaseAIProvider):
        def __init__(self):
            super().__init__("Flaky")
            self.attempts = 0

        async def generate_text(self, messages, temperature=0.1, max_tokens=2048, response_format=None):
            self.attempts += 1
            if self.attempts == 1:
                # First attempt: invalid JSON
                return "```json\n{ invalid: json syntax\n```"
            # Second attempt: valid JSON
            return json.dumps({
                "intent": "Repaired task understanding",
                "category": "browser_navigation",
                "operations": ["navigate"],
                "required_tools": ["playwright_browser"],
                "inputs": {},
                "expected_output": "Success",
                "permissions": ["network_access"],
                "surfaces": ["browser"],
                "target_hints": {"urls": ["https://example.com"], "app_names": [], "paths": []},
                "surface_confidence": 0.9
            })

        async def stream_text(self, messages, temperature=0.4):
            yield ""

        async def test_connection(self):
            return {"status": "connected"}

    flaky = FlakyProvider()
    res = await understand_task("Navigate to https://example.com", ai_provider=flaky, max_retries=2)
    assert isinstance(res, TaskRepresentation)
    assert res.intent == "Repaired task understanding"
    assert flaky.attempts == 2


@pytest.mark.asyncio
async def test_empty_prompt_raises_error():
    with pytest.raises(ValueError, match="Cannot understand empty prompt"):
        await understand_task("   ")


def test_get_capabilities_api_endpoint():
    """Done when: GET /api/capabilities lists everything with status."""
    client = TestClient(app)
    response = client.get("/api/capabilities")
    assert response.status_code == 200

    data = response.json()
    assert "capabilities" in data
    assert "count" in data
    capabilities = data["capabilities"]
    assert len(capabilities) > 0

    sources = {c["source"] for c in capabilities}
    assert "driver" in sources
    assert "tool" in sources

    # Check driver capabilities and health checks
    driver_caps = {c["id"]: c for c in capabilities if c["source"] == "driver"}
    assert "driver:browser" in driver_caps
    assert driver_caps["driver:browser"]["status"] in ("available", "unavailable")
    assert "driver:desktop" in driver_caps
    assert driver_caps["driver:desktop"]["status"] == "unavailable"  # DesktopDriver stub
    assert "driver:file" in driver_caps
    assert driver_caps["driver:file"]["status"] == "available"

    # Filter by surface query param
    browser_resp = client.get("/api/capabilities?surface=browser")
    assert browser_resp.status_code == 200
    for c in browser_resp.json()["capabilities"]:
        assert c["surface"] == "browser"
