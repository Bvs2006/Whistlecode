import React, { useState, useEffect } from "react";
import {
  fetchIntegrations,
  connectIntegration,
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

  const secretIntegrations = new Set(["integ_gemini", "integ_groq", "integ_openrouter", "integ_github"]);

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
  }, []);

  const handleConnect = async (integ: IntegrationDefinition) => {
    setNotice(null);
    try {
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
      setDownloadPath(`http://localhost:8000${path}`);
      setNotice(`${docKind.toUpperCase()} file created and verified.`);
    } catch (e) {
      setNotice(e instanceof Error ? e.message : "Document generation failed");
    } finally {
      setDocBusy(false);
    }
  };

  return (
    <div className="h-full flex flex-col bg-slate-950 text-slate-100 overflow-y-auto">
      {/* Header */}
      <div className="border-b border-slate-800 bg-slate-900/60 px-8 py-6">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-purple-500/10 border border-purple-500/30 text-purple-400">
              <Plug className="w-6 h-6" />
            </div>
            <div>
              <h1 className="text-2xl font-bold tracking-tight text-white flex items-center gap-2">
                Integration Hub & MCP Client
                <span className="text-xs px-2.5 py-0.5 rounded-full bg-purple-500/20 text-purple-300 font-medium border border-purple-500/30">
                  Secure Sandboxed Connectors
                </span>
              </h1>
              <p className="text-sm text-slate-400 mt-1">
                Connect external enterprise services, local desktop capabilities, and Model Context Protocol (MCP) servers with strict permission boundaries.
              </p>
            </div>
          </div>

          <button
            onClick={loadData}
            disabled={isLoading}
            className="flex items-center gap-2 px-3.5 py-2 bg-slate-900 hover:bg-slate-800 border border-slate-800 rounded-lg text-xs font-semibold text-slate-300 transition-colors self-start md:self-auto"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? "animate-spin" : ""}`} />
            Refresh Status
          </button>
        </div>
      </div>

      {/* Main Content (2 Columns) */}
      <div className="p-8 max-w-7xl mx-auto w-full flex-1 grid grid-cols-1 lg:grid-cols-12 gap-8">
        {/* Left Column: Integration Cards */}
        <div className="lg:col-span-7 space-y-4">
          <h2 className="text-xs font-bold uppercase tracking-wider text-slate-400 flex items-center gap-2">
            <Plug className="w-4 h-4 text-purple-400" />
            Connected & Available Services ({integrations.length})
          </h2>

          <div className="space-y-3">
            {integrations.map((integ) => {
              const isSelected = selectedInteg?.id === integ.id;
              const isConnected = integ.status === "connected";

              return (
                <div
                  key={integ.id}
                  onClick={() => setSelectedInteg(integ)}
                  className={`p-4 rounded-xl border transition-all cursor-pointer flex items-center justify-between gap-4 ${
                    isSelected
                      ? "bg-purple-950/20 border-purple-500/50 shadow-lg shadow-purple-950/40"
                      : "bg-slate-900/80 border-slate-800 hover:border-slate-700 hover:bg-slate-900"
                  }`}
                >
                  <div className="flex items-center gap-3.5">
                    <div className="p-2.5 rounded-lg bg-slate-800 border border-slate-700/60">
                      {getIcon(integ.icon)}
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <h3 className="font-semibold text-sm text-white">{integ.name}</h3>
                        {integ.is_mcp && (
                          <span className="text-[10px] px-2 py-0.2 rounded bg-purple-500/20 text-purple-300 border border-purple-500/40 font-mono font-semibold">
                            MCP Protocol
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-slate-400 line-clamp-1 mt-0.5">{integ.description}</p>
                    </div>
                  </div>

                  <div className="flex items-center gap-3 shrink-0">
                    {statusBadge(integ)}
                    <ChevronRight className={`w-4 h-4 transition-transform ${isSelected ? "text-purple-400 translate-x-0.5" : "text-slate-600"}`} />
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Right Column: Integration Inspector & Configuration */}
        <div className="lg:col-span-5">
          {selectedInteg ? (
            <div className="sticky top-6 bg-slate-900 border border-slate-800 rounded-2xl p-6 space-y-6">
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
                    Connect Service
                  </button>
                )}
              </div>

              <p className="text-xs text-slate-300 leading-relaxed">{selectedInteg.description}</p>
              {selectedInteg.status_detail && (
                <p className="text-xs text-slate-400">{selectedInteg.status_detail}</p>
              )}
              {secretIntegrations.has(selectedInteg.id) && (
                <label className="block space-y-1.5">
                  <span className="text-xs font-semibold text-slate-300">API token</span>
                  <input
                    type="password"
                    autoComplete="off"
                    value={apiKey}
                    onChange={(event) => setApiKey(event.target.value)}
                    placeholder={selectedInteg.has_credentials ? "A token is already stored. Enter a new one only to replace it." : "Paste the token. It stays on the server."}
                    className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100 outline-none focus:border-purple-400"
                  />
                </label>
              )}

              {/* Ping Connection Test */}
              <div className="p-4 bg-slate-950/70 border border-slate-800 rounded-xl space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-slate-300 flex items-center gap-1.5">
                    <Activity className="w-3.5 h-3.5 text-purple-400" />
                    Health & Latency Verification
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
                  <div className={`p-2.5 rounded text-xs flex items-start justify-between gap-3 ${
                    testResult.status === "success"
                      ? "bg-emerald-950/40 border border-emerald-800/40 text-emerald-300"
                      : "bg-amber-950/40 border border-amber-800/40 text-amber-200"
                  }`}>
                    <span>{testResult.message}{typeof testResult.latency_ms === "number" ? ` (${testResult.latency_ms} ms)` : ""}</span>
                    {testResult.status === "success" ? <CheckCircle2 className="w-4 h-4 text-emerald-400" /> : <AlertTriangle className="w-4 h-4" />}
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
        </div>
      </div>

      <section className="mx-auto mb-10 w-full max-w-7xl px-8">
        <div className="rounded-2xl border border-slate-800 bg-slate-900 p-6">
          <h2 className="text-sm font-semibold text-white">Local document tools</h2>
          <p className="mt-1 text-xs text-slate-400">
            Creates a real DOCX, PPTX, or PDF from the text you enter. Connect Local Desktop & Filesystem first. The file is written only inside the artifact folder.
          </p>
          <div className="mt-4 grid gap-3 md:grid-cols-2">
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
          <div className="mt-4 flex flex-wrap items-center gap-3">
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
