import React, { useState } from "react";
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

  const selectedStep = workflow.steps.find((s) => s.id === selectedStepId);
  const selectedIndex = workflow.steps.findIndex((s) => s.id === selectedStepId);

  const handleUpdateSelected = (patch: Partial<Step>) => {
    if (selectedIndex === -1) return;
    const newSteps = [...workflow.steps];
    newSteps[selectedIndex] = { ...newSteps[selectedIndex], ...patch };
    onWorkflowChange({ ...workflow, steps: newSteps });
  };

  const handleAddStep = () => {
    const newId = `s${workflow.steps.length + 1}`;
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
    if (newSteps.length > 1) {
      newSteps[newSteps.length - 2].next_step_id = newId;
    }
    onWorkflowChange({ ...workflow, steps: newSteps });
    setSelectedStepId(newId);
  };

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
          <span className="badge-pill">Editable Graph Mode</span>
          <span>Nodes: <strong>{workflow.steps.length}</strong></span>
          <span>Hash: <code>{workflow.content_hash ? workflow.content_hash.slice(0, 14) + "..." : "Draft"}</code></span>
        </div>
        <button className="btn btn-secondary btn-sm" onClick={handleAddStep}>
          + Add Node
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
                <small>{workflow.allowed_origins[0] || "Isolated Context"}</small>
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
                      </div>
                    )}

                    {hasCondition && (
                      <div className="node-condition-tag">
                        ⚡ Rule: {step.condition}
                      </div>
                    )}

                    {step.requires_confirmation && (
                      <div className="node-gate-tag">
                        🛡 Policy Confirmation Gate
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
              </div>

              <div className="form-group">
                <label>Arguments (JSON / Parameters)</label>
                <textarea
                  rows={3}
                  value={JSON.stringify(selectedStep.args, null, 2)}
                  onChange={(e) => {
                    try {
                      const parsed = JSON.parse(e.target.value);
                      handleUpdateSelected({ args: parsed });
                    } catch {}
                  }}
                />
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
                  <span>Enforce Explicit Policy Confirmation Gate</span>
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
