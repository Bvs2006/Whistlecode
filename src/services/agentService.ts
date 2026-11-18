import type { WorkflowDefinition } from "../types";

export type AgentStatus = "draft" | "active" | "paused" | "archived";

export interface AgentMemoryConfig {
  enabled: boolean;
  long_term_memory: boolean;
  user_preferences: boolean;
  task_context_window: number;
}

export interface AgentTriggerConfig {
  type: "manual" | "scheduled" | "webhook" | "new_email" | "file_created";
  cron_expression?: string;
  timezone: string;
  filter_criteria: Record<string, any>;
  enabled: boolean;
}

export interface AgentExecutionPolicy {
  default_dry_run: boolean;
  requires_confirmation_on: string[];
  max_daily_runs: number;
  allowed_origins: string[];
}

export interface AgentDefinition {
  id: string;
  name: string;
  description: string;
  instructions: string;
  model: string;
  assigned_skills: string[];
  connected_integrations: string[];
  memory_config: AgentMemoryConfig;
  trigger_config: AgentTriggerConfig;
  permission_scope: string[];
  execution_policy: AgentExecutionPolicy;
  workflow_plan?: WorkflowDefinition | null;
  status: AgentStatus;
  created_at: string;
  updated_at: string;
}

export interface AgentProposalResponse {
  agent: AgentDefinition;
  understanding_summary: string;
  suggested_integrations: Array<{ id: string; name: string; icon: string; status: string; required: boolean }>;
  suggested_skills: Array<{ name: string; type: string }>;
  required_permissions: string[];
  ready_for_review: boolean;
}

export const agentService = {
  async listAgents(status?: string): Promise<AgentDefinition[]> {
    try {
      const url = status ? `/api/agents?status=${status}` : "/api/agents";
      const res = await fetch(url);
      if (!res.ok) return [];
      const data = await res.json();
      return data.agents || [];
    } catch (e) {
      console.error("Failed to list agents", e);
      return [];
    }
  },

  async getAgent(id: string): Promise<AgentDefinition | null> {
    try {
      const res = await fetch(`/api/agents/${id}`);
      if (!res.ok) return null;
      const data = await res.json();
      return data.agent || null;
    } catch {
      return null;
    }
  },

  async proposeAgent(goal: string): Promise<AgentProposalResponse> {
    const res = await fetch("/api/agents/propose", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ goal }),
    });
    if (!res.ok) {
      const err = await res.text();
      throw new Error(`Failed to propose agent: ${err}`);
    }
    return await res.json();
  },

  async saveAgent(agent: AgentDefinition): Promise<AgentDefinition> {
    const res = await fetch("/api/agents", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(agent),
    });
    if (!res.ok) {
      const err = await res.text();
      throw new Error(`Failed to save agent: ${err}`);
    }
    const data = await res.json();
    return data.agent;
  },

  async activateAgent(id: string): Promise<AgentDefinition> {
    const res = await fetch(`/api/agents/${id}/activate`, { method: "POST" });
    if (!res.ok) throw new Error("Failed to activate agent");
    const data = await res.json();
    return data.agent;
  },

  async pauseAgent(id: string): Promise<AgentDefinition> {
    const res = await fetch(`/api/agents/${id}/pause`, { method: "POST" });
    if (!res.ok) throw new Error("Failed to pause agent");
    const data = await res.json();
    return data.agent;
  },

  async archiveAgent(id: string): Promise<void> {
    const res = await fetch(`/api/agents/${id}`, { method: "DELETE" });
    if (!res.ok) throw new Error("Failed to archive agent");
  },
};
