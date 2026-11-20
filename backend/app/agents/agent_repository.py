from __future__ import annotations
import json
import datetime
from typing import List, Optional, Dict, Any
from ..db.database import get_db_connection
from ..models.agent import AgentDefinition, AgentStatus, AgentMemoryConfig, AgentTriggerConfig, AgentExecutionPolicy
from ..models.workflow import WorkflowDefinition


class AgentRepository:
    """Persistent SQLite repository for AI Agent configurations."""

    @staticmethod
    def _row_to_agent(row: Any) -> AgentDefinition:
        workflow_plan = None
        if row["workflow_plan_json"]:
            try:
                workflow_plan = WorkflowDefinition.model_validate_json(row["workflow_plan_json"])
            except Exception:
                pass

        return AgentDefinition(
            id=row["id"],
            name=row["name"],
            description=row["description"] or "",
            instructions=row["instructions"] or "",
            model=row["model"] or "mistral:latest",
            assigned_skills=json.loads(row["assigned_skills_json"] or "[]"),
            connected_integrations=json.loads(row["connected_integrations_json"] or "[]"),
            memory_config=AgentMemoryConfig.model_validate_json(row["memory_config_json"] or "{}"),
            trigger_config=AgentTriggerConfig.model_validate_json(row["trigger_config_json"] or "{}"),
            permission_scope=json.loads(row["permission_scope_json"] or "[]"),
            execution_policy=AgentExecutionPolicy.model_validate_json(row["execution_policy_json"] or "{}"),
            workflow_plan=workflow_plan,
            status=AgentStatus(row["status"]),
            created_at=row["created_at"],
            updated_at=row["updated_at"]
        )

    @classmethod
    def list_agents(cls, status_filter: Optional[str] = None) -> List[AgentDefinition]:
        conn = get_db_connection()
        cursor = conn.cursor()
        if status_filter:
            cursor.execute("SELECT * FROM agents WHERE status = ? ORDER BY updated_at DESC", (status_filter,))
        else:
            cursor.execute("SELECT * FROM agents WHERE status != 'archived' ORDER BY updated_at DESC")
        rows = cursor.fetchall()
        conn.close()
        return [cls._row_to_agent(r) for r in rows]

    @classmethod
    def get_agent(cls, agent_id: str) -> Optional[AgentDefinition]:
        conn = get_db_connection()
        cursor = conn.cursor()
        cursor.execute("SELECT * FROM agents WHERE id = ?", (agent_id,))
        row = cursor.fetchone()
        conn.close()
        if not row:
            return None
        return cls._row_to_agent(row)

    @classmethod
    def save_agent(cls, agent: AgentDefinition) -> AgentDefinition:
        conn = get_db_connection()
        cursor = conn.cursor()
        now_str = datetime.datetime.now(datetime.timezone.utc).isoformat()
        agent.updated_at = now_str

        cursor.execute("SELECT id FROM agents WHERE id = ?", (agent.id,))
        existing = cursor.fetchone()

        if existing:
            cursor.execute("""
                UPDATE agents SET
                    name = ?,
                    description = ?,
                    instructions = ?,
                    model = ?,
                    assigned_skills_json = ?,
                    connected_integrations_json = ?,
                    memory_config_json = ?,
                    trigger_config_json = ?,
                    permission_scope_json = ?,
                    execution_policy_json = ?,
                    workflow_plan_json = ?,
                    status = ?,
                    updated_at = ?
                WHERE id = ?
            """, (
                agent.name,
                agent.description,
                agent.instructions,
                agent.model,
                json.dumps(agent.assigned_skills),
                json.dumps(agent.connected_integrations),
                agent.memory_config.model_dump_json(),
                agent.trigger_config.model_dump_json(),
                json.dumps(agent.permission_scope),
                agent.execution_policy.model_dump_json(),
                agent.workflow_plan.model_dump_json() if agent.workflow_plan else None,
                agent.status.value,
                now_str,
                agent.id
            ))
        else:
            cursor.execute("""
                INSERT INTO agents (
                    id, name, description, instructions, model,
                    assigned_skills_json, connected_integrations_json,
                    memory_config_json, trigger_config_json,
                    permission_scope_json, execution_policy_json,
                    workflow_plan_json, status, created_at, updated_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """, (
                agent.id,
                agent.name,
                agent.description,
                agent.instructions,
                agent.model,
                json.dumps(agent.assigned_skills),
                json.dumps(agent.connected_integrations),
                agent.memory_config.model_dump_json(),
                agent.trigger_config.model_dump_json(),
                json.dumps(agent.permission_scope),
                agent.execution_policy.model_dump_json(),
                agent.workflow_plan.model_dump_json() if agent.workflow_plan else None,
                agent.status.value,
                agent.created_at or now_str,
                now_str
            ))

        conn.commit()
        conn.close()
        return agent

    @classmethod
    def set_agent_status(cls, agent_id: str, new_status: AgentStatus) -> Optional[AgentDefinition]:
        agent = cls.get_agent(agent_id)
        if not agent:
            return None
        agent.status = new_status
        return cls.save_agent(agent)

    @classmethod
    def duplicate_agent(cls, agent_id: str) -> Optional[AgentDefinition]:
        """Duplicates an existing agent into a new draft agent."""
        import uuid
        source = cls.get_agent(agent_id)
        if not source:
            return None
        new_id = f"ag_{uuid.uuid4().hex[:12]}"
        now_str = datetime.datetime.now(datetime.timezone.utc).isoformat()
        duplicate = AgentDefinition(
            id=new_id,
            name=f"{source.name} (Copy)",
            description=source.description,
            instructions=source.instructions,
            model=source.model,
            assigned_skills=list(source.assigned_skills),
            connected_integrations=list(source.connected_integrations),
            memory_config=source.memory_config.model_copy(),
            trigger_config=source.trigger_config.model_copy(),
            permission_scope=list(source.permission_scope),
            execution_policy=source.execution_policy.model_copy(),
            workflow_plan=source.workflow_plan.model_copy() if source.workflow_plan else None,
            status=AgentStatus.DRAFT,
            created_at=now_str,
            updated_at=now_str,
        )
        return cls.save_agent(duplicate)

    @classmethod
    def delete_agent(cls, agent_id: str) -> bool:
        """Permanently deletes an agent from the database."""
        conn = get_db_connection()
        cursor = conn.cursor()
        cursor.execute("DELETE FROM agents WHERE id = ?", (agent_id,))
        affected = cursor.rowcount
        conn.commit()
        conn.close()
        return affected > 0

    @classmethod
    def seed_default_agents_if_empty(cls):
        """Seeds initial template agents if the database is fresh."""
        existing = cls.list_agents()
        if existing:
            return

        templates = [
            ("I want an agent that checks my emails every morning, identifies invoices, downloads attachments and organizes them into folders.", "active"),
            ("Organize my downloaded papers and documents by topic and date.", "draft"),
            ("Navigate to our supplier portal and verify product pricing.", "draft")
        ]

        from ..generation.agent_builder import AgentBuilderService
        for goal, status in templates:
            proposal = AgentBuilderService.propose_agent_from_goal(goal)
            agent = proposal.agent
            agent.status = AgentStatus(status)
            cls.save_agent(agent)
