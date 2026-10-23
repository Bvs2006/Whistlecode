import React, { useState } from "react";
import { api } from "../../api/client";
import type { WorkflowDefinition, ApprovalRecord } from "../../types";

type Props = {
  workflow: WorkflowDefinition;
  onApprovalCreated: (approval: ApprovalRecord) => void;
  onNavigateToRun: () => void;
};

export const ApprovalManager: React.FC<Props> = ({
  workflow,
  onApprovalCreated,
  onNavigateToRun,
}) => {
  const [durationDays, setDurationDays] = useState(30);
  const [loading, setLoading] = useState(false);
  const [activeApproval, setActiveApproval] = useState<ApprovalRecord | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleApprove = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.approveWorkflow(workflow, workflow.allowed_origins, durationDays);
      if (res.approval) {
        setActiveApproval(res.approval);
        onApprovalCreated(res.approval);
      }
    } catch (err: any) {
      setError(err.message || "Failed to create approval");
    } finally {
      setLoading(false);
    }
  };

  const handleRevoke = async () => {
    if (!activeApproval) return;
    setLoading(true);
    try {
      await api.revokeApproval(activeApproval.id);
      setActiveApproval(null);
    } catch (err: any) {
      setError(err.message || "Failed to revoke approval");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="card-panel">
      <div className="panel-header-row">
        <div>
          <h2>Approval and permissions</h2>
          <p className="subtitle">
            Approval applies only to this workflow version and the websites listed below.
          </p>
        </div>
        <div className={`status-pill ${activeApproval ? "live" : "idle"}`}>
          <span className="dot" />
          {activeApproval ? "Version Approved" : "Unapproved Version"}
        </div>
      </div>

      {error && <div className="error-banner">⚠️ {error}</div>}

      {/* PLAIN LANGUAGE SCOPE SUMMARY (APR-5) */}
      <div className="scope-box">
        <h3>What this workflow can do</h3>
        <p>Review what this automation will be allowed to do when running:</p>

        <ul className="scope-list">
          <li>
            <strong>Target Workflow:</strong> <code>{workflow.title}</code> (v{workflow.version})
          </li>
          <li>
            <strong>Plan version:</strong> v{workflow.version}
          </li>
          <li>
            <strong>Allowed websites:</strong>{" "}
            {workflow.allowed_origins.map((o) => (
              <span key={o} className="pill pill-origin">{o}</span>
            ))}
          </li>
          <li>
            <strong>Allowed Action Types:</strong>{" "}
            {Array.from(new Set(workflow.steps.filter((s) => s.enabled).map((s) => s.action))).map((a) => (
              <span key={a} className="pill">{a}</span>
            ))}
          </li>
          <li>
            <strong>High-Risk Confirmation Gates:</strong>{" "}
            {workflow.steps.some((s) => s.risk === "high" || s.requires_confirmation)
              ? "Enforced — executor will halt and prompt for explicit user approval before consequential submits."
              : "None (low/medium risk steps only)."}
          </li>
          <li>
            <strong>Network & Data Restrictions:</strong> All off-allowlist domains, downloads, and arbitrary shell execution are strictly DENIED.
          </li>
        </ul>
      </div>

      {/* APPROVAL CONTROLS */}
      {!activeApproval ? (
        <div className="approval-action-box">
          <div className="input-group" style={{ maxWidth: "240px", marginBottom: "16px" }}>
            <label>Approval Expiry (Days)</label>
            <input
              type="number"
              min="1"
              max="365"
              value={durationDays}
              onChange={(e) => setDurationDays(Number(e.target.value))}
            />
          </div>

          <div className="button-row">
            <button
              className="btn btn-primary"
              onClick={handleApprove}
              disabled={loading}
            >
              ✓ Approve version {workflow.version}
            </button>
          </div>
        </div>
      ) : (
        <div className="approved-certificate-card">
          <div className="cert-header">
            <h4>Approval record</h4>
            <span className="badge-success">ACTIVE & VALID</span>
          </div>
          <div className="cert-details">
            <div>
              <span>Approval:</span> <strong>Version {activeApproval.version}</strong>
            </div>
            <div>
              <span>Approver:</span> <strong>{activeApproval.approver}</strong>
            </div>
            <div>
              <span>Expires At:</span> <strong>{new Date(activeApproval.expires_at).toLocaleString()}</strong>
            </div>
            <div>
              <span>Status:</span> <strong>Active for this version</strong>
            </div>
          </div>

          <div className="button-row" style={{ marginTop: "20px" }}>
            <button className="btn btn-accent" onClick={onNavigateToRun}>
              Launch Execution Monitor →
            </button>
            <button className="btn btn-danger-outline" onClick={handleRevoke}>
              Revoke Approval
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
