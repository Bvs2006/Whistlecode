import React, { useEffect, useState } from "react";
import { api } from "../../api/client";
import type { AppSection, WorkflowDefinition, RunRecord } from "../../types";

type Props = {
  onNavigate: (section: AppSection) => void;
  onSelectWorkflow: (workflow: WorkflowDefinition) => void;
  onAskGoal: (goal: string) => void;
};

const runStateLabel: Record<string, string> = {
  SUCCESS: "Complete", FAILED: "Not completed", STOPPED: "Stopped", UNCERTAIN: "Needs review",
  PENDING_CONFIRMATION: "Waiting for your review", EXECUTING_STEP: "Running", PRECHECK: "Checking plan",
};

export const OverviewView: React.FC<Props> = ({ onNavigate, onSelectWorkflow, onAskGoal }) => {
  const [goal, setGoal] = useState("");
  const [workflows, setWorkflows] = useState<WorkflowDefinition[]>([]);
  const [runs, setRuns] = useState<RunRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadWorkflows = async () => {
    setLoading(true);
    setError(null);
    try {
      const [result, runResult] = await Promise.all([api.listWorkflows(), api.listRuns(6)]);
      setWorkflows((result.workflows || []).map((item: any) => item.latest_data).filter(Boolean));
      setRuns(runResult.runs || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load your saved workflows.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void loadWorkflows(); }, []);

  const submitGoal = (event: React.FormEvent) => {
    event.preventDefault();
    if (!goal.trim()) return;
    onAskGoal(goal.trim());
  };

  return (
    <section className="workspace-home">
      <div className="home-welcome">
        <div>
          <span className="home-eyebrow">WHISTLECODE WORKSPACE</span>
          <h1>Make room for better work.</h1>
          <p>Describe a task, or teach WhistleCode by showing it the steps.</p>
        </div>
        <span className="home-policy"><i /> Policy guard active</span>
      </div>

      <form className="home-goal-card" onSubmit={submitGoal}>
        <label htmlFor="home-goal">What would you like to automate?</label>
        <textarea id="home-goal" value={goal} onChange={(event) => setGoal(event.target.value)}
          placeholder="Describe the task and the website or app it uses…" rows={3} />
        <div className="home-goal-footer">
          <span>WhistleCode prepares a draft for your review. Nothing runs until you approve it.</span>
          <button className="home-button home-button-primary" type="submit" disabled={!goal.trim()}>Create a draft <span>↗</span></button>
        </div>
      </form>

      <div className="home-quick-actions">
        <button className="home-action-card" type="button" onClick={() => onNavigate("Teach a Task")}>
          <span className="home-action-icon">◉</span><span><b>Teach a task</b><small>Record reviewed steps and turn them into a draft.</small></span><i>↗</i>
        </button>
        <button className="home-action-card" type="button" onClick={() => onNavigate("My Workflows")}>
          <span className="home-action-icon amber">⌘</span><span><b>Manage workflows</b><small>Edit plans, set scope, and save versions.</small></span><i>↗</i>
        </button>
        <button className="home-action-card" type="button" onClick={() => onNavigate("Activity")}>
          <span className="home-action-icon">≋</span><span><b>Review activity</b><small>Inspect approval and execution decisions.</small></span><i>↗</i>
        </button>
      </div>

      <div className="home-section-heading">
        <div><span className="home-eyebrow">YOUR LIBRARY</span><h2>Saved workflows</h2></div>
        <button className="home-link-button" type="button" onClick={() => onNavigate("My Workflows")}>View library <span>→</span></button>
      </div>
      {error && <div className="home-error" role="alert"><span>{error}</span><button type="button" onClick={() => void loadWorkflows()}>Retry</button></div>}
      {loading ? <div className="home-empty">Loading saved workflows…</div> : workflows.length === 0 ? (
        <div className="home-empty"><span className="home-empty-mark">✳</span><b>Your library is ready when you are.</b><p>Save a reviewed workflow to see it here.</p>
          <button className="home-button home-button-secondary" type="button" onClick={() => onNavigate("Teach a Task")}>Teach your first task</button>
        </div>
      ) : (
        <div className="home-workflow-list">
          {workflows.slice(0, 5).map((workflow) => (
            <button className="home-workflow-row" type="button" key={workflow.workflow_id} onClick={() => onSelectWorkflow(workflow)}>
              <span className="home-workflow-mark">⌘</span><span className="home-workflow-copy"><b>{workflow.title}</b><small>{workflow.intent}</small></span>
              <span className="home-workflow-meta">{workflow.steps.filter((step) => step.enabled).length} steps · v{workflow.version}</span><i>→</i>
            </button>
          ))}
        </div>
      )}

      <div className="home-section-heading home-runs-heading">
        <div><span className="home-eyebrow">EXECUTION HISTORY</span><h2>Recent runs</h2></div>
        <button className="home-link-button" type="button" onClick={() => onNavigate("Activity")}>View audit trail <span>→</span></button>
      </div>
      {runs.length === 0 ? <div className="home-empty home-runs-empty"><b>No runs recorded yet.</b><p>Approved executions and dry runs will appear here.</p></div> : (
        <div className="home-workflow-list">
          {runs.map((run) => (
            <div className="home-workflow-row home-run-row" key={run.id}>
              <span className={`home-run-state state-${run.state.toLowerCase()}`}>{run.state === "SUCCESS" ? "✓" : run.state === "FAILED" || run.state === "STOPPED" ? "!" : "◷"}</span>
              <span className="home-workflow-copy"><b>{workflows.find((workflow) => workflow.workflow_id === run.workflow_id)?.title || "Workflow run"}</b><small>{run.mode.replace("_", " ")} · {run.step_results.length} steps · {new Date(run.started_at).toLocaleString()}</small></span>
              <span className={`home-run-label state-${run.state.toLowerCase()}`}>{runStateLabel[run.state] || "In progress"}</span>
            </div>
          ))}
        </div>
      )}
    </section>
  );
};
