export type MemoryCategory =
  | "user_preferences"
  | "task_context"
  | "execution_summary"
  | "learned_workflow"
  | "frequently_used_parameters";

export interface AgentMemoryItem {
  id: string;
  agent_id?: string | null;
  category: MemoryCategory;
  key: string;
  value: string;
  provenance: "user_entry" | "recorded_run" | "daily_log" | "system_learned";
  confidence: number;
  created_at: string;
  updated_at: string;
}

const API_BASE = "http://localhost:8000";

export async function fetchMemories(agentId?: string, category?: string): Promise<AgentMemoryItem[]> {
  const params = new URLSearchParams();
  if (agentId) params.append("agent_id", agentId);
  if (category) params.append("category", category);
  const query = params.toString() ? `?${params.toString()}` : "";

  const res = await fetch(`${API_BASE}/api/memory${query}`);
  if (!res.ok) throw new Error("Failed to load agent memories");
  const data = await res.json();
  return data.memories || [];
}

export async function createMemory(payload: {
  agent_id?: string | null;
  category: MemoryCategory;
  key: string;
  value: string;
  provenance?: string;
  confidence?: number;
}): Promise<AgentMemoryItem> {
  const res = await fetch(`${API_BASE}/api/memory`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error("Failed to create memory");
  const data = await res.json();
  return data.memory;
}

export async function updateMemory(
  memoryId: string,
  updates: Partial<AgentMemoryItem>
): Promise<AgentMemoryItem> {
  const res = await fetch(`${API_BASE}/api/memory/${memoryId}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(updates),
  });
  if (!res.ok) throw new Error("Failed to update memory");
  const data = await res.json();
  return data.memory;
}

export async function deleteMemory(memoryId: string): Promise<void> {
  const res = await fetch(`${API_BASE}/api/memory/${memoryId}`, { method: "DELETE" });
  if (!res.ok) throw new Error("Failed to delete memory");
}
