import React, { useState } from "react";
import { agentService, AgentDefinition, AgentProposalResponse } from "../../services/agentService";

interface Props {
  onClose: () => void;
  onAgentSaved: (agent: AgentDefinition) => void;
  initialPrompt?: string;
}

export const AgentBuilderModal: React.FC<Props> = ({ onClose, onAgentSaved, initialPrompt = "" }) => {
  const [goal, setGoal] = useState(initialPrompt);
  const [isSynthesizing, setIsSynthesizing] = useState(false);
  const [proposal, setProposal] = useState<AgentProposalResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Editable agent draft state
  const [agentName, setAgentName] = useState("");
  const [agentDesc, setAgentDesc] = useState("");
  const [instructions, setInstructions] = useState("");
  const [selectedModel, setSelectedModel] = useState("mistral:latest");
  const [assignedSkills, setAssignedSkills] = useState<string[]>([]);
  const [connectedIntegrations, setConnectedIntegrations] = useState<string[]>([]);
  const [cronExpression, setCronExpression] = useState("0 9 * * 1-5");
  const [isScheduled, setIsScheduled] = useState(false);
  const [longTermMemory, setLongTermMemory] = useState(true);
  const [userPreferences, setUserPreferences] = useState(true);
  const [saving, setSaving] = useState(false);

  const examplePrompts = [
    "I want an agent that checks my emails every morning, identifies invoices, downloads attachments and organizes them into folders.",
    "Monitor downloaded research papers in my staging area, classify by topic and date, and file them into structured subfolders.",
    "Visit competitor web portals every weekday, extract product pricing tables, and alert me to changes.",
    "Scan my GitHub repositories for unassigned bug reports and generate a daily triage summary."
  ];

  const handlePropose = async (promptToUse?: string) => {
    const text = (promptToUse || goal).trim();
    if (!text) {
      setError("Please describe what you want the agent to do.");
      return;
    }
    setError(null);
    setIsSynthesizing(true);

    try {
      const result = await agentService.proposeAgent(text);
      setProposal(result);
      const ag = result.agent;
      setAgentName(ag.name);
      setAgentDesc(ag.description);
      setInstructions(ag.instructions);
      setSelectedModel(ag.model);
      setAssignedSkills(ag.assigned_skills);
      setConnectedIntegrations(ag.connected_integrations);
      setIsScheduled(ag.trigger_config.type === "scheduled");
      setCronExpression(ag.trigger_config.cron_expression || "0 9 * * 1-5");
      setLongTermMemory(ag.memory_config.long_term_memory);
      setUserPreferences(ag.memory_config.user_preferences);
    } catch (e: any) {
      setError(e.message || "Failed to synthesize agent proposal.");
    } finally {
      setIsSynthesizing(false);
    }
  };

  const handleSave = async (activateImmediately: boolean = false) => {
    if (!proposal) return;
    setSaving(true);
    setError(null);

    try {
      const updatedAgent: AgentDefinition = {
        ...proposal.agent,
        name: agentName,
        description: agentDesc,
        instructions,
        model: selectedModel,
        assigned_skills: assignedSkills,
        connected_integrations: connectedIntegrations,
        memory_config: {
          enabled: true,
          long_term_memory: longTermMemory,
          user_preferences: userPreferences,
          task_context_window: 5,
        },
        trigger_config: {
          type: isScheduled ? "scheduled" : "manual",
          cron_expression: isScheduled ? cronExpression : undefined,
          timezone: "UTC",
          filter_criteria: {},
          enabled: isScheduled && activateImmediately,
        },
        status: activateImmediately ? "active" : "draft",
      };

      const saved = await agentService.saveAgent(updatedAgent);
      onAgentSaved(saved);
      onClose();
    } catch (e: any) {
      setError(e.message || "Failed to save agent.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true">
      <div className="agent-builder-modal card-panel">
        <div className="modal-header">
          <div>
            <h2>🤖 AI Agent Builder</h2>
            <p className="subtitle">
              Describe what you want your agent to accomplish in natural language. ChronicleAI will propose capabilities, skills, integrations, and permissions.
            </p>
          </div>
          <button type="button" className="close-btn" onClick={onClose} aria-label="Close modal">
            ✕
          </button>
        </div>

        {error && <div className="error-banner">⚠️ {error}</div>}

        {!proposal ? (
          /* Step 1: Natural Language Goal Input */
          <div className="agent-goal-input-step">
            <label className="input-label">Describe your agent's goal:</label>
            <textarea
              className="goal-textarea"
              rows={4}
              placeholder="e.g., I want an agent that checks my emails every morning, identifies invoices, downloads attachments and organizes them into folders."
              value={goal}
              onChange={(e) => setGoal(e.target.value)}
              disabled={isSynthesizing}
            />

            <div className="example-prompts-section">
              <span className="example-label">Or choose an inspiration template:</span>
              <div className="example-chips">
                {examplePrompts.map((p, idx) => (
                  <button
                    key={idx}
                    type="button"
                    className="btn-example-chip"
                    onClick={() => {
                      setGoal(p);
                      handlePropose(p);
                    }}
                    disabled={isSynthesizing}
                  >
                    💡 {p.slice(0, 75)}...
                  </button>
                ))}
              </div>
            </div>

            <div className="modal-footer-actions">
              <button type="button" className="btn btn-secondary" onClick={onClose}>
                Cancel
              </button>
              <button
                type="button"
                className="btn btn-primary btn-synthesize"
                onClick={() => handlePropose()}
                disabled={isSynthesizing || !goal.trim()}
              >
                {isSynthesizing ? "Analyzing Capabilities..." : "Synthesize Agent Proposal →"}
              </button>
            </div>
          </div>
        ) : (
          /* Step 2: Agent Configuration & Pre-Activation Safety Review */
          <div className="agent-proposal-review-step">
            <div className="understanding-banner">
              <span className="sparkle-icon">✨</span>
              <span>{proposal.understanding_summary}</span>
            </div>

            <div className="proposal-form-grid">
              {/* Agent Identity */}
              <div className="form-column">
                <div className="field-group">
                  <label>Agent Name</label>
                  <input
                    type="text"
                    value={agentName}
                    onChange={(e) => setAgentName(e.target.value)}
                  />
                </div>

                <div className="field-group">
                  <label>Description</label>
                  <textarea
                    rows={2}
                    value={agentDesc}
                    onChange={(e) => setAgentDesc(e.target.value)}
                  />
                </div>

                <div className="field-group">
                  <label>System Instructions</label>
                  <textarea
                    rows={4}
                    value={instructions}
                    onChange={(e) => setInstructions(e.target.value)}
                  />
                </div>

                <div className="field-row">
                  <div className="field-group">
                    <label>Inference Model</label>
                    <select
                      value={selectedModel}
                      onChange={(e) => setSelectedModel(e.target.value)}
                    >
                      <option value="mistral:latest">Mistral 7B (Local Ollama)</option>
                      <option value="llama3:latest">Llama 3 (Local Ollama)</option>
                      <option value="gpt-4o">GPT-4o</option>
                      <option value="claude-3-5-sonnet">Claude 3.5 Sonnet</option>
                    </select>
                  </div>

                  <div className="field-group">
                    <label>Initial Status</label>
                    <span className="status-badge-draft">Draft (Review Required)</span>
                  </div>
                </div>
              </div>

              {/* Skills, Integrations & Triggers */}
              <div className="form-column">
                <div className="field-group">
                  <label>Assigned Skills</label>
                  <div className="skills-badge-list">
                    {assignedSkills.map((skill, i) => (
                      <span key={i} className="skill-badge">
                        🧠 {skill}
                      </span>
                    ))}
                  </div>
                </div>

                <div className="field-group">
                  <label>Connected Integrations</label>
                  <div className="integrations-list">
                    {proposal.suggested_integrations.map((integ) => {
                      const isConnected = connectedIntegrations.includes(integ.id);
                      return (
                        <div
                          key={integ.id}
                          className={`integration-card ${isConnected ? "connected" : ""}`}
                          onClick={() => {
                            if (isConnected) {
                              setConnectedIntegrations(connectedIntegrations.filter((id) => id !== integ.id));
                            } else {
                              setConnectedIntegrations([...connectedIntegrations, integ.id]);
                            }
                          }}
                        >
                          <span className="integ-icon">{integ.icon}</span>
                          <span className="integ-name">{integ.name}</span>
                          <span className="integ-status">{isConnected ? "✓ Linked" : "+ Connect"}</span>
                        </div>
                      );
                    })}
                  </div>
                </div>

                <div className="field-group">
                  <label>Memory Configuration</label>
                  <div className="checkbox-row">
                    <label className="checkbox-label">
                      <input
                        type="checkbox"
                        checked={longTermMemory}
                        onChange={(e) => setLongTermMemory(e.target.checked)}
                      />
                      <span>Long-Term Memory Archive</span>
                    </label>
                    <label className="checkbox-label">
                      <input
                        type="checkbox"
                        checked={userPreferences}
                        onChange={(e) => setUserPreferences(e.target.checked)}
                      />
                      <span>User Preferences Memory</span>
                    </label>
                  </div>
                </div>

                <div className="field-group">
                  <label>Trigger & Automation Schedule</label>
                  <div className="trigger-schedule-box">
                    <label className="checkbox-label">
                      <input
                        type="checkbox"
                        checked={isScheduled}
                        onChange={(e) => setIsScheduled(e.target.checked)}
                      />
                      <span>Recurring Schedule Trigger</span>
                    </label>
                    {isScheduled && (
                      <div className="cron-input-row">
                        <label>CRON Expression:</label>
                        <input
                          type="text"
                          value={cronExpression}
                          onChange={(e) => setCronExpression(e.target.value)}
                          placeholder="0 9 * * 1-5"
                        />
                        <span className="cron-hint">Every weekday at 9:00 AM</span>
                      </div>
                    )}
                  </div>
                </div>

                <div className="field-group">
                  <label>Required Permission Scopes</label>
                  <div className="permission-tags-list">
                    {proposal.required_permissions.map((perm, i) => (
                      <code key={i} className="perm-tag">
                        🛡️ {perm}
                      </code>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            {/* Workflow Plan Steps Preview */}
            {proposal.agent.workflow_plan && proposal.agent.workflow_plan.steps.length > 0 && (
              <div className="workflow-plan-preview">
                <h4>Proposed Workflow Steps ({proposal.agent.workflow_plan.steps.length} Steps)</h4>
                <div className="steps-timeline">
                  {proposal.agent.workflow_plan.steps.map((st, i) => (
                    <div key={st.id || i} className="step-preview-row">
                      <span className="step-idx">{i + 1}</span>
                      <span className="step-action-tag">{st.action}</span>
                      <span className="step-name">{st.name}</span>
                      {st.requires_confirmation && (
                        <span className="hitl-pill">Requires Approval</span>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Safety & Confirmation Banner */}
            <div className="safety-review-notice">
              <span className="notice-icon">🔒</span>
              <div>
                <strong>Safety Governance Guardrail</strong>
                <p>
                  Newly synthesized agents start in <strong>Draft</strong> status. You can save the draft now, or review permissions and activate it immediately.
                </p>
              </div>
            </div>

            {/* Actions */}
            <div className="modal-footer-actions">
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => setProposal(null)}
                disabled={saving}
              >
                ← Back to Prompt
              </button>
              <button
                type="button"
                className="btn btn-outline"
                onClick={() => handleSave(false)}
                disabled={saving}
              >
                {saving ? "Saving..." : "Save as Draft"}
              </button>
              <button
                type="button"
                className="btn btn-primary btn-activate"
                onClick={() => {
                  if (window.confirm(`Activate agent '${agentName}'? It will be ready to execute tasks with the requested permissions.`)) {
                    handleSave(true);
                  }
                }}
                disabled={saving}
              >
                {saving ? "Activating..." : "✓ Confirm & Activate Agent"}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
