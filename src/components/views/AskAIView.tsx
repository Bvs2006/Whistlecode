import React, { useState, useRef, useEffect } from "react";
import { defaultAIService } from "../../services/aiService";
import type {
  ConversationMessage,
  ConversationPhase,
} from "../../services/aiService";
import type { AppSection, WorkflowDefinition } from "../../types";

type Props = {
  onNavigate: (section: AppSection) => void;
  onWorkflowGenerated: (wf: WorkflowDefinition) => void;
  initialPrompt?: string;
  savedWorkflows?: WorkflowDefinition[];
};

const DEFAULT_SAVED_WORKFLOWS: WorkflowDefinition[] = [
  {
    workflow_id: "wf_research",
    title: "Research paper organizer",
    intent: "Organize AI research papers by conference topic into sandboxed directories",
    allowed_origins: ["http://localhost:8000"],
    parameters: [
      { name: "target_folder", type: "string", default_value: "sandbox_papers/", required: true },
      { name: "format", type: "string", default_value: "pdf", required: true },
    ],
    steps: [
      {
        id: "s1",
        name: "Scan downloaded files",
        action: "navigate",
        args: { path: "sandbox_papers/" },
        risk: "low",
        requires_confirmation: false,
        idempotent: true,
        preconditions: [],
        postconditions: [],
        enabled: true,
      },
      {
        id: "s2",
        name: "Move files into categorized folders",
        action: "submit",
        args: { mode: "reversible_move" },
        risk: "medium",
        requires_confirmation: true,
        idempotent: true,
        preconditions: [],
        postconditions: [],
        enabled: true,
      },
    ],
    final_postconditions: [],
    version: 1,
    content_hash: "sha256:1a2b3c4d5e",
  },
  {
    workflow_id: "wf_price_checker",
    title: "Product Price & Discount Checker",
    intent: "Navigate e-commerce listings, extract item prices, and flag discounts > 20%",
    allowed_origins: ["http://localhost:8000"],
    parameters: [],
    steps: [],
    final_postconditions: [],
    version: 1,
    content_hash: "sha256:9f8e7d6c5b",
  },
];

export const AskAIView: React.FC<Props> = ({
  onNavigate,
  onWorkflowGenerated,
  initialPrompt = "",
  savedWorkflows = DEFAULT_SAVED_WORKFLOWS,
}) => {
  const [inputText, setInputText] = useState(initialPrompt);
  const [phase, setPhase] = useState<ConversationPhase>("idle");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Conversation history state (strictly separated from execution state)
  const [messages, setMessages] = useState<ConversationMessage[]>([
    {
      id: "msg_init",
      sender: "ai",
      timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
      type: "answer_only",
      text:
        "Hello! I am your AI Desktop Workflow Agent. Explain a task you want to automate in natural language. I can plan step-by-step procedures, match existing workflows, or ask clarifying questions when choices are ambiguous.",
    },
  ]);

  const abortControllerRef = useRef<AbortController | null>(null);
  const messagesEndRef = useRef<HTMLDivElement | null>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, phase]);

  const quickPrompts = [
    "Organize my downloaded AI research papers by topic",
    "Find and book the highest rated restaurant for dinner",
    "Register a new customer profile into the CRM portal",
    "What can you do and how does policy safe mode work?",
  ];

  const handleSend = async (textToSend?: string) => {
    const query = (textToSend !== undefined ? textToSend : inputText).trim();
    if (!query) {
      setErrorMessage("Please enter a goal or question.");
      return;
    }

    setErrorMessage(null);
    setInputText("");

    // Add user message
    const userMsg: ConversationMessage = {
      id: `msg_user_${Date.now().toString(36)}`,
      sender: "user",
      timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
      type: "answer_only",
      text: query,
    };

    setMessages((prev) => [...prev, userMsg]);
    setPhase("understanding_request");

    // Setup abort controller for cancelability
    const controller = new AbortController();
    abortControllerRef.current = controller;

    try {
      const aiResponse = await defaultAIService.processGoal(query, {
        savedWorkflows,
        history: [...messages, userMsg],
        signal: controller.signal,
      });

      setMessages((prev) => [...prev, aiResponse]);

      if (aiResponse.type === "clarification_request") {
        setPhase("asking_question");
      } else if (aiResponse.type === "action_proposal") {
        setPhase("ready_for_approval");
      } else {
        setPhase("idle");
      }
    } catch (err: any) {
      if (err.name === "AbortError") {
        setMessages((prev) => [
          ...prev,
          {
            id: `msg_abort_${Date.now().toString(36)}`,
            sender: "system",
            timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
            type: "system_notice",
            text: "Request cancelled by user.",
          },
        ]);
      } else {
        setErrorMessage(err.message || "Failed to process goal.");
      }
      setPhase("idle");
    } finally {
      abortControllerRef.current = null;
    }
  };

  const handleCancelRequest = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
  };

  const handleSelectClarification = async (questionId: string, option: string) => {
    setPhase("preparing_plan");

    // Post user's choice to conversation
    const choiceMsg: ConversationMessage = {
      id: `msg_user_choice_${Date.now().toString(36)}`,
      sender: "user",
      timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
      type: "answer_only",
      text: `Selected preference: ${option}`,
    };

    setMessages((prev) => [...prev, choiceMsg]);

    const controller = new AbortController();
    abortControllerRef.current = controller;

    try {
      const response = await defaultAIService.resolveClarification(questionId, option, {
        savedWorkflows,
        history: [...messages, choiceMsg],
        signal: controller.signal,
      });

      setMessages((prev) => [...prev, response]);
      setPhase("ready_for_approval");
    } catch (err: any) {
      if (err.name !== "AbortError") {
        setErrorMessage(err.message || "Error resolving clarification.");
      }
      setPhase("idle");
    } finally {
      abortControllerRef.current = null;
    }
  };

  const handleUseSavedWorkflow = (wf: WorkflowDefinition) => {
    onWorkflowGenerated(wf);
    onNavigate("My Workflows");
  };

  const handleReviewProposedPlan = (wf: WorkflowDefinition) => {
    onWorkflowGenerated(wf);
    onNavigate("Permissions");
  };

  return (
    <div className="ask-ai-view-container">
      {/* HEADER BAR */}
      <div className="ask-ai-header">
        <div className="ask-ai-header-titles">
          <h2>Ask AI — Natural Language Goal Planner</h2>
          <p>
            Explain what you want to automate. The AI disambiguates intent, checks saved workflows, and proposes verified plans.
          </p>
        </div>

        {/* CURRENT PHASE BADGE */}
        <div className={`ask-ai-phase-badge phase-${phase}`}>
          <span className="phase-dot" />
          <span className="phase-label">
            {phase === "idle" && "Ready for goals"}
            {phase === "understanding_request" && "Understanding request..."}
            {phase === "asking_question" && "Needs clarification"}
            {phase === "preparing_plan" && "Preparing plan..."}
            {phase === "ready_for_approval" && "Action plan proposed"}
          </span>
        </div>
      </div>

      {/* CONVERSATION STREAM */}
      <div className="ask-ai-chat-stream">
        {messages.map((msg) => (
          <div
            key={msg.id}
            className={`chat-bubble-row ${msg.sender === "user" ? "user-row" : "ai-row"}`}
          >
            {msg.sender === "ai" && <div className="chat-avatar-icon">🤖</div>}

            <div className={`chat-bubble-card ${msg.sender === "user" ? "user-bubble" : "ai-bubble"}`}>
              {/* Informational vs Action Proposal Banner */}
              {msg.type === "answer_only" && msg.sender === "ai" && (
                <div className="response-type-pill pill-info">
                  <span>ℹ️ Informational Response</span>
                  <small>No computer actions proposed or performed</small>
                </div>
              )}

              {msg.type === "action_proposal" && (
                <div className="response-type-pill pill-proposal">
                  <span>⚡ Action Plan Proposed</span>
                  <small>Requires explicit human approval before running</small>
                </div>
              )}

              {msg.type === "clarification_request" && (
                <div className="response-type-pill pill-clarification">
                  <span>❓ Clarification Needed</span>
                  <small>Please select your preference below</small>
                </div>
              )}

              {/* Message Body */}
              <div className="chat-bubble-text">{msg.text}</div>

              {/* CLARIFYING QUESTION WIDGET */}
              {msg.clarification && (
                <div className="clarification-bubble-card">
                  <h4>{msg.clarification.question}</h4>
                  {msg.clarification.explanation && (
                    <p className="clarification-expl">{msg.clarification.explanation}</p>
                  )}
                  <div className="clarification-options-list">
                    {msg.clarification.options.map((opt, idx) => (
                      <button
                        key={idx}
                        type="button"
                        className="btn-clarification-option"
                        onClick={() => handleSelectClarification(msg.clarification!.id, opt)}
                        disabled={phase !== "asking_question"}
                      >
                        <span className="opt-num">{idx + 1}.</span>
                        <span className="opt-text">{opt}</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* MATCHED EXISTING WORKFLOW CARD */}
              {msg.matchedWorkflow && (
                <div className="matched-workflow-card">
                  <div className="matched-wf-header">
                    <span className="wf-tag">Saved Skill Found</span>
                    <strong>{msg.matchedWorkflow.title}</strong>
                    <span className="wf-ver">v{msg.matchedWorkflow.version}</span>
                  </div>
                  <p className="matched-wf-intent">{msg.matchedWorkflow.intent}</p>
                  <div className="matched-wf-actions">
                    <button
                      type="button"
                      className="btn-use-workflow"
                      onClick={() => handleUseSavedWorkflow(msg.matchedWorkflow!)}
                    >
                      Use Saved Workflow →
                    </button>
                  </div>
                </div>
              )}

              {/* PROPOSED ACTION PLAN SUMMARY CARD */}
              {msg.proposedPlan && !msg.matchedWorkflow && (
                <div className="proposed-plan-card">
                  <div className="proposed-plan-header">
                    <span className="proposal-warning-tag">[Proposed Action Plan — Not Yet Executed]</span>
                    <span className={`risk-pill risk-${msg.proposedPlan.risk}`}>
                      {msg.proposedPlan.risk.toUpperCase()} RISK
                    </span>
                  </div>
                  <h4 className="plan-title">{msg.proposedPlan.workflow.title}</h4>
                  <p className="plan-summary">{msg.proposedPlan.summary}</p>

                  <div className="plan-steps-preview">
                    {msg.proposedPlan.workflow.steps.map((st, i) => (
                      <div key={st.id} className="plan-step-item">
                        <span className="st-num">{i + 1}</span>
                        <span className="st-name">{st.name}</span>
                        <span className="st-risk">[{st.risk}]</span>
                      </div>
                    ))}
                  </div>

                  <div className="proposed-plan-buttons">
                    <button
                      type="button"
                      className="btn-plan-approve"
                      onClick={() => handleReviewProposedPlan(msg.proposedPlan!.workflow)}
                    >
                      Review & Approve Plan →
                    </button>
                    <button
                      type="button"
                      className="btn-plan-edit"
                      onClick={() => {
                        onWorkflowGenerated(msg.proposedPlan!.workflow);
                        onNavigate("My Workflows");
                      }}
                    >
                      Inspect in Builder
                    </button>
                  </div>
                </div>
              )}

              <span className="chat-timestamp">{msg.timestamp}</span>
            </div>
          </div>
        ))}

        {/* IN-FLIGHT PROGRESS WITH CANCEL BUTTON */}
        {(phase === "understanding_request" || phase === "preparing_plan") && (
          <div className="chat-bubble-row ai-row">
            <div className="chat-avatar-icon pulse">🤖</div>
            <div className="chat-bubble-card in-flight-card">
              <div className="in-flight-spinner">
                <span className="spinner-dot" />
                <span className="spinner-dot" />
                <span className="spinner-dot" />
              </div>
              <span className="in-flight-text">
                {phase === "understanding_request"
                  ? "Analyzing task requirements and matching saved skills..."
                  : "Synthesizing step-by-step verified action plan..."}
              </span>
              <button
                type="button"
                className="btn-cancel-request"
                onClick={handleCancelRequest}
              >
                ✕ Cancel
              </button>
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* QUICK SUGGESTION CHIPS */}
      <div className="quick-suggestions-bar">
        <span className="sugg-label">Suggestions:</span>
        <div className="sugg-scroll">
          {quickPrompts.map((p, idx) => (
            <button
              key={idx}
              type="button"
              className="btn-suggestion-chip"
              onClick={() => handleSend(p)}
              disabled={phase !== "idle"}
            >
              {p}
            </button>
          ))}
        </div>
      </div>

      {/* ERROR MESSAGE DISPLAY */}
      {errorMessage && (
        <div className="chat-error-banner" role="alert">
          <span>⚠️ {errorMessage}</span>
          <button type="button" onClick={() => setErrorMessage(null)}>✕</button>
        </div>
      )}

      {/* INPUT FORM */}
      <div className="ask-ai-input-bar">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            handleSend();
          }}
          className="ask-ai-form"
        >
          <textarea
            className="ask-ai-textarea"
            rows={2}
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                handleSend();
              }
            }}
            placeholder="Type your automation goal or question... (Enter to send)"
            disabled={phase !== "idle" && phase !== "asking_question"}
          />
          <div className="ask-ai-form-actions">
            <button
              type="submit"
              className="btn-send-goal"
              disabled={!inputText.trim() || (phase !== "idle" && phase !== "asking_question")}
            >
              Ask AI ↗
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
