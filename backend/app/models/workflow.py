from __future__ import annotations
import json
import hashlib
from enum import Enum
from typing import List, Optional, Dict, Any, Union
from pydantic import BaseModel, Field


class ActionType(str, Enum):
    NAVIGATE = "navigate"
    CLICK = "click"
    TYPE = "type"
    SELECT = "select"
    CHECK = "check"
    UNCHECK = "uncheck"
    WAIT_FOR = "wait_for"
    ASSERT = "assert"
    EXTRACT = "extract"
    SUBMIT = "submit"
    CONFIRM_GATE = "confirm_gate"
    TOOL_CALL = "tool_call"
    BRANCH = "branch"


class RiskLevel(str, Enum):
    LOW = "low"
    MEDIUM = "medium"
    HIGH = "high"
    CRITICAL = "critical"


class SurfaceType(str, Enum):
    BROWSER = "browser"
    DESKTOP = "desktop"
    FILE = "file"


class TargetCandidate(BaseModel):
    strategy: str  # "test_id", "role_name", "label", "text", "css", "xpath", "coordinate"
    value: Union[str, Dict[str, Any]]
    confidence: float = 1.0
    matched: Optional[bool] = None


class AllowedScope(BaseModel):
    domains: List[str] = Field(default_factory=list)
    apps: List[str] = Field(default_factory=list)
    folders: List[str] = Field(default_factory=list)


class TargetContext(BaseModel):
    within: Optional[str] = None
    landmark: Optional[str] = None


class TargetDescriptor(BaseModel):
    role: Optional[str] = None
    name: Optional[str] = None
    test_id: Optional[str] = None
    label: Optional[str] = None
    text: Optional[str] = None
    css_fallback: Optional[str] = None
    context: Optional[TargetContext] = None
    bounding_box: Optional[Dict[str, float]] = None
    active_window: Optional[str] = None
    min_confidence: float = 0.85
    candidates: List[TargetCandidate] = Field(default_factory=list)

    def get_ranked_candidates(self) -> List[TargetCandidate]:
        if self.candidates:
            return sorted(self.candidates, key=lambda c: c.confidence, reverse=True)
        ranked: List[TargetCandidate] = []
        if self.test_id:
            ranked.append(TargetCandidate(strategy="test_id", value=self.test_id, confidence=0.95))
        if self.role and self.name:
            ranked.append(TargetCandidate(strategy="role_name", value={"role": self.role, "name": self.name}, confidence=0.90))
        elif self.role and self.text:
            ranked.append(TargetCandidate(strategy="role_name", value={"role": self.role, "name": self.text}, confidence=0.88))
        if self.label:
            ranked.append(TargetCandidate(strategy="label", value=self.label, confidence=0.85))
        if self.text:
            ranked.append(TargetCandidate(strategy="text", value=self.text, confidence=0.80))
        if self.css_fallback:
            ranked.append(TargetCandidate(strategy="css", value=self.css_fallback, confidence=0.70))
        return ranked


class Precondition(BaseModel):
    type: str  # e.g., "url_matches", "element_visible", "field_empty"
    target: Optional[TargetDescriptor] = None
    value: Optional[str] = None
    selector: Optional[str] = None


class Postcondition(BaseModel):
    type: str  # e.g., "url_matches", "field_value_equals", "list_contains", "element_exists"
    target: Optional[TargetDescriptor] = None
    value: Optional[str] = None
    selector: Optional[str] = None


class ParameterDefinition(BaseModel):
    name: str
    type: str = "string"  # "string", "number", "boolean"
    description: Optional[str] = None
    default_value: Optional[Any] = None
    required: bool = True
    max_length: Optional[int] = None
    regex_pattern: Optional[str] = None


class Step(BaseModel):
    id: str
    name: str
    action: ActionType
    surface: SurfaceType = SurfaceType.BROWSER
    target: Optional[TargetDescriptor] = None
    target_candidates: List[TargetCandidate] = Field(default_factory=list)
    args: Dict[str, Any] = Field(default_factory=dict)
    risk: RiskLevel = RiskLevel.LOW
    requires_confirmation: bool = False
    idempotent: bool = True
    timeout_seconds: Optional[float] = None
    preconditions: List[Precondition] = Field(default_factory=list)
    postconditions: List[Postcondition] = Field(default_factory=list)
    enabled: bool = True
    notes: Optional[str] = None
    # Extensions for Graph, Conditions & Plugins
    condition: Optional[str] = None
    next_step_id: Optional[str] = None
    branches: Optional[Dict[str, str]] = None
    plugin_id: Optional[str] = None
    tool_name: Optional[str] = None
    screenshot: Optional[str] = None
    active_window: Optional[str] = None

    def get_target_candidates(self) -> List[TargetCandidate]:
        if self.target_candidates:
            return sorted(self.target_candidates, key=lambda c: c.confidence, reverse=True)
        if self.target:
            return self.target.get_ranked_candidates()
        return []


class ClarificationQuestion(BaseModel):
    id: str
    step_id: Optional[str] = None
    question: str
    explanation: Optional[str] = None
    options: List[str] = Field(default_factory=list)
    selected_option: Optional[str] = None
    custom_answer: Optional[str] = None
    context: Optional[str] = None


class WorkflowDraft(BaseModel):
    workflow_id: str
    title: str
    intent: str
    allowed_origins: List[str] = Field(default_factory=list)
    allowed_scope: Optional[AllowedScope] = None
    parameters: List[ParameterDefinition] = Field(default_factory=list)
    steps: List[Step] = Field(default_factory=list)
    final_postconditions: List[Postcondition] = Field(default_factory=list)
    clarifications: List[ClarificationQuestion] = Field(default_factory=list)

    def get_effective_scope(self) -> AllowedScope:
        if self.allowed_scope:
            domains = list(dict.fromkeys(self.allowed_scope.domains + (self.allowed_origins or [])))
            return AllowedScope(
                domains=domains,
                apps=self.allowed_scope.apps,
                folders=self.allowed_scope.folders
            )
        return AllowedScope(domains=self.allowed_origins or [])


class WorkflowDefinition(WorkflowDraft):
    version: int = 1
    content_hash: str = ""
    parent_version: Optional[int] = None
    change_summary: Optional[str] = "Initial version"
    created_at: Optional[str] = None

    def compute_hash(self) -> str:
        """
        Computes SHA-256 over canonical JSON representation of the workflow logic.
        Excludes content_hash itself to guarantee determinism.
        """
        data = self.model_dump(exclude={"content_hash", "created_at"})
        canonical_str = json.dumps(data, sort_keys=True, separators=(',', ':'))
        return f"sha256:{hashlib.sha256(canonical_str.encode('utf-8')).hexdigest()}"

    def update_hash(self) -> str:
        self.content_hash = self.compute_hash()
        return self.content_hash


class PlanPreviewStep(BaseModel):
    step_index: int
    step_id: str
    name: str
    action: str
    target_label: str
    evaluated_args: Dict[str, Any]
    expected_result: str
    risk: RiskLevel
    requires_confirmation: bool
    policy_decision: str
    policy_reason: str


class PlanPreviewResponse(BaseModel):
    workflow_id: str
    title: str
    content_hash: str
    steps: List[PlanPreviewStep]
    parameters: List[ParameterDefinition]
    overall_risk: RiskLevel
    is_approved: bool
    allowed_origins: List[str]
    allowed_scope: Optional[AllowedScope] = None
