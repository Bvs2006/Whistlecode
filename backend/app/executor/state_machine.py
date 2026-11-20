from __future__ import annotations
import asyncio
import json
import uuid
import datetime
import os
from functools import wraps
from typing import Dict, Any, Optional, Callable, Awaitable
from ..models.workflow import WorkflowDefinition, Step, ActionType
from ..models.run import RunRecord, ExecutionState, VerificationState, StepExecutionResult
from ..models.policy import PolicyDecision, ReasonCode
from ..models.approval import ApprovalRecord
from ..policy.engine import PolicyEngine
from ..approval.service import ApprovalService
from ..verifier.engine import VerifierEngine
from ..audit.logger import AuditLogger
from ..db.database import get_db_connection
from ..drivers.registry import DriverRegistry
from ..drivers.browser import BrowserDriver
from ..drivers.base import BaseDriver, DriverHealth


def serialize_workflow_runs(method):
    @wraps(method)
    async def locked(self, *args, **kwargs):
        async with self._execution_lock:
            return await method(self, *args, **kwargs)
    return locked


class WorkflowExecutor:
    """
    Deterministic State Machine Executor (EXE-1..12).
    Enforces that:
      - Actions are strictly typed and surface-routed
      - Policy authorizes every action before execution
      - Approvals are validated against content hashes
      - Safe stops trigger on unexpected state, policy denial, or missing drivers
      - Execution delegates through DriverRegistry (never directly coupled to Playwright)
      - Outcomes are verified against postconditions
    """

    def __init__(self, policy_engine: Optional[PolicyEngine] = None, driver_registry: Optional[DriverRegistry] = None):
        self.policy_engine = policy_engine or PolicyEngine()
        self.driver_registry = driver_registry or DriverRegistry()
        self.current_run: Optional[RunRecord] = None
        self._stop_requested: bool = False
        self._pending_confirmation_event: Optional[asyncio.Event] = None
        self._confirmation_granted: bool = False
        self._execution_lock = asyncio.Lock()
        self.pending_confirmation: Optional[Dict[str, Any]] = None

    @property
    def browser_driver(self) -> Optional[BrowserDriver]:
        driver = self.driver_registry.get("browser")
        return driver if isinstance(driver, BrowserDriver) else None

    @property
    def page(self):
        bd = self.browser_driver
        return bd.page if bd else None

    @property
    def browser(self):
        bd = self.browser_driver
        return bd.browser if bd else None

    @property
    def context(self):
        bd = self.browser_driver
        return bd.context if bd else None

    def substitute_params(self, text: str, params: Dict[str, Any]) -> str:
        if not text:
            return text
        result = text
        for k, v in params.items():
            result = result.replace(f"{{{{{k}}}}}", str(v))
        return result

    def _persist_current_run(self) -> None:
        run = self.current_run
        if not run:
            return
        with get_db_connection() as conn:
            conn.execute(
                """INSERT OR REPLACE INTO runs
                (id, workflow_id, version, version_hash, approval_id, policy_version, params_json, mode,
                 state, verification_state, started_at, ended_at, safe_stop_reason)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
                (run.id, run.workflow_id, run.version, run.version_hash, run.approval_id,
                 self.policy_engine.config.policy_version,
                 json.dumps({name: "[REDACTED]" for name in run.parameters}), run.mode,
                 run.state.value, run.verification_state.value if run.verification_state else None,
                 run.started_at, run.ended_at, run.safe_stop_reason)
            )
            for index, result in enumerate(run.step_results):
                conn.execute(
                    """INSERT OR REPLACE INTO run_steps
                    (id, run_id, step_id, action, decision, reason_code, passed, observed_state_json, error_message, ts)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
                    (f"{run.id}_{index}", run.id, result.step_id, result.action, result.decision.value,
                     result.reason_code.value, 1 if result.passed else 0, "{}", result.error_message, result.timestamp)
                )

    @serialize_workflow_runs
    async def execute_workflow(
        self,
        workflow: WorkflowDefinition,
        parameters: Dict[str, Any],
        approval_id: Optional[str] = None,
        mode: str = "run",  # "dry_run", "test", "run"
        on_step_update: Optional[Callable[[StepExecutionResult], Awaitable[None]]] = None,
        on_confirmation_required: Optional[Callable[[Step, Dict[str, Any]], Awaitable[None]]] = None
    ) -> RunRecord:
        if mode not in {"run", "test", "dry_run"}:
            raise ValueError("Unsupported execution mode")
        parameters = dict(parameters)
        for definition in workflow.parameters:
            if definition.name not in parameters and definition.default_value is not None:
                parameters[definition.name] = definition.default_value

        run_id = f"run_{uuid.uuid4().hex[:12]}"
        now_iso = datetime.datetime.now(datetime.timezone.utc).isoformat()
        approval_record = None

        self.current_run = RunRecord(
            id=run_id,
            workflow_id=workflow.workflow_id,
            version=workflow.version,
            version_hash=workflow.content_hash,
            approval_id=approval_id,
            policy_version=self.policy_engine.config.policy_version,
            mode=mode,
            parameters=parameters,
            state=ExecutionState.PRECHECK,
            started_at=now_iso,
            step_results=[]
        )
        self._stop_requested = False
        self._persist_current_run()

        # 1. Approval Verification Gate
        if mode != "dry_run":
            if not approval_id:
                self.current_run.state = ExecutionState.STOPPED
                self.current_run.verification_state = VerificationState.FAILED
                self.current_run.safe_stop_reason = "No approval record provided for protected run mode"
                self._persist_current_run()
                return self.current_run

            valid, approval_reason, approval_record = ApprovalService.verify_approval_for_run(workflow, approval_id, parameters)
            if not valid:
                self.current_run.state = ExecutionState.STOPPED
                self.current_run.verification_state = VerificationState.FAILED
                self.current_run.safe_stop_reason = f"Approval check failed: {approval_reason.value}"
                self._persist_current_run()
                return self.current_run

        AuditLogger.log_event(
            actor="executor",
            event_type="RUN_STARTED",
            workflow_id=workflow.workflow_id,
            version_hash=self.current_run.version_hash,
            ref_ids={"run_id": run_id, "approval_id": approval_id},
            details={"mode": mode, "parameters_count": len(parameters)}
        )

        # 2. Preconditions Evaluation
        precondition_failures = []
        for step in workflow.steps:
            if not step.enabled or not step.preconditions:
                continue
            resolved_preconditions = self._resolve_conditions(step.preconditions, parameters)
            p_state, details = VerifierEngine.verify_all(resolved_preconditions, {"url": "http://localhost", "elements": {}})
            if p_state == VerificationState.FAILED:
                precondition_failures.append(f"Precondition failed on step '{step.name}': {details}")

        if precondition_failures:
            self.current_run.state = ExecutionState.STOPPED
            self.current_run.verification_state = VerificationState.FAILED
            self.current_run.safe_stop_reason = "; ".join(precondition_failures)
            self._persist_current_run()
            return self.current_run

        # 3. Iterate Steps
        actions_count = 0
        observed_page_state: Dict[str, Any] = {}

        try:
            for idx, step in enumerate(workflow.steps):
                if not step.enabled:
                    continue

                if self._stop_requested:
                    self.current_run.state = ExecutionState.STOPPED
                    self.current_run.safe_stop_reason = "Execution halted by user request"
                    break

                self.current_run.current_step_index = idx
                self.current_run.state = ExecutionState.EXECUTING_STEP
                self._persist_current_run()

                # Surface driver lookup
                surface_name = step.surface.value if hasattr(step.surface, "value") else str(step.surface or "browser")
                driver = self.driver_registry.get(surface_name)

                # Observe surface state before step (e.g. current URL)
                current_url = ""
                if driver and mode != "dry_run":
                    try:
                        obs = await driver.observe()
                        current_url = obs.get("current_url", "")
                    except Exception:
                        current_url = ""

                # Reload and verify the signed grant before every protected action
                if mode != "dry_run":
                    valid, approval_reason, approval_record = ApprovalService.verify_approval_for_run(workflow, approval_id or "", parameters)
                    if not valid:
                        self.current_run.state = ExecutionState.STOPPED
                        self.current_run.verification_state = VerificationState.FAILED
                        self.current_run.safe_stop_reason = f"Approval expired or changed before step: {approval_reason.value}"
                        result = StepExecutionResult(
                            step_id=step.id, action=step.action.value, decision=PolicyDecision.DENY,
                            reason_code=approval_reason, passed=False, error_message=self.current_run.safe_stop_reason,
                            timestamp=datetime.datetime.now().timestamp()
                        )
                        self.current_run.step_results.append(result)
                        AuditLogger.log_event(actor="policy_engine", event_type="APPROVAL_DENIED", workflow_id=workflow.workflow_id, version_hash=workflow.compute_hash(), ref_ids={"run_id": run_id, "approval_id": approval_id, "step_id": step.id}, details={"reason": approval_reason.value})
                        break

                # Check Policy Authorization (POL-1..5)
                decision, reason_code, effective_risk = self.policy_engine.evaluate_step(
                    step=step,
                    current_url=current_url,
                    approval=approval_record,
                    actions_executed_count=actions_count,
                    declared_origins=workflow.allowed_origins if mode == "dry_run" else None,
                )

                AuditLogger.log_event(
                    actor="policy_engine",
                    event_type="POLICY_EVALUATION",
                    workflow_id=workflow.workflow_id,
                    version_hash=self.current_run.version_hash,
                    ref_ids={"run_id": run_id, "step_id": step.id},
                    details={
                        "action": step.action.value,
                        "decision": decision.value,
                        "reason_code": reason_code.value,
                        "risk": effective_risk.value,
                        "surface": surface_name,
                    }
                )

                # Policy Denial -> Safe Stop
                if decision == PolicyDecision.DENY:
                    result = StepExecutionResult(
                        step_id=step.id,
                        action=step.action.value,
                        decision=decision,
                        reason_code=reason_code,
                        passed=False,
                        error_message=f"Policy denied action: {reason_code.value}",
                        timestamp=datetime.datetime.now().timestamp()
                    )
                    self.current_run.step_results.append(result)
                    self.current_run.state = ExecutionState.STOPPED
                    self.current_run.verification_state = VerificationState.FAILED
                    self.current_run.safe_stop_reason = f"Policy denied step '{step.name}': {reason_code.value}"
                    break

                # Confirmation Gate Required (EXE-5)
                if decision == PolicyDecision.REQUIRE_CONFIRMATION and mode != "dry_run":
                    self.current_run.state = ExecutionState.PENDING_CONFIRMATION

                    if on_confirmation_required:
                        self._pending_confirmation_event = asyncio.Event()
                        self._confirmation_granted = False
                        evaluated_args = {}
                        for key, value in step.args.items():
                            evaluated_args[key] = self.substitute_params(value, parameters) if isinstance(value, str) else value
                        self.pending_confirmation = {
                            "run_id": run_id,
                            "step": step.model_dump(mode="json"),
                            "evaluated_args": evaluated_args,
                            "risk": effective_risk.value,
                        }
                        self._persist_current_run()
                        await on_confirmation_required(step, parameters)
                        try:
                            await asyncio.wait_for(self._pending_confirmation_event.wait(), timeout=120)
                        except asyncio.TimeoutError:
                            self._confirmation_granted = False

                        if not self._confirmation_granted:
                            result = StepExecutionResult(
                                step_id=step.id,
                                action=step.action.value,
                                decision=decision,
                                reason_code=ReasonCode.GATED_STEP_CONFIRMATION_REQUIRED,
                                passed=False,
                                error_message="Step rejected or timed out at confirmation gate",
                                timestamp=datetime.datetime.now().timestamp()
                            )
                            self.current_run.step_results.append(result)
                            self.current_run.state = ExecutionState.STOPPED
                            self.current_run.safe_stop_reason = "Confirmation denied by user or timed out"
                            self.pending_confirmation = None
                            break
                        self.pending_confirmation = None
                        self._persist_current_run()

                        valid, approval_reason, approval_record = ApprovalService.verify_approval_for_run(workflow, approval_id or "", parameters)
                        if not valid:
                            self.current_run.state = ExecutionState.STOPPED
                            self.current_run.verification_state = VerificationState.FAILED
                            self.current_run.safe_stop_reason = f"Approval expired or changed at confirmation: {approval_reason.value}"
                            break
                    else:
                        self.current_run.state = ExecutionState.STOPPED
                        self.current_run.verification_state = VerificationState.FAILED
                        self.current_run.safe_stop_reason = "Confirmation required but no interactive confirmation channel is available"
                        result = StepExecutionResult(
                            step_id=step.id, action=step.action.value,
                            decision=PolicyDecision.REQUIRE_CONFIRMATION,
                            reason_code=reason_code, passed=False,
                            error_message=self.current_run.safe_stop_reason,
                            timestamp=datetime.datetime.now().timestamp(),
                        )
                        self.current_run.step_results.append(result)
                        AuditLogger.log_event(actor="policy_engine", event_type="CONFIRMATION_CHANNEL_MISSING", workflow_id=workflow.workflow_id, version_hash=workflow.compute_hash(), ref_ids={"run_id": run_id, "step_id": step.id}, details={"reason": reason_code.value})
                        break

                if mode != "dry_run":
                    valid, approval_reason, approval_record = ApprovalService.verify_approval_for_run(workflow, approval_id or "", parameters)
                    if not valid:
                        self.current_run.state = ExecutionState.STOPPED
                        self.current_run.verification_state = VerificationState.FAILED
                        self.current_run.safe_stop_reason = f"Approval invalid immediately before action: {approval_reason.value}"
                        AuditLogger.log_event(actor="policy_engine", event_type="APPROVAL_DENIED", workflow_id=workflow.workflow_id, version_hash=workflow.compute_hash(), ref_ids={"run_id": run_id, "approval_id": approval_id, "step_id": step.id}, details={"reason": approval_reason.value})
                        break

                # Driver health / availability check
                if mode != "dry_run":
                    if not driver:
                        error_msg = f"capability unavailable: No driver registered for surface '{surface_name}'"
                        result = StepExecutionResult(
                            step_id=step.id, action=step.action.value, decision=decision,
                            reason_code=ReasonCode.ACTION_TYPE_NOT_ALLOWED, passed=False,
                            error_message=error_msg, timestamp=datetime.datetime.now().timestamp()
                        )
                        self.current_run.step_results.append(result)
                        self.current_run.state = ExecutionState.FAILED
                        self.current_run.safe_stop_reason = f"Step failed: {error_msg}"
                        break

                    health = await driver.health()
                    if health.status == "unavailable":
                        error_msg = f"capability unavailable: {health.reason or 'Surface automation unavailable'}"
                        result = StepExecutionResult(
                            step_id=step.id, action=step.action.value, decision=decision,
                            reason_code=ReasonCode.ACTION_TYPE_NOT_ALLOWED, passed=False,
                            error_message=error_msg, timestamp=datetime.datetime.now().timestamp()
                        )
                        self.current_run.step_results.append(result)
                        self.current_run.state = ExecutionState.FAILED
                        self.current_run.safe_stop_reason = f"Step failed: {error_msg}"
                        break

                # Execute Step Actions via Driver
                passed = True
                error_msg = None

                # Step 6: Per-step timeout and bounded retries for idempotent actions
                step_timeout = getattr(step, "timeout_seconds", None) or 15.0
                retries_left = 2 if step.idempotent else 0
                passed = False
                error_msg = None
                observed_page_state = {}

                while True:
                    try:
                        if mode == "dry_run":
                            passed = True
                            error_msg = None
                            observed_page_state = {"dry_run": True, "surface": surface_name}
                        elif not driver:
                            passed = False
                            error_msg = f"Driver for surface '{surface_name}' not available"
                            observed_page_state = {}
                        else:
                            passed, error_msg, observed_page_state = await asyncio.wait_for(
                                driver.act(step, parameters),
                                timeout=step_timeout
                            )
                    except asyncio.TimeoutError:
                        passed = False
                        error_msg = f"Step '{step.name}' timed out after {step_timeout}s"
                        observed_page_state = {"timed_out": True}
                    except Exception as exc:
                        passed = False
                        error_msg = str(exc)
                        observed_page_state = {"exception": str(exc)}

                    if passed or retries_left <= 0:
                        break
                    retries_left -= 1
                    await asyncio.sleep(0.3)

                actions_count += 1

                result = StepExecutionResult(
                    step_id=step.id,
                    action=step.action.value,
                    target_summary=step.target.name if step.target else None,
                    matched_target_strategy=observed_page_state.get("matched_target_strategy"),
                    matched_target_value=observed_page_state.get("matched_target_value"),
                    decision=decision,
                    reason_code=reason_code,
                    passed=passed,
                    observed_state=observed_page_state,
                    error_message=error_msg,
                    timestamp=datetime.datetime.now().timestamp()
                )
                self.current_run.step_results.append(result)
                self._persist_current_run()

                if on_step_update:
                    await on_step_update(result)

                if not passed:
                    self.current_run.state = ExecutionState.FAILED
                    self.current_run.safe_stop_reason = f"Step failed: {error_msg}"
                    break

            # 4. Final Verification (VER-1..4)
            if self.current_run.state not in [ExecutionState.STOPPED, ExecutionState.FAILED]:
                self.current_run.state = ExecutionState.FINAL_VERIFY
                if mode == "dry_run":
                    if workflow.final_postconditions:
                        self.current_run.verification_state = VerificationState.VERIFIED_SUCCESS
                    else:
                        self.current_run.verification_state = VerificationState.UNCERTAIN
                    self.current_run.state = ExecutionState.SUCCESS
                else:
                    # Resolve primary driver
                    primary_surface = "browser"
                    for s in workflow.steps:
                        if s.enabled:
                            primary_surface = s.surface.value if hasattr(s.surface, "value") else str(s.surface)
                            break
                    driver = self.driver_registry.get(primary_surface)
                    if driver:
                        v_state, observed_page_state = await driver.verify(workflow.final_postconditions, parameters)
                    else:
                        v_state, observed_page_state = VerificationState.UNCERTAIN, {}
                    self.current_run.verification_state = v_state
                    self.current_run.state = ExecutionState.SUCCESS if v_state == VerificationState.VERIFIED_SUCCESS else ExecutionState.FAILED

                # Step 6: Populate verification checklist card items
                checklist = []
                for p in workflow.final_postconditions:
                    p_type = getattr(p, "type", "postcondition")
                    p_target = p.target.name if p.target and hasattr(p.target, "name") else (getattr(p, "selector", None) or "Target")
                    p_passed = (self.current_run.verification_state == VerificationState.VERIFIED_SUCCESS)
                    checklist.append({
                        "type": p_type,
                        "target": p_target,
                        "passed": p_passed,
                        "details": f"Postcondition check {p_type} on {p_target} ({'PASSED' if p_passed else 'FAILED'})",
                    })
                self.current_run.verification_checklist = checklist

        finally:
            # Teardown all initialized drivers
            await self.driver_registry.teardown_all()

        self.current_run.ended_at = datetime.datetime.now(datetime.timezone.utc).isoformat()
        self._persist_current_run()
        return self.current_run

    def _resolve_conditions(self, conditions, params: Dict[str, Any]):
        return [condition.model_copy(update={
            "value": self.substitute_params(condition.value, params) if condition.value else condition.value,
            "selector": self.substitute_params(condition.selector, params) if condition.selector else condition.selector,
        }) for condition in conditions]

    def request_stop(self):
        self._stop_requested = True
        if self._pending_confirmation_event:
            self.deny_confirmation("")

    def grant_confirmation(self, run_id: str) -> bool:
        if not self.current_run or self.current_run.state.value != "PENDING_CONFIRMATION":
            return False
        if run_id and self.current_run.id != run_id:
            return False
        self._confirmation_granted = True
        if self._pending_confirmation_event:
            self._pending_confirmation_event.set()
        return True

    def deny_confirmation(self, run_id: str) -> bool:
        if not self.current_run or self.current_run.state.value != "PENDING_CONFIRMATION":
            return False
        if run_id and self.current_run.id != run_id:
            return False
        self._confirmation_granted = False
        if self._pending_confirmation_event:
            self._pending_confirmation_event.set()
        return True

    def is_running(self) -> bool:
        return self._execution_lock.locked()


executor_instance = WorkflowExecutor()
