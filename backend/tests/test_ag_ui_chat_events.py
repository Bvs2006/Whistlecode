import pytest
from httpx import AsyncClient, ASGITransport
from app.main import app
from app.ag_ui.models import (
    AgUiEventType,
    AgUiStatusEvent,
    AgUiCapabilityResultEvent,
    AgUiPlanEvent,
    AgUiInputRequestEvent,
    AgUiApprovalRequestEvent,
    AgUiStepUpdateEvent,
    AgUiVerificationEvent,
    AgUiResultEvent,
    AgUiErrorEvent,
)
from app.capabilities.models import TaskRepresentation, TargetHints
from app.capabilities.router import RoutingResult, RoutingDecisionType


@pytest.mark.asyncio
async def test_typed_ag_ui_models_instantiation():
    """Verify all 9 typed AG-UI events can be instantiated, serialized, and adhere to strict schemas."""
    # 1. status
    status_evt = AgUiStatusEvent(run_id="run_1", phase="understanding_request", message="Analyzing task")
    assert status_evt.type == AgUiEventType.STATUS
    assert status_evt.phase == "understanding_request"

    # 2. capability_result
    cap_evt = AgUiCapabilityResultEvent(
        run_id="run_1",
        outcome="NEEDS_RECORDING",
        severity="amber",
        reason="No matching workflow found",
        surface="browser",
        surface_confidence=0.95
    )
    assert cap_evt.type == AgUiEventType.CAPABILITY_RESULT
    assert cap_evt.severity == "amber"

    # 3. plan
    plan_evt = AgUiPlanEvent(
        run_id="run_1",
        workflow_id="wf_123",
        title="Test Workflow",
        summary="A test workflow plan",
        steps=[{"id": "s1", "action": "click", "risk": "low"}],
        allowed_origins=["https://example.com"],
        risk="low",
        sensitive_step_ids=[]
    )
    assert plan_evt.type == AgUiEventType.PLAN
    assert plan_evt.workflow_id == "wf_123"

    # 4. input_request
    input_evt = AgUiInputRequestEvent(
        run_id="run_1",
        request_id="clarify_surface",
        kind="surface_choice",
        question="Which environment should this automation run on?",
        options=["Web Browser", "Desktop Application"],
        surface_options=[
            {"surface": "browser", "label": "Web Browser", "description": "Automate website", "available": True},
            {"surface": "desktop", "label": "Desktop Application", "description": "Native OS", "available": False}
        ]
    )
    assert input_evt.type == AgUiEventType.INPUT_REQUEST
    assert len(input_evt.options) == 2

    # 5. approval_request
    appr_evt = AgUiApprovalRequestEvent(
        run_id="run_1",
        approval_id="appr_456",
        workflow_id="wf_123",
        version=1,
        content_hash="abc123hash",
        allowed_origins=["https://example.com"],
        sensitive_actions=[{"action": "submit", "target": "Submit Button"}]
    )
    assert appr_evt.type == AgUiEventType.APPROVAL_REQUEST

    # 6. step_update
    step_evt = AgUiStepUpdateEvent(
        run_id="run_1",
        step_id="s1",
        step_index=0,
        total_steps=1,
        action="click",
        target_name="Submit Button",
        status="running"
    )
    assert step_evt.type == AgUiEventType.STEP_UPDATE
    assert step_evt.status == "running"

    # 7. verification
    ver_evt = AgUiVerificationEvent(
        run_id="run_1",
        verification_state="VERIFIED_SUCCESS",
        passed=True,
        postconditions=[{"type": "element_visible", "passed": True}]
    )
    assert ver_evt.type == AgUiEventType.VERIFICATION
    assert ver_evt.passed is True

    # 8. result
    res_evt = AgUiResultEvent(
        run_id="run_1",
        success=True,
        summary="Run completed and verified successfully"
    )
    assert res_evt.type == AgUiEventType.RESULT

    # 9. error (Rule 3: never fake success, failures never use success styling)
    err_evt = AgUiErrorEvent(
        run_id="run_1",
        error_code="TARGET_NOT_FOUND",
        message="Element not found on page",
        recovery_suggestion="Re-record or update target selector",
        is_success=False
    )
    assert err_evt.type == AgUiEventType.ERROR
    assert err_evt.is_success is False


@pytest.mark.asyncio
async def test_chat_events_endpoint_unsupported_task(monkeypatch):
    """Verify UNSUPPORTED route outcome emits severity=red capability_result and error card events."""
    mock_rep = TaskRepresentation(
        intent="Bypass MFA protection",
        category="general",
        operations=["bypass_mfa"],
        required_tools=[],
        inputs={},
        expected_output="Bypass complete",
        permissions=[],
        surfaces=["browser"],
        target_hints=TargetHints(),
        surface_confidence=0.9
    )
    mock_routing = RoutingResult(
        decision=RoutingDecisionType.UNSUPPORTED,
        reason="WhistleCode safety policy prohibits bypassing MFA or authentication challenges.",
        confidence=1.0,
        surface="browser"
    )

    async def mock_understand(goal):
        return mock_rep

    async def mock_route(rep):
        return mock_routing

    monkeypatch.setattr("app.capabilities.task_understanding.understand_task", mock_understand)
    monkeypatch.setattr("app.capabilities.router.capability_router.route", mock_route)

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        resp = await client.post("/api/ag-ui/chat-events", json={"goal": "Bypass my bank MFA"})
        assert resp.status_code == 200
        data = resp.json()
        assert data["status"] == "unsupported"
        events = data["events"]
        assert len(events) >= 2

        # Check capability_result event
        cap_events = [e for e in events if e.get("type") == "capability_result"]
        assert len(cap_events) == 1
        assert cap_events[0]["outcome"] == "UNSUPPORTED"
        assert cap_events[0]["severity"] == "red"

        # Check error event (never success styling)
        err_events = [e for e in events if e.get("type") == "error"]
        assert len(err_events) == 1
        assert err_events[0]["is_success"] is False
        assert "MFA" in err_events[0]["message"]


@pytest.mark.asyncio
async def test_chat_events_endpoint_needs_recording(monkeypatch):
    """Verify NEEDS_RECORDING route outcome emits amber capability_result and surface details."""
    mock_rep = TaskRepresentation(
        intent="Fill out custom invoice portal",
        category="general",
        operations=["fill_form"],
        required_tools=[],
        inputs={},
        expected_output="Invoice submitted",
        permissions=[],
        surfaces=["browser"],
        target_hints=TargetHints(urls=["https://invoices.acme.com"]),
        surface_confidence=0.88
    )
    mock_routing = RoutingResult(
        decision=RoutingDecisionType.NEEDS_RECORDING,
        reason="No existing skill or tool found for this workflow.",
        confidence=0.88,
        surface="browser"
    )

    async def mock_understand(goal):
        return mock_rep

    async def mock_route(rep):
        return mock_routing

    monkeypatch.setattr("app.capabilities.task_understanding.understand_task", mock_understand)
    monkeypatch.setattr("app.capabilities.router.capability_router.route", mock_route)

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        resp = await client.post("/api/ag-ui/chat-events", json={"goal": "Fill custom invoice on https://invoices.acme.com"})
        assert resp.status_code == 200
        data = resp.json()
        assert data["status"] == "needs_recording"
        events = data["events"]

        cap_events = [e for e in events if e.get("type") == "capability_result"]
        assert len(cap_events) == 1
        assert cap_events[0]["outcome"] == "NEEDS_RECORDING"
        assert cap_events[0]["severity"] == "amber"
        assert cap_events[0]["surface"] == "browser"


@pytest.mark.asyncio
async def test_chat_events_endpoint_clarify_surface(monkeypatch):
    """Verify CLARIFY_SURFACE route outcome emits amber capability_result and input_request."""
    mock_rep = TaskRepresentation(
        intent="Open calculator",
        category="general",
        operations=["open"],
        required_tools=[],
        inputs={},
        expected_output="Calculated result",
        permissions=[],
        surfaces=["desktop", "browser"],
        target_hints=TargetHints(),
        surface_confidence=0.5
    )
    mock_routing = RoutingResult(
        decision=RoutingDecisionType.CLARIFY_SURFACE,
        reason="Target application surface is ambiguous between web and native desktop.",
        confidence=0.5,
        clarification_options=["Web Browser", "Desktop Application"]
    )

    async def mock_understand(goal):
        return mock_rep

    async def mock_route(rep):
        return mock_routing

    monkeypatch.setattr("app.capabilities.task_understanding.understand_task", mock_understand)
    monkeypatch.setattr("app.capabilities.router.capability_router.route", mock_route)

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        resp = await client.post("/api/ag-ui/chat-events", json={"goal": "Open calculator and compute totals"})
        assert resp.status_code == 200
        data = resp.json()
        assert data["status"] == "clarification_needed"
        events = data["events"]

        input_events = [e for e in events if e.get("type") == "input_request"]
        assert len(input_events) == 1
        assert input_events[0]["kind"] == "surface_choice"
        assert "Web Browser" in input_events[0]["options"]
        assert "Desktop Application" in input_events[0]["options"]
