import React, { useState } from "react";
import { WorkflowGraph } from "../editor/WorkflowGraph";
import { CodeBlock, MarkdownMessage } from "../common/MarkdownMessage";
import type { WorkflowDefinition } from "../../types";

export type AskAIArtifact =
  | { id: string; kind: "workflow"; title: string; workflow: WorkflowDefinition; updatedAt: number }
  | { id: string; kind: "code"; title: string; language: string; content: string; updatedAt: number }
  | { id: string; kind: "web"; title: string; language: string; content: string; updatedAt: number }
  | { id: string; kind: "document"; title: string; content: string; updatedAt: number }
  | { id: string; kind: "task"; title: string; runId: string; workflowId: string; status: string; verification?: string; safeStopReason?: string; steps: Array<{ action?: string; passed?: boolean; error_message?: string }>; updatedAt: number };

type Props = {
  artifacts: AskAIArtifact[];
  selectedId: string;
  width: number;
  expanded: boolean;
  onSelect: (id: string) => void;
  onResize: (width: number) => void;
  onExpand: () => void;
  onClose: () => void;
  onWorkflowChange: (artifactId: string, workflow: WorkflowDefinition) => void;
  onOpenRun: () => void;
};

export const AskAIPreviewPanel: React.FC<Props> = ({ artifacts, selectedId, width, expanded, onSelect, onResize, onExpand, onClose, onWorkflowChange, onOpenRun }) => {
  const [webRefreshKey, setWebRefreshKey] = useState(0);
  const [showSource, setShowSource] = useState(false);
  const active = artifacts.find((artifact) => artifact.id === selectedId) || artifacts[0];
  if (!active) return null;

  const title = active.kind === "workflow" ? active.workflow.title : active.title;
  return (
    <aside className={`ask-ai-preview-panel ${expanded ? "is-expanded" : ""}`} style={expanded ? undefined : { width }} aria-label="Live artifact preview">
      <header className="ask-ai-preview-header">
        <div className="ask-ai-preview-heading"><span>WORKSPACE</span><strong title={title}>{title}</strong></div>
        <div className="ask-ai-preview-tools">
          {active.kind === "web" && <button type="button" title="Refresh preview" aria-label="Refresh preview" onClick={() => setWebRefreshKey((key) => key + 1)}>↻</button>}
          <button type="button" title={expanded ? "Restore panel size" : "Expand preview"} aria-label={expanded ? "Restore panel size" : "Expand preview"} onClick={onExpand}>{expanded ? "⤢" : "⤢"}</button>
          <button type="button" title="Close preview" aria-label="Close preview" onClick={onClose}>×</button>
        </div>
      </header>
      {artifacts.length > 1 && <div className="ask-ai-artifact-tabs" role="tablist" aria-label="Preview artifacts">
        {artifacts.map((artifact) => <button key={artifact.id} type="button" role="tab" aria-selected={artifact.id === active.id} className={artifact.id === active.id ? "active" : ""} onClick={() => onSelect(artifact.id)}>{artifact.kind === "workflow" ? "Workflow" : artifact.kind === "web" ? "Web" : artifact.kind === "task" ? "Task" : artifact.kind === "document" ? "Document" : "Code"}<span>{artifact.title}</span></button>)}
      </div>}
      <div className={`ask-ai-artifact-content artifact-${active.kind}`} key={active.id}>
        {active.kind === "workflow" && <>
          <div className="ask-ai-artifact-subhead"><span>Draft · {active.workflow.steps.length} steps · v{active.workflow.version}</span></div>
          <WorkflowGraph workflow={active.workflow} onWorkflowChange={(workflow) => onWorkflowChange(active.id, { ...workflow, content_hash: "" })} />
          <p className="ask-ai-preview-footnote">Changes update this draft and the selected workflow. They do not run until separately approved.</p>
        </>}
        {active.kind === "code" && <>
          <div className="ask-ai-artifact-subhead"><span>{active.language || "Code"} · generated content</span></div>
          <CodeBlock code={active.content} language={active.language} />
        </>}
        {active.kind === "web" && <>
          <div className="ask-ai-artifact-subhead"><span>Sandboxed static preview · scripts and navigation disabled</span><button type="button" onClick={() => setShowSource((value) => !value)}>{showSource ? "Hide source" : "View source"}</button></div>
          {!showSource ? <iframe key={webRefreshKey} className="ask-ai-web-frame" title={`${active.title} preview`} sandbox="" srcDoc={active.content} /> : <CodeBlock code={active.content} language="html" />}
        </>}
        {active.kind === "document" && <>
          <div className="ask-ai-artifact-subhead"><span>Generated document · Markdown</span><button type="button" onClick={() => void navigator.clipboard.writeText(active.content).catch(() => undefined)}>Copy text</button></div>
          <article className="ask-ai-document-preview"><MarkdownMessage text={active.content} /></article>
        </>}
        {active.kind === "task" && <>
          <div className="ask-ai-task-state"><span className={`task-state-dot state-${active.status.toLowerCase()}`} /><div><small>EXECUTION STATUS</small><strong>{active.status.replaceAll("_", " ")}</strong>{active.verification && <span>{active.verification.replaceAll("_", " ")}</span>}</div><button type="button" onClick={onOpenRun}>Open run details</button></div>
          <div className="ask-ai-task-progress"><span style={{ width: `${active.status === "SUCCESS" ? 100 : Math.min(92, Math.max(8, active.steps.length * 16))}%` }} /></div>
          <h3>Recent steps</h3>
          <ol className="ask-ai-task-log">{active.steps.map((step, index) => <li key={`${index}-${step.action}`}><span>{step.passed ? "✓" : "·"}</span><strong>{step.action || `Step ${index + 1}`}</strong>{step.error_message && <small>{step.error_message}</small>}</li>)}</ol>
          {active.safeStopReason && <div className="ask-ai-task-error" role="status">{active.safeStopReason}</div>}
          {!active.steps.length && <p className="ask-ai-preview-footnote">Waiting for the first execution update…</p>}
        </>}
      </div>
    </aside>
  );
};
