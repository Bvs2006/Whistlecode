from __future__ import annotations
import asyncio
import json
import uuid
import datetime
import os
from functools import wraps
from typing import Dict, Any, Optional, Callable, Awaitable
from playwright.async_api import async_playwright, Browser, BrowserContext, Page
from ..models.workflow import WorkflowDefinition, Step, ActionType
from ..models.run import RunRecord, ExecutionState, VerificationState, StepExecutionResult
from ..models.policy import PolicyDecision, ReasonCode
from ..models.approval import ApprovalRecord
from ..policy.engine import PolicyEngine
from ..approval.service import ApprovalService
from ..verifier.engine import VerifierEngine
from ..audit.logger import AuditLogger
from ..db.database import get_db_connection
from .target_resolver import TargetResolver


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
      - Actions are strictly typed
      - Policy authorizes every action before execution
      - Approvals are validated against content hashes
      - Safe stops trigger on unexpected state or policy denial
      - Outcomes are verified against postconditions
    """

    def __init__(self, policy_engine: Optional[PolicyEngine] = None):
        self.policy_engine = policy_engine or PolicyEngine()
        self.playwright = None
        self.browser: Optional[Browser] = None
        self.context: Optional[BrowserContext] = None
        self.page: Optional[Page] = None
        self.current_run: Optional[RunRecord] = None
        self._stop_requested: bool = False
        self._pending_confirmation_event: Optional[asyncio.Event] = None
        self._confirmation_granted: bool = False
        self._execution_lock = asyncio.Lock()
        self.pending_confirmation: Optional[Dict[str, Any]] = None

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
        run_id = f"run_{uuid.uuid4().hex[:10]}"
        now = datetime.datetime.now(datetime.timezone.utc).isoformat()
        self._stop_requested = False

        self.current_run = RunRecord(
            id=run_id,
            workflow_id=workflow.workflow_id,
            version=workflow.version,
            version_hash=workflow.content_hash or workflow.compute_hash(),
            approval_id=approval_id,
            mode=mode,
            parameters=parameters,
            state=ExecutionState.PRECHECK,
            started_at=now
        )
        self.pending_confirmation = None
        self._persist_current_run()

        AuditLogger.log_event(
            actor="executor",
            event_type="RUN_STARTED",
            workflow_id=workflow.workflow_id,
            version_hash=self.current_run.version_hash,
            ref_ids={"run_id": run_id, "approval_id": approval_id},
            details={"mode": mode}
        )

        # Dry runs have no browser and no side effects. Every executable mode
        # requires a human-signed approval.
        approval_record = None
        if mode != "dry_run":
            if not approval_id:
                self.current_run.state = ExecutionState.STOPPED
                self.current_run.verification_state = VerificationState.FAILED
                self.current_run.safe_stop_reason = "Run blocked: No approval record provided"
                self.current_run.ended_at = datetime.datetime.now(datetime.timezone.utc).isoformat()
                AuditLogger.log_event(actor="policy_engine", event_type="APPROVAL_DENIED", workflow_id=workflow.workflow_id, version_hash=workflow.compute_hash(), ref_ids={"run_id": run_id}, details={"reason": "APPROVAL_NOT_FOUND"})
                self._persist_current_run()
                return self.current_run

            valid, reason, approval_record = ApprovalService.verify_approval_for_run(workflow, approval_id, parameters)
            if not valid:
                self.current_run.state = ExecutionState.STOPPED
                self.current_run.verification_state = VerificationState.FAILED
                self.current_run.safe_stop_reason = f"Approval verification failed: {reason.value}"
                self.current_run.ended_at = datetime.datetime.now(datetime.timezone.utc).isoformat()
                AuditLogger.log_event(actor="policy_engine", event_type="APPROVAL_DENIED", workflow_id=workflow.workflow_id, version_hash=workflow.compute_hash(), ref_ids={"run_id": run_id, "approval_id": approval_id}, details={"reason": reason.value})
                self._persist_current_run()
                return self.current_run

        # 2. Initialize Browser Context (if not dry-run)
        if mode != "dry_run":
            if not self.playwright:
                self.playwright = await async_playwright().start()
            # Runs are visible by default so the user can follow automation on
            # the real site. Headless mode remains available for controlled
            # environments without a desktop via WHISTLECODE_HEADLESS=true.
            headless = os.getenv("WHISTLECODE_HEADLESS", "false").strip().lower() in {"1", "true", "yes"}
            self.browser = await self.playwright.chromium.launch(headless=headless)
            self.context = await self.browser.new_context(viewport={"width": 1280, "height": 800})
            self.page = await self.context.new_page()

        # 3. Iterate Steps
        actions_count = 0
        observed_page_state = {"current_url": "", "page_text": "", "element_values": {}, "list_contents": {}}

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

            current_url = self.page.url if self.page else ""

            # Reload and verify the signed grant before every protected action
            # so revocation, expiry, scope edits, or plan edits take effect mid-run.
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
                # Dry runs are non-executable previews. Validate destinations
                # against this workflow's declared scope, just as the plan
                # preview endpoint does; live runs still use the signed grant.
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
                    "risk": effective_risk.value
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
                
                # If confirmation callback registered, wait for explicit user grant
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
                    # Await confirmation (with 120s timeout)
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

                    # A grant may have expired or been revoked while the user
                    # was reviewing the consequential action.
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

            # Execute Step Actions
            passed = True
            error_msg = None

            if mode == "dry_run":
                # Dry run does not trigger real effects (TST-2)
                passed = True
            else:
                passed, error_msg, observed_page_state = await self._perform_action(step, parameters)

            actions_count += 1

            result = StepExecutionResult(
                step_id=step.id,
                action=step.action.value,
                target_summary=step.target.name if step.target else None,
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
                # Dry-run: no browser is available to check live page state.
                # If the workflow declares final postconditions we treat the run as
                # VERIFIED_SUCCESS (the plan is structurally sound); if there are no
                # postconditions at all we can only say UNCERTAIN.
                if workflow.final_postconditions:
                    self.current_run.verification_state = VerificationState.VERIFIED_SUCCESS
                else:
                    self.current_run.verification_state = VerificationState.UNCERTAIN
                self.current_run.state = ExecutionState.SUCCESS
            else:
                final_conditions = self._resolve_conditions(workflow.final_postconditions, parameters)
                observed_page_state = await self._collect_verification_state(final_conditions)
                v_state, _v_details = VerifierEngine.verify_all(final_conditions, observed_page_state)
                self.current_run.verification_state = v_state
                self.current_run.state = ExecutionState.SUCCESS if v_state == VerificationState.VERIFIED_SUCCESS else ExecutionState.FAILED

        self.current_run.ended_at = datetime.datetime.now(datetime.timezone.utc).isoformat()
        self._persist_current_run()

        # Teardown
        if self.context:
            await self.context.close()
            self.context = None
        if self.browser:
            await self.browser.close()
            self.browser = None

        return self.current_run

    async def _perform_action(self, step: Step, params: Dict[str, Any]) -> tuple[bool, Optional[str], Dict[str, Any]]:
        if not self.page:
            return False, "Browser page not initialized", {}

        observed: Dict[str, Any] = {}
        try:
            if step.action == ActionType.NAVIGATE:
                raw_url = step.args.get("url", "")
                url = self.substitute_params(raw_url, params)
                await self.page.goto(url, timeout=10000)
                await self.page.wait_for_load_state("domcontentloaded")

            elif step.action == ActionType.CLICK:
                locator, err = await TargetResolver.resolve(self.page, step.target)
                if err or not locator:
                    return False, err or "Element not found", {}
                await locator.click(timeout=5000)

            elif step.action == ActionType.TYPE:
                locator, err = await TargetResolver.resolve(self.page, step.target)
                if err or not locator:
                    return False, err or "Element not found", {}
                raw_val = step.args.get("value", "")
                val = self.substitute_params(raw_val, params)
                await locator.fill(val, timeout=5000)

            elif step.action == ActionType.SELECT:
                locator, err = await TargetResolver.resolve(self.page, step.target)
                if err or not locator:
                    return False, err or "Element not found", {}
                raw_val = step.args.get("value", "")
                val = self.substitute_params(raw_val, params)
                await locator.select_option(val, timeout=5000)

            elif step.action in (ActionType.CHECK, ActionType.UNCHECK):
                locator, err = await TargetResolver.resolve(self.page, step.target)
                if err or not locator:
                    return False, err or "Checkbox target not found", {}
                if step.action == ActionType.CHECK:
                    await locator.check(timeout=5000)
                else:
                    await locator.uncheck(timeout=5000)

            elif step.action == ActionType.ASSERT:
                locator, err = await TargetResolver.resolve(self.page, step.target)
                if err or not locator:
                    return False, err or "Assertion target not found", {}
                await locator.wait_for(state="visible", timeout=5000)
                expected = self.substitute_params(str(step.args.get("text") or step.args.get("value") or ""), params)
                if expected:
                    try:
                        actual_text = await locator.inner_text(timeout=3000)
                    except Exception:
                        actual_text = await locator.input_value(timeout=3000)
                    if expected not in actual_text:
                        return False, f"Target did not contain expected text: {expected}", {}

            elif step.action == ActionType.EXTRACT:
                locator, err = await TargetResolver.resolve(self.page, step.target)
                if err or not locator:
                    return False, err or "Extraction target not found", {}
                extracted = await locator.inner_text(timeout=5000)
                observed["extracted_text"] = extracted[:2000]

            elif step.action == ActionType.SUBMIT:
                locator, err = await TargetResolver.resolve(self.page, step.target)
                if err or not locator:
                    return False, err or "Submit element not found", {}
                await locator.click(timeout=5000)
                await self.page.wait_for_timeout(500)

            elif step.action == ActionType.WAIT_FOR:
                if step.target:
                    locator, err = await TargetResolver.resolve(self.page, step.target)
                    if err or not locator:
                        return False, err or "Wait target not found", {}
                    await locator.wait_for(state="visible", timeout=int(step.args.get("timeout_ms", 10000)))
                else:
                    time_ms = max(0, min(int(step.args.get("ms", 1000)), 30000))
                    await self.page.wait_for_timeout(time_ms)

            elif step.action == ActionType.CONFIRM_GATE:
                # The user has already passed the independent live confirmation gate.
                observed["confirmation_granted"] = True

            else:
                return False, f"Unsupported executor action: {step.action.value}", {}

            if step.postconditions:
                postconditions = self._resolve_conditions(step.postconditions, params)
                verification_state = await self._collect_verification_state(postconditions)
                passed, details = VerifierEngine.verify_all(postconditions, verification_state)
                if passed != VerificationState.VERIFIED_SUCCESS:
                    return False, f"Step postcondition failed: {details}", {"current_url": self.page.url}
            observed["current_url"] = self.page.url
            return True, None, observed

        except Exception as e:
            return False, str(e), observed

    async def _collect_verification_state(self, conditions) -> Dict[str, Any]:
        if not self.page:
            return {}
        state: Dict[str, Any] = {
            "current_url": self.page.url,
            "page_text": await self.page.locator("body").inner_text(timeout=5000),
            "element_values": {}, "elements_found": {}, "list_contents": {},
        }
        for condition in conditions:
            condition_type = condition.type.lower()
            selector = condition.selector or (condition.target.test_id if condition.target else None) or (condition.target.css_fallback if condition.target else None) or (condition.target.name if condition.target else None)
            if condition_type in {"element_exists", "element_visible"}:
                key = selector or (condition.target.name if condition.target else "target")
                if condition.target:
                    locator, error = await TargetResolver.resolve(self.page, condition.target)
                elif selector:
                    locator, error = self._selector_locator(selector), None
                else:
                    locator, error = None, "Missing verification target"
                try:
                    if locator and not error and await locator.count() > 0:
                        try:
                            await locator.first.wait_for(state="visible", timeout=1000)
                            state["elements_found"][key] = True
                        except Exception:
                            state["elements_found"][key] = False
                    else:
                        state["elements_found"][key] = False
                except Exception:
                    state["elements_found"][key] = False
            elif condition_type in {"field_value_equals", "value_equals"}:
                if condition.target:
                    locator, error = await TargetResolver.resolve(self.page, condition.target)
                elif selector:
                    locator, error = self._selector_locator(selector), None
                else:
                    locator, error = None, "Missing verification selector"
                if locator and not error:
                    try:
                        value = await locator.input_value(timeout=1000)
                    except Exception:
                        value = await locator.inner_text(timeout=1000)
                    state["element_values"][selector or (condition.target.name if condition.target else None) or "target"] = value
            elif condition_type == "list_contains" and selector:
                locator = self._selector_locator(selector)
                try:
                    state["list_contents"][selector] = await locator.all_inner_texts()
                except Exception:
                    state["list_contents"][selector] = []
        return state

    def _resolve_conditions(self, conditions, params: Dict[str, Any]):
        return [condition.model_copy(update={
            "value": self.substitute_params(condition.value, params) if condition.value else condition.value,
            "selector": self.substitute_params(condition.selector, params) if condition.selector else condition.selector,
        }) for condition in conditions]

    def _selector_locator(self, selector: str):
        if not self.page:
            raise RuntimeError("Browser page not initialized")
        if selector.startswith(("#", ".", "[", "//")) or any(char in selector for char in (" ", ">", ":")):
            return self.page.locator(selector)
        escaped = selector.replace('"', '\\"')
        return self.page.locator(f'[data-testid="{escaped}"], #{selector}')

    def request_stop(self):
        self._stop_requested = True
        if self._pending_confirmation_event:
            self.deny_confirmation()

    def grant_confirmation(self, run_id: str) -> bool:
        if not self.current_run or self.current_run.id != run_id or self.current_run.state.value != "PENDING_CONFIRMATION":
            return False
        self._confirmation_granted = True
        if self._pending_confirmation_event:
            self._pending_confirmation_event.set()
        return True

    def deny_confirmation(self, run_id: str) -> bool:
        if not self.current_run or self.current_run.id != run_id or self.current_run.state.value != "PENDING_CONFIRMATION":
            return False
        self._confirmation_granted = False
        if self._pending_confirmation_event:
            self._pending_confirmation_event.set()
        return True

    def is_running(self) -> bool:
        return self._execution_lock.locked()


executor_instance = WorkflowExecutor()
