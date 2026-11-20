from __future__ import annotations
from typing import Dict, Any, List, Optional
from pydantic import BaseModel, Field


class Capability(BaseModel):
    id: str
    name: str
    description: str
    input_schema: Dict[str, Any] = Field(default_factory=dict)
    output_schema: Dict[str, Any] = Field(default_factory=dict)
    required_permissions: List[str] = Field(default_factory=list)
    handler: Optional[str] = None
    status: str = "available"  # "available" | "unavailable" | "degraded"
    supported_operations: List[str] = Field(default_factory=list)
    surface: str = "browser"  # "browser" | "desktop" | "file" | "multi"
    source: str = "custom"  # "skill" | "tool" | "workflow" | "driver"


class TaskInput(BaseModel):
    name: str
    type: str = "string"
    value: Optional[Any] = None
    is_missing: bool = False
    description: Optional[str] = None


class TargetHints(BaseModel):
    urls: List[str] = Field(default_factory=list)
    app_names: List[str] = Field(default_factory=list)
    paths: List[str] = Field(default_factory=list)


class TaskRepresentation(BaseModel):
    intent: str
    category: str
    operations: List[str] = Field(default_factory=list)
    required_tools: List[str] = Field(default_factory=list)
    inputs: Dict[str, TaskInput] = Field(default_factory=dict)
    expected_output: str
    permissions: List[str] = Field(default_factory=list)
    surfaces: List[str] = Field(default_factory=list)
    target_hints: TargetHints = Field(default_factory=TargetHints)
    surface_confidence: float = 1.0
