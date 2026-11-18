import asyncio

import pytest
from app.db.database import init_db
from app.skills.skill_service import SkillService, DEFAULT_SKILLS
from app.memory.memory_service import MemoryService, DEFAULT_MEMORIES
from app.integrations.hub import IntegrationHubService
from app.automations.scheduler import AutomationService
from app.models.skill import MemoryCategory, SkillCategory
from app.models.automation import AutomationStatus, TriggerType


@pytest.fixture(autouse=True)
def setup_db():
    init_db()


def test_skills_crud_and_validation():
    # 1. List seeded skills
    skills = SkillService.list_skills()
    assert len(skills) >= len(DEFAULT_SKILLS)
    assert any(s.name == "Invoice Extraction" for s in skills)

    # 2. Create custom skill from workflow (untrusted by default)
    dummy_wf = {
        "workflow_id": "wf_test_123",
        "name": "Export Daily Ledger",
        "steps": [{"step_id": "s1", "action": "read_file", "parameters": {}}]
    }
    candidate = SkillService.convert_workflow_to_skill(
        workflow_dict=dummy_wf,
        skill_name="Daily Ledger Exporter",
        description="Demo workflow to skill conversion"
    )
    assert candidate.id.startswith("skill_")
    assert candidate.is_trusted is False
    assert candidate.validation_status == "pending_validation"

    # 3. Validate skill
    validated = SkillService.validate_skill(candidate.id, approved=True)
    assert validated is not None
    assert validated.is_trusted is True
    assert validated.validation_status == "validated"

    # 4. Clean up
    assert SkillService.delete_skill(candidate.id) is True


def test_memory_categories_and_retrieval():
    # 1. List default memories
    memories = MemoryService.list_memories()
    assert len(memories) >= len(DEFAULT_MEMORIES)

    # 2. Check 5 distinct categories exist
    categories = {m.category for m in memories}
    assert MemoryCategory.USER_PREFERENCES in categories
    assert MemoryCategory.TASK_CONTEXT in categories
    assert MemoryCategory.EXECUTION_SUMMARY in categories
    assert MemoryCategory.LEARNED_WORKFLOW in categories
    assert MemoryCategory.FREQUENTLY_USED_PARAMETERS in categories

    # 3. Create agent-specific memory
    item = MemoryService.create_memory({
        "agent_id": "agent_test_xyz",
        "category": MemoryCategory.TASK_CONTEXT,
        "key": "fiscal_year",
        "value": "FY2026",
        "provenance": "user_entry"
    })
    assert item.key == "fiscal_year"

    # 4. Prompt context retrieval without polluting context
    context = MemoryService.get_relevant_context_for_prompt(agent_id="agent_test_xyz")
    assert "FY2026" in context or "approval_policy" in context

    # 5. Clean up
    assert MemoryService.delete_memory(item.id) is True


def test_integrations_and_mcp_hub():
    integrations = IntegrationHubService.list_integrations()
    assert len(integrations) >= 7
    mcp = next(i for i in integrations if i.id == "integ_mcp_servers")
    assert mcp.is_mcp is True
    assert len(mcp.available_tools) >= 2
    browser = next(i for i in integrations if i.id == "integ_browser")
    assert browser.id == "integ_browser"


def test_automations_scheduling_and_trigger():
    automations = AutomationService.list_automations()
    assert len(automations) >= 3

    # Toggle status
    first = automations[0]
    updated = AutomationService.toggle_status(first.id, AutomationStatus.PAUSED)
    assert updated.status == AutomationStatus.PAUSED

    # Restore
    restored = AutomationService.toggle_status(first.id, AutomationStatus.ACTIVE)
    assert restored.status == AutomationStatus.ACTIVE

    # Trigger manual execution
    trigger_res = AutomationService.trigger_now(first.id)
    assert trigger_res["status"] == "triggered"
