import React from "react";
import type { AppSection } from "../types";

type HeaderProps = {
  activeSection: AppSection;
  onNavigateSection: (section: AppSection) => void;
};

export function Header({ activeSection, onNavigateSection }: HeaderProps) {
  const stages: {
    num: string;
    title: string;
    section: AppSection;
  }[] = [
    { num: "01", title: "Describe", section: "Overview" },
    { num: "02", title: "Record", section: "Teach a Task" },
    { num: "03", title: "Understand", section: "Teach a Task" },
    { num: "04", title: "Review", section: "My Workflows" },
    { num: "05", title: "Save", section: "My Workflows" },
    { num: "06", title: "Request", section: "Ask AI" },
    { num: "07", title: "Plan", section: "Permissions" },
    { num: "08", title: "Approve", section: "Permissions" },
    { num: "09", title: "Execute", section: "Live Run" },
    { num: "10", title: "Improve", section: "Activity" },
  ];

  return (
    <header className="global-top-ribbon">
      <div className="ribbon-left">
        <span>WhistleCode</span>
        <span>/</span>
        <strong>{activeSection}</strong>
      </div>

      {/* 10-STAGE INTERACTIVE LIFECYCLE STEPPER */}
      <nav className="ribbon-stages-scroll">
        {stages.map((st, idx) => {
          const isActive = activeSection === st.section;
          return (
            <React.Fragment key={st.num}>
              <button
                type="button"
                className={`stage-pill-mini ${isActive ? "active" : ""}`}
                onClick={() => onNavigateSection(st.section)}
                title={`${st.num} ${st.title} (${st.section})`}
              >
                <span>{st.num}</span>
                <span>{st.title}</span>
              </button>
              {idx < stages.length - 1 && <span className="stage-divider">›</span>}
            </React.Fragment>
          );
        })}
      </nav>

      <div className="ribbon-right">
        <div className="safe-guard-badge">
          <span className="dot-pulse" />
          <span>Policy Guard Active</span>
        </div>
      </div>
    </header>
  );
}
