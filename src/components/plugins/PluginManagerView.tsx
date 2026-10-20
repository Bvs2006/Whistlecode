import React, { useState, useEffect } from "react";
import { api } from "../../api/client";
import type { PluginManifest, ToolDefinition } from "../../types";

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

  // New plugin registration state
  const [showRegisterModal, setShowRegisterModal] = useState(false);
  const [newPluginJson, setNewPluginJson] = useState(`{
  "id": "plugin_slack_alerts",
  "name": "Slack Integration Plugin",
  "version": "1.0.0",
  "description": "Post task completion alerts to team Slack channels",
  "icon": "💬",
  "enabled": true,
  "tools": [
    {
      "name": "send_slack_message",
      "display_name": "Send Slack Notification",
      "description": "Sends rich message to Slack webhook",
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
      setPlugins(plugins.map(p => p.id === pluginId ? { ...p, enabled: !currentEnabled } : p));
    } catch (err: any) {
      alert("Error toggling plugin: " + err.message);
    }
  };

  const handleOpenToolTester = (pluginId: string, tool: ToolDefinition) => {
    setActiveTestingTool({ pluginId, tool });
    const defaultArgs: Record<string, any> = {};
    Object.keys(tool.parameters_schema || {}).forEach((k) => {
      defaultArgs[k] = k === "url" ? "https://httpbin.org/post" : "test_value";
    });
    setTestArgs(JSON.stringify(defaultArgs, null, 2));
    setTestResult(null);
  };

  const handleExecuteTool = async () => {
    if (!activeTestingTool) return;
    setExecuting(true);
    setTestResult(null);
    try {
      const parsedArgs = JSON.parse(testArgs);
      const res = await api.executePluginTool(
        activeTestingTool.pluginId,
        activeTestingTool.tool.name,
        parsedArgs,
        dryRun
      );
      setTestResult(res);
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

  return (
    <div className="card-panel">
      <div className="panel-header-row">
        <div>
          <h2>Plugins & Tool Resource Center</h2>
          <p className="subtitle">
            Future-proof AI tool architecture: Register external APIs, database tools, file exporters, and Model Context Protocol (MCP) agents.
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
              <button className="icon-btn" onClick={() => setActiveTestingTool(null)}>✕</button>
            </div>

            <p className="subtitle">{activeTestingTool.tool.description}</p>

            <div className="form-group">
              <label>Arguments (JSON schema compliant)</label>
              <textarea
                rows={5}
                value={testArgs}
                onChange={(e) => setTestArgs(e.target.value)}
              />
            </div>

            <div className="checkbox-row">
              <label>
                <input
                  type="checkbox"
                  checked={dryRun}
                  onChange={(e) => setDryRun(e.target.checked)}
                />
                <span>Dry-Run Simulation Mode (Verify policy & parameters without external side effects)</span>
              </label>
            </div>

            <div className="modal-actions-row">
              <button
                className="btn btn-secondary"
                onClick={() => setActiveTestingTool(null)}
              >
                Close
              </button>
              <button
                className="btn btn-primary"
                onClick={handleExecuteTool}
                disabled={executing}
              >
                {executing ? "Executing..." : dryRun ? "Run Dry Simulation" : "Dispatch Live Tool Call"}
              </button>
            </div>

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
              Paste standard Plugin Manifest JSON. Defines custom tools, risk tiers, and parameter schemas for future extensions.
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
