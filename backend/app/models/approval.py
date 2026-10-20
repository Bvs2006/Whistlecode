from __future__ import annotations
import hmac
import hashlib
from typing import List, Optional, Dict, Any
from pydantic import BaseModel, Field


class ApprovalScope(BaseModel):
    allowed_origins: List[str]
    allowed_action_types: List[str]
    parameter_constraints: Dict[str, Any] = Field(default_factory=dict)
    max_risk_level: str = "high"


class ApprovalRecord(BaseModel):
    id: str
    workflow_id: str
    version: int
    version_hash: str
    scope: ApprovalScope
    approver: str = "local_user"
    created_at: str
    expires_at: str
    revoked_at: Optional[str] = None
    signature: str = ""

    def generate_signature(self, secret_key: str = "local-antigravity-secret-key") -> str:
        payload = f"{self.workflow_id}:{self.version}:{self.version_hash}:{self.approver}:{self.expires_at}"
        return hmac.new(secret_key.encode('utf-8'), payload.encode('utf-8'), hashlib.sha256).hexdigest()

    def verify_signature(self, secret_key: str = "local-antigravity-secret-key") -> bool:
        expected = self.generate_signature(secret_key)
        return hmac.compare_digest(self.signature, expected)
