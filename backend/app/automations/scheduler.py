from __future__ import annotations
import json
import sqlite3
import uuid
import datetime
from typing import List, Optional, Dict, Any
from app.db.database import get_db
from app.models.automation import AutomationDefinition, AutomationStatus, TriggerType


DEFAULT_AUTOMATIONS = [
    {
        "id": "auto_invoice_morning",
        "name": "Weekday Morning Invoice Triage",
        "description": "Every weekday at 9:00 AM UTC, scans incoming emails for vendor invoices, extracts invoice line totals, and files them into the local accounting repository.",
        "agent_id": "agent_invoice_organizer",
        "trigger_type": TriggerType.SCHEDULED,
        "schedule_cron": "0 9 * * 1-5",
        "timezone": "UTC",
        "event_filter": {"subject_contains": "invoice", "has_attachment": True},
        "retry_count": 3,
        "retry_delay_seconds": 60,
        "duplicate_protection_window_seconds": 3600,
        "status": AutomationStatus.ACTIVE,
        "required_permissions": ["read_email", "write_file"],
        "execution_count": 22,
        "failure_count": 0
    },
    {
        "id": "auto_github_triage",
        "name": "Inbound GitHub Issue Auto-Labeler",
        "description": "Triggered via Webhook whenever a new GitHub issue is opened; analyzes error trace and assigns priority and component labels.",
        "agent_id": "agent_github_triage",
        "trigger_type": TriggerType.WEBHOOK,
        "schedule_cron": None,
        "timezone": "UTC",
        "event_filter": {"action": "opened", "repository": "ChronicleAI"},
        "retry_count": 2,
        "retry_delay_seconds": 30,
        "duplicate_protection_window_seconds": 300,
        "status": AutomationStatus.ACTIVE,
        "required_permissions": ["read_github", "write_github"],
        "execution_count": 48,
        "failure_count": 1
    },
    {
        "id": "auto_download_watcher",
        "name": "Downloads Folder Organizer",
        "description": "Listens for file creation events in the Downloads folder and sorts PDF/DOCX reports into categorized project directories.",
        "agent_id": "agent_invoice_organizer",
        "trigger_type": TriggerType.FILE_CREATED,
        "schedule_cron": None,
        "timezone": "UTC",
        "event_filter": {"folder": "Downloads", "extensions": [".pdf", ".csv", ".xlsx"]},
        "retry_count": 1,
        "retry_delay_seconds": 15,
        "duplicate_protection_window_seconds": 60,
        "status": AutomationStatus.ACTIVE,
        "required_permissions": ["read_file", "write_file"],
        "execution_count": 105,
        "failure_count": 2
    }
]


class AutomationService:
    @staticmethod
    def _row_to_automation(row: sqlite3.Row) -> AutomationDefinition:
        return AutomationDefinition(
            id=row["id"],
            name=row["name"],
            description=row["description"] or "",
            agent_id=row["agent_id"],
            trigger_type=TriggerType(row["trigger_type"]) if row["trigger_type"] in [t.value for t in TriggerType] else TriggerType.MANUAL,
            schedule_cron=row["schedule_cron"],
            timezone=row["timezone"],
            event_filter=json.loads(row["event_filter_json"]) if row["event_filter_json"] else {},
            retry_count=row["retry_count"],
            retry_delay_seconds=row["retry_delay_seconds"],
            duplicate_protection_window_seconds=row["duplicate_protection_window_seconds"],
            status=AutomationStatus(row["status"]) if row["status"] in [s.value for s in AutomationStatus] else AutomationStatus.DISABLED,
            required_permissions=json.loads(row["required_permissions_json"]) if row["required_permissions_json"] else [],
            last_triggered_at=row["last_triggered_at"],
            next_run_at=row["next_run_at"],
            execution_count=row["execution_count"],
            failure_count=row["failure_count"],
            created_at=row["created_at"],
            updated_at=row["updated_at"]
        )

    @classmethod
    def seed_default_automations(cls):
        conn = get_db()
        cursor = conn.cursor()
        cursor.execute("SELECT COUNT(*) FROM automations")
        count = cursor.fetchone()[0]
        if count == 0:
            now = datetime.datetime.now(datetime.timezone.utc).isoformat()
            tomorrow_9am = (datetime.datetime.now(datetime.timezone.utc) + datetime.timedelta(days=1)).replace(hour=9, minute=0, second=0).isoformat()
            for auto in DEFAULT_AUTOMATIONS:
                cursor.execute("""
                    INSERT INTO automations (
                        id, name, description, agent_id, trigger_type, schedule_cron, timezone,
                        event_filter_json, retry_count, retry_delay_seconds,
                        duplicate_protection_window_seconds, status, required_permissions_json,
                        last_triggered_at, next_run_at, execution_count, failure_count,
                        created_at, updated_at
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """, (
                    auto["id"],
                    auto["name"],
                    auto["description"],
                    auto["agent_id"],
                    auto["trigger_type"].value,
                    auto["schedule_cron"],
                    auto["timezone"],
                    json.dumps(auto["event_filter"]),
                    auto["retry_count"],
                    auto["retry_delay_seconds"],
                    auto["duplicate_protection_window_seconds"],
                    auto["status"].value,
                    json.dumps(auto["required_permissions"]),
                    now,
                    tomorrow_9am if auto["schedule_cron"] else None,
                    auto["execution_count"],
                    auto["failure_count"],
                    now,
                    now
                ))
            conn.commit()
        conn.close()

    @classmethod
    def list_automations(cls, status: Optional[str] = None) -> List[AutomationDefinition]:
        cls.seed_default_automations()
        conn = get_db()
        cursor = conn.cursor()
        if status:
            cursor.execute("SELECT * FROM automations WHERE status = ? ORDER BY created_at DESC", (status,))
        else:
            cursor.execute("SELECT * FROM automations ORDER BY created_at DESC")
        rows = cursor.fetchall()
        autos = [cls._row_to_automation(r) for r in rows]
        conn.close()
        return autos

    @classmethod
    def get_automation(cls, auto_id: str) -> Optional[AutomationDefinition]:
        cls.seed_default_automations()
        conn = get_db()
        cursor = conn.cursor()
        cursor.execute("SELECT * FROM automations WHERE id = ?", (auto_id,))
        row = cursor.fetchone()
        conn.close()
        if not row:
            return None
        return cls._row_to_automation(row)

    @classmethod
    def create_automation(cls, data: Dict[str, Any]) -> AutomationDefinition:
        conn = get_db()
        cursor = conn.cursor()
        now = datetime.datetime.now(datetime.timezone.utc).isoformat()
        auto_id = data.get("id") or f"auto_{uuid.uuid4().hex[:10]}"
        ttype = data.get("trigger_type", TriggerType.SCHEDULED)
        if isinstance(ttype, TriggerType):
            ttype = ttype.value
        status = data.get("status", AutomationStatus.ACTIVE)
        if isinstance(status, AutomationStatus):
            status = status.value

        cursor.execute("""
            INSERT INTO automations (
                id, name, description, agent_id, trigger_type, schedule_cron, timezone,
                event_filter_json, retry_count, retry_delay_seconds,
                duplicate_protection_window_seconds, status, required_permissions_json,
                last_triggered_at, next_run_at, execution_count, failure_count,
                created_at, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """, (
            auto_id,
            data.get("name", "Untitled Automation"),
            data.get("description", ""),
            data.get("agent_id"),
            ttype,
            data.get("schedule_cron"),
            data.get("timezone", "UTC"),
            json.dumps(data.get("event_filter", {})),
            data.get("retry_count", 3),
            data.get("retry_delay_seconds", 60),
            data.get("duplicate_protection_window_seconds", 300),
            status,
            json.dumps(data.get("required_permissions", [])),
            None,
            None,
            0,
            0,
            now,
            now
        ))
        conn.commit()
        conn.close()
        return cls.get_automation(auto_id)  # type: ignore

    @classmethod
    def toggle_status(cls, auto_id: str, new_status: AutomationStatus) -> Optional[AutomationDefinition]:
        conn = get_db()
        cursor = conn.cursor()
        now = datetime.datetime.now(datetime.timezone.utc).isoformat()
        cursor.execute("""
            UPDATE automations
            SET status = ?, updated_at = ?
            WHERE id = ?
        """, (new_status.value, now, auto_id))
        conn.commit()
        conn.close()
        return cls.get_automation(auto_id)

    @classmethod
    def trigger_now(cls, auto_id: str) -> Dict[str, Any]:
        auto = cls.get_automation(auto_id)
        if not auto:
            return {"status": "error", "message": f"Automation {auto_id} not found."}
        
        now = datetime.datetime.now(datetime.timezone.utc).isoformat()
        conn = get_db()
        cursor = conn.cursor()
        cursor.execute("""
            UPDATE automations
            SET last_triggered_at = ?, execution_count = execution_count + 1, updated_at = ?
            WHERE id = ?
        """, (now, now, auto_id))
        conn.commit()
        conn.close()

        return {
            "status": "triggered",
            "automation_id": auto_id,
            "agent_id": auto.agent_id,
            "triggered_at": now,
            "message": f"Automation '{auto.name}' dispatched to execution queue."
        }

    @classmethod
    def delete_automation(cls, auto_id: str) -> bool:
        conn = get_db()
        cursor = conn.cursor()
        cursor.execute("DELETE FROM automations WHERE id = ?", (auto_id,))
        affected = cursor.rowcount > 0
        conn.commit()
        conn.close()
        return affected
