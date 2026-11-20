export interface SkillDefinition {
  id: string;
  name: string;
  description: string;
  category: "email" | "documents" | "web" | "devops" | "analysis" | "general";
  input_schema: Record<string, any>;
  output_schema: Record<string, any>;
  workflow_definition?: Record<string, any> | null;
  required_tools: string[];
  permission_requirements: string[];
  version: number;
  is_trusted: boolean;
  validation_status: "pending_validation" | "validated" | "rejected";
  execution_count: number;
  success_count: number;
  failure_count: number;
  created_at: string;
  updated_at: string;
}

const API_BASE = (import.meta.env.VITE_API_BASE_URL || "").replace(/\/$/, "");

export async function fetchSkills(category?: string): Promise<SkillDefinition[]> {
  const url = category ? `${API_BASE}/api/skills?category=${category}` : `${API_BASE}/api/skills`;
  const res = await fetch(url);
  if (!res.ok) throw new Error("Failed to load skills library");
  const data = await res.json();
  return data.skills || [];
}

export async function createSkill(payload: {
  name: string;
  description: string;
  category: string;
  required_tools: string[];
  permission_requirements: string[];
  is_trusted?: boolean;
}): Promise<SkillDefinition> {
  const res = await fetch(`${API_BASE}/api/skills`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error("Failed to create skill");
  const data = await res.json();
  return data.skill;
}

export async function convertWorkflowToSkill(payload: {
  workflow: Record<string, any>;
  skill_name: string;
  description?: string;
}): Promise<SkillDefinition> {
  const res = await fetch(`${API_BASE}/api/skills/convert-workflow`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error("Failed to convert workflow into skill");
  const data = await res.json();
  return data.skill;
}

export async function validateSkill(skillId: string, approved: boolean): Promise<SkillDefinition> {
  const res = await fetch(`${API_BASE}/api/skills/${skillId}/validate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ approved }),
  });
  if (!res.ok) throw new Error("Failed to validate skill");
  const data = await res.json();
  return data.skill;
}

export async function testSkill(skillId: string, inputs: Record<string, any> = {}): Promise<any> {
  const res = await fetch(`${API_BASE}/api/skills/${skillId}/test`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ inputs }),
  });
  if (!res.ok) throw new Error("Failed to test skill execution");
  return res.json();
}

export async function deleteSkill(skillId: string): Promise<void> {
  const res = await fetch(`${API_BASE}/api/skills/${skillId}`, { method: "DELETE" });
  if (!res.ok) throw new Error("Failed to delete skill");
}
