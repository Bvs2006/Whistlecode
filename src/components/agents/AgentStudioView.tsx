import React, { useState, useEffect } from "react";
import { agentService, AgentDefinition, AgentStatus } from "../../services/agentService";
import { AgentBuilderModal } from "./AgentBuilderModal";

interface Props {
  onRunAgent: (agent: AgentDefinition) => void;
  onNavigateToAskAI?: (prompt: string) => void;
}

export const AgentStudioView: React.FC<Props> = ({ onRunAgent, onNavigateToAskAI }) => {
  const [agents, setAgents] = useState<AgentDefinition[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<string>("all");
  const [isBuilderOpen, setIsBuilderOpen] = useState(false);
  const [editingAgent, setEditingAgent] = useState<AgentDefinition | null>(null);

  const fetchAgents = async () => {
    setLoading(true);
    const list = await agentService.listAgents();
    setAgents(list);
    setLoading(false);
  };

  useEffect(() => {
    fetchAgents();
  }, []);

  const handleToggleStatus = async (agent: AgentDefinition) => {
    try {
      if (agent.status === "active") {
        const updated = await agentService.pauseAgent(agent.id);
        setAgents((prev) => prev.map((a) => (a.id === updated.id ? updated : a)));
      } else {
        const updated = await agentService.activateAgent(agent.id);
        setAgents((prev) => prev.map((a) => (a.id === updated.id ? updated : a)));
      }
    } catch (e: any) {
      alert("Status change failed: " + e.message);
    }
  };

  const handleArchive = async (id: string, name: string) => {
    if (!window.confirm(`Are you sure you want to archive agent '${name}'?`)) return;
    try {
      await agentService.archiveAgent(id);
      setAgents((prev) => prev.filter((a) => a.id !== id));
    } catch (e: any) {
      alert("Archive failed: " + e.message);
    }
  };

  const filteredAgents = agents.filter((a) => {
    if (filter === "all") return true;
    return a.status === filter;
  });

  return (
    <div className="agent-studio-view card-panel">
      {/* Header & Controls */}
      <div className="studio-header-row">
        <div>
          <h2>🤖 AI Agent Studio</h2>
          <p className="subtitle">
            Create, configure, and monitor intelligent AI agents with custom skills, external integrations, and persistent memory.
          </p>
        </div>
        <button
          type="button"
          className="btn btn-primary btn-create-agent"
          onClick={() => {
            setEditingAgent(null);
            setIsBuilderOpen(true);
          }}
        >
          ＋ Create New Agent
        </button>
      </div>

      {/* Filter Tabs */}
      <div className="agent-filter-bar">
        {["all", "active", "draft", "paused"].map((tab) => (
          <button
            key={tab}
            type="button"
            className={`filter-tab-btn ${filter === tab ? "active" : ""}`}
            onClick={() => setFilter(tab)}
          >
            {tab.toUpperCase()} ({agents.filter((a) => (tab === "all" ? true : a.status === tab)).length})
          </button>
        ))}
      </div>

      {/* Agents Grid */}
      {loading ? (
        <div className="studio-loading">
          <span className="spinner" />
          <p>Loading agent workspace...</p>
        </div>
      ) : filteredAgents.length === 0 ? (
        <div className="studio-empty-state">
          <div className="empty-icon">🤖</div>
          <h3>No agents found in this category</h3>
          <p>Create your first autonomous agent with natural-language instructions.</p>
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => setIsBuilderOpen(true)}
          >
            ＋ Build an Agent Now
          </button>
        </div>
      ) : (
        <div className="agents-cards-grid">
          {filteredAgents.map((agent) => (
            <div key={agent.id} className={`agent-card status-${agent.status}`}>
              <div className="agent-card-top">
                <div className="agent-avatar-badge">
                  {agent.connected_integrations.includes("gmail")
                    ? "✉️"
                    : agent.connected_integrations.includes("github")
                    ? "🐙"
                    : agent.connected_integrations.includes("desktop")
                    ? "📁"
                    : "🤖"}
                </div>
                <div className="agent-title-block">
                  <h4>{agent.name}</h4>
                  <span className={`status-pill status-${agent.status}`}>
                    {agent.status.toUpperCase()}
                  </span>
                </div>
              </div>

              <p className="agent-description">{agent.description}</p>

              <div className="agent-meta-block">
                <div className="meta-row">
                  <span className="meta-label">Model:</span>
                  <code>{agent.model}</code>
                </div>

                {agent.trigger_config.type === "scheduled" && (
                  <div className="meta-row">
                    <span className="meta-label">Schedule:</span>
                    <span>⏰ {agent.trigger_config.cron_expression || "Daily"}</span>
                  </div>
                )}

                <div className="meta-row">
                  <span className="meta-label">Skills:</span>
                  <div className="mini-chips-row">
                    {agent.assigned_skills.slice(0, 3).map((s, i) => (
                      <span key={i} className="mini-chip">
                        {s}
                      </span>
                    ))}
                    {agent.assigned_skills.length > 3 && (
                      <span className="mini-chip more">+{agent.assigned_skills.length - 3}</span>
                    )}
                  </div>
                </div>

                <div className="meta-row">
                  <span className="meta-label">Integrations:</span>
                  <div className="mini-chips-row">
                    {agent.connected_integrations.map((integ, i) => (
                      <span key={i} className="mini-chip integ">
                        🔌 {integ}
                      </span>
                    ))}
                  </div>
                </div>
              </div>

              <div className="agent-card-actions">
                <button
                  type="button"
                  className="btn btn-primary btn-run-agent"
                  onClick={() => {
                    if (onNavigateToAskAI) {
                      onNavigateToAskAI(`Run agent '${agent.name}': ${agent.description}`);
                    } else {
                      onRunAgent(agent);
                    }
                  }}
                  title="Run this agent in Ask AI workspace"
                >
                  ▶ Run Agent
                </button>

                <button
                  type="button"
                  className="btn btn-outline"
                  onClick={() => handleToggleStatus(agent)}
                  title={agent.status === "active" ? "Pause agent" : "Activate agent"}
                >
                  {agent.status === "active" ? "⏸ Pause" : "✓ Activate"}
                </button>

                <button
                  type="button"
                  className="btn btn-icon-only"
                  onClick={() => handleArchive(agent.id, agent.name)}
                  title="Archive agent"
                >
                  🗑️
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Modal Builder */}
      {isBuilderOpen && (
        <AgentBuilderModal
          onClose={() => setIsBuilderOpen(false)}
          onAgentSaved={(newAgent) => {
            setAgents((prev) => [newAgent, ...prev.filter((a) => a.id !== newAgent.id)]);
          }}
        />
      )}
    </div>
  );
};
