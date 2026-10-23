import React, { useEffect, useMemo, useState } from "react";
import { api } from "../../api/client";
import { WorkflowGraph } from "../editor/WorkflowGraph";
import type { AppSection, WorkflowDefinition } from "../../types";

type Props = {
  workflow: WorkflowDefinition;
  onWorkflowSaved: (workflow: WorkflowDefinition) => void;
  onNavigateToPreview: () => void;
  onNavigate?: (section: AppSection) => void;
};

export const WorkflowBuilderView: React.FC<Props> = ({ workflow, onWorkflowSaved, onNavigateToPreview }) => {
  const [draft, setDraft] = useState(workflow);
  const [saved, setSaved] = useState<WorkflowDefinition[]>([]);
  const [tab, setTab] = useState<"editor" | "library">("editor");
  const [search, setSearch] = useState("");
  const [dirty, setDirty] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => { void loadSaved(); }, []);

  const loadSaved = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await api.listWorkflows();
      setSaved((response.workflows || []).map((item: any) => item.latest_data).filter(Boolean));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load saved workflows.");
    } finally { setLoading(false); }
  };

  const updateDraft = (patch: Partial<WorkflowDefinition>) => {
    setDraft((current) => ({ ...current, ...patch, content_hash: "" }));
    setDirty(true);
    setNotice(null);
  };

  const filtered = useMemo(() => saved.filter((item) =>
    `${item.title} ${item.intent}`.toLowerCase().includes(search.trim().toLowerCase())), [saved, search]);

  const handleSave = async () => {
    if (!draft.title.trim() || !draft.intent.trim()) {
      setError("Add a workflow title and goal before saving.");
      return;
    }
    setSaving(true); setError(null); setNotice(null);
    try {
      const persisted = saved.find((item) => item.workflow_id === draft.workflow_id);
      const needsNewVersion = Boolean(persisted && (dirty || !draft.content_hash || persisted.content_hash !== draft.content_hash));
      const candidate = { ...draft, title: draft.title.trim(), intent: draft.intent.trim(),
        version: needsNewVersion ? draft.version + 1 : draft.version,
        parent_version: needsNewVersion ? draft.version : draft.parent_version,
        change_summary: needsNewVersion ? "User reviewed workflow edits" : draft.change_summary };
      const response = await api.saveWorkflow(candidate);
      const stored = response.workflow as WorkflowDefinition;
      setDraft(stored); setDirty(false); setNotice(`Saved version ${stored.version}.`);
      setSaved((current) => [stored, ...current.filter((item) => item.workflow_id !== stored.workflow_id)]);
      onWorkflowSaved(stored);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save workflow.");
    } finally { setSaving(false); }
  };

  const openWorkflow = (next: WorkflowDefinition) => {
    setDraft(next); setDirty(false); setError(null); setNotice(null); setTab("editor"); onWorkflowSaved(next);
  };

  const duplicateWorkflow = (source: WorkflowDefinition) => {
    const duplicate = { ...source, workflow_id: `wf_${crypto.randomUUID().replaceAll("-", "").slice(0, 10)}`,
      title: `Copy of ${source.title}`, version: 1, content_hash: "", parent_version: undefined,
      change_summary: "Copied from a saved workflow" };
    setDraft(duplicate); setDirty(true); setTab("editor"); setNotice("Copy created as an unsaved draft.");
  };

  const handleReviewPermissions = () => {
    const reviewedPlan = { ...draft, content_hash: "" };
    onWorkflowSaved(reviewedPlan);
    onNavigateToPreview();
  };

  return (
    <section className="workflow-workspace">
      <header className="workflow-workspace-header">
        <div><span className="home-eyebrow">WORKFLOW STUDIO</span><h1>{tab === "editor" ? (draft.title || "Untitled workflow") : "Saved workflows"}</h1>
          <p>{tab === "editor" ? "Edit the plan and choose which websites it may visit." : "Your saved workflows and previous versions."}</p></div>
        <div className="workflow-studio-actions">
          <span className={`workflow-save-state ${dirty ? "unsaved" : "saved"}`}>{dirty ? "Unsaved changes" : notice || `Version ${draft.version}`}</span>
          {tab === "editor" && <button type="button" className="home-button home-button-primary" onClick={() => void handleSave()} disabled={saving || loading || !draft.steps.some((step) => step.enabled)}>{saving ? "Saving…" : loading ? "Loading library…" : "Save version"}</button>}
        </div>
      </header>
      <nav className="workflow-studio-tabs" aria-label="Workflow studio">
        <button type="button" className={tab === "editor" ? "selected" : ""} onClick={() => setTab("editor")}>Plan editor</button>
        <button type="button" className={tab === "library" ? "selected" : ""} onClick={() => setTab("library")}>Saved workflows <span>{saved.length}</span></button>
      </nav>
      {error && <div className="home-error" role="alert"><span>{error}</span><button type="button" onClick={() => setError(null)}>Dismiss</button></div>}
      {tab === "editor" ? (
        <>
          {draft.change_summary?.startsWith("Prepared from your recording because a complete draft could not be returned") && (
            <div role="status" style={{ margin: "0 0 16px", padding: "12px 16px", border: "1px solid #8a6a2e", borderRadius: 10, background: "#211c11", color: "#e8d29d" }}>
              This draft is based on your captured steps. Review every target, value, and action before approving it.
            </div>
          )}
          <div className="workflow-detail-form">
            <label>Workflow name<input value={draft.title} onChange={(event) => updateDraft({ title: event.target.value })} /></label>
            <label>Goal<input value={draft.intent} onChange={(event) => updateDraft({ intent: event.target.value })} /></label>
            <label className="workflow-origin-field">Allowed websites <textarea rows={2} value={draft.allowed_origins.join("\n")}
              onChange={(event) => updateDraft({ allowed_origins: event.target.value.split(/[\n,]/).map((origin) => origin.trim()).filter(Boolean) })}
              placeholder="https://app.example.com&#10;One origin per line" />
              <small>Use only websites you have reviewed. Approval will be limited to this list.</small>
            </label>
          </div>
          <WorkflowGraph workflow={draft} onWorkflowChange={(updated) => updateDraft({ steps: updated.steps, final_postconditions: updated.final_postconditions })} />
          <footer className="workflow-editor-footer"><span>Saving edits creates a new version and clears approval for the previous version.</span>
            <button type="button" className="home-button home-button-primary" onClick={handleReviewPermissions} disabled={!draft.steps.some((step) => step.enabled)}>Review permissions <span>→</span></button>
          </footer>
        </>
      ) : (
        <div className="workflow-library-panel">
          <div className="workflow-library-search"><span>⌕</span><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search saved workflows" /></div>
          {loading ? <div className="home-empty">Loading saved workflows…</div> : filtered.length === 0 ? (
            <div className="home-empty"><b>{saved.length ? "No workflows match that search." : "No saved workflows yet."}</b><p>Save a reviewed plan from the editor to build your library.</p></div>
          ) : filtered.map((item) => (
            <article className="saved-workflow-row" key={item.workflow_id}>
              <span className="home-workflow-mark">⌘</span><div className="saved-workflow-copy"><b>{item.title}</b><p>{item.intent}</p><small>{item.steps.filter((step) => step.enabled).length} enabled steps · v{item.version} · {item.allowed_origins.length ? item.allowed_origins.join(", ") : "No websites allowed"}</small></div>
              <div className="saved-workflow-actions"><button type="button" onClick={() => openWorkflow(item)}>Open</button><button type="button" onClick={() => duplicateWorkflow(item)}>Duplicate</button></div>
            </article>
          ))}
          <button className="home-button home-button-secondary" type="button" onClick={() => void loadSaved()} disabled={loading}>Refresh library</button>
        </div>
      )}
    </section>
  );
};
