from __future__ import annotations
import json
import logging
from typing import Dict, List, Optional, Any
from ..models.workflow import WorkflowDefinition
from ..db.database import get_db_connection
from ..drivers.registry import DriverRegistry
from .models import Capability

logger = logging.getLogger(__name__)


class CapabilityRegistry:
    """
    Central registry for all system capabilities (skills, tools, saved workflows, and drivers).
    Auto-discovers and registers resources with active health checking.
    """

    def __init__(self):
        self._capabilities: Dict[str, Capability] = {}

    def register(self, capability: Capability) -> None:
        self._capabilities[capability.id] = capability

    def get(self, capability_id: str) -> Optional[Capability]:
        return self._capabilities.get(capability_id)

    def list_capabilities(self) -> List[Capability]:
        return list(self._capabilities.values())

    async def auto_register_all(self) -> List[Capability]:
        """Auto-registers skills, tools, saved workflows, and drivers."""
        self._register_tools()
        self._register_skills()
        self._register_saved_workflows()
        await self._register_drivers()
        return self.list_capabilities()

    def _register_tools(self) -> None:
        try:
            from ..tools.registry import _specs
            for tool in _specs():
                surface = "file" if tool.category == "filesystem" or "document" in tool.category else "browser"
                cap = Capability(
                    id=f"tool:{tool.id}",
                    name=tool.name,
                    description=tool.description,
                    input_schema=tool.input_schema,
                    output_schema=tool.output_schema,
                    required_permissions=tool.required_permissions,
                    handler=f"app.tools.registry:{tool.id}",
                    status="available" if tool.enabled else "unavailable",
                    supported_operations=[tool.category, tool.risk],
                    surface=surface,
                    source="tool"
                )
                self.register(cap)
        except Exception as e:
            logger.warning(f"Failed to auto-register tools: {e}")

    def _register_skills(self) -> None:
        try:
            from ..skills.skill_service import SkillService, DEFAULT_SKILLS
            skills = SkillService.list_skills()
            if not skills:
                # Fallback to default skills definition
                for s in DEFAULT_SKILLS:
                    surface = "browser" if s.get("category") == "web" else "file" if s.get("category") == "documents" else "multi"
                    cap = Capability(
                        id=f"skill:{s['id']}",
                        name=s["name"],
                        description=s["description"],
                        input_schema=s.get("input_schema", {}),
                        output_schema=s.get("output_schema", {}),
                        required_permissions=s.get("permission_requirements", []),
                        handler=f"app.skills.skill_service:{s['id']}",
                        status="available",
                        supported_operations=[s.get("category", "general")],
                        surface=surface,
                        source="skill"
                    )
                    self.register(cap)
            else:
                for skill in skills:
                    surface = "browser" if skill.category.value == "web" else "file" if skill.category.value == "documents" else "multi"
                    cap = Capability(
                        id=f"skill:{skill.id}",
                        name=skill.name,
                        description=skill.description,
                        input_schema=skill.input_schema,
                        output_schema=skill.output_schema,
                        required_permissions=skill.permission_requirements,
                        handler=f"app.skills.skill_service:{skill.id}",
                        status="available" if skill.is_active else "unavailable",
                        supported_operations=[skill.category.value],
                        surface=surface,
                        source="skill"
                    )
                    self.register(cap)
        except Exception as e:
            logger.warning(f"Failed to auto-register skills: {e}")

    def _register_saved_workflows(self) -> None:
        try:
            with get_db_connection() as conn:
                cursor = conn.cursor()
                cursor.execute("""
                    SELECT w.id, w.title, w.intent, wv.json_data
                    FROM workflows w
                    LEFT JOIN workflow_versions wv ON w.id = wv.workflow_id
                    WHERE wv.version = (
                        SELECT MAX(version) FROM workflow_versions WHERE workflow_id = w.id
                    )
                """)
                rows = cursor.fetchall()
                for row in rows:
                    wf_id = row["id"]
                    title = row["title"]
                    intent = row["intent"]
                    json_data = row["json_data"]
                    surface = "browser"
                    operations = []
                    input_schema = {}
                    if json_data:
                        try:
                            data = json.loads(json_data)
                            wf = WorkflowDefinition.model_validate(data)
                            if wf.steps:
                                s0 = wf.steps[0]
                                surface = s0.surface.value if hasattr(s0.surface, "value") else str(s0.surface)
                                operations = list(set(s.action.value for s in wf.steps))
                            input_schema = {p.name: {"type": p.type, "required": p.required} for p in wf.parameters}
                        except Exception:
                            pass

                    cap = Capability(
                        id=f"workflow:{wf_id}",
                        name=title,
                        description=intent,
                        input_schema=input_schema,
                        output_schema={"status": "completed"},
                        required_permissions=["workflow_execute"],
                        handler=f"app.executor:{wf_id}",
                        status="available",
                        supported_operations=operations or ["execute"],
                        surface=surface,
                        source="workflow"
                    )
                    self.register(cap)
        except Exception as e:
            logger.warning(f"Failed to auto-register saved workflows: {e}")

    async def _register_drivers(self) -> None:
        try:
            driver_reg = DriverRegistry()
            for surf in ["browser", "desktop", "file"]:
                driver = driver_reg.get(surf)
                if driver:
                    health = await driver.health()
                    status = "available" if health.status == "available" else "unavailable"
                    cap = Capability(
                        id=f"driver:{surf}",
                        name=f"{surf.capitalize()} Automation Driver",
                        description=health.reason or f"Native execution driver for {surf} automation surface.",
                        input_schema={"action": "string", "step": "object"},
                        output_schema={"passed": "bool", "observed_state": "object"},
                        required_permissions=[f"{surf}_control"],
                        handler=f"app.drivers.{surf}:{driver.__class__.__name__}",
                        status=status,
                        supported_operations=["find_target", "act", "observe", "verify", "capture_state"],
                        surface=surf,
                        source="driver"
                    )
                    self.register(cap)
        except Exception as e:
            logger.warning(f"Failed to auto-register drivers: {e}")


# Singleton instance
capability_registry = CapabilityRegistry()
