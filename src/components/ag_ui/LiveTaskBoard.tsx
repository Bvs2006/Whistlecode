import React from "react";
import type { AgUiTask, InterruptPayload } from "../../services/agUiStream";

interface Props {
  tasks: AgUiTask[];
  currentStepIndex: number;
  progressPercent: number;
  isRunning: boolean;
  statusText?: string;
  interrupt: InterruptPayload | null;
  onApproveInterrupt: (interruptId: string) => void;
  onDenyInterrupt: (interruptId: string) => void;
}

export const LiveTaskBoard: React.FC<Props> = ({
  tasks,
  currentStepIndex,
  progressPercent,
  isRunning,
  statusText = "Ready",
  interrupt,
  onApproveInterrupt,
  onDenyInterrupt,
}) => {
  const completedCount = tasks.filter((t) => t.status === "completed").length;

  return (
    <div className="ag-ui-task-board card-panel">
      {/* Header with status pill */}
      <div className="board-header">
        <div className="board-title-group">
          <h3>⚡ Live AG-UI Task Board</h3>
          <span className="task-count-badge">
            {completedCount}/{tasks.length} Done
          </span>
        </div>
        <div className={`status-pill ${isRunning ? "live" : "idle"}`}>
          <span className="dot" />
          <span>{statusText}</span>
        </div>
      </div>

      {/* Progress Bar */}
      <div className="progress-container">
        <div className="progress-bar-bg">
          <div
            className="progress-bar-fill"
            style={{ width: `${progressPercent}%` }}
          />
        </div>
        <div className="progress-label">
          <span>Progress</span>
          <span>{Math.round(progressPercent)}%</span>
        </div>
      </div>

      {/* HITL Interrupt Drawer / Modal */}
      {interrupt && (
        <div className="hitl-approval-card">
          <div className="hitl-header">
            <span className="hitl-badge">🛡️ Human-in-the-Loop Guardrail</span>
            <span className={`risk-tag risk-${interrupt.risk.toLowerCase()}`}>
              {interrupt.risk.toUpperCase()} RISK
            </span>
          </div>
          <div className="hitl-content">
            <h4>Approval Required to Proceed</h4>
            <p className="hitl-message">{interrupt.message}</p>
            <div className="hitl-details">
              <div><strong>Action:</strong> <code>{interrupt.action}</code></div>
              <div><strong>Target:</strong> {interrupt.target}</div>
              {Object.keys(interrupt.evaluated_args || {}).length > 0 && (
                <div>
                  <strong>Arguments:</strong>{" "}
                  <code>{JSON.stringify(interrupt.evaluated_args)}</code>
                </div>
              )}
            </div>
          </div>
          <div className="hitl-actions">
            <button
              type="button"
              className="btn btn-secondary btn-deny"
              onClick={() => onDenyInterrupt(interrupt.interrupt_id)}
            >
              ✕ Deny Action
            </button>
            <button
              type="button"
              className="btn btn-primary btn-approve"
              onClick={() => onApproveInterrupt(interrupt.interrupt_id)}
            >
              ✓ Approve & Continue
            </button>
          </div>
        </div>
      )}

      {/* Task Cards List */}
      <div className="task-cards-list">
        {tasks.length === 0 ? (
          <div className="empty-tasks-state">
            <p>No active workflow running. Trigger a task to stream live AG-UI events.</p>
          </div>
        ) : (
          tasks.map((task, idx) => {
            const isCurrent = idx === currentStepIndex && isRunning;
            return (
              <div
                key={task.id || idx}
                className={`task-card status-${task.status} ${isCurrent ? "current-active-step" : ""}`}
              >
                <div className="task-card-header">
                  <span className="step-number">#{idx + 1}</span>
                  <span className="task-title">{task.title}</span>
                  <span className={`task-badge status-${task.status}`}>
                    {task.status === "completed" && "✓ Completed"}
                    {task.status === "in_progress" && "⚙ Running..."}
                    {task.status === "awaiting_approval" && "⏳ Review Needed"}
                    {task.status === "pending" && "Pending"}
                    {task.status === "failed" && "✗ Failed"}
                  </span>
                </div>

                <div className="task-card-body">
                  <div className="task-meta-row">
                    <span className="meta-tag">Action: <code>{task.action}</code></span>
                    {task.target && <span className="meta-tag">Target: {task.target}</span>}
                    {task.risk && (
                      <span className={`meta-tag risk-pill risk-${task.risk.toLowerCase()}`}>
                        {task.risk}
                      </span>
                    )}
                  </div>

                  {task.result && (
                    <div className="task-result-note">
                      <span>✓ {task.result}</span>
                    </div>
                  )}

                  {task.error && (
                    <div className="task-error-note">
                      <span>✗ {task.error}</span>
                    </div>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};
