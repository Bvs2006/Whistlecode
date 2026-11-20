import pytest
import json
from fastapi.testclient import TestClient
from backend.app.main import app
from backend.app.capabilities.models import TaskRepresentation, TaskInput, TargetHints
from backend.app.capabilities.router import CapabilityRouter, RoutingDecisionType, RoutingResult
from backend.app.models.workflow import WorkflowDefinition, Step, ActionType
from backend.app.db.database import get_db_connection


@pytest.fixture
def sample_saved_workflow():
    wf_id = "wf_router_test_portal"
    wf = WorkflowDefinition(
        workflow_id=wf_id,
        title="Supplier Invoice Lookup",
        intent="Lookup supplier invoices on portal.example.com",
        allowed_origins=["https://portal.example.com"],
        steps=[
            Step(id="s1", name="Nav", action=ActionType.NAVIGATE, args={"url": "https://portal.example.com/invoices"})
        ]
    )
    with get_db_connection() as conn:
        conn.execute("INSERT OR REPLACE INTO workflows (id, title, intent, created_at) VALUES (?, ?, ?, ?)",
                     (wf.workflow_id, wf.title, wf.intent, "2026-11-19T00:00:00Z"))
        conn.execute("INSERT OR REPLACE INTO workflow_versions (id, workflow_id, version, content_hash, json_data, created_at) VALUES (?, ?, ?, ?, ?, ?)",
                     (f"{wf.workflow_id}_1", wf.workflow_id, 1, wf.compute_hash(), wf.model_dump_json(), "2026-11-19T00:00:00Z"))
    return wf


@pytest.mark.asyncio
async def test_scenario_1_existing_workflow(sample_saved_workflow):
    """Scenario 1: Matches saved workflow by description / target URL."""
    router = CapabilityRouter()
    task = TaskRepresentation(
        intent="Lookup supplier invoices on portal",
        category="browser_navigation",
        operations=["navigate", "extract"],
        required_tools=["playwright_browser"],
        surfaces=["browser"],
        target_hints=TargetHints(urls=["https://portal.example.com/invoices"]),
        expected_output="Invoice list",
        surface_confidence=0.95
    )

    result = await router.route(task)
    assert result.decision == RoutingDecisionType.EXISTING_WORKFLOW
    assert result.matched_workflow_id == sample_saved_workflow.workflow_id
    assert result.confidence >= 0.85


@pytest.mark.asyncio
async def test_scenario_2_composable_plan():
    """Scenario 2: Composable plan from local file / document tools."""
    router = CapabilityRouter()
    task = TaskRepresentation(
        intent="Read local customer report and summarize in markdown",
        category="document_processing",
        operations=["read", "summarize"],
        required_tools=["fs.read_text", "doc.generate"],
        surfaces=["file"],
        target_hints=TargetHints(paths=["/sandbox/customer_report.txt"]),
        expected_output="Formatted markdown summary",
        surface_confidence=0.98
    )

    result = await router.route(task)
    assert result.decision == RoutingDecisionType.COMPOSABLE_PLAN
    assert result.composed_plan is not None
    assert "tools" in result.composed_plan


@pytest.mark.asyncio
async def test_scenario_3_missing_integration():
    """Scenario 3: Task requires disconnected external integration (e.g. GitHub)."""
    router = CapabilityRouter()
    task = TaskRepresentation(
        intent="Fetch open issues from github repository",
        category="general",
        operations=["fetch"],
        required_tools=["github_api"],
        surfaces=["browser"],
        target_hints=TargetHints(),
        expected_output="Open issues list",
        surface_confidence=0.90
    )

    result = await router.route(task)
    assert result.decision == RoutingDecisionType.MISSING_INTEGRATION
    assert result.missing_integration_id == "integ_github"


@pytest.mark.asyncio
async def test_scenario_4_needs_recording():
    """Scenario 4: Unknown task on browser/desktop requires recording demonstration."""
    router = CapabilityRouter()
    task = TaskRepresentation(
        intent="Complete checkout and order confirmation on unknownshop.com",
        category="browser_navigation",
        operations=["navigate", "click", "type"],
        required_tools=["playwright_browser"],
        surfaces=["browser"],
        target_hints=TargetHints(urls=["https://unknownshop.com/cart"]),
        expected_output="Order placed confirmation",
        surface_confidence=0.92
    )

    result = await router.route(task)
    assert result.decision == RoutingDecisionType.NEEDS_RECORDING
    assert result.surface == "browser"
    assert "demonstrate" in result.reason.lower() or "recording" in result.reason.lower()


@pytest.mark.asyncio
async def test_scenario_5_clarify_surface():
    """Scenario 5: Ambiguous surface where surface_confidence < threshold."""
    router = CapabilityRouter()
    task = TaskRepresentation(
        intent="Process the incoming records",
        category="general",
        operations=["process"],
        required_tools=[],
        surfaces=["browser"],
        target_hints=TargetHints(),
        expected_output="Records processed",
        surface_confidence=0.60  # Below 0.75 threshold
    )

    result = await router.route(task)
    assert result.decision == RoutingDecisionType.CLARIFY_SURFACE
    assert len(result.clarification_options) > 0


@pytest.mark.asyncio
async def test_scenario_6_unsupported():
    """Scenario 6: Forbidden or security-violating task (e.g. bypass MFA or CAPTCHA)."""
    router = CapabilityRouter()
    task = TaskRepresentation(
        intent="Bypass MFA challenge and solve captcha on secure site",
        category="browser_navigation",
        operations=["bypass_mfa"],
        required_tools=[],
        surfaces=["browser"],
        target_hints=TargetHints(urls=["https://bank.example.com"]),
        expected_output="Bypassed login",
        surface_confidence=0.95
    )

    result = await router.route(task)
    assert result.decision == RoutingDecisionType.UNSUPPORTED
    assert "prohibits bypassing mfa" in result.reason.lower()


def test_ask_ai_propose_goal_routing_integration(sample_saved_workflow, monkeypatch):
    """Verifies that /api/ai/goal uses router and returns needs_recording for unknown task."""
    from unittest.mock import AsyncMock

    mock_unknown_task = TaskRepresentation(
        intent="Extract top items on newstore.xyz",
        category="browser_navigation",
        operations=["navigate", "extract"],
        required_tools=["playwright_browser"],
        surfaces=["browser"],
        target_hints=TargetHints(urls=["https://newstore.xyz"]),
        expected_output="Top items list",
        surface_confidence=0.92
    )

    mock_existing_task = TaskRepresentation(
        intent="Lookup supplier invoices on portal.example.com",
        category="browser_navigation",
        operations=["navigate", "extract"],
        required_tools=["playwright_browser"],
        surfaces=["browser"],
        target_hints=TargetHints(urls=["https://portal.example.com/invoices"]),
        expected_output="Invoices list",
        surface_confidence=0.95
    )

    async def mock_understand(prompt: str, **kwargs):
        if "portal.example.com" in prompt:
            return mock_existing_task
        return mock_unknown_task

    monkeypatch.setattr("backend.app.capabilities.task_understanding.understand_task", mock_understand)

    client = TestClient(app)

    # 1. Unknown browser task -> returns needs_recording
    resp = client.post("/api/ai/goal", json={
        "goal": "Go to https://newstore.xyz and extract the top items"
    })
    assert resp.status_code == 200
    data = resp.json()
    assert data["status"] == "needs_recording"
    assert data["surface"] == "browser"
    assert "Record browser task" in data["action_prompt"]

    # 2. Existing workflow match
    resp_existing = client.post("/api/ai/goal", json={
        "goal": "Lookup supplier invoices on portal.example.com"
    })
    assert resp_existing.status_code == 200
    data_existing = resp_existing.json()
    assert data_existing["status"] == "existing_workflow"
    assert data_existing["workflow"]["workflow_id"] == sample_saved_workflow.workflow_id

    # 3. Direct route endpoint test
    route_resp = client.post("/api/capabilities/route", json={
        "task": {
            "intent": "Bypass MFA and solve captcha",
            "category": "browser_navigation",
            "operations": ["bypass_mfa"],
            "required_tools": [],
            "inputs": {},
            "expected_output": "Bypass",
            "permissions": [],
            "surfaces": ["browser"],
            "target_hints": {"urls": [], "app_names": [], "paths": []},
            "surface_confidence": 0.95
        }
    })
    assert route_resp.status_code == 200
    route_data = route_resp.json()
    assert route_data["routing"]["decision"] == "UNSUPPORTED"
