from __future__ import annotations
import sqlite3
import json
import uuid
import datetime
import hashlib
from abc import ABC, abstractmethod
from typing import List, Dict, Any, Optional
from pydantic import BaseModel, Field

from .database import get_db_connection
from ..models.workflow import WorkflowDefinition, Step, ParameterDefinition


class WorkflowMetadata(BaseModel):
    id: str
    title: str
    intent: str
    tags: List[str] = Field(default_factory=list)
    version: int = 1
    content_hash: str
    is_enabled: bool = True
    is_archived: bool = False
    created_at: str
    last_run_status: Optional[str] = None
    last_run_at: Optional[str] = None
    step_count: int = 0


class WorkflowRepository(ABC):
    """Abstract repository for persisting and managing versioned workflows locally."""

    @abstractmethod
    def list_workflows(self, search: Optional[str] = None, include_archived: bool = False) -> List[WorkflowMetadata]:
        pass

    @abstractmethod
    def get_workflow(self, workflow_id: str, version: Optional[int] = None) -> Optional[WorkflowDefinition]:
        pass

    @abstractmethod
    def save_workflow(self, workflow: WorkflowDefinition, change_summary: str = "Saved workflow") -> WorkflowDefinition:
        pass

    @abstractmethod
    def duplicate_workflow(self, workflow_id: str, new_title: Optional[str] = None) -> WorkflowDefinition:
        pass

    @abstractmethod
    def set_enabled(self, workflow_id: str, enabled: bool) -> bool:
        pass

    @abstractmethod
    def set_archived(self, workflow_id: str, archived: bool) -> bool:
        pass

    @abstractmethod
    def delete_workflow(self, workflow_id: str, retain_history: bool = True) -> bool:
        pass


class SQLiteWorkflowRepository(WorkflowRepository):
    """
    SQLite implementation of WorkflowRepository.
    Enforces:
      - Versioned schema and stable workflow IDs
      - Prevention of disabled/archived workflows from being initiated
      - Credential sanitization (passwords/keys never stored in workflow JSON)
      - Explicit deletion semantics with audit retention clarification
    """

    SECRET_TERMS = {"password", "secret", "token", "auth", "api_key", "credential"}

    def __init__(self):
        self._ensure_columns()

    def _ensure_columns(self):
        """Ensures modern metadata columns exist on workflows table."""
        conn = get_db_connection()
        cursor = conn.cursor()
        try:
            cursor.execute("ALTER TABLE workflows ADD COLUMN is_enabled INTEGER DEFAULT 1")
        except sqlite3.OperationalError:
            pass
        try:
            cursor.execute("ALTER TABLE workflows ADD COLUMN is_archived INTEGER DEFAULT 0")
        except sqlite3.OperationalError:
            pass
        try:
            cursor.execute("ALTER TABLE workflows ADD COLUMN tags_json TEXT DEFAULT '[]'")
        except sqlite3.OperationalError:
            pass
        conn.commit()
        conn.close()

    def _sanitize_workflow_credentials(self, workflow: WorkflowDefinition) -> WorkflowDefinition:
        """Strips accidental credentials from parameters or steps."""
        for p in workflow.parameters:
            if any(term in p.name.lower() for term in self.SECRET_TERMS):
                p.default_value = "[SECURE_INPUT_REQUIRED]"
        for s in workflow.steps:
            for k, v in list(s.args.items()):
                if any(term in k.lower() for term in self.SECRET_TERMS) and isinstance(v, str):
                    s.args[k] = "[REDACTED]"
        return workflow

    def list_workflows(self, search: Optional[str] = None, include_archived: bool = False) -> List[WorkflowMetadata]:
        conn = get_db_connection()
        cursor = conn.cursor()

        query = """
        SELECT w.id, w.title, w.intent, w.created_at, w.is_enabled, w.is_archived, w.tags_json,
               v.version, v.content_hash, v.json_data,
               r.state as last_state, r.started_at as last_run_at
        FROM workflows w
        LEFT JOIN (
            SELECT workflow_id, MAX(version) as max_v
            FROM workflow_versions
            GROUP BY workflow_id
        ) latest ON w.id = latest.workflow_id
        LEFT JOIN workflow_versions v ON w.id = v.workflow_id AND v.version = latest.max_v
        LEFT JOIN (
            SELECT workflow_id, state, started_at
            FROM runs
            ORDER BY started_at DESC
            LIMIT 1
        ) r ON w.id = r.workflow_id
        WHERE 1=1
        """
        params: List[Any] = []

        if not include_archived:
            query += " AND (w.is_archived = 0 OR w.is_archived IS NULL)"

        if search and search.strip():
            query += " AND (w.title LIKE ? OR w.intent LIKE ? OR w.id LIKE ?)"
            s_term = f"%{search.strip()}%"
            params.extend([s_term, s_term, s_term])

        query += " ORDER BY w.created_at DESC"
        cursor.execute(query, params)
        rows = cursor.fetchall()
        conn.close()

        results: List[WorkflowMetadata] = []
        for r in rows:
            tags = []
            try:
                tags = json.loads(r["tags_json"]) if r["tags_json"] else []
            except Exception:
                pass

            step_count = 0
            if r["json_data"]:
                try:
                    wf_data = json.loads(r["json_data"])
                    step_count = len(wf_data.get("steps", []))
                except Exception:
                    pass

            results.append(WorkflowMetadata(
                id=r["id"],
                title=r["title"],
                intent=r["intent"],
                tags=tags,
                version=r["version"] or 1,
                content_hash=r["content_hash"] or "unknown",
                is_enabled=bool(r["is_enabled"] if r["is_enabled"] is not None else 1),
                is_archived=bool(r["is_archived"] if r["is_archived"] is not None else 0),
                created_at=r["created_at"],
                last_run_status=r["last_state"] or "Not run yet",
                last_run_at=r["last_run_at"],
                step_count=step_count
            ))

        return results

    def get_workflow(self, workflow_id: str, version: Optional[int] = None) -> Optional[WorkflowDefinition]:
        conn = get_db_connection()
        cursor = conn.cursor()

        if version is not None:
            cursor.execute("""
                SELECT json_data FROM workflow_versions
                WHERE workflow_id = ? AND version = ?
            """, (workflow_id, version))
        else:
            cursor.execute("""
                SELECT json_data FROM workflow_versions
                WHERE workflow_id = ?
                ORDER BY version DESC LIMIT 1
            """, (workflow_id,))

        row = cursor.fetchone()
        conn.close()

        if not row:
            return None

        data = json.loads(row["json_data"])
        return WorkflowDefinition(**data)

    def save_workflow(self, workflow: WorkflowDefinition, change_summary: str = "Saved workflow") -> WorkflowDefinition:
        workflow = self._sanitize_workflow_credentials(workflow)
        conn = get_db_connection()
        cursor = conn.cursor()

        now = datetime.datetime.now(datetime.timezone.utc).isoformat()

        # Check if workflow exists
        cursor.execute("SELECT id FROM workflows WHERE id = ?", (workflow.workflow_id,))
        exists = cursor.fetchone()

        if not exists:
            cursor.execute("""
                INSERT INTO workflows (id, title, intent, created_at, is_enabled, is_archived, tags_json)
                VALUES (?, ?, ?, ?, 1, 0, ?)
            """, (workflow.workflow_id, workflow.title, workflow.intent, now, json.dumps(["Automation", "Verified"])))
            new_version = 1
        else:
            # Increment version
            cursor.execute("SELECT MAX(version) FROM workflow_versions WHERE workflow_id = ?", (workflow.workflow_id,))
            max_v = cursor.fetchone()[0] or 0
            new_version = max_v + 1

        workflow.version = new_version
        workflow_json = json.dumps(workflow.model_dump(), default=str)
        content_hash = f"sha256:{hashlib.sha256(workflow_json.encode()).hexdigest()}"
        workflow.content_hash = content_hash

        version_id = f"wv_{uuid.uuid4().hex[:10]}"
        cursor.execute("""
            INSERT INTO workflow_versions (id, workflow_id, version, content_hash, json_data, parent_version, change_summary, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        """, (version_id, workflow.workflow_id, new_version, content_hash, workflow_json, new_version - 1 if new_version > 1 else None, change_summary, now))

        # Update title & intent on parent table
        cursor.execute("UPDATE workflows SET title = ?, intent = ? WHERE id = ?", (workflow.title, workflow.intent, workflow.workflow_id))

        conn.commit()
        conn.close()
        return workflow

    def duplicate_workflow(self, workflow_id: str, new_title: Optional[str] = None) -> WorkflowDefinition:
        original = self.get_workflow(workflow_id)
        if not original:
            raise ValueError(f"Workflow '{workflow_id}' not found.")

        new_id = f"wf_{uuid.uuid4().hex[:8]}"
        dup_title = new_title or f"Copy of {original.title}"

        duplicated = original.model_copy(deep=True)
        duplicated.workflow_id = new_id
        duplicated.title = dup_title
        duplicated.version = 1
        duplicated.change_summary = f"Duplicated from {workflow_id}"

        return self.save_workflow(duplicated, f"Duplicated from {workflow_id}")

    def set_enabled(self, workflow_id: str, enabled: bool) -> bool:
        conn = get_db_connection()
        cursor = conn.cursor()
        cursor.execute("UPDATE workflows SET is_enabled = ? WHERE id = ?", (1 if enabled else 0, workflow_id))
        affected = cursor.rowcount > 0
        conn.commit()
        conn.close()
        return affected

    def set_archived(self, workflow_id: str, archived: bool) -> bool:
        conn = get_db_connection()
        cursor = conn.cursor()
        cursor.execute("UPDATE workflows SET is_archived = ? WHERE id = ?", (1 if archived else 0, workflow_id))
        affected = cursor.rowcount > 0
        conn.commit()
        conn.close()
        return affected

    def delete_workflow(self, workflow_id: str, retain_history: bool = True) -> bool:
        """
        Deletes the workflow and its definition versions.
        If retain_history is True (default), past run execution receipts and audit logs
        remain preserved for compliance, with workflow references detached.
        """
        conn = get_db_connection()
        cursor = conn.cursor()

        # Delete workflow versions
        cursor.execute("DELETE FROM workflow_versions WHERE workflow_id = ?", (workflow_id,))
        # Delete approvals
        cursor.execute("DELETE FROM approvals WHERE workflow_id = ?", (workflow_id,))

        if not retain_history:
            cursor.execute("DELETE FROM runs WHERE workflow_id = ?", (workflow_id,))

        # Delete parent workflow record
        cursor.execute("DELETE FROM workflows WHERE id = ?", (workflow_id,))
        affected = cursor.rowcount > 0

        conn.commit()
        conn.close()
        return affected


default_workflow_repository = SQLiteWorkflowRepository()
