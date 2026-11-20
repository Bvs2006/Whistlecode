from __future__ import annotations
import datetime
from enum import Enum
from typing import Optional, Dict, Any, List
from pydantic import BaseModel, Field
from .workflow import TargetDescriptor, TargetCandidate


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


class NormalizedRecorderEvent(BaseModel):
    surface: str = "browser"  # "browser" | "desktop" | "file"
    action: str
    target_candidates: List[TargetCandidate] = Field(default_factory=list)
    value: Optional[str] = None
    redacted: bool = False
    timestamp: float = Field(default_factory=lambda: datetime.datetime.now().timestamp())


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

    def to_normalized(self) -> NormalizedRecorderEvent:
        candidates = self.target.get_ranked_candidates() if self.target else []
        surface = "desktop" if (self.active_window and not self.url) else "browser"
        return NormalizedRecorderEvent(
            surface=surface,
            action=self.type.value,
            target_candidates=candidates,
            value=self.value,
            redacted=self.is_masked,
            timestamp=self.timestamp,
        )


class RecordingSession(BaseModel):
    id: str
    created_at: str
    task_description: str
    status: str = "active"  # "active", "paused", "stopped"
    target_url: str
    events: List[RecordedEvent] = Field(default_factory=list)
