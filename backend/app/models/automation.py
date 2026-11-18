from __future__ import annotations
from enum import Enum
from typing import Dict, Any, List, Optional
from pydantic import BaseModel, Field
import datetime


class TriggerType(str, Enum):
    MANUAL = "manual"
    SCHEDULED = "scheduled"
    WEBHOOK = "webhook"
    NEW_EMAIL = "new_email"
    FILE_CREATED = "file_created"
    APP_EVENT = "app_event"


class AutomationStatus(str, Enum):
    ACTIVE = "active"
    PAUSED = "paused"
    DISABLED = "disabled"


class AutomationDefinition(BaseModel):
    id: str
    name: str
    description: str
    agent_id: Optional[str] = None
    trigger_type: TriggerType = TriggerType.SCHEDULED
    schedule_cron: Optional[str] = "0 9 * * 1-5"  # Weekdays 9 AM
    timezone: str = "UTC"
    event_filter: Dict[str, Any] = Field(default_factory=dict)
    retry_count: int = 3
    retry_delay_seconds: int = 60
    duplicate_protection_window_seconds: int = 300
    status: AutomationStatus = AutomationStatus.ACTIVE
    required_permissions: List[str] = Field(default_factory=list)
    last_triggered_at: Optional[str] = None
    next_run_at: Optional[str] = None
    execution_count: int = 0
    failure_count: int = 0
    created_at: str = Field(default_factory=lambda: datetime.datetime.now(datetime.timezone.utc).isoformat())
    updated_at: str = Field(default_factory=lambda: datetime.datetime.now(datetime.timezone.utc).isoformat())
