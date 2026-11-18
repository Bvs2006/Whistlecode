import React, { useState, useEffect } from "react";
import { api } from "../../api/client";
import type { PluginManifest, ToolDefinition } from "../../types";

const integrations = [
  { name: "Gmail", icon: "✉", group: "Email", category: "Communication", description: "Find messages, summarize threads, and prepare replies.", tone: "gold" },
  { name: "Google Calendar", icon: "▦", group: "Calendar", category: "Productivity", description: "Review availability and prepare event changes for approval.", tone: "green" },
  { name: "Outlook", icon: "✉", group: "Email & calendar", category: "Communication", description: "Work with mail and meetings in your Outlook account.", tone: "blue" },
  { name: "Google Drive", icon: "▱", group: "Files", category: "File sharing", description: "Find, organize, and prepare updates to your documents.", tone: "green" },
  { name: "Slack", icon: "⌘", group: "Messages", category: "Communication", description: "Find conversations and prepare messages for review.", tone: "purple" },
  { name: "Notion", icon: "N", group: "Knowledge", category: "Productivity", description: "Search and organize notes, pages, and team knowledge.", tone: "neutral" },
];
const integrationCategories = ["All", "Productivity", "File sharing", "Communication"];

export const PluginManagerView: React.FC = () => {
  const [plugins, setPlugins] = useState<PluginManifest[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Tool tester state
  const [activeTestingTool, setActiveTestingTool] = useState<{
    pluginId: string;
    tool: ToolDefinition;
  } | null>(null);
  const [testArgs, setTestArgs] = useState<string>("{}");
  const [dryRun, setDryRun] = useState(true);
  const [testResult, setTestResult] = useState<any>(null);
  const [executing, setExecuting] = useState(false);
  const [toolApproval, setToolApproval] = useState<{ id: string; expiresAt: string } | null>(null);
  const [selectedIntegration, setSelectedIntegration] = useState<(typeof integrations)[number] | null>(null);
  const [integrationCategory, setIntegrationCategory] = useState("All");
  const [integrationStatus, setIntegrationStatus] = useState<"All applications" | "Connected" | "Disconnected">("All applications");
  const [integrationSearch, setIntegrationSearch] = useState("");

  // New plugin registration state
  const [showRegisterModal, setShowRegisterModal] = useState(false);
  const [newPluginJson, setNewPluginJson] = useState(`{
  "id": "plugin_custom_example",
  "name": "Custom Tool Definition",
  "version": "1.0.0",
  "description": "Metadata example; live execution requires an adapter",
  "icon": "🧩",
  "enabled": true,
  "tools": [
    {
      "name": "custom_action",
      "display_name": "Custom Action Metadata",
      "description": "Example tool registration without a connected execution adapter",
      "parameters_schema": {
        "channel": { "type": "string" },
        "message": { "type": "string" }
      },
      "risk_level": "medium"
    }
  ]
}`);

  useEffect(() => {
    loadPlugins();
  }, []);

  const loadPlugins = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.listPlugins();
      setPlugins(res.plugins || []);
    } catch (err: any) {
      setError(err.message || "Failed to load plugins");
    } finally {
      setLoading(false);
    }
  };

  const handleToggle = async (pluginId: string, currentEnabled: boolean) => {
    try {
      await api.togglePlugin(pluginId, !currentEnabled);
    setPlugins((current) => current.map(p => p.id === pluginId ? { ...p, enabled: !currentEnabled } : p));
    } catch (err: any) {
      alert("Error toggling plugin: " + err.message);
    }
  };

  const handleOpenToolTester = (pluginId: string, tool: ToolDefinition) => {
    setActiveTestingTool({ pluginId, tool });
    const defaultArgs: Record<string, any> = {};
    Object.entries(tool.parameters_schema || {}).forEach(([key, value]: [string, any]) => {
      const type = typeof value === "string" ? value : value?.type;
      defaultArgs[key] = key === "url" ? "https://httpbin.org/post" : type === "object" ? {} : type === "array" ? [] : type === "boolean" ? false : type === "number" || type === "integer" ? 0 : "test_value";
    });
    setTestArgs(JSON.stringify(defaultArgs, null, 2));
    setTestResult(null);
    setToolApproval(null);
  };

  const invalidateToolApproval = () => {
    if (toolApproval) void api.revokeApproval(toolApproval.id).catch(() => undefined);
    setToolApproval(null);
  };

  const handleExecuteTool = async () => {
    if (!activeTestingTool) return;
    setExecuting(true);
    setTestResult(null);
    try {
      const parsedArgs = JSON.parse(testArgs);
      if (dryRun) {
        setTestResult(await api.executePluginTool(activeTestingTool.pluginId, activeTestingTool.tool.name, parsedArgs, true));
      } else if (!toolApproval) {
        const res = await api.approvePluginTool(activeTestingTool.pluginId, activeTestingTool.tool.name, parsedArgs);
        setToolApproval({ id: res.approval.id, expiresAt: res.grant_expires_at });
        setTestResult({ plan: res.plan, message: "Review the exact call above, then dispatch it once." });
      } else {
        setTestResult(await api.dispatchApprovedPluginTool(activeTestingTool.pluginId, activeTestingTool.tool.name, parsedArgs, toolApproval.id));
        setToolApproval(null);
      }
    } catch (err: any) {
      setTestResult({ error: err.message });
    } finally {
      setExecuting(false);
    }
  };

  const handleRegisterPlugin = async () => {
    try {
      const manifest = JSON.parse(newPluginJson);
      await api.registerPlugin(manifest);
      setShowRegisterModal(false);
      loadPlugins();
    } catch (err: any) {
      alert("Invalid JSON manifest or registration error: " + err.message);
    }
  };

  const visibleIntegrations = integrations.filter((item) => {
    const matchesCategory = integrationCategory === "All" || item.category === integrationCategory;
    const matchesStatus = integrationStatus !== "Connected";
    const matchesSearch = `${item.name} ${item.group} ${item.description}`.toLowerCase().includes(integrationSearch.trim().toLowerCase());
    return matchesCategory && matchesStatus && matchesSearch;
  });

  return (
    <div className="card-panel">
      <div className="panel-header-row">
        <div>
          <h2>Plugins & Tool Resource Center</h2>
          <p className="subtitle">
            Built-in HTTP, file export, and notification adapters are available. Every live call needs a short-lived approval bound to the exact arguments. Metadata-only tools stay unavailable until an adapter is connected.
          </p>
        </div>
        <button
          className="btn btn-accent btn-sm"
          onClick={() => setShowRegisterModal(true)}
        >
          + Register Future Plugin / MCP Tool
        </button>
      </div>

      {error && <div className="error-banner">⚠️ {error}</div>}

      <section className="integration-catalog" aria-labelledby="integration-heading">
        <div className="integration-heading-row">
          <div>
            <span className="integration-eyebrow">YOUR EVERYDAY TOOLS</span>
            <h3 id="integration-heading">Integrations</h3>
            <p>Choose the tools you want to use with WhistleCode. Connections require secure account authorization before any data can be accessed.</p>
          </div>
          <span className="integration-count">{integrations.length} integrations</span>
        </div>
        <nav className="integration-category-tabs" aria-label="Integration categories">
          {integrationCategories.map((category) => <button type="button" key={category} className={integrationCategory === category ? "active" : ""} onClick={() => setIntegrationCategory(category)} aria-pressed={integrationCategory === category}>{category}</button>)}
        </nav>
        <div className="integration-toolbar">
          <div className="integration-status-tabs" role="group" aria-label="Filter integrations by connection status">
            {(["All applications", "Connected", "Disconnected"] as const).map((status) => <button type="button" key={status} className={integrationStatus === status ? "active" : ""} onClick={() => setIntegrationStatus(status)} aria-pressed={integrationStatus === status}>{status}</button>)}
          </div>
          <label className="integration-search"><span aria-hidden="true">⌕</span><input aria-label="Search integrations" value={integrationSearch} onChange={(event) => setIntegrationSearch(event.target.value)} placeholder="Search integrations" /></label>
        </div>
        {visibleIntegrations.length ? <div className="integration-grid">
          {visibleIntegrations.map((item, index) => (
            <article className="integration-card" key={item.name} style={{ animationDelay: `${index * 55}ms` }}>
              <div className="integration-card-top">
                <span className={`integration-app-icon integration-${item.tone}`} aria-hidden="true">{item.icon}</span>
                <span className="integration-status"><i /> Not connected</span>
              </div>
              <span className="integration-group">{item.group}</span>
              <h4>{item.name}</h4>
              <p>{item.description}</p>
              <button className="integration-connect" onClick={() => setSelectedIntegration(item)}>
                View connection details <span aria-hidden="true">↗</span>
              </button>
            </article>
          ))}
        </div> : <div className="integration-empty-state">{integrationStatus === "Connected" ? "No integrations are connected yet." : "No integrations match your search."}</div>}
        <div className="integration-footnote"><span aria-hidden="true">✳</span> Connections are not active yet. Account sign-in and secure authorization need to be configured before these apps can access your data.</div>
      </section>

      {selectedIntegration && (
        <div className="modal-backdrop" onClick={() => setSelectedIntegration(null)}>
          <div className="modal-card integration-detail-modal" role="dialog" aria-modal="true" aria-labelledby="integration-detail-title" onClick={(event) => event.stopPropagation()}>
            <div className="modal-header">
              <div className="integration-modal-title"><span className={`integration-app-icon integration-${selectedIntegration.tone}`}>{selectedIntegration.icon}</span><div><span className="integration-eyebrow">ACCOUNT CONNECTION</span><h3 id="integration-detail-title">{selectedIntegration.name}</h3></div></div>
              <button className="icon-btn" onClick={() => setSelectedIntegration(null)} aria-label="Close">✕</button>
            </div>
            <p className="subtitle">{selectedIntegration.description}</p>
            <div className="integration-setup-note"><strong>Connection setup is not available yet</strong><span>This workspace does not have a secure sign-in flow for {selectedIntegration.name} configured, so no account access has been granted.</span></div>
            <div className="modal-actions-row"><button className="btn btn-secondary" onClick={() => setSelectedIntegration(null)}>Close</button></div>
          </div>
        </div>
      )}

      <div className="plugins-grid">
        {loading ? (
          <div className="loading-state">Loading registered tool plugins...</div>
        ) : (
          plugins.map((plugin) => (
            <div
              key={plugin.id}
              className={`plugin-card ${!plugin.enabled ? "plugin-disabled" : ""}`}
            >
              <div className="plugin-card-header">
                <div className="plugin-icon-title">
                  <span className="plugin-icon">{plugin.icon}</span>
                  <div>
                    <h3>{plugin.name}</h3>
                    <small>v{plugin.version} • {plugin.author}</small>
                  </div>
                </div>
                <div className="plugin-toggle">
                  <label className="switch">
                    <input
                      type="checkbox"
                      checked={plugin.enabled}
                      onChange={() => handleToggle(plugin.id, plugin.enabled)}
                    />
                    <span className="slider round"></span>
                  </label>
                </div>
              </div>

              <p className="plugin-description">{plugin.description}</p>

              {/* TOOLS LIST */}
              <div className="plugin-tools-section">
                <h4>Exposed Tools ({plugin.tools.length})</h4>
                <div className="tool-chips-list">
                  {plugin.tools.map((t) => (
                    <div key={t.name} className="tool-chip-item">
                      <div className="tool-chip-info">
                        <strong>{t.display_name}</strong>
                        <code>{t.name}()</code>
                        <span className={`badge-risk badge-risk-${t.risk_level}`}>
                          {t.risk_level.toUpperCase()}
                        </span>
                      </div>
                      <button
                        className="btn btn-secondary btn-xs"
                        onClick={() => handleOpenToolTester(plugin.id, t)}
                        disabled={!plugin.enabled}
                      >
                        ⚡ Test Tool
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          ))
        )}
      </div>

      {/* TOOL TESTER MODAL */}
      {activeTestingTool && (
        <div className="modal-backdrop">
          <div className="modal-card">
            <div className="modal-header">
              <h3>⚡ Test Tool: {activeTestingTool.tool.display_name}</h3>
              <button className="icon-btn" onClick={() => { invalidateToolApproval(); setActiveTestingTool(null); }}>✕</button>
            </div>

            <p className="subtitle">{activeTestingTool.tool.description}</p>

            <div className="form-group">
              <label>Arguments (JSON schema compliant)</label>
              <textarea
                rows={5}
                value={testArgs}
                onChange={(e) => { invalidateToolApproval(); setTestArgs(e.target.value); }}
              />
            </div>

            <div className="checkbox-row">
              <label>
                <input
                  type="checkbox"
                  checked={dryRun}
                  onChange={(e) => { invalidateToolApproval(); setDryRun(e.target.checked); }}
                />
                <span>Dry-run mode — no live dispatch</span>
              </label>
            </div>

            <div className="modal-actions-row">
              <button
                className="btn btn-secondary"
                onClick={() => { invalidateToolApproval(); setActiveTestingTool(null); }}
              >
                Close
              </button>
              <button
                className="btn btn-primary"
                onClick={handleExecuteTool}
                disabled={executing}
              >
                {executing ? "Working…" : dryRun ? "Run dry preview" : toolApproval ? "Dispatch approved call once" : "Approve exact call"}
              </button>
            </div>

            {toolApproval && !dryRun && <div className="approval-scope-summary"><strong>One-time approval created</strong><span>Bound to the exact plugin, tool, and arguments above.</span><span>Expires {new Date(toolApproval.expiresAt).toLocaleString()}</span><span>Editing arguments cancels this approval.</span></div>}
            {testResult && (
              <div className="test-result-box" style={{ marginTop: "16px" }}>
                <h4>Execution Output:</h4>
                <pre>{JSON.stringify(testResult, null, 2)}</pre>
              </div>
            )}
          </div>
        </div>
      )}

      {/* REGISTER PLUGIN MODAL */}
      {showRegisterModal && (
        <div className="modal-backdrop">
          <div className="modal-card">
            <div className="modal-header">
              <h3>🧩 Register New Plugin / Tool Resource</h3>
              <button className="icon-btn" onClick={() => setShowRegisterModal(false)}>✕</button>
            </div>

            <p className="subtitle">
              Register plugin metadata and parameter schemas. Live calls require a supported built-in adapter and a fresh one-time approval.
            </p>

            <div className="form-group">
              <textarea
                rows={12}
                value={newPluginJson}
                onChange={(e) => setNewPluginJson(e.target.value)}
              />
            </div>

            <div className="modal-actions-row">
              <button
                className="btn btn-secondary"
                onClick={() => setShowRegisterModal(false)}
              >
                Cancel
              </button>
              <button
                className="btn btn-accent"
                onClick={handleRegisterPlugin}
              >
                + Register & Activate Plugin
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
