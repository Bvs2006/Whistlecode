from __future__ import annotations
from enum import Enum
from typing import Optional, Dict, Any, List
from pydantic import BaseModel, Field
from .policy import PolicyDecision, ReasonCode


class ExecutionState(str, Enum):
    IDLE = "IDLE"
    PRECHECK = "PRECHECK"
    PENDING_CONFIRMATION = "PENDING_CONFIRMATION"
    EXECUTING_STEP = "EXECUTING_STEP"
    VERIFYING_STEP = "VERIFYING_STEP"
    CHECKPOINT = "CHECKPOINT"
    FINAL_VERIFY = "FINAL_VERIFY"
    SUCCESS = "SUCCESS"
    FAILED = "FAILED"
    UNCERTAIN = "UNCERTAIN"
    STOPPED = "STOPPED"


class VerificationState(str, Enum):
    VERIFIED_SUCCESS = "VERIFIED_SUCCESS"
    FAILED = "FAILED"
    UNCERTAIN = "UNCERTAIN"


class StepExecutionResult(BaseModel):
    step_id: str
    action: str
    target_summary: Optional[str] = None
    decision: PolicyDecision
    reason_code: ReasonCode
    passed: bool
    observed_state: Dict[str, Any] = Field(default_factory=dict)
    error_message: Optional[str] = None
    timestamp: float


class RunRecord(BaseModel):
    id: str
    workflow_id: str
    version: int
    version_hash: str
    approval_id: Optional[str] = None
    policy_version: str = "0.1.0"
    mode: str = "run"  # "dry_run", "test", "run"
    parameters: Dict[str, Any] = Field(default_factory=dict)
    state: ExecutionState = ExecutionState.IDLE
    verification_state: Optional[VerificationState] = None
    started_at: str
    ended_at: Optional[str] = None
    step_results: List[StepExecutionResult] = Field(default_factory=list)
    current_step_index: int = 0
    safe_stop_reason: Optional[str] = None
