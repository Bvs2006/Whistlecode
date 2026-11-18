import type { AppSection } from "../../types";

type Props = {
  onStartRecording: (preset: { url: string; description: string }) => void;
  onNavigate: (section: AppSection) => void;
};

const recordingOptions = [
  { id: "browser", icon: "◎", title: "Browser", detail: "Record a repeatable task on a website you choose.", badge: "Available", preset: { url: "", description: "Record a browser task on the website I choose" } },
  { id: "docs", icon: "▤", title: "Google Docs", detail: "Capture document steps and reuse them in a workflow.", badge: "Available", preset: { url: "https://docs.google.com/document/u/0/", description: "Record the document task I want to repeat in Google Docs" } },
  { id: "slides", icon: "▥", title: "PowerPoint", detail: "Capture presentation steps and turn them into a reusable workflow.", badge: "Available", preset: { url: "https://www.office.com/launch/powerpoint", description: "Record the presentation task I want to repeat in PowerPoint" } },
];

export function ArtifactsView({ onStartRecording, onNavigate }: Props) {
  return (
    <div className="artifacts-page">
      <div className="artifacts-page-heading">
        <div><span className="artifacts-eyebrow">REUSABLE WORK</span><h1>Artifacts</h1><p>Record a task once, review its workflow, and reuse it when you need it.</p></div>
        <button type="button" className="artifacts-secondary-action" onClick={() => onNavigate("My Workflows")}>View workflows <span aria-hidden="true">↗</span></button>
      </div>

      <section className="artifacts-section" aria-labelledby="artifacts-record-heading">
        <div className="artifacts-section-heading"><div><h2 id="artifacts-record-heading">Create from a recording</h2><p>Choose where you want to teach a task.</p></div><span>3 integrations</span></div>
        <div className="artifacts-integration-grid">
          {recordingOptions.map((option) => (
            <article className={`artifacts-integration-card artifacts-${option.id}`} key={option.id}>
              <div className="artifacts-card-top"><span className="artifacts-integration-icon" aria-hidden="true">{option.icon}</span><span className="artifacts-availability"><i />{option.badge}</span></div>
              <h3>{option.title}</h3><p>{option.detail}</p>
              <button type="button" className="artifacts-record-button" onClick={() => onStartRecording(option.preset)}>Record a task <span aria-hidden="true">→</span></button>
            </article>
          ))}
          <article className="artifacts-integration-card artifacts-desktop">
            <div className="artifacts-card-top"><span className="artifacts-integration-icon" aria-hidden="true">▣</span><span className="artifacts-availability soon">Coming soon</span></div>
            <h3>Desktop</h3><p>Desktop app recording will be available in a future release.</p>
            <button type="button" className="artifacts-record-button" disabled>Coming soon</button>
          </article>
        </div>
      </section>

      <section className="artifacts-next-step">
        <div className="artifacts-next-icon" aria-hidden="true">✳</div><div><h2>From recording to reusable workflow</h2><p>After you record, review the captured steps and answer any clarifying questions. The workflow is saved only after you approve its plan and permissions.</p></div>
        <button type="button" onClick={() => onNavigate("Teach a Task")}>How recording works <span aria-hidden="true">→</span></button>
      </section>
    </div>
  );
}
