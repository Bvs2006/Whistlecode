export interface ActivityDashboardData {
  summary: {
    total_agents: number;
    active_agents: number;
    connected_integrations: number;
    total_integrations: number;
    active_automations: number;
    completed_runs: number;
    failed_runs: number;
    running_runs: number;
  };
  agents: any[];
  active_tasks: any[];
  recent_runs: {
    id: string;
    workflow_id: string;
    mode: string;
    state: string;
    verification_state?: string;
    started_at: string;
    ended_at?: string;
    safe_stop_reason?: string;
  }[];
  recent_activity: {
    id: number;
    ts: string;
    actor: string;
    event_type: string;
    workflow_id?: string;
    details: Record<string, any>;
  }[];
  integrations: any[];
  automations: any[];
}

const API_BASE = "http://localhost:8000";

export async function fetchActivityDashboard(): Promise<ActivityDashboardData> {
  const res = await fetch(`${API_BASE}/api/activity/dashboard`);
  if (!res.ok) throw new Error("Failed to load activity dashboard");
  return res.json();
}
