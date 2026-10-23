from __future__ import annotations
import re
from typing import List, Dict, Any, Tuple, Optional
from ..models.workflow import Postcondition, Precondition
from ..models.run import VerificationState


class VerifierEngine:
    """
    Deterministic postcondition & precondition verification engine.
    Zero LLM runtime reliance.
    Produces: VERIFIED_SUCCESS, FAILED, or UNCERTAIN.
    """

    @staticmethod
    def evaluate_condition(
        condition: Postcondition | Precondition,
        observed_state: Dict[str, Any]
    ) -> Tuple[bool, str]:
        """
        Evaluates a single condition against the observed DOM / page state.
        observed_state typically includes:
          - current_url
          - page_text
          - element_values: dict[selector/role/name, str]
          - list_contents: dict[selector, list[str]]
        """
        cond_type = condition.type.lower()
        expected_value = str(condition.value or "")

        if cond_type == "url_matches":
            current_url = observed_state.get("current_url", "")
            if not current_url:
                return False, "Current URL is missing in observed state"
            if expected_value in current_url or re.search(re.escape(expected_value), current_url):
                return True, f"URL '{current_url}' matches expected pattern '{expected_value}'"
            return False, f"URL '{current_url}' did not match expected pattern '{expected_value}'"

        elif cond_type in ["field_value_equals", "value_equals"]:
            selector = condition.selector or (condition.target.test_id if condition.target else "") or (condition.target.css_fallback if condition.target else "") or ""
            target_key = selector or (condition.target.name if condition.target else "")
            
            # Look up in element_values
            field_values = observed_state.get("element_values", {})
            actual = field_values.get(target_key, field_values.get(selector, ""))
            if actual == expected_value:
                return True, f"Field '{target_key}' value '{actual}' equals expected '{expected_value}'"
            return False, f"Field '{target_key}' value '{actual}' != expected '{expected_value}'"

        elif cond_type == "list_contains":
            selector = condition.selector or "#list"
            lists = observed_state.get("list_contents", {})
            items = lists.get(selector, [])
            # Also check text across the page if selector is broad
            page_text = observed_state.get("page_text", "")

            matched = any(expected_value.lower() in item.lower() for item in items)
            if not matched and expected_value.lower() in page_text.lower():
                matched = True

            if matched:
                return True, f"List '{selector}' or page contains expected item '{expected_value}'"
            return False, f"Item '{expected_value}' not found in list '{selector}'"

        elif cond_type in ["element_exists", "element_visible"]:
            elements_found = observed_state.get("elements_found", {})
            selector = condition.selector or (condition.target.test_id if condition.target else "") or (condition.target.css_fallback if condition.target else "") or (condition.target.name if condition.target else "")
            exists = elements_found.get(selector, False)
            if exists:
                return True, f"Element '{selector}' is present and visible"
            return False, f"Element '{selector}' was not found in page"

        elif cond_type == "text_contains":
            page_text = observed_state.get("page_text", "")
            if expected_value.lower() in page_text.lower():
                return True, f"Page text contains expected string '{expected_value}'"
            return False, f"Expected text '{expected_value}' not found in page"

        # If condition type is unknown or cannot be reliably verified
        return False, f"Unsupported condition type '{cond_type}'"

    @classmethod
    def verify_all(
        cls,
        conditions: List[Postcondition],
        observed_state: Dict[str, Any]
    ) -> Tuple[VerificationState, List[Dict[str, Any]]]:
        if not conditions:
            # PRD: Runs without verified postconditions cannot claim success unconditionally
            return VerificationState.UNCERTAIN, [{"status": "uncertain", "reason": "No explicit postconditions defined"}]

        results = []
        any_failed = False
        all_passed = True

        for cond in conditions:
            passed, detail = cls.evaluate_condition(cond, observed_state)
            results.append({
                "type": cond.type,
                "expected": cond.value,
                "passed": passed,
                "detail": detail
            })
            if not passed:
                all_passed = False
                any_failed = True

        if all_passed:
            return VerificationState.VERIFIED_SUCCESS, results
        elif any_failed:
            return VerificationState.FAILED, results
        else:
            return VerificationState.UNCERTAIN, results
