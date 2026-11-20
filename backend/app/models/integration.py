from __future__ import annotations
from enum import Enum
from typing import Dict, Any, List, Optional
from pydantic import BaseModel, Field
import datetime


class IntegrationStatus(str, Enum):
    CONNECTED = "connected"
    DISCONNECTED = "disconnected"
    ERROR = "error"
    CONFIGURING = "configuring"


class IntegrationToolSchema(BaseModel):
    name: str
    description: str
    parameters: Dict[str, Any] = Field(default_factory=dict)
    required_permissions: List[str] = Field(default_factory=list)


class IntegrationDefinition(BaseModel):
    id: str
    name: str
    description: str
    category: str = "general"  # "browser", "google_workspace", "developer", "system", "mcp"
    status: IntegrationStatus = IntegrationStatus.DISCONNECTED
    icon: str = "Plug"
    is_mcp: bool = False
    endpoint_or_server: Optional[str] = None
    available_tools: List[IntegrationToolSchema] = Field(default_factory=list)
    required_permissions: List[str] = Field(default_factory=list)
    config_schema: Dict[str, Any] = Field(default_factory=dict)
    has_credentials: bool = False
    masked_credential: Optional[str] = None
    credential_source: Optional[str] = None  # "vault", "env", "none"
    availability: str = "unknown"
    status_detail: str = ""
    last_tested_at: Optional[str] = None
    created_at: str = Field(default_factory=lambda: datetime.datetime.now(datetime.timezone.utc).isoformat())
    updated_at: str = Field(default_factory=lambda: datetime.datetime.now(datetime.timezone.utc).isoformat())
