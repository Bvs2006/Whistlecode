from __future__ import annotations
import json
import datetime
from typing import Optional, Dict, Any, List
from ..models.audit import AuditEntry
from ..db.database import get_db_connection


class AuditLogger:
    """
    Append-only, tamper-evident audit logger with cryptographic hash-chaining (AUD-1..4).
    Enforces secret scrubbing so passwords and tokens never enter audit logs (AUD-2).
    """

    GENESIS_HASH = "0000000000000000000000000000000000000000000000000000000000000000"

    @classmethod
    def sanitize_secrets(cls, data: Any) -> Any:
        if isinstance(data, dict):
            sanitized = {}
            for k, v in data.items():
                if any(sensitive in k.lower() for sensitive in ["password", "secret", "token", "ssn", "cvv", "key"]):
                    sanitized[k] = "[REDACTED_SECRET]"
                else:
                    sanitized[k] = cls.sanitize_secrets(v)
            return sanitized
        elif isinstance(data, list):
            return [cls.sanitize_secrets(item) for item in data]
        return data

    @classmethod
    def log_event(
        cls,
        actor: str,
        event_type: str,
        workflow_id: Optional[str] = None,
        version_hash: Optional[str] = None,
        ref_ids: Optional[Dict[str, Any]] = None,
        details: Optional[Dict[str, Any]] = None
    ) -> AuditEntry:
        clean_ref_ids = cls.sanitize_secrets(ref_ids or {})
        clean_details = cls.sanitize_secrets(details or {})
        now = datetime.datetime.now(datetime.timezone.utc).isoformat()

        conn = get_db_connection()
        cursor = conn.cursor()
        try:
            # Serialize writers so concurrent events cannot fork the hash chain.
            cursor.execute("BEGIN IMMEDIATE")
            cursor.execute("SELECT entry_hash FROM audit_log ORDER BY id DESC LIMIT 1")
            last_row = cursor.fetchone()
            prev_hash = last_row["entry_hash"] if last_row else cls.GENESIS_HASH
            cursor.execute("SELECT COALESCE(MAX(id), 0) + 1 AS next_id FROM audit_log")
            next_id = cursor.fetchone()["next_id"]

            entry = AuditEntry(
                id=next_id,
                timestamp=now,
                actor=actor,
                event_type=event_type,
                workflow_id=workflow_id,
                version_hash=version_hash,
                ref_ids=clean_ref_ids,
                details=clean_details,
                prev_hash=prev_hash
            )
            entry.entry_hash = entry.compute_hash()
            cursor.execute(
                """INSERT INTO audit_log (ts, actor, event_type, workflow_id, version_hash, ref_ids_json, details_json, prev_hash, entry_hash)
                   VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)""",
                (entry.timestamp, entry.actor, entry.event_type, entry.workflow_id,
                 entry.version_hash, json.dumps(entry.ref_ids), json.dumps(entry.details),
                 entry.prev_hash, entry.entry_hash)
            )
            conn.commit()
        except Exception:
            conn.rollback()
            raise
        finally:
            conn.close()

        return entry

    @classmethod
    def verify_chain(cls) -> tuple[bool, Optional[int]]:
        """
        Validates tamper-evidence across the entire audit log history.
        Returns (is_valid, failing_entry_id_if_any).
        """
        conn = get_db_connection()
        cursor = conn.cursor()
        cursor.execute("SELECT * FROM audit_log ORDER BY id ASC")
        rows = cursor.fetchall()
        conn.close()

        prev_hash = cls.GENESIS_HASH
        for row in rows:
            entry = AuditEntry(
                id=row["id"],
                timestamp=row["ts"],
                actor=row["actor"],
                event_type=row["event_type"],
                workflow_id=row["workflow_id"],
                version_hash=row["version_hash"],
                ref_ids=json.loads(row["ref_ids_json"] or "{}"),
                details=json.loads(row["details_json"] or "{}"),
                prev_hash=row["prev_hash"],
                entry_hash=row["entry_hash"]
            )
            if entry.prev_hash != prev_hash:
                return False, entry.id
            if entry.compute_hash() != entry.entry_hash:
                return False, entry.id
            prev_hash = entry.entry_hash

        return True, None

    @classmethod
    def get_entries(cls, limit: int = 100) -> List[Dict[str, Any]]:
        conn = get_db_connection()
        cursor = conn.cursor()
        cursor.execute("SELECT * FROM audit_log ORDER BY id DESC LIMIT ?", (limit,))
        rows = cursor.fetchall()
        conn.close()
        
        return [
            {
                "id": r["id"],
                "timestamp": r["ts"],
                "actor": r["actor"],
                "event_type": r["event_type"],
                "workflow_id": r["workflow_id"],
                "version_hash": r["version_hash"],
                "ref_ids": json.loads(r["ref_ids_json"] or "{}"),
                "details": json.loads(r["details_json"] or "{}"),
                "prev_hash": r["prev_hash"],
                "entry_hash": r["entry_hash"]
            }
            for r in rows
        ]
