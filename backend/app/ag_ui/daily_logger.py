from __future__ import annotations
import os
import json
import uuid
import datetime
from pathlib import Path
from typing import List, Dict, Any, Optional
from ..db.database import get_db_connection

DAILY_LOGS_DIR = Path(__file__).resolve().parent.parent / "daily_logs"
DAILY_LOGS_DIR.mkdir(parents=True, exist_ok=True)


class DailyLogRecorder:
    """
    Automated Post-Task Text Recorder for AG-UI.
    Aggregates TOOL_CALL_RESULT outputs and RUN_FINISHED metrics into structured,
    human-readable Daily Text Logs (.txt & .md) stored on disk and in SQLite.
    """

    @staticmethod
    def ensure_table():
        conn = get_db_connection()
        cursor = conn.cursor()
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS daily_logs (
                id TEXT PRIMARY KEY,
                date TEXT NOT NULL,
                run_id TEXT NOT NULL,
                workflow_id TEXT,
                workflow_title TEXT,
                summary_text TEXT NOT NULL,
                markdown_text TEXT NOT NULL,
                file_path TEXT NOT NULL,
                tasks_completed INTEGER DEFAULT 0,
                total_tasks INTEGER DEFAULT 0,
                status TEXT NOT NULL,
                created_at TEXT NOT NULL
            )
        """)
        cursor.execute("CREATE INDEX IF NOT EXISTS idx_daily_logs_date ON daily_logs (date)")
        conn.commit()
        conn.close()

    @classmethod
    def record_completed_run(
        cls,
        run_id: str,
        workflow_id: str,
        workflow_title: str,
        step_results: List[Dict[str, Any]],
        status: str = "completed",
        custom_notes: Optional[str] = None
    ) -> Dict[str, Any]:
        """
        Formats completed actions into a clean timestamped text entry,
        appends to the daily .txt/.md files, and registers in the database.
        """
        cls.ensure_table()
        now = datetime.datetime.now()
        date_str = now.strftime("%Y-%m-%d")
        time_str = now.strftime("%I:%M %p")
        iso_str = datetime.datetime.now(datetime.timezone.utc).isoformat()

        completed_count = sum(1 for r in step_results if r.get("passed", False) or r.get("success", False))
        total_count = len(step_results)

        # 1. Generate clean plain text entry
        lines_txt = [
            f"[{time_str}] Run '{workflow_title}' ({status.upper()}) - {completed_count}/{total_count} steps passed",
        ]
        for idx, res in enumerate(step_results, 1):
            action = res.get("action", "action").upper()
            target = res.get("target") or res.get("name") or f"Step {idx}"
            success = res.get("passed", False) or res.get("success", False)
            mark = "✓" if success else "✗"
            detail = res.get("output") or res.get("error") or res.get("error_message") or ""
            detail_str = f" - {detail}" if detail else ""
            lines_txt.append(f"  {mark} [{action}] {target}{detail_str}")

        if custom_notes:
            lines_txt.append(f"  Note: {custom_notes}")

        entry_txt = "\n".join(lines_txt) + "\n\n"

        # 2. Generate Markdown entry
        lines_md = [
            f"### [{time_str}] {workflow_title}",
            f"- **Status**: `{status.upper()}` | **Progress**: {completed_count}/{total_count} steps",
            f"- **Run ID**: `{run_id}`",
            "",
            "| Step | Action | Target / Details | Result |",
            "| :--- | :--- | :--- | :--- |",
        ]
        for idx, res in enumerate(step_results, 1):
            action = res.get("action", "action")
            name = res.get("name") or res.get("target") or f"Step {idx}"
            success = res.get("passed", False) or res.get("success", False)
            result_badge = "✅ Passed" if success else "❌ Failed"
            lines_md.append(f"| {idx} | `{action}` | {name} | {result_badge} |")

        if custom_notes:
            lines_md.append(f"\n> 📝 **Note**: {custom_notes}\n")
        lines_md.append("\n---\n")

        entry_md = "\n".join(lines_md) + "\n"

        # 3. Write / Append to physical files
        txt_path = DAILY_LOGS_DIR / f"{date_str}.txt"
        md_path = DAILY_LOGS_DIR / f"{date_str}.md"

        with open(txt_path, "a", encoding="utf-8") as f:
            if os.path.getsize(txt_path) == 0 if txt_path.exists() else True:
                f.write(f"=== ChronicleAI Daily Task Log - {date_str} ===\n\n")
            f.write(entry_txt)

        with open(md_path, "a", encoding="utf-8") as f:
            if os.path.getsize(md_path) == 0 if md_path.exists() else True:
                f.write(f"# 📅 Daily Activity Log - {date_str}\n\n")
            f.write(entry_md)

        # 4. Save to SQLite database
        log_id = f"log_{uuid.uuid4().hex[:10]}"
        conn = get_db_connection()
        cursor = conn.cursor()
        cursor.execute("""
            INSERT INTO daily_logs
            (id, date, run_id, workflow_id, workflow_title, summary_text, markdown_text, file_path, tasks_completed, total_tasks, status, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """, (
            log_id,
            date_str,
            run_id,
            workflow_id,
            workflow_title,
            entry_txt.strip(),
            entry_md.strip(),
            str(txt_path),
            completed_count,
            total_count,
            status,
            iso_str
        ))
        conn.commit()
        conn.close()

        return {
            "id": log_id,
            "date": date_str,
            "run_id": run_id,
            "summary_text": entry_txt.strip(),
            "file_path": str(txt_path),
            "status": status,
            "created_at": iso_str
        }

    @classmethod
    def get_log_by_date(cls, date_str: str) -> Dict[str, Any]:
        """Retrieves aggregated daily log for a given YYYY-MM-DD date."""
        cls.ensure_table()
        txt_path = DAILY_LOGS_DIR / f"{date_str}.txt"
        md_path = DAILY_LOGS_DIR / f"{date_str}.md"

        txt_content = ""
        if txt_path.exists():
            with open(txt_path, "r", encoding="utf-8") as f:
                txt_content = f.read()

        md_content = ""
        if md_path.exists():
            with open(md_path, "r", encoding="utf-8") as f:
                md_content = f.read()

        conn = get_db_connection()
        cursor = conn.cursor()
        cursor.execute("SELECT * FROM daily_logs WHERE date = ? ORDER BY created_at ASC", (date_str,))
        rows = [dict(r) for r in cursor.fetchall()]
        conn.close()

        return {
            "date": date_str,
            "has_log": bool(txt_content or rows),
            "raw_text": txt_content,
            "markdown": md_content,
            "entries_count": len(rows),
            "entries": rows,
            "file_path": str(txt_path) if txt_path.exists() else None
        }

    @classmethod
    def list_all_logs(cls) -> List[Dict[str, Any]]:
        """Lists available daily log dates and entry counts."""
        cls.ensure_table()
        conn = get_db_connection()
        cursor = conn.cursor()
        cursor.execute("""
            SELECT date, COUNT(*) as count, SUM(tasks_completed) as total_completed, MAX(created_at) as latest_created
            FROM daily_logs
            GROUP BY date
            ORDER BY date DESC
        """)
        rows = [dict(r) for r in cursor.fetchall()]
        conn.close()

        # Also inspect on-disk files in case any exist without db entry
        existing_dates = {r["date"] for r in rows}
        for p in DAILY_LOGS_DIR.glob("*.txt"):
            stem = p.stem
            if stem not in existing_dates and len(stem) == 10 and stem.count("-") == 2:
                rows.append({
                    "date": stem,
                    "count": 1,
                    "total_completed": 0,
                    "latest_created": datetime.datetime.fromtimestamp(p.stat().st_mtime).isoformat()
                })

        rows.sort(key=lambda x: x["date"], reverse=True)
        return rows

    @classmethod
    def get_recent_history_context(cls, days: int = 3) -> str:
        """
        Cross-Session Memory Loop:
        Retrieves the last N days of daily logs to inject into the LLM system prompt.
        Allows the agent to know what was accomplished yesterday, avoid duplicate tasks,
        and answer 'What did we finish yesterday?'.
        """
        cls.ensure_table()
        conn = get_db_connection()
        cursor = conn.cursor()
        cursor.execute("""
            SELECT DISTINCT date FROM daily_logs ORDER BY date DESC LIMIT ?
        """, (days,))
        dates = [row["date"] for row in cursor.fetchall()]
        conn.close()

        if not dates:
            # Check files directly
            files = sorted(list(DAILY_LOGS_DIR.glob("*.txt")), reverse=True)[:days]
            dates = [f.stem for f in files]

        if not dates:
            return "No previous daily task logs recorded yet."

        context_parts = []
        for d in dates:
            log_data = cls.get_log_by_date(d)
            if log_data["raw_text"]:
                context_parts.append(f"--- Log Date: {d} ---\n{log_data['raw_text'].strip()}")

        return "\n\n".join(context_parts)
