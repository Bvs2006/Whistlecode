# WhistleCode Feature Audit & Verification (Step 1B)

This audit establishes verified operational status for all existing WhistleCode features. Every feature is traced from the UI component through the API client, FastAPI route, business handler, and database/external provider.

---

## 📊 Feature Audit Matrix

| Feature | Status | Evidence (Route / Files / Observed State) | Fix & Verification Summary |
|---|---|---|---|
| **Integrations Hub** (Gemini, Groq, OpenRouter, Ollama, GitHub) | **WORKS** | `GET /api/integrations`, `POST /api/integrations/{id}/connect`, `POST /api/integrations/{id}/disconnect`, `POST /api/integrations/{id}/test`<br>`src/components/integrations/IntegrationHubView.tsx`, `backend/app/integrations/hub.py`, `backend/app/integrations/probes.py` | Encrypted vault storage in SQLite/keyring. Masked keys returned (never raw tokens). Precedence rule displayed: UI Vault overrides `.env`. Real connection probes return granular statuses (`connected`, `invalid_key`, `rate_limited`, `unreachable`). GitHub exposes OAuth scopes. Ollama detects running server & model count. OpenRouter added to fallback chain (`Gemini -> Groq -> OpenRouter -> Ollama`). |
| **Ask AI** (Conversational Task Agent) | **WORKS** | `POST /api/ai/conversation/stream`, `POST /api/workflows/propose_goal`<br>`src/components/views/AskAIView.tsx`, `src/services/aiService.ts`, `backend/app/main.py` | Streams SSE replies using active provider. Suggestion chips send natural user prompts (raw prefixes like `Execute skill: ...` are sanitized). Missing key shows an actionable message with an "Open Integrations" navigation button. Fallback router operates across all configured providers. |
| **Templates** | **WORKS** | `src/components/templates/WorkflowTemplatesView.tsx` | All templates open in Workflow Editor with typed parameters, dry-run safely, and transfer to Plan Approval. Non-executable templates are removed or explicitly labeled. |
| **Workflow Editor** | **WORKS** | `GET /api/workflows`, `POST /api/workflows`<br>`src/components/views/WorkflowBuilderView.tsx`, `backend/app/models/workflow.py` | Create, edit, reorder, version, and save. Content hash dynamically recalculates on edit, and modifying any step invalidates existing cryptographic approvals. |
| **Record task / Teach Studio** | **WORKS** | `POST /api/recordings/start`, `POST /api/recordings/stop`, `POST /api/workflows/synthesize`<br>`src/components/recording/RecordingStudio.tsx`, `backend/app/recording/recorder.py` | Complete session lifecycle (`idle -> recording -> paused -> completed`). Captures DOM actions with password/OTP/cookie redaction at capture time. Synthesizes into clean parameterized drafts. |
| **Agents** | **WORKS** | `GET /api/agents`, `POST /api/agents`, `PATCH /api/agents/{id}/status`<br>`src/components/agents/AgentStudioView.tsx`, `backend/app/agents/agent_repository.py` | Create, edit, delete, activate agents with roles, instructions, and pinned workflows. Persists across restarts in SQLite `agents` table. Selectable in Ask AI. |
| **Skills & Memory** | **WORKS** | `GET /api/skills`, `POST /api/skills/{id}/test`, `GET /api/memory`, `POST /api/memory`<br>`src/components/skills/SkillsAndMemoryView.tsx`, `backend/app/skills/skill_service.py`, `backend/app/memory/memory_service.py` | All skills have typed JSON schemas and permission requirements. Persistent memory categorizes into 5 distinct categories (`USER_PREFERENCES`, `TASK_CONTEXT`, etc.) and injects only relevant context into prompts. |
| **Automations** | **WORKS** | `GET /api/automations`, `POST /api/automations`, `POST /api/automations/{id}/trigger`<br>`src/components/automations/AutomationsView.tsx`, `backend/app/automations/scheduler.py` | Persistent triggers and cron schedules in SQLite `automations` table. Pause, delete, and manual execution trigger work reliably through policy and audit logging. |
| **Plugins & Tools** | **WORKS** | `GET /api/tools`, `POST /api/tools/{id}/execute`, `GET /api/plugins`<br>`src/components/plugins/PluginManagerView.tsx`, `backend/app/tools/registry.py` | Tool registry exposes input/output schemas and required permissions. Disabled tools cannot be called. Real sample tool calls (such as document analysis) execute inside the sandbox. |
| **Permissions & Policy** | **WORKS** | `POST /api/workflows/preview`<br>`backend/app/policy/engine.py` | Default-deny policy restricts navigation to pre-approved origin domains. Sensitive actions (e.g. form submission, data deletion) trigger confirmation gates. |
| **Approval** | **WORKS** | `POST /api/approvals/approve`, `GET /api/approvals`, `POST /api/approvals/{id}/revoke`<br>`backend/app/approval/service.py` | SHA-256 plan hash signed with HMAC (`approval_signing.key`). Scope or step tampering invalidates the signature. Revocation takes effect immediately. |
| **Activity / Audit** | **WORKS** | `GET /api/activity/dashboard`, `GET /api/audit`<br>`src/components/activity/UnifiedActivityCenter.tsx`, `backend/app/audit/logger.py` | Cryptographically chained audit records in SQLite `audit_log`. Verifies chain integrity and detects record tampering. Sensitive inputs scrubbed before writing. |
| **Paper Organizer Sandbox** | **WORKS** | `GET /api/sandbox/papers`, `POST /api/sandbox/papers/organize`, `POST /api/sandbox/papers/reset`<br>`src/components/views/PaperOrganizerSandboxView.tsx`, `backend/app/sandbox/paper_organizer.py` | Runs end-to-end inside protected `.whistlecode-sandbox` folder. Path traversal attempts (`../`) are blocked. Reversible undo resets test state cleanly. |
| **Workspace Dashboard** | **WORKS** | `GET /api/activity/dashboard`<br>`src/components/views/OverviewView.tsx`, `backend/app/main.py` | Live metrics (active agents, connected integrations, completed/failed runs) are computed directly from database queries, not hardcoded constants. |

---

## 📋 Manual Verification Checklist (10-Minute Real-Use Script)

Follow these steps in the running application to verify all behaviors manually:

1. **Integrations & Key Storage**:
   - Navigate to **Settings > Integrations**.
   - Select **Groq** and enter an invalid key (e.g. `gsk_invalid_test_key`). Click **Connect Service**, then **Test Connection**.
   - Confirm status shows an error: *"Invalid key: The provider rejected the API key."*
   - Paste a valid key and click **Test Connection**; verify status changes to **Connected** with latency.
   - Open browser DevTools (Network tab); inspect the response and confirm no API returns your plaintext key (only masked `gsk_••••xxxx`).
   - Click **Remove Vault Key**; confirm the key reverts to `.env` or is cleared.
2. **Fallback Chain**:
   - In `.env`, ensure Groq or OpenRouter has a key while Gemini is unconfigured or blocked.
   - Go to **Ask AI** and send a message.
   - Confirm that Ask AI successfully answers via the fallback provider without crashing.
3. **Ask AI Suggestion Chips**:
   - On the Ask AI empty state, click any suggestion card (e.g. *"Search a website for a product"*).
   - Confirm the input query sent to chat is the clean natural language sentence, not raw command syntax.
4. **Templates & Dry Run**:
   - Navigate to **Templates** in the sidebar.
   - Click **Use Template** on any recipe.
   - Confirm it opens in **Workflow Editor**, edit a parameter, navigate to **Permissions**, approve scope, and run a **Preview run (no changes)**.
5. **Agent Studio**:
   - Navigate to **Agents**.
   - Create a new agent named `"Daily Audit Assistant"` with instructions `"Always summarize in 3 bullet points"`.
   - Select this agent in **Ask AI** and verify the instructions are respected.
6. **Persistent Memory**:
   - Navigate to **Skills & Memory > Memory**.
   - Add a memory item under `USER_PREFERENCES` with Key `preferred_currency` and Value `EUR`.
   - Refresh the page and confirm it persists in SQLite.
7. **Automations**:
   - Navigate to **Automations**.
   - Click **Run Now** on any active automation.
   - Navigate to **Activity**; confirm the execution event appears in the timeline.
8. **Approval Invalidation**:
   - Navigate to **Permissions** and approve a workflow.
   - Go to **Workflow Editor**, modify or add a step, and save.
   - Return to **Permissions**; confirm the previous approval is invalidated and marked as unapproved because the plan hash changed.
9. **Policy Guard**:
   - In **Workflow Editor**, create a workflow with a step navigating to `https://unauthorized-domain.com`.
   - Try to run it; confirm the Policy Engine stops execution with **FAILED** status.
10. **Activity & Audit Trail**:
    - Go to **Activity**.
    - Confirm all recent actions, approvals, runs, and integration changes appear with chronological timestamps.
