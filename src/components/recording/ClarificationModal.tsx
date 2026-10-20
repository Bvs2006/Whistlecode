import React, { useState } from "react";
import type { ClarificationQuestion } from "../../types";

type Props = {
  clarifications: ClarificationQuestion[];
  onConfirm: (answers: Record<string, string>) => void;
  onCancel: () => void;
  loading?: boolean;
};

export const ClarificationModal: React.FC<Props> = ({
  clarifications,
  onConfirm,
  onCancel,
  loading = false,
}) => {
  const [answers, setAnswers] = useState<Record<string, string>>(() => {
    const init: Record<string, string> = {};
    clarifications.forEach((q) => {
      init[q.id] = q.selected_option || (q.options.length > 0 ? q.options[0] : "");
    });
    return init;
  });

  const [customInputs, setCustomInputs] = useState<Record<string, string>>({});

  const handleOptionSelect = (qId: string, opt: string) => {
    setAnswers((prev) => ({ ...prev, [qId]: opt }));
  };

  const handleCustomChange = (qId: string, text: string) => {
    setCustomInputs((prev) => ({ ...prev, [qId]: text }));
    setAnswers((prev) => ({ ...prev, [qId]: text }));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onConfirm(answers);
  };

  return (
    <div className="modal-backdrop">
      <div className="modal-card clarification-modal-card">
        <div className="modal-header">
          <div>
            <h3>Clarification Dialogue (SUGILITE Principle)</h3>
            <p className="subtitle" style={{ margin: "4px 0 0 0" }}>
              The agent noticed choices during demonstration that need disambiguation to make the workflow reusable.
            </p>
          </div>
          <button className="icon-btn" onClick={onCancel}>✕</button>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="clarifications-list">
            {clarifications.map((q, idx) => (
              <div key={q.id} className="clarification-item-card">
                <div className="clarification-q-header">
                  <span className="q-badge">Question {idx + 1}</span>
                  {q.context && <span className="pill pill-origin">{q.context}</span>}
                </div>
                
                <h4 className="q-title">{q.question}</h4>
                {q.explanation && <p className="q-explanation">{q.explanation}</p>}

                <div className="q-options-group">
                  {q.options.map((opt) => (
                    <label
                      key={opt}
                      className={`q-option-label ${answers[q.id] === opt ? "selected" : ""}`}
                    >
                      <input
                        type="radio"
                        name={`q_${q.id}`}
                        value={opt}
                        checked={answers[q.id] === opt}
                        onChange={() => handleOptionSelect(q.id, opt)}
                      />
                      <span>{opt}</span>
                    </label>
                  ))}

                  <div className="custom-answer-row">
                    <label className="field-hint">Or specify custom reasoning/rule:</label>
                    <input
                      type="text"
                      placeholder="e.g. Only select if distance is under 1.0 mile..."
                      value={customInputs[q.id] || ""}
                      onChange={(e) => handleCustomChange(q.id, e.target.value)}
                    />
                  </div>
                </div>
              </div>
            ))}
          </div>

          <div className="modal-actions-row">
            <button
              type="button"
              className="btn btn-secondary"
              onClick={onCancel}
              disabled={loading}
            >
              Skip Clarification (Use Defaults)
            </button>
            <button
              type="submit"
              className="btn btn-accent"
              disabled={loading}
            >
              {loading ? "Synthesizing..." : "✦ Synthesize Reusable Workflow with Answers"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
