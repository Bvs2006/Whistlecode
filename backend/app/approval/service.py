from __future__ import annotations
import uuid
import datetime
import re
from urllib.parse import urlparse
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
    def _origin(value: str) -> str:
        parsed = urlparse(value)
        if not parsed.scheme or not parsed.netloc or parsed.username or parsed.password:
            raise ValueError(f"Invalid approval origin: {value}")
        return f"{parsed.scheme.lower()}://{parsed.netloc.lower()}"

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
        if not any(step.enabled for step in workflow.steps):
            raise ValueError("Approval requires at least one enabled workflow step")
        if duration_days < 1 or duration_days > 365:
            raise ValueError("Approval duration must be between 1 and 365 days")
        wf_actions = sorted({step.action.value for step in workflow.steps if step.enabled})
        requested_origins = workflow.allowed_origins if allowed_origins is None else allowed_origins
        approved_origins = [ApprovalService._origin(origin) for origin in requested_origins]
        workflow_origins = {ApprovalService._origin(origin) for origin in workflow.allowed_origins}
        if not set(approved_origins).issubset(workflow_origins):
            raise ValueError("Approval scope cannot include origins outside the workflow's declared scope")
        approved_actions = sorted(set(wf_actions if allowed_action_types is None else allowed_action_types))
        if not set(approved_actions).issubset(set(wf_actions)):
            raise ValueError("Approval scope cannot include actions outside the validated plan")

        now = datetime.datetime.now(datetime.timezone.utc)
        expires_at = (now + datetime.timedelta(days=duration_days)).isoformat()
        
        scope = ApprovalScope(
            allowed_origins=approved_origins,
            allowed_action_types=approved_actions,
            parameter_constraints={
                p.name: {
                    "type": p.type,
                    "required": p.required,
                    "max_length": p.max_length,
                    "regex_pattern": p.regex_pattern,
                }
                for p in workflow.parameters
            }
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
    def verify_approval_for_run(
        workflow: WorkflowDefinition,
        approval_id: str,
        parameters: Optional[Dict[str, Any]] = None,
    ) -> tuple[bool, ReasonCode, Optional[ApprovalRecord]]:
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
        try:
            expires_at_dt = datetime.datetime.fromisoformat(approval.expires_at)
        except (TypeError, ValueError):
            return False, ReasonCode.APPROVAL_EXPIRED, approval
        if now > expires_at_dt:
            return False, ReasonCode.APPROVAL_EXPIRED, approval

        # Check content hash binding
        current_hash = workflow.compute_hash()
        if approval.version_hash != current_hash:
            return False, ReasonCode.APPROVAL_HASH_MISMATCH, approval

        if approval.workflow_id != workflow.workflow_id or approval.version != workflow.version:
            return False, ReasonCode.APPROVAL_HASH_MISMATCH, approval

        if parameters is not None:
            constraints = approval.scope.parameter_constraints
            workflow_parameters = {definition.name: definition for definition in workflow.parameters}
            if not set(parameters).issubset(constraints):
                return False, ReasonCode.APPROVAL_SCOPE_MISMATCH, approval
            for name, constraint in constraints.items():
                value_present = name in parameters
                definition = workflow_parameters.get(name)
                if not value_present and constraint.get("required") and (definition is None or definition.default_value is None):
                    return False, ReasonCode.APPROVAL_SCOPE_MISMATCH, approval
                if not value_present:
                    continue
                value = parameters[name]
                expected_type = constraint.get("type", "string")
                type_valid = (
                    isinstance(value, str) if expected_type == "string" else
                    (isinstance(value, (int, float)) and not isinstance(value, bool)) if expected_type == "number" else
                    isinstance(value, bool) if expected_type == "boolean" else False
                )
                if not type_valid:
                    return False, ReasonCode.APPROVAL_SCOPE_MISMATCH, approval
                max_length = constraint.get("max_length")
                if max_length is not None and isinstance(value, str) and len(value) > max_length:
                    return False, ReasonCode.APPROVAL_SCOPE_MISMATCH, approval
                pattern = constraint.get("regex_pattern")
                if pattern and isinstance(value, str) and re.fullmatch(pattern, value) is None:
                    return False, ReasonCode.APPROVAL_SCOPE_MISMATCH, approval

        return True, ReasonCode.ALLOWED_WITHIN_SCOPE, approval

    @staticmethod
    def revoke_approval(approval_id: str) -> bool:
        now = datetime.datetime.now(datetime.timezone.utc).isoformat()
        with get_db_connection() as conn:
            cursor = conn.cursor()
            cursor.execute("UPDATE approvals SET revoked_at = ? WHERE id = ? AND revoked_at IS NULL", (now, approval_id))
            affected = cursor.rowcount > 0
        return affected
