import React, { useState } from "react";
import { api } from "../../api/client";
import { PlanPreviewModal } from "./PlanPreviewModal";
import type { WorkflowDefinition, ApprovalRecord, RunRecord, Step } from "../../types";

type Props = {
  workflow: WorkflowDefinition;
  approval: ApprovalRecord | null;
  onNavigateToAudit: () => void;
};

export const RunMonitor: React.FC<Props> = ({
  workflow,
  approval,
  onNavigateToAudit,
}) => {
  const [mode, setMode] = useState<"dry_run" | "test" | "run">("run");
  const [params, setParams] = useState<Record<string, any>>(() => {
    const init: Record<string, any> = {};
    workflow.parameters.forEach((p) => {
      init[p.name] = p.default_value || "";
    });
    return init;
  });

  const [isRunning, setIsRunning] = useState(false);
  const [currentRun, setCurrentRun] = useState<RunRecord | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pendingGate, setPendingGate] = useState<{ step: Step; params: Record<string, any> } | null>(null);
  const [showPreviewModal, setShowPreviewModal] = useState(false);

  const handleParamChange = (name: string, val: string) => {
    setParams({ ...params, [name]: val });
  };

  const handleStartRun = async () => {
    setError(null);
    setIsRunning(true);
    setPendingGate(null);
    try {
      const res = await api.executeWorkflow(workflow, params, approval?.id, mode);
      if (res.run) {
        setCurrentRun(res.run);
      }
    } catch (err: any) {
      setError(err.message || "Execution encountered an error");
    } finally {
      setIsRunning(false);
    }
  };

  const handleConfirmGate = async (grant: boolean) => {
    try {
      await api.confirmStep(grant);
      setPendingGate(null);
    } catch (err: any) {
      alert("Error handling confirmation: " + err.message);
    }
  };

  const handleStop = async () => {
    try {
      await api.stopExecution();
      setIsRunning(false);
    } catch (err: any) {
      console.error(err);
    }
  };

  return (
    <div className="card-panel">
      <div className="panel-header-row">
        <div>
          <h2>Execution Monitor & Safety Gates (EXE)</h2>
          <p className="subtitle">
            Deterministic executor checks approval validity, origin allowlist, and policy before every action. LLM is completely out of the runtime loop.
          </p>
        </div>
        <div className={`status-pill ${isRunning ? "live" : "idle"}`}>
          <span className="dot" />
          {isRunning ? "Executing Run" : "Ready"}
        </div>
      </div>

      {error && <div className="error-banner">⚠️ {error}</div>}

      {/* CONFIRMATION GATE MODAL (EXE-5) */}
      {pendingGate && (
        <div className="modal-backdrop">
          <div className="modal-card">
            <div className="modal-header">
              <h3>⚠️ Confirmation Gate Required (EXE-5)</h3>
            </div>
            <p>A consequential or high-risk action requires your explicit confirmation before proceeding:</p>

            <div className="gate-details-box">
              <div><strong>Action Type:</strong> <code>{pendingGate.step.action}</code></div>
              <div><strong>Target Element:</strong> {pendingGate.step.target?.name || pendingGate.step.target?.test_id || "Element"}</div>
              <div><strong>Data / Inputs:</strong> <code>{JSON.stringify(pendingGate.step.args)}</code></div>
              <div><strong>Declared Risk:</strong> <span className="badge-risk badge-risk-high">HIGH</span></div>
            </div>

            <div className="modal-actions-row">
              <button
                className="btn btn-danger"
                onClick={() => handleConfirmGate(false)}
              >
                Deny & Abort Run
              </button>
              <button
                className="btn btn-primary"
                onClick={() => handleConfirmGate(true)}
              >
                Grant & Continue Execution
              </button>
            </div>
          </div>
        </div>
      )}

      {/* PLAN PREVIEW MODAL */}
      {showPreviewModal && (
        <PlanPreviewModal
          workflow={workflow}
          parameters={params}
          approvalId={approval?.id}
          onApproveAndRun={() => {
            setShowPreviewModal(false);
            handleStartRun();
          }}
          onClose={() => setShowPreviewModal(false)}
        />
      )}

      {/* CONFIGURATION & PRE-FLIGHT BANNER */}
      <div className="run-config-grid">
        <div className="config-card">
          <h3>1. Execution Mode</h3>
          <div className="mode-selector">
            <label className={`mode-option ${mode === "dry_run" ? "selected" : ""}`}>
              <input
                type="radio"
                name="run_mode"
                value="dry_run"
                checked={mode === "dry_run"}
                onChange={() => setMode("dry_run")}
              />
              <div>
                <strong>Dry Run (No Side Effects)</strong>
                <p>Simulates DOM selectors, policy checks, and verifies approval validity.</p>
              </div>
            </label>

            <label className={`mode-option ${mode === "run" ? "selected" : ""}`}>
              <input
                type="radio"
                name="run_mode"
                value="run"
                checked={mode === "run"}
                onChange={() => setMode("run")}
              />
              <div>
                <strong>Live Policy-Enforced Run</strong>
                <p>Executes in browser with confirmation gates on high-risk actions.</p>
              </div>
            </label>
          </div>
        </div>

        <div className="config-card">
          <h3>2. Runtime Parameters ({workflow.parameters.length})</h3>
          {workflow.parameters.length === 0 ? (
            <p className="field-hint">No dynamic parameters defined for this workflow.</p>
          ) : (
            <div className="param-inputs-grid">
              {workflow.parameters.map((p) => (
                <div key={p.name} className="input-group">
                  <label><code>{`{{${p.name}}}`}</code> {p.description ? `— ${p.description}` : ""}</label>
                  <input
                    type="text"
                    value={params[p.name] ?? ""}
                    onChange={(e) => handleParamChange(p.name, e.target.value)}
                    placeholder={`e.g. ${p.default_value || "value"}`}
                  />
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* PREVIEW & RUN ACTION BAR */}
      <div className="run-control-bar">
        <div className="approval-status-chip">
          {approval ? (
            <span className="badge-status-approved">
              ✓ Approved Hash: <code>{approval.version_hash.slice(0, 14)}...</code>
            </span>
          ) : (
            <span className="badge-status-unapproved">
              ⚠️ No Active Approval — Required before live execution
            </span>
          )}
        </div>

        <div className="control-btn-group">
          <button
            className="btn btn-secondary"
            onClick={() => setShowPreviewModal(true)}
          >
            🔍 Preview Plan (Actions, Targets & Risk)
          </button>

          {!isRunning ? (
            <button
              className="btn btn-primary"
              onClick={handleStartRun}
              disabled={!approval && mode === "run"}
            >
              ▶ {mode === "dry_run" ? "Execute Dry-Run Simulation" : "Start Live Execution"}
            </button>
          ) : (
            <button className="btn btn-danger" onClick={handleStop}>
              ■ Stop Execution (Safe-Halt)
            </button>
          )}
        </div>
      </div>

      {/* LIVE EXECUTION MONITOR & TIMELINE */}
      {currentRun && (
        <div className="run-results-panel">
          <div className="run-results-header">
            <div>
              <h3>Run State: <span className={`state-badge state-${currentRun.state.toLowerCase()}`}>{currentRun.state}</span></h3>
              <p className="field-hint">Run ID: <code>{currentRun.id}</code></p>
            </div>

            {currentRun.verification_state && (
              <div className={`verification-badge ver-${currentRun.verification_state.toLowerCase()}`}>
                Verification: <strong>{currentRun.verification_state}</strong>
              </div>
            )}
          </div>

          {currentRun.safe_stop_reason && (
            <div className="warning-banner">
              ⚠️ Safe Stop Triggered: {currentRun.safe_stop_reason}
            </div>
          )}

          <div className="step-execution-feed">
            <h4>Executed Steps Log ({currentRun.step_results.length})</h4>
            <div className="step-results-list">
              {currentRun.step_results.map((sr, idx) => (
                <div key={idx} className={`step-result-card ${sr.passed ? "passed" : "failed"}`}>
                  <div className="step-result-main">
                    <span className="step-idx">{idx + 1}</span>
                    <span className={`badge-event badge-${sr.action}`}>{sr.action.toUpperCase()}</span>
                    <span className="step-target-name">{sr.target_summary || "Target element"}</span>
                    <span className={`badge-policy badge-policy-${sr.decision.toLowerCase()}`}>
                      {sr.decision}
                    </span>
                    <span className="reason-code">[{sr.reason_code}]</span>
                  </div>
                  {sr.error_message && (
                    <div className="step-error-text">❌ {sr.error_message}</div>
                  )}
                </div>
              ))}
            </div>
          </div>

          <div className="post-run-actions">
            <button className="btn btn-secondary btn-sm" onClick={onNavigateToAudit}>
              View Hash-Chained Audit Trail →
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
