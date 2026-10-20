from __future__ import annotations
import asyncio
import uuid
import datetime
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
from .target_resolver import TargetResolver


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

    def substitute_params(self, text: str, params: Dict[str, Any]) -> str:
        if not text:
            return text
        result = text
        for k, v in params.items():
            result = result.replace(f"{{{{{k}}}}}", str(v))
        return result

    async def execute_workflow(
        self,
        workflow: WorkflowDefinition,
        parameters: Dict[str, Any],
        approval_id: Optional[str] = None,
        mode: str = "run",  # "dry_run", "test", "run"
        on_step_update: Optional[Callable[[StepExecutionResult], Awaitable[None]]] = None,
        on_confirmation_required: Optional[Callable[[Step, Dict[str, Any]], Awaitable[None]]] = None
    ) -> RunRecord:
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

        AuditLogger.log_event(
            actor="executor",
            event_type="RUN_STARTED",
            workflow_id=workflow.workflow_id,
            version_hash=self.current_run.version_hash,
            ref_ids={"run_id": run_id, "approval_id": approval_id},
            details={"mode": mode}
        )

        # 1. Approval Verification (unless test/dry_run mode where approval is optional or simulated)
        approval_record = None
        if mode == "run":
            if not approval_id:
                self.current_run.state = ExecutionState.STOPPED
                self.current_run.verification_state = VerificationState.FAILED
                self.current_run.safe_stop_reason = "Run blocked: No approval record provided"
                self.current_run.ended_at = datetime.datetime.now(datetime.timezone.utc).isoformat()
                return self.current_run

            valid, reason, approval_record = ApprovalService.verify_approval_for_run(workflow, approval_id)
            if not valid:
                self.current_run.state = ExecutionState.STOPPED
                self.current_run.verification_state = VerificationState.FAILED
                self.current_run.safe_stop_reason = f"Approval verification failed: {reason.value}"
                self.current_run.ended_at = datetime.datetime.now(datetime.timezone.utc).isoformat()
                return self.current_run

        # 2. Initialize Browser Context (if not dry-run)
        if mode != "dry_run":
            if not self.playwright:
                self.playwright = await async_playwright().start()
            self.browser = await self.playwright.chromium.launch(headless=True)
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

            current_url = self.page.url if self.page else ""

            # Check Policy Authorization (POL-1..5)
            decision, reason_code, effective_risk = self.policy_engine.evaluate_step(
                step=step,
                current_url=current_url,
                approval=approval_record,
                actions_executed_count=actions_count
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
            if decision == PolicyDecision.REQUIRE_CONFIRMATION:
                self.current_run.state = ExecutionState.PENDING_CONFIRMATION
                
                # If confirmation callback registered, wait for explicit user grant
                if on_confirmation_required:
                    self._pending_confirmation_event = asyncio.Event()
                    self._confirmation_granted = False
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
                self.current_run.verification_state = VerificationState.VERIFIED_SUCCESS
                self.current_run.state = ExecutionState.SUCCESS
            else:
                v_state, v_details = VerifierEngine.verify_all(workflow.final_postconditions, observed_page_state)
                self.current_run.verification_state = v_state
                self.current_run.state = ExecutionState.SUCCESS if v_state == VerificationState.VERIFIED_SUCCESS else ExecutionState.FAILED

        self.current_run.ended_at = datetime.datetime.now(datetime.timezone.utc).isoformat()

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

            elif step.action == ActionType.SUBMIT:
                locator, err = await TargetResolver.resolve(self.page, step.target)
                if err or not locator:
                    return False, err or "Submit element not found", {}
                await locator.click(timeout=5000)
                await self.page.wait_for_timeout(500)

            elif step.action == ActionType.WAIT_FOR:
                time_ms = step.args.get("ms", 1000)
                await self.page.wait_for_timeout(time_ms)

            # Capture observed state for postcondition checks
            observed["current_url"] = self.page.url
            observed["page_text"] = await self.page.inner_text("body")
            return True, None, observed

        except Exception as e:
            return False, str(e), observed

    def request_stop(self):
        self._stop_requested = True

    def grant_confirmation(self):
        self._confirmation_granted = True
        if self._pending_confirmation_event:
            self._pending_confirmation_event.set()

    def deny_confirmation(self):
        self._confirmation_granted = False
        if self._pending_confirmation_event:
            self._pending_confirmation_event.set()


executor_instance = WorkflowExecutor()
