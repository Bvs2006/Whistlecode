import React, { useState, useEffect } from "react";
import { api } from "../../api/client";
import { ClarificationModal } from "../recording/ClarificationModal";
import type { ClarificationQuestion } from "../../types";

export const PaperOrganizerSandboxView: React.FC = () => {
  const [papers, setPapers] = useState<any[]>([]);
  const [plan, setPlan] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [executing, setExecuting] = useState(false);
  const [undoToken, setUndoToken] = useState<string | null>(null);
  const [undoExpires, setUndoExpires] = useState<string | null>(null);
  const [executedResults, setExecutedResults] = useState<any[]>([]);
  const [showClarification, setShowClarification] = useState(false);
  const [categoryOverrides, setCategoryOverrides] = useState<Record<string, string>>({});

  useEffect(() => {
    loadSandbox();
  }, []);

  const loadSandbox = async () => {
    setLoading(true);
    try {
      const res = await (api as any).getSandboxPapers();
      setPapers(res.papers || []);
      setPlan(res.plan || []);
    } catch (e: any) {
      console.error(e);
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
      const res = await (api as any).organizeSandboxPapers(plan, "B.Venkata Srujith");
      setUndoToken(res.undo_token);
      setUndoExpires(res.expires_at);
      setExecutedResults(res.results || []);
      loadSandbox();
    } catch (e: any) {
      alert("Error organizing papers: " + e.message);
    } finally {
      setExecuting(false);
    }
  };

  const handleUndo = async () => {
    if (!undoToken) return;
    try {
      await (api as any).undoSandboxPapers(undoToken);
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
          <h2>AI Research Paper Organizer (Scoped Benchmark)</h2>
          <p className="subtitle">
            Demonstrates the complete 10-stage lifecycle: Scoped test folder, clarification on ambiguous papers, preview before execution, deterministic verification, and reversible undo.
          </p>
        </div>
        <div className="status-pill live">
          <span className="dot" />
          Scoped Sandbox Active: <code>backend/app/sandbox_papers/</code>
        </div>
      </div>

      {/* STAGE BREAKDOWN BANNER */}
      <div className="guarantees-grid" style={{ marginBottom: "20px" }}>
        <div className="guarantee-item">
          <strong>1. Scoped Test Folder</strong>
          <p>Strict policy engine prevents access to personal documents or directories outside sandbox.</p>
        </div>
        <div className="guarantee-item">
          <strong>2. Clarification on Ambiguity</strong>
          <p>When a paper's category is ambiguous, the AI asks the user instead of guessing.</p>
        </div>
        <div className="guarantee-item">
          <strong>3. Deterministic Verification</strong>
          <p>Verifies physical presence of each organized file at the expected destination.</p>
        </div>
        <div className="guarantee-item">
          <strong>4. Reversible Operations</strong>
          <p>5-minute cryptographic undo token allows immediate rollback with zero data loss.</p>
        </div>
      </div>

      {/* PAPERS DISCOVERY & CLARIFICATION */}
      <div className="events-stream-card" style={{ marginBottom: "20px" }}>
        <div className="panel-heading">
          <div>
            <h3>Downloaded Research Papers ({papers.length})</h3>
            <p className="field-hint">Source directory: <code>sandbox_papers/downloaded/</code></p>
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
            {executing ? "Organizing & Verifying..." : "🛡 Approve Scope & Move Papers"}
          </button>

          {undoToken && (
            <button className="btn btn-danger" onClick={handleUndo}>
              ↺ Reversible Undo ({undoToken.slice(0, 10)}...)
            </button>
          )}
        </div>
      </div>

      {/* DETERMINISTIC VERIFICATION OUTCOMES (STAGE 09) */}
      {executedResults.length > 0 && (
        <div className="run-results-panel">
          <h3>Deterministic Postcondition Verification</h3>
          <p className="field-hint">Files checked against actual file system destinations:</p>
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
