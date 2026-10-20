import React, { useState, useEffect } from "react";
import { api } from "../../api/client";
import type { WorkflowDefinition, PlanPreviewResponse } from "../../types";

type Props = {
  workflow: WorkflowDefinition;
  parameters: Record<string, any>;
  approvalId?: string | null;
  onApproveAndRun: () => void;
  onClose: () => void;
};

export const PlanPreviewModal: React.FC<Props> = ({
  workflow,
  parameters,
  approvalId,
  onApproveAndRun,
  onClose,
}) => {
  const [preview, setPreview] = useState<PlanPreviewResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [approving, setApproving] = useState(false);
  const [isApproved, setIsApproved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadPreview();
  }, [workflow, parameters, approvalId]);

  const loadPreview = async () => {
    setLoading(true);
    setError(null);
    try {
      const res: PlanPreviewResponse = await api.previewPlan(workflow, parameters, approvalId || undefined);
      setPreview(res);
      setIsApproved(res.is_approved);
    } catch (err: any) {
      setError(err.message || "Failed to generate plan preview");
    } finally {
      setLoading(false);
    }
  };

  const handleGrantApproval = async () => {
    setApproving(true);
    try {
      const res = await api.approveWorkflow(workflow, workflow.allowed_origins, 30);
      if (res.approval) {
        setIsApproved(true);
        if (preview) {
          setPreview({ ...preview, is_approved: true });
        }
      }
    } catch (err: any) {
      setError(err.message || "Failed to grant approval");
    } finally {
      setApproving(false);
    }
  };

  return (
    <div className="modal-backdrop">
      <div className="modal-card plan-preview-modal-card">
        <div className="modal-header">
          <div>
            <h3>Pre-Execution Plan Preview (Preview MVP)</h3>
            <p className="subtitle" style={{ margin: "4px 0 0 0" }}>
              Every planned action, target UI element, evaluated parameters, expected postcondition, and risk level before execution.
            </p>
          </div>
          <button className="icon-btn" onClick={onClose}>✕</button>
        </div>

        {error && <div className="error-banner">⚠️ {error}</div>}

        {loading ? (
          <div className="loading-state">Evaluating plan and security policy...</div>
        ) : preview ? (
          <div className="plan-preview-content">
            {/* PLAN OVERVIEW META */}
            <div className="plan-summary-bar">
              <div>
                <strong>Workflow:</strong> {preview.title}
              </div>
              <div>
                <strong>Content Hash:</strong>{" "}
                <code className="hash-code">{preview.content_hash.slice(0, 18)}...</code>
              </div>
              <div>
                <strong>Overall Risk:</strong>{" "}
                <span className={`badge-risk badge-risk-${preview.overall_risk}`}>
                  {preview.overall_risk.toUpperCase()}
                </span>
              </div>
              <div>
                <strong>Approval Status:</strong>{" "}
                {isApproved ? (
                  <span className="badge-status-approved">✓ APPROVED</span>
                ) : (
                  <span className="badge-status-unapproved">⚠️ UNAPPROVED HASH</span>
                )}
              </div>
            </div>

            {/* ACTION-BY-ACTION TABLE */}
            <div className="preview-table-container">
              <table className="events-table">
                <thead>
                  <tr>
                    <th>#</th>
                    <th>Action</th>
                    <th>Target UI Element</th>
                    <th>Evaluated Arguments</th>
                    <th>Expected Result</th>
                    <th>Risk & Policy</th>
                  </tr>
                </thead>
                <tbody>
                  {preview.steps.map((s) => (
                    <tr key={s.step_id} className={`preview-row risk-${s.risk}`}>
                      <td className="step-num-cell"><strong>{s.step_index}</strong></td>
                      <td>
                        <span className={`badge-event badge-${s.action}`}>
                          {s.action.toUpperCase()}
                        </span>
                      </td>
                      <td>
                        <strong>{s.target_label}</strong>
                      </td>
                      <td>
                        <code>{JSON.stringify(s.evaluated_args)}</code>
                      </td>
                      <td className="expected-result-cell">
                        <small>{s.expected_result}</small>
                      </td>
                      <td>
                        <div className="risk-policy-cell">
                          <span className={`badge-risk badge-risk-${s.risk}`}>
                            {s.risk.toUpperCase()}
                          </span>
                          <span className={`badge-policy badge-policy-${s.policy_decision.toLowerCase()}`}>
                            {s.policy_decision}
                          </span>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* MANDATORY APPROVAL BANNER */}
            {!isApproved ? (
              <div className="approval-gate-banner">
                <div className="gate-text">
                  <strong>Explicit User Approval Required</strong>
                  <p>
                    PRD Guarantee: An automation is not permitted to execute against live targets without explicit cryptographic approval bound to this exact plan and content hash.
                  </p>
                </div>
                <button
                  className="btn btn-accent"
                  onClick={handleGrantApproval}
                  disabled={approving}
                >
                  {approving ? "Signing Approval..." : "🛡 Sign & Approve Exact Content Hash"}
                </button>
              </div>
            ) : (
              <div className="approval-granted-banner">
                <span>✓ Content hash pinned & approved. Ready for safe policy-enforced execution.</span>
              </div>
            )}

            <div className="modal-actions-row">
              <button className="btn btn-secondary" onClick={onClose}>
                Cancel
              </button>
              <button
                className="btn btn-primary"
                onClick={onApproveAndRun}
                disabled={!isApproved}
              >
                ▶ Run Approved Plan Under Policy
              </button>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
};
