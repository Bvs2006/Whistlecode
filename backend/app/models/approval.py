from __future__ import annotations
import hmac
import hashlib
import json
import os
import secrets
from typing import List, Optional, Dict, Any
from pathlib import Path
from pydantic import BaseModel, Field
from .workflow import AllowedScope


class ApprovalScope(BaseModel):
    allowed_origins: List[str] = Field(default_factory=list)
    allowed_scope: Optional[AllowedScope] = None
    allowed_action_types: List[str] = Field(default_factory=list)
    parameter_constraints: Dict[str, Any] = Field(default_factory=dict)
    max_risk_level: str = "high"

    def get_effective_scope(self) -> AllowedScope:
        if self.allowed_scope:
            domains = list(dict.fromkeys(self.allowed_scope.domains + (self.allowed_origins or [])))
            return AllowedScope(
                domains=domains,
                apps=self.allowed_scope.apps,
                folders=self.allowed_scope.folders
            )
        return AllowedScope(domains=self.allowed_origins or [])


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

    @staticmethod
    def signing_key() -> bytes:
        configured = os.environ.get("WHISTLECODE_APPROVAL_SIGNING_KEY")
        if configured:
            return configured.encode("utf-8")
        key_path = Path(__file__).resolve().parents[2] / "approval_signing.key"
        try:
            key = key_path.read_bytes()
        except FileNotFoundError:
            key_path.parent.mkdir(parents=True, exist_ok=True)
            key = secrets.token_bytes(32)
            try:
                with key_path.open("xb") as key_file:
                    key_file.write(key)
            except FileExistsError:
                key = key_path.read_bytes()
        if len(key) < 32:
            raise RuntimeError("WhistleCode approval signing key is invalid; configure WHISTLECODE_APPROVAL_SIGNING_KEY or remove the invalid local key.")
        return key

    def signed_payload(self) -> bytes:
        scope_data = self.scope.model_dump(mode="json")
        if scope_data.get("allowed_scope") is None:
            scope_data.pop("allowed_scope", None)
        payload = {
            "id": self.id,
            "workflow_id": self.workflow_id,
            "version": self.version,
            "version_hash": self.version_hash,
            "scope": scope_data,
            "approver": self.approver,
            "created_at": self.created_at,
            "expires_at": self.expires_at,
        }
        return json.dumps(payload, sort_keys=True, separators=(",", ":")).encode("utf-8")

    def generate_signature(self, secret_key: Optional[bytes | str] = None) -> str:
        key = secret_key.encode("utf-8") if isinstance(secret_key, str) else secret_key
        key = key or self.signing_key()
        return hmac.new(key, self.signed_payload(), hashlib.sha256).hexdigest()

    def verify_signature(self, secret_key: Optional[bytes | str] = None) -> bool:
        expected = self.generate_signature(secret_key)
        return hmac.compare_digest(self.signature, expected)
