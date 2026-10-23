import React from "react";
import type { AppSection } from "../../types";

type Props = {
  activeSection: AppSection;
  onNavigateStage: (section: AppSection) => void;
};

export const LifecycleStepper: React.FC<Props> = ({ activeSection, onNavigateStage }) => {
  const stages: {
    num: string;
    title: string;
    desc: string;
    section: AppSection;
  }[] = [
    { num: "01", title: "Describe", desc: "User explains task", section: "Overview" },
    { num: "02", title: "Demonstrate", desc: "GUI observer records", section: "Teach a Task" },
    { num: "03", title: "Understand", desc: "AI infers & clarifies", section: "Teach a Task" },
    { num: "04", title: "Review", desc: "User tunes graph & steps", section: "My Workflows" },
    { num: "05", title: "Save", desc: "Keep a workflow version", section: "My Workflows" },
    { num: "06", title: "Request", desc: "NL search & goal query", section: "My Workflows" },
    { num: "07", title: "Plan", desc: "Action & target preview", section: "Permissions" },
    { num: "08", title: "Approve", desc: "Review and approve", section: "Permissions" },
    { num: "09", title: "Run", desc: "Follow each step", section: "Live Run" },
    { num: "10", title: "Improve", desc: "Verifier & version diff", section: "Activity" },
  ];

  const getIsActive = (stage: typeof stages[0]) => {
    return activeSection === stage.section;
  };

  return (
    <div className="lifecycle-stepper-container">
      <div className="lifecycle-stepper-scroll">
        {stages.map((st, idx) => {
          const isActive = getIsActive(st);
          return (
            <div
              key={st.num}
              className={`lifecycle-step-chip ${isActive ? "active" : ""}`}
              onClick={() => onNavigateStage(st.section)}
              title={`${st.num} ${st.title}: ${st.desc}`}
            >
              <span className="step-badge-num">{st.num}</span>
              <span className="step-chip-name">{st.title}</span>
              {idx < stages.length - 1 && <span className="step-arrow-divider">›</span>}
            </div>
          );
        })}
      </div>
    </div>
  );
};
