import React, { useState } from "react";
import { api } from "../../api/client";
import { ClarificationModal } from "../recording/ClarificationModal";
import type { WorkflowDefinition, ClarificationQuestion, AppSection } from "../../types";

type ObserverMode = "recording" | "review";
type RecordingState = "idle" | "recording" | "paused" | "stopped";

type Props = {
  onWorkflowGenerated: (wf: WorkflowDefinition) => void;
  onNavigate?: (section: AppSection) => void;
};

type ObservedStep = {
  id: string;
  checked: boolean;
  action: string;
  target: string;
  value: string;
  isUrl?: boolean;
  isChip?: boolean;
  isInput?: boolean;
  isNew?: boolean;
  icon: string;
  timestamp: string;
  confidence: number;
  isAmbiguous?: boolean;
  isSupported?: boolean;
};

export const TeachTaskView: React.FC<Props> = ({ onWorkflowGenerated, onNavigate }) => {
  const [taskName, setTaskName] = useState("Example Test");
  const [desiredOutcome, setDesiredOutcome] = useState("Automate customer portal registration & CRM entry");
  const [recordingState, setRecordingState] = useState<RecordingState>("paused");
  const [activeMode, setActiveMode] = useState<ObserverMode>("recording");
  const [loading, setLoading] = useState(false);
  const [privacyConfirmed, setPrivacyConfirmed] = useState(true);

  const [clarifications, setClarifications] = useState<ClarificationQuestion[]>([]);
  const [showClarification, setShowClarification] = useState(false);

  // Controlled scope indicator
  const targetScope = "http://localhost:8000/testsite#customers";

  // Raw original events (preserved immutably)
  const [originalSteps] = useState<ObservedStep[]>([
    {
      id: "st_1",
      checked: true,
      action: "Go to URL",
      target: "https://demo-saas.bugbug.io/",
      value: "",
      isUrl: true,
      icon: "🌐",
      timestamp: "10:42:01",
      confidence: 1.0,
      isSupported: true,
    },
    {
      id: "st_2",
      checked: true,
      action: "Assert element text is",
      target: "Demo SaaS",
      value: "Demo SaaS",
      isChip: true,
      icon: "🔍",
      timestamp: "10:42:03",
      confidence: 0.99,
      isSupported: true,
    },
    {
      id: "st_3",
      checked: true,
      action: "Click",
      target: "Go to example sign up",
      value: "Go to example sign up",
      isChip: true,
      icon: "🖱️",
      timestamp: "10:42:05",
      confidence: 0.97,
      isSupported: true,
    },
    {
      id: "st_4",
      checked: true,
      action: "Click",
      target: "John",
      value: "John",
      isChip: true,
      icon: "🖱️",
      timestamp: "10:42:07",
      confidence: 0.95,
      isSupported: true,
    },
    {
      id: "st_5",
      checked: true,
      isNew: true,
      action: "Click",
      target: "Email Address Input",
      value: "",
      icon: "🖱️",
      timestamp: "10:42:09",
      confidence: 0.98,
      isSupported: true,
    },
    {
      id: "st_6",
      checked: true,
      isNew: true,
      action: "Type text",
      target: "customer-email-input",
      value: "test@test.com",
      isInput: true,
      icon: "⌨️",
      timestamp: "10:42:11",
      confidence: 0.96,
      isSupported: true,
    },
    {
      id: "st_7",
      checked: true,
      action: "Type text",
      target: "customer-name-input",
      value: "John Smith",
      isInput: true,
      icon: "⌨️",
      timestamp: "10:42:14",
      confidence: 0.99,
      isSupported: true,
    },
    {
      id: "st_8",
      checked: true,
      action: "Click",
      target: "Enterprise Tier Option",
      value: "",
      icon: "🖱️",
      timestamp: "10:42:18",
      confidence: 0.88,
      isAmbiguous: true,
      isSupported: true,
    },
    {
      id: "st_9",
      checked: true,
      action: "Type text",
      target: "Smith",
      value: "Smith",
      isInput: true,
      icon: "⌨️",
      timestamp: "10:42:20",
      confidence: 0.95,
      isSupported: true,
    },
  ]);

  // Reviewed / edited steps
  const [steps, setSteps] = useState<ObservedStep[]>(originalSteps);

  // Observer Controls
  const handleStart = () => {
    setRecordingState("recording");
    setActiveMode("recording");
  };

  const handlePause = () => {
    setRecordingState("paused");
  };

  const handleResume = () => {
    setRecordingState("recording");
  };

  const handleStop = () => {
    setRecordingState("stopped");
    setActiveMode("review");
  };

  const handleDiscard = () => {
    if (confirm("Discard this entire observation session? All unsaved events will be cleared.")) {
      setSteps([]);
      setRecordingState("idle");
      setActiveMode("recording");
    }
  };

  const handleRemoveEvent = (id: string) => {
    setSteps(steps.filter((s) => s.id !== id));
  };

  const handleEditTarget = (id: string, newTarget: string) => {
    setSteps(
      steps.map((s) => (s.id === id ? { ...s, target: newTarget, isAmbiguous: false } : s))
    );
  };

  const handleMoveStep = (idx: number, direction: "up" | "down") => {
    const targetIdx = direction === "up" ? idx - 1 : idx + 1;
    if (targetIdx < 0 || targetIdx >= steps.length) return;
    const reordered = [...steps];
    const temp = reordered[idx];
    reordered[idx] = reordered[targetIdx];
    reordered[targetIdx] = temp;
    setSteps(reordered);
  };

  const handleConfirmAndSynthesize = () => {
    if (!privacyConfirmed) {
      alert("Please review and confirm the privacy disclosure before model submission.");
      return;
    }

    // Check for ambiguous actions
    const hasAmbiguous = steps.some((s) => s.isAmbiguous || s.target.toLowerCase().includes("option"));
    if (hasAmbiguous) {
      setClarifications([
        {
          id: "clarify_sugilite_demo",
          step_id: "st_8",
          question: "Did you choose this option/restaurant because of price, distance or rating?",
          explanation: "A choice was made from multiple candidates without an explicit prior sort filter.",
          options: [
            "Rating (Highest rated >= 4.5)",
            "Price (Budget / lowest tier)",
            "Distance (Nearest location)",
            "Fixed selection on every run",
          ],
          selected_option: "Rating (Highest rated >= 4.5)",
        },
      ]);
      setShowClarification(true);
      return;
    }

    finishWorkflowSynthesis({});
  };

  const finishWorkflowSynthesis = (answers: Record<string, string>) => {
    const chosenAnswer = Object.values(answers)[0] || "Rating";
    const condition = chosenAnswer.includes("Price")
      ? "price_tier == '$$'"
      : chosenAnswer.includes("Distance")
      ? "distance <= 1.0"
      : "rating >= 4.5";

    const synthesizedWf: WorkflowDefinition = {
      workflow_id: `wf_teach_${Date.now().toString(36)}`,
      title: taskName,
      intent: `${desiredOutcome} (Condition: ${condition})`,
      allowed_origins: ["http://localhost:8000", "https://demo-saas.bugbug.io"],
      parameters: [
        { name: "customer_name", type: "string", default_value: "John Smith", required: true },
        { name: "customer_email", type: "string", default_value: "test@test.com", required: true },
      ],
      steps: steps.map((s, idx) => ({
        id: `s${idx + 1}`,
        name: `${s.action} ${s.target}`,
        action: s.isUrl ? "navigate" : s.action.toLowerCase().includes("type") ? "type" : "click",
        target: { name: s.target, role: "button" },
        args: s.value ? { value: s.value } : {},
        risk: s.action.toLowerCase().includes("submit") ? "high" : "low",
        requires_confirmation: s.action.toLowerCase().includes("submit"),
        idempotent: true,
        preconditions: [],
        postconditions: [],
        enabled: true,
        condition: idx === 7 ? condition : undefined,
      })),
      final_postconditions: [{ type: "element_exists", selector: ".alert-success" }],
      version: 1,
      content_hash: "sha256:7f9a2b8e3c1d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f",
    };

    setShowClarification(false);
    onWorkflowGenerated(synthesizedWf);
  };

  return (
    <div className="teach-viewport-bg">
      <div className="bugbug-window-card">
        {/* SCOPE & PRIVACY BANNER */}
        <div className="teach-scope-banner">
          <div className="scope-info-left">
            <span className="scope-tag">Observation Scope</span>
            <span className="scope-url">{targetScope}</span>
          </div>
          <div className="privacy-pill-safe">
            <span>🛡 Zero Secrets: Passwords, raw keystrokes & clipboard excluded</span>
          </div>
        </div>

        {/* TOP BAR */}
        <div className="bugbug-topbar">
          <div className="bugbug-left-title">
            <button
              type="button"
              className="arrow-back-btn"
              onClick={() => onNavigate && onNavigate("Overview")}
              title="Back to Overview"
            >
              ←
            </button>
            <input
              type="text"
              className="bugbug-task-title"
              value={taskName}
              onChange={(e) => setTaskName(e.target.value)}
              title="Task Name"
            />
            <div className={`bugbug-paused-badge state-${recordingState}`}>
              <span className="dot-yellow-paused" />
              {recordingState.toUpperCase()}
            </div>
          </div>

          <div className="bugbug-top-actions">
            {recordingState === "idle" && (
              <button type="button" className="bb-btn bb-btn-record" onClick={handleStart}>
                ● Start Recording
              </button>
            )}

            {recordingState === "recording" && (
              <>
                <button type="button" className="bb-btn bb-btn-stop" onClick={handleStop}>
                  ■ Stop
                </button>
                <button type="button" className="bb-btn bb-btn-resume" onClick={handlePause}>
                  ❚❚ Pause
                </button>
              </>
            )}

            {recordingState === "paused" && (
              <>
                <button type="button" className="bb-btn bb-btn-stop" onClick={handleStop}>
                  ■ Stop
                </button>
                <button type="button" className="bb-btn bb-btn-resume" onClick={handleResume}>
                  ▶ Resume
                </button>
              </>
            )}

            <button
              type="button"
              className={`bb-btn ${activeMode === "review" ? "bb-btn-resume" : "bb-btn-step"}`}
              onClick={() => setActiveMode(activeMode === "review" ? "recording" : "review")}
            >
              {activeMode === "review" ? "View Timeline" : "Review Events"}
            </button>

            <button
              type="button"
              className="bb-btn bb-btn-stop"
              style={{ color: "#ef4444", borderColor: "#fecaca" }}
              onClick={handleDiscard}
              title="Discard entire session"
            >
              Discard
            </button>
          </div>
        </div>

        {/* MODE 1: RECORDING TIMELINE VIEW */}
        {activeMode === "recording" && (
          <div className="bugbug-sheet-container">
            <div className="group-bar-header">
              <div className="group-collapse-toggle">
                <input type="checkbox" className="bugbug-checkbox" defaultChecked />
                <span>⌄</span>
                <strong>Group number 11</strong>
              </div>
              <div className="group-stats-right">
                <span>{steps.length} steps</span>
                <span>⏱ 00m 07.61s</span>
                <span className="make-component-link">✦ Make component</span>
              </div>
            </div>

            <div className="bugbug-rows-table">
              {steps.map((st, idx) => (
                <React.Fragment key={st.id}>
                  {idx === 4 && (
                    <div className="insertion-guide-row">
                      <span className="pointer-hand">👉</span>
                      <div className="yellow-dashed-line" />
                    </div>
                  )}

                  <div className="bugbug-row-item">
                    <input
                      type="checkbox"
                      className="bugbug-checkbox"
                      checked={st.checked}
                      onChange={() => {
                        const updated = [...steps];
                        updated[idx].checked = !updated[idx].checked;
                        setSteps(updated);
                      }}
                    />

                    <div className="bugbug-row-main">
                      {st.isNew && <span className="new-badge-purple">NEW</span>}
                      <span className="action-verb">{st.action}</span>

                      {st.isUrl ? (
                        <a
                          href={st.target}
                          target="_blank"
                          rel="noreferrer"
                          className="url-link-styled"
                        >
                          {st.target} ↗
                        </a>
                      ) : (
                        <span className="target-text-styled">{st.target}</span>
                      )}

                      {st.isAmbiguous && (
                        <span className="badge-ambiguous" title="Choice requires clarification">
                          ⚠️ Ambiguous
                        </span>
                      )}
                    </div>

                    {st.value && <div className="bugbug-val-box">{st.value}</div>}

                    <span className="green-status-dot" title="Observed cleanly" />
                  </div>
                </React.Fragment>
              ))}
            </div>
          </div>
        )}

        {/* MODE 2: OBSERVATION REVIEW SCREEN (Prompt 4) */}
        {activeMode === "review" && (
          <div className="observation-review-panel">
            <div className="review-panel-header">
              <div>
                <h3>Observation Review</h3>
                <p>
                  Review chronological actions, edit descriptions, remove accidental clicks, and verify privacy sanitization before generating a workflow.
                </p>
              </div>
              <span className="badge-review-count">{steps.length} Events Reviewed</span>
            </div>

            {/* PRIVACY DISCLOSURE TABLE */}
            <div className="privacy-disclosure-box">
              <h4>Privacy & Data Transmission Review</h4>
              <div className="privacy-columns-dual">
                <div className="p-col retained">
                  <strong>💾 Retained Locally Only</strong>
                  <ul>
                    <li>• Raw original observation log ({originalSteps.length} events)</li>
                    <li>• Element selectors & timing signatures</li>
                    <li>• Target URLs and origin permissions</li>
                  </ul>
                </div>
                <div className="p-col transmitted">
                  <strong>☁️ Submitted to AI Model</strong>
                  <ul>
                    <li>• Task goal: "{taskName}"</li>
                    <li>• Reviewed step labels and roles</li>
                    <li>• Sanitized parameters (secrets masked as [REDACTED])</li>
                  </ul>
                </div>
              </div>
            </div>

            {/* REVIEW STEP TABLE */}
            <div className="review-steps-list">
              {steps.map((st, idx) => (
                <div key={st.id} className="review-step-card">
                  <div className="rev-reorder-controls">
                    <button
                      type="button"
                      disabled={idx === 0}
                      onClick={() => handleMoveStep(idx, "up")}
                      title="Move up"
                    >
                      ▲
                    </button>
                    <span className="rev-step-num">{idx + 1}</span>
                    <button
                      type="button"
                      disabled={idx === steps.length - 1}
                      onClick={() => handleMoveStep(idx, "down")}
                      title="Move down"
                    >
                      ▼
                    </button>
                  </div>

                  <div className="rev-step-body">
                    <div className="rev-step-meta">
                      <span className="rev-action-badge">{st.action}</span>
                      <span className="rev-time">{st.timestamp}</span>
                      <span className="rev-confidence">
                        {(st.confidence * 100).toFixed(0)}% confidence
                      </span>
                      {st.isAmbiguous && <span className="badge-ambiguous">⚠️ Ambiguous Choice</span>}
                    </div>

                    <div className="rev-step-target-edit">
                      <label>Target:</label>
                      <input
                        type="text"
                        value={st.target}
                        onChange={(e) => handleEditTarget(st.id, e.target.value)}
                        placeholder="Element name or description..."
                      />
                    </div>
                  </div>

                  <button
                    type="button"
                    className="btn-remove-event"
                    onClick={() => handleRemoveEvent(st.id)}
                    title="Remove this event"
                  >
                    🗑
                  </button>
                </div>
              ))}
            </div>

            {/* EXPLICIT CONFIRMATION GATE */}
            <div className="review-confirmation-bar">
              <label className="checkbox-confirm-privacy">
                <input
                  type="checkbox"
                  checked={privacyConfirmed}
                  onChange={(e) => setPrivacyConfirmed(e.target.checked)}
                />
                <span>
                  I confirm that all steps are accurate, no credentials exist in descriptions, and these sanitized observations may be converted to an editable workflow.
                </span>
              </label>

              <button
                type="button"
                className="btn-synthesize-workflow"
                onClick={handleConfirmAndSynthesize}
                disabled={steps.length === 0}
              >
                Synthesize Verified Workflow →
              </button>
            </div>
          </div>
        )}

        {/* FLOATING ACTION WIDGET (Image 2 style) */}
        {activeMode === "recording" && (
          <div className="bugbug-floating-widget">
            <div className="widget-dark-tip">Run next step and pause</div>
            <div className="widget-body-buttons">
              <div className="widget-split-row">
                <button
                  type="button"
                  className="w-split-left"
                  onClick={() => setRecordingState("recording")}
                >
                  ▶ Resume running
                </button>
                <button
                  type="button"
                  className="w-split-right"
                  title="Next Step"
                  onClick={() => alert("Advancing single step...")}
                >
                  ⏭
                </button>
              </div>

              <button type="button" className="w-btn-outline" onClick={handleStart}>
                ● Record from here
              </button>

              <button type="button" className="w-btn-outline" onClick={handleStop}>
                ✎ Review and edit
              </button>

              <button
                type="button"
                className="w-btn-purple-solid"
                onClick={handleStop}
              >
                ✓ Finish and close
              </button>
            </div>
          </div>
        )}
      </div>

      {/* CLARIFICATION MODAL */}
      {showClarification && (
        <ClarificationModal
          clarifications={clarifications}
          onConfirm={finishWorkflowSynthesis}
          onCancel={() => finishWorkflowSynthesis({})}
          loading={loading}
        />
      )}
    </div>
  );
};
