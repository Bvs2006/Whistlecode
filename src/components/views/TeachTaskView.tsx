import React, { useEffect, useState } from "react";
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

// ── helpers ──────────────────────────────────────────────────────────────────

function ConfidenceBar({ value }: { value: number }) {
  const pct = Math.round(value * 100);
  const color =
    pct >= 95 ? "#10b981" : pct >= 80 ? "#f59e0b" : "#ef4444";
  return (
    <span
      style={{ display: "inline-flex", alignItems: "center", gap: 5 }}
      title={`${pct}% confidence`}
    >
      <span
        style={{
          display: "inline-block",
          width: 40,
          height: 5,
          borderRadius: 3,
          background: "#e2e8f0",
          overflow: "hidden",
        }}
      >
        <span
          style={{
            display: "block",
            width: `${pct}%`,
            height: "100%",
            background: color,
            borderRadius: 3,
            transition: "width 0.3s",
          }}
        />
      </span>
      <span style={{ fontSize: 10, color, fontWeight: 600 }}>{pct}%</span>
    </span>
  );
}

function ActionBadge({ action }: { action: string }) {
  const map: Record<string, { bg: string; color: string }> = {
    "Go to URL":       { bg: "#dbeafe", color: "#1d4ed8" },
    "Click":           { bg: "#ede9fe", color: "#6d28d9" },
    "Type text":       { bg: "#d1fae5", color: "#065f46" },
    "Assert element text is": { bg: "#fef3c7", color: "#92400e" },
  };
  const style = map[action] || { bg: "#f1f5f9", color: "#334155" };
  return (
    <span
      style={{
        background: style.bg,
        color: style.color,
        fontSize: 10,
        fontWeight: 700,
        padding: "2px 7px",
        borderRadius: 4,
        textTransform: "uppercase",
        letterSpacing: "0.03em",
        whiteSpace: "nowrap",
      }}
    >
      {action}
    </span>
  );
}

// ── component ─────────────────────────────────────────────────────────────────

export const TeachTaskView: React.FC<Props> = ({ onWorkflowGenerated, onNavigate }) => {
  const [taskName, setTaskName] = useState("New workflow");
  const [desiredOutcome, setDesiredOutcome] = useState("");
  const [targetUrl, setTargetUrl] = useState("");
  const [recordingState, setRecordingState] = useState<RecordingState>("idle");
  const [activeMode, setActiveMode] = useState<ObserverMode>("recording");
  const [loading, setLoading] = useState(false);
  const [privacyConfirmed, setPrivacyConfirmed] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");

  const [clarifications, setClarifications] = useState<ClarificationQuestion[]>([]);
  const [showClarification, setShowClarification] = useState(false);

  const [recordingId, setRecordingId] = useState<string | null>(null);
  const [recordingError, setRecordingError] = useState("");

  useEffect(() => {
    if (recordingState !== "recording" || !recordingId) return;
    const refresh = async () => {
      try {
        const result = await api.getCurrentRecording();
        const events = result.session?.events || [];
        setSteps(events.map((event: any, index: number) => {
          const action = event.type === "navigate" ? "Go to URL" : event.type === "input" ? "Type text" : event.type === "submit" ? "Submit" : event.type === "keypress" ? "Key press" : "Click";
          const target = event.target?.name || event.target?.label || event.target?.text || event.target?.test_id || event.url || "Page";
          return {
            id: event.id || `event-${index}`, checked: true, action, target,
            value: event.is_masked || action === "Type text" ? "" : (event.value || ""),
            isUrl: event.type === "navigate", isInput: event.type === "input",
            icon: event.type === "navigate" ? "🌐" : event.type === "input" ? "⌨️" : "🖱️",
            timestamp: new Date((event.timestamp || Date.now() / 1000) * 1000).toLocaleTimeString(),
            confidence: event.target?.min_confidence || 0.9, isSupported: true,
          } as ObservedStep;
        }));
      } catch { /* Keep the last visible event list during transient polling errors. */ }
    };
    void refresh();
    const timer = window.setInterval(refresh, 1200);
    return () => window.clearInterval(timer);
  }, [recordingState, recordingId]);

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
  const [steps, setSteps] = useState<ObservedStep[]>([]);

  // Observer Controls
  const handleStart = async () => {
    setRecordingError("");
    if (!targetUrl.trim() || !desiredOutcome.trim()) {
      setRecordingError("Enter the website URL and describe the task before recording.");
      return;
    }
    try {
      const normalizedUrl = /^https?:\/\//i.test(targetUrl.trim()) ? targetUrl.trim() : `https://${targetUrl.trim()}`;
      const result = await api.startRecording(normalizedUrl, `${taskName.trim()}\n${desiredOutcome.trim()}`, false, true, true);
      setRecordingId(result.session.id);
      setSteps([]);
      setRecordingState("recording");
      setActiveMode("recording");
    } catch (error) {
      setRecordingError(error instanceof Error ? error.message : "Could not start recording. Check the URL and try again.");
    }
  };

  const handlePause = async () => {
    try {
      await api.pauseRecording();
      setRecordingState("paused");
    } catch (error) {
      setRecordingError(error instanceof Error ? error.message : "Could not pause recording.");
    }
  };

  const handleResume = async () => {
    try {
      await api.resumeRecording();
      setRecordingState("recording");
    } catch (error) {
      setRecordingError(error instanceof Error ? error.message : "Could not resume recording.");
    }
  };

  const handleStop = async () => {
    try {
      const result = await api.stopRecording();
      setRecordingId(result.session?.id || recordingId);
      const events = result.session?.events || [];
      setSteps(events.map((event: any, index: number) => ({
        id: event.id || `event-${index}`, checked: true,
        action: event.type === "navigate" ? "Go to URL" : event.type === "input" ? "Type text" : event.type === "submit" ? "Submit" : "Click",
        target: event.target?.name || event.target?.label || event.target?.text || event.target?.test_id || event.url || "Page",
        value: event.is_masked || event.type === "input" ? "" : (event.value || ""),
        isUrl: event.type === "navigate", isInput: event.type === "input",
        icon: event.type === "navigate" ? "🌐" : event.type === "input" ? "⌨️" : "🖱️",
        timestamp: new Date((event.timestamp || Date.now() / 1000) * 1000).toLocaleTimeString(),
        confidence: event.target?.min_confidence || 0.9, isSupported: true,
      })));
      setRecordingState("stopped");
      setActiveMode("review");
    } catch (error) {
      setRecordingError(error instanceof Error ? error.message : "Could not stop recording.");
    }
  };

  const handleDiscard = () => {
    if (confirm("Discard this entire observation session? All unsaved events will be cleared.")) {
      if (recordingId && recordingState !== "stopped") void api.stopRecording().catch(() => undefined);
      setSteps([]);
      setRecordingId(null);
      setRecordingError("");
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

  const handleToggleStep = (idx: number) => {
    const updated = [...steps];
    updated[idx] = { ...updated[idx], checked: !updated[idx].checked };
    setSteps(updated);
  };

  const checkedCount = steps.filter((s) => s.checked && s.isSupported !== false).length;
  const ambiguousCount = steps.filter((s) => s.isAmbiguous).length;

  // Filtered steps for review search
  const filteredSteps = searchQuery
    ? steps.filter(
        (s) =>
          s.action.toLowerCase().includes(searchQuery.toLowerCase()) ||
          s.target.toLowerCase().includes(searchQuery.toLowerCase()) ||
          (s.value || "").toLowerCase().includes(searchQuery.toLowerCase())
      )
    : steps;

  const handleConfirmAndSynthesize = async () => {
    if (!privacyConfirmed) {
      alert("Please review and confirm the privacy disclosure before model submission.");
      return;
    }

    void finishWorkflowSynthesis({});
  };

  const finishWorkflowSynthesis = async (answers: Record<string, string>) => {
    const reviewedSteps = steps.filter((step) => step.checked && step.isSupported !== false);
    if (!reviewedSteps.length) {
      alert("Keep at least one supported observation before drafting a workflow.");
      return;
    }
    const clarification = Object.entries(answers)
      .map(([question, answer]) => `${question}: ${answer}`)
      .join("\n");
    const goal = [taskName.trim(), desiredOutcome.trim(), clarification && `User clarification:\n${clarification}`]
      .filter(Boolean)
      .join("\n\n");
    const observations = reviewedSteps.map((step) => ({
      action: step.action,
      url: step.isUrl ? step.target : undefined,
      target: step.isUrl ? "Page" : step.target,
      role: step.isInput ? "textbox" : step.isChip ? "link" : "button",
      value: undefined,
      is_ambiguous: Boolean(step.isAmbiguous),
    }));
    setLoading(true);
    try {
      const result = recordingId
        ? await api.synthesizeWorkflow(recordingId, answers, clarifications)
        : await api.proposeObservations(goal, observations);
      if (result.status === "clarification_needed" && result.clarifications?.length) {
        setClarifications(result.clarifications);
        setShowClarification(true);
        return;
      }
      if (!result.workflow) throw new Error("WhistleCode could not prepare a draft from these recorded steps.");
      setShowClarification(false);
      onWorkflowGenerated(result.workflow as WorkflowDefinition);
    } catch (error) {
      alert(error instanceof Error ? error.message : "WhistleCode could not prepare this draft. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  // ── recording state pill color ──────────────────────────────────────────
  const statePillStyle: Record<RecordingState, { bg: string; color: string; dotColor: string }> = {
    idle:      { bg: "#f1f5f9", color: "#64748b", dotColor: "#94a3b8" },
    recording: { bg: "#fee2e2", color: "#dc2626", dotColor: "#ef4444" },
    paused:    { bg: "#fef3c7", color: "#b45309", dotColor: "#f59e0b" },
    stopped:   { bg: "#f0fdf4", color: "#15803d", dotColor: "#22c55e" },
  };
  const pill = statePillStyle[recordingState];

  return (
    <div className="teach-viewport-bg">
      <div className="bugbug-window-card">

        {/* ── SCOPE & PRIVACY BANNER ───────────────────────────────── */}
        <div className="teach-scope-banner">
          <div className="scope-info-left">
            <label className="scope-tag" htmlFor="recording-target-url">Website to record</label>
            <input
              id="recording-target-url"
              className="scope-url"
              style={{ width: 310, maxWidth: "48vw", padding: "7px 9px", border: "1px solid #cbd5e1", borderRadius: 6, background: "#fff" }}
              type="url"
              value={targetUrl}
              onChange={(event) => setTargetUrl(event.target.value)}
              placeholder="https://your-website.com"
              disabled={recordingState === "recording"}
              aria-label="Website URL to record"
            />
          </div>
          <div className="privacy-pill-safe">
            🛡 Passwords masked · clipboard excluded · screenshots off
          </div>
        </div>
        {recordingError && <div role="alert" style={{ margin: "0 0 14px", padding: "10px 14px", borderRadius: 8, color: "#991b1b", background: "#fef2f2", border: "1px solid #fecaca" }}>{recordingError}</div>}

        {/* ── GOAL DESCRIPTION ROW ─────────────────────────────────── */}
        <div
          style={{
            display: "flex",
            gap: 12,
            marginBottom: 18,
            padding: "10px 14px",
            background: "#f8fafc",
            borderRadius: 8,
            border: "1px solid #e2e8f0",
            alignItems: "flex-start",
          }}
        >
          <span style={{ fontSize: 18, marginTop: 2 }}>🎯</span>
          <div style={{ flex: 1 }}>
            <label style={{ fontSize: 10, fontWeight: 700, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.06em" }}>
              Task Goal
            </label>
            <input
              type="text"
              value={desiredOutcome}
              onChange={(e) => setDesiredOutcome(e.target.value)}
              style={{
                width: "100%",
                background: "transparent",
                border: "none",
                outline: "none",
                fontSize: 13,
                color: "#0f172a",
                marginTop: 2,
                fontWeight: 500,
              }}
              placeholder="Describe what this recording should automate..."
            />
          </div>
        </div>

        {/* ── TOP BAR ──────────────────────────────────────────────── */}
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
            {/* state badge */}
            <div
              style={{
                background: pill.bg,
                color: pill.color,
                fontSize: 11,
                fontWeight: 700,
                padding: "4px 10px",
                borderRadius: 9999,
                display: "inline-flex",
                alignItems: "center",
                gap: 5,
                userSelect: "none",
              }}
            >
              <span
                style={{
                  width: 7,
                  height: 7,
                  borderRadius: "50%",
                  background: pill.dotColor,
                  animation: recordingState === "recording" ? "pulse 1.4s infinite" : undefined,
                }}
              />
              {recordingState.toUpperCase()}
            </div>
          </div>

          {/* ── ACTION BUTTONS ──────────────────────────────────────── */}
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
              {activeMode === "review" ? "⏱ Timeline" : "🔍 Review Events"}
            </button>

            <button
              type="button"
              className="bb-btn bb-btn-stop"
              style={{ color: "#ef4444", borderColor: "#fecaca" }}
              onClick={handleDiscard}
              title="Discard entire session"
            >
              🗑 Discard
            </button>
          </div>
        </div>

        {/* ── STATS ROW (always visible) ───────────────────────────── */}
        <div
          style={{
            display: "flex",
            gap: 10,
            marginBottom: 16,
            flexWrap: "wrap",
          }}
        >
          {[
            { label: "Total Steps", value: steps.length, color: "#2563eb" },
            { label: "Selected", value: checkedCount, color: "#059669" },
            { label: "Ambiguous", value: ambiguousCount, color: ambiguousCount > 0 ? "#b45309" : "#94a3b8" },
            { label: "Deselected", value: steps.length - checkedCount, color: "#94a3b8" },
          ].map((stat) => (
            <div
              key={stat.label}
              style={{
                background: "#f8fafc",
                border: "1px solid #e2e8f0",
                borderRadius: 8,
                padding: "6px 14px",
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                minWidth: 70,
              }}
            >
              <span style={{ fontSize: 18, fontWeight: 800, color: stat.color }}>{stat.value}</span>
              <span style={{ fontSize: 9, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.05em" }}>
                {stat.label}
              </span>
            </div>
          ))}
        </div>

        {/* ══════════════════════════════════════════════════════════════
            MODE 1: RECORDING TIMELINE VIEW
        ══════════════════════════════════════════════════════════════ */}
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
              {steps.length === 0 && (
                <div
                  style={{
                    padding: "40px 20px",
                    textAlign: "center",
                    color: "#94a3b8",
                    fontSize: 13,
                  }}
                >
                  <div style={{ fontSize: 36, marginBottom: 10 }}>🎬</div>
                  <div style={{ fontWeight: 600, marginBottom: 4 }}>No events recorded yet</div>
                  <div style={{ fontSize: 11 }}>Start recording and interact with the target website.</div>
                </div>
              )}

              {steps.map((st, idx) => (
                <React.Fragment key={st.id}>
                  {idx === 4 && (
                    <div className="insertion-guide-row">
                      <span className="pointer-hand">👉</span>
                      <div className="yellow-dashed-line" />
                    </div>
                  )}

                  <div
                    className="bugbug-row-item"
                    style={{
                      opacity: st.checked ? 1 : 0.45,
                      borderLeft: st.isAmbiguous ? "3px solid #f59e0b" : st.isNew ? "3px solid #4f46e5" : "3px solid transparent",
                    }}
                  >
                    {/* step number */}
                    <span
                      style={{
                        fontSize: 10,
                        fontWeight: 700,
                        color: "#94a3b8",
                        minWidth: 22,
                        textAlign: "right",
                      }}
                    >
                      {idx + 1}
                    </span>

                    <input
                      type="checkbox"
                      className="bugbug-checkbox"
                      checked={st.checked}
                      onChange={() => handleToggleStep(idx)}
                    />

                    {/* icon */}
                    <span style={{ fontSize: 15, minWidth: 20, textAlign: "center" }}>{st.icon}</span>

                    <div className="bugbug-row-main">
                      {st.isNew && <span className="new-badge-purple">NEW</span>}
                      <ActionBadge action={st.action} />

                      {st.isUrl ? (
                        <a
                          href={st.target}
                          target="_blank"
                          rel="noreferrer"
                          className="url-link-styled"
                          style={{ fontSize: 12 }}
                        >
                          {st.target} ↗
                        </a>
                      ) : (
                        <span className="target-text-styled" style={{ fontSize: 12 }}>
                          {st.target}
                        </span>
                      )}

                      {st.isAmbiguous && (
                        <span className="badge-ambiguous" title="Choice requires clarification">
                          ⚠️ Ambiguous
                        </span>
                      )}
                    </div>

                    {st.value && <div className="bugbug-val-box">{st.value}</div>}

                    {/* confidence bar */}
                    <ConfidenceBar value={st.confidence} />

                    {/* timestamp */}
                    <span style={{ fontSize: 10, color: "#94a3b8", fontFamily: "monospace" }}>
                      {st.timestamp}
                    </span>

                    <span className="green-status-dot" title="Observed cleanly" />
                  </div>
                </React.Fragment>
              ))}
            </div>
          </div>
        )}

        {/* ══════════════════════════════════════════════════════════════
            MODE 2: OBSERVATION REVIEW SCREEN
        ══════════════════════════════════════════════════════════════ */}
        {activeMode === "review" && (
          <div className="observation-review-panel">
            <div className="review-panel-header">
              <div>
                <h3>Observation Review</h3>
                <p>
                  Review chronological actions, edit descriptions, remove accidental clicks, and verify privacy
                  sanitization before generating a workflow.
                </p>
              </div>
              <span className="badge-review-count">{checkedCount} / {steps.length} Selected</span>
            </div>

            {/* ── PRIVACY DISCLOSURE ─────────────────────────────── */}
            <div className="privacy-disclosure-box">
              <h4>Privacy &amp; Data Transmission Review</h4>
              <div className="privacy-columns-dual">
                <div className="p-col retained">
                  <strong>💾 Retained Locally Only</strong>
                  <ul>
                    <li>• Raw original observation log ({originalSteps.length} events)</li>
                    <li>• Element selectors &amp; timing signatures</li>
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

            {/* ── SEARCH BAR ────────────────────────────────────── */}
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                background: "#f8fafc",
                border: "1px solid #e2e8f0",
                borderRadius: 7,
                padding: "6px 12px",
              }}
            >
              <span style={{ color: "#94a3b8", fontSize: 13 }}>🔍</span>
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Filter steps by action, target, or value…"
                style={{
                  flex: 1,
                  background: "transparent",
                  border: "none",
                  outline: "none",
                  fontSize: 12,
                  color: "#0f172a",
                }}
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery("")}
                  style={{
                    background: "transparent",
                    border: "none",
                    color: "#94a3b8",
                    cursor: "pointer",
                    fontSize: 14,
                    padding: 0,
                  }}
                >
                  ✕
                </button>
              )}
            </div>

            {/* ── QUICK ACTIONS ─────────────────────────────────── */}
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <button
                type="button"
                onClick={() => setSteps(steps.map((s) => ({ ...s, checked: true })))}
                style={{
                  background: "#f0fdf4",
                  border: "1px solid #86efac",
                  color: "#15803d",
                  fontSize: 11,
                  fontWeight: 600,
                  padding: "4px 10px",
                  borderRadius: 6,
                  cursor: "pointer",
                }}
              >
                ✓ Select All
              </button>
              <button
                type="button"
                onClick={() => setSteps(steps.map((s) => ({ ...s, checked: false })))}
                style={{
                  background: "#fef2f2",
                  border: "1px solid #fca5a5",
                  color: "#dc2626",
                  fontSize: 11,
                  fontWeight: 600,
                  padding: "4px 10px",
                  borderRadius: 6,
                  cursor: "pointer",
                }}
              >
                ✗ Deselect All
              </button>
              {ambiguousCount > 0 && (
                <span
                  style={{
                    background: "#fef3c7",
                    border: "1px solid #fcd34d",
                    color: "#92400e",
                    fontSize: 11,
                    fontWeight: 600,
                    padding: "4px 10px",
                    borderRadius: 6,
                  }}
                >
                  ⚠️ {ambiguousCount} step{ambiguousCount > 1 ? "s" : ""} need clarification
                </span>
              )}
            </div>

            {/* ── REVIEW STEP TABLE ─────────────────────────────── */}
            <div className="review-steps-list">
              {filteredSteps.length === 0 && (
                <div
                  style={{
                    padding: "30px 20px",
                    textAlign: "center",
                    color: "#94a3b8",
                    fontSize: 13,
                  }}
                >
                  {searchQuery ? (
                    <>
                      <div style={{ fontSize: 28, marginBottom: 8 }}>🔍</div>
                      <div>No steps match "{searchQuery}"</div>
                    </>
                  ) : (
                    <>
                      <div style={{ fontSize: 28, marginBottom: 8 }}>📋</div>
                      <div>No steps to review</div>
                    </>
                  )}
                </div>
              )}

              {filteredSteps.map((st, idx) => {
                const realIdx = steps.indexOf(st);
                return (
                  <div
                    key={st.id}
                    className="review-step-card"
                    style={{
                      opacity: st.checked ? 1 : 0.5,
                      borderLeft: st.isAmbiguous
                        ? "3px solid #f59e0b"
                        : st.isNew
                        ? "3px solid #4f46e5"
                        : "3px solid transparent",
                    }}
                  >
                    {/* reorder controls */}
                    <div className="rev-reorder-controls">
                      <button
                        type="button"
                        disabled={realIdx === 0}
                        onClick={() => handleMoveStep(realIdx, "up")}
                        title="Move up"
                      >
                        ▲
                      </button>
                      <span className="rev-step-num">{realIdx + 1}</span>
                      <button
                        type="button"
                        disabled={realIdx === steps.length - 1}
                        onClick={() => handleMoveStep(realIdx, "down")}
                        title="Move down"
                      >
                        ▼
                      </button>
                    </div>

                    {/* step icon */}
                    <span style={{ fontSize: 18 }}>{st.icon}</span>

                    <div className="rev-step-body">
                      <div className="rev-step-meta">
                        <ActionBadge action={st.action} />
                        <span className="rev-time">{st.timestamp}</span>
                        <ConfidenceBar value={st.confidence} />
                        {st.isNew && (
                          <span className="new-badge-purple" style={{ fontSize: 9 }}>NEW</span>
                        )}
                        {st.isAmbiguous && (
                          <span className="badge-ambiguous">⚠️ Ambiguous Choice</span>
                        )}
                      </div>

                      <div className="rev-step-target-edit">
                        <label>Target:</label>
                        <input
                          type="text"
                          value={st.target}
                          onChange={(e) => handleEditTarget(st.id, e.target.value)}
                          placeholder="Element name or description..."
                        />
                        {st.value && (
                          <span
                            style={{
                              background: "#f1f5f9",
                              border: "1px solid #cbd5e1",
                              borderRadius: 4,
                              padding: "2px 8px",
                              fontSize: 11,
                              fontFamily: "monospace",
                              color: "#334155",
                              whiteSpace: "nowrap",
                            }}
                          >
                            "{st.value}"
                          </span>
                        )}
                      </div>
                    </div>

                    {/* include / exclude toggle */}
                    <button
                      type="button"
                      title={st.checked ? "Exclude this step" : "Include this step"}
                      onClick={() => handleToggleStep(realIdx)}
                      style={{
                        background: st.checked ? "#f0fdf4" : "#f1f5f9",
                        border: `1px solid ${st.checked ? "#86efac" : "#cbd5e1"}`,
                        color: st.checked ? "#15803d" : "#94a3b8",
                        borderRadius: 6,
                        padding: "3px 9px",
                        fontSize: 11,
                        fontWeight: 700,
                        cursor: "pointer",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {st.checked ? "✓ In" : "— Out"}
                    </button>

                    <button
                      type="button"
                      className="btn-remove-event"
                      onClick={() => handleRemoveEvent(st.id)}
                      title="Remove this event permanently"
                    >
                      🗑
                    </button>
                  </div>
                );
              })}
            </div>

            {/* ── CONFIRMATION & SYNTHESIZE ─────────────────────── */}
            <div className="review-confirmation-bar">
              <label className="checkbox-confirm-privacy">
                <input
                  type="checkbox"
                  checked={privacyConfirmed}
                  onChange={(e) => setPrivacyConfirmed(e.target.checked)}
                />
                <span>
                  I confirm that all steps are accurate, no credentials exist in descriptions, and these
                  sanitized observations may be converted to an editable workflow.
                </span>
              </label>

              {!privacyConfirmed && (
                <div
                  style={{
                    background: "#fef3c7",
                    border: "1px solid #fcd34d",
                    borderRadius: 6,
                    padding: "8px 12px",
                    fontSize: 11,
                    color: "#92400e",
                    fontWeight: 500,
                  }}
                >
                  ⚠️ You must confirm the privacy disclosure before generating a workflow.
                </div>
              )}

              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span style={{ fontSize: 11, color: "#94a3b8" }}>
                  {checkedCount} step{checkedCount !== 1 ? "s" : ""} will be submitted to the AI model
                </span>
                <button
                  type="button"
                  className="btn-synthesize-workflow"
                  onClick={handleConfirmAndSynthesize}
                  disabled={checkedCount === 0 || loading || !privacyConfirmed}
                >
                  {loading ? (
                    <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
                      <span
                        style={{
                          width: 12,
                          height: 12,
                          border: "2px solid rgba(255,255,255,0.4)",
                          borderTopColor: "#fff",
                          borderRadius: "50%",
                          display: "inline-block",
                          animation: "spin 0.8s linear infinite",
                        }}
                      />
                      Preparing your draft…
                    </span>
                  ) : (
                    "Create workflow draft →"
                  )}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ── FLOATING ACTION WIDGET (recording mode) ──────────────── */}
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

      {/* ── CLARIFICATION MODAL ───────────────────────────────────── */}
      {showClarification && (
        <ClarificationModal
          clarifications={clarifications}
          onConfirm={(answers) => void finishWorkflowSynthesis(answers)}
          onCancel={() => {
            setShowClarification(false);
            setClarifications([]);
          }}
          loading={loading}
        />
      )}

      {/* keyframe animations */}
      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
        @keyframes pulse {
          0%, 100% { opacity: 1; transform: scale(1); }
          50%       { opacity: 0.5; transform: scale(1.3); }
        }
      `}</style>
    </div>
  );
};
