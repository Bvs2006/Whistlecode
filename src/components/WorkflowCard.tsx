import type { Workflow } from "../types";

type WorkflowCardProps = {
  workflow: Workflow;
};

export function WorkflowCard({ workflow }: WorkflowCardProps) {
  return (
    <article className="workflow-card">
      <div className={`workflow-symbol ${workflow.accent}`}>✦</div>
      <div className="workflow-card-content">
        <div className="workflow-card-title">
          <h3>{workflow.name}</h3>
          <button className="more-button" type="button" aria-label={`More options for ${workflow.name}`}>
            •••
          </button>
        </div>
        <p>{workflow.description}</p>
        <div className="workflow-meta">
          <span>{workflow.steps} steps</span>
          <span>{workflow.lastUsed}</span>
        </div>
      </div>
    </article>
  );
}
