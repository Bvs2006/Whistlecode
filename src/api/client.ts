// Browser requests use the same origin by default; the dev server forwards /api
// to the local service. Deployments can point at their own API host without a
// source-code change.
const API_BASE = (import.meta.env.VITE_API_BASE_URL || "").replace(/\/$/, "");

export async function fetchJson(endpoint: string, options: RequestInit = {}) {
  let res: Response;
  try {
    res = await fetch(`${API_BASE}${endpoint}`, {
      ...options,
      headers: {
        "Content-Type": "application/json",
        ...(options.headers || {}),
      },
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") throw error;
    throw new Error("WhistleCode could not connect. Please try again.");
  }
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    const detail = typeof err.detail === "string" ? err.detail : "";
    if (res.status === 503 && detail && !/ollama|qwen|model|llm|traceback|pydantic|fastapi|playwright|database|internal server/i.test(detail)) {
      throw new Error(detail);
    }
    if (res.status >= 500 || /ollama|qwen|model|llm|traceback|pydantic|fastapi|playwright|database|internal server/i.test(detail)) {
      throw new Error("WhistleCode could not complete that request. Please try again.");
    }
    throw new Error(detail || "WhistleCode could not complete that request. Please try again.");
  }
  return res.json();
}

export const api = {
  streamConversation: async (
    payload: { message: string; history: Array<{ role: "user" | "assistant"; content: string }>; active_workflow?: any; attachments?: Array<{ name: string; content: string }> },
    signal: AbortSignal,
    onDelta: (text: string) => void,
  ) => {
    const res = await fetch(`${API_BASE}/api/ai/conversation/stream`, {
      method: "POST",
      signal,
      headers: { "Content-Type": "application/json", Accept: "text/event-stream" },
      body: JSON.stringify(payload),
    });
    if (!res.ok || !res.body) {
      const err = await res.json().catch(() => ({ detail: "WhistleCode could not answer right now." }));
      throw new Error(typeof err.detail === "string" ? err.detail : "WhistleCode could not answer right now.");
    }
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    while (true) {
      const { value, done } = await reader.read();
      buffer += decoder.decode(value || new Uint8Array(), { stream: !done });
      const frames = buffer.split("\n\n");
      buffer = frames.pop() || "";
      for (const frame of frames) {
        const data = frame.split("\n").find((line) => line.startsWith("data: "))?.slice(6);
        if (!data || data === "[DONE]") continue;
        let event: { delta?: string; error?: string };
        try { event = JSON.parse(data); } catch { continue; }
        if (event.error) throw new Error(event.error);
        if (event.delta) onDelta(event.delta);
      }
      if (done) break;
    }
  },
  // Recordings & Desktop Observer
  startRecording: (target_url: string, task_description: string, capture_screenshots: boolean = true, capture_clicks = true, capture_keyboard = true) =>
    fetchJson("/api/recordings/start", {
      method: "POST",
      body: JSON.stringify({ target_url, task_description, capture_screenshots, capture_clicks, capture_keyboard }),
    }),
  pauseRecording: () => fetchJson("/api/recordings/pause", { method: "POST" }),
  resumeRecording: () => fetchJson("/api/recordings/resume", { method: "POST" }),
  getCurrentRecording: () => fetchJson("/api/recordings/current"),
  stopRecording: () => fetchJson("/api/recordings/stop", { method: "POST" }),
  getDesktopActiveWindow: () => fetchJson("/api/desktop/active_window"),
  observeDesktopAction: (payload: { event_type: string; target_name: string; role?: string; value?: string; x?: number; y?: number; screenshot_data?: string }) =>
    fetchJson("/api/desktop/observe_event", {
      method: "POST",
      body: JSON.stringify(payload),
    }),

  // Clarification Dialogue & Synthesis
  getClarifications: (recording_id: string) =>
    fetchJson(`/api/recordings/${recording_id}/clarifications`),
  proposeGoal: (goal: string, signal?: AbortSignal) =>
    fetchJson("/api/ai/goal", {
      method: "POST",
      signal,
      body: JSON.stringify({ goal }),
    }),
  reviseWorkflow: (workflow: any, instruction: string, signal?: AbortSignal) =>
    fetchJson("/api/ai/revise-workflow", {
      method: "POST",
      signal,
      body: JSON.stringify({ workflow, instruction }),
    }),
  proposeObservations: (goal: string, observations: Array<Record<string, unknown>>) =>
    fetchJson("/api/ai/observations", {
      method: "POST",
      body: JSON.stringify({ goal, observations }),
    }),
  synthesizeWorkflow: (
    recording_id: string,
    clarification_answers?: Record<string, string>,
    answered_questions?: Array<{ id: string; step_id?: string; question: string }>,
  ) =>
    fetchJson("/api/workflows/synthesize", {
      method: "POST",
      body: JSON.stringify({ recording_id, clarification_answers, answered_questions }),
    }),

  // Workflows & NL Semantic Search
  listWorkflows: () => fetchJson("/api/workflows"),
  listRuns: (limit = 20) => fetchJson(`/api/runs?limit=${limit}`),
  searchWorkflows: (q: string, signal?: AbortSignal) =>
    fetchJson(`/api/workflows/search?q=${encodeURIComponent(q)}`, { signal }),
  saveWorkflow: (workflow: any) =>
    fetchJson("/api/workflows/save", {
      method: "POST",
      body: JSON.stringify(workflow),
    }),

  // Preview & Risk Evaluation
  previewPlan: (workflow: any, parameters?: Record<string, any>, approval_id?: string) =>
    fetchJson("/api/workflows/preview", {
      method: "POST",
      body: JSON.stringify({ workflow, parameters, approval_id }),
    }),

  // Approvals
  approveWorkflow: (workflow: any, allowed_origins?: string[], duration_days: number = 30) =>
    fetchJson("/api/approvals/approve", {
      method: "POST",
      body: JSON.stringify({ workflow, allowed_origins, duration_days }),
    }),
  recordApprovalDecision: (workflow: any, decision: "deny" | "cancel" | "edit_plan", reason?: string) =>
    fetchJson("/api/approvals/decision", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ workflow, decision, reason }),
    }),
  revokeApproval: (approval_id: string) =>
    fetchJson(`/api/approvals/${approval_id}/revoke`, { method: "POST" }),

  // Execution
  executeWorkflow: (workflow: any, parameters: Record<string, any>, approval_id?: string, mode: "dry_run" | "test" | "run" = "run") =>
    fetchJson("/api/execute", {
      method: "POST",
      body: JSON.stringify({ workflow, parameters, approval_id, mode }),
    }),
  getExecutionStatus: (run_id: string) => fetchJson(`/api/execute/${encodeURIComponent(run_id)}`),
  confirmStep: (run_id: string, grant: boolean) =>
    fetchJson(`/api/execute/confirm?run_id=${encodeURIComponent(run_id)}&grant=${grant}`, { method: "POST" }),
  stopExecution: () => fetchJson("/api/execute/stop", { method: "POST" }),

  // Extensible Plugins & Tools
  listPlugins: () => fetchJson("/api/plugins"),
  togglePlugin: (plugin_id: string, enabled: boolean) =>
    fetchJson(`/api/plugins/${plugin_id}/toggle`, {
      method: "POST",
      body: JSON.stringify({ enabled }),
    }),
  registerPlugin: (manifest: any) =>
    fetchJson("/api/plugins/register", {
      method: "POST",
      body: JSON.stringify(manifest),
    }),
  executePluginTool: (plugin_id: string, tool_name: string, args: Record<string, any> = {}, dry_run: boolean = false) =>
    fetchJson("/api/plugins/execute_tool", {
      method: "POST",
      body: JSON.stringify({ plugin_id, tool_name, args, dry_run }),
    }),
  approvePluginTool: (plugin_id: string, tool_name: string, args: Record<string, any>) =>
    fetchJson("/api/plugins/approve_tool", {
      method: "POST",
      body: JSON.stringify({ plugin_id, tool_name, args }),
    }),
  dispatchApprovedPluginTool: (plugin_id: string, tool_name: string, args: Record<string, any>, approval_id: string) =>
    fetchJson("/api/plugins/execute_tool", {
      method: "POST",
      body: JSON.stringify({ plugin_id, tool_name, args, dry_run: false, approval_id }),
    }),

  // Research Paper Organizer Sandbox
  getSandboxPapers: () => fetchJson("/api/sandbox/papers"),
  approveSandboxPlan: (plan: any[]) =>
    fetchJson("/api/sandbox/approve", { method: "POST", body: JSON.stringify({ plan }) }),
  organizeSandboxPapers: (plan: any[], grant_id: string) =>
    fetchJson("/api/sandbox/organize", {
      method: "POST",
      body: JSON.stringify({ plan, grant_id }),
    }),
  undoSandboxPapers: (undo_token: string) =>
    fetchJson("/api/sandbox/undo", {
      method: "POST",
      body: JSON.stringify({ undo_token }),
    }),

  // Audit
  getAuditTrail: (limit: number = 50) => fetchJson(`/api/audit?limit=${limit}`),
};
