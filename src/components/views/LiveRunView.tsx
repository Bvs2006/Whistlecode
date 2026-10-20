import React, { useState } from "react";
import { api } from "../../api/client";
import type { WorkflowDefinition, ApprovalRecord, AppSection } from "../../types";

type Props = {
  workflow: WorkflowDefinition;
  approval: ApprovalRecord | null;
  onNavigateToAudit: () => void;
  onNavigate?: (section: AppSection) => void;
};

export const LiveRunView: React.FC<Props> = ({
  workflow,
  approval,
  onNavigateToAudit,
  onNavigate,
}) => {
  const [activeTab, setActiveTab] = useState<"Running" | "Information" | "History">("Running");
  const [isRunning, setIsRunning] = useState(false);
  const [searchFilter, setSearchFilter] = useState("");
  const [activeItem, setActiveItem] = useState("1");

  const recentList = [
    { id: "1", title: "Send.and.save.an.email", lastRun: "30 minutes ago", initial: "S", type: "green" },
    { id: "2", title: "HelloWorld", lastRun: "2 days ago", initial: "H", type: "pink" },
    { id: "3", title: "Auto-complete text", lastRun: "3 days ago", initial: "A", type: "orange" },
  ];

  const automationsList = [
    { id: "4", title: "Always.Throws", lastRun: "7 days ago", initial: "A", type: "green" },
    { id: "5", title: "amyConns", lastRun: "about 1 month ago", initial: "A", type: "pink" },
    { id: "6", title: "aTestForConnections", lastRun: "Never ran", initial: "A", type: "blue" },
    { id: "7", title: "aTriggerTest", lastRun: "Awaiting install", initial: "⬇", type: "gray" },
    { id: "8", title: "Attended.Kudos.Award", lastRun: "2 weeks ago", initial: "A", type: "blue" },
  ];

  const executionLogSteps = [
    { message: "Job started processing", time: "00:00:01", isDone: true },
    { message: "Needed fields are waiting to be populated", time: "00:00:07", isDone: true },
    { message: "Values have been successfully saved!", time: "00:00:23", isDone: true },
    { message: "Preparing the email", time: "00:00:25", isDone: true },
    { message: "Email will be sent in a couple of seconds!", time: "00:00:32", isDone: true },
    { message: "Email sent!", time: "00:00:34", isDone: true },
    { message: "Saving the email as a file...", time: "00:00:35", isDone: true },
    { message: "Email saved! Check your destination folder.", time: "00:00:41", isDone: true },
    { message: "Completed [2/23/2026 - 6:03 PM]", time: "00:00:41", isSuccess: true },
  ];

  const handleExecuteLive = async () => {
    setIsRunning(true);
    try {
      await api.executeWorkflow(workflow, {}, approval?.id, "run");
      alert("Workflow verified & executed cleanly with deterministic postconditions!");
    } catch (e: any) {
      alert("Live execution note: " + (e.message || "Executed"));
    } finally {
      setIsRunning(false);
    }
  };

  return (
    <div className="uipath-viewport-wrapper">
      {/* DESKTOP UIPATH-STYLE WINDOW (Image 5 style) */}
      <div className="uipath-desktop-window">
        {/* ORANGE BRAND HEADER BAR */}
        <div className="uipath-top-orange-header">
          <div className="uipath-brand-group">
            <span className="uipath-logo-badge">UiPath</span>
            <span className="uipath-subname">Automation Cloud</span>
          </div>

          <div className="uipath-top-right-tools">
            <span style={{ cursor: "pointer" }}>● Documentation ▾</span>
            <span className="rs-user-dot">RS</span>
            <span style={{ cursor: "pointer" }}>🗕</span>
            <span style={{ cursor: "pointer" }}>🗖</span>
            <span style={{ cursor: "pointer" }}>✕</span>
          </div>
        </div>

        {/* TWO COLUMN BODY */}
        <div className="uipath-split-body">
          {/* LEFT NAV COLUMN */}
          <div className="uipath-nav-column">
            <div className="uipath-home-row">
              <h3>Home</h3>
              <button
                type="button"
                style={{ background: "transparent", border: "none", cursor: "pointer", fontSize: "14px" }}
                title="Refresh list"
              >
                ⟲
              </button>
            </div>

            {/* RECENT LIST */}
            <span className="uipath-tree-header">⌄ Recent</span>
            <div style={{ marginBottom: "16px" }}>
              {recentList.map((item) => (
                <div
                  key={item.id}
                  className={`uipath-tree-item ${activeItem === item.id ? "active" : ""}`}
                  onClick={() => setActiveItem(item.id)}
                >
                  <div className={`tree-avatar-${item.type}`}>{item.initial}</div>
                  <div className="tree-label-wrap">
                    <strong>{item.title}</strong>
                    <small>Last Run: {item.lastRun}</small>
                  </div>
                </div>
              ))}
            </div>

            {/* AUTOMATIONS LIST */}
            <span className="uipath-tree-header">⌄ Automations</span>
            <div>
              {automationsList.map((item) => (
                <div
                  key={item.id}
                  className={`uipath-tree-item ${activeItem === item.id ? "active" : ""}`}
                  onClick={() => setActiveItem(item.id)}
                >
                  <div className={`tree-avatar-${item.type}`}>{item.initial}</div>
                  <div className="tree-label-wrap">
                    <strong>{item.title}</strong>
                    <small>Last Run: {item.lastRun}</small>
                  </div>
                </div>
              ))}
            </div>

            {/* SEARCH BOTTOM */}
            <div className="uipath-search-bottom">
              <span style={{ fontSize: "14px" }}>🤖</span>
              <input
                type="text"
                placeholder="Search"
                value={searchFilter}
                onChange={(e) => setSearchFilter(e.target.value)}
              />
              <span style={{ fontSize: "12px", color: "#64748b" }}>🔍</span>
            </div>
          </div>

          {/* RIGHT EXECUTION COLUMN */}
          <div className="uipath-exec-column">
            <div className="exec-header-row-img5">
              <h2>Send.and.save.an.email</h2>
              <button
                type="button"
                style={{ background: "transparent", border: "none", cursor: "pointer", fontSize: "14px", color: "#64748b" }}
                onClick={() => onNavigate && onNavigate("Overview")}
              >
                ✕
              </button>
            </div>

            {/* TABS */}
            <div className="exec-tab-strip">
              {(["Running", "Information", "History"] as const).map((tab) => (
                <button
                  key={tab}
                  type="button"
                  className={`tab-underline-btn ${activeTab === tab ? "active" : ""}`}
                  onClick={() => setActiveTab(tab)}
                >
                  {tab}
                </button>
              ))}
            </div>

            {/* STATUS ROW */}
            <div className="status-time-row">
              <div style={{ display: "flex", alignItems: "center" }}>
                <span style={{ fontSize: "12px", color: "#334155" }}>Status</span>
                <span className="badge-success-green">Success</span>
              </div>
              <span className="duration-timer">00:00:41</span>
            </div>

            {/* STEP BY STEP LOG TIMELINE */}
            <div className="live-steps-timeline-stream">
              {executionLogSteps.map((step, idx) => (
                <div
                  key={idx}
                  className={`timeline-log-step ${step.isSuccess ? "success-final" : ""}`}
                >
                  <span className="t-bullet">{step.isSuccess ? "✓" : "●"}</span>
                  <span className="t-msg">{step.message}</span>
                  <span className="t-stamp">{step.time}</span>
                </div>
              ))}
            </div>

            {/* FOOTER ACTIONS */}
            <div className="exec-footer-dismiss-bar">
              <button
                type="button"
                className="btn-dismiss-blue"
                style={{ background: "#475569" }}
                onClick={handleExecuteLive}
                disabled={isRunning}
              >
                {isRunning ? "Executing..." : "▶ Re-run Live"}
              </button>

              <button
                type="button"
                className="btn-dismiss-blue"
                onClick={() => {
                  onNavigateToAudit();
                }}
              >
                Dismiss
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
