from __future__ import annotations
from enum import Enum
from typing import List, Dict, Any, Optional
from pydantic import BaseModel, Field
import datetime
from .workflow import WorkflowDefinition


class AgentStatus(str, Enum):
    DRAFT = "draft"
    ACTIVE = "active"
    PAUSED = "paused"
    ARCHIVED = "archived"


class AgentMemoryConfig(BaseModel):
    enabled: bool = True
    long_term_memory: bool = True
    user_preferences: bool = True
    task_context_window: int = 5


class AgentTriggerType(str, Enum):
    MANUAL = "manual"
    SCHEDULED = "scheduled"
    WEBHOOK = "webhook"
    NEW_EMAIL = "new_email"
    FILE_CREATED = "file_created"


class AgentTriggerConfig(BaseModel):
    type: AgentTriggerType = AgentTriggerType.MANUAL
    cron_expression: Optional[str] = "0 9 * * 1-5"  # Every weekday at 9 AM
    timezone: str = "UTC"
    filter_criteria: Dict[str, Any] = Field(default_factory=dict)
    enabled: bool = False


class AgentExecutionPolicy(BaseModel):
    default_dry_run: bool = False
    requires_confirmation_on: List[str] = Field(default_factory=lambda: ["delete", "submit", "send_email"])
    max_daily_runs: int = 50
    allowed_origins: List[str] = Field(default_factory=list)


class AgentDefinition(BaseModel):
    id: str
    name: str
    description: str
    instructions: str
    model: str = "mistral:latest"
    assigned_skills: List[str] = Field(default_factory=list)
    connected_integrations: List[str] = Field(default_factory=list)
    memory_config: AgentMemoryConfig = Field(default_factory=AgentMemoryConfig)
    trigger_config: AgentTriggerConfig = Field(default_factory=AgentTriggerConfig)
    permission_scope: List[str] = Field(default_factory=list)
    execution_policy: AgentExecutionPolicy = Field(default_factory=AgentExecutionPolicy)
    workflow_plan: Optional[WorkflowDefinition] = None
    status: AgentStatus = AgentStatus.DRAFT
    created_at: str = Field(default_factory=lambda: datetime.datetime.now(datetime.timezone.utc).isoformat())
    updated_at: str = Field(default_factory=lambda: datetime.datetime.now(datetime.timezone.utc).isoformat())


class AgentProposalResponse(BaseModel):
    agent: AgentDefinition
    understanding_summary: str
    suggested_integrations: List[Dict[str, Any]]
    suggested_skills: List[Dict[str, Any]]
    required_permissions: List[str]
    ready_for_review: bool = True
