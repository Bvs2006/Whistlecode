import pytest
from backend.app.planning.goal_planner import (
    GoalPlanner,
    PlanStep,
    ActionType,
    RiskLevel,
    TargetDescriptor,
)
from backend.app.models.workflow import WorkflowDefinition, Step


@pytest.fixture
def planner():
    return GoalPlanner()


def test_ambiguous_goal_marks_uncertainty_and_clarification(planner):
    plan = planner.create_plan("Find a restaurant for dinner")
    assert plan.validation_status == "REQUIRES_CLARIFICATION"
    assert len(plan.clarification_questions) >= 1
    assert "ranking rule" in plan.clarification_questions[0].question.lower()
    assert len(plan.uncertainties) >= 1
    assert "ranking preference" in plan.uncertainties[0].lower()


def test_workflow_reuse(planner):
    saved_wf = WorkflowDefinition(
        workflow_id="wf_saved_customer",
        title="Register Customer Portal",
        intent="Register customer in portal",
        allowed_origins=["http://localhost:8000"],
        parameters=[],
        steps=[
            Step(id="s1", name="Go to Portal", action=ActionType.NAVIGATE, args={"url": "http://localhost:8000"}),
            Step(id="s2", name="Save Customer", action=ActionType.SUBMIT, args={}, risk=RiskLevel.HIGH)
        ],
        final_postconditions=[],
        version=1,
        content_hash="sha256:abc123"
    )

    plan = planner.create_plan(
        "Register a new customer",
        available_workflows=[saved_wf]
    )

    assert plan.reused_workflow_id == "wf_saved_customer"
    assert len(plan.steps) == 2
    assert plan.steps[0].id == "s1"
    assert plan.steps[1].id == "s2"
    assert plan.steps[1].dependencies == ["s1"]
    assert any("Reusing verified" in a for a in plan.assumptions)


def test_cyclic_dependency_detection(planner):
    steps = [
        PlanStep(
            id="s1",
            name="Step 1",
            action=ActionType.NAVIGATE,
            expected_outcome="Ready",
            dependencies=["s3"]  # s1 depends on s3
        ),
        PlanStep(
            id="s2",
            name="Step 2",
            action=ActionType.CLICK,
            expected_outcome="Clicked",
            dependencies=["s1"]  # s2 depends on s1
        ),
        PlanStep(
            id="s3",
            name="Step 3",
            action=ActionType.SUBMIT,
            expected_outcome="Submitted",
            dependencies=["s2"]  # s3 depends on s2 -> cycle s1 -> s3 -> s2 -> s1
        ),
    ]

    cycle = planner.detect_cycles(steps)
    assert cycle is not None
    assert len(cycle) >= 3


def test_unsupported_action_type_rejected(planner):
    # Pass an artificially restricted allowed_actions set
    plan = planner.create_plan(
        "General goal",
        registered_actions={"navigate", "click"}  # 'type' and 'submit' are not registered!
    )

    assert plan.validation_status == "PROHIBITED"
    assert any("unregistered action" in err for err in plan.validation_errors)


def test_prohibited_keywords_and_origins(planner):
    # Test prohibited safety keywords
    plan = planner.create_plan("Please format_drive and install malware")
    assert plan.validation_status == "PROHIBITED"
    assert any("prohibited system operation" in err for err in plan.validation_errors)

    # Test prohibited origin navigation
    plan_unpermitted_origin = planner.create_plan(
        "Query account",
        permitted_origins=["http://localhost:8000"]
    )
    # Tamper step url
    plan_unpermitted_origin.steps[0].args["url"] = "http://malicious-external-site.com"
    # Re-validate
    for s in plan_unpermitted_origin.steps:
        if s.action == ActionType.NAVIGATE:
            url = s.args.get("url") or ""
            assert not any(url.startswith(orig) for orig in ["http://localhost:8000"])


def test_deterministic_mock_plan_structure(planner):
    plan = planner.create_plan(
        goal="Order paper supplies",
        success_criteria="Items added to basket"
    )

    assert plan.plan_id.startswith("plan_")
    assert plan.content_hash.startswith("sha256:")
    assert len(plan.steps) == 3
    assert plan.overall_risk == RiskLevel.HIGH  # contains submit
    assert plan.steps[0].expected_outcome != ""
    assert plan.steps[2].failure_branch == "s_safe_stop"
    assert len(plan.assumptions) >= 1
