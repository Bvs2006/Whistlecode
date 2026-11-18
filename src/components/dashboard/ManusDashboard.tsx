import React, { useState } from "react";
import type { AppSection, WorkflowDefinition } from "../../types";

type Props = {
  onNavigate: (section: AppSection) => void;
  onSelectWorkflow: (wf: WorkflowDefinition) => void;
  savedCount: number;
};

export const ManusDashboard: React.FC<Props> = ({
  onNavigate,
  onSelectWorkflow,
  savedCount,
}) => {
  const [taskPrompt, setTaskPrompt] = useState("");
  const [showHowItStarts, setShowHowItStarts] = useState(true);

  const handlePromptSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!taskPrompt.trim()) return;
    // Redirect to Teach a Task with this task description
    onNavigate("Teach a Task");
  };

  const suggestions = [
    {
      id: "sug_restaurant",
      title: "Restaurant Finder (SUGILITE)",
      subtitle: "Demonstrate choosing a restaurant, then answer clarification: price, distance or rating?",
      icon: "🍽️",
      color: "#f59e0b",
      action: () => onNavigate("Teach a Task"),
    },
    {
      id: "sug_customer",
      title: "Register New Customer Profile",
      subtitle: "Observe customer form entry, parameterize name & email, verify postcondition",
      icon: "👤",
      color: "#38bdf8",
      action: () => onNavigate("My Workflows"),
    },
    {
      id: "sug_ticket",
      title: "Consequential Support Ticket",
      subtitle: "A sensitive step pauses for your review before it runs.",
      icon: "🛡️",
      color: "#ef4444",
      action: () => onNavigate("Approval & Scope"),
    },
  ];

  return (
    <div className="manus-hub-container">
      {/* HEADER TITLE (ELEGANT SERIF) */}
      <div className="manus-hub-header">
        <h1 className="manus-serif-heading">Automate your work</h1>
      </div>

      {/* CENTRAL COMMAND & PROMPT BOX */}
      <div className="manus-command-card">
        <div className="command-card-top-chips">
          <span className="manus-top-chip active">
            ☁ Ready for review
          </span>
          <span className="manus-top-chip">
            📁 Default Workspace
          </span>
        </div>

        <form onSubmit={handlePromptSubmit}>
          <textarea
            className="manus-prompt-textarea"
            placeholder="Give WhistleCode a task to work on or demonstrate..."
            rows={3}
            value={taskPrompt}
            onChange={(e) => setTaskPrompt(e.target.value)}
          />

          <div className="command-card-bottom-bar">
            <div className="bottom-bar-left">
              <button
                type="button"
                className="manus-icon-btn"
                title="Add Plugin or Tool Resource"
                onClick={() => onNavigate("Plugins & Tools")}
              >
                +
              </button>
              <button
                type="button"
                className="manus-icon-btn"
                title="Configure Parameters"
                onClick={() => onNavigate("My Workflows")}
              >
                ⚙
              </button>
              <button
                type="button"
                className="manus-pill-btn"
                onClick={() => onNavigate("Teach a Task")}
              >
                ⚡ Automations
              </button>
            </div>

            <div className="bottom-bar-right">
              <button
                type="button"
                className="manus-icon-btn"
                title="Voice Input"
              >
                🎙
              </button>
              <button
                type="submit"
                className="manus-send-btn"
                title="Start Task"
              >
                ↑
              </button>
            </div>
          </div>
        </form>
      </div>

      {/* CHOOSE HOW IT STARTS */}
      {showHowItStarts && (
        <div className="manus-section-wrapper">
          <div className="manus-section-header">
            <h3>Choose how it starts</h3>
            <button
              className="manus-close-btn"
              onClick={() => setShowHowItStarts(false)}
            >
              ✕
            </button>
          </div>

          <div className="how-it-starts-grid">
            <div
              className="starter-card"
              onClick={() => onNavigate("Teach a Task")}
            >
              <div className="starter-icon">👁</div>
              <h4>Observe Demonstration</h4>
              <p>SUGILITE desktop & browser observer with accessible UI elements</p>
            </div>

            <div
              className="starter-card"
              onClick={() => onNavigate("Run Monitor")}
            >
              <div className="starter-icon">🕒</div>
              <h4>Schedule & Dry-Run</h4>
              <p>Preview planned actions and test run at a designated time</p>
            </div>

            <div
              className="starter-card"
              onClick={() => onNavigate("My Workflows")}
            >
              <div className="starter-icon">🔀</div>
              <h4>
                Advanced Automation <span className="beta-tag">Beta</span>
              </h4>
              <p>Edit steps and conditions, then review permissions.</p>
            </div>
          </div>
        </div>
      )}

      {/* SUGGESTIONS */}
      <div className="manus-section-wrapper">
        <div className="manus-section-header">
          <h3>Suggestions</h3>
          <button className="manus-refresh-btn" title="Refresh Suggestions">
            ⟲
          </button>
        </div>

        <div className="suggestions-grid">
          {suggestions.map((sug) => (
            <div
              key={sug.id}
              className="suggestion-card"
              onClick={sug.action}
            >
              <div
                className="suggestion-icon-badge"
                style={{ background: `${sug.color}20`, color: sug.color }}
              >
                {sug.icon}
              </div>
              <div className="suggestion-body">
                <h4>{sug.title}</h4>
                <p>{sug.subtitle}</p>
              </div>
              <span className="suggestion-arrow">→</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
