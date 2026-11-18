import pytest
from backend.app.generation.agent_builder import AgentBuilderService
from backend.app.agents.agent_repository import AgentRepository
from backend.app.models.agent import AgentStatus


def test_agent_builder_natural_language_comprehension():
    """Verify natural language request generates complete structured draft agent."""
    goal = "I want an agent that checks my emails every morning, identifies invoices, downloads attachments and organizes them into folders."
    proposal = AgentBuilderService.propose_agent_from_goal(goal)

    agent = proposal.agent
    assert agent.status == AgentStatus.DRAFT  # Must default to draft
    assert "Invoice & Email" in agent.name
    assert "Email Classification" in agent.assigned_skills
    assert "Invoice Extraction" in agent.assigned_skills
    assert "gmail" in agent.connected_integrations
    assert len(agent.permission_scope) > 0
    assert agent.workflow_plan is not None
    assert len(agent.workflow_plan.steps) >= 3


def test_agent_repository_crud_and_activation():
    """Verify Agent persistence, activation, pause, and status transitions."""
    goal = "Organize my downloaded research papers by topic"
    proposal = AgentBuilderService.propose_agent_from_goal(goal)
    agent = proposal.agent

    # 1. Save Draft
    saved = AgentRepository.save_agent(agent)
    assert saved.status == AgentStatus.DRAFT

    retrieved = AgentRepository.get_agent(agent.id)
    assert retrieved is not None
    assert retrieved.name == agent.name
    assert retrieved.status == AgentStatus.DRAFT

    # 2. Explicit Activation
    activated = AgentRepository.set_agent_status(agent.id, AgentStatus.ACTIVE)
    assert activated is not None
    assert activated.status == AgentStatus.ACTIVE

    # 3. Pause
    paused = AgentRepository.set_agent_status(agent.id, AgentStatus.PAUSED)
    assert paused is not None
    assert paused.status == AgentStatus.PAUSED
