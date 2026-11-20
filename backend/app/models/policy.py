from __future__ import annotations
from enum import Enum
from typing import List, Optional, Dict, Any
from pydantic import BaseModel, Field
from .workflow import ActionType, RiskLevel, AllowedScope


class PolicyDecision(str, Enum):
    ALLOW = "ALLOW"
    REQUIRE_CONFIRMATION = "REQUIRE_CONFIRMATION"
    DENY = "DENY"


class ReasonCode(str, Enum):
    ALLOWED_BY_RULE = "ALLOWED_BY_RULE"
    ALLOWED_WITHIN_SCOPE = "ALLOWED_WITHIN_SCOPE"
    HIGH_RISK_CONFIRMATION_REQUIRED = "HIGH_RISK_CONFIRMATION_REQUIRED"
    GATED_STEP_CONFIRMATION_REQUIRED = "GATED_STEP_CONFIRMATION_REQUIRED"
    UNAPPROVED_ORIGIN = "UNAPPROVED_ORIGIN"
    ACTION_TYPE_NOT_ALLOWED = "ACTION_TYPE_NOT_ALLOWED"
    APPROVAL_EXPIRED = "APPROVAL_EXPIRED"
    APPROVAL_REVOKED = "APPROVAL_REVOKED"
    APPROVAL_HASH_MISMATCH = "APPROVAL_HASH_MISMATCH"
    APPROVAL_NOT_FOUND = "APPROVAL_NOT_FOUND"
    APPROVAL_SCOPE_MISMATCH = "APPROVAL_SCOPE_MISMATCH"
    SENSITIVE_FIELD_RESTRICTED = "SENSITIVE_FIELD_RESTRICTED"
    CRITICAL_RISK_DENIED = "CRITICAL_RISK_DENIED"
    LIMIT_EXCEEDED = "LIMIT_EXCEEDED"
    PRECONDITION_FAILED = "PRECONDITION_FAILED"
    UNKNOWN_DEFAULT_DENY = "UNKNOWN_DEFAULT_DENY"


class ActionPolicyRule(BaseModel):
    risk: RiskLevel = RiskLevel.LOW
    decision: PolicyDecision = PolicyDecision.ALLOW
    deny_if_field_sensitivity: List[str] = Field(default_factory=list)


class PolicyLimits(BaseModel):
    max_actions_per_run: int = 200
    max_run_seconds: int = 600
    max_repeat_nonidempotent: int = 1


class PolicyConfig(BaseModel):
    policy_version: str = "0.1.0"
    default_decision: PolicyDecision = PolicyDecision.DENY
    allowed_origins: List[str] = Field(default_factory=list)
    allowed_apps: List[str] = Field(default_factory=list)
    allowed_folders: List[str] = Field(default_factory=list)
    allowed_scope: Optional[AllowedScope] = None
    actions: Dict[str, ActionPolicyRule] = Field(default_factory=dict)
    limits: PolicyLimits = Field(default_factory=PolicyLimits)

    def get_effective_scope(self) -> AllowedScope:
        if self.allowed_scope:
            domains = list(dict.fromkeys(self.allowed_scope.domains + (self.allowed_origins or [])))
            apps = list(dict.fromkeys(self.allowed_scope.apps + (self.allowed_apps or [])))
            folders = list(dict.fromkeys(self.allowed_scope.folders + (self.allowed_folders or [])))
            return AllowedScope(domains=domains, apps=apps, folders=folders)
        return AllowedScope(domains=self.allowed_origins or [], apps=self.allowed_apps or [], folders=self.allowed_folders or [])
