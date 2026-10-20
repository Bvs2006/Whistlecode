import React, { useState, useEffect } from "react";
import { api } from "../../api/client";
import { ClarificationModal } from "./ClarificationModal";
import type { RecordingSession, WorkflowDefinition, ClarificationQuestion } from "../../types";

type Props = {
  onWorkflowGenerated: (wf: WorkflowDefinition) => void;
};

export const RecordingStudio: React.FC<Props> = ({ onWorkflowGenerated }) => {
  const [targetUrl, setTargetUrl] = useState("http://localhost:8000/testsite#restaurants");
  const [taskDesc, setTaskDesc] = useState("Choose best restaurant and make reservation");
  const [isRecording, setIsRecording] = useState(false);
  const [currentSession, setCurrentSession] = useState<RecordingSession | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Active desktop window info
  const [activeWindow, setActiveWindow] = useState<{ window_title?: string; process_name?: string }>({});

  // Capture Permissions
  const [captureScreenshots, setCaptureScreenshots] = useState(true);
  const [captureClicks, setCaptureClicks] = useState(true);
  const [captureKeyboard, setCaptureKeyboard] = useState(true);

  // Clarifications state
  const [clarifications, setClarifications] = useState<ClarificationQuestion[]>([]);
  const [showClarificationModal, setShowClarificationModal] = useState(false);

  // Screenshot modal preview
  const [previewImage, setPreviewImage] = useState<string | null>(null);

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
          const win = await api.getDesktopActiveWindow();
          if (win) {
            setActiveWindow(win);
          }
        } catch (e) {
          console.error(e);
        }
      }, 1000);
    }
    return () => clearInterval(interval);
  }, [isRecording]);

  const handleStart = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.startRecording(targetUrl, taskDesc, captureScreenshots);
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
    setLoading(true);
    try {
      const res = await api.synthesizeWorkflow(currentSession.id, answers);
      setShowClarificationModal(false);
      if (res.workflow) {
        onWorkflowGenerated(res.workflow);
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
        setShowClarificationModal(true);
        setLoading(false);
        return;
      }

      const res = await api.synthesizeWorkflow(currentSession.id);
      if (res.workflow) {
        onWorkflowGenerated(res.workflow);
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
          <h2>Desktop & Browser Observer (SUGILITE MVP)</h2>
          <p className="subtitle">
            Observes permitted mouse clicks, keyboard actions, active application/window, screenshots, and accessible UI elements.
          </p>
        </div>
        <div className={`status-pill ${isRecording ? "live" : "idle"}`}>
          <span className="dot" />
          {isRecording ? "Observer Active" : "Observer Idle"}
        </div>
      </div>

      {error && <div className="error-banner">⚠️ {error}</div>}

      {/* ACTIVE OBSERVER METADATA BANNER */}
      <div className="observer-scope-banner">
        <div className="banner-item">
          <span className="label">Active App:</span>
          <strong>{activeWindow.process_name || "Chromium Sandbox"}</strong>
        </div>
        <div className="banner-item">
          <span className="label">Window Title:</span>
          <span>{activeWindow.window_title || "WhistleCode Benchmark Site"}</span>
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
          <label>Target URL / Application Scope</label>
          <input
            type="text"
            value={targetUrl}
            onChange={(e) => setTargetUrl(e.target.value)}
            disabled={isRecording}
          />
        </div>
        <div className="input-group">
          <label>Demonstration Goal / Task Description</label>
          <input
            type="text"
            value={taskDesc}
            onChange={(e) => setTaskDesc(e.target.value)}
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
            ● Launch Observer & Demonstrate Task
          </button>
        ) : (
          <button
            className="btn btn-danger"
            onClick={handleStop}
            disabled={loading}
          >
            ■ Finish & Stop Observer
          </button>
        )}

        {currentSession && !isRecording && currentSession.events?.length > 0 && (
          <button
            className="btn btn-accent"
            onClick={handleDirectSynthesize}
            disabled={loading}
          >
            ✦ Synthesize Workflow with Clarification Dialogue ({currentSession.events.length} Events)
          </button>
        )}
      </div>

      {/* CAPTURED EVENT STREAM WITH SCREENSHOTS & ACCESSIBLE UI */}
      <div className="events-stream-card">
        <div className="events-card-header">
          <div>
            <h3>Captured Input Events & UI Elements ({currentSession?.events?.length || 0})</h3>
            <p className="field-hint">
              Captures accessible role, accessible name, test ID, bounding boxes, and visual screenshots.
            </p>
          </div>
        </div>

        {(!currentSession || currentSession.events.length === 0) ? (
          <div className="empty-state">
            No demonstration events recorded yet. Click "Launch Observer & Demonstrate Task" to begin.
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
          clarifications={clarifications}
          onConfirm={handleClarificationConfirm}
          onCancel={() => {
            setShowClarificationModal(false);
            handleDirectSynthesize();
          }}
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
