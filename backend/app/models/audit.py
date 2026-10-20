from __future__ import annotations
import json
import hashlib
from typing import Optional, Dict, Any
from pydantic import BaseModel, Field


class AuditEntry(BaseModel):
    id: int
    timestamp: str
    actor: str  # "user", "executor", "policy_engine", "recorder", "system"
    event_type: str  # "RECORDING_STARTED", "POLICY_EVALUATION", "ACTION_EXECUTED", "CONFIRMATION_GRANTED", etc.
    workflow_id: Optional[str] = None
    version_hash: Optional[str] = None
    ref_ids: Dict[str, Any] = Field(default_factory=dict)
    details: Dict[str, Any] = Field(default_factory=dict)
    prev_hash: str
    entry_hash: str = ""

    def compute_hash(self) -> str:
        data = {
            "id": self.id,
            "timestamp": self.timestamp,
            "actor": self.actor,
            "event_type": self.event_type,
            "workflow_id": self.workflow_id,
            "version_hash": self.version_hash,
            "ref_ids": self.ref_ids,
            "details": self.details,
            "prev_hash": self.prev_hash
        }
        canonical_str = json.dumps(data, sort_keys=True, separators=(',', ':'))
        return hashlib.sha256(canonical_str.encode('utf-8')).hexdigest()
