from __future__ import annotations
import sqlite3
import uuid
import datetime
from typing import List, Optional, Dict, Any
from app.db.database import get_db
from app.models.skill import AgentMemoryItem, MemoryCategory


DEFAULT_MEMORIES = [
    {
        "id": "mem_pref_001",
        "agent_id": None,
        "category": MemoryCategory.USER_PREFERENCES,
        "key": "approval_policy",
        "value": "Require explicit confirmation before modifying production databases or sending external emails.",
        "provenance": "user_entry",
        "confidence": 1.0
    },
    {
        "id": "mem_pref_002",
        "agent_id": None,
        "category": MemoryCategory.USER_PREFERENCES,
        "key": "default_invoice_directory",
        "value": "C:/ChronicleAI/Invoices/2026",
        "provenance": "user_entry",
        "confidence": 1.0
    },
    {
        "id": "mem_ctx_001",
        "agent_id": "agent_invoice_organizer",
        "category": MemoryCategory.TASK_CONTEXT,
        "key": "current_tax_period",
        "value": "Focus on Q4 invoices received between October and December 2026.",
        "provenance": "recorded_run",
        "confidence": 0.95
    },
    {
        "id": "mem_exec_001",
        "agent_id": "agent_invoice_organizer",
        "category": MemoryCategory.EXECUTION_SUMMARY,
        "key": "last_run_summary",
        "value": "Processed 14 vendor invoices with 100% classification confidence and zero failed extractions.",
        "provenance": "daily_log",
        "confidence": 1.0
    },
    {
        "id": "mem_wf_001",
        "agent_id": "agent_invoice_organizer",
        "category": MemoryCategory.LEARNED_WORKFLOW,
        "key": "acme_corp_invoice_layout",
        "value": "Vendor Acme Corp puts net due total in the footer box labeled 'Total Payable USD'.",
        "provenance": "system_learned",
        "confidence": 0.88
    },
    {
        "id": "mem_param_001",
        "agent_id": None,
        "category": MemoryCategory.FREQUENTLY_USED_PARAMETERS,
        "key": "pdf_summary_length",
        "value": "max_length_words: 250, format: executive_bullets",
        "provenance": "user_entry",
        "confidence": 1.0
    }
]


class MemoryService:
    @staticmethod
    def _row_to_memory(row: sqlite3.Row) -> AgentMemoryItem:
        return AgentMemoryItem(
            id=row["id"],
            agent_id=row["agent_id"],
            category=MemoryCategory(row["category"]) if row["category"] in [c.value for c in MemoryCategory] else MemoryCategory.TASK_CONTEXT,
            key=row["key"],
            value=row["value"],
            provenance=row["provenance"],
            confidence=row["confidence"],
            created_at=row["created_at"],
            updated_at=row["updated_at"]
        )

    @classmethod
    def seed_default_memories(cls):
        conn = get_db()
        cursor = conn.cursor()
        cursor.execute("SELECT COUNT(*) FROM agent_memories")
        count = cursor.fetchone()[0]
        if count == 0:
            now = datetime.datetime.now(datetime.timezone.utc).isoformat()
            for m in DEFAULT_MEMORIES:
                cursor.execute("""
                    INSERT INTO agent_memories (
                        id, agent_id, category, key, value, provenance, confidence, created_at, updated_at
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                """, (
                    m["id"],
                    m["agent_id"],
                    m["category"].value,
                    m["key"],
                    m["value"],
                    m["provenance"],
                    m["confidence"],
                    now,
                    now
                ))
            conn.commit()
        conn.close()

    @classmethod
    def list_memories(cls, agent_id: Optional[str] = None, category: Optional[str] = None) -> List[AgentMemoryItem]:
        cls.seed_default_memories()
        conn = get_db()
        cursor = conn.cursor()
        query = "SELECT * FROM agent_memories WHERE 1=1"
        params: List[Any] = []
        if agent_id:
            query += " AND (agent_id = ? OR agent_id IS NULL)"
            params.append(agent_id)
        if category:
            query += " AND category = ?"
            params.append(category)
        query += " ORDER BY updated_at DESC"

        cursor.execute(query, params)
        rows = cursor.fetchall()
        memories = [cls._row_to_memory(r) for r in rows]
        conn.close()
        return memories

    @classmethod
    def get_memory(cls, memory_id: str) -> Optional[AgentMemoryItem]:
        cls.seed_default_memories()
        conn = get_db()
        cursor = conn.cursor()
        cursor.execute("SELECT * FROM agent_memories WHERE id = ?", (memory_id,))
        row = cursor.fetchone()
        conn.close()
        if not row:
            return None
        return cls._row_to_memory(row)

    @classmethod
    def create_memory(cls, data: Dict[str, Any]) -> AgentMemoryItem:
        conn = get_db()
        cursor = conn.cursor()
        now = datetime.datetime.now(datetime.timezone.utc).isoformat()
        mem_id = data.get("id") or f"mem_{uuid.uuid4().hex[:10]}"
        cat = data.get("category", MemoryCategory.TASK_CONTEXT)
        if isinstance(cat, MemoryCategory):
            cat = cat.value

        cursor.execute("""
            INSERT INTO agent_memories (
                id, agent_id, category, key, value, provenance, confidence, created_at, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        """, (
            mem_id,
            data.get("agent_id"),
            cat,
            data.get("key", "untitled_key"),
            data.get("value", ""),
            data.get("provenance", "user_entry"),
            data.get("confidence", 1.0),
            now,
            now
        ))
        conn.commit()
        conn.close()
        return cls.get_memory(mem_id)  # type: ignore

    @classmethod
    def update_memory(cls, memory_id: str, updates: Dict[str, Any]) -> Optional[AgentMemoryItem]:
        conn = get_db()
        cursor = conn.cursor()
        now = datetime.datetime.now(datetime.timezone.utc).isoformat()
        
        fields = []
        params = []
        for field in ["key", "value", "category", "agent_id", "confidence", "provenance"]:
            if field in updates:
                fields.append(f"{field} = ?")
                val = updates[field]
                if isinstance(val, MemoryCategory):
                    val = val.value
                params.append(val)
        
        if not fields:
            conn.close()
            return cls.get_memory(memory_id)

        fields.append("updated_at = ?")
        params.append(now)
        params.append(memory_id)

        query = f"UPDATE agent_memories SET {', '.join(fields)} WHERE id = ?"
        cursor.execute(query, params)
        conn.commit()
        conn.close()
        return cls.get_memory(memory_id)

    @classmethod
    def delete_memory(cls, memory_id: str) -> bool:
        conn = get_db()
        cursor = conn.cursor()
        cursor.execute("DELETE FROM agent_memories WHERE id = ?", (memory_id,))
        affected = cursor.rowcount > 0
        conn.commit()
        conn.close()
        return affected

    @classmethod
    def get_relevant_context_for_prompt(cls, agent_id: Optional[str] = None, task_description: Optional[str] = None, max_items: int = 5) -> str:
        """
        Retrieves relevant memory without injecting all memories into every prompt.
        Prioritizes user preferences and task context specifically matching agent or global parameters.
        """
        memories = cls.list_memories(agent_id=agent_id)
        if not memories:
            return ""

        # Filter: Always include global user preferences, plus matching agent-specific memories
        selected = []
        for m in memories:
            if m.category == MemoryCategory.USER_PREFERENCES:
                selected.append(f"- [Preference] {m.key}: {m.value}")
            elif agent_id and m.agent_id == agent_id:
                selected.append(f"- [{m.category.value}] {m.key}: {m.value}")
            elif task_description and any(w.lower() in m.value.lower() or w.lower() in m.key.lower() for w in task_description.split() if len(w) > 4):
                selected.append(f"- [{m.category.value}] {m.key}: {m.value}")
            
            if len(selected) >= max_items:
                break

        if not selected:
            # Fallback to top preferences
            for m in memories[:max_items]:
                selected.append(f"- [{m.category.value}] {m.key}: {m.value}")

        return "\n".join(selected)
