from __future__ import annotations
import uuid
import json
import hashlib
import re
from typing import List, Dict, Any, Optional, Set
from pydantic import BaseModel, Field

from ..models.workflow import (
    WorkflowDefinition, Step, ActionType, RiskLevel,
    ParameterDefinition, Precondition, Postcondition, TargetDescriptor, TargetContext,
    ClarificationQuestion
)
from ..policy.engine import PolicyEngine


class PlanStep(BaseModel):
    id: str
    name: str
    action: ActionType
    target: Optional[TargetDescriptor] = None
    args: Dict[str, Any] = Field(default_factory=dict)
    dependencies: List[str] = Field(default_factory=list)
    required_parameters: List[str] = Field(default_factory=list)
    preconditions: List[Precondition] = Field(default_factory=list)
    expected_outcome: str
    failure_branch: Optional[str] = None
    risk: RiskLevel = RiskLevel.LOW
    assumptions: List[str] = Field(default_factory=list)


class GoalPlan(BaseModel):
    plan_id: str
    goal: str
    success_criteria: str
    reused_workflow_id: Optional[str] = None
    steps: List[PlanStep] = Field(default_factory=list)
    clarification_questions: List[ClarificationQuestion] = Field(default_factory=list)
    assumptions: List[str] = Field(default_factory=list)
    uncertainties: List[str] = Field(default_factory=list)
    overall_risk: RiskLevel = RiskLevel.LOW
    content_hash: str
    validation_status: str = "VALID"  # "VALID", "REQUIRES_CLARIFICATION", "PROHIBITED"
    validation_errors: List[str] = Field(default_factory=list)


class CyclicDependencyError(Exception):
    """Raised when steps contain cyclic dependencies."""
    pass


class ProhibitedActionError(Exception):
    """Raised when plan requests prohibited action or origin."""
    pass


class UnsupportedActionError(Exception):
    """Raised when an unregistered action type is encountered."""
    pass


class GoalPlanner:
    """
    Goal Planning Engine.
    Converts a natural-language goal and success criteria into a structured, typed execution plan.
    Enforces:
      - Dependency DAG validation and cycle detection
      - Reuse of existing saved workflows
      - Action registration and deterministic policy checks
      - Explicit uncertainty and assumption labeling
      - Separation from execution (never runs automatically)
    """

    REGISTERED_ACTIONS: Set[str] = {a.value for a in ActionType}

    def __init__(self, policy_engine: Optional[PolicyEngine] = None):
        self.policy_engine = policy_engine or PolicyEngine()

    def detect_cycles(self, steps: List[PlanStep]) -> Optional[List[str]]:
        """
        Detects cyclic dependencies in step DAG using DFS cycle detection.
        Returns the cycle list if found, otherwise None.
        """
        adj: Dict[str, List[str]] = {s.id: list(s.dependencies) for s in steps}
        visited: Dict[str, int] = {s.id: 0 for s in steps}  # 0: unvisited, 1: visiting, 2: visited
        cycle: List[str] = []

        def dfs(node: str, path: List[str]) -> bool:
            visited[node] = 1
            path.append(node)
            for neighbor in adj.get(node, []):
                if neighbor not in visited:
                    continue
                if visited[neighbor] == 1:
                    idx = path.index(neighbor)
                    cycle.extend(path[idx:] + [neighbor])
                    return True
                if visited[neighbor] == 0:
                    if dfs(neighbor, path):
                        return True
            path.pop()
            visited[node] = 2
            return False

        for step in steps:
            if visited[step.id] == 0:
                if dfs(step.id, []):
                    return cycle
        return None

    def create_plan(
        self,
        goal: str,
        success_criteria: Optional[str] = None,
        available_workflows: Optional[List[WorkflowDefinition]] = None,
        registered_actions: Optional[Set[str]] = None,
        permitted_origins: Optional[List[str]] = None,
        permission_constraints: Optional[Dict[str, Any]] = None
    ) -> GoalPlan:
        plan_id = f"plan_{uuid.uuid4().hex[:8]}"
        goal_text = goal.strip()
        criteria = success_criteria or "Verified deterministic postconditions matching target state"
        workflows = available_workflows or []
        allowed_actions = registered_actions or self.REGISTERED_ACTIONS
        allowed_origins = permitted_origins or ["http://localhost:8000"]
        constraints = permission_constraints or {}

        validation_errors: List[str] = []
        assumptions: List[str] = []
        uncertainties: List[str] = []
        clarifications: List[ClarificationQuestion] = []
        plan_steps: List[PlanStep] = []
        reused_wf_id: Optional[str] = None

        lower_goal = goal_text.lower()

        # 1. Check for Prohibited Target Applications / Origins
        prohibited_keywords = constraints.get("prohibited_keywords", ["malware", "system32", "format_drive", "ransom"])
        if any(k in lower_goal for k in prohibited_keywords):
            validation_errors.append("Goal violates safety policy: prohibited system operation requested.")
            return GoalPlan(
                plan_id=plan_id,
                goal=goal_text,
                success_criteria=criteria,
                validation_status="PROHIBITED",
                validation_errors=validation_errors,
                content_hash="sha256:prohibited"
            )

        # 2. Re-use existing saved workflows when appropriate
        matched_wf = None
        for wf in workflows:
            title_low = wf.title.lower()
            intent_low = wf.intent.lower()
            if (
                ("paper" in lower_goal and "paper" in title_low) or
                ("price" in lower_goal and "price" in title_low) or
                ("customer" in lower_goal and "customer" in title_low) or
                ("restaurant" in lower_goal and "restaurant" in title_low)
            ):
                matched_wf = wf
                break

        if matched_wf:
            reused_wf_id = matched_wf.workflow_id
            assumptions.append(f"Reusing verified procedural steps from saved workflow '{matched_wf.title}' (v{matched_wf.version}).")
            prev_step_id = None
            for idx, st in enumerate(matched_wf.steps):
                plan_step = PlanStep(
                    id=st.id,
                    name=st.name,
                    action=st.action,
                    target=st.target,
                    args=dict(st.args),
                    dependencies=[prev_step_id] if prev_step_id else [],
                    required_parameters=[p.name for p in matched_wf.parameters],
                    preconditions=list(st.preconditions),
                    expected_outcome=f"Deterministic postcondition for {st.name}",
                    failure_branch="s_fallback_abort" if st.risk == RiskLevel.HIGH else None,
                    risk=st.risk,
                    assumptions=[f"Target control '{st.name}' exists and matches accessibility descriptors."]
                )
                plan_steps.append(plan_step)
                prev_step_id = st.id
        else:
            # 3. Novel Goal Planning: Disambiguation & Parameterization
            if "restaurant" in lower_goal or "dinner" in lower_goal:
                uncertainties.append("Ranking preference (price vs rating vs distance) was not specified in the goal.")
                clarifications.append(ClarificationQuestion(
                    id="clarify_plan_ranking",
                    step_id="s1",
                    question="Which ranking rule should prioritize restaurant selection?",
                    options=["Rating (Highest rated >= 4.5)", "Price ($ Budget tier)", "Distance (Nearest)"],
                    selected_option="Rating (Highest rated >= 4.5)"
                ))

            assumptions.append("Assumes target application is accessible at permitted origins.")
            assumptions.append("Assumes user holds authorized session state.")

            # Step 1: Navigate
            plan_steps.append(PlanStep(
                id="s1",
                name="Navigate to Target Application",
                action=ActionType.NAVIGATE,
                target=TargetDescriptor(name="Application Root", role="window"),
                args={"url": allowed_origins[0]},
                dependencies=[],
                required_parameters=[],
                preconditions=[],
                expected_outcome="Target application loaded and DOM ready",
                risk=RiskLevel.LOW
            ))

            # Step 2: Form input / state observation
            plan_steps.append(PlanStep(
                id="s2",
                name="Populate Required Parameters & Inspect State",
                action=ActionType.TYPE,
                target=TargetDescriptor(name="Primary Input", role="textbox"),
                args={"value": "{{query}}"},
                dependencies=["s1"],
                required_parameters=["query"],
                preconditions=[Precondition(type="element_visible", selector="input")],
                expected_outcome="Field populated with sanitized parameter",
                risk=RiskLevel.MEDIUM
            ))

            # Step 3: Consequential action through confirmation gate
            plan_steps.append(PlanStep(
                id="s3",
                name="Submit Request & Verify Outcome",
                action=ActionType.SUBMIT,
                target=TargetDescriptor(name="Submit Button", role="button"),
                args={},
                dependencies=["s2"],
                required_parameters=[],
                preconditions=[],
                expected_outcome="Operation completed with success alert",
                failure_branch="s_safe_stop",
                risk=RiskLevel.HIGH,
                assumptions=["Requires explicit human approval before execution."]
            ))

        # 4. Action Registry Validation
        for s in plan_steps:
            if s.action.value not in allowed_actions:
                validation_errors.append(f"Step {s.id} specifies unregistered action: {s.action}")

        # 5. Dependency Cycle Check
        cycle = self.detect_cycles(plan_steps)
        if cycle:
            validation_errors.append(f"Cyclic dependency detected among steps: {' -> '.join(cycle)}")

        # 6. Origin Policy Validation
        for s in plan_steps:
            if s.action == ActionType.NAVIGATE:
                url = s.args.get("url") or ""
                if url and not any(url.startswith(origin) for origin in allowed_origins):
                    validation_errors.append(f"Step {s.id} targets unpermitted origin '{url}'. Allowed: {allowed_origins}")

        overall_risk = RiskLevel.HIGH if any(s.risk == RiskLevel.HIGH for s in plan_steps) else RiskLevel.MEDIUM
        status = "PROHIBITED" if validation_errors else "REQUIRES_CLARIFICATION" if clarifications else "VALID"

        steps_json = json.dumps([s.model_dump() for s in plan_steps], sort_keys=True)
        content_hash = f"sha256:{hashlib.sha256(steps_json.encode()).hexdigest()}"

        return GoalPlan(
            plan_id=plan_id,
            goal=goal_text,
            success_criteria=criteria,
            reused_workflow_id=reused_wf_id,
            steps=plan_steps,
            clarification_questions=clarifications,
            assumptions=assumptions,
            uncertainties=uncertainties,
            overall_risk=overall_risk,
            content_hash=content_hash,
            validation_status=status,
            validation_errors=validation_errors
        )


default_goal_planner = GoalPlanner()
