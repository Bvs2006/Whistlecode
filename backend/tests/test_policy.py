import pytest
from backend.app.models.workflow import Step, ActionType, RiskLevel, TargetDescriptor
from backend.app.models.policy import PolicyDecision, ReasonCode
from backend.app.models.approval import ApprovalRecord, ApprovalScope
from backend.app.policy.engine import PolicyEngine


def test_pol1_operates_without_llm():
    """POL-1: Policy engine is a separate module with no dependency on LLM output."""
    engine = PolicyEngine()
    step = Step(
        id="s1",
        name="Navigate home",
        action=ActionType.NAVIGATE,
        args={"url": "http://localhost:8000/testsite"}
    )
    decision, reason, risk = engine.evaluate_step(step, current_url="http://localhost:8000/testsite")
    assert decision == PolicyDecision.ALLOW
    assert reason == ReasonCode.ALLOWED_BY_RULE
    assert risk == RiskLevel.LOW


def test_pol2_and_pol4_default_deny_unapproved_origin():
    """POL-4: Default deny for unknown origins or action types."""
    engine = PolicyEngine()
    step = Step(
        id="s1",
        name="Navigate external",
        action=ActionType.NAVIGATE,
        args={"url": "https://malicious-external-site.com/steal"}
    )
    decision, reason, risk = engine.evaluate_step(step, current_url="https://malicious-external-site.com/steal")
    assert decision == PolicyDecision.DENY
    assert reason == ReasonCode.UNAPPROVED_ORIGIN


def test_declared_origin_is_reviewable_without_granting_approval():
    """A plan can be reviewed for its requested site, but remains unapproved."""
    engine = PolicyEngine()
    step = Step(
        id="s1",
        name="Search a page",
        action=ActionType.NAVIGATE,
        args={"url": "https://www.wikipedia.org/wiki/Main_Page"},
    )

    decision, reason, _ = engine.evaluate_step(
        step,
        current_url="https://www.wikipedia.org/",
        declared_origins=["https://www.wikipedia.org/"],
    )
    assert decision == PolicyDecision.ALLOW
    assert reason == ReasonCode.ALLOWED_BY_RULE

    outside_scope, outside_reason, _ = engine.evaluate_step(
        step,
        current_url="https://www.wikipedia.org/",
        declared_origins=["https://example.com"],
    )
    assert outside_scope == PolicyDecision.DENY
    assert outside_reason == ReasonCode.UNAPPROVED_ORIGIN

    # The legacy/default policy still denies external origins absent a declared scope.
    default_decision, default_reason, _ = engine.evaluate_step(
        step,
        current_url="https://www.wikipedia.org/",
    )
    assert default_decision == PolicyDecision.DENY
    assert default_reason == ReasonCode.UNAPPROVED_ORIGIN




def test_pol5_sensitive_field_denial():
    """POL-5: Policy evaluates context: sensitive fields restricted."""
    engine = PolicyEngine()
    step = Step(
        id="s2",
        name="Enter credit card",
        action=ActionType.TYPE,
        target=TargetDescriptor(name="credit_card_number", role="textbox"),
        args={"value": "4111222233334444"}
    )
    decision, reason, risk = engine.evaluate_step(step, current_url="http://localhost:8000/testsite")
    assert decision == PolicyDecision.DENY
    assert reason == ReasonCode.SENSITIVE_FIELD_RESTRICTED


def test_confirmation_gate_on_high_risk_submit():
    """POL-2 & EXE-5: Submit actions require confirmation."""
    engine = PolicyEngine()
    step = Step(
        id="s3",
        name="Submit payment",
        action=ActionType.SUBMIT,
        target=TargetDescriptor(name="submit-btn", role="button")
    )
    decision, reason, risk = engine.evaluate_step(step, current_url="http://localhost:8000/testsite")
    assert decision == PolicyDecision.REQUIRE_CONFIRMATION
    assert reason == ReasonCode.HIGH_RISK_CONFIRMATION_REQUIRED
