from __future__ import annotations
from enum import Enum
from typing import Optional, Dict, Any, List
from pydantic import BaseModel, Field
from .workflow import TargetDescriptor


class EventType(str, Enum):
    CLICK = "click"
    INPUT = "input"
    SELECT = "select"
    CHECK = "check"
    UNCHECK = "uncheck"
    NAVIGATE = "navigate"
    WAIT = "wait"
    SUBMIT = "submit"
    KEYPRESS = "keypress"
    TOOL_EXECUTE = "tool_execute"


class RecordedEvent(BaseModel):
    id: str
    recording_id: str
    timestamp: float
    type: EventType
    url: str
    target: Optional[TargetDescriptor] = None
    value: Optional[str] = None
    is_masked: bool = False
    metadata: Dict[str, Any] = Field(default_factory=dict)
    screenshot: Optional[str] = None
    active_window: Optional[str] = None


class RecordingSession(BaseModel):
    id: str
    created_at: str
    task_description: str
    status: str = "active"  # "active", "paused", "stopped"
    target_url: str
    events: List[RecordedEvent] = Field(default_factory=list)
