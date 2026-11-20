import pytest
import datetime
import json
from backend.app.models.workflow import (
    WorkflowDefinition,
    Step,
    ActionType,
    RiskLevel,
    SurfaceType,
    TargetDescriptor,
    TargetCandidate,
    AllowedScope,
    Postcondition,
    ParameterDefinition,
)
from backend.app.models.events import RecordedEvent, EventType, NormalizedRecorderEvent
from backend.app.models.approval import ApprovalRecord, ApprovalScope
from backend.app.models.run import ExecutionState, VerificationState
from backend.app.drivers.base import BaseDriver, DriverHealth
from backend.app.drivers.registry import DriverRegistry
from backend.app.drivers.browser import BrowserDriver
from backend.app.drivers.desktop import DesktopDriver
from backend.app.drivers.file import FileDriver
from backend.app.executor.state_machine import WorkflowExecutor
from backend.app.approval.service import ApprovalService
from backend.app.policy.engine import PolicyEngine


def test_step_surface_default_and_backward_compatibility():
    """1. Add surface ('browser'|'desktop'|'file') to step, default 'browser', load old JSON."""
    # Default is browser
    step = Step(id="s1", name="Navigate", action=ActionType.NAVIGATE)
    assert step.surface == SurfaceType.BROWSER
    assert step.surface.value == "browser"

    # Migration / loading legacy workflow dict without surface field
    legacy_json = """
    {
        "id": "s_old",
        "name": "Legacy Click",
        "action": "click",
        "args": {}
    }
    """
    loaded_step = Step.model_validate_json(legacy_json)
    assert loaded_step.surface == SurfaceType.BROWSER

    # Explicit desktop and file surfaces
    desktop_step = Step(id="s_desk", name="Open calc", action=ActionType.CLICK, surface=SurfaceType.DESKTOP)
    assert desktop_step.surface == SurfaceType.DESKTOP

    file_step = Step(id="s_file", name="Read doc", action=ActionType.EXTRACT, surface=SurfaceType.FILE)
    assert file_step.surface == SurfaceType.FILE


def test_target_ranked_candidates_derivation():
    """3. Step targets become a ranked list [{strategy, value, confidence}]."""
    target = TargetDescriptor(
        test_id="login-btn",
        role="button",
        name="Log In",
        label="Submit credentials",
        text="Log In",
        css_fallback="button.primary"
    )
    candidates = target.get_ranked_candidates()
    assert len(candidates) >= 4
    # Ensure ordered by confidence
    for i in range(len(candidates) - 1):
        assert candidates[i].confidence >= candidates[i + 1].confidence

    strategies = [c.strategy for c in candidates]
    assert strategies[0] == "test_id"
    assert "role_name" in strategies
    assert "label" in strategies
    assert "text" in strategies
    assert "css" in strategies

    # Step level candidate resolution
    step = Step(
        id="s1",
        name="Click button",
        action=ActionType.CLICK,
        target=target
    )
    step_candidates = step.get_target_candidates()
    assert len(step_candidates) == len(candidates)


def test_allowed_scope_generalization():
    """4. Generalize origin scoping to an allowed-scope object {domains, apps, folders}."""
    scope = AllowedScope(
        domains=["http://localhost:8000", "https://app.example.com"],
        apps=["notepad.exe", "calc.exe"],
        folders=["C:/sandbox", "C:/data"]
    )
    assert "http://localhost:8000" in scope.domains
    assert "notepad.exe" in scope.apps
    assert "C:/sandbox" in scope.folders

    # WorkflowDefinition effective scope
    wf = WorkflowDefinition(
        workflow_id="wf_scope_test",
        title="Scoped Workflow",
        intent="Test generalized scope",
        allowed_origins=["http://localhost:8000"],
        allowed_scope=scope,
        steps=[Step(id="s1", name="Nav", action=ActionType.NAVIGATE)]
    )
    eff = wf.get_effective_scope()
    assert "http://localhost:8000" in eff.domains
    assert "https://app.example.com" in eff.domains
    assert "calc.exe" in eff.apps

    # PolicyEngine checks
    engine = PolicyEngine()
    # Domains check
    assert engine.is_scope_allowed("http://localhost:8000/login", surface="browser", declared_scope=scope) is True
    assert engine.is_scope_allowed("https://evil.com", surface="browser", declared_scope=scope) is False
    # Apps check
    assert engine.is_scope_allowed("notepad.exe", surface="desktop", declared_scope=scope) is True
    assert engine.is_scope_allowed("malware.exe", surface="desktop", declared_scope=scope) is False
    # Folders check
    assert engine.is_scope_allowed("C:/sandbox/test.txt", surface="file", declared_scope=scope) is True


def test_driver_registry_and_desktop_driver_stub():
    """2 & 5. Driver registry keyed by surface, DesktopDriver reports health unavailable with reason."""
    registry = DriverRegistry()
    browser_driver = registry.get("browser")
    desktop_driver = registry.get("desktop")
    file_driver = registry.get("file")

    assert isinstance(browser_driver, BrowserDriver)
    assert isinstance(desktop_driver, DesktopDriver)
    assert isinstance(file_driver, FileDriver)
    assert registry.get("nonexistent") is None

    # Check DesktopDriver health stub
    import asyncio
    health = asyncio.run(desktop_driver.health())
    assert health.status == "unavailable"
    assert health.surface == "desktop"
    assert "Desktop automation is not yet available" in (health.reason or "")


@pytest.mark.asyncio
async def test_desktop_step_reports_capability_unavailable():
    """Done when: a desktop step reports 'capability unavailable' instead of crashing."""
    wf = WorkflowDefinition(
        workflow_id="wf_desktop_test",
        title="Desktop Automation Test",
        intent="Try desktop automation",
        allowed_origins=["http://localhost:8000"],
        steps=[
            Step(
                id="s_desk_1",
                name="Click Windows start button",
                action=ActionType.CLICK,
                surface=SurfaceType.DESKTOP,
                target=TargetDescriptor(name="Start", role="button")
            )
        ]
    )

    approval = ApprovalService.create_approval(wf, allowed_origins=["http://localhost:8000"])
    executor = WorkflowExecutor()

    run = await executor.execute_workflow(
        workflow=wf,
        parameters={},
        approval_id=approval.id,
        mode="run"
    )

    # Must report FAILED with 'capability unavailable' safely without crashing
    assert run.state == ExecutionState.FAILED
    assert "capability unavailable" in (run.safe_stop_reason or "").lower()
    assert len(run.step_results) == 1
    assert run.step_results[0].passed is False
    assert "capability unavailable" in (run.step_results[0].error_message or "").lower()


@pytest.mark.asyncio
async def test_saved_browser_workflow_runs_through_browser_driver():
    """Done when: a saved browser workflow still runs through BrowserDriver."""
    wf = WorkflowDefinition(
        workflow_id="wf_browser_driver_test",
        title="Browser Driver Run",
        intent="Run browser steps via BrowserDriver",
        allowed_origins=["http://localhost:8000"],
        parameters=[ParameterDefinition(name="query", type="string", default_value="whistlecode", required=True)],
        steps=[
            Step(
                id="s1",
                name="Navigate",
                action=ActionType.NAVIGATE,
                surface=SurfaceType.BROWSER,
                args={"url": "http://localhost:8000/testsite"},
                risk=RiskLevel.LOW
            ),
            Step(
                id="s2",
                name="Type Search",
                action=ActionType.TYPE,
                surface=SurfaceType.BROWSER,
                target_candidates=[
                    TargetCandidate(strategy="test_id", value="search-input", confidence=0.9),
                    TargetCandidate(strategy="css", value="#search-box", confidence=0.7)
                ],
                args={"value": "{{query}}"},
                risk=RiskLevel.LOW
            )
        ],
        final_postconditions=[
            Postcondition(type="url_matches", value="testsite")
        ]
    )

    executor = WorkflowExecutor()
    # Confirm executor driver registry contains browser driver
    assert isinstance(executor.driver_registry.get("browser"), BrowserDriver)

    run = await executor.execute_workflow(
        workflow=wf,
        parameters={"query": "agentic test"},
        mode="dry_run"
    )

    assert run.state == ExecutionState.SUCCESS
    assert run.verification_state == VerificationState.VERIFIED_SUCCESS
    assert len(run.step_results) == 2
    assert all(r.passed for r in run.step_results)


def test_normalized_recorder_event():
    """6. Define one normalized recorder event: {surface, action, target_candidates, value, redacted, timestamp}."""
    event = NormalizedRecorderEvent(
        surface="browser",
        action="click",
        target_candidates=[
            TargetCandidate(strategy="test_id", value="submit-btn", confidence=0.95),
            TargetCandidate(strategy="role_name", value={"role": "button", "name": "Submit"}, confidence=0.90)
        ],
        value=None,
        redacted=False,
        timestamp=1700000000.0
    )

    assert event.surface == "browser"
    assert event.action == "click"
    assert len(event.target_candidates) == 2
    assert event.redacted is False
    assert event.timestamp == 1700000000.0

    # Test conversion from RecordedEvent
    rec = RecordedEvent(
        id="evt_1",
        recording_id="rec_1",
        timestamp=1700000001.0,
        type=EventType.INPUT,
        url="http://localhost:8000/login",
        target=TargetDescriptor(name="username", role="textbox"),
        value="alice",
        is_masked=False
    )
    norm = rec.to_normalized()
    assert isinstance(norm, NormalizedRecorderEvent)
    assert norm.surface == "browser"
    assert norm.action == "input"
    assert norm.value == "alice"
    assert norm.redacted is False
    assert len(norm.target_candidates) > 0
