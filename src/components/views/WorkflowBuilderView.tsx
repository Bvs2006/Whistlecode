import React, { useState } from "react";
import type { WorkflowDefinition, AppSection } from "../../types";

type ViewTab = "editor" | "executions" | "library";
type DisplayLayout = "cards" | "table";

type SavedWorkflowItem = {
  id: string;
  title: string;
  intent: string;
  tags: string[];
  version: number;
  content_hash: string;
  isEnabled: boolean;
  isArchived: boolean;
  createdAt: string;
  lastRunStatus: string;
  stepCount: number;
};

type Props = {
  workflow: WorkflowDefinition;
  onWorkflowSaved: (wf: WorkflowDefinition) => void;
  onNavigateToPreview: () => void;
  onNavigate?: (section: AppSection) => void;
};

export const WorkflowBuilderView: React.FC<Props> = ({
  workflow,
  onWorkflowSaved,
  onNavigateToPreview,
  onNavigate,
}) => {
  const [activeTab, setActiveTab] = useState<ViewTab>("editor");
  const [workflowActive, setWorkflowActive] = useState(true);
  const [historyFilter, setHistoryFilter] = useState<"All" | "In progress" | "Completed" | "Failed">("All");

  // Library State
  const [layoutMode, setLayoutMode] = useState<DisplayLayout>("cards");
  const [searchQuery, setSearchQuery] = useState("");
  const [showArchived, setShowArchived] = useState(false);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);

  // Saved Workflows Library List
  const [savedWorkflows, setSavedWorkflows] = useState<SavedWorkflowItem[]>([
    {
      id: "wf_create_customer",
      title: "Support Ticket Automation & Customer Portal",
      intent: "Observe and execute support ticket routing, customer profile registration, and CRM synchronization",
      tags: ["CRM", "Zendesk", "High Risk Gate"],
      version: 1,
      content_hash: "sha256:d8a9e0f391b19a3b68f94d930219c1b3f021938b8120391c01b239481923ab91",
      isEnabled: true,
      isArchived: false,
      createdAt: "2026-10-18",
      lastRunStatus: "Completed",
      stepCount: 4,
    },
    {
      id: "wf_research",
      title: "Research Paper Organizer",
      intent: "Organize AI research papers by conference topic into sandboxed directories",
      tags: ["Files", "Sandbox", "Reversible"],
      version: 2,
      content_hash: "sha256:4a7e9b2c1d3f5a8e0b6d2c4e6a8f0b2d4c6e8a0f2b4d6c8e0a2f4b6d8c0e2a4f",
      isEnabled: true,
      isArchived: false,
      createdAt: "2026-10-19",
      lastRunStatus: "Completed",
      stepCount: 6,
    },
    {
      id: "wf_price_checker",
      title: "Product Price & Discount Checker",
      intent: "Navigate e-commerce listings, extract item prices, and flag discounts > 20%",
      tags: ["E-Commerce", "Scraper", "Plugins"],
      version: 1,
      content_hash: "sha256:1f2e3d4c5b6a7f8e9d0c1b2a3f4e5d6c7b8a9f0e1d2c3b4a5f6e7d8c9b0a1f2e",
      isEnabled: false,
      isArchived: false,
      createdAt: "2026-10-17",
      lastRunStatus: "Failed",
      stepCount: 8,
    },
    {
      id: "wf_legacy_archive",
      title: "Legacy CSV Batch Exporter",
      intent: "Old script before plugin architecture migration",
      tags: ["Legacy", "Archived"],
      version: 3,
      content_hash: "sha256:9a8b7c6d5e4f3a2b1c0d9e8f7a6b5c4d3e2f1a0b9c8d7e6f5a4b3c2d1e0f9a8b",
      isEnabled: false,
      isArchived: true,
      createdAt: "2026-09-12",
      lastRunStatus: "Completed",
      stepCount: 5,
    },
  ]);

  const executionHistory = [
    { id: "#2487", time: "5m ago · 210 credits", duration: "2h 14m", status: "Completed" },
    { id: "#2486", time: "1hr ago · 140 credits", duration: "2h 14m", status: "Completed" },
    { id: "#2485", time: "2hrs ago · 132 credits", duration: "47m (running)", status: "In progress" },
    { id: "#2484", time: "1d ago, 18:42 · 45 credits", duration: "12m", status: "Failed" },
    { id: "#2483", time: "1d ago, 15:23 · 231 credits", duration: "2h 10m", status: "Completed" },
    { id: "#2482", time: "1d ago, 10:22 · 23 credits", duration: "9m", status: "Failed" },
    { id: "#2481", time: "1d ago, 09:12 · 140 credits", duration: "2h 12m", status: "Completed" },
  ];

  const filteredHistory = historyFilter === "All"
    ? executionHistory
    : executionHistory.filter((h) => h.status === historyFilter);

  // Filtered Library Items
  const filteredWorkflows = savedWorkflows.filter((w) => {
    if (!showArchived && w.isArchived) return false;
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      return (
        w.title.toLowerCase().includes(q) ||
        w.intent.toLowerCase().includes(q) ||
        w.tags.some((t) => t.toLowerCase().includes(q))
      );
    }
    return true;
  });

  // Library Handlers
  const handleToggleEnable = (id: string) => {
    setSavedWorkflows(
      savedWorkflows.map((w) => (w.id === id ? { ...w, isEnabled: !w.isEnabled } : w))
    );
  };

  const handleToggleArchive = (id: string) => {
    setSavedWorkflows(
      savedWorkflows.map((w) => (w.id === id ? { ...w, isArchived: !w.isArchived } : w))
    );
  };

  const handleDuplicate = (id: string) => {
    const item = savedWorkflows.find((w) => w.id === id);
    if (!item) return;
    const duplicated: SavedWorkflowItem = {
      ...item,
      id: `wf_copy_${Date.now().toString(36)}`,
      title: `Copy of ${item.title}`,
      version: 1,
      createdAt: new Date().toISOString().split("T")[0],
      lastRunStatus: "Not run yet",
    };
    setSavedWorkflows([duplicated, ...savedWorkflows]);
  };

  const handleDeleteConfirmed = () => {
    if (!deleteConfirmId) return;
    setSavedWorkflows(savedWorkflows.filter((w) => w.id !== deleteConfirmId));
    setDeleteConfirmId(null);
  };

  const handleOpenWorkflowDetails = (item: SavedWorkflowItem) => {
    const loadedWf: WorkflowDefinition = {
      workflow_id: item.id,
      title: item.title,
      intent: item.intent,
      allowed_origins: ["http://localhost:8000"],
      parameters: [],
      steps: workflow.steps,
      final_postconditions: [],
      version: item.version,
      content_hash: item.content_hash,
    };
    onWorkflowSaved(loadedWf);
    setActiveTab("editor");
  };

  return (
    <div className="builder-viewport-wrapper">
      {/* TOP BUILDER HEADER (Image 3 style) */}
      <div className="builder-topbar-img3">
        <div className="builder-topbar-left">
          <div className="breadcrumb-img3">
            <span className="folder-icon">📁</span>
            <span>Projects /</span>
            <strong>{workflow.title || "Support Ticket Automation"} ▾</strong>
          </div>
        </div>

        {/* 3-WAY SEGMENTED PILL */}
        <div className="mode-toggle-pills-img3">
          <button
            type="button"
            className={`mode-pill-img3 ${activeTab === "editor" ? "active" : ""}`}
            onClick={() => setActiveTab("editor")}
          >
            Editor
          </button>
          <button
            type="button"
            className={`mode-pill-img3 ${activeTab === "executions" ? "active" : ""}`}
            onClick={() => setActiveTab("executions")}
          >
            Executions
          </button>
          <button
            type="button"
            className={`mode-pill-img3 ${activeTab === "library" ? "active" : ""}`}
            onClick={() => setActiveTab("library")}
          >
            Library ({savedWorkflows.length})
          </button>
        </div>

        <div className="builder-topbar-right">
          <label className="active-toggle-img3">
            <span>Workflow active</span>
            <input
              type="checkbox"
              checked={workflowActive}
              onChange={(e) => setWorkflowActive(e.target.checked)}
            />
          </label>
          <button type="button" className="btn-white-share">
            ↗ Share
          </button>
          <button
            type="button"
            className="btn-blue-edit"
            onClick={onNavigateToPreview}
            disabled={!workflowActive}
            title={workflowActive ? "Approve and verify workflow" : "Workflow is disabled"}
          >
            Plan & Approve →
          </button>
        </div>
      </div>

      {/* MODE 1: VISUAL FLOWCHART EDITOR (Image 3 canvas) */}
      {activeTab === "editor" && (
        <div className="builder-two-col-layout">
          {/* DOT GRID CANVAS */}
          <div className="builder-canvas-dotgrid">
            <div className="flowchart-nodes-column">
              {/* NODE 1: TRIGGER */}
              <div className="canvas-flow-node">
                <div className="flow-node-app-bar">
                  <span className="node-app-icon">⚡</span>
                  <span className="node-app-title">Zendesk</span>
                  <span className="node-three-dots">⋮</span>
                </div>
                <h4>New ticket created</h4>
              </div>

              <div className="canvas-wire-vertical" />

              {/* NODE 2: AI AGENT */}
              <div className="canvas-flow-node">
                <div className="flow-node-app-bar">
                  <span className="node-app-icon">🤖</span>
                  <span className="node-app-title">WhistleCode AI Agent</span>
                  <span className="node-three-dots">⋮</span>
                </div>
                <h4>AI Validation & Categorization</h4>
                <ul className="bullet-points-img3">
                  <li>• Detect sentiment & intent</li>
                  <li>• Identify urgency level</li>
                  <li>• Classify issue category</li>
                </ul>

                <div className="side-satellite-icon" title="Memory state">
                  🗄️
                </div>
                <div className="side-satellite-icon satellite-spark" title="AI Model">
                  ✨
                </div>
              </div>

              <div className="canvas-wire-vertical" />

              {/* NODE 3: IF CONDITION */}
              <div className="canvas-flow-node">
                <div className="flow-node-app-bar">
                  <span className="node-app-icon">🔀</span>
                  <span className="node-app-title">If Condition</span>
                  <span className="node-three-dots">⋮</span>
                </div>
                <h4>Urgency == 'HIGH' or Rating &lt; 4.0</h4>
                <div className="condition-split-handles">
                  <span className="tag-true-green">true ➔</span>
                  <span className="tag-false-red">false ➔</span>
                </div>
              </div>

              {/* SPLIT BRANCHES */}
              <div className="split-branches-container">
                {/* TRUE BRANCH (LEFT) */}
                <div className="branch-sub-column">
                  <div className="canvas-wire-vertical" />
                  <div className="canvas-flow-node">
                    <div className="flow-node-app-bar">
                      <span className="node-app-icon">💬</span>
                      <span className="node-app-title">Slack</span>
                    </div>
                    <h4>Notify senior support agent</h4>
                  </div>

                  <div className="canvas-wire-vertical" />
                  <div className="canvas-flow-node">
                    <div className="flow-node-app-bar">
                      <span className="node-app-icon">⚡</span>
                      <span className="node-app-title">Zendesk</span>
                    </div>
                    <h4>Assign ticket</h4>
                  </div>
                </div>

                {/* FALSE BRANCH (RIGHT) */}
                <div className="branch-sub-column">
                  <div className="canvas-wire-vertical" />
                  <div className="canvas-flow-node">
                    <div className="flow-node-app-bar">
                      <span className="node-app-icon">💬</span>
                      <span className="node-app-title">Slack</span>
                    </div>
                    <h4>Notify support agent</h4>
                  </div>
                </div>
              </div>

              <div className="canvas-wire-vertical" />

              {/* MERGED FINISH NODE */}
              <div className="canvas-flow-node">
                <div className="flow-node-app-bar">
                  <span className="node-app-icon">⚡</span>
                  <span className="node-app-title">Zendesk</span>
                  <span className="node-three-dots">⋮</span>
                </div>
                <h4>Update ticket status</h4>
              </div>
            </div>

            {/* BOTTOM USAGE DIAGRAM CHART (Image 3 style) */}
            <div className="canvas-bottom-chart-card">
              <div className="chart-header-row-img3">
                <strong>📈 Usage diagram</strong>
                <small>Last 30 days</small>
              </div>
              <div className="chart-svg-container">
                <svg viewBox="0 0 700 80" className="chart-svg-element">
                  <defs>
                    <linearGradient id="purpleGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#8b5cf6" stopOpacity="0.25" />
                      <stop offset="100%" stopColor="#8b5cf6" stopOpacity="0" />
                    </linearGradient>
                    <linearGradient id="blueGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#3b82f6" stopOpacity="0.25" />
                      <stop offset="100%" stopColor="#3b82f6" stopOpacity="0" />
                    </linearGradient>
                  </defs>
                  <path
                    d="M 10 50 Q 80 15, 160 45 T 320 40 T 480 20 T 640 45 L 640 80 L 10 80 Z"
                    fill="url(#purpleGrad)"
                  />
                  <path
                    d="M 10 50 Q 80 15, 160 45 T 320 40 T 480 20 T 640 45"
                    fill="none"
                    stroke="#8b5cf6"
                    strokeWidth="2.5"
                  />
                  <path
                    d="M 10 30 Q 90 60, 180 35 T 340 45 T 500 55 T 640 30 L 640 80 L 10 80 Z"
                    fill="url(#blueGrad)"
                  />
                  <path
                    d="M 10 30 Q 90 60, 180 35 T 340 45 T 500 55 T 640 30"
                    fill="none"
                    stroke="#3b82f6"
                    strokeWidth="2.5"
                  />
                </svg>
                <div className="chart-tooltip-floating">
                  <div>December 20, 2026</div>
                  <div style={{ color: "#a78bfa" }}>● Credits: 185</div>
                  <div style={{ color: "#60a5fa" }}>● Data transfer: 155kb</div>
                </div>
              </div>
            </div>
          </div>

          {/* RIGHT SIDEBAR */}
          <aside className="builder-sidebar-img3">
            <div className="sidebar-box-img3">
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "10px" }}>
                <h4>☊ Workflow usage</h4>
                <small style={{ color: "#64748b", cursor: "pointer" }}>Last 30 days ▾</small>
              </div>
              <div className="metric-doublet-row">
                <div className="metric-doublet-card">
                  <span style={{ fontSize: "16px" }}>🔗</span>
                  <div className="doublet-meta">
                    <small>Credit usage ⓘ</small>
                    <strong>10,831</strong>
                  </div>
                </div>
                <div className="metric-doublet-card">
                  <span style={{ fontSize: "16px" }}>⚡</span>
                  <div className="doublet-meta">
                    <small>Data transfer ⓘ</small>
                    <strong>10,21mb</strong>
                  </div>
                </div>
              </div>
            </div>

            <div className="sidebar-box-img3">
              <h4>📄 Execution history</h4>
              <div className="history-filter-strip">
                {(["All", "In progress", "Completed", "Failed"] as const).map((tab) => (
                  <button
                    key={tab}
                    type="button"
                    className={`hist-chip ${historyFilter === tab ? "active" : ""}`}
                    onClick={() => setHistoryFilter(tab)}
                  >
                    {tab}
                  </button>
                ))}
              </div>

              <div className="runs-stream-img3">
                {filteredHistory.map((run) => (
                  <div key={run.id} className="run-card-item-img3">
                    <div style={{ fontSize: "16px", color: "#2563eb" }}>⚡</div>
                    <div className="run-middle-text">
                      <div className="run-id-header">
                        <strong>{run.id}</strong>
                        <span className="run-ago">{run.duration}</span>
                      </div>
                      <span className="run-credit-pill">{run.time}</span>
                    </div>
                    <span
                      className={`run-state-badge ${
                        run.status === "Completed"
                          ? "badge-completed"
                          : run.status === "In progress"
                          ? "badge-inprogress"
                          : "badge-failed"
                      }`}
                    >
                      {run.status}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </aside>
        </div>
      )}

      {/* MODE 2: EXECUTIONS RUN STREAM */}
      {activeTab === "executions" && (
        <div style={{ padding: "30px", maxWidth: "900px", margin: "0 auto", width: "100%" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "20px" }}>
            <h3>Workflow Execution Stream</h3>
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              onClick={() => onNavigate && onNavigate("Live Run")}
            >
              Open Live Console →
            </button>
          </div>
          <div className="runs-stream-img3">
            {executionHistory.map((run) => (
              <div key={run.id} className="run-card-item-img3" style={{ padding: "14px", background: "#ffffff" }}>
                <div style={{ fontSize: "18px", color: "#2563eb" }}>⚡</div>
                <div className="run-middle-text">
                  <div className="run-id-header">
                    <strong style={{ fontSize: "13px" }}>{run.id}</strong>
                    <span className="run-ago">{run.duration}</span>
                  </div>
                  <span className="run-credit-pill">{run.time} · Deterministic Postconditions Checked</span>
                </div>
                <span className={`run-state-badge badge-${run.status.toLowerCase().replace(' ', '')}`}>
                  {run.status}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* MODE 3: MY WORKFLOWS LIBRARY (Prompt 6) */}
      {activeTab === "library" && (
        <div className="workflow-library-container">
          <div className="library-top-controls">
            <div className="library-search-box">
              <span style={{ color: "#64748b" }}>🔍</span>
              <input
                type="text"
                placeholder="Search workflows by title, intent, or tag..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>

            <div className="library-filter-actions">
              <label className="toggle-archived-label">
                <input
                  type="checkbox"
                  checked={showArchived}
                  onChange={(e) => setShowArchived(e.target.checked)}
                />
                <span>Include Archived</span>
              </label>

              <div className="layout-toggle-group">
                <button
                  type="button"
                  className={`btn-layout-chip ${layoutMode === "cards" ? "active" : ""}`}
                  onClick={() => setLayoutMode("cards")}
                >
                  Cards
                </button>
                <button
                  type="button"
                  className={`btn-layout-chip ${layoutMode === "table" ? "active" : ""}`}
                  onClick={() => setLayoutMode("table")}
                >
                  Table
                </button>
              </div>
            </div>
          </div>

          {/* EMPTY STATE */}
          {filteredWorkflows.length === 0 && (
            <div className="library-empty-state">
              <div className="empty-icon">📂</div>
              <h4>No matching workflows found</h4>
              <p>Try refining your search query or enable "Include Archived".</p>
            </div>
          )}

          {/* CARDS LAYOUT */}
          {layoutMode === "cards" && (
            <div className="library-cards-grid">
              {filteredWorkflows.map((item) => (
                <div
                  key={item.id}
                  className={`library-wf-card ${!item.isEnabled ? "card-disabled" : ""} ${item.isArchived ? "card-archived" : ""}`}
                >
                  <div className="lib-card-head">
                    <div className="lib-card-title-group">
                      <h4>{item.title}</h4>
                      <span className="lib-ver-pill">v{item.version}</span>
                    </div>
                    <span className={`lib-status-tag ${item.isArchived ? "status-archived" : item.isEnabled ? "status-active" : "status-disabled"}`}>
                      {item.isArchived ? "Archived" : item.isEnabled ? "Active" : "Disabled"}
                    </span>
                  </div>

                  <p className="lib-card-intent">{item.intent}</p>

                  <div className="lib-tags-list">
                    {item.tags.map((t, idx) => (
                      <span key={idx} className="lib-tag-pill">{t}</span>
                    ))}
                  </div>

                  <div className="lib-card-meta">
                    <span>{item.stepCount} steps</span>
                    <span>Created: {item.createdAt}</span>
                    <span className={`lib-run-status ${item.lastRunStatus === "Completed" ? "run-ok" : "run-fail"}`}>
                      ● {item.lastRunStatus}
                    </span>
                  </div>

                  {/* DISTINCT ACTIONS: OPEN, DUPLICATE, TOGGLE, DELETE */}
                  <div className="lib-card-actions-bar">
                    <button
                      type="button"
                      className="btn-lib-action primary"
                      onClick={() => handleOpenWorkflowDetails(item)}
                      title="Open details in editor (does not run)"
                    >
                      View in Builder
                    </button>
                    <button
                      type="button"
                      className="btn-lib-action"
                      onClick={() => handleDuplicate(item.id)}
                      title="Duplicate workflow"
                    >
                      Duplicate
                    </button>
                    <button
                      type="button"
                      className="btn-lib-action"
                      onClick={() => handleToggleEnable(item.id)}
                      title={item.isEnabled ? "Disable workflow" : "Enable workflow"}
                    >
                      {item.isEnabled ? "Disable" : "Enable"}
                    </button>
                    <button
                      type="button"
                      className="btn-lib-action"
                      onClick={() => handleToggleArchive(item.id)}
                      title={item.isArchived ? "Unarchive" : "Archive"}
                    >
                      {item.isArchived ? "Unarchive" : "Archive"}
                    </button>
                    <button
                      type="button"
                      className="btn-lib-action danger"
                      onClick={() => setDeleteConfirmId(item.id)}
                      title="Delete workflow"
                    >
                      🗑
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* TABLE LAYOUT */}
          {layoutMode === "table" && (
            <div className="library-table-wrapper">
              <table className="library-table">
                <thead>
                  <tr>
                    <th>Title & Version</th>
                    <th>Intent</th>
                    <th>Tags</th>
                    <th>Steps</th>
                    <th>Last Run</th>
                    <th>Status</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredWorkflows.map((item) => (
                    <tr key={item.id} className={!item.isEnabled ? "row-disabled" : ""}>
                      <td>
                        <strong>{item.title}</strong>
                        <span className="lib-ver-pill" style={{ marginLeft: "6px" }}>v{item.version}</span>
                      </td>
                      <td style={{ maxWidth: "240px", fontSize: "11px", color: "#64748b" }}>
                        {item.intent}
                      </td>
                      <td>
                        <div className="lib-tags-list">
                          {item.tags.map((t, i) => (
                            <span key={i} className="lib-tag-pill">{t}</span>
                          ))}
                        </div>
                      </td>
                      <td>{item.stepCount}</td>
                      <td>
                        <span className={`lib-run-status ${item.lastRunStatus === "Completed" ? "run-ok" : "run-fail"}`}>
                          {item.lastRunStatus}
                        </span>
                      </td>
                      <td>
                        <span className={`lib-status-tag ${item.isArchived ? "status-archived" : item.isEnabled ? "status-active" : "status-disabled"}`}>
                          {item.isArchived ? "Archived" : item.isEnabled ? "Active" : "Disabled"}
                        </span>
                      </td>
                      <td>
                        <div style={{ display: "flex", gap: "6px" }}>
                          <button
                            type="button"
                            className="btn-lib-action primary"
                            onClick={() => handleOpenWorkflowDetails(item)}
                          >
                            Open
                          </button>
                          <button
                            type="button"
                            className="btn-lib-action"
                            onClick={() => handleDuplicate(item.id)}
                          >
                            Copy
                          </button>
                          <button
                            type="button"
                            className="btn-lib-action danger"
                            onClick={() => setDeleteConfirmId(item.id)}
                          >
                            🗑
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* CONFIRMATION MODAL FOR DELETION */}
          {deleteConfirmId && (
            <div className="delete-modal-overlay">
              <div className="delete-modal-card">
                <h3>Confirm Workflow Deletion</h3>
                <p>
                  Are you sure you want to delete this workflow definition?
                </p>
                <div className="delete-retention-notice">
                  <span>ℹ️ Audit Retention Notice:</span>
                  <p>
                    Deleting this definition removes the workflow and its version tree. However, all historical execution receipts, verification logs, and audit entries in the cryptographic ledger will remain preserved for compliance.
                  </p>
                </div>
                <div className="delete-modal-actions">
                  <button
                    type="button"
                    className="btn btn-secondary btn-sm"
                    onClick={() => setDeleteConfirmId(null)}
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    className="btn btn-danger btn-sm"
                    style={{ background: "#ef4444", color: "#ffffff", border: "none", padding: "6px 14px", borderRadius: "6px" }}
                    onClick={handleDeleteConfirmed}
                  >
                    Delete Workflow
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
