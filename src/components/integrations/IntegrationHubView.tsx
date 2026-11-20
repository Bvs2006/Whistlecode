import React, { useState, useEffect } from "react";
import {
  fetchIntegrations,
  connectIntegration,
  startIntegrationOAuth,
  disconnectIntegration,
  testIntegration,
  executeTool,
  IntegrationDefinition,
} from "../../services/integrationService";
import {
  Plug,
  CheckCircle2,
  AlertTriangle,
  RefreshCw,
  Globe,
  Mail,
  HardDrive,
  Calendar,
  Github,
  Folder,
  Layers,
  Sparkles,
  Zap,
  Cpu,
  Shield,
  Activity,
  Terminal,
  ExternalLink,
  Power,
  ChevronRight,
  Info,
} from "../icons/Icons";

export const IntegrationHubView: React.FC = () => {
  const [integrations, setIntegrations] = useState<IntegrationDefinition[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [selectedInteg, setSelectedInteg] = useState<IntegrationDefinition | null>(null);
  const [testingId, setTestingId] = useState<string | null>(null);
  const [testResult, setTestResult] = useState<any | null>(null);
  const [apiKey, setApiKey] = useState("");
  const [notice, setNotice] = useState<string | null>(null);
  const [docTopic, setDocTopic] = useState("");
  const [docNotes, setDocNotes] = useState("");
  const [docKind, setDocKind] = useState<"docx" | "pptx" | "pdf">("docx");
  const [docBusy, setDocBusy] = useState(false);
  const [downloadPath, setDownloadPath] = useState<string | null>(null);
  const [integrationSearch, setIntegrationSearch] = useState("");
  const [integrationFilter, setIntegrationFilter] = useState<"all" | "connected" | "available">("all");

  const secretIntegrations = new Set(["integ_gemini", "integ_groq", "integ_grok", "integ_openrouter"]);
  const oauthIntegrations = new Set(["integ_gmail", "integ_gdrive", "integ_gcalendar", "integ_github", "integ_slack", "integ_microsoft"]);

  const loadData = async () => {
    setIsLoading(true);
    try {
      const data = await fetchIntegrations();
      setIntegrations(data);
      setSelectedInteg((current) => {
        if (!current) return data[0] || null;
        return data.find((item) => item.id === current.id) || data[0] || null;
      });
    } catch (e) {
      console.error(e);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadData();
    const handleOAuthComplete = () => { void loadData(); };
    window.addEventListener("message", handleOAuthComplete);
    return () => window.removeEventListener("message", handleOAuthComplete);
  }, []);

  const handleConnect = async (integ: IntegrationDefinition) => {
    setNotice(null);
    try {
      if (oauthIntegrations.has(integ.id)) {
        const authorizationUrl = await startIntegrationOAuth(integ.id);
        window.location.assign(authorizationUrl);
        return;
      }
      const updated = await connectIntegration(integ.id, apiKey.trim() ? { api_key: apiKey.trim() } : undefined);
      setApiKey("");
      setIntegrations((prev) => prev.map((i) => (i.id === integ.id ? updated : i)));
      setSelectedInteg(updated);
      setNotice(updated.status_detail || `${updated.name} is ${updated.status}. Run Test before treating it as connected.`);
    } catch (e) {
      setNotice(e instanceof Error ? e.message : "Failed to connect integration");
    }
  };

  const handleDisconnect = async (integ: IntegrationDefinition) => {
    try {
      const updated = await disconnectIntegration(integ.id);
      setIntegrations((prev) => prev.map((i) => (i.id === integ.id ? updated : i)));
      if (selectedInteg?.id === integ.id) setSelectedInteg(updated);
    } catch (e) {
      setNotice(e instanceof Error ? e.message : "Failed to disconnect integration");
    }
  };

  const handleTest = async (integ: IntegrationDefinition) => {
    setTestingId(integ.id);
    setTestResult(null);
    try {
      const res = await testIntegration(integ.id);
      setTestResult(res);
      setNotice(res.message || null);
      loadData();
    } catch (e) {
      setNotice(e instanceof Error ? e.message : "Connection test failed");
    } finally {
      setTestingId(null);
    }
  };

  const getIcon = (iconName: string) => {
    switch (iconName) {
      case "Globe":
        return <Globe className="w-5 h-5 text-sky-400" />;
      case "Mail":
        return <Mail className="w-5 h-5 text-red-400" />;
      case "Folder":
        return <Folder className="w-5 h-5 text-amber-400" />;
      case "HardDrive":
        return <HardDrive className="w-5 h-5 text-blue-400" />;
      case "Calendar":
        return <Calendar className="w-5 h-5 text-emerald-400" />;
      case "Github":
        return <Github className="w-5 h-5 text-slate-200" />;
      case "Layers":
        return <Layers className="w-5 h-5 text-purple-400" />;
      case "Spark":
        return <Sparkles className="w-5 h-5 text-sky-300" />;
      case "Zap":
        return <Zap className="w-5 h-5 text-amber-300" />;
      case "Cpu":
        return <Cpu className="w-5 h-5 text-emerald-300" />;
      case "Route":
        return <Activity className="w-5 h-5 text-indigo-300" />;
      default:
        return <Plug className="w-5 h-5 text-indigo-400" />;
    }
  };

  const statusBadge = (integ: IntegrationDefinition) => {
    if (integ.status === "connected") {
      return (
        <span className="flex items-center gap-1.5 text-xs text-emerald-400 font-semibold bg-emerald-500/10 px-2.5 py-1 rounded-full border border-emerald-500/20">
          <CheckCircle2 className="w-3.5 h-3.5" />
          Connected
        </span>
      );
    }
    if (integ.status === "error") {
      return (
        <span className="flex items-center gap-1.5 text-xs text-rose-300 font-semibold bg-rose-500/10 px-2.5 py-1 rounded-full border border-rose-500/20">
          <AlertTriangle className="w-3.5 h-3.5" />
          Check failed
        </span>
      );
    }
    if (integ.status === "configuring") {
      return (
        <span className="flex items-center gap-1.5 text-xs text-amber-300 font-semibold bg-amber-500/10 px-2.5 py-1 rounded-full border border-amber-500/20">
          Needs test
        </span>
      );
    }
    return (
      <span className="flex items-center gap-1.5 text-xs text-slate-400 font-medium bg-slate-800 px-2.5 py-1 rounded-full">
        Not connected
      </span>
    );
  };

  const filesystemReady = integrations.some((item) => item.id === "integ_local_desktop" && item.status === "connected");
  const filteredIntegrations = integrations.filter((integ) => {
    const matchesSearch = `${integ.name} ${integ.description} ${integ.category}`.toLowerCase().includes(integrationSearch.trim().toLowerCase());
    const matchesFilter =
      integrationFilter === "all" ||
      (integrationFilter === "connected" && integ.status === "connected") ||
      (integrationFilter === "available" && integ.status !== "connected");
    return matchesSearch && matchesFilter;
  });
  const connectedCount = integrations.filter((integ) => integ.status === "connected").length;

  const handleGenerate = async () => {
    setNotice(null);
    setDownloadPath(null);
    setDocBusy(true);
    try {
      const bullets = docNotes.split("\n").map((line) => line.trim()).filter(Boolean);
      const result = await executeTool(
        `doc.generate_${docKind}`,
        { topic: docTopic.trim(), bullets },
        ["write_file"]
      );
      const path = result.result?.download_path;
      if (!path) throw new Error("The generator did not return a file.");
      setDownloadPath(path);
      setNotice(`${docKind.toUpperCase()} file created and verified.`);
    } catch (e) {
      setNotice(e instanceof Error ? e.message : "Document generation failed");
    } finally {
      setDocBusy(false);
    }
  };

  return (
    <div className="feature-page integration-page">
      {/* Header */}
      <header className="integration-page-header">
        <div className="integration-heading">
          <div className="integration-heading-icon"><Plug /></div>
          <div>
            <span className="integration-eyebrow">CONNECTIONS</span>
            <h1>Integration Hub</h1>
            <p>Manage providers, secure credentials, and connected tools.</p>
          </div>
        </div>
        <div className="integration-header-actions">
          <div className="integration-health-summary">
            <span className={connectedCount ? "live" : ""}>{connectedCount}</span>
            <small>connected</small>
          </div>
          <button type="button" onClick={loadData} disabled={isLoading} className="integration-refresh">
            <RefreshCw className={isLoading ? "is-spinning" : ""} />
            <span>{isLoading ? "Checking" : "Refresh"}</span>
          </button>
        </div>
      </header>

      {/* Main Content (2 Columns) */}
      <div className="integration-layout">
        {/* Left Column: Integration Cards */}
        <section className="integration-catalog-list" aria-label="Available integrations">
          <div className="integration-list-toolbar">
            <label className="integration-search-field">
              <span aria-hidden="true">⌕</span>
              <input
                value={integrationSearch}
                onChange={(event) => setIntegrationSearch(event.target.value)}
                placeholder="Search integrations"
                aria-label="Search integrations"
              />
            </label>
            <div className="integration-filter-tabs" role="group" aria-label="Filter integrations">
              {([
                ["all", "All"],
                ["connected", "Connected"],
                ["available", "Available"],
              ] as const).map(([value, label]) => (
                <button type="button" key={value} className={integrationFilter === value ? "active" : ""} onClick={() => setIntegrationFilter(value)} aria-pressed={integrationFilter === value}>
                  {label}
                </button>
              ))}
            </div>
          </div>

          <div className="integration-card-list">
            {filteredIntegrations.map((integ) => {
              const isSelected = selectedInteg?.id === integ.id;
              const isConnected = integ.status === "connected";

              return (
                <button
                  key={integ.id}
                  type="button"
                  onClick={() => setSelectedInteg(integ)}
                  className={`integration-catalog-card ${isSelected ? "selected" : ""}`}
                  aria-pressed={isSelected}
                >
                  <div className="integration-catalog-card-main">
                    <div className="integration-app-avatar">
                      {getIcon(integ.icon)}
                    </div>
                    <div className="integration-catalog-copy">
                      <div className="integration-card-title-row">
                        <h3>{integ.name}</h3>
                        {integ.is_mcp && (
                          <span className="integration-mcp-label">MCP</span>
                        )}
                      </div>
                      <p>{integ.description}</p>
                    </div>
                  </div>

                  <div className="integration-card-status">
                    {statusBadge(integ)}
                    <ChevronRight className="integration-chevron" />
                  </div>
                </button>
              );
            })}
            {!filteredIntegrations.length && (
              <div className="integration-empty-state">
                <span>⌕</span>
                <strong>No integrations found</strong>
                <p>Try another search or connection filter.</p>
              </div>
            )}
          </div>
        </section>

        {/* Right Column: Integration Inspector & Configuration */}
        <aside className="integration-inspector-column">
          {selectedInteg ? (
            <div className="integration-inspector">
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div className="p-3 rounded-xl bg-slate-800 border border-slate-700">
                    {getIcon(selectedInteg.icon)}
                  </div>
                  <div>
                    <h3 className="text-lg font-bold text-white">{selectedInteg.name}</h3>
                    <div className="flex items-center gap-2 text-xs text-slate-400 mt-0.5">
                      <span className="font-mono text-purple-300">{selectedInteg.endpoint_or_server}</span>
                    </div>
                  </div>
                </div>

                {selectedInteg.status === "connected" ? (
                  <button
                    onClick={() => handleDisconnect(selectedInteg)}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-rose-950/40 hover:bg-rose-900/60 text-rose-300 border border-rose-800/40 rounded-lg text-xs font-semibold transition-colors"
                  >
                    <Power className="w-3.5 h-3.5" />
                    Disconnect
                  </button>
                ) : (
                  <button
                    onClick={() => handleConnect(selectedInteg)}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-purple-600 hover:bg-purple-500 text-white rounded-lg text-xs font-semibold transition-colors shadow-lg shadow-purple-600/30"
                  >
                    <Plug className="w-3.5 h-3.5" />
                    {oauthIntegrations.has(selectedInteg.id) ? "Sign in to connect" : "Connect Service"}
                  </button>
                )}
              </div>

              <p className="text-xs text-slate-300 leading-relaxed">{selectedInteg.description}</p>
              {selectedInteg.status_detail && (
                <p className="text-xs text-slate-400">{selectedInteg.status_detail}</p>
              )}
              {secretIntegrations.has(selectedInteg.id) && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-slate-300">API Key / Token</span>
                    {selectedInteg.credential_source && (
                      <span className={`text-[10px] px-2 py-0.5 rounded font-mono ${
                        selectedInteg.credential_source === "vault"
                          ? "bg-purple-900/60 text-purple-300 border border-purple-700/50"
                          : "bg-slate-800 text-slate-400 border border-slate-700"
                      }`}>
                        {selectedInteg.credential_source === "vault"
                          ? "Vault (Overrides .env)"
                          : "From .env"}
                      </span>
                    )}
                  </div>
                  {selectedInteg.has_credentials && (
                    <div className="flex items-center justify-between p-2 rounded bg-slate-900/80 border border-slate-800 text-xs">
                      <span className="font-mono text-slate-400">
                        {selectedInteg.masked_credential || "••••••••"}
                      </span>
                      {selectedInteg.credential_source === "vault" && (
                        <button
                          type="button"
                          onClick={() => handleDisconnect(selectedInteg)}
                          className="text-[11px] text-rose-400 hover:text-rose-300 underline"
                        >
                          Remove Vault Key
                        </button>
                      )}
                    </div>
                  )}
                  <label className="block space-y-1">
                    <span className="text-[11px] text-slate-400">
                      {selectedInteg.has_credentials ? "Enter new token to replace existing:" : "Enter API token (stored securely on server):"}
                    </span>
                    <input
                      type="password"
                      autoComplete="off"
                      value={apiKey}
                      onChange={(event) => setApiKey(event.target.value)}
                      placeholder={selectedInteg.has_credentials ? "Paste new key to override..." : "Paste API key..."}
                      className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100 outline-none focus:border-purple-400 font-mono"
                    />
                  </label>
                  <p className="text-[10px] text-slate-500">
                    Rule: UI Vault keys override .env file keys. Secrets are encrypted and never returned to the frontend.
                  </p>
                </div>
              )}

              {/* Ping Connection Test */}
              <div className="p-4 bg-slate-950/70 border border-slate-800 rounded-xl space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-slate-300 flex items-center gap-1.5">
                    <Activity className="w-3.5 h-3.5 text-purple-400" />
                    Health & Live Connection Verification
                  </span>
                  <button
                    onClick={() => handleTest(selectedInteg)}
                    disabled={testingId === selectedInteg.id}
                    className="text-xs text-purple-400 hover:text-purple-300 font-medium underline"
                  >
                    {testingId === selectedInteg.id ? "Pinging..." : "Test Connection"}
                  </button>
                </div>

                {testResult && testResult.integration_id === selectedInteg.id && (
                  <div className={`p-2.5 rounded text-xs flex flex-col gap-1.5 ${
                    testResult.status === "success"
                      ? "bg-emerald-950/40 border border-emerald-800/40 text-emerald-300"
                      : "bg-rose-950/40 border border-rose-800/40 text-rose-200"
                  }`}>
                    <div className="flex items-start justify-between gap-3">
                      <span>{testResult.message}{typeof testResult.latency_ms === "number" ? ` (${testResult.latency_ms} ms)` : ""}</span>
                      {testResult.status === "success" ? <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" /> : <AlertTriangle className="w-4 h-4 shrink-0" />}
                    </div>
                    {testResult.scopes && testResult.scopes.length > 0 && (
                      <div className="text-[11px] text-slate-300 flex items-center gap-1 mt-1">
                        <span className="font-semibold">Token Scopes:</span>
                        <div className="flex flex-wrap gap-1">
                          {testResult.scopes.map((scope: string) => (
                            <span key={scope} className="px-1.5 py-0.5 bg-slate-800 border border-slate-700 rounded text-[10px] font-mono text-purple-300">
                              {scope}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}
                    {testResult.models && testResult.models.length > 0 && (
                      <div className="text-[11px] text-slate-300 flex items-center gap-1 mt-1">
                        <span className="font-semibold">Detected Models:</span>
                        <div className="flex flex-wrap gap-1">
                          {testResult.models.map((m: string) => (
                            <span key={m} className="px-1.5 py-0.5 bg-slate-800 border border-slate-700 rounded text-[10px] font-mono text-slate-300">
                              {m}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Available Tools */}
              <div className="space-y-3">
                <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400 flex items-center gap-2">
                  <Terminal className="w-3.5 h-3.5 text-purple-400" />
                  Discovered Capabilities ({selectedInteg.available_tools.length})
                </h4>

                <div className="space-y-2 max-h-52 overflow-y-auto pr-1">
                  {selectedInteg.available_tools.map((tool) => (
                    <div
                      key={tool.name}
                      className="p-3 rounded-lg bg-slate-950/50 border border-slate-800/80 space-y-1"
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-mono text-xs text-purple-300 font-semibold">{tool.name}</span>
                        <div className="flex gap-1">
                          {tool.required_permissions.map((p) => (
                            <span key={p} className="text-[10px] bg-slate-800 text-slate-400 px-1.5 py-0.2 rounded">
                              {p}
                            </span>
                          ))}
                        </div>
                      </div>
                      <p className="text-[11px] text-slate-400 leading-normal">{tool.description}</p>
                    </div>
                  ))}
                </div>
              </div>

              {/* Security & Permissions */}
              <div className="pt-4 border-t border-slate-800 space-y-2">
                <div className="flex items-center gap-2 text-xs text-slate-400">
                  <Shield className="w-3.5 h-3.5 text-emerald-400" />
                  <span>
                    Credential Vault: All tokens & keys are securely stored server-side. Frontend never receives raw secrets.
                  </span>
                </div>
              </div>
            </div>
          ) : (
            <div className="h-full flex items-center justify-center p-8 border border-dashed border-slate-800 rounded-2xl text-slate-500 text-sm">
              Select an integration to inspect tools and configuration.
            </div>
          )}
        </aside>
      </div>

      <section className="integration-document-section">
        <div className="integration-document-card">
          <div className="integration-document-heading">
            <div>
              <span className="integration-eyebrow">LOCAL FILES</span>
              <h2>Document tools</h2>
            </div>
            <span className={filesystemReady ? "integration-local-ready" : "integration-local-disabled"}>{filesystemReady ? "Desktop connected" : "Desktop not connected"}</span>
          </div>
          <p>
            Creates a real DOCX, PPTX, or PDF from the text you enter. Connect Local Desktop & Filesystem first. The file is written only inside the artifact folder.
          </p>
          <div className="integration-document-grid">
            <input
              value={docTopic}
              onChange={(event) => setDocTopic(event.target.value)}
              placeholder="Topic or title"
              className="rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100 outline-none focus:border-purple-400"
            />
            <select
              value={docKind}
              onChange={(event) => setDocKind(event.target.value as "docx" | "pptx" | "pdf")}
              className="rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100"
            >
              <option value="docx">Word document</option>
              <option value="pptx">PowerPoint</option>
              <option value="pdf">PDF notes</option>
            </select>
            <textarea
              value={docNotes}
              onChange={(event) => setDocNotes(event.target.value)}
              placeholder="One note per line"
              className="min-h-24 rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100 outline-none focus:border-purple-400 md:col-span-2"
            />
          </div>
          <div className="integration-document-actions">
            <button
              type="button"
              onClick={handleGenerate}
              disabled={docBusy || !docTopic.trim() || !filesystemReady}
              className="rounded-lg bg-purple-600 px-3 py-2 text-xs font-semibold text-white disabled:cursor-not-allowed disabled:bg-slate-700"
            >
              {docBusy ? "Writing file..." : "Generate file"}
            </button>
            {!filesystemReady && <span className="text-xs text-slate-400">Local Desktop is not connected, so generation stays disabled.</span>}
            {downloadPath && <a className="text-xs font-semibold text-emerald-300 underline" href={downloadPath}>Download verified file</a>}
          </div>
        </div>
      </section>
    </div>
  );
};
