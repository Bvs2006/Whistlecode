import asyncio
import json

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


def test_integration_credential_vault_precedence_and_masking(monkeypatch):
    """Verifies server-side credential vault storage, masking, and precedence over .env."""
    monkeypatch.setenv("GROQ_API_KEY", "gsk_env_variable_token_9999")

    # 1. Check env inheritance
    groq = IntegrationHubService.get_integration("integ_groq")
    assert groq is not None
    assert groq.has_credentials is True
    assert groq.credential_source == "env"
    assert groq.masked_credential == "gsk_••••9999"
    assert "gsk_env_variable_token_9999" not in json.dumps(groq.model_dump())

    # 2. UI Vault key overrides .env
    IntegrationHubService.connect_integration("integ_groq", {"api_key": "gsk_vault_key_override_1111"})
    groq_vault = IntegrationHubService.get_integration("integ_groq")
    assert groq_vault is not None
    assert groq_vault.credential_source == "vault"
    assert groq_vault.masked_credential == "gsk_••••1111"
    assert "gsk_vault_key_override_1111" not in json.dumps(groq_vault.model_dump())

    # 3. Disconnect removes vault key and reverts to env
    IntegrationHubService.disconnect_integration("integ_groq")
    groq_reverted = IntegrationHubService.get_integration("integ_groq")
    assert groq_reverted is not None
    assert groq_reverted.credential_source == "env"
    assert groq_reverted.masked_credential == "gsk_••••9999"


@pytest.mark.asyncio
async def test_ai_router_ordered_fallback_chain(monkeypatch):
    """Verifies ordered fallback chain: Gemini -> Groq -> OpenRouter -> Ollama."""
    from backend.app.integrations.ai_providers import AIProviderRouter, OpenRouterProvider

    # Clear all keys
    monkeypatch.delenv("GEMINI_API_KEY", raising=False)
    monkeypatch.delenv("GOOGLE_API_KEY", raising=False)
    monkeypatch.delenv("GROQ_API_KEY", raising=False)
    monkeypatch.delenv("OPENROUTER_API_KEY", raising=False)

    router = AIProviderRouter()
    # No keys -> active provider falls back to Ollama
    assert router.get_active_provider().name == "Ollama"

    # Set OpenRouter -> picks OpenRouter
    monkeypatch.setenv("OPENROUTER_API_KEY", "sk-or-test-key-1234")
    assert router.get_active_provider().name == "OpenRouter"

    # Set Groq -> picks Groq before OpenRouter
    monkeypatch.setenv("GROQ_API_KEY", "gsk_test_key_5678")
    assert router.get_active_provider().name == "Groq"

    # Set Gemini -> picks Gemini before Groq
    monkeypatch.setenv("GEMINI_API_KEY", "AIza_test_key_9012")
    assert router.get_active_provider().name == "Google Gemini"


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
