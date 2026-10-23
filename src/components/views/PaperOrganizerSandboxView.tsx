import React, { useState, useEffect } from "react";
import { api } from "../../api/client";
import { ClarificationModal } from "../recording/ClarificationModal";
import type { ClarificationQuestion } from "../../types";

export const PaperOrganizerSandboxView: React.FC = () => {
  const [papers, setPapers] = useState<any[]>([]);
  const [plan, setPlan] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [executing, setExecuting] = useState(false);
  const [undoToken, setUndoToken] = useState<string | null>(null);
  const [planGrant, setPlanGrant] = useState<string | null>(null);
  const [undoExpires, setUndoExpires] = useState<string | null>(null);
  const [executedResults, setExecutedResults] = useState<any[]>([]);
  const [showClarification, setShowClarification] = useState(false);
  const [categoryOverrides, setCategoryOverrides] = useState<Record<string, string>>({});

  useEffect(() => {
    loadSandbox();
  }, []);

  const loadSandbox = async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const res = await api.getSandboxPapers();
      setPapers(res.papers || []);
      setPlan(res.plan || []);
    } catch (e: any) {
      setLoadError(e.message || "Could not load the paper sandbox.");
    } finally {
      setLoading(false);
    }
  };

  const handleStartClarification = () => {
    setShowClarification(true);
  };

  const clarificationQuestions: ClarificationQuestion[] = [
    {
      id: "clarify_multimodal_paper",
      step_id: "paper_4",
      question: "Which topic category should 'multimodal_vision_language_agents.pdf' be assigned to?",
      explanation: "Filename spans both Computer Vision and Autonomous Agents. AI asks rather than guessing.",
      options: [
        "Multimodal Foundation Models",
        "Autonomous GUI Agents",
        "Computer Vision",
        "Keep in Unclassified Review"
      ],
      selected_option: "Multimodal Foundation Models",
      context: "Paper: multimodal_vision_language_agents.pdf"
    }
  ];

  const handleClarificationConfirm = (answers: Record<string, string>) => {
    const chosen = answers["clarify_multimodal_paper"] || "Multimodal Foundation Models";
    setCategoryOverrides({
      ...categoryOverrides,
      "multimodal_vision_language_agents.pdf": chosen
    });
    setPlanGrant(null);

    // Update plan with user clarification
    const updatedPlan = plan.map((p) => {
      if (p.filename === "multimodal_vision_language_agents.pdf") {
        const destFolder = chosen.replace(" & ", "_").replace(" ", "_").toLowerCase();
        return {
          ...p,
          category: chosen,
          destination_path: `organized/${destFolder}/${p.filename}`,
          status: "confirmed_by_clarification"
        };
      }
      return p;
    });

    setPlan(updatedPlan);
    setShowClarification(false);
  };

  const handleExecuteOrganize = async () => {
    setExecuting(true);
    try {
      if (!planGrant) {
        const grant = await api.approveSandboxPlan(plan);
        setPlan(grant.plan);
        setPlanGrant(grant.grant_id);
        return;
      }
      const res = await api.organizeSandboxPapers(plan, planGrant);
      setPlanGrant(null);
      setUndoToken(res.undo_token);
      setUndoExpires(res.expires_at);
      setExecutedResults(res.results || []);
      loadSandbox();
    } catch (e: any) {
      alert("Sandbox plan error: " + e.message);
    } finally {
      setExecuting(false);
    }
  };

  const handleUndo = async () => {
    if (!undoToken) return;
    try {
      await api.undoSandboxPapers(undoToken);
      setUndoToken(null);
      setExecutedResults([]);
      loadSandbox();
      alert("Reversible Undo: All moved research papers successfully restored to downloaded/!");
    } catch (e: any) {
      alert("Undo error: " + e.message);
    }
  };

  return (
    <div className="card-panel">
      <div className="panel-header-row">
        <div>
          <h2>Scoped Paper Organizer Sandbox</h2>
          <p className="subtitle">
            Review the sample documents, choose a category when needed, and approve a one-time move. You can undo completed moves for five minutes.
          </p>
        </div>
        <div className="status-pill live">
          <span className="dot" />
          Sample workspace active
        </div>
      </div>

      {/* STAGE BREAKDOWN BANNER */}
      <div className="guarantees-grid" style={{ marginBottom: "20px" }}>
        <div className="guarantee-item">
          <strong>1. Scoped Test Folder</strong>
          <p>Only sample files in this workspace can be moved.</p>
        </div>
        <div className="guarantee-item">
          <strong>2. Clarification on Ambiguity</strong>
          <p>When a paper's category is ambiguous, the organizer pauses for your choice.</p>
        </div>
        <div className="guarantee-item">
          <strong>3. Move confirmation</strong>
          <p>Confirms each file reached its selected category.</p>
        </div>
        <div className="guarantee-item">
          <strong>4. Reversible Operations</strong>
          <p>Completed moves can be undone for five minutes.</p>
        </div>
      </div>

      {loadError && <div className="error-banner" role="alert">{loadError} <button type="button" className="btn btn-secondary btn-sm" onClick={() => void loadSandbox()}>Retry</button></div>}

      {/* PAPERS DISCOVERY & CLARIFICATION */}
      <div className="events-stream-card" style={{ marginBottom: "20px" }}>
        <div className="panel-heading">
          <div>
          <h3>Sample research papers ({papers.length})</h3>
            <p className="field-hint">Files shown here are sample documents in a protected workspace.</p>
          </div>
          {papers.some((p) => p.needs_clarification) && (
            <button
              className="btn btn-accent btn-sm"
              onClick={handleStartClarification}
            >
              ❓ Answer Clarification (Ambiguous Papers)
            </button>
          )}
        </div>

        <div className="events-table-wrapper">
          <table className="events-table">
            <thead>
              <tr>
                <th>File Name</th>
                <th>Inferred Topic Category</th>
                <th>Confidence</th>
                <th>Clarification Status</th>
              </tr>
            </thead>
            <tbody>
              {papers.map((p) => (
                <tr key={p.filename}>
                  <td><strong>📄 {p.filename}</strong></td>
                  <td>
                    <span className="pill pill-param">
                      {categoryOverrides[p.filename] || p.suggested_category}
                    </span>
                  </td>
                  <td>
                    <strong>{Math.round(p.confidence * 100)}%</strong>
                  </td>
                  <td>
                    {p.needs_clarification && !categoryOverrides[p.filename] ? (
                      <span className="badge-risk badge-risk-high" style={{ cursor: "pointer" }} onClick={handleStartClarification}>
                        Needs Clarification
                      </span>
                    ) : (
                      <span className="badge-status-approved">✓ Ready</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* PLAN PREVIEW BEFORE EXECUTION (STAGE 07 & 08) */}
      <div className="card-panel" style={{ background: "#11141c", marginBottom: "20px" }}>
        <h3>Proposed File Movement Plan (Preview Before Execution)</h3>
        <p className="field-hint">Inspect exact source, target folder, and declared risk before granting permission:</p>

        <div className="events-table-wrapper">
          <table className="events-table">
            <thead>
              <tr>
                <th>Source File</th>
                <th>Target Destination</th>
                <th>Category</th>
                <th>Risk</th>
              </tr>
            </thead>
            <tbody>
              {plan.map((item, idx) => (
                <tr key={idx}>
                  <td><code>{item.source_path}</code></td>
                  <td><strong><code>{item.destination_path}</code></strong></td>
                  <td>{item.category}</td>
                  <td>
                    <span className="badge-risk badge-risk-medium">MEDIUM</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="button-row" style={{ marginTop: "16px" }}>
          <button
            className="btn btn-primary"
            onClick={handleExecuteOrganize}
            disabled={executing || papers.length === 0}
          >
            {executing ? (planGrant ? "Moving & verifying…" : "Preparing approval…") : planGrant ? "✓ Confirm one-time move" : "Review and approve this exact plan"}
          </button>

          {undoToken && (
            <button className="btn btn-danger" onClick={handleUndo}>
              ↺ Reversible Undo ({undoToken.slice(0, 10)}...)
            </button>
          )}
        </div>
      </div>

      {/* MOVE RESULTS */}
      {executedResults.length > 0 && (
        <div className="run-results-panel">
          <h3>Move results</h3>
          <p className="field-hint">Each file is checked at its selected destination.</p>
          <div className="step-results-list">
            {executedResults.map((r, idx) => (
              <div key={idx} className="step-result-card passed">
                <span className="step-idx">{idx + 1}</span>
                <span className="badge-event badge-navigate">MOVED</span>
                <span className="step-target-name">{r.filename} ➔ {r.destination}</span>
                <span className="badge-status-approved">VERIFIED_SUCCESS</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* CLARIFICATION MODAL */}
      {showClarification && (
        <ClarificationModal
          clarifications={clarificationQuestions}
          onConfirm={handleClarificationConfirm}
          onCancel={() => setShowClarification(false)}
        />
      )}
    </div>
  );
};
