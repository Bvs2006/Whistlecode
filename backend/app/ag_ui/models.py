from __future__ import annotations
from enum import Enum
from typing import Dict, Any, List, Optional, Union
from pydantic import BaseModel, Field
import datetime


class AgUiEventType(str, Enum):
    # Execution Lifecycle
    RUN_STARTED = "RUN_STARTED"
    RUN_FINISHED = "RUN_FINISHED"
    RUN_ERROR = "RUN_ERROR"

    # Streaming Text Messages
    TEXT_MESSAGE_START = "TEXT_MESSAGE_START"
    TEXT_MESSAGE_CONTENT = "TEXT_MESSAGE_CONTENT"
    TEXT_MESSAGE_END = "TEXT_MESSAGE_END"

    # Tool Execution Lifecycle
    TOOL_CALL_START = "TOOL_CALL_START"
    TOOL_CALL_ARGS = "TOOL_CALL_ARGS"
    TOOL_CALL_END = "TOOL_CALL_END"
    TOOL_CALL_RESULT = "TOOL_CALL_RESULT"
    TOOL_CALL = "TOOL_CALL"  # Compatibility alias

    # State Synchronization
    STATE_SNAPSHOT = "STATE_SNAPSHOT"
    STATE_DELTA = "STATE_DELTA"

    # Activity & Task Board
    ACTIVITY_SNAPSHOT = "ACTIVITY_SNAPSHOT"
    ACTIVITY_DELTA = "ACTIVITY_DELTA"
    STEP_STARTED = "STEP_STARTED"
    STEP_FINISHED = "STEP_FINISHED"

    # Human-in-the-Loop Interruption
    INTERRUPT = "INTERRUPT"

    # Step 5 Typed Chat Events
    STATUS = "status"
    CAPABILITY_RESULT = "capability_result"
    PLAN = "plan"
    INPUT_REQUEST = "input_request"
    APPROVAL_REQUEST = "approval_request"
    STEP_UPDATE = "step_update"
    VERIFICATION = "verification"
    RESULT = "result"
    ERROR = "error"


class TaskStatus(str, Enum):
    PENDING = "pending"
    IN_PROGRESS = "in_progress"
    COMPLETED = "completed"
    FAILED = "failed"
    AWAITING_APPROVAL = "awaiting_approval"
    SKIPPED = "skipped"


class AgUiTask(BaseModel):
    id: str
    title: str
    status: TaskStatus = TaskStatus.PENDING
    action: str = ""
    target: Optional[str] = None
    args: Dict[str, Any] = Field(default_factory=dict)
    risk: str = "low"
    requires_approval: bool = False
    result: Optional[str] = None
    error: Optional[str] = None
    started_at: Optional[str] = None
    completed_at: Optional[str] = None


class AgUiSharedState(BaseModel):
    current_date: str = Field(default_factory=lambda: datetime.date.today().isoformat())
    active_tasks: List[AgUiTask] = Field(default_factory=list)
    daily_text_logs: List[Dict[str, Any]] = Field(default_factory=list)
    active_run_id: Optional[str] = None
    is_running: bool = False
    workflow_id: Optional[str] = None
    workflow_title: Optional[str] = None


class AgUiBaseEvent(BaseModel):
    type: AgUiEventType
    timestamp: str = Field(default_factory=lambda: datetime.datetime.now(datetime.timezone.utc).isoformat())
    run_id: str
    thread_id: Optional[str] = None


# Lifecycle Events
class RunStartedEvent(AgUiBaseEvent):
    type: AgUiEventType = AgUiEventType.RUN_STARTED
    workflow_id: Optional[str] = None
    workflow_title: str
    total_steps: int = 0
    mode: str = "run"


class RunFinishedEvent(AgUiBaseEvent):
    type: AgUiEventType = AgUiEventType.RUN_FINISHED
    status: str  # "completed", "failed", "stopped"
    tasks_completed: int
    total_tasks: int
    summary_text: str
    log_file_path: Optional[str] = None


class RunErrorEvent(AgUiBaseEvent):
    type: AgUiEventType = AgUiEventType.RUN_ERROR
    message: str
    step_id: Optional[str] = None


# Text Streaming Events
class TextMessageStartEvent(AgUiBaseEvent):
    type: AgUiEventType = AgUiEventType.TEXT_MESSAGE_START
    message_id: str
    role: str = "assistant"


class TextMessageContentEvent(AgUiBaseEvent):
    type: AgUiEventType = AgUiEventType.TEXT_MESSAGE_CONTENT
    message_id: str
    delta: str


class TextMessageEndEvent(AgUiBaseEvent):
    type: AgUiEventType = AgUiEventType.TEXT_MESSAGE_END
    message_id: str


# Tool Call Events
class ToolCallStartEvent(AgUiBaseEvent):
    type: AgUiEventType = AgUiEventType.TOOL_CALL_START
    tool_call_id: str
    tool_name: str
    action: str
    target: Optional[str] = None
    risk: str = "low"
    requires_approval: bool = False


class ToolCallArgsEvent(AgUiBaseEvent):
    type: AgUiEventType = AgUiEventType.TOOL_CALL_ARGS
    tool_call_id: str
    delta: str


class ToolCallEndEvent(AgUiBaseEvent):
    type: AgUiEventType = AgUiEventType.TOOL_CALL_END
    tool_call_id: str
    tool_name: str
    args: Dict[str, Any] = Field(default_factory=dict)


class ToolCallResultEvent(AgUiBaseEvent):
    type: AgUiEventType = AgUiEventType.TOOL_CALL_RESULT
    task_id: str
    tool_call_id: Optional[str] = None
    step_index: int = 0
    name: str = ""
    action: str = ""
    success: bool = True
    output: Optional[str] = None
    error: Optional[str] = None
    duration_ms: Optional[float] = None


# Compatibility Event for simple tool call emission
class ToolCallEvent(AgUiBaseEvent):
    type: AgUiEventType = AgUiEventType.TOOL_CALL
    task_id: str
    step_index: int
    name: str
    action: str
    target: Optional[str] = None
    args: Dict[str, Any] = Field(default_factory=dict)
    risk: str = "low"
    requires_approval: bool = False


# State & Activity Events
class StateSnapshotEvent(AgUiBaseEvent):
    type: AgUiEventType = AgUiEventType.STATE_SNAPSHOT
    state: Dict[str, Any]


class StateDeltaEvent(AgUiBaseEvent):
    type: AgUiEventType = AgUiEventType.STATE_DELTA
    delta: Dict[str, Any]


class ActivitySnapshotEvent(AgUiBaseEvent):
    type: AgUiEventType = AgUiEventType.ACTIVITY_SNAPSHOT
    tasks: List[AgUiTask]
    current_step_index: int = 0
    progress_percent: float = 0.0


class ActivityDeltaEvent(AgUiBaseEvent):
    type: AgUiEventType = AgUiEventType.ACTIVITY_DELTA
    task_id: str
    status: TaskStatus
    progress_percent: Optional[float] = None


class StepStartedEvent(AgUiBaseEvent):
    type: AgUiEventType = AgUiEventType.STEP_STARTED
    step_id: str
    step_index: int
    name: str
    action: str


class StepFinishedEvent(AgUiBaseEvent):
    type: AgUiEventType = AgUiEventType.STEP_FINISHED
    step_id: str
    step_index: int
    success: bool
    output: Optional[str] = None
    error: Optional[str] = None


# Human-in-the-Loop Interruption Event
class InterruptEvent(AgUiBaseEvent):
    type: AgUiEventType = AgUiEventType.INTERRUPT
    interrupt_id: str
    task_id: str
    step_index: int
    action: str
    target: str
    risk: str
    message: str
    evaluated_args: Dict[str, Any] = Field(default_factory=dict)


# ==============================================================================
# Step 5 Typed Chat Experience Event Models
# ==============================================================================

class AgUiStatusEvent(AgUiBaseEvent):
    type: AgUiEventType = AgUiEventType.STATUS
    phase: str  # "understanding_request", "routing", "synthesizing", "ready", "executing", "verifying", "idle"
    message: Optional[str] = None


class AgUiCapabilityResultEvent(AgUiBaseEvent):
    type: AgUiEventType = AgUiEventType.CAPABILITY_RESULT
    outcome: str  # "EXISTING_WORKFLOW", "COMPOSABLE_PLAN", "NEEDS_RECORDING", "CLARIFY_SURFACE", "MISSING_INTEGRATION", "UNSUPPORTED"
    severity: str  # "green", "amber", "red"
    reason: str
    surface: Optional[str] = "browser"
    surface_confidence: Optional[float] = None
    target_hints: Optional[Dict[str, Any]] = None
    matched_workflow_id: Optional[str] = None
    missing_integration_id: Optional[str] = None


class AgUiPlanEvent(AgUiBaseEvent):
    type: AgUiEventType = AgUiEventType.PLAN
    workflow_id: str
    title: str
    summary: str
    steps: List[Dict[str, Any]] = Field(default_factory=list)
    allowed_origins: List[str] = Field(default_factory=list)
    risk: str = "low"
    sensitive_step_ids: List[str] = Field(default_factory=list)
    content_hash: Optional[str] = None
    version: int = 1


class AgUiInputRequestEvent(AgUiBaseEvent):
    type: AgUiEventType = AgUiEventType.INPUT_REQUEST
    request_id: str
    kind: str = "clarification"  # "clarification", "surface_choice", "missing_parameter"
    question: str
    explanation: Optional[str] = None
    options: List[str] = Field(default_factory=list)
    surface_options: Optional[List[Dict[str, Any]]] = None
    parameters: Optional[List[Dict[str, Any]]] = None


class AgUiApprovalRequestEvent(AgUiBaseEvent):
    type: AgUiEventType = AgUiEventType.APPROVAL_REQUEST
    approval_id: str
    workflow_id: str
    version: int
    content_hash: str
    allowed_origins: List[str] = Field(default_factory=list)
    sensitive_actions: List[Dict[str, Any]] = Field(default_factory=list)
    expires_at: Optional[str] = None


class AgUiStepUpdateEvent(AgUiBaseEvent):
    type: AgUiEventType = AgUiEventType.STEP_UPDATE
    step_id: str
    step_index: int
    total_steps: int
    action: str
    target_name: Optional[str] = None
    status: str = "running"  # "pending", "running", "passed", "failed"
    error_message: Optional[str] = None


class AgUiVerificationEvent(AgUiBaseEvent):
    type: AgUiEventType = AgUiEventType.VERIFICATION
    verification_state: str  # "VERIFIED_SUCCESS", "FAILED", "UNCERTAIN"
    passed: bool
    postconditions: List[Dict[str, Any]] = Field(default_factory=list)
    reason: Optional[str] = None


class AgUiResultEvent(AgUiBaseEvent):
    type: AgUiEventType = AgUiEventType.RESULT
    success: bool
    run_id: Optional[str] = None
    summary: str
    outputs: Dict[str, Any] = Field(default_factory=dict)


class AgUiErrorEvent(AgUiBaseEvent):
    type: AgUiEventType = AgUiEventType.ERROR
    error_code: str
    message: str
    recovery_suggestion: Optional[str] = None
    is_success: bool = False  # Enforces Rule 3: error cards never use success styling

