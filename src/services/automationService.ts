export type TriggerType =
  | "manual"
  | "scheduled"
  | "webhook"
  | "new_email"
  | "file_created"
  | "app_event";

export type AutomationStatus = "active" | "paused" | "disabled";

export interface AutomationDefinition {
  id: string;
  name: string;
  description: string;
  agent_id?: string | null;
  trigger_type: TriggerType;
  schedule_cron?: string | null;
  timezone: string;
  event_filter: Record<string, any>;
  retry_count: number;
  retry_delay_seconds: number;
  duplicate_protection_window_seconds: number;
  status: AutomationStatus;
  required_permissions: string[];
  last_triggered_at?: string | null;
  next_run_at?: string | null;
  execution_count: number;
  failure_count: number;
  created_at: string;
  updated_at: string;
}

const API_BASE = (import.meta.env.VITE_API_BASE_URL || "").replace(/\/$/, "");

export async function fetchAutomations(status?: string): Promise<AutomationDefinition[]> {
  const url = status ? `${API_BASE}/api/automations?status=${status}` : `${API_BASE}/api/automations`;
  const res = await fetch(url);
  if (!res.ok) throw new Error("Failed to load automations");
  const data = await res.json();
  return data.automations || [];
}

export async function createAutomation(payload: {
  name: string;
  description: string;
  agent_id?: string | null;
  trigger_type: TriggerType;
  schedule_cron?: string;
  timezone?: string;
  retry_count?: number;
  required_permissions?: string[];
}): Promise<AutomationDefinition> {
  const res = await fetch(`${API_BASE}/api/automations`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error("Failed to create automation");
  const data = await res.json();
  return data.automation;
}

export async function toggleAutomation(
  autoId: string,
  status: AutomationStatus
): Promise<AutomationDefinition> {
  const res = await fetch(`${API_BASE}/api/automations/${autoId}/toggle`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ status }),
  });
  if (!res.ok) throw new Error("Failed to toggle automation status");
  const data = await res.json();
  return data.automation;
}

export async function triggerAutomationNow(autoId: string): Promise<any> {
  const res = await fetch(`${API_BASE}/api/automations/${autoId}/trigger`, {
    method: "POST",
  });
  if (!res.ok) throw new Error("Failed to trigger automation");
  return res.json();
}

export async function deleteAutomation(autoId: string): Promise<void> {
  const res = await fetch(`${API_BASE}/api/automations/${autoId}`, { method: "DELETE" });
  if (!res.ok) throw new Error("Failed to delete automation");
}
