# WhistleCode Baseline Audit & Stabilization (Step 1)

This document provides a comprehensive audit of all views, components, API client calls, backend routes, handlers, and persistence layers across WhistleCode.

## Feature Trace & Status Matrix

| Feature / View | Status | Root Cause | Key Files | Fix Implemented |
|---|---|---|---|---|
| **Ask AI** (`/api/workflows/propose_goal`, `/api/ai/conversation/stream`) | **STABILIZED** | Suggestion chips or input prefixes could send raw command strings (e.g. `Execute skill: ...`); missing provider API key did not offer direct navigation to Integrations. | `src/components/views/AskAIView.tsx`, `backend/app/integrations/ai_providers/__init__.py` | Implemented `sanitizeUserPrompt` to strip raw programmatic command prefixes and map them to natural user instructions. Updated error banner to clearly explain missing API keys with a one-click button to open Settings > Integrations. |
| **Workspace / Overview** (`/api/workflows`, `/api/runs`) | **STABILIZED** | Run state mapping previously translated `FAILED` to "Not completed", obscuring terminal failure classification. | `src/components/views/OverviewView.tsx` | Updated state label mapping so `FAILED` explicitly renders as `FAILED`. |
| **Permissions & Plan Approval** (`/api/workflows/preview`, `/api/approvals/approve`, `/api/approvals`) | **STABILIZED** | `GET /api/approvals` and `GET /api/approvals/{id}` routes were missing in FastAPI, causing 404s when polling approval status. | `backend/app/main.py`, `backend/app/approval/service.py` | Implemented `GET /api/approvals` and `GET /api/approvals/{approval_id}` endpoints backed by SQLite. Preserved HMAC-SHA256 signature generation and parameter validation. |
| **Live Run / Execution Monitor** (`/api/execute`, `/api/execute/{id}`) | **STABILIZED** | Forced run failure badge and terminal verification status displayed "Not completed" instead of explicit `FAILED` state. | `src/components/execution/RunMonitor.tsx` | Updated `runStateLabel.FAILED` to `"FAILED"`, verification badge to `"FAILED"`, and step result badge to `"FAILED"`. |
| **Record Task / Teach Studio** (`/api/recordings/*`, `/api/workflows/synthesize`) | **STABILIZED** | None (Fully functional trace). Real-time event recording, DOM capture, password/secret redaction, and synthesis into workflow drafts. | `src/components/recording/RecordingStudio.tsx`, `backend/app/recording/recorder.py` | Verified event redaction, state machine transitions, and observation deduplication. |
| **Templates** | **STABILIZED** | None (Functional). Predefined workflow recipes load directly into the editor and preview modal with parameters. | `src/components/templates/WorkflowTemplatesView.tsx` | Verified parameter binding, dry-run previews, and transfer to workflow editor. |
| **Agent Studio** (`/api/agents`) | **STABILIZED** | None (Functional). Agent creation, role assignment, skills assignment, and database persistence. | `src/components/agents/AgentStudioView.tsx`, `backend/app/agents/agent_repository.py` | Verified persistence and pinned workflow routing. |
| **Automations & Triggers** (`/api/automations`) | **STABILIZED** | None (Functional). Schedule and webhook definitions persist in SQLite and trigger runs through the standard approval and policy pipeline. | `src/components/automations/AutomationsView.tsx`, `backend/app/automations/scheduler.py` | Verified scheduling, pause/delete, and database seeding. |
| **Workflow Builder / Editor** (`/api/workflows`) | **STABILIZED** | None (Functional). Step editing, re-ordering, parameter binding, version bumping, and SHA-256 content hash updates. | `src/components/views/WorkflowBuilderView.tsx`, `backend/app/models/workflow.py` | Verified content hash invalidation upon step modification. |
| **Activity & Audit Trail** (`/api/activity/dashboard`, `/api/audit`) | **STABILIZED** | None (Functional). Cryptographic hash-chained audit logging with tamper detection and secret scrubbing. | `src/components/activity/UnifiedActivityCenter.tsx`, `backend/app/audit/logger.py` | Verified audit log hash verification and summary metrics. |
| **Skills & Persistent Memory** (`/api/skills`, `/api/memory`) | **STABILIZED** | None (Functional). Skill schema validation, test execution, and categorized memory storage. | `src/components/skills/SkillsAndMemoryView.tsx`, `backend/app/skills/skill_service.py`, `backend/app/memory/memory_service.py` | Verified CRUD operations and category filtering. |
| **Integrations Hub** (`/api/integrations`) | **STABILIZED** | Disconnect/reconnect status and credential storage. | `src/components/integrations/IntegrationHubView.tsx`, `backend/app/integrations/hub.py` | Verified server-side credential vault storage and masked retrieval. |
| **Plugins & Tools** (`/api/plugins`, `/api/tools`) | **STABILIZED** | Document generator tools (`doc.generate_*`) had column mismatches with `artifacts` SQLite table (`file_path` vs `path`, `size_bytes` vs `byte_size`) and missing `json` import. | `backend/app/documents/service.py`, `backend/app/tools/registry.py` | Corrected SQLite columns to match schema in `database.py`, imported `json`, supported tuple/list row parsing in `analyze_rows`, and converted test execution to `async/await`. |
| **Paper Organizer Sandbox** (`/api/sandbox/papers`) | **STABILIZED** | None (Functional). Scoped paper sorting and classification within `.whistlecode-sandbox` directory with reversible undo. | `src/components/views/PaperOrganizerSandboxView.tsx`, `backend/app/sandbox/paper_organizer.py` | Verified path traversal rejection and file safety. |

---

## End-to-End Run Verification Flow

The end-to-end flow from user goal to verified execution is covered by `test_end_to_end_ask_ai_plan_approval_and_verification` in `backend/tests/test_benchmark_tasks.py`:

1. **Ask AI / Goal Formulation**: User provides a goal (`"At http://localhost:8000, open the homepage."`).
2. **Plan Synthesis**: AI drafts a conservative, structured `WorkflowDefinition` with origin scoping.
3. **Review & Scope**: The plan declares target origin `http://localhost:8000` and postcondition assertions.
4. **Cryptographic Approval**: `ApprovalService.create_approval()` generates an HMAC-signed approval record linked to the exact plan content hash.
5. **State Machine Execution**: `WorkflowExecutor.execute_workflow()` validates the approval signature, checks policy permissions, executes step actions, and tracks state.
6. **Postcondition Verification**: Verifier inspects execution state and marks terminal state `SUCCESS` with `VERIFIED_SUCCESS`.
7. **Audit Trail**: Every state transition and policy check is appended to the tamper-evident audit log.

---

## Verification Commands

- **Backend Pytest**: `python -m pytest backend/tests -v` (81/81 passed)
- **Frontend Build**: `npm run build` (Clean compilation, zero errors)
