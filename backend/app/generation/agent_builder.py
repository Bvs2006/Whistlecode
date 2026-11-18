from __future__ import annotations
import uuid
import re
import datetime
from typing import Dict, Any, List
from ..models.agent import (
    AgentDefinition,
    AgentStatus,
    AgentMemoryConfig,
    AgentTriggerConfig,
    AgentTriggerType,
    AgentExecutionPolicy,
    AgentProposalResponse
)
from ..models.workflow import WorkflowDefinition, Step, ActionType, RiskLevel, TargetDescriptor


class AgentBuilderService:
    """
    Intelligent Agent Builder.
    Transforms natural language requests into structured, reviewable AI Agent proposals
    with capabilities, integrations, permissions, and multi-step workflow drafts.
    """

    @classmethod
    def propose_agent_from_goal(cls, user_goal: str) -> AgentProposalResponse:
        goal_lower = user_goal.lower()
        agent_id = f"agent_{uuid.uuid4().hex[:10]}"
        now_str = datetime.datetime.now(datetime.timezone.utc).isoformat()

        # 1. Capabilities & Integration Detection
        has_email = any(k in goal_lower for k in ["email", "gmail", "inbox", "message"])
        has_invoice = any(k in goal_lower for k in ["invoice", "receipt", "bill", "attachment"])
        has_files = any(k in goal_lower for k in ["folder", "file", "download", "organize", "pdf", "drive"])
        has_schedule = any(k in goal_lower for k in ["morning", "every", "daily", "weekday", "schedule", "cron", "9 am", "hourly"])
        has_web = any(k in goal_lower for k in ["website", "web", "browser", "search", "scrape", "portal", "price"])
        has_github = any(k in goal_lower for k in ["github", "issue", "pr", "repo", "commit"])

        # Determine Agent Name & Description
        if has_email and has_invoice:
            name = "Invoice & Email Triage Agent"
            description = "Monitors incoming emails, detects invoices, extracts structured financial data, and organizes attachments into local directories."
            assigned_skills = ["Email Classification", "Invoice Extraction", "File Organization"]
        elif has_email:
            name = "Daily Inbox Assistant"
            description = "Periodically summarizes important emails, flags urgent action items, and drafts responses for user review."
            assigned_skills = ["Email Classification", "Daily Standup Summary"]
        elif has_files:
            name = "Smart File & Document Organizer"
            description = "Monitors target directories, classifies downloaded documents and papers, and safely moves them into structured subfolders."
            assigned_skills = ["File Organization", "PDF Summarization"]
        elif has_web:
            name = "Web Research & Verification Agent"
            description = "Navigates specified websites, extracts data tables or competitive pricing, and verifies DOM state."
            assigned_skills = ["Web Research", "DOM Verification"]
        elif has_github:
            name = "GitHub Issue & PR Manager"
            description = "Scans repositories for new issues, triages bug reports, and drafts status summaries."
            assigned_skills = ["GitHub Issue Management", "Report Generation"]
        else:
            name = "Automated Task Assistant"
            description = f"Autonomous agent specialized in executing: {user_goal[:80]}."
            assigned_skills = ["Task Execution", "Activity Logging"]

        # 2. System Instructions
        instructions = (
            f"You are the {name}. Your primary objective is: '{user_goal}'.\n\n"
            "Operational Guidelines:\n"
            "1. Inspect connected integration sources before taking action.\n"
            "2. Never delete, overwrite, or send external communications without explicit Confirmation Gate approval.\n"
            "3. Record all completed actions into the Daily Text Log with cryptographic evidence.\n"
            "4. Respect the user-declared permission boundaries at all times."
        )

        # 3. Integrations Suggestion
        suggested_integrations = []
        if has_email:
            suggested_integrations.append({"id": "gmail", "name": "Gmail", "icon": "✉️", "status": "available", "required": True})
        if has_files:
            suggested_integrations.append({"id": "desktop", "name": "Local File System", "icon": "📁", "status": "connected", "required": True})
            suggested_integrations.append({"id": "gdrive", "name": "Google Drive", "icon": "☁️", "status": "available", "required": False})
        if has_web or not suggested_integrations:
            suggested_integrations.append({"id": "browser", "name": "Browser Automation", "icon": "🌐", "status": "connected", "required": True})
        if has_github:
            suggested_integrations.append({"id": "github", "name": "GitHub", "icon": "🐙", "status": "available", "required": True})

        connected_integrations = [item["id"] for item in suggested_integrations if item.get("required")]

        # 4. Trigger Configuration
        trigger_type = AgentTriggerType.SCHEDULED if has_schedule else AgentTriggerType.MANUAL
        cron_expr = "0 9 * * 1-5" if has_schedule else None

        trigger_config = AgentTriggerConfig(
            type=trigger_type,
            cron_expression=cron_expr,
            timezone="UTC",
            enabled=False  # Do not auto-enable scheduled triggers
        )

        # 5. Permission Scope
        permissions = []
        if has_email:
            permissions.extend(["gmail.messages.readonly", "gmail.attachments.read"])
        if has_files:
            permissions.extend(["filesystem.read:inbox", "filesystem.write:organized"])
        if has_web:
            permissions.extend(["browser.navigate", "browser.read_dom"])
        if not permissions:
            permissions.extend(["local_execution.scoped"])

        # 6. Workflow Plan Steps
        steps: List[Step] = []
        if has_email and has_invoice:
            steps = [
                Step(
                    id="step_1",
                    name="Connect and scan Gmail for new messages",
                    action=ActionType.TOOL_CALL,
                    args={"provider": "gmail", "filter": "has:attachment subject:invoice"},
                    risk=RiskLevel.LOW,
                    idempotent=True
                ),
                Step(
                    id="step_2",
                    name="Identify and download invoice attachments",
                    action=ActionType.TOOL_CALL,
                    args={"file_extensions": [".pdf", ".csv", ".xlsx"]},
                    risk=RiskLevel.LOW,
                    idempotent=True
                ),
                Step(
                    id="step_3",
                    name="Organize and categorize files into target directory",
                    action=ActionType.TOOL_CALL,
                    args={"target_folder": "Invoices/2026"},
                    risk=RiskLevel.MEDIUM,
                    requires_confirmation=False,
                    idempotent=True
                ),
                Step(
                    id="step_4",
                    name="Compile execution report to Daily Text Log",
                    action=ActionType.TOOL_CALL,
                    args={"destination": "daily_logs"},
                    risk=RiskLevel.LOW,
                    idempotent=True
                )
            ]
        elif has_files:
            steps = [
                Step(
                    id="step_1",
                    name="Scan unorganized files in staging area",
                    action=ActionType.TOOL_CALL,
                    args={"path": "sandbox_papers/unorganized"},
                    risk=RiskLevel.LOW,
                    idempotent=True
                ),
                Step(
                    id="step_2",
                    name="Group papers by category and date",
                    action=ActionType.TOOL_CALL,
                    args={"group_by": "category"},
                    risk=RiskLevel.LOW,
                    idempotent=True
                ),
                Step(
                    id="step_3",
                    name="Confirm file movements and execute organization",
                    action=ActionType.SUBMIT,
                    risk=RiskLevel.HIGH,
                    requires_confirmation=True,
                    idempotent=False
                )
            ]
        else:
            steps = [
                Step(
                    id="step_1",
                    name=f"Initialize task: {user_goal[:40]}",
                    action=ActionType.NAVIGATE,
                    args={"url": "http://localhost:8000/testsite"},
                    risk=RiskLevel.LOW,
                    idempotent=True
                ),
                Step(
                    id="step_2",
                    name="Process required records",
                    action=ActionType.CLICK,
                    target=TargetDescriptor(name="Execute Action", role="button"),
                    args={},
                    risk=RiskLevel.MEDIUM,
                    requires_confirmation=False
                )
            ]

        workflow_plan = WorkflowDefinition(
            workflow_id=f"wf_{uuid.uuid4().hex[:10]}",
            title=f"Workflow · {name}",
            intent=user_goal,
            allowed_origins=["http://localhost:8000"],
            steps=steps
        )
        workflow_plan.update_hash()

        # Build complete AgentDefinition strictly in DRAFT status
        agent = AgentDefinition(
            id=agent_id,
            name=name,
            description=description,
            instructions=instructions,
            model="mistral:latest",
            assigned_skills=assigned_skills,
            connected_integrations=connected_integrations,
            memory_config=AgentMemoryConfig(),
            trigger_config=trigger_config,
            permission_scope=permissions,
            execution_policy=AgentExecutionPolicy(
                default_dry_run=False,
                requires_confirmation_on=["delete", "submit", "send_email"],
                allowed_origins=workflow_plan.allowed_origins
            ),
            workflow_plan=workflow_plan,
            status=AgentStatus.DRAFT,
            created_at=now_str,
            updated_at=now_str
        )

        return AgentProposalResponse(
            agent=agent,
            understanding_summary=f"Synthesized intelligent agent proposal with {len(assigned_skills)} skills, {len(connected_integrations)} integrations, and {len(steps)} workflow steps.",
            suggested_integrations=suggested_integrations,
            suggested_skills=[{"name": s, "type": "automated"} for s in assigned_skills],
            required_permissions=permissions,
            ready_for_review=True
        )
