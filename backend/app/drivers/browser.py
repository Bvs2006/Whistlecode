from __future__ import annotations
import os
from typing import Dict, Any, Optional, Tuple, List
from playwright.async_api import async_playwright, Browser, BrowserContext, Page, Locator
from ..models.workflow import Step, ActionType, TargetCandidate, Postcondition
from ..models.run import VerificationState
from ..verifier.engine import VerifierEngine
from ..executor.target_resolver import TargetResolver
from .base import BaseDriver, DriverHealth


class BrowserDriver(BaseDriver):
    """
    Playwright Browser Driver (EXE-3 / Step 2).
    Encapsulates browser session lifecycle, element target resolution,
    action execution, state observation, and verification.
    """

    def __init__(self):
        super().__init__(surface="browser")
        self.playwright = None
        self.browser: Optional[Browser] = None
        self.context: Optional[BrowserContext] = None
        self.page: Optional[Page] = None

    async def health(self) -> DriverHealth:
        from ..integrations.probes import playwright_available
        if not playwright_available():
            return DriverHealth(
                status="unavailable",
                surface="browser",
                reason="Playwright is not installed on this system",
            )
        return DriverHealth(
            status="available",
            surface="browser",
            details={
                "headless": os.getenv("WHISTLECODE_HEADLESS", "false").strip().lower() in {"1", "true", "yes"},
                "active_session": bool(self.page is not None),
            }
        )

    async def start(self) -> None:
        """Starts Playwright browser and context if not already active."""
        if not self.playwright:
            self.playwright = await async_playwright().start()
        if not self.browser:
            headless = os.getenv("WHISTLECODE_HEADLESS", "false").strip().lower() in {"1", "true", "yes"}
            self.browser = await self.playwright.chromium.launch(headless=headless)
        if not self.context:
            self.context = await self.browser.new_context(viewport={"width": 1280, "height": 800})
        if not self.page:
            self.page = await self.context.new_page()

    async def teardown(self) -> None:
        """Closes browser page, context, and Playwright session."""
        if self.page:
            try:
                await self.page.close()
            except Exception:
                pass
            self.page = None
        if self.context:
            try:
                await self.context.close()
            except Exception:
                pass
            self.context = None
        if self.browser:
            try:
                await self.browser.close()
            except Exception:
                pass
            self.browser = None
        if self.playwright:
            try:
                await self.playwright.stop()
            except Exception:
                pass
            self.playwright = None

    def substitute_params(self, text: str, params: Dict[str, Any]) -> str:
        if not text:
            return text
        result = text
        for k, v in params.items():
            result = result.replace(f"{{{{{k}}}}}", str(v))
        return result

    async def find_target(
        self,
        step: Step,
        candidates: Optional[List[TargetCandidate]] = None
    ) -> Tuple[Optional[Locator], Optional[str], Optional[TargetCandidate]]:
        if not self.page:
            return None, "Browser page not initialized", None

        candidate_list = candidates if candidates is not None else step.get_target_candidates()
        context = step.target.context if step.target else None
        return await TargetResolver.resolve_candidates(self.page, candidate_list, context)

    async def act(
        self,
        step: Step,
        parameters: Dict[str, Any]
    ) -> Tuple[bool, Optional[str], Dict[str, Any]]:
        if not self.page:
            await self.start()

        if not self.page:
            return False, "Browser page failed to initialize", {}

        observed: Dict[str, Any] = {"surface": "browser"}
        try:
            if step.action == ActionType.NAVIGATE:
                raw_url = step.args.get("url", "")
                url = self.substitute_params(raw_url, parameters)
                await self.page.goto(url, timeout=10000)
                await self.page.wait_for_load_state("domcontentloaded")

            elif step.action == ActionType.CLICK:
                locator, err, winning = await self.find_target(step)
                if err or not locator:
                    return False, err or "Element not found", observed
                if winning:
                    observed["matched_target_strategy"] = winning.strategy
                    observed["matched_target_value"] = winning.value
                await locator.click(timeout=5000)

            elif step.action == ActionType.TYPE:
                locator, err, winning = await self.find_target(step)
                if err or not locator:
                    return False, err or "Element not found", observed
                if winning:
                    observed["matched_target_strategy"] = winning.strategy
                    observed["matched_target_value"] = winning.value
                raw_val = step.args.get("value", "")
                val = self.substitute_params(raw_val, parameters)
                await locator.fill(val, timeout=5000)

            elif step.action == ActionType.SELECT:
                locator, err, winning = await self.find_target(step)
                if err or not locator:
                    return False, err or "Element not found", observed
                if winning:
                    observed["matched_target_strategy"] = winning.strategy
                    observed["matched_target_value"] = winning.value
                raw_val = step.args.get("value", "")
                val = self.substitute_params(raw_val, parameters)
                await locator.select_option(val, timeout=5000)

            elif step.action in (ActionType.CHECK, ActionType.UNCHECK):
                locator, err, winning = await self.find_target(step)
                if err or not locator:
                    return False, err or "Checkbox target not found", observed
                if winning:
                    observed["matched_target_strategy"] = winning.strategy
                    observed["matched_target_value"] = winning.value
                if step.action == ActionType.CHECK:
                    await locator.check(timeout=5000)
                else:
                    await locator.uncheck(timeout=5000)

            elif step.action == ActionType.ASSERT:
                locator, err, winning = await self.find_target(step)
                if err or not locator:
                    return False, err or "Assertion target not found", observed
                if winning:
                    observed["matched_target_strategy"] = winning.strategy
                    observed["matched_target_value"] = winning.value
                await locator.wait_for(state="visible", timeout=5000)
                expected = self.substitute_params(str(step.args.get("text") or step.args.get("value") or ""), parameters)
                if expected:
                    try:
                        actual_text = await locator.inner_text(timeout=3000)
                    except Exception:
                        actual_text = await locator.input_value(timeout=3000)
                    if expected not in actual_text:
                        return False, f"Target did not contain expected text: {expected}", observed

            elif step.action == ActionType.EXTRACT:
                locator, err, winning = await self.find_target(step)
                if err or not locator:
                    return False, err or "Extraction target not found", observed
                if winning:
                    observed["matched_target_strategy"] = winning.strategy
                    observed["matched_target_value"] = winning.value
                extracted = await locator.inner_text(timeout=5000)
                observed["extracted_text"] = extracted[:2000]

            elif step.action == ActionType.SUBMIT:
                locator, err, winning = await self.find_target(step)
                if err or not locator:
                    return False, err or "Submit element not found", observed
                if winning:
                    observed["matched_target_strategy"] = winning.strategy
                    observed["matched_target_value"] = winning.value
                await locator.click(timeout=5000)
                await self.page.wait_for_timeout(500)

            elif step.action == ActionType.WAIT_FOR:
                if step.target or step.target_candidates:
                    locator, err, winning = await self.find_target(step)
                    if err or not locator:
                        return False, err or "Wait target not found", observed
                    if winning:
                        observed["matched_target_strategy"] = winning.strategy
                        observed["matched_target_value"] = winning.value
                    await locator.wait_for(state="visible", timeout=int(step.args.get("timeout_ms", 10000)))
                else:
                    time_ms = max(0, min(int(step.args.get("ms", 1000)), 30000))
                    await self.page.wait_for_timeout(time_ms)

            elif step.action == ActionType.CONFIRM_GATE:
                observed["confirmation_granted"] = True

            else:
                return False, f"Unsupported browser executor action: {step.action.value}", observed

            # Step postconditions check
            if step.postconditions:
                resolved_conditions = self._resolve_conditions(step.postconditions, parameters)
                state = await self.collect_verification_state(resolved_conditions)
                v_state, details = VerifierEngine.verify_all(resolved_conditions, state)
                if v_state != VerificationState.VERIFIED_SUCCESS:
                    return False, f"Step postcondition failed: {details}", {"current_url": self.page.url}

            observed["current_url"] = self.page.url
            return True, None, observed

        except Exception as e:
            if self.page:
                try:
                    observed["current_url"] = self.page.url
                except Exception:
                    pass
            return False, str(e), observed

    def _resolve_conditions(self, conditions: List[Postcondition], params: Dict[str, Any]) -> List[Postcondition]:
        resolved = []
        for c in conditions:
            c_dict = c.model_dump()
            if c_dict.get("value"):
                c_dict["value"] = self.substitute_params(c_dict["value"], params)
            resolved.append(Postcondition.model_validate(c_dict))
        return resolved

    async def observe(self, query: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
        if not self.page:
            return {"current_url": "", "surface": "browser"}
        try:
            return {
                "surface": "browser",
                "current_url": self.page.url,
                "title": await self.page.title(),
            }
        except Exception:
            return {"current_url": "", "surface": "browser"}

    async def capture_state(self) -> Dict[str, Any]:
        if not self.page:
            return {"surface": "browser", "current_url": "", "page_text": ""}
        try:
            return {
                "surface": "browser",
                "current_url": self.page.url,
                "page_text": await self.page.locator("body").inner_text(timeout=5000),
            }
        except Exception:
            return {"surface": "browser", "current_url": "", "page_text": ""}

    def _selector_locator(self, selector: str) -> Locator:
        return self.page.locator(selector)

    async def collect_verification_state(self, conditions: List[Postcondition]) -> Dict[str, Any]:
        if not self.page:
            return {}
        state: Dict[str, Any] = {
            "current_url": self.page.url,
            "page_text": await self.page.locator("body").inner_text(timeout=5000),
            "element_values": {},
            "elements_found": {},
            "list_contents": {},
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
                    locator, error = None, "Missing verification target"
                val = ""
                if locator and not error:
                    try:
                        val = await locator.first.input_value(timeout=1000)
                    except Exception:
                        val = await locator.first.inner_text(timeout=1000)
                state["element_values"][selector or condition.value or "target"] = val

            elif condition_type == "list_contains":
                if selector:
                    items = await self.page.locator(selector).all_inner_texts()
                    state["list_contents"][selector] = items
        return state

    async def verify(
        self,
        conditions: List[Postcondition],
        parameters: Dict[str, Any]
    ) -> Tuple[VerificationState, Dict[str, Any]]:
        resolved_conditions = self._resolve_conditions(conditions, parameters)
        state = await self.collect_verification_state(resolved_conditions)
        v_state, details = VerifierEngine.verify_all(resolved_conditions, state)
        return v_state, state
