import React, { useState } from "react";
import { api } from "../../api/client";
import { WorkflowGraph } from "./WorkflowGraph";
import type { WorkflowDefinition, Step, ParameterDefinition, ActionType, RiskLevel } from "../../types";

type Props = {
  workflow: WorkflowDefinition;
  onWorkflowSaved: (wf: WorkflowDefinition) => void;
  onNavigateToApprove: () => void;
};

export const WorkflowEditor: React.FC<Props> = ({
  workflow: initialWorkflow,
  onWorkflowSaved,
  onNavigateToApprove,
}) => {
  const [workflow, setWorkflow] = useState<WorkflowDefinition>(initialWorkflow);
  const [changeSummary, setChangeSummary] = useState("Tuned graph nodes and conditions");
  const [saving, setSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [activeTab, setActiveTab] = useState<"graph" | "steps" | "parameters" | "conditions" | "json">("graph");

  const updateStep = (index: number, updated: Partial<Step>) => {
    const newSteps = [...workflow.steps];
    newSteps[index] = { ...newSteps[index], ...updated };
    setWorkflow({ ...workflow, steps: newSteps });
  };

  const toggleStepEnabled = (index: number) => {
    updateStep(index, { enabled: !workflow.steps[index].enabled });
  };

  const moveStep = (index: number, direction: "up" | "down") => {
    const targetIdx = direction === "up" ? index - 1 : index + 1;
    if (targetIdx < 0 || targetIdx >= workflow.steps.length) return;
    const newSteps = [...workflow.steps];
    const temp = newSteps[index];
    newSteps[index] = newSteps[targetIdx];
    newSteps[targetIdx] = temp;
    setWorkflow({ ...workflow, steps: newSteps });
  };

  const deleteStep = (index: number) => {
    const newSteps = workflow.steps.filter((_, i) => i !== index);
    setWorkflow({ ...workflow, steps: newSteps });
  };

  const handleSave = async () => {
    setSaving(true);
    setSaveSuccess(false);
    try {
      const updatedWf = {
        ...workflow,
        version: workflow.version + 1,
        parent_version: workflow.version,
        change_summary: changeSummary,
      };
      const res = await api.saveWorkflow(updatedWf);
      if (res.workflow) {
        setWorkflow(res.workflow);
        onWorkflowSaved(res.workflow);
        setSaveSuccess(true);
      }
    } catch (err) {
      alert("Failed to save: " + err);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="card-panel">
      <div className="panel-header-row">
        <div>
          <h2>Workflow Editor & Graph (Your Extension)</h2>
          <p className="subtitle">
            Edit the workflow steps, conditions, and reusable inputs. Saving creates a new version and clears approval for the previous one.
          </p>
        </div>
        <div className="version-tag">
          Version: <strong>v{workflow.version}</strong>
        </div>
      </div>

      <div className="editor-tabs">
        <button
          className={`tab-btn ${activeTab === "graph" ? "active" : ""}`}
          onClick={() => setActiveTab("graph")}
        >
          ☊ Graph View (Extension)
        </button>
        <button
          className={`tab-btn ${activeTab === "steps" ? "active" : ""}`}
          onClick={() => setActiveTab("steps")}
        >
          ☰ Steps List ({workflow.steps.length})
        </button>
        <button
          className={`tab-btn ${activeTab === "parameters" ? "active" : ""}`}
          onClick={() => setActiveTab("parameters")}
        >
          {`{{}}`} Parameters ({workflow.parameters.length})
        </button>
        <button
          className={`tab-btn ${activeTab === "conditions" ? "active" : ""}`}
          onClick={() => setActiveTab("conditions")}
        >
          ✓ Postconditions ({workflow.final_postconditions.length})
        </button>
        <button
          className={`tab-btn ${activeTab === "json" ? "active" : ""}`}
          onClick={() => setActiveTab("json")}
        >
          &lt;/&gt; Raw Canonical JSON
        </button>
      </div>

      {saveSuccess && (
        <div className="success-banner">
          ✓ Workflow saved as version v{workflow.version}. Any approval for the previous version has been cleared.
        </div>
      )}

      {/* GRAPH VIEW TAB */}
      {activeTab === "graph" && (
        <WorkflowGraph
          workflow={workflow}
          onWorkflowChange={(updated) => setWorkflow(updated)}
        />
      )}

      {/* STEPS TAB */}
      {activeTab === "steps" && (
        <div className="steps-container">
          {workflow.steps.map((step, idx) => (
            <div
              key={step.id || idx}
              className={`step-card ${!step.enabled ? "step-disabled" : ""}`}
            >
              <div className="step-card-header">
                <div className="step-title-group">
                  <span className="step-num">{idx + 1}</span>
                  <input
                    type="text"
                    className="step-name-input"
                    value={step.name}
                    onChange={(e) => updateStep(idx, { name: e.target.value })}
                  />
                  <span className={`badge-risk badge-risk-${step.risk}`}>
                    {step.risk.toUpperCase()} RISK
                  </span>
                  {step.condition && (
                    <span className="pill pill-origin">Rule: {step.condition}</span>
                  )}
                  {step.requires_confirmation && (
                    <span className="badge-gate">Confirmation Gate</span>
                  )}
                </div>
                <div className="step-actions">
                  <button
                    className="icon-btn"
                    onClick={() => moveStep(idx, "up")}
                    disabled={idx === 0}
                    title="Move Up"
                  >
                    ▲
                  </button>
                  <button
                    className="icon-btn"
                    onClick={() => moveStep(idx, "down")}
                    disabled={idx === workflow.steps.length - 1}
                    title="Move Down"
                  >
                    ▼
                  </button>
                  <button
                    className="icon-btn"
                    onClick={() => toggleStepEnabled(idx)}
                    title={step.enabled ? "Disable Step" : "Enable Step"}
                  >
                    {step.enabled ? "Disable" : "Enable"}
                  </button>
                  <button
                    className="icon-btn btn-danger-text"
                    onClick={() => deleteStep(idx)}
                    title="Delete Step"
                  >
                    ✕
                  </button>
                </div>
              </div>

              <div className="step-body-grid">
                <div className="step-field">
                  <label>Typed Action</label>
                  <select
                    value={step.action}
                    onChange={(e) => updateStep(idx, { action: e.target.value as ActionType })}
                  >
                    <option value="navigate">navigate</option>
                    <option value="click">click</option>
                    <option value="type">type</option>
                    <option value="select">select</option>
                    <option value="submit">submit (consequential)</option>
                    <option value="confirm_gate">confirm_gate</option>
                    <option value="tool_call">tool_call (plugin)</option>
                  </select>
                </div>

                <div className="step-field">
                  <label>Arguments (JSON / Template)</label>
                  <input
                    type="text"
                    value={JSON.stringify(step.args)}
                    onChange={(e) => {
                      try {
                        const parsed = JSON.parse(e.target.value);
                        updateStep(idx, { args: parsed });
                      } catch {}
                    }}
                  />
                </div>

                {step.target && (
                  <div className="step-field full-width">
                    <label>Target Descriptors</label>
                    <div className="target-pill-group">
                      {step.target.test_id && (
                        <span className="pill">test_id: <strong>{step.target.test_id}</strong></span>
                      )}
                      {step.target.role && (
                        <span className="pill">role: <strong>{step.target.role}</strong></span>
                      )}
                      {step.target.name && (
                        <span className="pill">name: <strong>{step.target.name}</strong></span>
                      )}
                      {step.target.css_fallback && (
                        <span className="pill-muted">{step.target.css_fallback}</span>
                      )}
                    </div>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* PARAMETERS TAB */}
      {activeTab === "parameters" && (
        <div className="parameters-container">
          <h3>Declared Parameters ({workflow.parameters.length})</h3>
          <p className="field-hint">Variables learned from demonstration & clarification dialogue.</p>
          <table className="param-table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Type</th>
                <th>Default / Example</th>
                <th>Required</th>
              </tr>
            </thead>
            <tbody>
              {workflow.parameters.map((p, idx) => (
                <tr key={idx}>
                  <td><code>{`{{${p.name}}}`}</code></td>
                  <td>{p.type}</td>
                  <td>{p.default_value || "—"}</td>
                  <td>{p.required ? "Yes" : "No"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* POSTCONDITIONS TAB */}
      {activeTab === "conditions" && (
        <div className="conditions-container">
          <h3>Checks after each run</h3>
          <p className="field-hint">Checks evaluated after execution. A run cannot end "success" without passing all postconditions.</p>
          <div className="conditions-list">
            {workflow.final_postconditions.map((cond, idx) => (
              <div key={idx} className="condition-row">
                <span className="badge-event">{cond.type}</span>
                <code>{cond.value || cond.selector || "Match condition"}</code>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* RAW JSON TAB */}
      {activeTab === "json" && (
        <pre className="json-viewer">
          {JSON.stringify(workflow, null, 2)}
        </pre>
      )}

      {/* FOOTER ACTIONS */}
      <div className="editor-footer">
        <div className="save-summary-input">
          <label>Version Change Note:</label>
          <input
            type="text"
            value={changeSummary}
            onChange={(e) => setChangeSummary(e.target.value)}
          />
        </div>
        <div className="footer-btns">
          <button
            className="btn btn-primary"
            onClick={handleSave}
            disabled={saving}
          >
            {saving ? "Saving..." : "Save New Version"}
          </button>
          <button
            className="btn btn-accent"
            onClick={onNavigateToApprove}
          >
            Go to Approval & Scope →
          </button>
        </div>
      </div>
    </div>
  );
};
