import pytest
import asyncio
import uuid
from typing import Dict, Any, Tuple, Optional

from backend.app.models.workflow import (
    WorkflowDefinition, Step, ActionType, RiskLevel,
    TargetDescriptor, ParameterDefinition, Postcondition
)
from backend.app.models.run import VerificationState, ExecutionState
from backend.app.models.policy import ReasonCode
from backend.app.approval.service import ApprovalService
from backend.app.executor.state_machine import WorkflowExecutor
from backend.app.drivers.registry import DriverRegistry
from backend.app.drivers.base import BaseDriver, DriverHealth


class MockSurfaceDriver(BaseDriver):
    def __init__(self, surface_name: str = "browser"):
        super().__init__(surface=surface_name)
        self.act_call_count = 0
        self.fail_until_count = 0
        self.slow_delay = 0.0

    async def initialize(self) -> None:
        pass

    async def health(self) -> DriverHealth:
        return DriverHealth(status="available", surface="browser")

    async def find_target(self, step: Step, candidates=None):
        return {"element": "mock"}, None, None

    async def observe(self, query=None) -> Dict[str, Any]:
        return {"current_url": "http://localhost:8000/shop"}

    async def act(self, step: Step, parameters: Dict[str, Any]) -> Tuple[bool, Optional[str], Dict[str, Any]]:
        self.act_call_count += 1
        if self.slow_delay > 0:
            await asyncio.sleep(self.slow_delay)

        if self.act_call_count <= self.fail_until_count:
            return False, f"Simulated transient error on attempt {self.act_call_count}", {}

        return True, None, {"status": "success", "attempt": self.act_call_count}

    async def verify(self, conditions: list, parameters: Dict[str, Any]) -> Tuple[VerificationState, Dict[str, Any]]:
        return VerificationState.VERIFIED_SUCCESS, {"verified": True}

    async def capture_state(self) -> Dict[str, Any]:
        return {"screenshot": None, "state": "mock"}

    async def teardown(self) -> None:
        pass


def _make_workflow():
    wf_id = f"wf_chat_{uuid.uuid4().hex[:6]}"
    return WorkflowDefinition(
        workflow_id=wf_id,
        title="Chat Execution Workflow",
        intent="Test approval and execution from chat",
        allowed_origins=["http://localhost:8000"],
        parameters=[
            ParameterDefinition(name="item_name", type="string", default_value="Widget")
        ],
        steps=[
            Step(
                id="s1",
                name="Navigate to shop",
                action=ActionType.NAVIGATE,
                args={"url": "http://localhost:8000/shop"},
                risk=RiskLevel.LOW,
                idempotent=True
            ),
            Step(
                id="s2",
                name="Search Item",
                action=ActionType.TYPE,
                target=TargetDescriptor(name="Search Bar", role="searchbox"),
                args={"value": "{{item_name}}"},
                risk=RiskLevel.LOW,
                idempotent=True
            ),
        ],
        final_postconditions=[
            Postcondition(type="url_matches", value="localhost:8000/shop")
        ],
        version=1,
        content_hash="sha256:init",
    )


@pytest.fixture
def test_workflow():
    return _make_workflow()


@pytest.mark.asyncio
async def test_approve_and_run_hmac_and_verification_checklist(test_workflow):
    """
    Step 6: "Approve & run" signs plan hash via HMAC, runs through state machine,
    and populates verification checklist card items with pass/fail.
    """
    # 1. Sign plan hash via HMAC approval
    approval = ApprovalService.create_approval(
        test_workflow,
        allowed_origins=["http://localhost:8000"],
        duration_days=30
    )
    assert approval.id.startswith("appr_")
    assert approval.version_hash == test_workflow.compute_hash()

    # 2. Execute via WorkflowExecutor with mock driver
    mock_driver = MockSurfaceDriver()
    registry = DriverRegistry()
    registry.register("browser", mock_driver)

    executor = WorkflowExecutor(driver_registry=registry)
    run = await executor.execute_workflow(
        workflow=test_workflow,
        parameters={"item_name": "Antigravity Kit"},
        approval_id=approval.id,
        mode="run"
    )

    # 3. Verify terminal status and checklist
    assert run.state == ExecutionState.SUCCESS
    assert run.verification_state == VerificationState.VERIFIED_SUCCESS
    assert len(run.step_results) == 2
    assert all(r.passed for r in run.step_results)

    # Verification checklist must have postconditions recorded
    assert len(run.verification_checklist) == 1
    item = run.verification_checklist[0]
    assert item["type"] == "url_matches"
    assert item["passed"] is True
    assert "PASSED" in item["details"]


@pytest.mark.asyncio
async def test_plan_tampering_invalidates_approval(test_workflow):
    """
    Step 6: If plan changes after approval, approval is invalidated
    and execution halts immediately with APPROVAL_HASH_MISMATCH.
    """
    # 1. Sign original workflow
    approval = ApprovalService.create_approval(test_workflow, allowed_origins=["http://localhost:8000"])

    # 2. Tamper with the plan (modify step action or target)
    tampered_workflow = test_workflow.model_copy(deep=True)
    tampered_workflow.steps[1].args["value"] = "Tampered Payload"

    # 3. Attempt execution with the previous approval ID
    executor = WorkflowExecutor()
    run = await executor.execute_workflow(
        workflow=tampered_workflow,
        parameters={},
        approval_id=approval.id,
        mode="run"
    )

    # 4. State machine must safe-stop and reject execution
    assert run.state == ExecutionState.STOPPED
    assert run.verification_state == VerificationState.FAILED
    assert ReasonCode.APPROVAL_HASH_MISMATCH.value in run.safe_stop_reason


@pytest.mark.asyncio
async def test_sensitive_step_confirmation_gate(test_workflow):
    """
    Step 6: Sensitive steps pause with an interactive approval card showing exact target.
    Deny halts execution; grant allows it to proceed.
    """
    # Add a sensitive step requiring confirmation
    test_workflow.steps.append(
        Step(
            id="s3",
            name="Delete Cart",
            action=ActionType.CLICK,
            target=TargetDescriptor(name="Delete Cart Button", role="button"),
            args={},
            risk=RiskLevel.HIGH,
            requires_confirmation=True
        )
    )
    test_workflow.update_hash()

    approval = ApprovalService.create_approval(test_workflow, allowed_origins=["http://localhost:8000"])
    mock_driver = MockSurfaceDriver()
    registry = DriverRegistry()
    registry.register("browser", mock_driver)

    executor = WorkflowExecutor(driver_registry=registry)

    # Case A: Deny confirmation
    async def on_confirm_deny(step, params):
        # User clicks 'Deny & Abort' in the chat card
        assert step.name == "Delete Cart"
        assert executor.pending_confirmation is not None
        assert executor.pending_confirmation["step"]["target"]["name"] == "Delete Cart Button"
        executor.deny_confirmation(executor.current_run.id)

    run_denied = await executor.execute_workflow(
        workflow=test_workflow,
        parameters={},
        approval_id=approval.id,
        mode="run",
        on_confirmation_required=on_confirm_deny
    )

    assert run_denied.state == ExecutionState.STOPPED
    assert "Confirmation denied by user" in run_denied.safe_stop_reason

    # Case B: Grant confirmation
    mock_driver_2 = MockSurfaceDriver()
    registry_2 = DriverRegistry()
    registry_2.register("browser", mock_driver_2)
    executor_grant = WorkflowExecutor(driver_registry=registry_2)

    async def on_confirm_grant(step, params):
        # User clicks 'Grant & Continue' in the chat card
        assert step.name == "Delete Cart"
        executor_grant.grant_confirmation(executor_grant.current_run.id)

    run_granted = await executor_grant.execute_workflow(
        workflow=test_workflow,
        parameters={},
        approval_id=approval.id,
        mode="run",
        on_confirmation_required=on_confirm_grant
    )

    assert run_granted.state == ExecutionState.SUCCESS
    assert len(run_granted.step_results) == 3
    assert all(r.passed for r in run_granted.step_results)


@pytest.mark.asyncio
async def test_step_timeout_and_bounded_retries(test_workflow):
    """
    Step 6: Per-step timeout (default 15s, or custom) and bounded retries
    (up to 2 for idempotent steps).
    """
    # 1. Test bounded retries on idempotent step (fails 2 times, passes on 3rd attempt)
    test_workflow.steps[0].idempotent = True
    approval = ApprovalService.create_approval(test_workflow, allowed_origins=["http://localhost:8000"])

    mock_driver = MockSurfaceDriver()
    mock_driver.fail_until_count = 2  # Will fail attempt 1 and 2, pass attempt 3

    registry = DriverRegistry()
    registry.register("browser", mock_driver)

    executor = WorkflowExecutor(driver_registry=registry)
    run = await executor.execute_workflow(
        workflow=test_workflow,
        parameters={},
        approval_id=approval.id,
        mode="run"
    )

    # Idempotent step succeeded after retrying 2 times
    assert run.state == ExecutionState.SUCCESS
    assert mock_driver.act_call_count >= 3
    assert run.step_results[0].passed is True

    # 2. Test timeout handling
    slow_driver = MockSurfaceDriver()
    slow_driver.slow_delay = 0.5  # Driver takes 500ms
    test_workflow.steps[0].timeout_seconds = 0.1  # Step limit is 100ms
    test_workflow.steps[0].idempotent = False
    test_workflow.update_hash()

    approval_timeout = ApprovalService.create_approval(test_workflow, allowed_origins=["http://localhost:8000"])
    registry_slow = DriverRegistry()
    registry_slow.register("browser", slow_driver)

    executor_timeout = WorkflowExecutor(driver_registry=registry_slow)
    run_timeout = await executor_timeout.execute_workflow(
        workflow=test_workflow,
        parameters={},
        approval_id=approval_timeout.id,
        mode="run"
    )

    assert run_timeout.state == ExecutionState.FAILED
    assert "timed out" in run_timeout.safe_stop_reason
