from __future__ import annotations
from enum import Enum
from typing import Dict, Any, List, Optional
from pydantic import BaseModel, Field
import datetime
from .workflow import WorkflowDefinition


class SkillCategory(str, Enum):
    EMAIL = "email"
    DOCUMENTS = "documents"
    WEB = "web"
    DEVOPS = "devops"
    ANALYSIS = "analysis"
    GENERAL = "general"


class SkillDefinition(BaseModel):
    id: str
    name: str
    description: str
    category: SkillCategory = SkillCategory.GENERAL
    input_schema: Dict[str, Any] = Field(default_factory=dict)
    output_schema: Dict[str, Any] = Field(default_factory=dict)
    workflow_definition: Optional[Dict[str, Any]] = None
    required_tools: List[str] = Field(default_factory=list)
    permission_requirements: List[str] = Field(default_factory=list)
    version: int = 1
    is_trusted: bool = False
    validation_status: str = "validated"  # "pending_validation", "validated", "rejected"
    execution_count: int = 0
    success_count: int = 0
    failure_count: int = 0
    created_at: str = Field(default_factory=lambda: datetime.datetime.now(datetime.timezone.utc).isoformat())
    updated_at: str = Field(default_factory=lambda: datetime.datetime.now(datetime.timezone.utc).isoformat())


class MemoryCategory(str, Enum):
    USER_PREFERENCES = "user_preferences"
    TASK_CONTEXT = "task_context"
    EXECUTION_SUMMARY = "execution_summary"
    LEARNED_WORKFLOW = "learned_workflow"
    FREQUENTLY_USED_PARAMETERS = "frequently_used_parameters"


class AgentMemoryItem(BaseModel):
    id: str
    agent_id: Optional[str] = None
    category: MemoryCategory
    key: str
    value: str
    provenance: str = "user_entry"  # "recorded_run", "daily_log", "user_entry", "system_learned"
    confidence: float = 1.0
    created_at: str = Field(default_factory=lambda: datetime.datetime.now(datetime.timezone.utc).isoformat())
    updated_at: str = Field(default_factory=lambda: datetime.datetime.now(datetime.timezone.utc).isoformat())
