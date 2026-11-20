export interface IntegrationToolSchema {
  name: string;
  description: string;
  parameters?: Record<string, any>;
  required_permissions: string[];
}

export interface IntegrationDefinition {
  id: string;
  name: string;
  description: string;
  category: string;
  status: "connected" | "disconnected" | "error" | "configuring";
  icon: string;
  is_mcp: boolean;
  endpoint_or_server?: string;
  available_tools: IntegrationToolSchema[];
  required_permissions: string[];
  config_schema: Record<string, any>;
  has_credentials: boolean;
  masked_credential?: string;
  credential_source?: "vault" | "env" | "none";
  availability?: string;
  status_detail?: string;
  last_tested_at?: string;
  created_at: string;
  updated_at: string;
}

const API_BASE = (import.meta.env.VITE_API_BASE_URL || "").replace(/\/$/, "");

export async function fetchIntegrations(): Promise<IntegrationDefinition[]> {
  const res = await fetch(`${API_BASE}/api/integrations`);
  if (!res.ok) throw new Error("Failed to load integrations");
  const data = await res.json();
  return data.integrations || [];
}

export async function connectIntegration(
  integId: string,
  config?: Record<string, any>
): Promise<IntegrationDefinition> {
  const res = await fetch(`${API_BASE}/api/integrations/${integId}/connect`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ config }),
  });
  if (!res.ok) throw new Error(await readError(res, "Failed to connect integration"));
  const data = await res.json();
  return data.integration;
}

export async function startIntegrationOAuth(integId: string): Promise<string> {
  const res = await fetch(`${API_BASE}/api/integrations/${integId}/oauth/start`, { method: "POST" });
  if (!res.ok) throw new Error(await readError(res, "OAuth sign-in could not be started"));
  const data = await res.json();
  if (typeof data.authorization_url !== "string") throw new Error("OAuth provider did not return a sign-in URL.");
  return data.authorization_url;
}

export async function disconnectIntegration(integId: string): Promise<IntegrationDefinition> {
  const res = await fetch(`${API_BASE}/api/integrations/${integId}/disconnect`, {
    method: "POST",
  });
  if (!res.ok) throw new Error(await readError(res, "Failed to disconnect integration"));
  const data = await res.json();
  return data.integration;
}

export async function testIntegration(integId: string): Promise<any> {
  const res = await fetch(`${API_BASE}/api/integrations/${integId}/test`, {
    method: "POST",
  });
  if (!res.ok) throw new Error(await readError(res, "Integration check failed"));
  return res.json();
}

export async function executeTool(
  toolId: string,
  argumentsPayload: Record<string, unknown>,
  grantedPermissions: string[]
): Promise<{ status: string; result?: { download_path?: string; filename?: string; id?: string; analysis?: { row_count?: number } }; message?: string }> {
  const res = await fetch(`${API_BASE}/api/tools/${encodeURIComponent(toolId)}/execute`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ arguments: argumentsPayload, granted_permissions: grantedPermissions }),
  });
  if (!res.ok) throw new Error(await readError(res, "Tool execution failed"));
  return res.json();
}

async function readError(res: Response, fallback: string): Promise<string> {
  try {
    const body = await res.json();
    if (typeof body.detail === "string" && body.detail.trim()) return body.detail;
  } catch {
    /* The response body is not JSON. */
  }
  return fallback;
}
