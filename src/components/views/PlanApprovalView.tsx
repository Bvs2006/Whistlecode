import React, { useState, useEffect } from "react";
import { api } from "../../api/client";
import type { WorkflowDefinition, ApprovalRecord, AppSection, PlanPreviewResponse } from "../../types";

type Props = {
  workflow: WorkflowDefinition;
  approval: ApprovalRecord | null;
  onApprovalCreated: (appr: ApprovalRecord) => void;
  onNavigateToLiveRun: () => void;
  onNavigate?: (section: AppSection) => void;
  onApprovalRevoked?: () => void;
};

const decisionLabel = (decision?: string) => decision === "ALLOW" ? "Allowed" : decision === "REQUIRE_CONFIRMATION" ? "Needs your confirmation" : decision === "DENY" ? "Blocked" : "Checking…";

export const PlanApprovalView: React.FC<Props> = ({
  workflow,
  approval,
  onApprovalCreated,
  onNavigateToLiveRun,
  onNavigate,
  onApprovalRevoked,
}) => {
  const [approving, setApproving] = useState(false);
  const [isApproved, setIsApproved] = useState(!!approval);
  const [expandedStepId, setExpandedStepId] = useState<string | null>("s1");
  const [decisionError, setDecisionError] = useState<string | null>(null);
  const [currentApproval, setCurrentApproval] = useState(approval);
  const [planPreview, setPlanPreview] = useState<PlanPreviewResponse | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);

  useEffect(() => {
    setCurrentApproval(approval);
    setIsApproved(!!approval);
  }, [approval]);

  useEffect(() => {
    let active = true;
    setPreviewLoading(true);
    setPlanPreview(null);
    api.previewPlan(workflow).then((preview) => {
      if (active) setPlanPreview(preview as PlanPreviewResponse);
    }).catch((error: Error) => {
      if (active) setDecisionError(`Could not validate this plan: ${error.message}`);
    }).finally(() => {
      if (active) setPreviewLoading(false);
    });
    return () => { active = false; };
  }, [workflow]);

  // Structured Goal Plan Steps
  const planSteps = workflow.steps.filter((step) => step.enabled).map((step) => ({
    ...step,
    preview: planPreview?.steps.find((candidate) => candidate.step_id === step.id),
  }));

  const approvalFacts = [
    { title: "Plan version", value: `v${workflow.version}`, icon: "≡" },
    { title: "Plan review", value: previewLoading ? "Checking…" : planPreview ? `${planPreview.steps.length} steps checked` : "Unavailable", icon: previewLoading ? "…" : planPreview ? "✓" : "!" },
    { title: "Approval", value: currentApproval ? `Active · v${currentApproval.version}` : "No approval granted", icon: currentApproval ? "✓" : "!" },
    { title: "Expires", value: currentApproval ? new Date(currentApproval.expires_at).toLocaleString() : "30 days after approval", icon: "◷" },
  ];
  const hasBlockedAction = Boolean(planPreview?.steps.some((step) => step.policy_decision === "DENY"));
  const approvalDisabled = Boolean(
    approving || currentApproval || previewLoading || !planPreview ||
    !workflow.steps.some((step) => step.enabled) || hasBlockedAction ||
    workflow.allowed_origins.length === 0
  );
  const approvalStatus = previewLoading
    ? "Checking each action and website…"
    : !planPreview
      ? "Approval is unavailable until this plan can be reviewed."
      : hasBlockedAction
        ? "This plan has a blocked action. Edit it before approval."
        : !workflow.allowed_origins.length
          ? "Add an allowed website in Edit plan before approval."
          : `${planPreview.steps.length} steps are checked. Approval applies to version v${workflow.version} and the websites listed above.`;

  const handleApprove = async () => {
    if (previewLoading || !planPreview) {
      setDecisionError("Wait for the plan review to finish before approving it.");
      return;
    }
    if (planPreview.steps.some((step) => step.policy_decision === "DENY")) {
      setDecisionError("This plan contains blocked actions. Edit the plan before creating an approval.");
      return;
    }
    if (!workflow.allowed_origins.length) {
      setDecisionError("Add at least one allowed website in the plan editor before approving this workflow.");
      return;
    }
    setApproving(true);
    setDecisionError(null);
    try {
      const res = await api.approveWorkflow(workflow, workflow.allowed_origins, 30);
      if (res.approval) {
        setCurrentApproval(res.approval);
        setIsApproved(true);
        onApprovalCreated(res.approval);
        setTimeout(() => {
          onNavigateToLiveRun();
        }, 600);
      } else {
        setDecisionError("The server did not return an approval record. The plan remains blocked.");
      }
    } catch (e: any) {
      setDecisionError(e.message || "Approval could not be created. The workflow remains blocked.");
    } finally {
      setApproving(false);
    }
  };

  const handleDeny = async () => {
    setApproving(true);
    setDecisionError(null);
    try {
      await api.recordApprovalDecision(workflow, "deny", "User denied the proposed plan");
      setIsApproved(false);
      if (onNavigate) onNavigate("Overview");
    } catch (e: any) {
      setDecisionError(e.message || "The denial could not be recorded.");
    } finally {
      setApproving(false);
    }
  };

  const handleRegenerate = async () => {
    setApproving(true);
    try {
      await api.recordApprovalDecision(workflow, "edit_plan", "User requested plan edits");
      if (onNavigate) onNavigate("My Workflows");
    } catch (e: any) {
      setDecisionError(e.message || "Could not open the workflow editor.");
    } finally {
      setApproving(false);
    }
  };

  const handleCancelProposal = async () => {
    setApproving(true);
    setDecisionError(null);
    try {
      await api.recordApprovalDecision(workflow, "cancel", "User cancelled the proposed plan");
      if (onNavigate) onNavigate("Overview");
    } catch (e: any) {
      setDecisionError(e.message || "The cancellation could not be recorded.");
    } finally {
      setApproving(false);
    }
  };

  const handleRevoke = async () => {
    if (!currentApproval) return;
    setApproving(true);
    try {
      await api.revokeApproval(currentApproval.id);
      setCurrentApproval(null);
      setIsApproved(false);
      onApprovalRevoked?.();
    } catch (e: any) {
      setDecisionError(e.message || "The approval could not be revoked.");
    } finally {
      setApproving(false);
    }
  };

  return (
    <div className="guarded-page-viewport">
      <div style={{ width: "100%", maxWidth: "1100px", display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px" }}>
        <h1 className="human-override-h1" style={{ margin: 0 }}>Human Override & Goal Plan</h1>
        <div style={{ display: "flex", gap: "8px" }}>
          <button type="button" className="btn-plan-util" onClick={handleRegenerate} disabled={approving} title="Edit the plan before approval">
            ✎ Edit plan
          </button>
          <button type="button" className="btn-plan-util danger" onClick={handleCancelProposal} disabled={approving} title="Cancel proposal">
            ✕ Cancel Plan
          </button>
        </div>
      </div>

      {/* FROSTED GLASS MACOS WINDOW (Image 4 style) */}
      <div className="guarded-window-shell">
        {/* TITLEBAR */}
        <div className="guarded-window-titlebar">
          <div className="mac-window-dots">
            <span className="mac-dot dot-close" />
            <span className="mac-dot dot-min" />
            <span className="mac-dot dot-max" />
          </div>

          <div className="guarded-mode-pill-img4">
            <span className="js-logo-box">Js</span>
            <span>GUARDED MODE</span>
          </div>

          <div className="guarded-window-actions"><span className="review-status"><i /> REVIEW MODE · EXECUTION BLOCKED</span></div>
        </div>

        {/* CONTENTS: TWO COLUMNS (Image 4 style) */}
        <div className="guarded-window-contents">
          {/* LEFT: HUMAN OVERRIDE CARD & STRUCTURED EXPANDABLE PLAN */}
          <div className="human-override-card">
            <div className="action-row-img4">
              <span>Goal: {workflow.title}</span>
              <button
                type="button"
                style={{ background: "transparent", border: "none", cursor: "pointer", fontSize: "16px" }}
                title="Review notes"
              >
                💬
              </button>
            </div>

            <div className="risk-row-img4">
              <span>Risk Level:</span>
              <span className="risk-badge-red">{previewLoading ? "CHECKING" : (planPreview?.overall_risk || "UNKNOWN").toUpperCase()}</span>
              <span className="policy-rule-pill">Plan checks active</span>
            </div>

            <div className="plan-assumptions-box">
              <span className="assumptions-title">📌 Plan and risk review</span>
              <ul>
                <li>• {previewLoading ? "Checking actions and destinations…" : planPreview ? `${planPreview.steps.length} enabled steps checked.` : "Review unavailable; approval is disabled."}</li>
                <li>• Approval applies to this workflow version, its actions, and selected websites.</li>
                <li>• Steps requiring live confirmation still pause for a separate decision during execution.</li>
              </ul>
            </div>

            <div className="approval-scope-summary">
              <strong>Approval scope</strong>
              <span><b>Allowed websites:</b> {workflow.allowed_origins.join(", ") || "None"}</span>
              <span><b>Actions:</b> {Array.from(new Set(workflow.steps.filter((s) => s.enabled).map((s) => s.action))).join(", ") || "None"}</span>
              <span><b>Plan version:</b> v{workflow.version}</span>
              <span><b>Approval expires:</b> 30 days after approval</span>
            </div>

            {decisionError && <div className="error-banner" role="alert">{decisionError}</div>}

            {/* STRUCTURED NUMBERED PLAN WITH EXPANDABLE DETAILS */}
            <div className="structured-plan-list">
              <div className="plan-list-header">
                <strong>Proposed Execution Steps ({planSteps.length})</strong>
                <small>Click step to expand preconditions & failure branches</small>
              </div>

              {planSteps.map((st, idx) => {
                const isExpanded = expandedStepId === st.id;
                return (
                  <div key={st.id} className={`plan-step-item-card ${isExpanded ? "expanded" : ""}`}>
                    <div
                      className="step-card-header"
                      onClick={() => setExpandedStepId(isExpanded ? null : st.id)}
                    >
                      <span className="step-badge-circle">{idx + 1}</span>
                      <span className={`step-action-tag act-${st.action}`}>{st.action.toUpperCase()}</span>
                      <strong className="step-title-text">{st.name}</strong>
                      <span className="step-expand-icon">{isExpanded ? "▴" : "▾"}</span>
                    </div>

                    {isExpanded && (
                      <div className="step-card-details">
                        <div className="detail-line">
                          <span className="dt-label">Action type:</span>
                          <span className="dt-val">{st.action}</span>
                        </div>
                        <div className="detail-line">
                          <span className="dt-label">Risk:</span>
                          <span className="dt-val">{st.preview?.risk || st.risk}{st.preview?.requires_confirmation ? " · live confirmation required" : ""}</span>
                        </div>
                        <div className="detail-line">
                          <span className="dt-label">Target:</span>
                          <span className="dt-val">{st.target ? `${st.target.name || st.target.label || st.target.text || st.target.test_id || "Element"} (${st.target.role || "control"})` : "Window / Application Root"}</span>
                        </div>
                        <div className="detail-line">
                          <span className="dt-label">Arguments:</span>
                          <code className="dt-val plan-arguments">{JSON.stringify(st.preview?.evaluated_args || st.args)}</code>
                        </div>
                        <div className="detail-line">
                          <span className="dt-label">Expected Result:</span>
                          <span className="dt-val">{st.preview?.expected_result || "Preview pending"}</span>
                        </div>
                        <div className="detail-line">
                          <span className="dt-label">Safety check:</span>
                          <span className="dt-val" style={{ color: st.preview?.policy_decision === "DENY" ? "#e5a36b" : undefined }}>{decisionLabel(st.preview?.policy_decision)}</span>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            {/* BOTTOM ACTIONS */}
            <div className="card-bottom-actions-img4">
              {currentApproval ? <span className="undo-tag-blue">Approval active · expires {new Date(currentApproval.expires_at).toLocaleString()}</span> : <span className="undo-tag-blue">Review the full plan before approving</span>}

              <div style={{ display: "flex", gap: "10px" }}>
                <button
                  type="button"
                  className="btn-reject-orange"
                  onClick={handleDeny}
                  disabled={approving || !!currentApproval}
                >
                  Deny
                </button>
                <button type="button" className="btn-plan-util danger" onClick={handleCancelProposal} disabled={approving}>Cancel</button>
                {currentApproval && <button type="button" className="btn-plan-util danger" onClick={handleRevoke} disabled={approving}>Revoke</button>}
              </div>
            </div>
          </div>

          {/* RIGHT: RUN TIMELINE / RECEIPTS (Image 4 style) */}
          <div className="receipts-timeline-card-img4">
            <h3>Approval Record</h3>
            <div style={{ display: "flex", flexDirection: "column", gap: "14px", marginTop: "12px" }}>
              {approvalFacts.map((item, idx) => (
                <div key={idx} className="timeline-step-entry">
                  <span style={{ fontSize: "14px" }}>{item.icon}</span>
                  <span className="t-label">{item.title}</span>
                  <span className="t-time">{item.value}</span>
                </div>
              ))}
              {currentApproval && <div className="approval-receipt-signature"><span>Signed approval receipt</span><code>{currentApproval.signature.slice(0, 24)}…</code><small>Granted to {currentApproval.approver}</small></div>}
              <div className={`permissions-approval-action ${currentApproval ? "is-granted" : ""}`}>
                <div className="permissions-approval-action-mark" aria-hidden="true">{currentApproval ? "✓" : "✳"}</div>
                <strong>{currentApproval ? "This plan is approved" : "Ready to approve this plan?"}</strong>
                <p>{currentApproval ? `Approval is active for version v${currentApproval.version}.` : approvalStatus}</p>
                {decisionError && <div className="approval-action-error" role="alert">{decisionError}</div>}
                {!currentApproval && (
                  <button type="button" className="btn-approve-bold" onClick={handleApprove} disabled={approvalDisabled}>
                    {approving ? "Saving approval…" : previewLoading ? "Checking plan…" : "Approve this version →"}
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
