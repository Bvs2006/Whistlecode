from __future__ import annotations
import json
import sqlite3
import uuid
import datetime
from typing import List, Optional, Dict, Any
from app.db.database import get_db
from app.models.skill import SkillDefinition, SkillCategory


DEFAULT_SKILLS = [
    {
        "id": "skill_email_classify",
        "name": "Email Classification",
        "description": "Categorizes incoming emails by intent, priority, urgency, and domain (e.g. Invoices, Customer Support, Team, Newsletters).",
        "category": SkillCategory.EMAIL,
        "input_schema": {"email_body": "string", "sender": "string", "subject": "string"},
        "output_schema": {"category": "string", "priority": "string", "confidence": "float"},
        "required_tools": ["email_parser", "llm_classifier"],
        "permission_requirements": ["read_email"],
        "version": 1,
        "is_trusted": True,
        "validation_status": "validated",
        "execution_count": 42,
        "success_count": 41,
        "failure_count": 1
    },
    {
        "id": "skill_invoice_extract",
        "name": "Invoice Extraction",
        "description": "Extracts vendor, due date, line items, and total amount from attached PDF invoices and receipts.",
        "category": SkillCategory.DOCUMENTS,
        "input_schema": {"file_path": "string"},
        "output_schema": {"vendor": "string", "due_date": "string", "total_amount": "float", "items": "array"},
        "required_tools": ["pdf_reader", "ocr_vision", "data_extractor"],
        "permission_requirements": ["read_file", "write_file"],
        "version": 1,
        "is_trusted": True,
        "validation_status": "validated",
        "execution_count": 128,
        "success_count": 125,
        "failure_count": 3
    },
    {
        "id": "skill_file_organize",
        "name": "File Organization",
        "description": "Sorts and relocates downloaded files into structured directories according to date, filetype, and project name.",
        "category": SkillCategory.DOCUMENTS,
        "input_schema": {"source_dir": "string", "target_base_dir": "string"},
        "output_schema": {"moved_files": "array", "errors": "array"},
        "required_tools": ["filesystem_manager"],
        "permission_requirements": ["read_file", "write_file", "delete_file"],
        "version": 1,
        "is_trusted": True,
        "validation_status": "validated",
        "execution_count": 89,
        "success_count": 89,
        "failure_count": 0
    },
    {
        "id": "skill_pdf_summarize",
        "name": "PDF Summarization",
        "description": "Generates concise, bulleted executive summaries and action items from long PDF reports and whitepapers.",
        "category": SkillCategory.DOCUMENTS,
        "input_schema": {"document_path": "string", "max_length_words": "int"},
        "output_schema": {"summary": "string", "key_takeaways": "array"},
        "required_tools": ["pdf_reader", "llm_summarizer"],
        "permission_requirements": ["read_file"],
        "version": 1,
        "is_trusted": True,
        "validation_status": "validated",
        "execution_count": 65,
        "success_count": 64,
        "failure_count": 1
    },
    {
        "id": "skill_meeting_schedule",
        "name": "Meeting Scheduling",
        "description": "Finds mutually agreeable times between participants, prepares Google Calendar invites, and tracks RSVPs.",
        "category": SkillCategory.GENERAL,
        "input_schema": {"attendees": "array", "duration_minutes": "int", "timeframe": "string"},
        "output_schema": {"scheduled_slot": "string", "event_id": "string"},
        "required_tools": ["calendar_api", "conflict_resolver"],
        "permission_requirements": ["read_calendar", "write_calendar"],
        "version": 1,
        "is_trusted": True,
        "validation_status": "validated",
        "execution_count": 53,
        "success_count": 52,
        "failure_count": 1
    },
    {
        "id": "skill_report_generate",
        "name": "Report Generation",
        "description": "Compiles structured metrics, charts, and audit histories into a formatted Markdown and HTML executive report.",
        "category": SkillCategory.ANALYSIS,
        "input_schema": {"metrics_data": "object", "report_title": "string"},
        "output_schema": {"report_markdown": "string", "export_path": "string"},
        "required_tools": ["markdown_generator", "chart_renderer"],
        "permission_requirements": ["write_file"],
        "version": 1,
        "is_trusted": True,
        "validation_status": "validated",
        "execution_count": 77,
        "success_count": 77,
        "failure_count": 0
    },
    {
        "id": "skill_browser_research",
        "name": "Browser Research",
        "description": "Navigates target documentation and news portals, extracts relevant citations, and synthesizes answers.",
        "category": SkillCategory.WEB,
        "input_schema": {"query": "string", "target_domains": "array"},
        "output_schema": {"findings": "array", "sources": "array"},
        "required_tools": ["playwright_browser", "dom_scraper"],
        "permission_requirements": ["network_access", "browser_control"],
        "version": 1,
        "is_trusted": True,
        "validation_status": "validated",
        "execution_count": 112,
        "success_count": 108,
        "failure_count": 4
    },
    {
        "id": "skill_github_issues",
        "name": "GitHub Issue Management",
        "description": "Labels, prioritizes, and replies to GitHub repository issues based on triage rules and error logs.",
        "category": SkillCategory.DEVOPS,
        "input_schema": {"repo": "string", "issue_number": "int"},
        "output_schema": {"assigned_labels": "array", "reply_posted": "bool"},
        "required_tools": ["github_api"],
        "permission_requirements": ["github_write"],
        "version": 1,
        "is_trusted": True,
        "validation_status": "validated",
        "execution_count": 34,
        "success_count": 34,
        "failure_count": 0
    }
]


class SkillService:
    @staticmethod
    def _row_to_skill(row: sqlite3.Row) -> SkillDefinition:
        wf_def = None
        if row["workflow_definition_json"]:
            try:
                wf_def = json.loads(row["workflow_definition_json"])
            except Exception:
                pass

        return SkillDefinition(
            id=row["id"],
            name=row["name"],
            description=row["description"] or "",
            category=SkillCategory(row["category"]) if row["category"] in [c.value for c in SkillCategory] else SkillCategory.GENERAL,
            input_schema=json.loads(row["input_schema_json"]) if row["input_schema_json"] else {},
            output_schema=json.loads(row["output_schema_json"]) if row["output_schema_json"] else {},
            workflow_definition=wf_def,
            required_tools=json.loads(row["required_tools_json"]) if row["required_tools_json"] else [],
            permission_requirements=json.loads(row["permission_requirements_json"]) if row["permission_requirements_json"] else [],
            version=row["version"],
            is_trusted=bool(row["is_trusted"]),
            validation_status=row["validation_status"],
            execution_count=row["execution_count"],
            success_count=row["success_count"],
            failure_count=row["failure_count"],
            created_at=row["created_at"],
            updated_at=row["updated_at"]
        )

    @classmethod
    def seed_default_skills(cls):
        conn = get_db()
        cursor = conn.cursor()
        cursor.execute("SELECT COUNT(*) FROM skills")
        count = cursor.fetchone()[0]
        if count == 0:
            now = datetime.datetime.now(datetime.timezone.utc).isoformat()
            for s in DEFAULT_SKILLS:
                cursor.execute("""
                    INSERT INTO skills (
                        id, name, description, category, input_schema_json, output_schema_json,
                        workflow_definition_json, required_tools_json, permission_requirements_json,
                        version, is_trusted, validation_status, execution_count, success_count, failure_count,
                        created_at, updated_at
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """, (
                    s["id"],
                    s["name"],
                    s["description"],
                    s["category"].value,
                    json.dumps(s["input_schema"]),
                    json.dumps(s["output_schema"]),
                    None,
                    json.dumps(s["required_tools"]),
                    json.dumps(s["permission_requirements"]),
                    s["version"],
                    1 if s["is_trusted"] else 0,
                    s["validation_status"],
                    s["execution_count"],
                    s["success_count"],
                    s["failure_count"],
                    now,
                    now
                ))
            conn.commit()
        conn.close()

    @classmethod
    def list_skills(cls, category: Optional[str] = None) -> List[SkillDefinition]:
        cls.seed_default_skills()
        conn = get_db()
        cursor = conn.cursor()
        if category:
            cursor.execute("SELECT * FROM skills WHERE category = ? ORDER BY name ASC", (category,))
        else:
            cursor.execute("SELECT * FROM skills ORDER BY name ASC")
        rows = cursor.fetchall()
        skills = [cls._row_to_skill(r) for r in rows]
        conn.close()
        return skills

    @classmethod
    def get_skill(cls, skill_id: str) -> Optional[SkillDefinition]:
        cls.seed_default_skills()
        conn = get_db()
        cursor = conn.cursor()
        cursor.execute("SELECT * FROM skills WHERE id = ?", (skill_id,))
        row = cursor.fetchone()
        conn.close()
        if not row:
            return None
        return cls._row_to_skill(row)

    @classmethod
    def create_skill(cls, data: Dict[str, Any]) -> SkillDefinition:
        conn = get_db()
        cursor = conn.cursor()
        now = datetime.datetime.now(datetime.timezone.utc).isoformat()
        skill_id = data.get("id") or f"skill_{uuid.uuid4().hex[:10]}"
        category = data.get("category", SkillCategory.GENERAL)
        if isinstance(category, SkillCategory):
            category = category.value

        is_trusted = 1 if data.get("is_trusted", False) else 0
        validation_status = data.get("validation_status", "validated" if is_trusted else "pending_validation")

        cursor.execute("""
            INSERT INTO skills (
                id, name, description, category, input_schema_json, output_schema_json,
                workflow_definition_json, required_tools_json, permission_requirements_json,
                version, is_trusted, validation_status, execution_count, success_count, failure_count,
                created_at, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """, (
            skill_id,
            data.get("name", "Untitled Skill"),
            data.get("description", ""),
            category,
            json.dumps(data.get("input_schema", {})),
            json.dumps(data.get("output_schema", {})),
            json.dumps(data.get("workflow_definition")) if data.get("workflow_definition") else None,
            json.dumps(data.get("required_tools", [])),
            json.dumps(data.get("permission_requirements", [])),
            data.get("version", 1),
            is_trusted,
            validation_status,
            data.get("execution_count", 0),
            data.get("success_count", 0),
            data.get("failure_count", 0),
            now,
            now
        ))
        conn.commit()
        conn.close()
        return cls.get_skill(skill_id)  # type: ignore

    @classmethod
    def convert_workflow_to_skill(cls, workflow_dict: Dict[str, Any], skill_name: str, description: str) -> SkillDefinition:
        """
        Converts a recorded workflow demonstration into a skill candidate.
        Note requirement: "A recorded workflow should not automatically become a trusted skill. Validate it before making it reusable."
        Hence is_trusted=False and validation_status='pending_validation'.
        """
        tools: List[str] = []
        steps = workflow_dict.get("steps", [])
        for s in steps:
            action = s.get("action", "")
            if action and action not in tools:
                tools.append(action)

        perms = []
        if any("file" in t for t in tools):
            perms.append("file_access")
        if any("browser" in t or "click" in t or "nav" in t for t in tools):
            perms.append("browser_control")

        skill_data = {
            "name": skill_name,
            "description": description or f"Skill synthesized from workflow: {workflow_dict.get('name', 'Recording')}",
            "category": SkillCategory.GENERAL,
            "input_schema": workflow_dict.get("parameters", {}),
            "output_schema": {"status": "success", "execution_log": "array"},
            "workflow_definition": workflow_dict,
            "required_tools": tools,
            "permission_requirements": perms,
            "is_trusted": False,
            "validation_status": "pending_validation"
        }
        return cls.create_skill(skill_data)

    @classmethod
    def validate_skill(cls, skill_id: str, approved: bool = True) -> Optional[SkillDefinition]:
        """
        Validates a pending skill to promote it into a trusted, reusable skill.
        """
        conn = get_db()
        cursor = conn.cursor()
        now = datetime.datetime.now(datetime.timezone.utc).isoformat()
        if approved:
            cursor.execute("""
                UPDATE skills
                SET is_trusted = 1, validation_status = 'validated', updated_at = ?
                WHERE id = ?
            """, (now, skill_id))
        else:
            cursor.execute("""
                UPDATE skills
                SET is_trusted = 0, validation_status = 'rejected', updated_at = ?
                WHERE id = ?
            """, (now, skill_id))
        conn.commit()
        conn.close()
        return cls.get_skill(skill_id)

    @classmethod
    def record_execution(cls, skill_id: str, success: bool):
        conn = get_db()
        cursor = conn.cursor()
        now = datetime.datetime.now(datetime.timezone.utc).isoformat()
        if success:
            cursor.execute("""
                UPDATE skills
                SET execution_count = execution_count + 1,
                    success_count = success_count + 1,
                    updated_at = ?
                WHERE id = ?
            """, (now, skill_id))
        else:
            cursor.execute("""
                UPDATE skills
                SET execution_count = execution_count + 1,
                    failure_count = failure_count + 1,
                    updated_at = ?
                WHERE id = ?
            """, (now, skill_id))
        conn.commit()
        conn.close()

    @classmethod
    def delete_skill(cls, skill_id: str) -> bool:
        conn = get_db()
        cursor = conn.cursor()
        cursor.execute("DELETE FROM skills WHERE id = ?", (skill_id,))
        affected = cursor.rowcount > 0
        conn.commit()
        conn.close()
        return affected
