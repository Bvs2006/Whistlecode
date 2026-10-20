import React, { useState } from "react";
import type { AppSection, WorkflowDefinition, AgentState, ActiveTask, PendingApproval } from "../../types";

type Props = {
  onNavigate: (section: AppSection) => void;
  onSelectWorkflow: (wf: WorkflowDefinition) => void;
};

// Realistic sample workflows clearly labeled as sample data
const SAMPLE_RECENT_WORKFLOWS = [
  {
    id: "wf_research",
    title: "Research Paper Organizer",
    intent: "Organize downloaded AI research papers by conference & topic into sandbox directories",
    stepsCount: 6,
    lastUsed: "12m ago",
    icon: "📄",
    status: "Completed" as AgentState,
    isSampleData: true,
  },
  {
    id: "wf_price_checker",
    title: "Product Price & Discount Checker",
    intent: "Navigate e-commerce listings, extract item prices, and flag discounts > 20%",
    stepsCount: 8,
    lastUsed: "2h ago",
    icon: "🛍️",
    status: "Completed" as AgentState,
    isSampleData: true,
  },
  {
    id: "wf_restaurant_sugilite",
    title: "Restaurant Finder (SUGILITE Benchmark)",
    intent: "Disambiguate dining choices by rating (>= 4.5), distance (< 1 mi), or budget tier",
    stepsCount: 5,
    lastUsed: "Yesterday",
    icon: "🍽️",
    status: "Completed" as AgentState,
    isSampleData: true,
  },
  {
    id: "wf_customer_form",
    title: "Customer Profile & SaaS Portal Registration",
    intent: "Deterministic form fill with parameter extraction and confirmation gate before submit",
    stepsCount: 4,
    lastUsed: "3 days ago",
    icon: "👤",
    status: "Completed" as AgentState,
    isSampleData: true,
  },
];

// Realistic sample active tasks
const SAMPLE_ACTIVE_TASKS: ActiveTask[] = [
  {
    id: "task_run_104",
    title: "Synthesizing Customer Registration from Demonstration",
    status: "Learning",
    progress: 65,
    startedAt: "2m ago",
    workflowId: "wf_customer_form",
    currentStep: "Detecting parameters & disambiguation questions",
    isSampleData: true,
  },
  {
    id: "task_run_105",
    title: "Executing Verified Price Scan on Benchmark Portal",
    status: "Running",
    progress: 40,
    startedAt: "45s ago",
    workflowId: "wf_price_checker",
    currentStep: "Validating item prices against budget threshold",
    isSampleData: true,
  },
];

// Realistic sample pending approvals
const SAMPLE_PENDING_APPROVALS: PendingApproval[] = [
  {
    id: "appr_901",
    workflowId: "wf_customer_form",
    workflowTitle: "Customer SaaS Portal Submission",
    actionCount: 1,
    risk: "high",
    scopeSummary: "Origin: http://localhost:8000 | Action: submit form with sensitive email",
    submittedAt: "5m ago",
    expiresInMinutes: 25,
    isSampleData: true,
  },
  {
    id: "appr_902",
    workflowId: "wf_file_organizer",
    workflowTitle: "Bulk Reversible PDF Movement",
    actionCount: 12,
    risk: "medium",
    scopeSummary: "Scoped sandbox: ./backend/app/sandbox_papers | No path escapes",
    submittedAt: "14m ago",
    expiresInMinutes: 16,
    isSampleData: true,
  },
];

export const OverviewView: React.FC<Props> = ({ onNavigate, onSelectWorkflow }) => {
  const [taskPrompt, setTaskPrompt] = useState(
    "Find the latest AI papers, summarize them, and organize the results into a report."
  );

  // Agent State & Dashboard Simulation Mode
  const [currentAgentState, setCurrentAgentState] = useState<AgentState>("Idle");
  const [viewMode, setViewMode] = useState<"normal" | "empty" | "loading" | "error">("normal");
  const [errorMessage, setErrorMessage] = useState("Failed to sync workspace states from local daemon.");

  const agentStateStyles: Record<AgentState, { badgeClass: string; dotClass: string; desc: string }> = {
    Idle: { badgeClass: "state-badge-idle", dotClass: "dot-state-gray", desc: "Ready for tasks or demonstrations" },
    Learning: { badgeClass: "state-badge-learning", dotClass: "dot-state-purple", desc: "Observing permitted actions & inferring parameters" },
    "Waiting for approval": { badgeClass: "state-badge-waiting", dotClass: "dot-state-yellow", desc: "Paused at confirmation gate awaiting user signature" },
    Running: { badgeClass: "state-badge-running", dotClass: "dot-state-blue", desc: "Executing policy-verified steps in guarded scope" },
    Completed: { badgeClass: "state-badge-completed", dotClass: "dot-state-green", desc: "All postconditions deterministically verified" },
    Failed: { badgeClass: "state-badge-failed", dotClass: "dot-state-red", desc: "Execution halted by policy safety constraint" },
    "Needs help": { badgeClass: "state-badge-needs-help", dotClass: "dot-state-orange", desc: "Ambiguity detected — clarification dialogue required" },
  };

  const handleAskAI = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!taskPrompt.trim()) return;
    onNavigate("Ask AI");
  };

  return (
    <div className="overview-main-img1">
      {/* TOP AGENT STATUS & VIEW MODE CONTROLS */}
      <div className="overview-agent-status-bar">
        <div className="agent-state-pill-display" role="status" aria-live="polite">
          <span className={`dot-status-indicator ${agentStateStyles[currentAgentState].dotClass}`} />
          <span className="state-name-bold">Agent State: {currentAgentState}</span>
          <span className="state-desc-dim">— {agentStateStyles[currentAgentState].desc}</span>
        </div>

        {/* State simulation picker & view mode switcher for review */}
        <div className="overview-demo-controls">
          <label htmlFor="agent-state-select" className="sr-only">Simulate Agent State</label>
          <select
            id="agent-state-select"
            className="select-state-sim"
            value={currentAgentState}
            onChange={(e) => setCurrentAgentState(e.target.value as AgentState)}
            aria-label="Agent State Switcher"
          >
            {(["Idle", "Learning", "Waiting for approval", "Running", "Completed", "Failed", "Needs help"] as AgentState[]).map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>

          <div className="view-mode-toggle-group">
            <button
              type="button"
              className={`btn-mode-chip ${viewMode === "normal" ? "active" : ""}`}
              onClick={() => setViewMode("normal")}
            >
              Populated
            </button>
            <button
              type="button"
              className={`btn-mode-chip ${viewMode === "loading" ? "active" : ""}`}
              onClick={() => setViewMode("loading")}
            >
              Loading
            </button>
            <button
              type="button"
              className={`btn-mode-chip ${viewMode === "empty" ? "active" : ""}`}
              onClick={() => setViewMode("empty")}
            >
              Empty
            </button>
            <button
              type="button"
              className={`btn-mode-chip ${viewMode === "error" ? "active" : ""}`}
              onClick={() => setViewMode("error")}
            >
              Error
            </button>
          </div>
        </div>
      </div>

      {/* GREETING & HEADER */}
      <h1 className="overview-greeting-img1">Good evening</h1>
      <p className="overview-subhead-img1">What would you like your AI to do?</p>

      {/* NATURAL LANGUAGE GOAL INPUT CARD (Image 1 style) */}
      <div className="prompt-card-img1">
        <span className="prompt-placeholder-label-img1">Describe a task...</span>
        <form onSubmit={handleAskAI}>
          <textarea
            className="prompt-textarea-img1"
            rows={3}
            value={taskPrompt}
            onChange={(e) => setTaskPrompt(e.target.value)}
            placeholder="Explain what you want to automate, search, or demonstrate..."
            aria-label="Task explanation input"
          />
          <div className="prompt-footer-row-img1">
            <button
              type="button"
              className="prompt-btn-icon-img1"
              title="Attach context or files"
              aria-label="Attach file"
              onClick={() => alert("Sandbox context attached: test directory active")}
            >
              📎
            </button>
            <button
              type="submit"
              className="prompt-btn-icon-img1 prompt-btn-send-img1 ask-ai-action-btn"
              title="Submit Goal to Ask AI"
              aria-label="Submit Goal to Ask AI"
            >
              <span>Ask AI</span>
              <span className="arrow-icon">↗</span>
            </button>
          </div>
        </form>
      </div>

      {/* QUICK CARDS: TEACH A TASK & MY WORKFLOWS (Image 1 style) */}
      <div className="quick-cards-row-img1">
        <div
          className="quick-card-img1"
          onClick={() => onNavigate("Teach a Task")}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => e.key === "Enter" && onNavigate("Teach a Task")}
        >
          <div className="quick-icon-img1">🎓</div>
          <div className="quick-info-img1">
            <div className="card-title-row">
              <h3>Teach</h3>
              <span className="sample-badge-pill">Step 02</span>
            </div>
            <p>Demonstrate a task & infer reusable parameters</p>
          </div>
        </div>

        <div
          className="quick-card-img1"
          onClick={() => onNavigate("My Workflows")}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => e.key === "Enter" && onNavigate("My Workflows")}
        >
          <div className="quick-icon-img1">☊</div>
          <div className="quick-info-img1">
            <div className="card-title-row">
              <h3>Workflows</h3>
              <span className="sample-badge-pill">Step 04</span>
            </div>
            <p>Manage learned skills, graph conditions & versions</p>
          </div>
        </div>
      </div>

      {/* DASHBOARD CONTENT BODY: LOADING STATE */}
      {viewMode === "loading" && (
        <div className="dashboard-loading-skeleton" role="status" aria-busy="true">
          <div className="skeleton-bar skeleton-title" />
          <div className="skeleton-row" />
          <div className="skeleton-row" />
          <div className="skeleton-row" />
          <p className="loading-caption">Fetching workspace workflows, active runs, and policy gates...</p>
        </div>
      )}

      {/* DASHBOARD CONTENT BODY: ERROR STATE */}
      {viewMode === "error" && (
        <div className="dashboard-error-state" role="alert">
          <div className="error-icon">⚠️</div>
          <div className="error-text">
            <h3>Unable to Load Dashboard Data</h3>
            <p>{errorMessage}</p>
          </div>
          <button
            type="button"
            className="btn-retry-sync"
            onClick={() => setViewMode("normal")}
          >
            Retry Connection
          </button>
        </div>
      )}

      {/* DASHBOARD CONTENT BODY: EMPTY STATE */}
      {viewMode === "empty" && (
        <div className="dashboard-empty-state">
          <div className="empty-state-card">
            <div className="empty-icon">📂</div>
            <h3>No Active Tasks or Recent Workflows Yet</h3>
            <p>
              Teach your first workflow by demonstrating a GUI task or explain your goal in the natural-language box above.
            </p>
            <div className="empty-state-buttons">
              <button
                type="button"
                className="btn-empty-action primary"
                onClick={() => onNavigate("Teach a Task")}
              >
                ● Teach a Demonstration
              </button>
              <button
                type="button"
                className="btn-empty-action secondary"
                onClick={() => setViewMode("normal")}
              >
                View Sample Benchmark Workflows
              </button>
            </div>
          </div>
        </div>
      )}

      {/* DASHBOARD CONTENT BODY: POPULATED STATE */}
      {viewMode === "normal" && (
        <div className="dashboard-populated-sections">
          {/* SECTION 1: PENDING APPROVALS */}
          <div className="dashboard-section-block">
            <div className="section-header-line">
              <h3 className="recent-heading-img1">Pending Approvals</h3>
              <span className="sample-tag-indicator">[Sample Data]</span>
            </div>
            <div className="pending-approvals-grid">
              {SAMPLE_PENDING_APPROVALS.map((appr) => (
                <div key={appr.id} className="pending-approval-card">
                  <div className="approval-head-row">
                    <span className="appr-title">{appr.workflowTitle}</span>
                    <span className={`risk-tag-badge risk-${appr.risk}`}>
                      {appr.risk.toUpperCase()} RISK
                    </span>
                  </div>
                  <p className="appr-scope-text">{appr.scopeSummary}</p>
                  <div className="approval-footer-row">
                    <span className="appr-expiry-text">
                      ⏳ Expires in {appr.expiresInMinutes}m
                    </span>
                    <button
                      type="button"
                      className="btn-review-gate"
                      onClick={() => onNavigate("Permissions")}
                    >
                      Review & Approve →
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* SECTION 2: ACTIVE TASKS */}
          <div className="dashboard-section-block">
            <div className="section-header-line">
              <h3 className="recent-heading-img1">Active Tasks</h3>
              <span className="sample-tag-indicator">[Sample Data]</span>
            </div>
            <div className="active-tasks-list">
              {SAMPLE_ACTIVE_TASKS.map((task) => (
                <div key={task.id} className="active-task-row">
                  <div className="task-main-col">
                    <div className="task-title-line">
                      <strong>{task.title}</strong>
                      <span className={`task-state-badge state-${task.status.toLowerCase().replace(/ /g, "-")}`}>
                        {task.status}
                      </span>
                    </div>
                    <span className="task-substep">{task.currentStep}</span>
                    <div className="task-progress-track">
                      <div className="task-progress-fill" style={{ width: `${task.progress}%` }} />
                    </div>
                  </div>
                  <div className="task-meta-col">
                    <span className="task-time-ago">{task.startedAt}</span>
                    <button
                      type="button"
                      className="btn-inspect-run"
                      onClick={() => onNavigate("Live Run")}
                    >
                      View Live Run ›
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* SECTION 3: RECENT WORKFLOWS (Image 1 style) */}
          <div className="dashboard-section-block">
            <div className="section-header-line">
              <h3 className="recent-heading-img1">Recent workflows</h3>
              <span className="sample-tag-indicator">[Sample Data]</span>
            </div>
            <div className="recent-list-img1">
              {SAMPLE_RECENT_WORKFLOWS.map((item) => (
                <div
                  key={item.id}
                  className="recent-card-img1"
                  onClick={() => {
                    if (item.id === "wf_research") onNavigate("Ask AI");
                    else if (item.id === "wf_price_checker") onNavigate("My Workflows");
                    else if (item.id === "wf_restaurant_sugilite") onNavigate("Teach a Task");
                    else onNavigate("Live Run");
                  }}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => e.key === "Enter" && onNavigate("My Workflows")}
                >
                  <div className="recent-icon-img1">{item.icon}</div>
                  <div className="recent-info-img1">
                    <div className="item-title-row">
                      <h4>{item.title}</h4>
                      <span className="item-steps-meta">{item.stepsCount} steps · {item.lastUsed}</span>
                    </div>
                    <p>{item.intent}</p>
                  </div>
                  <span className="recent-arrow-img1">›</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
