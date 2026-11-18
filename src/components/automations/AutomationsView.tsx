import React, { useState, useEffect } from "react";
import {
  fetchAutomations,
  createAutomation,
  toggleAutomation,
  triggerAutomationNow,
  deleteAutomation,
  AutomationDefinition,
  TriggerType,
  AutomationStatus,
} from "../../services/automationService";
import {
  Clock,
  Zap,
  Play,
  Pause,
  Trash2,
  Plus,
  Calendar,
  Webhook,
  Mail,
  FilePlus,
  Layers,
  CheckCircle2,
  AlertTriangle,
  RefreshCw,
  Shield,
  Activity,
  ArrowRight,
} from "../icons/Icons";

export const AutomationsView: React.FC = () => {
  const [automations, setAutomations] = useState<AutomationDefinition[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [filterStatus, setFilterStatus] = useState<string>("ALL");
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [triggeringId, setTriggeringId] = useState<string | null>(null);
  const [notification, setNotification] = useState<string | null>(null);

  // New automation form state
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [agentId, setAgentId] = useState("agent_invoice_organizer");
  const [triggerType, setTriggerType] = useState<TriggerType>("scheduled");
  const [scheduleCron, setScheduleCron] = useState("0 9 * * 1-5");
  const [timezone, setTimezone] = useState("UTC");
  const [retryCount, setRetryCount] = useState(3);

  const loadData = async () => {
    setIsLoading(true);
    try {
      const data = await fetchAutomations(filterStatus === "ALL" ? undefined : filterStatus.toLowerCase());
      setAutomations(data);
    } catch (e) {
      console.error(e);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [filterStatus]);

  const handleToggle = async (auto: AutomationDefinition) => {
    try {
      const nextStatus: AutomationStatus = auto.status === "active" ? "paused" : "active";
      const updated = await toggleAutomation(auto.id, nextStatus);
      setAutomations((prev) => prev.map((a) => (a.id === auto.id ? updated : a)));
      setNotification(`Automation '${auto.name}' status set to ${nextStatus}.`);
    } catch (e) {
      alert("Failed to toggle automation status");
    }
  };

  const handleTriggerNow = async (auto: AutomationDefinition) => {
    setTriggeringId(auto.id);
    try {
      const res = await triggerAutomationNow(auto.id);
      setNotification(`Dispatched: ${res.message}`);
      loadData();
    } catch (e) {
      alert("Failed to trigger automation");
    } finally {
      setTriggeringId(null);
    }
  };

  const handleDelete = async (autoId: string) => {
    if (!confirm("Are you sure you want to delete this automation schedule?")) return;
    try {
      await deleteAutomation(autoId);
      setAutomations((prev) => prev.filter((a) => a.id !== autoId));
      setNotification("Automation schedule removed.");
    } catch (e) {
      alert("Failed to delete automation");
    }
  };

  const handleCreate = async () => {
    if (!name.trim()) return;
    try {
      const created = await createAutomation({
        name: name.trim(),
        description: description.trim(),
        agent_id: agentId.trim() || null,
        trigger_type: triggerType,
        schedule_cron: triggerType === "scheduled" ? scheduleCron : undefined,
        timezone,
        retry_count: retryCount,
        required_permissions: ["read_file", "write_file"],
      });
      setAutomations((prev) => [created, ...prev]);
      setShowCreateModal(false);
      setName("");
      setDescription("");
      setNotification(`Created automation '${created.name}' successfully.`);
    } catch (e) {
      alert("Failed to create automation");
    }
  };

  const getTriggerIcon = (type: TriggerType) => {
    switch (type) {
      case "scheduled":
        return <Clock className="w-4 h-4 text-purple-400" />;
      case "webhook":
        return <Webhook className="w-4 h-4 text-sky-400" />;
      case "new_email":
        return <Mail className="w-4 h-4 text-rose-400" />;
      case "file_created":
        return <FilePlus className="w-4 h-4 text-amber-400" />;
      default:
        return <Zap className="w-4 h-4 text-emerald-400" />;
    }
  };

  return (
    <div className="h-full flex flex-col bg-slate-950 text-slate-100 overflow-y-auto">
      {/* Header */}
      <div className="border-b border-slate-800 bg-slate-900/60 px-8 py-6">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-purple-500/10 border border-purple-500/30 text-purple-400">
              <Zap className="w-6 h-6" />
            </div>
            <div>
              <h1 className="text-2xl font-bold tracking-tight text-white flex items-center gap-2">
                Automations
              </h1>
              <p className="text-sm text-slate-400 mt-1">
                Run approved workflows on a schedule or in response to an event.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3 self-start md:self-auto">
            <button
              onClick={() => setShowCreateModal(true)}
              className="flex items-center gap-2 px-4 py-2 bg-purple-600 hover:bg-purple-500 text-white rounded-lg text-sm font-semibold transition-colors shadow-lg shadow-purple-600/30"
            >
              <Plus className="w-4 h-4" />
              New Automation
            </button>
          </div>
        </div>
      </div>

      {/* Main Container */}
      <div className="p-8 max-w-7xl mx-auto w-full flex-1 space-y-6">
        {/* Toast / Notification Banner */}
        {notification && (
          <div className="p-3.5 rounded-xl bg-purple-950/60 border border-purple-500/40 text-xs text-purple-200 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-400" />
              <span>{notification}</span>
            </div>
            <button onClick={() => setNotification(null)} className="text-slate-400 hover:text-white">
              Dismiss
            </button>
          </div>
        )}

        {/* Toolbar & Filters */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 bg-slate-900 border border-slate-800 p-1 rounded-xl">
            {["ALL", "ACTIVE", "PAUSED"].map((f) => (
              <button
                key={f}
                onClick={() => setFilterStatus(f)}
                className={`px-3.5 py-1.5 text-xs font-semibold rounded-lg transition-colors ${
                  filterStatus === f
                    ? "bg-purple-600 text-white"
                    : "text-slate-400 hover:text-slate-200"
                }`}
              >
                {f}
              </button>
            ))}
          </div>

          <div className="text-xs text-slate-400">
            Automations obey identical policy scopes and confirmation gates as manual execution.
          </div>
        </div>

        {/* Automations Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {automations.map((auto) => {
            const isActive = auto.status === "active";

            return (
              <div
                key={auto.id}
                className="bg-slate-900 border border-slate-800 rounded-2xl p-5 hover:border-slate-700 transition-all flex flex-col justify-between space-y-4"
              >
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <span className="flex items-center gap-1.5 text-xs px-2.5 py-0.5 rounded-full bg-slate-800 text-slate-300 font-medium capitalize">
                      {getTriggerIcon(auto.trigger_type)}
                      {auto.trigger_type.replace("_", " ")}
                    </span>

                    {isActive ? (
                      <span className="text-xs text-emerald-400 font-semibold bg-emerald-500/10 px-2.5 py-0.5 rounded-full border border-emerald-500/20">
                        Active
                      </span>
                    ) : (
                      <span className="text-xs text-amber-400 font-semibold bg-amber-500/10 px-2.5 py-0.5 rounded-full border border-amber-500/20">
                        Paused
                      </span>
                    )}
                  </div>

                  <h3 className="font-bold text-base text-white">{auto.name}</h3>
                  <p className="text-xs text-slate-400 mt-1 line-clamp-2 leading-relaxed">
                    {auto.description}
                  </p>

                  {/* Trigger Metadata */}
                  <div className="mt-4 p-3 bg-slate-950/60 border border-slate-800/80 rounded-xl space-y-1.5 text-xs">
                    {auto.schedule_cron && (
                      <div className="flex items-center justify-between text-slate-300">
                        <span className="text-slate-500">Cron Schedule:</span>
                        <span className="font-mono text-purple-300 font-semibold">{auto.schedule_cron}</span>
                      </div>
                    )}
                    {auto.agent_id && (
                      <div className="flex items-center justify-between text-slate-300">
                        <span className="text-slate-500">Target Agent:</span>
                        <span className="font-mono text-slate-300">{auto.agent_id}</span>
                      </div>
                    )}
                    <div className="flex items-center justify-between text-slate-300">
                      <span className="text-slate-500">Retry Policy:</span>
                      <span>{auto.retry_count} retries / {auto.retry_delay_seconds}s</span>
                    </div>
                  </div>

                  {/* Telemetry */}
                  <div className="mt-3 flex items-center justify-between text-xs text-slate-500">
                    <span>Runs: {auto.execution_count}</span>
                    <span>Failures: {auto.failure_count}</span>
                  </div>
                </div>

                {/* Actions */}
                <div className="pt-3 border-t border-slate-800 flex items-center justify-between gap-2">
                  <button
                    onClick={() => handleTriggerNow(auto)}
                    disabled={triggeringId === auto.id}
                    className="flex-1 py-1.5 px-3 bg-purple-600/20 hover:bg-purple-600/40 text-purple-200 border border-purple-500/30 rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors"
                  >
                    <Play className="w-3.5 h-3.5 fill-current" />
                    {triggeringId === auto.id ? "Firing..." : "Trigger Now"}
                  </button>

                  <button
                    onClick={() => handleToggle(auto)}
                    className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition-colors"
                    title={isActive ? "Pause Automation" : "Resume Automation"}
                  >
                    {isActive ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
                  </button>

                  <button
                    onClick={() => handleDelete(auto.id)}
                    className="p-1.5 text-slate-400 hover:text-rose-400 rounded-lg hover:bg-slate-800 transition-colors"
                    title="Delete Automation"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* MODAL: Create Automation */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-lg w-full p-6 space-y-4">
            <h3 className="text-lg font-bold text-white flex items-center gap-2">
              <Zap className="w-5 h-5 text-purple-400" />
              Configure Event-Driven Automation
            </h3>
            <p className="text-xs text-slate-400">
              Set schedules or triggers that autonomously execute an agent workflow with error retries.
            </p>

            <div className="space-y-3 text-xs">
              <div>
                <label className="text-slate-300 font-semibold block mb-1">Automation Name</label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. Daily Morning Invoices"
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-slate-100 focus:outline-none focus:border-purple-500"
                />
              </div>

              <div>
                <label className="text-slate-300 font-semibold block mb-1">Description</label>
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="What this automation achieves..."
                  rows={2}
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-slate-100 focus:outline-none focus:border-purple-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-slate-300 font-semibold block mb-1">Trigger Type</label>
                  <select
                    value={triggerType}
                    onChange={(e) => setTriggerType(e.target.value as TriggerType)}
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-slate-100 focus:outline-none focus:border-purple-500"
                  >
                    <option value="scheduled">Scheduled (Cron)</option>
                    <option value="webhook">Webhook Trigger</option>
                    <option value="new_email">Inbound Email</option>
                    <option value="file_created">File Created</option>
                    <option value="manual">Manual Only</option>
                  </select>
                </div>

                <div>
                  <label className="text-slate-300 font-semibold block mb-1">Assign Agent</label>
                  <input
                    type="text"
                    value={agentId}
                    onChange={(e) => setAgentId(e.target.value)}
                    placeholder="agent_invoice_organizer"
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-slate-100 focus:outline-none focus:border-purple-500"
                  />
                </div>
              </div>

              {triggerType === "scheduled" && (
                <div>
                  <label className="text-slate-300 font-semibold block mb-1">Cron Expression</label>
                  <input
                    type="text"
                    value={scheduleCron}
                    onChange={(e) => setScheduleCron(e.target.value)}
                    placeholder="0 9 * * 1-5"
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-purple-300 font-mono focus:outline-none focus:border-purple-500"
                  />
                  <span className="text-[10px] text-slate-500 mt-0.5 block">
                    Default: Weekdays at 9:00 AM UTC
                  </span>
                </div>
              )}
            </div>

            <div className="flex justify-end gap-3 pt-4 border-t border-slate-800">
              <button
                onClick={() => setShowCreateModal(false)}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg text-xs font-semibold"
              >
                Cancel
              </button>
              <button
                onClick={handleCreate}
                className="px-4 py-2 bg-purple-600 hover:bg-purple-500 text-white rounded-lg text-xs font-semibold shadow-lg shadow-purple-600/30"
              >
                Create Automation
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
