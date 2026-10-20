import type { AppSection } from "../types";

type SectionPlaceholderProps = {
  section: Exclude<AppSection, "Dashboard">;
};

const sectionCopy: Record<string, string> = {
  "Teach a Task":
    "Start a recording demonstration on an isolated browser page.",
  "My Workflows":
    "Inspect, edit, and version your synthesized workflows.",
  "Approval & Scope":
    "Cryptographic authorization and origin allowlists.",
  "Run Monitor":
    "Execute and monitor deterministic runs with safety gates.",
  "Activity & Audit":
    "Inspect the tamper-evident hash-chained audit log.",
  "Test Site Sandbox":
    "Interactive local test site benchmark.",
  Activity:
    "Activity history will appear here.",
  Settings:
    "Local-first settings and policy configuration.",
};

export function SectionPlaceholder({ section }: SectionPlaceholderProps) {
  return (
    <section className="placeholder-section">
      <p className="eyebrow">WORKSPACE</p>
      <h1>{section}</h1>
      <p className="placeholder-copy">{sectionCopy[section] || "Section overview"}</p>
      <div className="placeholder-card">
        <span className="empty-state-icon">✦</span>
        <div>
          <h2>WhistleCode Workspace Module</h2>
          <p>Select this section from the navigation bar.</p>
        </div>
      </div>
    </section>
  );
}
