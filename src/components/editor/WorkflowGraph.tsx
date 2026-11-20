import React, { useEffect, useState } from "react";
import type { WorkflowDefinition, Step, ActionType, RiskLevel } from "../../types";

type Props = {
  workflow: WorkflowDefinition;
  onWorkflowChange: (updated: WorkflowDefinition) => void;
  onSelectStep?: (stepIndex: number) => void;
};

export const WorkflowGraph: React.FC<Props> = ({
  workflow,
  onWorkflowChange,
  onSelectStep,
}) => {
  const [selectedStepId, setSelectedStepId] = useState<string | null>(
    workflow.steps.length > 0 ? workflow.steps[0].id : null
  );
  const [argsText, setArgsText] = useState("{}");
  const [argsError, setArgsError] = useState<string | null>(null);

  useEffect(() => {
    setSelectedStepId(workflow.steps[0]?.id || null);
  }, [workflow.workflow_id, workflow.steps.length]);

  const selectedStep = workflow.steps.find((s) => s.id === selectedStepId);
  const selectedIndex = workflow.steps.findIndex((s) => s.id === selectedStepId);

  const handleUpdateSelected = (patch: Partial<Step>) => {
    if (selectedIndex === -1) return;
    const newSteps = [...workflow.steps];
    newSteps[selectedIndex] = { ...newSteps[selectedIndex], ...patch };
    onWorkflowChange({ ...workflow, steps: newSteps });
  };

  const handleAddStep = () => {
    const newId = `s_${crypto.randomUUID().slice(0, 8)}`;
    const newStep: Step = {
      id: newId,
      name: `Step ${workflow.steps.length + 1}: Click Element`,
      action: "click",
      target: { name: "New Element", role: "button" },
      args: {},
      risk: "low",
      requires_confirmation: false,
      idempotent: true,
      preconditions: [],
      postconditions: [],
      enabled: true,
      next_step_id: undefined,
    };
    const newSteps = [...workflow.steps, newStep];
    if (newSteps.length > 1) newSteps[newSteps.length - 2] = { ...newSteps[newSteps.length - 2], next_step_id: newId };
    onWorkflowChange({ ...workflow, steps: newSteps });
    setSelectedStepId(newId);
  };

  useEffect(() => {
    setArgsText(JSON.stringify(selectedStep?.args || {}, null, 2));
    setArgsError(null);
  }, [selectedStepId, workflow.workflow_id]);

  const handleDeleteStep = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const newSteps = workflow.steps.filter((s) => s.id !== id);
    onWorkflowChange({ ...workflow, steps: newSteps });
    if (selectedStepId === id) {
      setSelectedStepId(newSteps.length > 0 ? newSteps[0].id : null);
    }
  };

  const getActionIcon = (action: string) => {
    switch (action) {
      case "navigate": return "🌐";
      case "type": return "⌨️";
      case "click": return "👆";
      case "submit": return "🚀";
      case "select": return "▾";
      case "tool_call": return "🧩";
      case "branch": return "🔀";
      case "confirm_gate": return "🛡";
      default: return "⚙";
    }
  };

  return (
    <div className="workflow-graph-wrapper">
      <div className="graph-toolbar">
        <div className="graph-meta">
          <span className="badge-pill">Workflow steps</span>
          <span>Steps: <strong>{workflow.steps.length}</strong></span>
        </div>
        <button className="btn btn-secondary btn-sm" onClick={handleAddStep}>
          + Add step
        </button>
      </div>

      <div className="graph-split-view">
        {/* VISUAL SVG / NODE CANVAS */}
        <div className="graph-canvas-container">
          <div className="graph-nodes-stream">
            {/* START NODE */}
            <div className="graph-node-card node-start">
              <div className="node-icon">▶</div>
              <div className="node-info">
                <strong>START</strong>
                <small>{workflow.allowed_origins[0] || "No website selected"}</small>
              </div>
            </div>

            <div className="graph-connector-line" />

            {/* STEP NODES */}
            {workflow.steps.map((step, idx) => {
              const isSelected = step.id === selectedStepId;
              const hasCondition = !!step.condition;
              return (
                <React.Fragment key={step.id || idx}>
                  <div
                    className={`graph-node-card node-step ${isSelected ? "selected" : ""} ${!step.enabled ? "disabled" : ""} risk-${step.risk}`}
                    onClick={() => {
                      setSelectedStepId(step.id);
                      if (onSelectStep) onSelectStep(idx);
                    }}
                  >
                    <div className="node-header">
                      <span className="node-step-badge">{idx + 1}</span>
                      <span className="node-action-icon">{getActionIcon(step.action)}</span>
                      <span className="node-action-type">{step.action.toUpperCase()}</span>
                      <span className={`node-surface-badge surface-${step.surface || "browser"}`}>
                        {(step.surface || "browser") === "browser" ? "🌐" : (step.surface || "browser") === "desktop" ? "🖥️" : "📁"} {step.surface || "browser"}
                      </span>
                      <span className={`badge-risk badge-risk-${step.risk}`}>
                        {step.risk}
                      </span>
                    </div>

                    <div className="node-title">
                      {step.name}
                    </div>

                    {step.target && (
                      <div className="node-target">
                        🎯 {step.target.name || step.target.test_id || step.target.role || "Target"}
                        {step.target_candidates && step.target_candidates.length > 0 && (
                          <span className="node-candidate-count" title={`${step.target_candidates.length} ranked fallback target strategies`}>
                            {" "}· {step.target_candidates.length} fallbacks
                          </span>
                        )}
                      </div>
                    )}

                    {hasCondition && (
                      <div className="node-condition-tag">
                        ⚡ Rule: {step.condition}
                      </div>
                    )}

                    {step.requires_confirmation && (
                      <div className="node-gate-tag">
                        🛡 Pauses for your confirmation
                      </div>
                    )}

                    <div className="node-quick-actions">
                      <button
                        className="node-mini-btn"
                        title={step.enabled ? "Disable" : "Enable"}
                        onClick={(e) => {
                          e.stopPropagation();
                          const newSteps = [...workflow.steps];
                          newSteps[idx] = { ...step, enabled: !step.enabled };
                          onWorkflowChange({ ...workflow, steps: newSteps });
                        }}
                      >
                        {step.enabled ? "On" : "Off"}
                      </button>
                      <button
                        className="node-mini-btn btn-danger-text"
                        title="Delete"
                        onClick={(e) => handleDeleteStep(step.id, e)}
                      >
                        ✕
                      </button>
                    </div>
                  </div>

                  {idx < workflow.steps.length - 1 && (
                    <div className="graph-connector-line">
                      {hasCondition && <span className="branch-label">True / Evaluated</span>}
                    </div>
                  )}
                </React.Fragment>
              );
            })}

            <div className="graph-connector-line" />

            {/* END / POSTCONDITION NODE */}
            <div className="graph-node-card node-end">
              <div className="node-icon">🏁</div>
              <div className="node-info">
                <strong>VERIFIED POSTCONDITION</strong>
                <small>{workflow.final_postconditions[0]?.type || "Success Check"}</small>
              </div>
            </div>
          </div>
        </div>

        {/* NODE INSPECTOR / EDITOR PANEL */}
        <div className="graph-inspector-panel">
          {selectedStep ? (
            <div className="inspector-content">
              <div className="inspector-header">
                <h3>Node Inspector ({selectedStep.id})</h3>
                <span className={`badge-risk badge-risk-${selectedStep.risk}`}>
                  {selectedStep.risk.toUpperCase()} RISK
                </span>
              </div>

              <div className="form-group">
                <label>Step Name</label>
                <input
                  type="text"
                  value={selectedStep.name}
                  onChange={(e) => handleUpdateSelected({ name: e.target.value })}
                />
              </div>

              <div className="form-group">
                <label>Execution Surface</label>
                <select
                  value={selectedStep.surface || "browser"}
                  onChange={(e) => handleUpdateSelected({ surface: e.target.value as "browser" | "desktop" | "file" })}
                >
                  <option value="browser">🌐 Browser (Web Automation)</option>
                  <option value="desktop">🖥️ Desktop (OS & Window Native)</option>
                  <option value="file">📁 File (Local Workspace I/O)</option>
                </select>
              </div>

              <div className="form-group">
                <label>Action Type</label>
                <select
                  value={selectedStep.action}
                  onChange={(e) => handleUpdateSelected({ action: e.target.value as ActionType })}
                >
                  <option value="navigate">navigate (Page load)</option>
                  <option value="click">click (User action)</option>
                  <option value="type">type (Key/Form inputs)</option>
                  <option value="select">select (Dropdowns)</option>
                  <option value="submit">submit (High risk form save)</option>
                  <option value="tool_call">tool_call (Plugin / Webhook)</option>
                  <option value="confirm_gate">confirm_gate (Safety halt)</option>
                </select>
              </div>

              <div className="form-group">
                <label>Declared Risk Level</label>
                <select
                  value={selectedStep.risk}
                  onChange={(e) => handleUpdateSelected({ risk: e.target.value as RiskLevel })}
                >
                  <option value="low">Low (Read-only / navigation)</option>
                  <option value="medium">Medium (Form input / selection)</option>
                  <option value="high">High (Database commit / submit)</option>
                  <option value="critical">Critical (Financial / credentials)</option>
                </select>
              </div>

              <div className="form-group">
                <label>Reusable Condition / Branch Rule</label>
                <input
                  type="text"
                  placeholder="e.g. rating >= {{min_rating}} or price == '$$'"
                  value={selectedStep.condition || ""}
                  onChange={(e) => handleUpdateSelected({ condition: e.target.value || undefined })}
                />
                <small className="field-hint">SUGILITE-inferred condition learned during clarification.</small>
              </div>

              <div className="form-group">
                <label>Target Accessible Name / Test ID</label>
                <input
                  type="text"
                  value={selectedStep.target?.name || selectedStep.target?.test_id || ""}
                  onChange={(e) => {
                    const currentTarget = selectedStep.target || {};
                    handleUpdateSelected({
                      target: { ...currentTarget, name: e.target.value, test_id: e.target.value }
                    });
                  }}
                />
                {selectedStep.target_candidates && selectedStep.target_candidates.length > 0 && (
                  <div style={{ marginTop: "6px", display: "grid", gap: "4px" }}>
                    <small style={{ color: "var(--wc-muted)", fontSize: "10px", fontWeight: 600 }}>
                      Ranked Fallback Targets ({selectedStep.target_candidates.length}):
                    </small>
                    {selectedStep.target_candidates.map((c, cIdx) => (
                      <div key={cIdx} style={{ fontSize: "10px", padding: "3px 6px", background: "rgba(255,255,255,0.04)", borderRadius: "4px", border: "1px solid var(--wc-line)" }}>
                        #{cIdx + 1} <code>{c.strategy}</code>: {typeof c.value === "string" ? c.value : JSON.stringify(c.value)}
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="form-group">
                <label>Arguments (JSON / Parameters)</label>
                <textarea
                  rows={3}
                  value={argsText}
                  onChange={(e) => {
                    setArgsText(e.target.value);
                    setArgsError(null);
                  }}
                  onBlur={() => {
                    try {
                      const parsed = JSON.parse(argsText);
                      if (!parsed || Array.isArray(parsed) || typeof parsed !== "object") throw new Error("Arguments must be a JSON object.");
                      handleUpdateSelected({ args: parsed });
                      setArgsError(null);
                    } catch {
                      setArgsError("Enter a valid JSON object before leaving this field.");
                    }
                  }}
                />
                {argsError && <small className="field-hint" role="alert">{argsError}</small>}
              </div>

              <div className="form-group">
                <label>Learned Explanation / Notes</label>
                <input
                  type="text"
                  value={selectedStep.notes || ""}
                  onChange={(e) => handleUpdateSelected({ notes: e.target.value || undefined })}
                  placeholder="Notes on why step runs..."
                />
              </div>

              <div className="checkbox-row" style={{ marginTop: "12px" }}>
                <label>
                  <input
                    type="checkbox"
                    checked={selectedStep.requires_confirmation}
                    onChange={(e) => handleUpdateSelected({ requires_confirmation: e.target.checked })}
                  />
                  <span>Pause here for my confirmation</span>
                </label>
              </div>

              <div className="checkbox-row">
                <label>
                  <input
                    type="checkbox"
                    checked={selectedStep.enabled}
                    onChange={(e) => handleUpdateSelected({ enabled: e.target.checked })}
                  />
                  <span>Step Enabled</span>
                </label>
              </div>
            </div>
          ) : (
            <div className="empty-inspector">
              Select a node in the graph to inspect and edit its properties.
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
