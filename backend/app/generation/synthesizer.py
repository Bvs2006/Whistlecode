from __future__ import annotations
import json
import uuid
import re
from typing import List, Dict, Any, Optional
from ..models.events import RecordingSession, RecordedEvent, EventType
from ..models.workflow import (
    WorkflowDefinition, Step, ActionType, RiskLevel, 
    ParameterDefinition, Precondition, Postcondition, TargetDescriptor,
    ClarificationQuestion
)
from ..policy.engine import PolicyEngine


class WorkflowSynthesizer:
    """
    Synthesizes a structured, schema-compliant Workflow from recorded demonstration events.
    Applies:
      - Parameter inference (GEN-3)
      - Pre/postcondition synthesis (GEN-4)
      - Deterministic risk classification via PolicyEngine (GEN-7)
      - Clarification dialogue generation (SUGILITE paper inspiration)
      - Reusable conditional workflow generation
    """

    def __init__(self):
        self.policy_engine = PolicyEngine()

    def generate_clarifications(self, session: RecordingSession) -> List[ClarificationQuestion]:
        """
        Analyzes demonstration events and identifies steps where the user's intent
        or selection criteria may be ambiguous (e.g. choosing a restaurant among options,
        fixed vs parameterized values, conditional actions).
        """
        clarifications: List[ClarificationQuestion] = []
        step_idx = 1
        goal = session.task_description.lower()
        ranking_is_explicit = bool(re.search(r"\b(highest rated|best rated|rating|stars?|cheapest|lowest price|budget|price range|nearest|closest|distance|exact (?:item|product|name))\b", goal))
        synthesized_event_types = {EventType.NAVIGATE, EventType.INPUT, EventType.CLICK, EventType.SUBMIT}

        for evt in session.events:
            # Keep question IDs aligned with the exact step sequence generated below.
            # Key presses and other observer-only events do not become workflow steps.
            if evt.type not in synthesized_event_types:
                continue
            step_id = f"s{step_idx}"
            target_name = (evt.target.name or evt.target.test_id or evt.target.text or "").lower() if evt.target else ""
            target_label = (evt.target.name or evt.target.label or evt.target.text or evt.target.test_id or "this choice") if evt.target else "this choice"

            # 1. Selection in list / restaurant / catalog choice
            is_choice = any(k in target_name for k in ["restaurant", "bistro", "trattoria", "product", "item", "sku", "option", "result", "listing", "hotel", "flight", "venue"])
            if evt.type == EventType.CLICK and is_choice and not ranking_is_explicit:
                clarifications.append(ClarificationQuestion(
                    id=f"clarify_{step_id}_intent",
                    step_id=step_id,
                    question=f"For “{target_label}”, what should determine the choice: price, distance or rating?",
                    explanation="Your task description does not specify a selection rule. This answer will guide the workflow draft; it will not authorize any action.",
                    options=[
                        "Rating (Highest rated >= 4.5)",
                        "Price (Budget / lowest price tier)",
                        "Distance (Closest to current location)",
                        "Exact item name (Specific hardcoded choice)"
                    ],
                    context=f"Recorded step {step_idx}: {target_label}"
                ))

            # 2. Form Input: Parameter vs Fixed
            elif evt.type == EventType.INPUT and evt.value and not evt.is_masked:
                clean_name = re.sub(r'[^a-zA-Z0-9_]', ' ', target_name).strip()
                field_name = clean_name or "this field"
                clarifications.append(ClarificationQuestion(
                    id=f"clarify_{step_id}_param",
                    step_id=step_id,
                    question=f"How should the value entered in {field_name} be handled on future runs?",
                    explanation="Choose whether to ask for a fresh value each time or keep this non-sensitive value fixed.",
                    options=[
                        f"Ask me for a fresh {field_name} value on each run",
                        "Keep the demonstrated value fixed"
                    ],
                    context=f"Recorded step {step_idx}: {field_name}"
                ))

            step_idx += 1

        return clarifications

    def synthesize_from_session(
        self, 
        session: RecordingSession, 
        user_clarifications: Optional[Dict[str, str]] = None
    ) -> WorkflowDefinition:
        workflow_id = f"wf_{uuid.uuid4().hex[:8]}"
        title = session.task_description or "Automated Workflow"
        intent = f"Automated execution synthesized from demonstration: {session.task_description}"

        steps: List[Step] = []
        parameters: List[ParameterDefinition] = []
        param_names_seen = set()

        clarifications = self.generate_clarifications(session)
        answers = user_clarifications or {}

        # Step counter
        step_idx = 1
        
        # Track initial origin
        allowed_origins = []
        if session.target_url:
            from urllib.parse import urlparse
            p = urlparse(session.target_url)
            if p.scheme and p.netloc:
                allowed_origins.append(f"{p.scheme}://{p.netloc}")

        # Drop duplicate rapid clicks or noise (GEN-6)
        cleaned_events: List[RecordedEvent] = []
        last_evt = None
        for evt in session.events:
            if last_evt and evt.type == last_evt.type and evt.value == last_evt.value:
                if evt.target and last_evt.target and evt.target.test_id == last_evt.target.test_id and (evt.timestamp - last_evt.timestamp < 0.2):
                    continue
            cleaned_events.append(evt)
            last_evt = evt

        for evt in cleaned_events:
            step_id = f"s{step_idx}"
            screenshot_data = evt.screenshot
            active_win = evt.active_window
            
            if evt.type == EventType.NAVIGATE:
                step = Step(
                    id=step_id,
                    name=f"Navigate to {evt.value}",
                    action=ActionType.NAVIGATE,
                    args={"url": evt.value},
                    risk=RiskLevel.LOW,
                    idempotent=True,
                    screenshot=screenshot_data,
                    active_window=active_win,
                    postconditions=[Postcondition(type="url_matches", value=evt.value)]
                )
                steps.append(step)
                step_idx += 1

            elif evt.type == EventType.INPUT:
                target_name = (evt.target.name or evt.target.test_id or evt.target.label or f"field_{step_idx}").lower()
                clean_param_name = re.sub(r'[^a-zA-Z0-9_]', '_', target_name).strip('_')
                if not clean_param_name:
                    clean_param_name = f"input_{step_idx}"
                
                # Check clarification answer for this field
                clarify_key = f"clarify_{step_id}_param"
                answer = answers.get(clarify_key, "")

                if "keep" in answer.lower() and ("constant" in answer.lower() or "fixed" in answer.lower()):
                    # User answered: Keep constant
                    step_val = evt.value if not evt.is_masked else ""
                else:
                    # User answered or defaulted to: Parameterize
                    step_val = f"{{{{{clean_param_name}}}}}"
                    if clean_param_name not in param_names_seen:
                        parameters.append(ParameterDefinition(
                            name=clean_param_name,
                            type="string",
                            description=f"Value for {target_name}",
                            default_value=evt.value if not evt.is_masked else "",
                            required=True
                        ))
                        param_names_seen.add(clean_param_name)

                step = Step(
                    id=step_id,
                    name=f"Enter {clean_param_name}",
                    action=ActionType.TYPE,
                    target=evt.target,
                    args={"value": step_val},
                    risk=RiskLevel.MEDIUM,
                    idempotent=True,
                    screenshot=screenshot_data,
                    active_window=active_win,
                    postconditions=[Postcondition(
                        type="field_value_equals",
                        target=evt.target,
                        value=step_val
                    )]
                )
                steps.append(step)
                step_idx += 1

            elif evt.type == EventType.CLICK:
                target_label = evt.target.name or evt.target.text or evt.target.test_id or "element"
                clarify_key = f"clarify_{step_id}_intent"
                answer = answers.get(clarify_key, "")

                step_condition = None
                step_notes = None

                # Incorporate user clarification answer (SUGILITE Concept)
                if "rating" in answer.lower():
                    step_condition = "rating >= {{min_rating}}"
                    step_notes = "Learned rule from clarification: Filter options where rating >= 4.5"
                    if "min_rating" not in param_names_seen:
                        parameters.append(ParameterDefinition(
                            name="min_rating",
                            type="number",
                            description="Minimum rating threshold for selection",
                            default_value=4.5,
                            required=True
                        ))
                        param_names_seen.add("min_rating")
                elif "price" in answer.lower():
                    step_condition = "price_tier == {{preferred_price}}"
                    step_notes = "Learned rule from clarification: Select lowest/preferred price tier"
                    if "preferred_price" not in param_names_seen:
                        parameters.append(ParameterDefinition(
                            name="preferred_price",
                            type="string",
                            description="Preferred price category ($ or $$)",
                            default_value="$$",
                            required=True
                        ))
                        param_names_seen.add("preferred_price")
                elif "distance" in answer.lower():
                    step_condition = "distance <= {{max_distance}}"
                    step_notes = "Learned rule from clarification: Select closest distance"
                    if "max_distance" not in param_names_seen:
                        parameters.append(ParameterDefinition(
                            name="max_distance",
                            type="number",
                            description="Maximum distance in miles",
                            default_value=1.0,
                            required=True
                        ))
                        param_names_seen.add("max_distance")

                step = Step(
                    id=step_id,
                    name=f"Click {target_label}",
                    action=ActionType.CLICK,
                    target=evt.target,
                    args={},
                    risk=RiskLevel.LOW,
                    idempotent=True,
                    condition=step_condition,
                    notes=step_notes,
                    screenshot=screenshot_data,
                    active_window=active_win
                )
                steps.append(step)
                step_idx += 1

            elif evt.type == EventType.SUBMIT:
                target_label = evt.target.name or evt.target.text or "form"
                clarify_key = f"clarify_{step_id}_confirmation"
                answer = answers.get(clarify_key, "")
                req_conf = True
                if "without pausing" in answer.lower():
                    req_conf = False

                step = Step(
                    id=step_id,
                    name=f"Submit {target_label}",
                    action=ActionType.SUBMIT,
                    target=evt.target,
                    args={},
                    risk=RiskLevel.HIGH,
                    requires_confirmation=req_conf,
                    idempotent=False,
                    screenshot=screenshot_data,
                    active_window=active_win,
                    postconditions=[
                        Postcondition(type="element_exists", selector=".alert-success")
                    ]
                )
                steps.append(step)
                step_idx += 1

        # Chain graph edges (next_step_id) for graph visualization
        for i in range(len(steps)):
            if i < len(steps) - 1:
                steps[i].next_step_id = steps[i + 1].id

        # Classify risk deterministically via policy engine (GEN-7)
        for s in steps:
            decision, reason, computed_risk = self.policy_engine.evaluate_step(
                s, 
                current_url=session.target_url
            )
            s.risk = computed_risk

        # Ensure >= 1 final postcondition (GEN-4)
        final_postconditions = []
        if steps and steps[-1].postconditions:
            final_postconditions.extend(steps[-1].postconditions)
        else:
            final_postconditions.append(Postcondition(type="url_matches", value=session.target_url))

        wf = WorkflowDefinition(
            workflow_id=workflow_id,
            title=title,
            intent=intent,
            allowed_origins=allowed_origins or ["http://localhost:8000"],
            parameters=parameters,
            steps=steps,
            final_postconditions=final_postconditions,
            clarifications=clarifications,
            version=1,
            change_summary="Synthesized with clarification dialogue"
        )
        wf.update_hash()
        return wf

    @staticmethod
    def search_workflows_nl(query: str, workflows: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
        """
        Natural Language Semantic Matcher.
        Allows users to find saved workflows using free-form English queries.
        Evaluates title, intent, parameter names, step actions, and conditions.
        """
        if not query or not query.strip():
            return workflows

        q_clean = query.lower().strip()
        q_tokens = set(re.findall(r'[a-zA-Z0-9]+', q_clean))

        # Synonym and semantic concept expansion
        concept_map = {
            "customer": ["client", "user", "profile", "account", "register", "signup"],
            "register": ["signup", "create", "new", "form", "customer"],
            "restaurant": ["food", "dinner", "dining", "lunch", "bistro", "trattoria", "rating", "price"],
            "ticket": ["support", "issue", "bug", "helpdesk", "problem"],
            "catalog": ["sku", "item", "product", "inventory", "search", "store"],
            "price": ["cost", "cheap", "budget", "tier", "$$"],
            "rating": ["stars", "score", "reviews", "best", "top"]
        }

        expanded_tokens = set(q_tokens)
        for t in list(q_tokens):
            if t in concept_map:
                expanded_tokens.update(concept_map[t])

        destination_aliases = {
            "google maps": ("google maps", "maps"),
            "wikipedia": ("wikipedia", "wikipidia"),
        }
        required_destination = next(
            (aliases for destination, aliases in destination_aliases.items() if destination in q_clean),
            None,
        )

        results = []
        for wf in workflows:
            score = 0.0
            reasons = []

            title = (wf.get("title") or "").lower()
            intent = (wf.get("intent") or "").lower()
            params = " ".join([p.get("name", "") for p in wf.get("parameters", [])]).lower()
            steps_text = " ".join([s.get("name", "") + " " + (s.get("notes") or "") for s in wf.get("steps", [])]).lower()
            workflow_text = " ".join((title, intent, params, steps_text))

            # Do not reuse a workflow for a different named destination.
            # A generic keyword such as "search" must not make Wikipedia
            # appear to satisfy a Google Maps request.
            if required_destination and not any(alias in workflow_text for alias in required_destination):
                continue

            # Exact phrase match
            if q_clean in title:
                score += 10.0
                reasons.append("Exact match in title")
            elif q_clean in intent:
                score += 8.0
                reasons.append("Exact match in workflow intent")

            # Token overlap scoring
            for token in expanded_tokens:
                if token in title:
                    score += 3.0
                    reasons.append(f"Keyword '{token}' in title")
                if token in intent:
                    score += 2.0
                    reasons.append(f"Keyword '{token}' in intent")
                if token in params:
                    score += 2.5
                    reasons.append(f"Matches parameter '{token}'")
                if token in steps_text:
                    score += 1.5

            if score > 0:
                results.append({
                    **wf,
                    "relevance_score": round(score, 2),
                    "match_reasons": list(set(reasons))
                })

        # Sort by relevance descending
        results.sort(key=lambda x: x.get("relevance_score", 0), reverse=True)
        return results
