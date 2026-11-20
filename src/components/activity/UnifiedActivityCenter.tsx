import React, { useState, useEffect } from "react";
import type { AppSection } from "../../types";
import {
  fetchActivityDashboard,
  ActivityDashboardData,
} from "../../services/activityService";
import {
  Activity,
  Bot,
  PlayCircle,
  CheckCircle2,
  AlertOctagon,
  Clock,
  ShieldCheck,
  RefreshCw,
  Search,
  ExternalLink,
  ChevronRight,
  Filter,
  Layers,
  Plug,
  Zap,
} from "../icons/Icons";

interface Props {
  onInspectRun?: (runId: string) => void;
  onNavigateSection?: (section: AppSection) => void;
}

export const UnifiedActivityCenter: React.FC<Props> = ({
  onInspectRun,
  onNavigateSection,
}) => {
  const [data, setData] = useState<ActivityDashboardData | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [activeFilter, setActiveFilter] = useState<"ALL" | "RUNNING" | "COMPLETED" | "FAILED" | "APPROVAL">("ALL");
  const [searchQuery, setSearchQuery] = useState("");

  const loadDashboard = async () => {
    setIsLoading(true);
    try {
      const res = await fetchActivityDashboard();
      setData(res);
    } catch (e) {
      console.error(e);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadDashboard();
    const interval = setInterval(loadDashboard, 6000);
    return () => clearInterval(interval);
  }, []);

  const summary = data?.summary || {
    total_agents: 0,
    active_agents: 0,
    connected_integrations: 0,
    total_integrations: 0,
    active_automations: 0,
    completed_runs: 0,
    failed_runs: 0,
    running_runs: 0,
  };

  const runs = data?.recent_runs || [];

  const filteredRuns = runs.filter((r) => {
    if (activeFilter === "RUNNING") return ["RUNNING", "EXECUTING_STEP", "PRECHECK", "PENDING_CONFIRMATION"].includes(r.state);
    if (activeFilter === "COMPLETED") return ["COMPLETED", "SUCCESS"].includes(r.state);
    if (activeFilter === "FAILED") return ["FAILED", "STOPPED", "UNCERTAIN"].includes(r.state);
    if (activeFilter === "APPROVAL") return r.state === "CONFIRMATION_REQUIRED";
    return true;
  }).filter((r) => {
    if (!searchQuery) return true;
    return (
      r.id.toLowerCase().includes(searchQuery.toLowerCase()) ||
      r.workflow_id.toLowerCase().includes(searchQuery.toLowerCase()) ||
      r.mode.toLowerCase().includes(searchQuery.toLowerCase())
    );
  });

  return (
    <div className="feature-page activity-page h-full flex flex-col overflow-y-auto">
      {/* Top Banner */}
      <div className="feature-page-header border-b border-slate-800 px-8 py-6">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-purple-500/10 border border-purple-500/30 text-purple-400">
              <Activity className="w-6 h-6" />
            </div>
            <div>
              <h1 className="text-2xl font-bold tracking-tight text-white flex items-center gap-2">
                Activity
              </h1>
              <p className="text-sm text-slate-400 mt-1">
                Review runs, approvals, integrations, and automation events in one place.
              </p>
            </div>
          </div>

          <button
            onClick={loadDashboard}
            disabled={isLoading}
            className="flex items-center gap-2 px-3.5 py-2 bg-slate-900 hover:bg-slate-800 border border-slate-800 rounded-lg text-xs font-semibold text-slate-300 transition-colors self-start md:self-auto"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? "animate-spin" : ""}`} />
            Refresh Telemetry
          </button>
        </div>

        {/* Metric Cards Row */}
        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-3.5 mt-6">
          <div
            onClick={() => onNavigateSection?.("Agents")}
            className="p-3.5 rounded-xl bg-slate-900 border border-slate-800/80 hover:border-purple-500/50 cursor-pointer transition-all"
          >
            <div className="flex items-center justify-between text-slate-400 text-xs">
              <span>Active Agents</span>
              <Bot className="w-3.5 h-3.5 text-purple-400" />
            </div>
            <div className="text-xl font-bold text-white mt-1.5">
              {summary.active_agents} <span className="text-xs text-slate-500 font-normal">/ {summary.total_agents}</span>
            </div>
          </div>

          <div
            onClick={() => setActiveFilter("RUNNING")}
            className="p-3.5 rounded-xl bg-slate-900 border border-slate-800/80 hover:border-purple-500/50 cursor-pointer transition-all"
          >
            <div className="flex items-center justify-between text-slate-400 text-xs">
              <span>Running Tasks</span>
              <PlayCircle className="w-3.5 h-3.5 text-sky-400" />
            </div>
            <div className="text-xl font-bold text-sky-400 mt-1.5">{summary.running_runs}</div>
          </div>

          <div
            onClick={() => setActiveFilter("COMPLETED")}
            className="p-3.5 rounded-xl bg-slate-900 border border-slate-800/80 hover:border-purple-500/50 cursor-pointer transition-all"
          >
            <div className="flex items-center justify-between text-slate-400 text-xs">
              <span>Completed</span>
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
            </div>
            <div className="text-xl font-bold text-emerald-400 mt-1.5">{summary.completed_runs}</div>
          </div>

          <div
            onClick={() => setActiveFilter("FAILED")}
            className="p-3.5 rounded-xl bg-slate-900 border border-slate-800/80 hover:border-purple-500/50 cursor-pointer transition-all"
          >
            <div className="flex items-center justify-between text-slate-400 text-xs">
              <span>Failed / Stopped</span>
              <AlertOctagon className="w-3.5 h-3.5 text-rose-400" />
            </div>
            <div className="text-xl font-bold text-rose-400 mt-1.5">{summary.failed_runs}</div>
          </div>

          <div
            onClick={() => onNavigateSection?.("Integrations")}
            className="p-3.5 rounded-xl bg-slate-900 border border-slate-800/80 hover:border-purple-500/50 cursor-pointer transition-all"
          >
            <div className="flex items-center justify-between text-slate-400 text-xs">
              <span>Integrations</span>
              <Plug className="w-3.5 h-3.5 text-indigo-400" />
            </div>
            <div className="text-xl font-bold text-white mt-1.5">
              {summary.connected_integrations} <span className="text-xs text-slate-500 font-normal">/ {summary.total_integrations}</span>
            </div>
          </div>

          <div
            onClick={() => onNavigateSection?.("Automations")}
            className="p-3.5 rounded-xl bg-slate-900 border border-slate-800/80 hover:border-purple-500/50 cursor-pointer transition-all"
          >
            <div className="flex items-center justify-between text-slate-400 text-xs">
              <span>Automations</span>
              <Zap className="w-3.5 h-3.5 text-amber-400" />
            </div>
            <div className="text-xl font-bold text-white mt-1.5">{summary.active_automations}</div>
          </div>
        </div>
      </div>

      {/* Main Content (2-Column Grid) */}
      <div className="p-8 max-w-7xl mx-auto w-full flex-1 grid grid-cols-1 lg:grid-cols-12 gap-8">
        {/* Left: Execution Runs Table & Filter */}
        <div className="lg:col-span-8 space-y-4">
          <div className="flex flex-col sm:flex-row items-center justify-between gap-3">
            <div className="flex items-center gap-1 bg-slate-900 border border-slate-800 p-1 rounded-xl">
              {(["ALL", "RUNNING", "COMPLETED", "FAILED", "APPROVAL"] as const).map((f) => (
                <button
                  key={f}
                  onClick={() => setActiveFilter(f)}
                  className={`px-3 py-1 text-xs font-semibold rounded-lg transition-colors ${
                    activeFilter === f
                      ? "bg-purple-600 text-white"
                      : "text-slate-400 hover:text-slate-200"
                  }`}
                >
                  {f}
                </button>
              ))}
            </div>

            <div className="relative w-full sm:w-64">
              <Search className="w-3.5 h-3.5 absolute left-3 top-2.5 text-slate-500" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Filter runs by ID or workflow..."
                className="w-full pl-8 pr-3 py-1.5 bg-slate-900 border border-slate-800 rounded-lg text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-purple-500"
              />
            </div>
          </div>

          {/* Runs List */}
          <div className="space-y-2.5">
            {filteredRuns.length === 0 ? (
              <div className="p-8 text-center border border-dashed border-slate-800 rounded-2xl text-slate-500 text-xs">
                No execution runs match the current filter.
              </div>
            ) : (
              filteredRuns.map((r) => {
                const isCompleted = r.state === "COMPLETED";
                const isFailed = r.state === "FAILED" || r.state === "STOPPED";
                const isRunning = r.state === "RUNNING";

                return (
                  <div
                    key={r.id}
                    className="p-4 bg-slate-900 border border-slate-800 rounded-xl hover:border-slate-700 transition-all flex items-center justify-between gap-4"
                  >
                    <div className="flex items-center gap-3">
                      <div className="p-2 rounded-lg bg-slate-950 border border-slate-800">
                        {isCompleted && <CheckCircle2 className="w-4 h-4 text-emerald-400" />}
                        {isFailed && <AlertOctagon className="w-4 h-4 text-rose-400" />}
                        {isRunning && <PlayCircle className="w-4 h-4 text-sky-400 animate-pulse" />}
                        {!isCompleted && !isFailed && !isRunning && <Clock className="w-4 h-4 text-amber-400" />}
                      </div>

                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-mono text-xs font-semibold text-white">{r.workflow_id}</span>
                          <span className="text-[10px] px-2 py-0.2 rounded bg-slate-800 text-slate-400 uppercase font-mono">
                            {r.mode}
                          </span>
                        </div>
                        <div className="text-[11px] text-slate-500 flex items-center gap-2 mt-0.5">
                          <span>Run ID: {r.id.slice(0, 12)}...</span>
                          <span>•</span>
                          <span>{new Date(r.started_at).toLocaleTimeString()}</span>
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-3">
                      <span
                        className={`text-xs font-semibold px-2.5 py-0.5 rounded-full border ${
                          isCompleted
                            ? "bg-emerald-500/10 text-emerald-300 border-emerald-500/20"
                            : isFailed
                            ? "bg-rose-500/10 text-rose-300 border-rose-500/20"
                            : isRunning
                            ? "bg-sky-500/10 text-sky-300 border-sky-500/20"
                            : "bg-amber-500/10 text-amber-300 border-amber-500/20"
                        }`}
                      >
                        {r.state}
                      </span>

                      <button
                        onClick={() => onInspectRun?.(r.id)}
                        className="flex items-center gap-1 px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg text-xs font-medium transition-colors"
                      >
                        <span>Inspect in Monitor</span>
                        <ChevronRight className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* Right: Live Audit Stream & Ecosystem Status */}
        <div className="lg:col-span-4 space-y-6">
          {/* Recent Audit Timeline */}
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 space-y-4">
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400 flex items-center justify-between">
              <span className="flex items-center gap-2">
                <ShieldCheck className="w-4 h-4 text-emerald-400" />
                Immutable Audit Trail
              </span>
              <button
                onClick={() => onNavigateSection?.("Activity")}
                className="text-purple-400 hover:text-purple-300 lowercase text-xs"
              >
                View all &rarr;
              </button>
            </h3>

            <div className="space-y-3 max-h-96 overflow-y-auto pr-1">
              {(data?.recent_activity || []).map((log) => (
                <div
                  key={log.id}
                  className="p-3 rounded-xl bg-slate-950/60 border border-slate-800/80 space-y-1 text-xs"
                >
                  <div className="flex items-center justify-between text-slate-400">
                    <span className="font-semibold text-purple-300 font-mono text-[11px]">{log.event_type}</span>
                    <span className="text-[10px] text-slate-500">
                      {new Date(log.ts).toLocaleTimeString()}
                    </span>
                  </div>
                  <div className="text-slate-300 text-[11px] flex items-center justify-between">
                    <span>Actor: {log.actor}</span>
                    {log.workflow_id && <span className="font-mono text-slate-500">{log.workflow_id.slice(0, 10)}</span>}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
