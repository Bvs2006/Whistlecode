import React, { useState, useEffect } from "react";
import { api } from "../../api/client";
import { ClarificationModal } from "./ClarificationModal";
import type { RecordingSession, WorkflowDefinition, ClarificationQuestion } from "../../types";

type Props = {
  onWorkflowGenerated: (wf: WorkflowDefinition) => void;
  initialPreset?: { url: string; description: string } | null;
};

export const RecordingStudio: React.FC<Props> = ({ onWorkflowGenerated, initialPreset }) => {
  const [targetUrl, setTargetUrl] = useState("");
  const [taskDesc, setTaskDesc] = useState("");
  const [isRecording, setIsRecording] = useState(false);
  const [currentSession, setCurrentSession] = useState<RecordingSession | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Capture Permissions
  const [captureScreenshots, setCaptureScreenshots] = useState(true);
  const [captureClicks, setCaptureClicks] = useState(true);
  const [captureKeyboard, setCaptureKeyboard] = useState(true);

  // Clarifications state
  const [clarifications, setClarifications] = useState<ClarificationQuestion[]>([]);
  const [clarificationHistory, setClarificationHistory] = useState<ClarificationQuestion[]>([]);
  const [clarificationAnswers, setClarificationAnswers] = useState<Record<string, string>>({});
  const [showClarificationModal, setShowClarificationModal] = useState(false);

  // Screenshot modal preview
  const [previewImage, setPreviewImage] = useState<string | null>(null);

  useEffect(() => {
    if (!initialPreset) return;
    setTargetUrl(initialPreset.url);
    setTaskDesc(initialPreset.description);
  }, [initialPreset]);

  // Poll current session & active window while recording
  useEffect(() => {
    let interval: any = null;
    if (isRecording) {
      interval = setInterval(async () => {
        try {
          const res = await api.getCurrentRecording();
          if (res.session) {
            setCurrentSession(res.session);
          }
        } catch (e) {
          console.error(e);
        }
      }, 1000);
    }
    return () => clearInterval(interval);
  }, [isRecording]);

  const handleStart = async () => {
    const trimmedUrl = targetUrl.trim();
    if (!/^https?:\/\//i.test(trimmedUrl)) {
      setError("Enter a complete website address beginning with https:// or http://.");
      return;
    }
    if (!taskDesc.trim()) {
      setError("Describe the task you are about to demonstrate.");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await api.startRecording(trimmedUrl, taskDesc.trim(), captureScreenshots, captureClicks, captureKeyboard);
      setIsRecording(true);
      setCurrentSession(res.session);
    } catch (err: any) {
      setError(err.message || "Failed to start recording");
    } finally {
      setLoading(false);
    }
  };

  const handleStop = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.stopRecording();
      setIsRecording(false);
      setCurrentSession(res.session);

      // Fetch clarifying questions automatically upon recording completion (SUGILITE MVP)
      if (res.session?.id) {
        try {
          const cRes = await api.getClarifications(res.session.id);
          if (cRes.clarifications && cRes.clarifications.length > 0) {
            setClarifications(cRes.clarifications);
            setClarificationHistory(cRes.clarifications);
            setClarificationAnswers({});
            setShowClarificationModal(true);
          }
        } catch (ce) {
          console.warn("No clarifications needed or error:", ce);
        }
      }
    } catch (err: any) {
      setError(err.message || "Failed to stop recording");
    } finally {
      setLoading(false);
    }
  };

  const handleClarificationConfirm = async (answers: Record<string, string>) => {
    if (!currentSession) return;
    const mergedAnswers = { ...clarificationAnswers, ...answers };
    const questionHistory = [...clarificationHistory];
    for (const question of clarifications) {
      if (!questionHistory.some((item) => item.id === question.id)) questionHistory.push(question);
    }
    setClarificationAnswers(mergedAnswers);
    setClarificationHistory(questionHistory);
    setLoading(true);
    try {
      const res = await api.synthesizeWorkflow(currentSession.id, mergedAnswers, questionHistory);
      if (res.status === "clarification_needed" && res.clarifications?.length) {
        const nextQuestions = res.clarifications as ClarificationQuestion[];
        setClarifications(nextQuestions);
        setClarificationHistory([...questionHistory, ...nextQuestions.filter((item) => !questionHistory.some((old) => old.id === item.id))]);
        setShowClarificationModal(true);
        return;
      }
      if (res.workflow) {
        setShowClarificationModal(false);
        onWorkflowGenerated(res.workflow);
      } else {
        throw new Error("WhistleCode could not prepare a workflow draft from the reviewed recording.");
      }
    } catch (err: any) {
      setError(err.message || "Failed to synthesize workflow with clarification answers");
    } finally {
      setLoading(false);
    }
  };

  const handleDirectSynthesize = async () => {
    if (!currentSession) return;
    setLoading(true);
    try {
      // First check if clarifications exist
      const cRes = await api.getClarifications(currentSession.id);
      if (cRes.clarifications && cRes.clarifications.length > 0) {
        setClarifications(cRes.clarifications);
        setClarificationHistory(cRes.clarifications);
        setClarificationAnswers({});
        setShowClarificationModal(true);
        setLoading(false);
        return;
      }

      const res = await api.synthesizeWorkflow(currentSession.id);
      if (res.workflow) {
        onWorkflowGenerated(res.workflow);
      } else if (res.status === "clarification_needed" && res.clarifications?.length) {
        const nextQuestions = res.clarifications as ClarificationQuestion[];
        setClarifications(nextQuestions);
        setClarificationHistory(nextQuestions);
        setClarificationAnswers({});
        setShowClarificationModal(true);
      } else {
        throw new Error("WhistleCode could not prepare a workflow draft from the reviewed recording.");
      }
    } catch (err: any) {
      setError(err.message || "Failed to synthesize workflow");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="card-panel">
      <div className="panel-header-row">
        <div>
          <h2>Teach a task</h2>
          <p className="subtitle">
            Record a real task on the website you choose. WhistleCode captures the browser actions and turns them into an editable workflow for you to review.
          </p>
        </div>
        <div className={`status-pill ${isRecording ? "live" : "idle"}`}>
          <span className="dot" />
          {isRecording ? "Recording · browser window open" : currentSession?.status === "stopped" ? "Ready to review" : "Ready to record"}
        </div>
      </div>

      <ol className="recording-guide" aria-label="How to record a task">
        <li><span>1</span><div><strong>Choose a real website</strong><small>Enter the page where the task starts and describe the result you want.</small></div></li>
        <li><span>2</span><div><strong>Record your task</strong><small>Use the separate browser window to perform the task, then return here and stop recording.</small></div></li>
        <li><span>3</span><div><strong>Review before running</strong><small>Inspect the captured steps, edit the workflow, then approve its website scope and permissions.</small></div></li>
      </ol>

      <div className="recording-reuse-note">
        <span aria-hidden="true">↻</span>
        <p><strong>Make it reusable.</strong> Record a browser, Docs, or PowerPoint task once, review and save its workflow, then ask for that saved task again in Ask AI. Every run still follows its saved website scope and approval rules.</p>
      </div>

      {error && <div className="error-banner">⚠️ {error}</div>}

      {/* ACTIVE OBSERVER METADATA BANNER */}
      <div className="observer-scope-banner">
        <div className="banner-item">
          <span className="label">Website scope:</span>
          <strong>{currentSession?.target_url || targetUrl || "Choose a website above"}</strong>
        </div>
        <div className="banner-item">
          <span className="label">Captured steps:</span>
          <span>{currentSession?.events?.length || 0}{isRecording ? " · updating live" : ""}</span>
        </div>
        <div className="banner-item">
          <span className="label">Capture Permissions:</span>
          <span className="pill pill-origin">Clicks: {captureClicks ? "✓" : "✗"}</span>
          <span className="pill pill-origin">Keys: {captureKeyboard ? "✓" : "✗"}</span>
          <span className="pill pill-origin">Screenshots: {captureScreenshots ? "✓" : "✗"}</span>
        </div>
      </div>

      <div className="recording-form-grid">
        <div className="input-group">
            <label>Website where the task starts</label>
          <input
            type="text"
            value={targetUrl}
            placeholder="https://your-website.com"
            onChange={(e) => setTargetUrl(e.target.value)}
            disabled={isRecording}
          />
        </div>
        <div className="input-group">
            <label>Describe the work you want to demonstrate</label>
          <textarea
            value={taskDesc}
            onChange={(e) => setTaskDesc(e.target.value)}
            placeholder="Example: Search for Acme in the CRM, open the first matching account, and export its latest activity."
            rows={3}
            disabled={isRecording}
          />
        </div>
      </div>

      {/* PERMISSIONS TOGGLES */}
      <div className="permissions-bar">
        <label className="checkbox-pill">
          <input
            type="checkbox"
            checked={captureScreenshots}
            onChange={(e) => setCaptureScreenshots(e.target.checked)}
            disabled={isRecording}
          />
          <span>Capture Visual Screenshots</span>
        </label>
        <label className="checkbox-pill">
          <input
            type="checkbox"
            checked={captureClicks}
            onChange={(e) => setCaptureClicks(e.target.checked)}
            disabled={isRecording}
          />
          <span>Capture Permitted Clicks</span>
        </label>
        <label className="checkbox-pill">
          <input
            type="checkbox"
            checked={captureKeyboard}
            onChange={(e) => setCaptureKeyboard(e.target.checked)}
            disabled={isRecording}
          />
          <span>Capture Keyboard Actions</span>
        </label>
      </div>

      <div className="button-row">
        {!isRecording ? (
          <button
            className="btn btn-primary"
            onClick={handleStart}
            disabled={loading}
          >
            <span aria-hidden="true">⏺</span> Record this task
          </button>
        ) : (
          <button
            className="btn btn-danger"
            onClick={handleStop}
            disabled={loading}
          >
            <span aria-hidden="true">■</span> Stop recording
          </button>
        )}

        {currentSession && !isRecording && currentSession.events?.length > 0 && (
          <button
            className="btn btn-accent"
            onClick={handleDirectSynthesize}
            disabled={loading}
          >
            ✦ Review {currentSession.events.length} captured steps
          </button>
        )}
      </div>

      {/* CAPTURED EVENT STREAM WITH SCREENSHOTS & ACCESSIBLE UI */}
      <div className="events-stream-card">
        <div className="events-card-header">
          <div>
            <h3>Captured website actions ({currentSession?.events?.length || 0})</h3>
            <p className="field-hint">
          These are the actions captured on the selected website. Sensitive values are masked or left out of the workflow draft.
            </p>
          </div>
        </div>

        {(!currentSession || currentSession.events.length === 0) ? (
          <div className="empty-state">
          No website actions yet. Enter a real website and task above, then start recording.
          </div>
        ) : (
          <div className="events-table-wrapper">
            <table className="events-table">
              <thead>
                <tr>
                  <th>Type</th>
                  <th>Visual Snapshot</th>
                  <th>Target UI Element & Accessibility</th>
                  <th>Captured Value</th>
                  <th>Active Window</th>
                </tr>
              </thead>
              <tbody>
                {currentSession.events.map((evt, idx) => (
                  <tr key={evt.id || idx}>
                    <td>
                      <span className={`badge-event badge-${evt.type}`}>{evt.type.toUpperCase()}</span>
                    </td>
                    <td>
                      {evt.screenshot ? (
                        <img
                          src={evt.screenshot}
                          alt="Step Snapshot"
                          className="event-screenshot-thumb"
                          onClick={() => setPreviewImage(evt.screenshot || null)}
                          title="Click to view full screenshot"
                        />
                      ) : (
                        <span className="no-ss-pill">No snapshot</span>
                      )}
                    </td>
                    <td>
                      <div className="target-summary">
                        <strong>{evt.target?.name || evt.target?.test_id || evt.target?.role || "Element"}</strong>
                        {evt.target?.role && <span className="tag-role">[{evt.target.role}]</span>}
                        {evt.target?.test_id && <span className="tag-testid">id: {evt.target.test_id}</span>}
                        {evt.target?.bounding_box && (
                          <span className="tag-box">
                            {evt.target.bounding_box.width}x{evt.target.bounding_box.height}
                          </span>
                        )}
                      </div>
                    </td>
                    <td>
                      {evt.is_masked ? (
                        <span className="badge-masked">[MASKED_SECRET]</span>
                      ) : (
                        <code>{evt.value || "—"}</code>
                      )}
                    </td>
                    <td className="url-cell">{evt.active_window || evt.url}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* CLARIFICATION DIALOGUE MODAL */}
      {showClarificationModal && (
        <ClarificationModal
          key={clarifications.map((question) => question.id).join(":")}
          clarifications={clarifications}
          onConfirm={handleClarificationConfirm}
          onCancel={() => setShowClarificationModal(false)}
          loading={loading}
        />
      )}

      {/* SCREENSHOT FULL PREVIEW MODAL */}
      {previewImage && (
        <div className="modal-backdrop" onClick={() => setPreviewImage(null)}>
          <div className="modal-card image-preview-modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>Captured Demonstration Snapshot</h3>
              <button className="icon-btn" onClick={() => setPreviewImage(null)}>✕</button>
            </div>
            <img src={previewImage} alt="Demonstration Snapshot Full" className="full-preview-img" />
          </div>
        </div>
      )}
    </div>
  );
};
