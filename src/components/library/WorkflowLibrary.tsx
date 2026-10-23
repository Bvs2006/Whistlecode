import React, { useState, useEffect } from "react";
import { api } from "../../api/client";
import type { WorkflowDefinition, WorkflowSearchResult } from "../../types";

type Props = {
  onSelectWorkflow: (wf: WorkflowDefinition) => void;
  onNavigateToEditor: () => void;
  onNavigateToRun: () => void;
};

export const WorkflowLibrary: React.FC<Props> = ({
  onSelectWorkflow,
  onNavigateToEditor,
  onNavigateToRun,
}) => {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    handleSearch(query);
  }, []);

  const handleSearch = async (searchTerm: string) => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.searchWorkflows(searchTerm);
      setResults(res.results || []);
    } catch (err: any) {
      setError(err.message || "Failed to search workflows");
    } finally {
      setLoading(false);
    }
  };

  const handleSelectAndEdit = (wf: any) => {
    onSelectWorkflow(wf);
    onNavigateToEditor();
  };

  const handleSelectAndRun = (wf: any) => {
    onSelectWorkflow(wf);
    onNavigateToRun();
  };

  return (
    <div className="card-panel">
      <div className="panel-header-row">
        <div>
          <h2>Reusable Workflow Library</h2>
          <p className="subtitle">
            Workflows, inputs, permissions, and saved versions. Search using a task name or description.
          </p>
        </div>
        <div className="status-pill live">
          <span className="dot" />
          Workflows saved
        </div>
      </div>

      {/* NATURAL LANGUAGE SEARCH BAR */}
      <div className="nl-search-box">
        <div className="nl-input-row">
          <span className="nl-search-icon">🔍</span>
          <input
            type="text"
            className="nl-search-input"
            placeholder="Search using natural language (e.g. 'how to register customer', 'best dining restaurant by rating', 'ticket confirmation')..."
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              handleSearch(e.target.value);
            }}
          />
          {query && (
            <button
              className="icon-btn"
              onClick={() => {
                setQuery("");
                handleSearch("");
              }}
            >
              ✕
            </button>
          )}
        </div>
        <div className="nl-suggestions-row">
          <span className="suggestion-label">Try asking:</span>
          <button className="tag-chip" onClick={() => { setQuery("register customer profile"); handleSearch("register customer profile"); }}>
            "register customer profile"
          </button>
          <button className="tag-chip" onClick={() => { setQuery("choose restaurant with high rating"); handleSearch("choose restaurant with high rating"); }}>
            "choose restaurant with high rating"
          </button>
          <button className="tag-chip" onClick={() => { setQuery("support ticket with confirmation gate"); handleSearch("support ticket with confirmation gate"); }}>
            "support ticket with confirmation gate"
          </button>
        </div>
      </div>

      {error && <div className="error-banner">⚠️ {error}</div>}

      {/* SEARCH RESULTS / WORKFLOW CARDS */}
      <div className="library-results-grid">
        {loading ? (
          <div className="loading-state">Searching saved workflows…</div>
        ) : results.length === 0 ? (
          <div className="empty-state">
            No workflows matched your search query. Try typing a different description or keyword.
          </div>
        ) : (
          results.map((wf) => (
            <div key={wf.id || wf.workflow_id} className="workflow-library-card">
              <div className="library-card-header">
                <div>
                  <h3 className="wf-card-title">{wf.title}</h3>
                  <p className="wf-card-intent">{wf.intent}</p>
                </div>
                <div className="card-badges">
                  {wf.relevance_score > 0 && (
                    <span className="badge-relevance">
                      ★ {Math.round(wf.relevance_score * 10)}% Match
                    </span>
                  )}
                  <span className="version-pill">v{wf.latest_version || wf.version || 1}</span>
                </div>
              </div>

              {/* MATCH REASONS */}
              {wf.match_reasons && wf.match_reasons.length > 0 && (
                <div className="match-reasons-row">
                  {wf.match_reasons.map((r: string, idx: number) => (
                    <span key={idx} className="match-reason-pill">
                      ✓ {r}
                    </span>
                  ))}
                </div>
              )}

              {/* VARIABLES & PERMISSIONS SCOPE */}
              <div className="wf-metadata-chips">
                <div className="meta-chip-group">
                  <span className="chip-label">Variables ({wf.parameters?.length || 0}):</span>
                  {wf.parameters?.map((p: any) => (
                    <span key={p.name} className="pill pill-param">
                      {`{{${p.name}}}`}
                    </span>
                  ))}
                </div>

                <div className="meta-chip-group">
                  <span className="chip-label">Websites ({wf.allowed_origins?.length || 0}):</span>
                  {wf.allowed_origins?.map((o: string) => (
                    <span key={o} className="pill pill-origin">
                      {o}
                    </span>
                  ))}
                </div>

                <div className="meta-chip-group">
                  <span className="chip-label">Version:</span>
                  <code className="hash-code-sm">
                    {`v${wf.version}`}
                  </code>
                </div>
              </div>

              <div className="card-actions-footer">
                <button
                  className="btn btn-secondary btn-sm"
                  onClick={() => handleSelectAndEdit(wf)}
                >
                  ⚙ Edit in Graph View
                </button>
                <button
                  className="btn btn-primary btn-sm"
                  onClick={() => handleSelectAndRun(wf)}
                >
                  ▶ Preview & Run Plan
                </button>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
};
