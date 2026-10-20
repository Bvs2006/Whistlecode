const API_BASE = "http://localhost:8000";

export async function fetchJson(endpoint: string, options: RequestInit = {}) {
  const res = await fetch(`${API_BASE}${endpoint}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(options.headers || {}),
    },
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(err.detail || "Request failed");
  }
  return res.json();
}

export const api = {
  // Recordings & Desktop Observer
  startRecording: (target_url: string, task_description: string, capture_screenshots: boolean = true) =>
    fetchJson("/api/recordings/start", {
      method: "POST",
      body: JSON.stringify({ target_url, task_description, capture_screenshots }),
    }),
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
  synthesizeWorkflow: (recording_id: string, clarification_answers?: Record<string, string>) =>
    fetchJson("/api/workflows/synthesize", {
      method: "POST",
      body: JSON.stringify({ recording_id, clarification_answers }),
    }),

  // Workflows & NL Semantic Search
  listWorkflows: () => fetchJson("/api/workflows"),
  searchWorkflows: (q: string) =>
    fetchJson(`/api/workflows/search?q=${encodeURIComponent(q)}`),
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
  revokeApproval: (approval_id: string) =>
    fetchJson(`/api/approvals/${approval_id}/revoke`, { method: "POST" }),

  // Execution
  executeWorkflow: (workflow: any, parameters: Record<string, any>, approval_id?: string, mode: "dry_run" | "test" | "run" = "run") =>
    fetchJson("/api/execute", {
      method: "POST",
      body: JSON.stringify({ workflow, parameters, approval_id, mode }),
    }),
  confirmStep: (grant: boolean) =>
    fetchJson(`/api/execute/confirm?grant=${grant}`, { method: "POST" }),
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

  // Research Paper Organizer Sandbox
  getSandboxPapers: () => fetchJson("/api/sandbox/papers"),
  organizeSandboxPapers: (plan: any[], approved_by: string = "local_user") =>
    fetchJson("/api/sandbox/organize", {
      method: "POST",
      body: JSON.stringify({ plan, approved_by }),
    }),
  undoSandboxPapers: (undo_token: string) =>
    fetchJson("/api/sandbox/undo", {
      method: "POST",
      body: JSON.stringify({ undo_token }),
    }),

  // Audit
  getAuditTrail: (limit: number = 50) => fetchJson(`/api/audit?limit=${limit}`),
};
