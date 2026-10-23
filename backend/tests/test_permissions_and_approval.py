import pytest
import datetime
import uuid
from concurrent.futures import ThreadPoolExecutor
from backend.app.models.workflow import WorkflowDefinition, Step, ParameterDefinition, ActionType, RiskLevel, TargetDescriptor
from backend.app.models.approval import ApprovalRecord, ApprovalScope
from backend.app.models.policy import PolicyDecision, ReasonCode
from backend.app.approval.service import ApprovalService
from backend.app.policy.engine import PolicyEngine
from backend.app.executor.state_machine import WorkflowExecutor


@pytest.fixture
def sample_workflow():
    wf_id = f"wf_sec_{uuid.uuid4().hex[:6]}"
    return WorkflowDefinition(
        workflow_id=wf_id,
        title="Secured Customer Onboarding",
        intent="Test approval and policy enforcement",
        allowed_origins=["http://localhost:8000"],
        parameters=[
            ParameterDefinition(name="customer_name", type="string", default_value="Alice", required=True)
        ],
        steps=[
            Step(
                id="s1",
                name="Navigate to Portal",
                action=ActionType.NAVIGATE,
                args={"url": "http://localhost:8000/testsite"},
                risk=RiskLevel.LOW
            ),
            Step(
                id="s2",
                name="Type Customer Name",
                action=ActionType.TYPE,
                target=TargetDescriptor(name="customer_name_field", role="textbox"),
                args={"value": "{{customer_name}}"},
                risk=RiskLevel.MEDIUM
            ),
            Step(
                id="s3",
                name="Submit Registration",
                action=ActionType.SUBMIT,
                target=TargetDescriptor(name="Submit Button", role="button"),
                args={},
                risk=RiskLevel.HIGH,
                requires_confirmation=True
            ),
        ],
        final_postconditions=[],
        version=1,
        content_hash="sha256:init",
    )


def test_approval_binding_and_plan_tampering(sample_workflow):
    # 1. Create valid approval bound to workflow content hash
    appr = ApprovalService.create_approval(
        sample_workflow,
        allowed_origins=["http://localhost:8000"],
        duration_days=1,
        approver="admin_user"
    )

    assert appr.id.startswith("appr_")
    assert appr.version_hash == sample_workflow.compute_hash()

    # Verify initial approval is valid
    valid, reason, record = ApprovalService.verify_approval_for_run(sample_workflow, appr.id)
    assert valid is True
    assert reason == ReasonCode.ALLOWED_WITHIN_SCOPE

    # 2. Plan tampering: alter a step target or argument
    tampered_wf = sample_workflow.model_copy(deep=True)
    tampered_wf.steps[1].args["value"] = "TamperedValue"

    # Verification MUST detect tampering and reject with APPROVAL_HASH_MISMATCH
    valid_t, reason_t, _ = ApprovalService.verify_approval_for_run(tampered_wf, appr.id)
    assert valid_t is False
    assert reason_t == ReasonCode.APPROVAL_HASH_MISMATCH


def test_expired_approval_rejection(sample_workflow):
    appr = ApprovalService.create_approval(sample_workflow, duration_days=1)

    # Force expiration timestamp into the past
    appr.expires_at = (datetime.datetime.now(datetime.timezone.utc) - datetime.timedelta(hours=2)).isoformat()
    appr.signature = appr.generate_signature()

    # Update in DB
    from backend.app.db.database import get_db_connection
    conn = get_db_connection()
    c = conn.cursor()
    c.execute("UPDATE approvals SET expires_at = ?, signature = ? WHERE id = ?", (appr.expires_at, appr.signature, appr.id))
    conn.commit()
    conn.close()

    valid, reason, _ = ApprovalService.verify_approval_for_run(sample_workflow, appr.id)
    assert valid is False
    assert reason == ReasonCode.APPROVAL_EXPIRED


def test_revocation_interface(sample_workflow):
    appr = ApprovalService.create_approval(sample_workflow, duration_days=7)

    # Revoke approval
    revoked = ApprovalService.revoke_approval(appr.id)
    assert revoked is True

    valid, reason, _ = ApprovalService.verify_approval_for_run(sample_workflow, appr.id)
    assert valid is False
    assert reason == ReasonCode.APPROVAL_REVOKED


def test_scope_escalation_denial(sample_workflow):
    policy = PolicyEngine()
    appr = ApprovalService.create_approval(sample_workflow, allowed_origins=["http://localhost:8000"])

    # Step targeting permitted origin
    step_permitted = sample_workflow.steps[0]
    decision_ok, reason_ok, _ = policy.evaluate_step(
        step=step_permitted,
        current_url="http://localhost:8000/testsite",
        approval=appr
    )
    assert decision_ok == PolicyDecision.ALLOW

    # Step attempting scope escalation to unpermitted external origin
    step_escalated = Step(
        id="s_bad",
        name="Navigate Out of Scope",
        action=ActionType.NAVIGATE,
        args={"url": "https://malicious-external-domain.com/leak"},
        risk=RiskLevel.HIGH
    )
    decision_bad, reason_bad, _ = policy.evaluate_step(
        step=step_escalated,
        current_url="https://malicious-external-domain.com/leak",
        approval=appr
    )
    assert decision_bad == PolicyDecision.DENY
    assert reason_bad == ReasonCode.UNAPPROVED_ORIGIN


def test_sensitive_field_denial_and_least_privilege(sample_workflow):
    policy = PolicyEngine()
    appr = ApprovalService.create_approval(sample_workflow, allowed_origins=["http://localhost:8000"])

    # Attempting to type into a password field
    sensitive_step = Step(
        id="s_leak",
        name="Exfiltrate Password",
        action=ActionType.TYPE,
        target=TargetDescriptor(name="user_password_input", test_id="password"),
        args={"value": "secret123"},
        risk=RiskLevel.HIGH
    )

    decision, reason, _ = policy.evaluate_step(
        step=sensitive_step,
        current_url="http://localhost:8000/testsite",
        approval=appr
    )
    assert decision == PolicyDecision.DENY
    assert reason == ReasonCode.SENSITIVE_FIELD_RESTRICTED


def test_model_cannot_forge_signature(sample_workflow):
    # Simulated model attempting to grant itself approval with forged signature
    fake_appr = ApprovalRecord(
        id=f"appr_forged_{uuid.uuid4().hex[:6]}",
        workflow_id=sample_workflow.workflow_id,
        version=sample_workflow.version,
        version_hash=sample_workflow.compute_hash(),
        scope=ApprovalScope(
            allowed_origins=["http://localhost:8000"],
            allowed_action_types=["navigate", "click", "type", "submit"]
        ),
        approver="ai_agent_self_grant",
        created_at=datetime.datetime.now(datetime.timezone.utc).isoformat(),
        expires_at=(datetime.datetime.now(datetime.timezone.utc) + datetime.timedelta(days=1)).isoformat(),
        signature="forged_signature_xyz123"  # Invalid signature
    )

    assert fake_appr.verify_signature() is False


def test_concurrent_approval_verification(sample_workflow):
    appr = ApprovalService.create_approval(sample_workflow, allowed_origins=["http://localhost:8000"])
    with ThreadPoolExecutor(max_workers=10) as pool:
        results = list(pool.map(lambda _: ApprovalService.verify_approval_for_run(sample_workflow, appr.id), range(10)))

    for valid, reason, record in results:
        assert valid is True
        assert reason == ReasonCode.ALLOWED_WITHIN_SCOPE
        assert record.id == appr.id


def test_scope_tampering_invalidates_signature(sample_workflow):
    approval = ApprovalService.create_approval(sample_workflow)
    from backend.app.db.database import get_db_connection
    conn = get_db_connection()
    conn.execute("UPDATE approvals SET scope_json = ? WHERE id = ?", (
        ApprovalScope(allowed_origins=["http://localhost:8000", "https://attacker.invalid"],
                      allowed_action_types=["navigate", "click", "type", "submit"]).model_dump_json(), approval.id
    ))
    conn.commit()
    conn.close()
    valid, reason, _ = ApprovalService.verify_approval_for_run(sample_workflow, approval.id)
    assert not valid
    assert reason == ReasonCode.APPROVAL_HASH_MISMATCH


def test_approval_creation_rejects_scope_escalation(sample_workflow):
    with pytest.raises(ValueError, match="outside the workflow's declared scope"):
        ApprovalService.create_approval(sample_workflow, allowed_origins=["https://attacker.invalid"])


def test_approval_rejects_workflow_without_enabled_steps(sample_workflow):
    empty_workflow = sample_workflow.model_copy(deep=True)
    for step in empty_workflow.steps:
        step.enabled = False
    with pytest.raises(ValueError, match="at least one enabled workflow step"):
        ApprovalService.create_approval(empty_workflow)


def test_approval_scope_rejects_unapproved_parameters(sample_workflow):
    approval = ApprovalService.create_approval(sample_workflow)
    valid, reason, _ = ApprovalService.verify_approval_for_run(
        sample_workflow, approval.id, {"customer_name": "Alice", "extra_privilege": True}
    )
    assert not valid
    assert reason == ReasonCode.APPROVAL_SCOPE_MISMATCH
