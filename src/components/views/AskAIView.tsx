import React, { useState, useRef, useEffect } from "react";
import { defaultAIService } from "../../services/aiService";
import { api } from "../../api/client";
import { MarkdownMessage } from "../common/MarkdownMessage";
import { AskAIPreviewPanel } from "./AskAIPreviewPanel";
import type { AskAIArtifact } from "./AskAIPreviewPanel";
import type {
  ConversationMessage,
  ConversationPhase,
} from "../../services/aiService";
import type { AppSection, WorkflowDefinition, ApprovalRecord } from "../../types";

type Props = {
  onNavigate: (section: AppSection) => void;
  onWorkflowGenerated: (wf: WorkflowDefinition) => void;
  initialPrompt?: string;
  savedWorkflows?: WorkflowDefinition[];
  activeWorkflow?: WorkflowDefinition;
  activeApproval?: ApprovalRecord | null;
  onWorkflowUpdated?: (workflow: WorkflowDefinition) => void;
};

type AskAIThread = { id: string; title: string; messages: ConversationMessage[]; artifacts?: AskAIArtifact[]; activeArtifactId?: string; updatedAt: number };
type AskAIFile = { id: string; name: string; content: string };
const THREADS_STORAGE_KEY = "whistlecode.ask-ai.threads.v1";

function loadThreads(): AskAIThread[] {
  try {
    const parsed = JSON.parse(localStorage.getItem(THREADS_STORAGE_KEY) || "[]");
    return Array.isArray(parsed) ? parsed.filter((thread) => thread && typeof thread.id === "string" && Array.isArray(thread.messages)).slice(0, 30) : [];
  } catch { return []; }
}

function isConversationQuestion(text: string) {
  const asksToAct = /\b(create|build|make|automate|record|revise|edit|change|update|run this|prepare a workflow)\b/i.test(text);
  const asksToExplain = /\b(what|why|how|explain|describe|teach me|write code|write a|debug|compare|summari[sz]e|help me understand)\b/i.test(text) || text.includes("?");
  return asksToExplain && !asksToAct;
}

export const AskAIView: React.FC<Props> = ({
  onNavigate,
  onWorkflowGenerated,
  initialPrompt = "",
  savedWorkflows = [],
  activeWorkflow,
  activeApproval,
  onWorkflowUpdated,
}) => {
  const [inputText, setInputText] = useState(initialPrompt);
  const [phase, setPhase] = useState<ConversationPhase>("idle");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [customClarificationAnswers, setCustomClarificationAnswers] = useState<Record<string, string>>({});

  const [threads, setThreads] = useState<AskAIThread[]>(loadThreads);
  const [activeThreadId, setActiveThreadId] = useState(() => loadThreads()[0]?.id || `chat_${crypto.randomUUID()}`);
  const [attachments, setAttachments] = useState<AskAIFile[]>([]);
  const [artifacts, setArtifacts] = useState<AskAIArtifact[]>(() => loadThreads()[0]?.artifacts || []);
  const [activeArtifactId, setActiveArtifactId] = useState(() => loadThreads()[0]?.activeArtifactId || loadThreads()[0]?.artifacts?.[0]?.id || "");
  const [previewOpen, setPreviewOpen] = useState(() => Boolean(loadThreads()[0]?.artifacts?.length));
  const [previewExpanded, setPreviewExpanded] = useState(false);
  const [previewWidth, setPreviewWidth] = useState(470);
  const [theme, setTheme] = useState<"dark" | "light">(() => localStorage.getItem("whistlecode.ask-ai.theme") === "light" ? "light" : "dark");
  const [draggingPreview, setDraggingPreview] = useState(false);
  const [testReports, setTestReports] = useState<Record<string, { pending?: boolean; text: string }>>({});
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const workspaceRef = useRef<HTMLDivElement | null>(null);

  // Conversation history state (strictly separated from execution state)
  const [messages, setMessages] = useState<ConversationMessage[]>(() => {
    const stored = loadThreads();
    return stored[0]?.messages || [];
  });

  const abortControllerRef = useRef<AbortController | null>(null);
  const messagesEndRef = useRef<HTMLDivElement | null>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, phase]);

  useEffect(() => {
    if (!messages.length) return;
    const timer = window.setTimeout(() => {
      const firstUserText = messages.find((message) => message.sender === "user")?.text || "New conversation";
      const title = firstUserText.split("\n")[0].slice(0, 64) || "New conversation";
      setThreads((current) => [{ id: activeThreadId, title, messages, artifacts, activeArtifactId, updatedAt: Date.now() }, ...current.filter((thread) => thread.id !== activeThreadId)]
        .sort((a, b) => b.updatedAt - a.updatedAt).slice(0, 30));
    }, 250);
    return () => window.clearTimeout(timer);
  }, [messages, artifacts, activeArtifactId, activeThreadId, phase]);

  useEffect(() => {
    try { localStorage.setItem(THREADS_STORAGE_KEY, JSON.stringify(threads)); } catch { /* Storage may be disabled or full. */ }
  }, [threads]);

  useEffect(() => {
    try { localStorage.setItem("whistlecode.ask-ai.theme", theme); } catch { /* Theme preference is optional. */ }
  }, [theme]);

  useEffect(() => {
    if (!draggingPreview) return;
    const move = (event: PointerEvent) => {
      const bounds = workspaceRef.current?.getBoundingClientRect();
      if (!bounds) return;
      setPreviewWidth(Math.max(340, Math.min(bounds.width * 0.68, bounds.right - event.clientX)));
    };
    const stop = () => setDraggingPreview(false);
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", stop, { once: true });
    window.addEventListener("pointercancel", stop, { once: true });
    return () => { window.removeEventListener("pointermove", move); window.removeEventListener("pointerup", stop); window.removeEventListener("pointercancel", stop); };
  }, [draggingPreview]);

  useEffect(() => {
    if (activeWorkflow?.steps.length && messages.length === 0 && artifacts.length === 0) showWorkflowArtifact(activeWorkflow);
  // Seed only an empty chat; subsequent edits are synchronized by the preview callback.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeWorkflow?.workflow_id, activeWorkflow?.version]);

  useEffect(() => {
    const running = artifacts.filter((artifact): artifact is Extract<AskAIArtifact, { kind: "task" }> =>
      artifact.kind === "task" && !["SUCCESS", "FAILED", "UNCERTAIN", "STOPPED"].includes(artifact.status));
    if (!running.length) return;
    const timer = window.setInterval(() => {
      for (const task of running) {
        void api.getExecutionStatus(task.runId).then((response) => {
          const run = response.run;
          if (!run) return;
          setArtifacts((current) => current.map((artifact) => artifact.id === task.id && artifact.kind === "task" ? {
            ...artifact,
            status: run.state,
            verification: run.verification_state,
            safeStopReason: run.safe_stop_reason,
            steps: (run.step_results || []).map((step: any) => ({ action: step.action, passed: step.passed, error_message: step.error_message })),
            updatedAt: Date.now(),
          } : artifact));
        }).catch(() => undefined);
      }
    }, 1200);
    return () => window.clearInterval(timer);
  }, [artifacts]);

  const upsertArtifact = (artifact: AskAIArtifact) => {
    setArtifacts((current) => [...current.filter((item) => item.id !== artifact.id), artifact]);
    setActiveArtifactId(artifact.id);
    setPreviewOpen(true);
  };

  const showWorkflowArtifact = (workflow: WorkflowDefinition) => {
    const artifactId = `workflow:${workflow.workflow_id}`;
    setArtifacts((current) => {
      const existing = current.find((artifact) => artifact.id === artifactId);
      const next: AskAIArtifact = { id: artifactId, kind: "workflow", title: workflow.title, workflow, updatedAt: Date.now() };
      return [...current.filter((artifact) => artifact.id !== artifactId), existing && existing.kind === "workflow" ? { ...existing, ...next } : next];
    });
    setActiveArtifactId(artifactId);
    setPreviewOpen(true);
  };

  const handleWorkflowPreviewChange = (artifactId: string, workflow: WorkflowDefinition) => {
    setArtifacts((current) => current.map((artifact) => artifact.id === artifactId && artifact.kind === "workflow"
      ? { ...artifact, title: workflow.title, workflow, updatedAt: Date.now() }
      : artifact));
    onWorkflowUpdated?.(workflow);
  };

  const registerRunArtifact = (run: any, workflow: WorkflowDefinition) => {
    if (!run?.id) return;
    upsertArtifact({
      id: `run:${run.id}`,
      kind: "task",
      title: `Run · ${workflow.title}`,
      runId: run.id,
      workflowId: workflow.workflow_id,
      status: run.state || "PRECHECK",
      verification: run.verification_state,
      safeStopReason: run.safe_stop_reason,
      steps: (run.step_results || []).map((step: any) => ({ action: step.action, passed: step.passed, error_message: step.error_message })),
      updatedAt: Date.now(),
    });
  };

  const handleNewConversation = () => {
    setActiveThreadId(`chat_${crypto.randomUUID()}`);
    setMessages([]);
    setArtifacts([]);
    setActiveArtifactId("");
    setPreviewOpen(false);
    setAttachments([]);
    setInputText("");
    setPhase("idle");
    setErrorMessage(null);
  };

  const handleSwitchConversation = (threadId: string) => {
    const thread = threads.find((item) => item.id === threadId);
    if (!thread) return;
    abortControllerRef.current?.abort();
    setActiveThreadId(thread.id);
    setMessages(thread.messages);
    setArtifacts(thread.artifacts || []);
    setActiveArtifactId(thread.activeArtifactId || thread.artifacts?.[0]?.id || "");
    setPreviewOpen(Boolean(thread.artifacts?.length));
    setAttachments([]);
    setPhase("idle");
    setErrorMessage(null);
  };

  const handleAttachFiles = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files || []);
    event.target.value = "";
    const supported = /\.(txt|md|markdown|csv|json|log|js|jsx|ts|tsx|py|html|css|yaml|yml)$/i;
    const next: AskAIFile[] = [];
    for (const file of files.slice(0, 5)) {
      if (!supported.test(file.name)) {
        setErrorMessage(`${file.name} is not a supported text file. Attach a text, code, or data file.`);
        continue;
      }
      if (file.size > 1024 * 1024) {
        setErrorMessage(`${file.name} is over the 1 MB attachment limit.`);
        continue;
      }
      next.push({ id: `file_${crypto.randomUUID()}`, name: file.name, content: await file.text() });
    }
    setAttachments((current) => [...current, ...next].slice(0, 5));
  };

  const handleRunTest = async (messageId: string, workflow: WorkflowDefinition) => {
    setTestReports((current) => ({ ...current, [messageId]: { pending: true, text: "Checking the plan without opening a website or performing actions…" } }));
    try {
      const result = await api.executeWorkflow(workflow, {}, undefined, "dry_run");
      const run = result.run;
      if (run) registerRunArtifact(run, workflow);
      setTestReports((current) => ({
        ...current,
        [messageId]: { text: run ? `Dry run ${String(run.state || "finished").toLowerCase()}. ${run.safe_stop_reason || "No browser actions were performed."}` : "Dry run finished without a run report." },
      }));
    } catch (error) {
      setTestReports((current) => ({ ...current, [messageId]: { text: error instanceof Error ? error.message : "The plan could not be checked." } }));
    }
  };

  const activePreviewArtifact = artifacts.find((artifact) => artifact.id === activeArtifactId);
  const approvalMatchesSelectedWorkflow = Boolean(activeWorkflow && (!activePreviewArtifact || (activePreviewArtifact.kind === "workflow" && activePreviewArtifact.workflow.workflow_id === activeWorkflow.workflow_id)) && activeApproval
    && activeApproval.workflow_id === activeWorkflow.workflow_id
    && activeApproval.version === activeWorkflow.version
    && activeApproval.version_hash === activeWorkflow.content_hash
    && !activeApproval.revoked_at
    && Date.parse(activeApproval.expires_at) > Date.now());

  const handleRunApprovedWorkflow = async () => {
    if (!activeWorkflow || !activeApproval || !approvalMatchesSelectedWorkflow) {
      setErrorMessage("This workflow has no current approval. Review and approve the exact version before running it.");
      return;
    }
    if (!window.confirm(`Run “${activeWorkflow.title}” on ${activeApproval.scope.allowed_origins.join(", ") || "its approved website"}? The workflow may pause for live confirmation on sensitive actions.`)) return;
    setTestReports((current) => ({ ...current, approved: { pending: true, text: "Starting the approved workflow…" } }));
    try {
      const response = await api.executeWorkflow(activeWorkflow, {}, activeApproval.id, "run");
      const run = response.run;
      setTestReports((current) => ({ ...current, approved: { text: run ? `Run ${String(run.state || "started").toLowerCase()} · ${run.id}` : "The run request was accepted." } }));
      if (run) registerRunArtifact(run, activeWorkflow);
    } catch (error) {
      setTestReports((current) => ({ ...current, approved: { text: error instanceof Error ? error.message : "The approved workflow could not be started." } }));
    }
  };

  const quickPrompts = [
    "Search a website for a product and compare the listed options",
    "Prepare a weekly report from a spreadsheet",
    "Find a record in a portal and prepare its form",
    "How do approvals work?",
  ];

  const handleSend = async (textToSend?: string) => {
    const query = (textToSend !== undefined ? textToSend : inputText).trim();
    if (!query) {
      setErrorMessage("Please enter a goal or question.");
      return;
    }

    setErrorMessage(null);
    setInputText("");
    const attachedFiles = attachments;
    const chatWorkflowArtifact = artifacts.find((artifact) => artifact.id === activeArtifactId && artifact.kind === "workflow");
    const chatWorkflow = chatWorkflowArtifact?.kind === "workflow" ? chatWorkflowArtifact.workflow : activeWorkflow;
    const userMessageText = attachedFiles.length
      ? `${query}\n\nAttached files: ${attachedFiles.map((file) => file.name).join(", ")}`
      : query;

    // Add user message
    const userMsg: ConversationMessage = {
      id: `msg_user_${Date.now().toString(36)}`,
      sender: "user",
      timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
      type: "answer_only",
      text: userMessageText,
    };

    setMessages((prev) => [...prev, userMsg]);
    setAttachments([]);

    // Setup abort controller for cancelability
    const controller = new AbortController();
    abortControllerRef.current = controller;

    if (isConversationQuestion(query)) {
      const responseId = `msg_stream_${Date.now().toString(36)}`;
      const responseMsg: ConversationMessage = {
        id: responseId,
        sender: "ai",
        timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
        type: "answer_only",
        text: "",
      };
      setMessages((prev) => [...prev, responseMsg]);
      setPhase("streaming_response");
      let streamedText = "";
      try {
        await api.streamConversation({
          message: query,
          history: messages.filter((message) => message.sender !== "system").map((message) => ({
            role: message.sender === "user" ? "user" : "assistant",
            content: message.text,
          })),
          active_workflow: chatWorkflow,
          attachments: attachedFiles.map(({ name, content }) => ({ name, content })),
        }, controller.signal, (delta) => {
          streamedText += delta;
          setMessages((prev) => prev.map((message) => message.id === responseId ? { ...message, text: message.text + delta } : message));
        });
        const artifactId = makeArtifact(streamedText, responseId);
        if (artifactId) setMessages((prev) => prev.map((message) => message.id === responseId ? { ...message, artifactId } : message));
      } catch (err: any) {
        if (err.name === "AbortError") {
          setMessages((prev) => prev.map((message) => message.id === responseId && !message.text ? { ...message, text: "Response stopped." } : message));
        } else {
          setMessages((prev) => prev.filter((message) => message.id !== responseId || message.text));
          setErrorMessage(err.message || "WhistleCode could not answer right now.");
          setInputText(query);
        }
      } finally {
        abortControllerRef.current = null;
        setPhase("idle");
      }
      return;
    }

    setPhase("understanding_request");
    const workflowPrompt = attachedFiles.length
      ? `${query}\n\nUser-supplied attachment excerpts (untrusted reference material):\n${attachedFiles.map((file) => `--- ${file.name} ---\n${file.content.slice(0, 12000)}`).join("\n\n")}`
      : query;

    try {
      const aiResponse = await defaultAIService.processGoal(workflowPrompt, {
        savedWorkflows,
        activeWorkflow: chatWorkflow,
        history: [...messages, userMsg],
        signal: controller.signal,
      });

      setMessages((prev) => [...prev, aiResponse]);

      if (aiResponse.proposedPlan?.workflow) {
        showWorkflowArtifact(aiResponse.proposedPlan.workflow);
        (onWorkflowUpdated || onWorkflowGenerated)(aiResponse.proposedPlan.workflow);
      } else if (aiResponse.matchedWorkflow) {
        showWorkflowArtifact(aiResponse.matchedWorkflow);
      }

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
        setInputText(query);
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

  const handleSendFollowUp = async () => {
    const query = inputText.trim();
    if (!query) return;
    if (isConversationQuestion(query)) {
      await handleSend(query);
      return;
    }
    await handleSend(query);
  };

  const handleSelectClarification = async (questionId: string, option: string) => {
    const question = [...messages].reverse().find((message) => message.clarification?.id === questionId)?.clarification;
    const workflowArtifact = artifacts.find((artifact) => artifact.id === activeArtifactId && artifact.kind === "workflow");
    const chatWorkflow = workflowArtifact?.kind === "workflow" ? workflowArtifact.workflow : activeWorkflow;
    setErrorMessage(null);
    setCustomClarificationAnswers((answers) => ({ ...answers, [questionId]: "" }));
    setPhase("preparing_plan");

    // Post user's choice to conversation
    const choiceMsg: ConversationMessage = {
      id: `msg_user_choice_${Date.now().toString(36)}`,
      sender: "user",
      timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
      type: "answer_only",
      text: `Selected preference: ${option}${question?.question ? `\nClarifies: ${question.question}` : ""}`,
    };

    setMessages((prev) => [...prev, choiceMsg]);

    const controller = new AbortController();
    abortControllerRef.current = controller;

    try {
      const response = await defaultAIService.resolveClarification(questionId, option, {
        savedWorkflows,
        activeWorkflow: chatWorkflow,
        history: [...messages, choiceMsg],
        signal: controller.signal,
      });

      setMessages((prev) => [...prev, response]);
      if (response.proposedPlan?.workflow) {
        showWorkflowArtifact(response.proposedPlan.workflow);
        (onWorkflowUpdated || onWorkflowGenerated)(response.proposedPlan.workflow);
      } else if (response.matchedWorkflow) showWorkflowArtifact(response.matchedWorkflow);
      setPhase(response.type === "clarification_request" ? "asking_question" : response.type === "action_proposal" ? "ready_for_approval" : "idle");
    } catch (err: any) {
      if (err.name !== "AbortError") {
        setErrorMessage(err.message || "Error resolving clarification.");
      }
      setPhase(question ? "asking_question" : "idle");
    } finally {
      abortControllerRef.current = null;
    }
  };

  const handleSubmitCustomClarification = (questionId: string) => {
    const answer = customClarificationAnswers[questionId]?.trim();
    if (answer) void handleSelectClarification(questionId, answer);
  };

  const handleCopyMessage = (text: string) => { void navigator.clipboard?.writeText(text).catch(() => undefined); };
  const handleRetryMessage = (messageId: string) => {
    const index = messages.findIndex((message) => message.id === messageId);
    const target = messages[index]?.sender === "user" ? messages[index] : [...messages.slice(0, index)].reverse().find((message) => message.sender === "user");
    if (target?.text) void handleSend(target.text.replace(/\n\nAttached files:.*$/s, ""));
  };
  const handleEditMessage = (messageId: string) => {
    const index = messages.findIndex((message) => message.id === messageId);
    const message = messages[index];
    if (!message || message.sender !== "user") return;
    setInputText(message.text.replace(/\n\nAttached files:.*$/s, ""));
    setMessages((current) => current.slice(0, index));
  };
  const handleFeedback = (messageId: string, value: "up" | "down") => {
    setMessages((current) => current.map((message) => message.id === messageId ? { ...message, feedback: message.feedback === value ? undefined : value } : message));
  };

  const handleUseSavedWorkflow = (wf: WorkflowDefinition) => {
    (onWorkflowUpdated || onWorkflowGenerated)(wf);
    showWorkflowArtifact(wf);
  };

  const handleReviewProposedPlan = (wf: WorkflowDefinition) => {
    (onWorkflowUpdated || onWorkflowGenerated)(wf);
    showWorkflowArtifact(wf);
  };

  const handleWorkflowUpdated = (workflow: WorkflowDefinition) => {
    (onWorkflowUpdated || onWorkflowGenerated)(workflow);
  };

  const makeArtifact = (text: string, sourceMessageId: string) => {
    const fenced = [...text.matchAll(/```([\w-]*)\s*\n([\s\S]*?)```/g)];
    if (fenced.length) {
      const block = fenced[fenced.length - 1];
      const language = block[1].toLowerCase();
      const content = block[2].trim();
      const artifact: AskAIArtifact = language === "html"
        ? { id: `web:${sourceMessageId}`, kind: "web", title: "Web preview", language, content, updatedAt: Date.now() }
        : { id: `code:${sourceMessageId}`, kind: "code", title: `Code · ${language || "text"}`, language: language || "text", content, updatedAt: Date.now() };
      upsertArtifact(artifact);
      return artifact.id;
    }
    if (/\b(write|draft|create|prepare)\b.{0,30}\b(document|report|proposal|email|letter|article|guide|README)\b/i.test(text)) {
      const artifact: AskAIArtifact = { id: `document:${sourceMessageId}`, kind: "document", title: "Draft document", content: text, updatedAt: Date.now() };
      upsertArtifact(artifact);
      return artifact.id;
    }
    return undefined;
  };

  const latestClarificationId = [...messages].reverse().find((message) => message.clarification)?.clarification?.id;
  const selectedWorkflowArtifact = artifacts.find((artifact) => artifact.id === activeArtifactId && artifact.kind === "workflow");
  const chatWorkflow = selectedWorkflowArtifact?.kind === "workflow" ? selectedWorkflowArtifact.workflow : activeWorkflow;

  return (
    <div className="ask-ai-view-container" data-theme={theme}>
      {/* HEADER BAR */}
      <div className="ask-ai-header">
        <div className="ask-ai-header-titles">
          <h2>Ask AI</h2>
          <p>
            {chatWorkflow?.steps.length
              ? `Ask for a change to “${chatWorkflow.title}”. Each reply creates a new draft version for review.`
              : "Describe what you want to automate. WhistleCode can find a saved workflow or prepare a new draft for review."}
          </p>
        </div>

        {/* CURRENT PHASE BADGE */}
        <div className={`ask-ai-phase-badge phase-${phase}`}>
          <span className="phase-dot" />
          <span className="phase-label">
            {phase === "idle" && "Ready for goals"}
            {phase === "understanding_request" && "Understanding request..."}
            {phase === "streaming_response" && "Writing response..."}
            {phase === "asking_question" && "Needs clarification"}
            {phase === "preparing_plan" && "Preparing plan..."}
            {phase === "ready_for_approval" && "Action plan proposed"}
          </span>
        </div>

        <div className="ask-ai-header-tools" aria-label="Conversation history controls">
          <label className="ask-ai-history-label" htmlFor="ask-ai-history">History</label>
          <select id="ask-ai-history" value={threads.some((thread) => thread.id === activeThreadId) ? activeThreadId : "current"} onChange={(event) => handleSwitchConversation(event.target.value)}>
            {!threads.some((thread) => thread.id === activeThreadId) && <option value="current">Current conversation</option>}
            {threads.map((thread) => <option key={thread.id} value={thread.id}>{thread.title}</option>)}
          </select>
          <button type="button" className="ask-ai-new-chat" onClick={handleNewConversation}>＋ New chat</button>
          <button type="button" className="ask-ai-theme-toggle" onClick={() => setTheme((value) => value === "dark" ? "light" : "dark")} aria-label={`Switch to ${theme === "dark" ? "light" : "dark"} theme`}>{theme === "dark" ? "☼ Light" : "◐ Dark"}</button>
          {artifacts.length > 0 && !previewOpen && <button type="button" className="ask-ai-new-chat" onClick={() => setPreviewOpen(true)}>Open workspace</button>}
          {chatWorkflow && <span className="ask-ai-context-chip" title={`${chatWorkflow.title}, version ${chatWorkflow.version}`}><i /> {chatWorkflow.title} · v{chatWorkflow.version}</span>}
          {approvalMatchesSelectedWorkflow && <button type="button" className="ask-ai-run-approved" onClick={handleRunApprovedWorkflow} disabled={!!testReports.approved?.pending}>Run approved workflow →</button>}
        </div>
      </div>
      {testReports.approved && <div className="ask-ai-test-result approved-run-result" role="status">{testReports.approved.text}</div>}

      <div className="ask-ai-workspace" ref={workspaceRef}>
      <section className="ask-ai-chat-pane" aria-label="AI conversation">
      {/* CONVERSATION STREAM */}
      <div className="ask-ai-chat-stream">
        {messages.length === 0 && (
          <section className="ask-ai-welcome">
            <div className="ask-ai-welcome-mark" aria-hidden="true">✳</div>
            <span className="ask-ai-eyebrow">PLAN A WORKFLOW</span>
            <h3>What would you like to get done?</h3>
            <p>Describe the outcome and the website or app involved. I’ll ask for missing details, prepare a draft, and leave execution for your review and approval.</p>
            <div className="ask-ai-starter-grid">
              {quickPrompts.map((prompt, index) => (
                <button key={prompt} type="button" className="ask-ai-starter-card" onClick={() => void handleSend(prompt)} disabled={phase !== "idle"}>
                  <span className="starter-index">0{index + 1}</span>
                  <span>{prompt}</span>
                  <span className="starter-arrow" aria-hidden="true">↗</span>
                </button>
              ))}
            </div>
            <div className="ask-ai-welcome-note"><span /> Website workflows need a reviewed website scope before approval.</div>
          </section>
        )}
        {messages.map((msg) => (
          <div
            key={msg.id}
            className={`chat-bubble-row ${msg.sender === "user" ? "user-row" : "ai-row"}`}
          >
            {msg.sender === "ai" && <div className="chat-avatar-icon" aria-hidden="true">✳</div>}

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
              <div className="chat-bubble-text">
                {msg.text ? <MarkdownMessage text={msg.text} /> : phase === "streaming_response" && msg.sender === "ai" ? <span className="chat-streaming-cursor">Writing a response…</span> : null}
              </div>

              {/* CLARIFYING QUESTION WIDGET */}
              {msg.clarification && (
                <div className="clarification-bubble-card">
                  <div className="clarification-card-label"><span>NEEDS YOUR INPUT</span><span>One quick choice</span></div>
                  <h4>{msg.clarification.question}</h4>
                  {msg.clarification.explanation && (
                    <p className="clarification-expl">{msg.clarification.explanation}</p>
                  )}
                  {msg.clarification.id === "teach_task_from_site" ? (
                    <div className="clarification-teach-action">
                      <span>Capture the exact steps on the site you chose.</span>
                      <button type="button" onClick={() => onNavigate("Teach a Task")}>
                        Teach this task <span aria-hidden="true">→</span>
                      </button>
                    </div>
                  ) : (
                  <>
                  <div className="clarification-options-list">
                    {msg.clarification.options.map((opt, idx) => (
                      <button
                        key={idx}
                        type="button"
                        className="btn-clarification-option"
                        onClick={() => handleSelectClarification(msg.clarification!.id, opt)}
                        disabled={phase !== "asking_question" || msg.clarification?.id !== latestClarificationId}
                      >
                        <span className="opt-num">{idx + 1}.</span>
                        <span className="opt-text">{opt}</span>
                      </button>
                    ))}
                  </div>
                  <div className="clarification-custom-reply">
                    <label htmlFor={`clarification-answer-${msg.clarification.id}`}>Your answer</label>
                    <div className="clarification-custom-controls">
                      <input
                        id={`clarification-answer-${msg.clarification.id}`}
                        type="text"
                        value={customClarificationAnswers[msg.clarification.id] || ""}
                        onChange={(event) => setCustomClarificationAnswers((answers) => ({ ...answers, [msg.clarification!.id]: event.target.value }))}
                        onKeyDown={(event) => {
                          if (event.key === "Enter" && phase === "asking_question" && msg.clarification?.id === latestClarificationId) {
                            event.preventDefault();
                            handleSubmitCustomClarification(msg.clarification!.id);
                          }
                        }}
                        placeholder="Add a website, preference, or detail…"
                        disabled={phase !== "asking_question" || msg.clarification.id !== latestClarificationId}
                      />
                      <button
                        type="button"
                        onClick={() => handleSubmitCustomClarification(msg.clarification!.id)}
                        disabled={!customClarificationAnswers[msg.clarification.id]?.trim() || phase !== "asking_question" || msg.clarification.id !== latestClarificationId}
                      >
                        Continue <span aria-hidden="true">→</span>
                      </button>
                    </div>
                  </div>
                  </>
                  )}
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
                      Open workflow →
                    </button>
                    <button type="button" className="btn-plan-edit" onClick={() => handleRunTest(msg.id, msg.matchedWorkflow!)} disabled={!!testReports[msg.id]?.pending}>Run test</button>
                  </div>
                  {testReports[msg.id] && <div className="ask-ai-test-result" role="status">{testReports[msg.id].text}</div>}
                </div>
              )}

              {/* PROPOSED ACTION PLAN SUMMARY CARD */}
              {msg.proposedPlan && !msg.matchedWorkflow && (
                <div className="proposed-plan-card">
                  <div className="proposed-plan-header">
                    <span className="proposal-warning-tag">DRAFT · NOTHING HAS RUN</span>
                    <span className={`risk-pill risk-${msg.proposedPlan.risk}`}>
                      {msg.proposedPlan.risk.toUpperCase()} RISK
                    </span>
                  </div>
                  <h4 className="plan-title">{msg.proposedPlan.workflow.title}</h4>
                  <p className="plan-summary">{msg.proposedPlan.summary}</p>

                  <div className="ask-ai-scope-row">
                    <span className="scope-label">WEBSITE SCOPE</span>
                    {msg.proposedPlan.workflow.allowed_origins?.length
                      ? msg.proposedPlan.workflow.allowed_origins.map((origin) => <code key={origin}>{origin}</code>)
                      : <span className="scope-unset">Not assigned yet — review the permitted site in Permissions.</span>}
                  </div>

                  <div className="plan-steps-preview">
                    {msg.proposedPlan.workflow.steps.map((st, i) => (
                      <div key={st.id} className="plan-step-item">
                        <span className="st-num">{i + 1}</span>
                        <span className="st-name"><strong>{st.action.replaceAll("_", " ")}</strong><span>{st.name}{st.target?.name ? ` · ${st.target.name}` : ""}</span></span>
                        <span className={`st-risk st-risk-${st.risk}`}>{st.risk}</span>
                      </div>
                    ))}
                  </div>

                  <div className="proposed-plan-buttons">
                    <button
                      type="button"
                      className="btn-plan-approve"
                      onClick={() => handleUseSavedWorkflow(msg.proposedPlan!.workflow)}
                    >
                      Create workflow →
                    </button>
                    <button
                      type="button"
                      className="btn-plan-edit"
                      onClick={() => handleReviewProposedPlan(msg.proposedPlan!.workflow)}
                    >
                      Review changes
                    </button>
                    <button type="button" className="btn-plan-edit" onClick={() => handleRunTest(msg.id, msg.proposedPlan!.workflow)} disabled={!!testReports[msg.id]?.pending}>Run test</button>
                  </div>
                  <p className="ask-ai-test-note">Run test only checks the plan; it does not open the website or perform actions.</p>
                  {testReports[msg.id] && <div className="ask-ai-test-result" role="status">{testReports[msg.id].text}</div>}
                </div>
              )}

              <div className="ask-ai-message-footer"><span className="chat-timestamp">{msg.timestamp}</span><div className="ask-ai-message-actions" aria-label="Message actions">
                <button type="button" title="Copy message" aria-label="Copy message" onClick={() => handleCopyMessage(msg.text)}>Copy</button>
                {msg.sender === "user" && <button type="button" title="Edit and resend" aria-label="Edit message" onClick={() => handleEditMessage(msg.id)}>Edit</button>}
                {msg.sender !== "system" && <button type="button" title="Retry this request" aria-label="Retry message" onClick={() => handleRetryMessage(msg.id)} disabled={phase !== "idle"}>Retry</button>}
                {msg.sender === "ai" && <><button type="button" title="Helpful" aria-label="Helpful response" aria-pressed={msg.feedback === "up"} onClick={() => handleFeedback(msg.id, "up")}>Useful</button><button type="button" title="Not helpful" aria-label="Unhelpful response" aria-pressed={msg.feedback === "down"} onClick={() => handleFeedback(msg.id, "down")}>Not useful</button></>}
                {msg.artifactId && <button type="button" onClick={() => { setActiveArtifactId(msg.artifactId!); setPreviewOpen(true); }}>View artifact →</button>}
              </div></div>
            </div>
          </div>
        ))}

        {/* IN-FLIGHT PROGRESS WITH CANCEL BUTTON */}
        {(phase === "understanding_request" || phase === "preparing_plan") && (
          <div className="chat-bubble-row ai-row">
            <div className="chat-avatar-icon pulse" aria-hidden="true">✳</div>
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
      {messages.length > 0 && <div className="quick-suggestions-bar">
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
      </div>}

      {/* ERROR MESSAGE DISPLAY */}
      {errorMessage && (
        <div className="chat-error-banner" role="alert">
          <span>⚠️ {errorMessage}</span>
          <button type="button" onClick={() => setErrorMessage(null)}>✕</button>
        </div>
      )}

      {/* INPUT FORM */}
      <div className="ask-ai-input-bar">
        {attachments.length > 0 && <div className="ask-ai-attachment-list" aria-label="Attached files">
          {attachments.map((file) => <span className="ask-ai-attachment-chip" key={file.id}>📎 {file.name}<button type="button" aria-label={`Remove ${file.name}`} onClick={() => setAttachments((current) => current.filter((item) => item.id !== file.id))}>×</button></span>)}
        </div>}
        <input ref={fileInputRef} type="file" multiple hidden accept=".txt,.md,.markdown,.csv,.json,.log,.js,.jsx,.ts,.tsx,.py,.html,.css,.yaml,.yml" onChange={handleAttachFiles} />
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
            placeholder="Ask anything or tell me what you want to build..."
            disabled={phase !== "idle" && phase !== "asking_question"}
          />
          <div className="ask-ai-form-actions">
            <button type="button" className="ask-ai-attach-button" onClick={() => fileInputRef.current?.click()} disabled={phase !== "idle" && phase !== "asking_question"} aria-label="Attach text or code file">＋ Attach</button>
            <button
              type="submit"
              className="btn-send-goal"
              disabled={!inputText.trim() || (phase !== "idle" && phase !== "asking_question")}
            >
              {phase === "asking_question" ? "Send follow-up ↗" : isConversationQuestion(inputText) ? "Send ↗" : "Send ↗"}
            </button>
            {phase === "streaming_response" && <button type="button" className="ask-ai-stop-button" onClick={handleCancelRequest}>Stop</button>}
          </div>
        </form>
      </div>
      </section>
      {previewOpen && artifacts.length > 0 && <>
        <div className="ask-ai-preview-resizer" role="separator" aria-label="Resize live preview" aria-orientation="vertical" aria-valuenow={Math.round(previewWidth)} tabIndex={0}
          onPointerDown={(event) => { event.preventDefault(); setDraggingPreview(true); }}
          onKeyDown={(event) => { if (event.key === "ArrowLeft") setPreviewWidth((width) => Math.min(780, width + 24)); if (event.key === "ArrowRight") setPreviewWidth((width) => Math.max(340, width - 24)); }} />
        <AskAIPreviewPanel artifacts={artifacts} selectedId={activeArtifactId} width={previewWidth} expanded={previewExpanded}
          onSelect={setActiveArtifactId} onResize={setPreviewWidth} onExpand={() => setPreviewExpanded((value) => !value)} onClose={() => setPreviewOpen(false)}
          onWorkflowChange={handleWorkflowPreviewChange} onOpenRun={() => onNavigate("Live Run")} />
      </>}
      </div>
    </div>
  );
};
