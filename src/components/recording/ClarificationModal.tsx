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
      init[q.id] = q.selected_option || "";
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
  const allAnswered = clarifications.every((question) => answers[question.id]?.trim());

  return (
    <div className="modal-backdrop">
      <div className="modal-card clarification-modal-card" role="dialog" aria-modal="true" aria-labelledby="clarification-modal-title" aria-describedby="clarification-modal-description">
        <div className="modal-header">
          <div className="clarification-modal-heading">
            <span className="clarification-modal-icon" aria-hidden="true">✳</span>
            <div>
              <span className="clarification-modal-kicker">MAKE THIS WORKFLOW YOURS</span>
              <h3 id="clarification-modal-title">A couple of quick questions</h3>
              <p id="clarification-modal-description" className="clarification-modal-subtitle">
                Your answers help shape a draft. You can review and edit every step before saving or running it.
              </p>
            </div>
          </div>
          <button className="icon-btn" type="button" onClick={onCancel} aria-label="Return to recorded steps" disabled={loading}>×</button>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="clarifications-list">
            {clarifications.map((q, idx) => (
              <article key={q.id} className="clarification-item-card">
                <div className="clarification-q-header">
                  <span className="q-badge">QUESTION {String(idx + 1).padStart(2, "0")}</span>
                  <span className="clarification-count">{idx + 1} of {clarifications.length}</span>
                </div>
                <h4 className="q-title">{q.question}</h4>
                {q.explanation && <p className="q-explanation">{q.explanation}</p>}
                {q.context && <p className="clarification-context">Related step · {q.context}</p>}

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

                  <label className="custom-answer-row">
                    <span>Something else?</span>
                    <input
                      type="text"
                      placeholder="Write a different preference"
                      value={customInputs[q.id] || ""}
                      onChange={(e) => handleCustomChange(q.id, e.target.value)}
                    />
                  </label>
                </div>
              </article>
            ))}
          </div>

          <div className="modal-actions-row">
            <button
              type="button"
              className="btn btn-secondary"
              onClick={onCancel}
              disabled={loading}
            >
              Back to captured steps
            </button>
            <button
              type="submit"
              className="btn clarification-submit-button"
              disabled={loading || !allAnswered}
            >
              {loading ? "Preparing your draft…" : "Build draft for review"}
              {!loading && <span aria-hidden="true">→</span>}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
