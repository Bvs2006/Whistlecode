import React, { useState } from "react";
import { api } from "../../api/client";
import { PlanPreviewModal } from "./PlanPreviewModal";
import type { WorkflowDefinition, ApprovalRecord, RunRecord, Step } from "../../types";

type Props = {
  workflow: WorkflowDefinition;
  approval: ApprovalRecord | null;
  onNavigateToAudit: () => void;
};

const runStateLabel: Record<string, string> = {
  SUCCESS: "Complete", FAILED: "Not completed", STOPPED: "Stopped", UNCERTAIN: "Needs review",
  PENDING_CONFIRMATION: "Waiting for your review", EXECUTING_STEP: "Running", PRECHECK: "Checking plan",
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
      init[p.name] = p.default_value ?? "";
    });
    return init;
  });

  const [isRunning, setIsRunning] = useState(false);
  const [currentRun, setCurrentRun] = useState<RunRecord | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pendingGate, setPendingGate] = useState<{ step: Step; params: Record<string, any>; risk: string } | null>(null);
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
        const runId = res.run.id;
        const terminal = new Set(["SUCCESS", "FAILED", "STOPPED", "UNCERTAIN"]);
        while (!terminal.has(res.run.state)) {
          await new Promise((resolve) => setTimeout(resolve, 450));
          const status = await api.getExecutionStatus(runId);
          res.run = status.run;
          setCurrentRun(status.run);
          if (status.pending_confirmation) {
            setPendingGate({
              step: status.pending_confirmation.step as Step,
              params: status.pending_confirmation.evaluated_args || {},
              risk: status.pending_confirmation.risk || "high",
            });
          } else {
            setPendingGate(null);
          }
        }
      }
    } catch (err: any) {
      setError(err.message || "Execution encountered an error");
    } finally {
      setIsRunning(false);
    }
  };

  const handleConfirmGate = async (grant: boolean) => {
    try {
      if (!currentRun) return;
      await api.confirmStep(currentRun.id, grant);
      setPendingGate(null);
    } catch (err: any) {
      alert("Error handling confirmation: " + err.message);
    }
  };

  const handleStop = async () => {
    try {
      await api.stopExecution();
    } catch (err: any) {
      console.error(err);
    }
  };

  return (
    <div className="card-panel">
      <div className="panel-header-row">
        <div>
          <h2>Run and review</h2>
          <p className="subtitle">
            Each step is checked against your approved plan and allowed sites. Sensitive actions pause for your review.
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
              <h3>⚠️ Your confirmation is needed</h3>
            </div>
            <p>A consequential or high-risk action requires your explicit confirmation before proceeding:</p>

            <div className="gate-details-box">
              <div><strong>Action Type:</strong> <code>{pendingGate.step.action}</code></div>
              <div><strong>Target Element:</strong> {pendingGate.step.target?.name || pendingGate.step.target?.test_id || "Element"}</div>
              <div><strong>Data / Inputs:</strong> <code>{JSON.stringify(pendingGate.params)}</code></div>
              <div><strong>Risk:</strong> <span className={`badge-risk badge-risk-${pendingGate.risk}`}>{pendingGate.risk.toUpperCase()}</span></div>
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
          <h3>1. Choose how to run</h3>
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
                <strong>Preview run (no changes)</strong>
                <p>Checks the plan without opening a website or making changes.</p>
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
                <strong>Run approved workflow</strong>
                <p>Runs on the approved websites and pauses for sensitive actions.</p>
              </div>
            </label>
          </div>
        </div>

        <div className="config-card">
          <h3>2. Workflow inputs ({workflow.parameters.length})</h3>
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
              ✓ Approved workflow version {approval.version}
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
              ▶ {mode === "dry_run" ? "Run preview" : "Start workflow"}
            </button>
          ) : (
            <button className="btn btn-danger" onClick={handleStop}>
              ■ Stop workflow
            </button>
          )}
        </div>
      </div>

      {/* LIVE EXECUTION MONITOR & TIMELINE */}
      {currentRun && (
        <div className="run-results-panel">
          <div className="run-results-header">
            <div>
              <h3>Workflow status: <span className={`state-badge state-${currentRun.state.toLowerCase()}`}>{runStateLabel[currentRun.state] || "In progress"}</span></h3>
              <p className="field-hint">Started {new Date(currentRun.started_at).toLocaleString()}</p>
            </div>

            {currentRun.verification_state && (
              <div className={`verification-badge ver-${currentRun.verification_state.toLowerCase()}`}>
                Result: <strong>{currentRun.verification_state === "VERIFIED_SUCCESS" ? "Confirmed" : currentRun.verification_state === "FAILED" ? "Not completed" : "Needs review"}</strong>
              </div>
            )}
          </div>

          {currentRun.safe_stop_reason && (
            <div className="warning-banner">
              ⚠️ Workflow paused: {currentRun.safe_stop_reason.replaceAll("APPROVAL_EXPIRED", "approval expired").replaceAll("APPROVAL_HASH_MISMATCH", "plan changed").replaceAll("APPROVAL_NOT_FOUND", "approval is missing").replaceAll("APPROVAL_SCOPE_MISMATCH", "approval no longer matches this plan").replaceAll("APPROVAL_REVOKED", "approval was revoked")}
            </div>
          )}

          <div className="step-execution-feed">
            <h4>Completed steps ({currentRun.step_results.length})</h4>
            <div className="step-results-list">
              {currentRun.step_results.map((sr, idx) => (
                <div key={idx} className={`step-result-card ${sr.passed ? "passed" : "failed"}`}>
                  <div className="step-result-main">
                    <span className="step-idx">{idx + 1}</span>
                    <span className={`badge-event badge-${sr.action}`}>{sr.action.toUpperCase()}</span>
                    <span className="step-target-name">{sr.target_summary || "Target element"}</span>
                    <span className={`badge-policy badge-policy-${sr.decision.toLowerCase()}`}>
                      {sr.decision === "ALLOW" ? "Allowed" : sr.decision === "REQUIRE_CONFIRMATION" ? "Review needed" : "Blocked"}
                    </span>
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
              View activity history →
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
