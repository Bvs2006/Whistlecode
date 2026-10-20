from __future__ import annotations
import uuid
import datetime
from typing import Optional, Dict, Any, List
from ..models.workflow import WorkflowDefinition
from ..models.approval import ApprovalRecord, ApprovalScope
from ..models.policy import ReasonCode
from ..db.database import get_db_connection


class ApprovalService:
    """
    Manages cryptographic and hash-bound approval records.
    Enforces that execution is locked strictly to approved version content hashes.
    """

    @staticmethod
    def create_approval(
        workflow: WorkflowDefinition,
        allowed_origins: Optional[List[str]] = None,
        allowed_action_types: Optional[List[str]] = None,
        duration_days: int = 30,
        approver: str = "local_user"
    ) -> ApprovalRecord:
        content_hash = workflow.compute_hash()
        
        # Actions present in workflow
        wf_actions = list({step.action.value for step in workflow.steps if step.enabled})
        wf_origins = allowed_origins or workflow.allowed_origins

        now = datetime.datetime.now(datetime.timezone.utc)
        expires_at = (now + datetime.timedelta(days=duration_days)).isoformat()
        
        scope = ApprovalScope(
            allowed_origins=wf_origins,
            allowed_action_types=allowed_action_types or wf_actions,
            parameter_constraints={p.name: {"type": p.type, "required": p.required} for p in workflow.parameters}
        )

        approval = ApprovalRecord(
            id=f"appr_{uuid.uuid4().hex[:12]}",
            workflow_id=workflow.workflow_id,
            version=workflow.version,
            version_hash=content_hash,
            scope=scope,
            approver=approver,
            created_at=now.isoformat(),
            expires_at=expires_at,
            revoked_at=None
        )
        approval.signature = approval.generate_signature()

        # Save to DB
        conn = get_db_connection()
        cursor = conn.cursor()
        cursor.execute(
            """
            INSERT INTO approvals (id, workflow_id, version, version_hash, scope_json, approver, created_at, expires_at, revoked_at, signature)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                approval.id,
                approval.workflow_id,
                approval.version,
                approval.version_hash,
                approval.scope.model_dump_json(),
                approval.approver,
                approval.created_at,
                approval.expires_at,
                approval.revoked_at,
                approval.signature
            )
        )
        conn.commit()
        conn.close()

        return approval

    @staticmethod
    def verify_approval_for_run(workflow: WorkflowDefinition, approval_id: str) -> tuple[bool, ReasonCode, Optional[ApprovalRecord]]:
        conn = get_db_connection()
        cursor = conn.cursor()
        cursor.execute("SELECT * FROM approvals WHERE id = ?", (approval_id,))
        row = cursor.fetchone()
        conn.close()

        if not row:
            return False, ReasonCode.APPROVAL_NOT_FOUND, None

        approval = ApprovalRecord(
            id=row["id"],
            workflow_id=row["workflow_id"],
            version=row["version"],
            version_hash=row["version_hash"],
            scope=ApprovalScope.model_validate_json(row["scope_json"]),
            approver=row["approver"],
            created_at=row["created_at"],
            expires_at=row["expires_at"],
            revoked_at=row["revoked_at"],
            signature=row["signature"]
        )

        # Check signature integrity
        if not approval.verify_signature():
            return False, ReasonCode.APPROVAL_HASH_MISMATCH, approval

        # Check revocation
        if approval.revoked_at:
            return False, ReasonCode.APPROVAL_REVOKED, approval

        # Check expiration
        now = datetime.datetime.now(datetime.timezone.utc)
        expires_at_dt = datetime.datetime.fromisoformat(approval.expires_at)
        if now > expires_at_dt:
            return False, ReasonCode.APPROVAL_EXPIRED, approval

        # Check content hash binding
        current_hash = workflow.compute_hash()
        if approval.version_hash != current_hash:
            return False, ReasonCode.APPROVAL_HASH_MISMATCH, approval

        return True, ReasonCode.ALLOWED_WITHIN_SCOPE, approval

    @staticmethod
    def revoke_approval(approval_id: str) -> bool:
        now = datetime.datetime.now(datetime.timezone.utc).isoformat()
        conn = get_db_connection()
        cursor = conn.cursor()
        cursor.execute("UPDATE approvals SET revoked_at = ? WHERE id = ?", (now, approval_id))
        affected = cursor.rowcount > 0
        conn.commit()
        conn.close()
        return affected
