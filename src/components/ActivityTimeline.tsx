import type { Observation } from "../types";

type ActivityTimelineProps = {
  isRecording: boolean;
  observations: Observation[];
  demoMode: boolean;
};

const observations: Observation[] = [
  {
    time: "09:41:12",
    title: "Demo session started",
    detail: "The workflow teaching session is ready.",
    kind: "note",
    isDemo: true,
  },
  {
    time: "09:41:16",
    title: "Opened sample workspace",
    detail: "A sample event representing a workspace view.",
    kind: "screen",
    isDemo: true,
  },
  {
    time: "09:41:21",
    title: "Selected “Project files”",
    detail: "A sample click event for demonstration only.",
    kind: "click",
    isDemo: true,
  },
];

export { observations as demoObservations };

export function ActivityTimeline({
  isRecording,
  observations,
  demoMode,
}: ActivityTimelineProps) {
  return (
    <section className="timeline-section">
      <div className="section-header">
        <div>
          <p className="section-kicker">SESSION PREVIEW</p>
          <h2>Observation timeline</h2>
        </div>
        <span className="sample-label">
          {demoMode ? "DEMO EVENTS" : "LIVE EVENTS"}
        </span>
      </div>
      <div className="timeline">
        {observations.length === 0 ? (
          <div className="empty-state">
            <span className="empty-state-icon">◌</span>
            <h3>No observations yet</h3>
            <p>
              Start a recording to review events here. Real desktop capture is
              not enabled in Phase 1.
            </p>
          </div>
        ) : (
          observations.map((observation) => (
          <div className="timeline-item" key={observation.time}>
            <div className={`timeline-icon ${observation.kind}`} aria-hidden="true">
              {observation.kind === "note" ? "✦" : observation.kind === "screen" ? "▣" : "↗"}
            </div>
            <div className="timeline-line" />
            <div className="timeline-content">
              <div className="timeline-meta">
                <span>{observation.time}</span>
                <span className="event-type">{observation.kind}</span>
              </div>
              <h3>{observation.title}</h3>
              <p>{observation.detail}</p>
            </div>
          </div>
          ))
        )}
        {isRecording && (
          <div className="timeline-live-note">
            <span className="status-dot" />
            Recording state is on; no real application data is being captured.
          </div>
        )}
      </div>
    </section>
  );
}
