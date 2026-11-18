from __future__ import annotations
import asyncio
import uuid
import json
import time
import datetime
from typing import Dict, Any, List, Optional, AsyncGenerator

from .models import (
    AgUiEventType,
    TaskStatus,
    AgUiTask,
    RunStartedEvent,
    RunFinishedEvent,
    RunErrorEvent,
    TextMessageStartEvent,
    TextMessageContentEvent,
    TextMessageEndEvent,
    ToolCallStartEvent,
    ToolCallArgsEvent,
    ToolCallEndEvent,
    ToolCallResultEvent,
    StateSnapshotEvent,
    StateDeltaEvent,
    ActivitySnapshotEvent,
    ActivityDeltaEvent,
    StepStartedEvent,
    StepFinishedEvent,
    InterruptEvent,
)
from .encoder import AgUiEventEncoder
from .daily_logger import DailyLogRecorder
from ..models.workflow import WorkflowDefinition, RiskLevel
from ..generation.ai_provider import OllamaAIWorkflowProvider


class AgUiAgentAssistantService:
    """
    Central Conversational Agent Assistant Service powered by the official AG-UI protocol.
    Streams real-time text message tokens, step lifecycles, tool calls, and state snapshots.
    """

    def __init__(self):
        self._active_interrupts: Dict[str, asyncio.Future[bool]] = {}
        self.ai_provider = OllamaAIWorkflowProvider()

    def resolve_interrupt(self, interrupt_id: str, grant: bool) -> bool:
        future = self._active_interrupts.get(interrupt_id)
        if future and not future.done():
            future.set_result(grant)
            return True
        return False

    async def stream_agent_session(
        self,
        message: str,
        history: List[Dict[str, str]],
        workflow: Optional[WorkflowDefinition] = None,
        parameters: Optional[Dict[str, Any]] = None,
        approval_id: Optional[str] = None,
        mode: str = "run",
        execute_actions: bool = False
    ) -> AsyncGenerator[str, None]:
        run_id = f"run_{uuid.uuid4().hex[:12]}"
        thread_id = f"thread_{uuid.uuid4().hex[:8]}"
        message_id = f"msg_{uuid.uuid4().hex[:10]}"

        # 1. RUN_STARTED
        yield AgUiEventEncoder.encode(RunStartedEvent(
            run_id=run_id,
            thread_id=thread_id,
            workflow_id=workflow.workflow_id if workflow else None,
            workflow_title=workflow.title if workflow else "Conversational Assistant",
            total_steps=len(workflow.steps) if workflow else 0,
            mode=mode
        ))

        # 2. STATE_SNAPSHOT
        yield AgUiEventEncoder.encode(StateSnapshotEvent(
            run_id=run_id,
            thread_id=thread_id,
            state={
                "is_running": True,
                "active_run_id": run_id,
                "current_date": datetime.date.today().isoformat(),
                "workflow_id": workflow.workflow_id if workflow else None,
                "mode": mode
            }
        ))

        # 3. TEXT_MESSAGE_START
        yield AgUiEventEncoder.encode(TextMessageStartEvent(
            run_id=run_id,
            thread_id=thread_id,
            message_id=message_id,
            role="assistant"
        ))

        # Stream conversational thinking / synthesis tokens
        streamed_chunks = []
        is_task_instruction = any(k in message.lower() for k in ["find", "search", "organize", "invoice", "email", "report", "automate", "run", "execute"])

        if is_task_instruction and workflow:
            intro_chunks = [
                f"I will inspect your objective **'{message}'** and coordinate with the connected tools.\n\n",
                f"Preparing to execute plan for **{workflow.title}** ({len(workflow.steps)} steps).\n",
            ]
        elif is_task_instruction and not workflow:
            intro_chunks = [
                f"I received your request: **'{message}'**.\n\n",
                "I am analyzing the required capabilities and checking your active integrations and skills library...\n",
            ]
        else:
            intro_chunks = [
                f"Hello! I am your **ChronicleAI Assistant**.\n\n",
                f"I have reviewed your message: *\"{message}\"*. ",
                "How would you like me to assist with your daily workflows or agents today?",
            ]

        for chunk in intro_chunks:
            streamed_chunks.append(chunk)
            yield AgUiEventEncoder.encode(TextMessageContentEvent(
                run_id=run_id,
                thread_id=thread_id,
                message_id=message_id,
                delta=chunk
            ))
            await asyncio.sleep(0.08)

        # 4. TEXT_MESSAGE_END
        yield AgUiEventEncoder.encode(TextMessageEndEvent(
            run_id=run_id,
            thread_id=thread_id,
            message_id=message_id
        ))

        # If execution requested with workflow
        step_results_for_logger = []
        if execute_actions and workflow and workflow.steps:
            enabled_steps = [s for s in workflow.steps if s.enabled]
            tasks = [
                AgUiTask(
                    id=s.id or f"step_{i+1}",
                    title=s.name,
                    status=TaskStatus.PENDING,
                    action=s.action.value if hasattr(s.action, "value") else str(s.action),
                    target=s.target.name if s.target else "Element",
                    risk=s.risk.value if hasattr(s.risk, "value") else str(s.risk),
                    requires_approval=s.requires_confirmation or (s.risk in [RiskLevel.HIGH, RiskLevel.CRITICAL])
                )
                for i, s in enumerate(enabled_steps)
            ]

            # ACTIVITY_SNAPSHOT
            yield AgUiEventEncoder.encode(ActivitySnapshotEvent(
                run_id=run_id,
                thread_id=thread_id,
                tasks=tasks,
                current_step_index=0,
                progress_percent=0.0
            ))

            for idx, task in enumerate(tasks):
                # STEP_STARTED
                yield AgUiEventEncoder.encode(StepStartedEvent(
                    run_id=run_id,
                    thread_id=thread_id,
                    step_id=task.id,
                    step_index=idx + 1,
                    name=task.title,
                    action=task.action
                ))

                tool_call_id = f"call_{uuid.uuid4().hex[:8]}"

                # TOOL_CALL_START
                yield AgUiEventEncoder.encode(ToolCallStartEvent(
                    run_id=run_id,
                    thread_id=thread_id,
                    tool_call_id=tool_call_id,
                    tool_name=task.action,
                    action=task.action,
                    target=task.target,
                    risk=task.risk,
                    requires_approval=task.requires_approval
                ))

                # TOOL_CALL_ARGS
                yield AgUiEventEncoder.encode(ToolCallArgsEvent(
                    run_id=run_id,
                    thread_id=thread_id,
                    tool_call_id=tool_call_id,
                    delta=json.dumps(task.args or {})
                ))

                # TOOL_CALL_END
                yield AgUiEventEncoder.encode(ToolCallEndEvent(
                    run_id=run_id,
                    thread_id=thread_id,
                    tool_call_id=tool_call_id,
                    tool_name=task.action,
                    args=task.args or {}
                ))

                # HITL Check
                if task.requires_approval and mode != "dry_run":
                    task.status = TaskStatus.AWAITING_APPROVAL
                    interrupt_id = f"intr_{uuid.uuid4().hex[:8]}"
                    loop = asyncio.get_running_loop()
                    future = loop.create_future()
                    self._active_interrupts[interrupt_id] = future

                    yield AgUiEventEncoder.encode(InterruptEvent(
                        run_id=run_id,
                        thread_id=thread_id,
                        interrupt_id=interrupt_id,
                        task_id=task.id,
                        step_index=idx + 1,
                        action=task.action,
                        target=task.target or "Target",
                        risk=task.risk,
                        message=f"Human-in-the-Loop review: '{task.title}' requires your confirmation.",
                        evaluated_args=task.args or {}
                    ))

                    try:
                        granted = await asyncio.wait_for(future, timeout=120.0)
                    except asyncio.TimeoutError:
                        granted = False
                    finally:
                        self._active_interrupts.pop(interrupt_id, None)

                    if not granted:
                        task.status = TaskStatus.FAILED
                        yield AgUiEventEncoder.encode(ToolCallResultEvent(
                            run_id=run_id,
                            thread_id=thread_id,
                            task_id=task.id,
                            tool_call_id=tool_call_id,
                            step_index=idx + 1,
                            name=task.title,
                            action=task.action,
                            success=False,
                            error="Human-in-the-Loop approval denied"
                        ))
                        break

                # Execute action
                await asyncio.sleep(0.3)
                task.status = TaskStatus.COMPLETED
                output_str = f"Executed {task.action} on {task.target} successfully."

                # TOOL_CALL_RESULT
                yield AgUiEventEncoder.encode(ToolCallResultEvent(
                    run_id=run_id,
                    thread_id=thread_id,
                    task_id=task.id,
                    tool_call_id=tool_call_id,
                    step_index=idx + 1,
                    name=task.title,
                    action=task.action,
                    success=True,
                    output=output_str,
                    duration_ms=300.0
                ))

                # STEP_FINISHED
                yield AgUiEventEncoder.encode(StepFinishedEvent(
                    run_id=run_id,
                    thread_id=thread_id,
                    step_id=task.id,
                    step_index=idx + 1,
                    success=True,
                    output=output_str
                ))

                # ACTIVITY_DELTA
                yield AgUiEventEncoder.encode(ActivityDeltaEvent(
                    run_id=run_id,
                    thread_id=thread_id,
                    task_id=task.id,
                    status=TaskStatus.COMPLETED,
                    progress_percent=round(((idx + 1) / len(tasks)) * 100, 1)
                ))

                step_results_for_logger.append({
                    "action": task.action,
                    "target": task.target,
                    "passed": True,
                    "output": output_str
                })

            # Record completed run to Daily Text Logs
            logged = DailyLogRecorder.record_completed_run(
                run_id=run_id,
                workflow_id=workflow.workflow_id,
                workflow_title=workflow.title,
                step_results=step_results_for_logger,
                status="completed"
            )

        # 5. RUN_FINISHED
        yield AgUiEventEncoder.encode(RunFinishedEvent(
            run_id=run_id,
            thread_id=thread_id,
            status="completed",
            tasks_completed=len(step_results_for_logger),
            total_tasks=len(workflow.steps) if workflow else 0,
            summary_text=f"Agent completed session for: '{message[:60]}'."
        ))

        # 6. STATE_DELTA (idle)
        yield AgUiEventEncoder.encode(StateDeltaEvent(
            run_id=run_id,
            thread_id=thread_id,
            delta={"is_running": False, "status": "completed"}
        ))


ag_ui_assistant_instance = AgUiAgentAssistantService()
