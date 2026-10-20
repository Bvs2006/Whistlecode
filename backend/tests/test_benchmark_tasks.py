import pytest
from backend.app.models.workflow import (
    WorkflowDefinition, Step, ActionType, RiskLevel, 
    TargetDescriptor, ParameterDefinition, Postcondition
)
from backend.app.models.run import VerificationState, ExecutionState
from backend.app.approval.service import ApprovalService
from backend.app.executor.state_machine import WorkflowExecutor


@pytest.mark.asyncio
async def test_dry_run_task1_customer_form():
    """TST-2: Dry-run mode evaluates targets and policy without side effects."""
    wf = WorkflowDefinition(
        workflow_id="wf_benchmark_task1",
        title="Submit New Customer",
        intent="Register a new client profile with variable contact information",
        allowed_origins=["http://localhost:8000", "http://127.0.0.1:8000"],
        parameters=[
            ParameterDefinition(name="customer_name", type="string", default_value="Jane Doe"),
            ParameterDefinition(name="customer_email", type="string", default_value="jane@example.com"),
            ParameterDefinition(name="plan", type="string", default_value="Professional")
        ],
        steps=[
            Step(
                id="s1",
                name="Navigate to customer portal",
                action=ActionType.NAVIGATE,
                args={"url": "http://localhost:8000/testsite#customers"},
                risk=RiskLevel.LOW,
                idempotent=True
            ),
            Step(
                id="s2",
                name="Enter customer name",
                action=ActionType.TYPE,
                target=TargetDescriptor(test_id="customer-name-input", role="textbox"),
                args={"value": "{{customer_name}}"},
                risk=RiskLevel.MEDIUM
            ),
            Step(
                id="s3",
                name="Enter customer email",
                action=ActionType.TYPE,
                target=TargetDescriptor(test_id="customer-email-input", role="textbox"),
                args={"value": "{{customer_email}}"},
                risk=RiskLevel.MEDIUM
            ),
            Step(
                id="s4",
                name="Save customer profile",
                action=ActionType.CLICK,
                target=TargetDescriptor(test_id="btn-save-customer", role="button"),
                risk=RiskLevel.LOW
            )
        ],
        final_postconditions=[
            Postcondition(type="url_matches", value="testsite")
        ]
    )

    executor = WorkflowExecutor()
    run = await executor.execute_workflow(
        workflow=wf,
        parameters={"customer_name": "Dr. Watson", "customer_email": "watson@example.com"},
        mode="dry_run"
    )

    assert run.state == ExecutionState.SUCCESS
    assert run.verification_state == VerificationState.VERIFIED_SUCCESS
    assert len(run.step_results) == 4
    assert all(res.passed for res in run.step_results)


@pytest.mark.asyncio
async def test_execution_blocked_without_valid_approval():
    """G3 & APR-1: 100% of runs in 'run' mode require valid approval hash."""
    wf = WorkflowDefinition(
        workflow_id="wf_unapproved",
        title="Unapproved Workflow",
        intent="Attempt execution without approval",
        allowed_origins=["http://localhost:8000"],
        steps=[
            Step(id="s1", name="Navigate", action=ActionType.NAVIGATE, args={"url": "http://localhost:8000/testsite"})
        ],
        final_postconditions=[]
    )

    executor = WorkflowExecutor()
    # Missing approval id
    run = await executor.execute_workflow(
        workflow=wf,
        parameters={},
        approval_id=None,
        mode="run"
    )

    assert run.state == ExecutionState.STOPPED
    assert "No approval record provided" in (run.safe_stop_reason or "")


@pytest.mark.asyncio
async def test_scope_escape_blocked_by_policy():
    """EXE-11: Navigation restricted to allowlist; off-allowlist denied."""
    wf = WorkflowDefinition(
        workflow_id="wf_scope_escape",
        title="Scope Escape Test",
        intent="Attempt off-origin navigation",
        allowed_origins=["http://localhost:8000"],
        steps=[
            Step(
                id="s1",
                name="Navigate outside allowlist",
                action=ActionType.NAVIGATE,
                args={"url": "https://unauthorized-domain.com"}
            )
        ],
        final_postconditions=[]
    )

    approval = ApprovalService.create_approval(wf)

    executor = WorkflowExecutor()
    run = await executor.execute_workflow(
        workflow=wf,
        parameters={},
        approval_id=approval.id,
        mode="run"
    )

    assert run.state == ExecutionState.STOPPED
    assert "Policy denied" in (run.safe_stop_reason or "")
