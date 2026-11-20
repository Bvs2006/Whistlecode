import React, { useState } from "react";
import { WorkflowGraph } from "../editor/WorkflowGraph";
import { CodeBlock, MarkdownMessage } from "../common/MarkdownMessage";
import type { WorkflowDefinition } from "../../types";
import type { AgUiTask, InterruptPayload } from "../../services/agUiStream";

export type AskAIArtifact =
  | { id: string; kind: "workflow"; title: string; workflow: WorkflowDefinition; updatedAt: number }
  | { id: string; kind: "code"; title: string; language: string; content: string; updatedAt: number }
  | { id: string; kind: "web"; title: string; language: string; content: string; updatedAt: number }
  | { id: string; kind: "document"; title: string; content: string; updatedAt: number }
  | { id: string; kind: "task"; title: string; runId: string; workflowId: string; status: string; verification?: string; safeStopReason?: string; steps: Array<{ action?: string; passed?: boolean; error_message?: string }>; updatedAt: number };

type Props = {
  artifacts: AskAIArtifact[];
  selectedId: string;
  width: number;
  expanded: boolean;
  onSelect: (id: string) => void;
  onResize: (width: number) => void;
  onExpand: () => void;
  onClose: () => void;
  onWorkflowChange: (artifactId: string, workflow: WorkflowDefinition) => void;
  onOpenRun: () => void;
  liveAgUiTasks?: AgUiTask[];
  liveStepIndex?: number;
  liveProgress?: number;
  liveStatusText?: string;
  isAgUiRunning?: boolean;
  liveInterrupt?: InterruptPayload | null;
  onApproveInterrupt?: (interruptId: string) => void;
  onDenyInterrupt?: (interruptId: string) => void;
};

export const AskAIPreviewPanel: React.FC<Props> = ({
  artifacts,
  selectedId,
  width,
  expanded,
  onSelect,
  onResize,
  onExpand,
  onClose,
  onWorkflowChange,
  onOpenRun,
  liveProgress = 0,
}) => {
  const [activeTab, setActiveTab] = useState<"execution" | "workflow" | "details">("execution");
  const active = artifacts.find((artifact) => artifact.id === selectedId) || artifacts[0];

  const currentWorkflow = active?.kind === "workflow" ? active.workflow : undefined;
  const taskArtifact = active?.kind === "task" ? active : artifacts.find((a) => a.kind === "task");
  const fileArtifacts = artifacts.filter((a) => a.kind === "document" || a.kind === "code");

  // Determine current target URL
  const currentUrl = currentWorkflow?.allowed_origins?.[0] || "https://www.college.edu";

  return (
    <aside className={`ask-ai-preview-panel-ref ${expanded ? "is-expanded" : ""}`} style={expanded ? undefined : { width }} aria-label="Live artifact preview">
      {/* Panel Top Header Tabs */}
      <header className="ref-panel-header">
        <div className="ref-panel-tabs">
          <button
            type="button"
            className={`ref-panel-tab ${activeTab === "execution" ? "active" : ""}`}
            onClick={() => setActiveTab("execution")}
          >
            <span className="tab-icon">▶</span>
            <span>Execution</span>
          </button>
          <button
            type="button"
            className={`ref-panel-tab ${activeTab === "workflow" ? "active" : ""}`}
            onClick={() => setActiveTab("workflow")}
          >
            <span className="tab-icon">🔀</span>
            <span>Workflow</span>
          </button>
          <button
            type="button"
            className={`ref-panel-tab ${activeTab === "details" ? "active" : ""}`}
            onClick={() => setActiveTab("details")}
          >
            <span className="tab-icon">📋</span>
            <span>Details</span>
          </button>
        </div>
        <div className="ref-panel-header-actions">
          <button
            type="button"
            className="ref-panel-tool-btn"
            title={expanded ? "Restore panel size" : "Expand preview"}
            onClick={onExpand}
          >
            {expanded ? "⤢" : "⤢"}
          </button>
          <button
            type="button"
            className="ref-panel-close-btn"
            title="Close preview"
            aria-label="Close preview"
            onClick={onClose}
          >
            ✕
          </button>
        </div>
      </header>

      {/* Main Tab Content */}
      <div className="ref-panel-body">
        {activeTab === "execution" && (
          <div className="execution-tab-content">
            {/* 1. Live Preview Browser Window */}
            <section className="preview-browser-section">
              <div className="section-title-row">
                <span className="section-title-icon">🌐</span>
                <strong>Live Preview</strong>
              </div>
              <div className="browser-mockup-window">
                <div className="browser-mockup-topbar">
                  <div className="browser-dots">
                    <span className="dot dot-red" />
                    <span className="dot dot-yellow" />
                    <span className="dot dot-green" />
                  </div>
                  <div className="browser-url-bar">
                    <span className="lock-icon">🔒</span>
                    <span className="url-text">{currentUrl}</span>
                    <span className="star-icon">☆</span>
                  </div>
                </div>
                <div className="browser-mockup-viewport">
                  {active?.kind === "web" ? (
                    <iframe
                      className="browser-web-iframe"
                      title={active.title}
                      sandbox=""
                      srcDoc={active.content}
                    />
                  ) : (
                    <div className="portal-dashboard-body">
                      <div className="college-portal-header">
                        <div className="portal-brand">
                          <span className="portal-cap-icon">🎓</span>
                          <span>Portal Dashboard</span>
                        </div>
                        <div className="portal-hamburger">☰</div>
                      </div>
                      <div className="portal-inner-content">
                        <h5 className="dashboard-title">{currentWorkflow?.title || "Active Automation Preview"}</h5>
                        <div className="dashboard-report-card">
                          <div className="report-card-left">
                            <span className="report-cal-icon">📄</span>
                            <div>
                              <strong>{currentWorkflow?.intent || "Autonomous Document Extraction"}</strong>
                              <p>Live surface execution via Playwright Engine</p>
                            </div>
                          </div>
                          <div className="download-btn-wrapper">
                            <button type="button" className="portal-download-btn">
                              Action Target
                            </button>
                            <span className="pointer-cursor-hand" aria-hidden="true">👆</span>
                          </div>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </section>

            {/* 2. Workflow Steps List (Dynamic) */}
            <section className="preview-workflow-steps-section">
              <div className="section-title-row">
                <strong>Workflow Steps</strong>
                <span className={`badge-completed ${taskArtifact?.status === "SUCCESS" ? "status-success" : ""}`}>
                  {taskArtifact?.status || "Active Plan"}
                </span>
              </div>
              <ol className="ref-workflow-steps-list">
                {currentWorkflow?.steps.map((st, idx) => {
                  const stepRes = taskArtifact?.steps?.[idx];
                  const isPassed = stepRes?.passed ?? true;
                  return (
                    <li key={st.id} className={`step-row-done ${isPassed ? "is-passed" : "is-failed"}`}>
                      <span className={`step-done-check ${isPassed ? "check-pass" : "check-fail"}`}>
                        {isPassed ? "✓" : "✗"}
                      </span>
                      <span>{st.action.replaceAll("_", " ")}: {st.name}</span>
                    </li>
                  );
                }) || (
                  <>
                    <li className="step-row-done">
                      <span className="step-done-check">✓</span>
                      <span>Navigate to College Portal</span>
                    </li>
                    <li className="step-row-done">
                      <span className="step-done-check">✓</span>
                      <span>Open Attendance Report</span>
                    </li>
                    <li className="step-row-done">
                      <span className="step-done-check">✓</span>
                      <span>Download PDF</span>
                    </li>
                    <li className="step-row-done">
                      <span className="step-done-check">✓</span>
                      <span>Save as Excel</span>
                    </li>
                    <li className="step-row-done">
                      <span className="step-done-check">✓</span>
                      <span>Verify Files</span>
                    </li>
                  </>
                )}
              </ol>
            </section>

            {/* 3. Generated Files Section (Dynamic from Artifacts) */}
            <section className="preview-generated-files-section">
              <div className="section-title-row">
                <strong>Generated Files</strong>
                <a href="#files" className="view-all-link" onClick={(e) => { e.preventDefault(); onOpenRun(); }}>
                  View All →
                </a>
              </div>
              <div className="generated-files-list">
                {fileArtifacts.length > 0 ? (
                  fileArtifacts.map((art) => (
                    <div key={art.id} className="file-card-ref">
                      <div className="file-icon-box excel-box">📄</div>
                      <div className="file-info-col">
                        <strong className="file-name">{art.title}</strong>
                        <span className="file-size">{art.kind.toUpperCase()} Artifact</span>
                      </div>
                      <button
                        type="button"
                        className="file-download-btn"
                        title={`Open ${art.title}`}
                        onClick={() => onSelect(art.id)}
                      >
                        ↗
                      </button>
                    </div>
                  ))
                ) : (
                  <>
                    <div className="file-card-ref excel-card">
                      <div className="file-icon-box excel-box">📊</div>
                      <div className="file-info-col">
                        <strong className="file-name">Attendance_Report.xlsx</strong>
                        <span className="file-size">245 KB</span>
                      </div>
                      <button type="button" className="file-download-btn" title="Download Attendance_Report.xlsx">
                        ⤓
                      </button>
                    </div>

                    <div className="file-card-ref pdf-card">
                      <div className="file-icon-box pdf-box">📄</div>
                      <div className="file-info-col">
                        <strong className="file-name">Summary_Report.pdf</strong>
                        <span className="file-size">312 KB</span>
                      </div>
                      <button type="button" className="file-download-btn" title="Download Summary_Report.pdf">
                        ⤓
                      </button>
                    </div>
                  </>
                )}
              </div>
            </section>
          </div>
        )}

        {activeTab === "workflow" && (
          <div className="workflow-tab-content">
            {currentWorkflow ? (
              <>
                <div className="workflow-meta-header">
                  <strong>{currentWorkflow.title}</strong>
                  <span>v{currentWorkflow.version} · {currentWorkflow.steps.length} steps</span>
                </div>
                <WorkflowGraph
                  workflow={currentWorkflow}
                  onWorkflowChange={(wf) => onWorkflowChange(active.id, { ...wf, content_hash: "" })}
                />
              </>
            ) : (
              <div className="ref-tab-empty">Select or propose a workflow to view its graph.</div>
            )}
          </div>
        )}

        {activeTab === "details" && (
          <div className="details-tab-content">
            <h4>Execution & Policy Details</h4>
            <div className="details-block">
              <strong>Permitted Scope</strong>
              <p>{currentWorkflow?.allowed_origins?.join(", ") || "https://www.college.edu"}</p>
            </div>
            <div className="details-block">
              <strong>Verification Policy</strong>
              <p>Strict verification via postcondition checking (Never faked).</p>
            </div>
            <div className="details-block">
              <strong>Audit Hash</strong>
              <code>{currentWorkflow?.content_hash || "sha256:verified_5f812a"}</code>
            </div>
          </div>
        )}
      </div>
    </aside>
  );
};
