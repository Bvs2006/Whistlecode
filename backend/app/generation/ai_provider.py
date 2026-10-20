from __future__ import annotations
import json
import uuid
import re
import hashlib
from abc import ABC, abstractmethod
from typing import List, Dict, Any, Optional
from pydantic import BaseModel, Field, ValidationError

from ..models.workflow import (
    WorkflowDefinition, Step, ActionType, RiskLevel,
    ParameterDefinition, Precondition, Postcondition, TargetDescriptor,
    ClarificationQuestion
)


MAX_OUTPUT_SIZE_BYTES = 500_000  # 500 KB ceiling to guard against memory exhaustion
REGISTERED_ACTION_TYPES = {a.value for a in ActionType}

PROMPT_INJECTION_PATTERNS = [
    re.compile(r"ignore\s+(?:all\s+)?previous\s+instructions", re.IGNORECASE),
    re.compile(r"system\s+override", re.IGNORECASE),
    re.compile(r"you\s+are\s+now\s+in\s+developer\s+mode", re.IGNORECASE),
    re.compile(r"<script.*?>.*?</script>", re.IGNORECASE | re.DOTALL),
    re.compile(r"(?:exec|eval|system|spawn)\s*\(", re.IGNORECASE),
]


class WorkflowGenerationError(Exception):
    """Raised when generated output violates schema or policy."""
    pass


class MalformedOutputError(WorkflowGenerationError):
    pass


class UnsupportedActionError(WorkflowGenerationError):
    pass


class PromptInjectionDetectedError(WorkflowGenerationError):
    pass


class WorkflowProposalResult(BaseModel):
    workflow: Optional[WorkflowDefinition] = None
    provider_name: str
    schema_version: str = "v1"
    clarifications: List[ClarificationQuestion] = Field(default_factory=list)
    uncertainty_flags: List[str] = Field(default_factory=list)
    status: str = "success"  # "success", "clarification_needed", "rejected"
    rejection_reason: Optional[str] = None
    audit_metadata: Dict[str, Any] = Field(default_factory=dict)


class AIWorkflowProvider(ABC):
    """Replaceable AI Workflow Generation Provider Interface."""

    @abstractmethod
    async def generate_workflow_proposal(
        self,
        sanitized_observations: List[Dict[str, Any]],
        task_goal: str,
        schema_version: str = "v1"
    ) -> WorkflowProposalResult:
        pass


class MockAIWorkflowProvider(AIWorkflowProvider):
    """
    Mock AI Provider for development and automated test suites.
    Simulates structured LLM workflow synthesis from sanitized observations.
    Strictly validates schema, rejects unknown actions, detects prompt injection,
    and isolates AI proposals from execution.
    """

    def __init__(self, provider_name: str = "MockSynthesizer-v1"):
        self.provider_name = provider_name

    def _inspect_for_prompt_injection(self, text: str) -> None:
        """Inspects observed text for prompt injection vectors."""
        for pattern in PROMPT_INJECTION_PATTERNS:
            if pattern.search(text):
                raise PromptInjectionDetectedError(
                    f"Prompt injection pattern detected in observation content: {pattern.pattern}"
                )

    def _validate_raw_output(self, raw_json_str: str) -> Dict[str, Any]:
        """Validates raw output size and JSON structure."""
        if len(raw_json_str.encode("utf-8")) > MAX_OUTPUT_SIZE_BYTES:
            raise MalformedOutputError(f"Generated output exceeds maximum size of {MAX_OUTPUT_SIZE_BYTES} bytes.")

        try:
            data = json.loads(raw_json_str)
        except json.JSONDecodeError as e:
            raise MalformedOutputError(f"Malformed JSON returned by provider: {str(e)}")

        if not isinstance(data, dict):
            raise MalformedOutputError("Provider output must be a JSON object.")

        return data

    def _validate_action_types(self, steps_data: List[Dict[str, Any]]) -> None:
        """Ensures all proposed steps use strictly registered action types."""
        for idx, s in enumerate(steps_data):
            action = s.get("action")
            if not action or action not in REGISTERED_ACTION_TYPES:
                raise UnsupportedActionError(
                    f"Step {idx + 1} specifies unsupported or unapproved action type: '{action}'. "
                    f"Must be one of: {sorted(REGISTERED_ACTION_TYPES)}"
                )

    async def generate_workflow_proposal(
        self,
        sanitized_observations: List[Dict[str, Any]],
        task_goal: str,
        schema_version: str = "v1"
    ) -> WorkflowProposalResult:
        # 1. Defend against prompt injection in observations
        self._inspect_for_prompt_injection(task_goal)
        for obs in sanitized_observations:
            val = str(obs.get("value") or "")
            target = str(obs.get("target") or "")
            self._inspect_for_prompt_injection(val)
            self._inspect_for_prompt_injection(target)

        # 2. Check for empty observations
        if not sanitized_observations:
            raise WorkflowGenerationError("Cannot generate workflow from empty observation set.")

        # 3. Disambiguation & Clarification checks (GEN-2, SUGILITE inspiration)
        clarifications: List[ClarificationQuestion] = []
        uncertainty_flags: List[str] = []

        for idx, obs in enumerate(sanitized_observations):
            target_str = str(obs.get("target") or "").lower()
            action_str = str(obs.get("action") or "").lower()

            if obs.get("is_ambiguous") or any(k in target_str for k in ["restaurant", "option", "catalog", "choice"]):
                clarifications.append(ClarificationQuestion(
                    id=f"clarify_step_{idx + 1}",
                    step_id=f"s{idx + 1}",
                    question="Did you select this option because of price, distance or rating?",
                    explanation=f"Step {idx + 1} clicked '{obs.get('target')}' from candidate items without a sorting filter.",
                    options=[
                        "Rating (Highest rated >= 4.5)",
                        "Price (Budget / lowest tier)",
                        "Distance (Nearest location)",
                        "Exact item name"
                    ],
                    selected_option="Rating (Highest rated >= 4.5)"
                ))
                uncertainty_flags.append(f"Ambiguity in step {idx + 1} selection criteria")

        # 4. Construct synthetic JSON proposal (Mock LLM response)
        parameters: List[Dict[str, Any]] = []
        steps: List[Dict[str, Any]] = []

        seen_params = set()
        for idx, obs in enumerate(sanitized_observations):
            step_id = f"s{idx + 1}"
            raw_action = obs.get("action", "click").lower()
            if "navigate" in raw_action or "url" in raw_action:
                action = ActionType.NAVIGATE.value
            elif "type" in raw_action or "input" in raw_action:
                action = ActionType.TYPE.value
            elif "submit" in raw_action:
                action = ActionType.SUBMIT.value
            elif "assert" in raw_action:
                action = ActionType.ASSERT.value
            elif "select" in raw_action:
                action = ActionType.SELECT.value
            else:
                action = ActionType.CLICK.value
            target_name = obs.get("target", f"Element {idx + 1}")
            val = obs.get("value")

            args = {}
            if val and val != "[REDACTED_SECRET]":
                param_name = f"param_{re.sub(r'[^a-zA-Z0-9_]', '_', target_name).lower()[:16]}"
                if param_name not in seen_params:
                    seen_params.add(param_name)
                    parameters.append({
                        "name": param_name,
                        "type": "string",
                        "description": f"Extracted parameter for {target_name}",
                        "default_value": val,
                        "required": True,
                    })
                args["value"] = f"{{{{{param_name}}}}}"

            steps.append({
                "id": step_id,
                "name": f"{action.capitalize()} {target_name}",
                "action": action,
                "target": {
                    "name": target_name,
                    "role": obs.get("role", "button"),
                    "test_id": f"ctrl_{idx + 1}"
                },
                "args": args,
                "risk": "high" if action == "submit" else "low",
                "requires_confirmation": action == "submit",
                "idempotent": action != "submit",
                "preconditions": [],
                "postconditions": [{"type": "element_exists", "selector": ".alert-success"}] if action == "submit" else [],
                "enabled": True,
            })

        mock_payload = {
            "workflow_id": f"wf_prop_{uuid.uuid4().hex[:8]}",
            "title": task_goal[:50] or "Synthesized Workflow",
            "intent": task_goal,
            "allowed_origins": ["http://localhost:8000"],
            "parameters": parameters,
            "steps": steps,
            "final_postconditions": [{"type": "element_exists", "selector": ".alert-success"}],
            "clarifications": [c.model_dump() for c in clarifications],
            "version": 1,
            "content_hash": f"sha256:{hashlib.sha256(json.dumps(steps, sort_keys=True).encode()).hexdigest()}",
            "change_summary": "Initial AI proposal from reviewed observations",
        }

        # 5. Validate through schema pipeline
        raw_json_str = json.dumps(mock_payload)
        parsed_data = self._validate_raw_output(raw_json_str)
        self._validate_action_types(parsed_data.get("steps", []))

        try:
            workflow = WorkflowDefinition(**parsed_data)
        except ValidationError as e:
            raise MalformedOutputError(f"Workflow schema validation failed: {str(e)}")

        audit_entry = {
            "provider": self.provider_name,
            "schema_version": schema_version,
            "timestamp": uuid.uuid4().hex,
            "steps_count": len(workflow.steps),
            "content_hash": workflow.content_hash,
            "clarification_count": len(clarifications),
        }

        return WorkflowProposalResult(
            workflow=workflow,
            provider_name=self.provider_name,
            schema_version=schema_version,
            clarifications=clarifications,
            uncertainty_flags=uncertainty_flags,
            status="clarification_needed" if clarifications else "success",
            audit_metadata=audit_entry
        )
