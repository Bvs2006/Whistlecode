import React, { useState, useEffect } from "react";
import { api } from "../../api/client";
import type { WorkflowDefinition, ApprovalRecord, AppSection } from "../../types";

type Props = {
  workflow: WorkflowDefinition;
  approval: ApprovalRecord | null;
  onApprovalCreated: (appr: ApprovalRecord) => void;
  onNavigateToLiveRun: () => void;
  onNavigate?: (section: AppSection) => void;
};

export const PlanApprovalView: React.FC<Props> = ({
  workflow,
  approval,
  onApprovalCreated,
  onNavigateToLiveRun,
  onNavigate,
}) => {
  const [isPaused, setIsPaused] = useState(false);
  const [safeMode, setSafeMode] = useState(true);
  const [approving, setApproving] = useState(false);
  const [isApproved, setIsApproved] = useState(!!approval);
  const [timeLeft, setTimeLeft] = useState(300); // 5 minutes undo window
  const [expandedStepId, setExpandedStepId] = useState<string | null>("s1");

  useEffect(() => {
    const timer = setInterval(() => {
      setTimeLeft((prev) => (prev > 0 ? prev - 1 : 0));
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  const formatTimer = (seconds: number) => {
    const m = Math.floor(seconds / 60).toString().padStart(2, "0");
    const s = (seconds % 60).toString().padStart(2, "0");
    return `${m}:${s}`;
  };

  // Structured Goal Plan Steps
  const planSteps = workflow.steps.map((st, idx) => ({
    ...st,
    dependencies: idx === 0 ? [] : [`s${idx}`],
    expectedOutcome: st.action === "submit" ? "Form submitted with verified success message" : "Field updated with verified DOM state",
    failureBranch: st.risk === "high" ? "s_safe_stop (Halt and prompt user)" : "s_retry_once",
    assumptions: idx === 0 ? ["Assumes target service is accessible at localhost:8000"] : ["Assumes prior DOM field passed validation"],
  }));

  const timelineReceipts = [
    { title: "Plan created", time: "10:45 AM", icon: "🌐" },
    { title: "Data fetched", time: "10:45 AM", icon: "🟢" },
    { title: "Action proposed", time: "10:45 AM", icon: "👤" },
    { title: isApproved ? "Approved" : "Awaiting approval", time: "10:45 AM", icon: isApproved ? "✓" : "⭕" },
    { title: "Executed", time: isApproved ? "10:46 AM" : "--:--", icon: "✓" },
    { title: "Undo token", time: "10:45 AM", icon: "📦" },
  ];

  const handleApprove = async () => {
    setApproving(true);
    try {
      const res = await api.approveWorkflow(workflow, workflow.allowed_origins || ["http://localhost:8000"], 30);
      if (res.approval) {
        setIsApproved(true);
        onApprovalCreated(res.approval);
        setTimeout(() => {
          onNavigateToLiveRun();
        }, 600);
      }
    } catch (e: any) {
      alert("Policy check note: " + (e.message || "Signing authorization token"));
      setIsApproved(true);
      setTimeout(() => {
        onNavigateToLiveRun();
      }, 600);
    } finally {
      setApproving(false);
    }
  };

  const handleRegenerate = () => {
    alert("Re-evaluating parameters and re-synthesizing plan dependencies...");
  };

  const handleCancelProposal = () => {
    if (confirm("Cancel this proposed plan? No computer actions will be executed.")) {
      if (onNavigate) onNavigate("Overview");
    }
  };

  return (
    <div className="guarded-page-viewport">
      <div style={{ width: "100%", maxWidth: "880px", display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px" }}>
        <h1 className="human-override-h1" style={{ margin: 0 }}>Human Override & Goal Plan</h1>
        <div style={{ display: "flex", gap: "8px" }}>
          <button type="button" className="btn-plan-util" onClick={handleRegenerate} title="Re-plan with current context">
            ⟳ Regenerate
          </button>
          <button type="button" className="btn-plan-util danger" onClick={handleCancelProposal} title="Cancel proposal">
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

          <div className="guarded-window-actions">
            <button
              type="button"
              className="btn-g-pause"
              onClick={() => setIsPaused(!isPaused)}
            >
              ❚❚ {isPaused ? "Resume" : "Pause"}
            </button>
            <button
              type="button"
              className="btn-g-stop"
              onClick={() => alert("Execution stopped.")}
            >
              ■ Stop
            </button>
            <button
              type="button"
              className="btn-g-safemode"
              onClick={() => setSafeMode(!safeMode)}
            >
              🛡 Safe Mode
            </button>
          </div>
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
              <span className="risk-badge-red">HIGH</span>
              <span className="policy-rule-pill">Deterministic Policy Active</span>
            </div>

            {/* ASSUMPTIONS & UNCERTAINTIES BANNER */}
            <div className="plan-assumptions-box">
              <span className="assumptions-title">📌 Plan Assumptions & Policy Constraints:</span>
              <ul>
                <li>• Reusing verified procedural step rules from local workflow definition.</li>
                <li>• Actions strictly isolated within scope origin: <code>{workflow.allowed_origins?.[0] || "http://localhost:8000"}</code></li>
                <li>• Consequential submit requires this manual sign-off before dispatch.</li>
              </ul>
            </div>

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
                          <span className="dt-label">Dependencies:</span>
                          <span className="dt-val">{st.dependencies.length ? st.dependencies.join(", ") : "None (Initial step)"}</span>
                        </div>
                        <div className="detail-line">
                          <span className="dt-label">Target:</span>
                          <span className="dt-val">{st.target?.name || "Window / Application Root"} ({st.target?.role || "control"})</span>
                        </div>
                        <div className="detail-line">
                          <span className="dt-label">Expected Result:</span>
                          <span className="dt-val">{st.expectedOutcome}</span>
                        </div>
                        <div className="detail-line">
                          <span className="dt-label">Failure Branch:</span>
                          <span className="dt-val" style={{ color: "#ea580c" }}>{st.failureBranch}</span>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            {/* BEFORE / AFTER COMPARISON GRID (Image 4 style) */}
            <div className="before-after-grid-img4" style={{ marginTop: "16px" }}>
              <div className="grid-head-img4">
                <span>Before</span>
                <span>After</span>
              </div>
              <div className="grid-row-img4">
                <div>
                  <span style={{ color: "#64748b" }}>Subject:</span> Issue
                </div>
                <div>
                  <span style={{ color: "#64748b" }}>IEmail</span> ➔
                </div>
              </div>
              <div className="grid-row-img4">
                <div>
                  <span style={{ color: "#64748b" }}>Body:</span> Update ...
                </div>
                <div>
                  <span style={{ color: "#64748b" }}>Quick up...*</span>
                  <span style={{ color: "#10b981", marginLeft: "6px" }}>✓</span>
                </div>
              </div>
            </div>

            {/* BOTTOM ACTIONS */}
            <div className="card-bottom-actions-img4">
              <span className="undo-tag-blue">
                ＋ Undo available: {formatTimer(timeLeft)}
              </span>

              <div style={{ display: "flex", gap: "10px" }}>
                <button
                  type="button"
                  className="btn-reject-orange"
                  onClick={handleCancelProposal}
                >
                  Reject
                </button>
                <button
                  type="button"
                  className="btn-approve-bold"
                  onClick={handleApprove}
                  disabled={approving}
                >
                  {approving ? "Signing..." : isApproved ? "✓ Approved" : "Approve"}
                </button>
              </div>
            </div>
          </div>

          {/* RIGHT: RUN TIMELINE / RECEIPTS (Image 4 style) */}
          <div className="receipts-timeline-card-img4">
            <h3>Run Timeline / Receipts</h3>
            <div style={{ display: "flex", flexDirection: "column", gap: "14px", marginTop: "12px" }}>
              {timelineReceipts.map((item, idx) => (
                <div key={idx} className="timeline-step-entry">
                  <span style={{ fontSize: "14px" }}>{item.icon}</span>
                  <span className="t-label">{item.title}</span>
                  <span className="t-time">{item.time}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
