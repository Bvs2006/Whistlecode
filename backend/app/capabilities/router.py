from __future__ import annotations
import json
import logging
from enum import Enum
from typing import Dict, Any, List, Optional
from pydantic import BaseModel, Field
from .models import TaskRepresentation
from .registry import CapabilityRegistry, capability_registry
from ..db.database import get_db_connection
from ..models.workflow import WorkflowDefinition
from ..integrations.hub import IntegrationHubService
from ..drivers.registry import DriverRegistry

logger = logging.getLogger(__name__)


class RoutingDecisionType(str, Enum):
    EXISTING_WORKFLOW = "EXISTING_WORKFLOW"
    COMPOSABLE_PLAN = "COMPOSABLE_PLAN"
    MISSING_INTEGRATION = "MISSING_INTEGRATION"
    NEEDS_RECORDING = "NEEDS_RECORDING"
    CLARIFY_SURFACE = "CLARIFY_SURFACE"
    UNSUPPORTED = "UNSUPPORTED"


class RoutingResult(BaseModel):
    decision: RoutingDecisionType
    reason: str
    confidence: float = 1.0
    surface: Optional[str] = None
    matched_workflow_id: Optional[str] = None
    matched_workflow: Optional[Dict[str, Any]] = None
    composed_plan: Optional[Dict[str, Any]] = None
    missing_integration_id: Optional[str] = None
    clarification_options: List[str] = Field(default_factory=list)


class CapabilityRouter:
    """
    Evaluates a TaskRepresentation to route automation to the optimal execution path:
    1. Checks policy boundaries (rejects unsupported / security-violating tasks)
    2. Checks surface confidence (routes to CLARIFY_SURFACE if below threshold)
    3. Matches saved workflows by description/intent + input schema
    4. Evaluates composable tool/skill chains
    5. Validates integration requirements (detects MISSING_INTEGRATION)
    6. Recommends targeted demonstration (NEEDS_RECORDING for the specific surface)
    """

    CONFIDENCE_THRESHOLD = 0.75

    def __init__(self, registry: Optional[CapabilityRegistry] = None):
        self.registry = registry or capability_registry
        self.driver_registry = DriverRegistry()

    async def route(self, task: TaskRepresentation) -> RoutingResult:
        intent_lower = task.intent.lower()

        # 1. Check for strictly prohibited or unsupported actions (MFA / CAPTCHA bypass)
        forbidden_terms = ["bypass mfa", "bypass 2fa", "solve captcha", "bypass captcha", "steal password", "hack"]
        if any(term in intent_lower for term in forbidden_terms):
            return RoutingResult(
                decision=RoutingDecisionType.UNSUPPORTED,
                reason="WhistleCode safety policy prohibits bypassing MFA, OTP, or CAPTCHA verification challenges.",
                confidence=1.0,
                surface=task.surfaces[0] if task.surfaces else None
            )

        # 2. Check Surface Confidence Threshold (CLARIFY_SURFACE)
        if task.surface_confidence < self.CONFIDENCE_THRESHOLD or not task.surfaces:
            return RoutingResult(
                decision=RoutingDecisionType.CLARIFY_SURFACE,
                reason=f"Surface confidence ({task.surface_confidence:.2f}) is below the threshold of {self.CONFIDENCE_THRESHOLD}. Please clarify the environment.",
                confidence=task.surface_confidence,
                surface=task.surfaces[0] if task.surfaces else "unknown",
                clarification_options=["Web Browser", "Desktop Application", "Local File Sandbox"]
            )

        primary_surface = task.surfaces[0].lower() if task.surfaces else "browser"

        # 3. Match Existing Saved Workflows
        matched_wf = self._match_saved_workflow(task)
        if matched_wf:
            return RoutingResult(
                decision=RoutingDecisionType.EXISTING_WORKFLOW,
                reason=f"Found matching existing workflow: '{matched_wf['title']}'.",
                confidence=0.92,
                surface=primary_surface,
                matched_workflow_id=matched_wf["workflow_id"],
                matched_workflow=matched_wf
            )

        # 4. Check for Missing Integrations
        missing_integ = self._check_missing_integration(task)
        if missing_integ:
            return RoutingResult(
                decision=RoutingDecisionType.MISSING_INTEGRATION,
                reason=f"Required integration '{missing_integ}' is not configured or connected.",
                confidence=0.95,
                surface=primary_surface,
                missing_integration_id=missing_integ
            )

        # 5. Try Composing a Plan from Available Tools and Skills
        composable_plan = self._try_compose_plan(task)
        if composable_plan:
            return RoutingResult(
                decision=RoutingDecisionType.COMPOSABLE_PLAN,
                reason="Task can be fulfilled by composing available local tools and skills.",
                confidence=0.88,
                surface=primary_surface,
                composed_plan=composable_plan
            )

        # 6. Check Driver Health & Recommend Recording
        driver = self.driver_registry.get(primary_surface)
        if driver:
            health = await driver.health()
            if health.status == "unavailable":
                return RoutingResult(
                    decision=RoutingDecisionType.UNSUPPORTED,
                    reason=f"Driver for surface '{primary_surface}' is unavailable: {health.reason}",
                    confidence=0.95,
                    surface=primary_surface
                )

        # Needs Recording for the detected surface
        return RoutingResult(
            decision=RoutingDecisionType.NEEDS_RECORDING,
            reason=f"No matching workflow or direct tool found for {primary_surface} task. Demonstrate the task once to teach WhistleCode.",
            confidence=0.85,
            surface=primary_surface
        )

    def _match_saved_workflow(self, task: TaskRepresentation) -> Optional[Dict[str, Any]]:
        """Matches saved workflows by description/intent and input schema compatibility."""
        try:
            with get_db_connection() as conn:
                cursor = conn.cursor()
                cursor.execute("""
                    SELECT w.id, w.title, w.intent, wv.json_data
                    FROM workflows w
                    JOIN workflow_versions wv ON w.id = wv.workflow_id
                    WHERE wv.version = (
                        SELECT MAX(version) FROM workflow_versions WHERE workflow_id = w.id
                    )
                """)
                rows = cursor.fetchall()

                task_words = set(task.intent.lower().split())
                task_urls = [u.lower() for u in task.target_hints.urls]

                for row in rows:
                    json_data = row["json_data"]
                    if not json_data:
                        continue
                    wf_dict = json.loads(json_data)
                    wf_intent = (wf_dict.get("intent") or "").lower()
                    wf_title = (wf_dict.get("title") or "").lower()
                    wf_origins = [o.lower() for o in wf_dict.get("allowed_origins", [])]

                    # Check URL match
                    url_matched = False
                    if task_urls and wf_origins:
                        for u in task_urls:
                            if any(orig in u or u in orig for orig in wf_origins):
                                url_matched = True
                                break

                    # Check intent keyword overlap
                    wf_words = set((wf_intent + " " + wf_title).split())
                    overlap = len(task_words.intersection(wf_words))

                    if url_matched or overlap >= 3:
                        return wf_dict
        except Exception as e:
            logger.warning(f"Error matching saved workflows: {e}")
        return None

    def _check_missing_integration(self, task: TaskRepresentation) -> Optional[str]:
        """Checks if a required tool belongs to a disconnected integration."""
        task_tools = [t.lower() for t in task.required_tools]
        task_intent = task.intent.lower()

        # Mapping of indicators to integration IDs
        if "github" in task_intent or any("github" in t for t in task_tools):
            integ = IntegrationHubService.get_integration("integ_github")
            if not integ or (hasattr(integ.status, "value") and integ.status.value != "connected") or str(integ.status) != "connected":
                return "integ_github"

        if "gmail" in task_intent or any("gmail" in t or "email" in t for t in task_tools):
            integ = IntegrationHubService.get_integration("integ_google")
            if not integ or (hasattr(integ.status, "value") and integ.status.value != "connected") or str(integ.status) != "connected":
                return "integ_google"

        return None

    def _try_compose_plan(self, task: TaskRepresentation) -> Optional[Dict[str, Any]]:
        """Checks if registered tools/skills cover all operations and tools."""
        if not task.required_tools and not task.operations:
            return None

        # Check document/filesystem tasks
        if task.category in ("document_processing", "data_extraction") and "file" in task.surfaces:
            fs_specs = ["fs.read_text", "fs.write_text", "fs.list_directory", "doc.generate", "doc.analyze_csv"]
            matched_tools = [t for t in task.required_tools if any(spec in t for spec in fs_specs)]
            if matched_tools or any(op in ["read", "extract", "summarize"] for op in task.operations):
                return {
                    "strategy": "tool_composition",
                    "tools": ["fs.read_text", "doc.generate"],
                    "steps": [
                        {"action": "tool_call", "tool": "fs.read_text", "args": {"path": task.target_hints.paths[0] if task.target_hints.paths else "/sandbox/input.txt"}},
                        {"action": "tool_call", "tool": "doc.generate", "args": {"format": "markdown", "title": task.intent}}
                    ]
                }
        return None


# Global router instance
capability_router = CapabilityRouter()
