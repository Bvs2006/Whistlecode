from __future__ import annotations
import os
import json
import uuid
import datetime
from pathlib import Path
from typing import Dict, Any, Optional, List
from fastapi import FastAPI, HTTPException, Query, BackgroundTasks
from fastapi.responses import HTMLResponse, JSONResponse
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from .db.database import init_db, get_db_connection
from .models.workflow import (
    WorkflowDefinition, WorkflowDraft, Step, 
    PlanPreviewResponse, PlanPreviewStep, ClarificationQuestion, RiskLevel
)
from .models.events import RecordingSession, RecordedEvent, EventType
from .models.approval import ApprovalRecord
from .models.policy import PolicyDecision, ReasonCode
from .recording.recorder import recorder_instance
from .recording.desktop_observer import desktop_observer_instance
from .generation.synthesizer import WorkflowSynthesizer
from .policy.engine import PolicyEngine
from .approval.service import ApprovalService
from .executor.state_machine import executor_instance
from .audit.logger import AuditLogger
from .plugins.plugin_manager import plugin_manager_instance, PluginManifest

# Initialize database
init_db()

app = FastAPI(title="WhistleCode AI App-Learning Agent", version="1.1.0")

# Enable CORS for local Vite dev server
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

synthesizer = WorkflowSynthesizer()
policy_engine = PolicyEngine()

TEST_SITE_PATH = Path(__file__).parent / "test_site" / "index.html"


# 1. TEST SITE ENDPOINT
@app.get("/testsite", response_class=HTMLResponse)
async def get_test_site():
    if not TEST_SITE_PATH.exists():
        raise HTTPException(status_code=404, detail="Test site not found")
    with open(TEST_SITE_PATH, "r", encoding="utf-8") as f:
        return f.read()


# 2. RECORDING ENDPOINTS (REC-1..8 & Desktop Observer)
class StartRecordingRequest(BaseModel):
    target_url: str = "http://localhost:8000/testsite"
    task_description: str = "Create a customer profile"
    capture_screenshots: bool = True

@app.post("/api/recordings/start")
async def start_recording(req: StartRecordingRequest):
    try:
        recorder_instance.capture_screenshots = req.capture_screenshots
        session = await recorder_instance.start_session(req.target_url, req.task_description)
        return {"status": "recording", "session": session}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/recordings/current")
async def get_current_recording():
    if not recorder_instance.current_session:
        return {"status": "stopped", "session": None}
    return {
        "status": recorder_instance.current_session.status,
        "session": recorder_instance.current_session
    }

@app.post("/api/recordings/stop")
async def stop_recording():
    session = await recorder_instance.stop_session()
    if not session:
        raise HTTPException(status_code=400, detail="No active recording to stop")
    return {"status": "stopped", "session": session}


# DESKTOP OBSERVER ENDPOINTS
@app.get("/api/desktop/active_window")
async def get_desktop_active_window():
    return desktop_observer_instance.get_active_window_info()

class DesktopObserveRequest(BaseModel):
    event_type: str = "click"
    target_name: str
    role: str = "button"
    value: Optional[str] = None
    x: Optional[int] = None
    y: Optional[int] = None
    screenshot_data: Optional[str] = None

@app.post("/api/desktop/observe_event")
async def observe_desktop_action(req: DesktopObserveRequest):
    if not desktop_observer_instance.active_session:
        desktop_observer_instance.start_observation("Desktop GUI Demonstration")
    event = desktop_observer_instance.capture_action(
        event_type=req.event_type,
        target_name=req.target_name,
        role=req.role,
        value=req.value,
        x=req.x,
        y=req.y,
        screenshot_data=req.screenshot_data
    )
    return {"event": event}

@app.post("/api/desktop/stop")
async def stop_desktop_observation():
    session = desktop_observer_instance.stop_observation()
    return {"session": session}


# 3. WORKFLOW GENERATION & CLARIFICATION DIALOGUE (GEN-1..8)
@app.get("/api/recordings/{recording_id}/clarifications")
async def get_recording_clarifications(recording_id: str):
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM recordings WHERE id = ?", (recording_id,))
    rec = cursor.fetchone()
    if not rec:
        conn.close()
        raise HTTPException(status_code=404, detail="Recording not found")

    cursor.execute("SELECT * FROM events WHERE recording_id = ? ORDER BY ts ASC", (recording_id,))
    rows = cursor.fetchall()
    conn.close()

    from .models.workflow import TargetDescriptor
    events = []
    for r in rows:
        target_data = json.loads(r["target_json"]) if r["target_json"] else None
        target_desc = TargetDescriptor(**target_data) if target_data else None
        meta = json.loads(r["metadata_json"]) if r["metadata_json"] else {}
        events.append(RecordedEvent(
            id=r["id"],
            recording_id=r["recording_id"],
            timestamp=r["ts"],
            type=EventType(r["type"]),
            url=r["url"],
            target=target_desc,
            value=r["value_masked"],
            is_masked=bool("[MASKED_SECRET]" in (r["value_masked"] or "")),
            screenshot=meta.get("screenshot"),
            active_window=meta.get("active_window"),
            metadata=meta
        ))

    session = RecordingSession(
        id=rec["id"],
        created_at=rec["created_at"],
        task_description=rec["task_description"],
        status=rec["status"],
        target_url=rec["target_url"],
        events=events
    )

    clarifications = synthesizer.generate_clarifications(session)
    return {"clarifications": clarifications}


class SynthesizeRequest(BaseModel):
    recording_id: str
    clarification_answers: Optional[Dict[str, str]] = None

@app.post("/api/workflows/synthesize")
async def synthesize_workflow(req: SynthesizeRequest):
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM recordings WHERE id = ?", (req.recording_id,))
    rec = cursor.fetchone()
    if not rec:
        conn.close()
        raise HTTPException(status_code=404, detail="Recording not found")

    cursor.execute("SELECT * FROM events WHERE recording_id = ? ORDER BY ts ASC", (req.recording_id,))
    rows = cursor.fetchall()
    conn.close()

    from .models.workflow import TargetDescriptor
    events = []
    for r in rows:
        target_data = json.loads(r["target_json"]) if r["target_json"] else None
        target_desc = TargetDescriptor(**target_data) if target_data else None
        meta = json.loads(r["metadata_json"]) if r["metadata_json"] else {}
        events.append(RecordedEvent(
            id=r["id"],
            recording_id=r["recording_id"],
            timestamp=r["ts"],
            type=EventType(r["type"]),
            url=r["url"],
            target=target_desc,
            value=r["value_masked"],
            is_masked=bool("[MASKED_SECRET]" in (r["value_masked"] or "")),
            screenshot=meta.get("screenshot"),
            active_window=meta.get("active_window"),
            metadata=meta
        ))

    session = RecordingSession(
        id=rec["id"],
        created_at=rec["created_at"],
        task_description=rec["task_description"],
        status=rec["status"],
        target_url=rec["target_url"],
        events=events
    )

    workflow = synthesizer.synthesize_from_session(session, req.clarification_answers)
    return {"workflow": workflow}


# 4. WORKFLOW REVIEWS, VERSIONS & NATURAL LANGUAGE SEARCH (EDT-1..7)
@app.get("/api/workflows")
async def list_workflows():
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM workflows ORDER BY created_at DESC")
    wfs = cursor.fetchall()
    
    result = []
    for wf in wfs:
        cursor.execute("SELECT * FROM workflow_versions WHERE workflow_id = ? ORDER BY version DESC LIMIT 1", (wf["id"],))
        v = cursor.fetchone()
        result.append({
            "id": wf["id"],
            "title": wf["title"],
            "intent": wf["intent"],
            "created_at": wf["created_at"],
            "latest_version": v["version"] if v else 1,
            "content_hash": v["content_hash"] if v else "",
            "latest_data": json.loads(v["json_data"]) if v else None
        })
    conn.close()
    return {"workflows": result}


@app.get("/api/workflows/search")
async def search_workflows(q: str = Query("")):
    """
    Search saved reusable workflows using Natural Language.
    """
    wf_res = await list_workflows()
    all_wfs = wf_res["workflows"]
    
    # Extract workflow payloads
    formatted_wfs = []
    for w in all_wfs:
        payload = w["latest_data"] or {
            "workflow_id": w["id"],
            "title": w["title"],
            "intent": w["intent"],
            "parameters": [],
            "steps": []
        }
        formatted_wfs.append({
            **payload,
            "id": w["id"],
            "latest_version": w["latest_version"],
            "content_hash": w["content_hash"]
        })

    matched = WorkflowSynthesizer.search_workflows_nl(q, formatted_wfs)
    return {"query": q, "count": len(matched), "results": matched}


@app.post("/api/workflows/save")
async def save_workflow(workflow: WorkflowDefinition):
    now = datetime.datetime.now(datetime.timezone.utc).isoformat()
    workflow.update_hash()
    workflow.created_at = now

    conn = get_db_connection()
    cursor = conn.cursor()

    cursor.execute("SELECT id FROM workflows WHERE id = ?", (workflow.workflow_id,))
    existing = cursor.fetchone()
    if not existing:
        cursor.execute(
            "INSERT INTO workflows (id, title, intent, created_at) VALUES (?, ?, ?, ?)",
            (workflow.workflow_id, workflow.title, workflow.intent, now)
        )

    version_id = f"ver_{workflow.workflow_id}_v{workflow.version}"
    cursor.execute(
        """
        INSERT OR REPLACE INTO workflow_versions (id, workflow_id, version, content_hash, json_data, parent_version, change_summary, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        """,
        (
            version_id,
            workflow.workflow_id,
            workflow.version,
            workflow.content_hash,
            workflow.model_dump_json(),
            workflow.parent_version,
            workflow.change_summary or "Saved edits",
            now
        )
    )
    conn.commit()
    conn.close()

    AuditLogger.log_event(
        actor="user",
        event_type="WORKFLOW_SAVED",
        workflow_id=workflow.workflow_id,
        version_hash=workflow.content_hash,
        details={"version": workflow.version, "change_summary": workflow.change_summary}
    )

    return {"status": "saved", "workflow": workflow}


# 5. PREVIEW BEFORE EXECUTION & APPROVALS (APR-1..5 & Preview MVP)
class PlanPreviewRequest(BaseModel):
    workflow: WorkflowDefinition
    parameters: Optional[Dict[str, Any]] = None
    approval_id: Optional[str] = None

@app.post("/api/workflows/preview", response_model=PlanPreviewResponse)
async def preview_plan(req: PlanPreviewRequest):
    """
    Shows every planned action, target, evaluated arguments, expected postcondition,
    risk level, and policy evaluation before running the plan.
    Requires explicit approval before execution.
    """
    wf = req.workflow
    params = req.parameters or {}
    for p in wf.parameters:
        if p.name not in params and p.default_value is not None:
            params[p.name] = p.default_value

    preview_steps: List[PlanPreviewStep] = []
    overall_risk = RiskLevel.LOW

    for idx, step in enumerate(wf.steps):
        if not step.enabled:
            continue

        # Evaluate target string
        target_label = "Page"
        if step.target:
            target_label = step.target.name or step.target.test_id or step.target.role or step.target.text or "Element"

        # Substitute parameters in args
        eval_args = {}
        for k, v in step.args.items():
            if isinstance(v, str):
                val_str = v
                for pk, pv in params.items():
                    val_str = val_str.replace(f"{{{{{pk}}}}}", str(pv))
                eval_args[k] = val_str
            else:
                eval_args[k] = v

        # Evaluate expected result
        expected_result = "Action executes successfully"
        if step.postconditions:
            expected_result = f"Verify {step.postconditions[0].type}: {step.postconditions[0].value or step.postconditions[0].selector or 'match'}"
        elif step.action == "navigate":
            expected_result = f"Page loaded at {eval_args.get('url', 'destination')}"
        elif step.action == "submit":
            expected_result = "Form submitted; verify server response / success confirmation"

        # Policy pre-flight evaluation
        primary_origin = wf.allowed_origins[0] if wf.allowed_origins else "http://localhost:8000"
        decision, reason, computed_risk = policy_engine.evaluate_step(step, current_url=primary_origin)

        # Risk escalation
        if computed_risk == RiskLevel.CRITICAL:
            overall_risk = RiskLevel.CRITICAL
        elif computed_risk == RiskLevel.HIGH and overall_risk != RiskLevel.CRITICAL:
            overall_risk = RiskLevel.HIGH
        elif computed_risk == RiskLevel.MEDIUM and overall_risk == RiskLevel.LOW:
            overall_risk = RiskLevel.MEDIUM

        preview_steps.append(PlanPreviewStep(
            step_index=idx + 1,
            step_id=step.id,
            name=step.name,
            action=step.action.value,
            target_label=target_label,
            evaluated_args=eval_args,
            expected_result=expected_result,
            risk=computed_risk,
            requires_confirmation=step.requires_confirmation or (computed_risk in [RiskLevel.HIGH, RiskLevel.CRITICAL]),
            policy_decision=decision.value,
            policy_reason=reason.value
        ))

    # Verify if valid approval exists
    is_approved = False
    if req.approval_id:
        valid, _, _ = ApprovalService.verify_approval_for_run(wf, req.approval_id)
        is_approved = valid

    return PlanPreviewResponse(
        workflow_id=wf.workflow_id,
        title=wf.title,
        content_hash=wf.content_hash or wf.compute_hash(),
        steps=preview_steps,
        parameters=wf.parameters,
        overall_risk=overall_risk,
        is_approved=is_approved,
        allowed_origins=wf.allowed_origins
    )


class ApproveRequest(BaseModel):
    workflow: WorkflowDefinition
    allowed_origins: Optional[List[str]] = None
    duration_days: int = 30

@app.post("/api/approvals/approve")
async def approve_workflow(req: ApproveRequest):
    approval = ApprovalService.create_approval(
        workflow=req.workflow,
        allowed_origins=req.allowed_origins,
        duration_days=req.duration_days,
        approver="local_user"
    )

    AuditLogger.log_event(
        actor="user",
        event_type="APPROVAL_GRANTED",
        workflow_id=req.workflow.workflow_id,
        version_hash=req.workflow.content_hash,
        ref_ids={"approval_id": approval.id},
        details={"scope": approval.scope.model_dump(), "expires_at": approval.expires_at}
    )

    return {"status": "approved", "approval": approval}

@app.post("/api/approvals/{approval_id}/revoke")
async def revoke_approval(approval_id: str):
    revoked = ApprovalService.revoke_approval(approval_id)
    if not revoked:
        raise HTTPException(status_code=404, detail="Approval not found")

    AuditLogger.log_event(
        actor="user",
        event_type="APPROVAL_REVOKED",
        ref_ids={"approval_id": approval_id}
    )
    return {"status": "revoked"}


# 6. EXECUTION ENDPOINTS (EXE-1..12 & TST-1..4)
class ExecuteRequest(BaseModel):
    workflow: WorkflowDefinition
    parameters: Dict[str, Any] = {}
    approval_id: Optional[str] = None
    mode: str = "run"  # "dry_run", "test", "run"

@app.post("/api/execute")
async def start_execution(req: ExecuteRequest):
    run_record = await executor_instance.execute_workflow(
        workflow=req.workflow,
        parameters=req.parameters,
        approval_id=req.approval_id,
        mode=req.mode
    )
    return {"run": run_record}

@app.post("/api/execute/confirm")
async def confirm_step(grant: bool = Query(True)):
    if grant:
        executor_instance.grant_confirmation()
    else:
        executor_instance.deny_confirmation()
    return {"status": "confirmation_handled", "granted": grant}

@app.post("/api/execute/stop")
async def stop_execution():
    executor_instance.request_stop()
    return {"status": "stop_requested"}


# 7. EXTENSIBLE PLUGINS & TOOL RESOURCE ENDPOINTS
@app.get("/api/plugins")
async def list_plugins():
    return {"plugins": plugin_manager_instance.list_plugins()}

@app.post("/api/plugins/register")
async def register_plugin(manifest: PluginManifest):
    saved = plugin_manager_instance.register_plugin(manifest)
    return {"status": "registered", "plugin": saved}

class TogglePluginRequest(BaseModel):
    enabled: bool

@app.post("/api/plugins/{plugin_id}/toggle")
async def toggle_plugin(plugin_id: str, req: TogglePluginRequest):
    updated = plugin_manager_instance.toggle_plugin(plugin_id, req.enabled)
    if not updated:
        raise HTTPException(status_code=404, detail=f"Plugin '{plugin_id}' not found")
    return {"status": "updated", "plugin": updated}

class ExecuteToolRequest(BaseModel):
    plugin_id: str
    tool_name: str
    args: Dict[str, Any] = {}
    dry_run: bool = False

@app.post("/api/plugins/execute_tool")
async def execute_plugin_tool(req: ExecuteToolRequest):
    res = plugin_manager_instance.execute_tool(req.plugin_id, req.tool_name, req.args, req.dry_run)
    return res


# 8. AUDIT TRAIL ENDPOINTS (AUD-1..4)
@app.get("/api/audit")
async def get_audit_trail(limit: int = 50):
    entries = AuditLogger.get_entries(limit=limit)
    is_valid, failing_id = AuditLogger.verify_chain()
    return {
        "is_chain_valid": is_valid,
        "failing_entry_id": failing_id,
        "entries": entries
    }


# 9. RESEARCH PAPER ORGANIZER BENCHMARK & REVERSIBLE SANDBOX
from .sandbox.paper_organizer import paper_organizer_instance, OrganizationPlanItem

@app.get("/api/sandbox/papers")
async def list_sandbox_papers():
    papers = paper_organizer_instance.list_papers()
    plan = paper_organizer_instance.generate_plan()
    return {"papers": papers, "plan": plan}

class ExecuteOrganizeRequest(BaseModel):
    plan: List[OrganizationPlanItem]
    approved_by: str = "local_user"

@app.post("/api/sandbox/organize")
async def execute_paper_organization(req: ExecuteOrganizeRequest):
    try:
        res = paper_organizer_instance.execute_organization(req.plan, req.approved_by)
        AuditLogger.log_event(
            actor="user",
            event_type="PAPERS_ORGANIZED",
            details={"undo_token": res["undo_token"], "count": len(res["results"])}
        )
        return res
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

class UndoOrganizeRequest(BaseModel):
    undo_token: str

@app.post("/api/sandbox/undo")
async def undo_paper_organization(req: UndoOrganizeRequest):
    res = paper_organizer_instance.revert_organization(req.undo_token)
    if not res.get("success"):
        raise HTTPException(status_code=400, detail=res.get("error", "Undo failed"))
    AuditLogger.log_event(
        actor="user",
        event_type="PAPERS_UNDO_REVERTED",
        details={"undo_token": req.undo_token}
    )
    return res
