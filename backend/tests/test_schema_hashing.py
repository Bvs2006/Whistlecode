import pytest
from backend.app.models.workflow import WorkflowDefinition, Step, ActionType, RiskLevel, ParameterDefinition, Postcondition
from backend.app.approval.service import ApprovalService
from backend.app.models.policy import ReasonCode


def test_content_hash_determinism_and_invalidation():
    """APR-1 & EDT-3: Save creates a content hash; edits invalidate prior hash."""
    wf = WorkflowDefinition(
        workflow_id="wf_ticket_test",
        title="Create Ticket",
        intent="Create support ticket",
        allowed_origins=["http://localhost:8000"],
        parameters=[ParameterDefinition(name="subject", type="string", required=True)],
        steps=[
            Step(
                id="s1",
                name="Enter subject",
                action=ActionType.TYPE,
                args={"value": "{{subject}}"}
            )
        ],
        final_postconditions=[Postcondition(type="url_matches", value="/tickets")]
    )

    hash1 = wf.compute_hash()
    assert hash1.startswith("sha256:")
    assert hash1 == wf.compute_hash()  # Deterministic

    # Create approval for hash1
    approval = ApprovalService.create_approval(wf)
    valid, reason, _ = ApprovalService.verify_approval_for_run(wf, approval.id)
    assert valid is True
    assert reason == ReasonCode.ALLOWED_WITHIN_SCOPE

    # Modify workflow step (edit)
    wf.steps.append(Step(id="s2", name="Click save", action=ActionType.CLICK))
    hash2 = wf.compute_hash()
    assert hash1 != hash2

    # Verification of old approval against modified workflow must fail (APR-1)
    valid_after_edit, reason_after_edit, _ = ApprovalService.verify_approval_for_run(wf, approval.id)
    assert valid_after_edit is False
    assert reason_after_edit == ReasonCode.APPROVAL_HASH_MISMATCH
