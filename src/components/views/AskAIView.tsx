import React, { useState, useRef, useEffect } from "react";
import { defaultAIService } from "../../services/aiService";
import { api } from "../../api/client";
import { MarkdownMessage } from "../common/MarkdownMessage";
import { AskAIPreviewPanel } from "./AskAIPreviewPanel";
import type { AskAIArtifact } from "./AskAIPreviewPanel";
import { VoiceInputButton } from "../ag_ui/VoiceInputButton";
import { runAgUiAgent, respondToInterrupt } from "../../services/agUiStream";
import type { AgUiTask, InterruptPayload } from "../../services/agUiStream";
import type {
  ConversationMessage,
  ConversationPhase,
} from "../../services/aiService";
import type { AppSection, WorkflowDefinition, ApprovalRecord } from "../../types";

type Props = {
  onNavigate: (section: AppSection) => void;
  onWorkflowGenerated: (wf: WorkflowDefinition) => void;
  onStartRecording?: (preset: { url: string; description: string }) => void;
  initialPrompt?: string;
  savedWorkflows?: WorkflowDefinition[];
  activeWorkflow?: WorkflowDefinition;
  activeApproval?: ApprovalRecord | null;
  onWorkflowUpdated?: (workflow: WorkflowDefinition) => void;
  onApprovalUpdated?: (approval: ApprovalRecord | null) => void;
  sidebarCommand?: { kind: "new-chat"; id: number } | { kind: "open-thread"; threadId: string; id: number } | null;
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
  const asksToCreateWorkflow = /\b(automate|automation|create (?:a |the )?workflow|build (?:a |the )?workflow|prepare (?:a |the )?workflow|teach (?:a |the )?task|record (?:a |the )?task|run (?:this |the )?workflow|execute (?:this |the )?workflow|revise (?:this |the )?workflow|edit (?:this |the )?workflow)\b/i.test(text);
  const taskCommand = /^(?:(?:i want to|i need to|please|can you|could you|help me)\s+)?(?:search|find|open|visit|go to|navigate to|click|fill|submit|send|delete|update|purchase|book|prepare)\b/i.test(text.trim());
  const asksToPerformWebTask = taskCommand && /\b(website|site|browser|portal|account|inbox|page|app|application|form|spreadsheet|document|calendar|email|message|record|google maps|maps)\b/i.test(text);
  // Route ordinary messages—including greetings and plain questions—to the streaming
  // conversation model. Only task instructions enter workflow search/drafting.
  return !asksToCreateWorkflow && !asksToPerformWebTask;
}

export const AskAIView: React.FC<Props> = ({
  onNavigate,
  onWorkflowGenerated,
  onStartRecording,
  initialPrompt = "",
  savedWorkflows = [],
  activeWorkflow,
  activeApproval,
  onWorkflowUpdated,
  onApprovalUpdated,
  sidebarCommand,
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
  const [draggingPreview, setDraggingPreview] = useState(false);
  const [testReports, setTestReports] = useState<Record<string, { pending?: boolean; text: string }>>({});
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const workspaceRef = useRef<HTMLDivElement | null>(null);
  const lastSidebarCommandId = useRef(0);
  const [agUiTasks, setAgUiTasks] = useState<AgUiTask[]>([]);
  const [agUiStepIndex, setAgUiStepIndex] = useState(0);
  const [agUiProgress, setAgUiProgress] = useState(0);
  const [agUiStatusText, setAgUiStatusText] = useState("Ready");
  const [isAgUiRunning, setIsAgUiRunning] = useState(false);
  const [agUiInterrupt, setAgUiInterrupt] = useState<InterruptPayload | null>(null);
  const [selectedAgentId, setSelectedAgentId] = useState("general");
  const [overrideSurfaces, setOverrideSurfaces] = useState<Record<string, "browser" | "desktop">>({});
  const [selectedProvider, setSelectedProvider] = useState("gemini");

  // Step 6: Plan Run & Live Execution State
  interface PlanRunState {
    runId: string;
    workflowId: string;
    status: "idle" | "running" | "pending_confirmation" | "success" | "failed" | "stopped";
    mode: "dry_run" | "run";
    currentStepIndex: number;
    stepResults: Array<{
      step_id: string;
      action: string;
      target_summary?: string;
      passed: boolean;
      error_message?: string;
    }>;
    pendingConfirmation?: {
      run_id: string;
      step: any;
      evaluated_args: Record<string, any>;
      risk: string;
    };
    verificationChecklist?: Array<{
      type: string;
      target: string;
      passed: boolean;
      details: string;
    }>;
    safeStopReason?: string;
    error?: string;
  }

  const [planRuns, setPlanRuns] = useState<Record<string, PlanRunState>>({});

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
    window.dispatchEvent(new Event("whistlecode:ask-ai-threads-updated"));
  }, [threads]);

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
    // Invalidate active approval if workflow was modified
    if (activeApproval && activeApproval.workflow_id === workflow.workflow_id) {
      onApprovalUpdated?.(null as any);
    }
    // Invalidate prior plan runs for this workflow
    setPlanRuns((prev) => {
      const next = { ...prev };
      for (const k of Object.keys(next)) {
        if (next[k].workflowId === workflow.workflow_id) {
          delete next[k];
        }
      }
      return next;
    });
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

  useEffect(() => {
    if (!sidebarCommand || sidebarCommand.id <= lastSidebarCommandId.current) return;
    lastSidebarCommandId.current = sidebarCommand.id;
    if (sidebarCommand.kind === "new-chat") handleNewConversation();
    else if (sidebarCommand.kind === "open-thread") handleSwitchConversation(sidebarCommand.threadId);
  }, [sidebarCommand, threads]);

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

  // Step 6: Live Polling and Handlers for Execution from Chat
  const pollRunStatus = (messageId: string, runId: string, workflow: WorkflowDefinition) => {
    const pollInterval = window.setInterval(async () => {
      try {
        const res = await api.getExecutionStatus(runId);
        const run = res.run;
        const pending = res.pending_confirmation;
        if (!run) return;

        registerRunArtifact(run, workflow);

        const isTerminal = Boolean(run.ended_at) || ["SUCCESS", "FAILED", "STOPPED"].includes(run.state);
        const isPendingConfirm = run.state === "PENDING_CONFIRMATION" || Boolean(pending);

        let status: PlanRunState["status"] = "running";
        if (isPendingConfirm) {
          status = "pending_confirmation";
        } else if (run.state === "SUCCESS") {
          status = "success";
        } else if (run.state === "FAILED") {
          status = "failed";
        } else if (run.state === "STOPPED") {
          status = "stopped";
        }

        setPlanRuns((prev) => ({
          ...prev,
          [messageId]: {
            ...prev[messageId],
            runId,
            workflowId: workflow.workflow_id,
            status,
            currentStepIndex: run.current_step_index ?? prev[messageId]?.currentStepIndex ?? 0,
            stepResults: (run.step_results || []).map((sr: any) => ({
              step_id: sr.step_id,
              action: sr.action,
              target_summary: sr.target_summary,
              passed: sr.passed,
              error_message: sr.error_message,
            })),
            pendingConfirmation: pending,
            verificationChecklist: run.verification_checklist || [],
            safeStopReason: run.safe_stop_reason,
          },
        }));

        if (isTerminal) {
          window.clearInterval(pollInterval);
        }
      } catch (err: any) {
        window.clearInterval(pollInterval);
      }
    }, 450);
  };

  const handleApproveAndRun = async (messageId: string, workflow: WorkflowDefinition) => {
    try {
      setPlanRuns((prev) => ({
        ...prev,
        [messageId]: {
          runId: "",
          workflowId: workflow.workflow_id,
          status: "running",
          mode: "run",
          currentStepIndex: 0,
          stepResults: [],
        },
      }));

      // 1. Sign plan hash via HMAC
      const origins = workflow.allowed_origins && workflow.allowed_origins.length ? workflow.allowed_origins : ["*"];
      const approval = await api.approveWorkflow(workflow, origins, 30);
      onApprovalUpdated?.(approval);

      // 2. Start execution
      const execRes = await api.executeWorkflow(workflow, {}, approval.id, "run");
      const run = execRes.run;
      if (run) {
        registerRunArtifact(run, workflow);
        const isTerminal = Boolean(run.ended_at) || ["SUCCESS", "FAILED", "STOPPED"].includes(run.state);
        setPlanRuns((prev) => ({
          ...prev,
          [messageId]: {
            ...prev[messageId],
            runId: run.id,
            status: run.state === "SUCCESS" ? "success" : run.state === "FAILED" ? "failed" : "running",
            stepResults: (run.step_results || []).map((sr: any) => ({
              step_id: sr.step_id,
              action: sr.action,
              target_summary: sr.target_summary,
              passed: sr.passed,
              error_message: sr.error_message,
            })),
            verificationChecklist: run.verification_checklist || [],
            safeStopReason: run.safe_stop_reason,
          },
        }));

        if (!isTerminal) {
          pollRunStatus(messageId, run.id, workflow);
        }
      }
    } catch (err: any) {
      setPlanRuns((prev) => ({
        ...prev,
        [messageId]: {
          runId: "",
          workflowId: workflow.workflow_id,
          status: "failed",
          mode: "run",
          currentStepIndex: 0,
          stepResults: [],
          safeStopReason: err.message || "Execution approval failed",
          error: err.message || "Execution approval failed",
        },
      }));
    }
  };

  const handleDryRun = async (messageId: string, workflow: WorkflowDefinition) => {
    try {
      setPlanRuns((prev) => ({
        ...prev,
        [messageId]: {
          runId: "",
          workflowId: workflow.workflow_id,
          status: "running",
          mode: "dry_run",
          currentStepIndex: 0,
          stepResults: [],
        },
      }));

      const execRes = await api.executeWorkflow(workflow, {}, undefined, "dry_run");
      const run = execRes.run;
      if (run) {
        registerRunArtifact(run, workflow);
        const isTerminal = Boolean(run.ended_at) || ["SUCCESS", "FAILED", "STOPPED"].includes(run.state);
        setPlanRuns((prev) => ({
          ...prev,
          [messageId]: {
            ...prev[messageId],
            runId: run.id,
            status: run.state === "SUCCESS" ? "success" : run.state === "FAILED" ? "failed" : "running",
            stepResults: (run.step_results || []).map((sr: any) => ({
              step_id: sr.step_id,
              action: sr.action,
              target_summary: sr.target_summary,
              passed: sr.passed,
              error_message: sr.error_message,
            })),
            verificationChecklist: run.verification_checklist || [],
            safeStopReason: run.safe_stop_reason,
          },
        }));

        if (!isTerminal) {
          pollRunStatus(messageId, run.id, workflow);
        }
      }
    } catch (err: any) {
      setPlanRuns((prev) => ({
        ...prev,
        [messageId]: {
          runId: "",
          workflowId: workflow.workflow_id,
          status: "failed",
          mode: "dry_run",
          currentStepIndex: 0,
          stepResults: [],
          safeStopReason: err.message || "Dry run failed",
          error: err.message || "Dry run failed",
        },
      }));
    }
  };

  const handleCancelRun = async (messageId: string) => {
    try {
      await api.stopExecution();
      setPlanRuns((prev) => ({
        ...prev,
        [messageId]: {
          ...prev[messageId],
          status: "stopped",
          safeStopReason: "Execution halted by user request",
        },
      }));
    } catch (err: any) {
      setErrorMessage(err.message || "Failed to cancel execution.");
    }
  };

  const handleConfirmStep = async (messageId: string, runId: string, grant: boolean) => {
    try {
      await api.confirmStep(runId, grant);
      setPlanRuns((prev) => ({
        ...prev,
        [messageId]: {
          ...prev[messageId],
          pendingConfirmation: undefined,
          status: grant ? "running" : "stopped",
          safeStopReason: grant ? undefined : "Action denied by user",
        },
      }));
    } catch (err: any) {
      setErrorMessage(err.message || "Failed to submit step confirmation.");
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
    setIsAgUiRunning(true);
    setAgUiStatusText("Starting AG-UI stream...");
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

  const sanitizeUserPrompt = (raw: string): string => {
    const trimmed = raw.trim();
    const skillMatch = trimmed.match(/^(?:execute\s+skill|run\s+skill|skill):\s*(.+)$/i);
    if (skillMatch) {
      return `Help me use the ${skillMatch[1].trim()} skill for my task`;
    }
    const toolMatch = trimmed.match(/^(?:execute\s+tool|run\s+tool|tool):\s*(.+)$/i);
    if (toolMatch) {
      return `Help me use the ${toolMatch[1].trim()} tool for my task`;
    }
    return trimmed;
  };

  const handleSend = async (textToSend?: string) => {
    if (phase !== "idle" && phase !== "asking_question") {
      return;
    }
    const rawQuery = (textToSend !== undefined ? textToSend : inputText).trim();
    if (!rawQuery) {
      setErrorMessage("Please enter a goal or question.");
      return;
    }

    // Handle slash commands (/record, /workflows, /provider)
    if (rawQuery.startsWith("/")) {
      const cmd = rawQuery.split(" ")[0].toLowerCase();
      setInputText("");
      if (cmd === "/record") {
        onNavigate("Teach");
        return;
      }
      if (cmd === "/workflows") {
        onNavigate("My Workflows");
        return;
      }
      if (cmd === "/provider") {
        onNavigate("Integrations");
        return;
      }
    }
    const query = sanitizeUserPrompt(rawQuery);

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
          provider: selectedProvider,
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
        provider: selectedProvider,
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
        const rawMessage = err.message || "Failed to process goal.";
        if (rawMessage.toLowerCase().includes("key") || rawMessage.toLowerCase().includes("not configured") || rawMessage.toLowerCase().includes("provider")) {
          setErrorMessage(
            rawMessage.includes("Integrations")
              ? rawMessage
              : `${rawMessage} Please configure your provider API key in Integrations.`
          );
        } else {
          setErrorMessage(rawMessage);
        }
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
        provider: selectedProvider,
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

  const handleReviewGovernance = (wf: WorkflowDefinition) => {
    (onWorkflowUpdated || onWorkflowGenerated)(wf);
    showWorkflowArtifact(wf);
    onNavigate("Permissions");
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
  return (
    <div className="ask-ai-view-container" data-theme="light">
      <div className="ask-ai-workspace" ref={workspaceRef}>
        <section className="ask-ai-chat-pane" aria-label="AI conversation">
      {/* CONVERSATION STREAM */}
      <div className="ask-ai-chat-stream">
        {/* WHISTLECODE Assistant Header Banner (Reference Design) */}
        <div className="assistant-banner-ref">
          <div className="assistant-logo-circle">
            <span className="assistant-logo-wave">〰️</span>
          </div>
          <div className="assistant-info-text">
            <h3 className="assistant-headline">WHISTLECODE Assistant</h3>
            <span className="assistant-subheadline">Your AI automation partner</span>
          </div>
          <span className="assistant-ai-pill">✦ AI-Powered</span>
        </div>
        {(approvalMatchesSelectedWorkflow || testReports.approved) && <div className="ask-ai-inline-workflow-actions">
          {approvalMatchesSelectedWorkflow && <div><span className="ask-ai-approved-indicator" /><span>Approved workflow: <strong>{activeWorkflow?.title}</strong></span><button type="button" onClick={handleRunApprovedWorkflow} disabled={!!testReports.approved?.pending}>{testReports.approved?.pending ? "Starting…" : "Run workflow →"}</button></div>}
          {testReports.approved && <p role="status">{testReports.approved.text}</p>}
        </div>}
        {artifacts.length > 0 && !previewOpen && <button type="button" className="ask-ai-open-workspace-inline" onClick={() => setPreviewOpen(true)}>Open generated workspace →</button>}
        {messages.length === 0 && (
          <section className="ask-ai-welcome">
            <div className="ask-ai-welcome-mark"><img src="/whistlecode-mark.svg" alt="" /></div>
            <span className="ask-ai-eyebrow">WHISTLECODE ASSISTANT</span>
            <h3>How can I help?</h3>
            <p>Ask a question or describe a task. I can help shape a workflow, then show you the plan for review before anything runs.</p>
            <div className="ask-ai-starter-grid">
              {quickPrompts.map((prompt, index) => (
                <button key={prompt} type="button" className="ask-ai-starter-card" onClick={() => void handleSend(prompt)} disabled={phase !== "idle"}>
                  <span className="starter-index">0{index + 1}</span>
                  <span>{prompt}</span>
                  <span className="starter-arrow" aria-hidden="true">↗</span>
                </button>
              ))}
            </div>
            <div className="ask-ai-welcome-note"><span /> You review the plan and approve the website scope before execution.</div>
          </section>
        )}
        {messages.map((msg) => (
          <div
            key={msg.id}
            className={`chat-bubble-row ${msg.sender === "user" ? "user-row" : "ai-row"}`}
          >
            {msg.sender === "ai" && (
              <div className="chat-avatar-icon bot-avatar-ref" aria-hidden="true">
                <span>〰️</span>
              </div>
            )}

            <div className={`chat-bubble-card ${msg.sender === "user" ? "user-bubble" : "ai-bubble"}`}>
              {/* Informational vs Action Proposal Banner */}
              {msg.type === "answer_only" && msg.sender === "ai" && !msg.capabilityResult && (
                <div className="response-type-pill pill-info">
                  <span>ℹ️ Informational Response</span>
                  <small>No computer actions proposed or performed</small>
                </div>
              )}

              {/* CAPABILITY RESULT CARD (Step 5) */}
              {msg.capabilityResult && (
                <div className={`capability-result-card cap-severity-${msg.capabilityResult.severity}`} role="status">
                  <div className="cap-result-header">
                    <span className={`cap-status-dot dot-${msg.capabilityResult.severity}`} aria-hidden="true" />
                    <strong className="cap-outcome">{msg.capabilityResult.outcome.replaceAll("_", " ")}</strong>
                    {msg.capabilityResult.surface && (
                      <span className="cap-surface-pill">
                        {msg.capabilityResult.surface === "browser" ? "🌐 Browser" : "🖥️ Desktop"}
                      </span>
                    )}
                  </div>
                  <p className="cap-result-reason">{msg.capabilityResult.reason}</p>
                </div>
              )}

              {msg.type === "action_proposal" && !msg.capabilityResult && (
                <div className="response-type-pill pill-proposal">
                  <span>⚡ Action Plan Proposed</span>
                  <small>Requires explicit human approval before running</small>
                </div>
              )}

              {msg.type === "clarification_request" && !msg.clarifySurface && (
                <div className="response-type-pill pill-clarification">
                  <span>❓ Clarification Needed</span>
                  <small>Please select your preference below</small>
                </div>
              )}

              {/* Message Body */}
              <div className="chat-bubble-text">
                {msg.text && !msg.capabilityResult ? <MarkdownMessage text={msg.text} /> : phase === "streaming_response" && msg.sender === "ai" ? <span className="chat-streaming-cursor">Writing a response…</span> : null}
              </div>

              {msg.sender === "user" && (
                <div className="user-bubble-timestamp">
                  <span>{msg.timestamp || "10:24 AM"}</span>
                  <span className="read-ticks" aria-label="Delivered">✓✓</span>
                </div>
              )}

              {/* ERROR CARD (Step 5: never uses success styling) */}
              {((msg.type === "answer_only" && (msg.text.includes("⚠️") || msg.text.includes("Unsupported") || msg.capabilityResult?.severity === "red")) || msg.capabilityResult?.outcome === "UNSUPPORTED") && (
                <div className="chat-error-card" role="alert">
                  <div className="error-card-header">
                    <span aria-hidden="true">🚫</span>
                    <strong>{msg.capabilityResult?.outcome || "UNSUPPORTED TASK"}</strong>
                  </div>
                  <p className="error-card-message">{msg.capabilityResult?.reason || msg.text.replace(/^⚠️\s*/, "")}</p>
                  <div className="error-card-recovery">
                    <small>Recovery: Rephrase your request to target a supported web application or connect required integrations.</small>
                    <button type="button" className="btn-secondary btn-sm" onClick={() => onNavigate("Integrations")}>
                      Open Integrations ↗
                    </button>
                  </div>
                </div>
              )}

              {/* CLARIFY SURFACE TWO-OPTION QUESTION CARD (Step 5) */}
              {(msg.clarifySurface || (msg.clarification?.id === "clarify_surface")) && (
                <div className="clarify-surface-card" role="region" aria-label="Environment choice">
                  <div className="clarify-surface-header">
                    <span className="clarify-badge">ENVIRONMENT CHOICE</span>
                    <h4>Which environment should this automation run on?</h4>
                    {msg.clarification?.explanation && (
                      <p className="clarify-expl">{msg.clarification.explanation}</p>
                    )}
                  </div>
                  <div className="clarify-surface-options-grid">
                    <button
                      type="button"
                      className="clarify-surface-btn surface-browser"
                      onClick={() => handleSelectClarification(msg.clarification?.id || "clarify_surface", "Web Browser")}
                      disabled={phase !== "asking_question" && phase !== "idle"}
                    >
                      <span className="surface-icon">🌐</span>
                      <div className="surface-info">
                        <strong>Web Browser</strong>
                        <p>Automate interactions on a website or web application using Playwright Chromium.</p>
                      </div>
                      <span className="surface-arrow">→</span>
                    </button>
                    <button
                      type="button"
                      className="clarify-surface-btn surface-desktop btn-disabled"
                      disabled
                      title="Desktop driver is currently unavailable in this environment"
                    >
                      <span className="surface-icon">🖥️</span>
                      <div className="surface-info">
                        <strong>Desktop Application (Unavailable)</strong>
                        <p>Native OS / Windows software (Desktop driver unavailable in Stage 2).</p>
                      </div>
                      <span className="surface-arrow">⚠️</span>
                    </button>
                  </div>
                </div>
              )}

              {/* CLARIFYING QUESTION WIDGET (Generic) */}
              {msg.clarification && msg.clarification.id !== "clarify_surface" && (
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

              {/* NEEDS RECORDING ACTION CARD (Step 5) */}
              {msg.needsRecording && (() => {
                const effectiveSurface = overrideSurfaces[msg.id] || msg.needsRecording.surface || "browser";
                const isDesktop = effectiveSurface === "desktop";
                return (
                  <div className="needs-recording-card" role="region" aria-label="Demonstration recording offer">
                    <div className="recording-card-header">
                      <span className="recording-badge-icon" aria-hidden="true">🎥</span>
                      <strong>Teach WhistleCode by Recording</strong>
                      <span className={`recording-surface-pill surface-${effectiveSurface}`}>
                        {effectiveSurface === "browser" ? "🌐 Browser" : "🖥️ Desktop"}
                      </span>
                    </div>
                    <p className="recording-card-desc">
                      {msg.text || `No existing workflow or tool was found. Demonstrate this ${effectiveSurface} task once to synthesize a reliable, reusable workflow.`}
                    </p>
                    <div className="recording-card-actions">
                      {isDesktop ? (
                        <button
                          type="button"
                          className="btn-primary btn-disabled"
                          disabled
                          title="Desktop recording driver is currently unavailable"
                        >
                          Record on Desktop (Unavailable)
                        </button>
                      ) : (
                        <button
                          type="button"
                          className="btn-primary"
                          onClick={() => onStartRecording?.({
                            url: msg.needsRecording?.targetHints?.urls?.[0] || "",
                            description: msg.text || "Demonstrate the requested task",
                          })}
                        >
                          Record in Browser →
                        </button>
                      )}
                      <button
                        type="button"
                        className="btn-surface-switch-link"
                        onClick={() => setOverrideSurfaces((prev) => ({ ...prev, [msg.id]: isDesktop ? "browser" : "desktop" }))}
                      >
                        {isDesktop ? "Switch to browser recording" : "Switch to desktop recording"}
                      </button>
                    </div>
                    {isDesktop && (
                      <p className="desktop-unavailable-note" role="note">
                        ⚠️ Desktop driver is currently unavailable in this environment (Stage 3). Switch to browser to continue.
                      </p>
                    )}
                  </div>
                );
              })()}

              {/* PROPOSED ACTION PLAN SUMMARY CARD (Step 5: Edit / Dry run / Approve & run) */}
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
                    {msg.proposedPlan.workflow.steps.map((st, i) => {
                      const isSensitive = st.requires_confirmation || st.risk === "high" || st.risk === "critical";
                      return (
                        <div key={st.id} className={`plan-step-item ${isSensitive ? "step-sensitive" : ""}`}>
                          <span className="st-num">{i + 1}</span>
                          <span className="st-name">
                            <strong>{st.action.replaceAll("_", " ")}</strong>
                            <span>{st.name}{st.target?.name ? ` · ${st.target.name}` : ""}</span>
                          </span>
                          {isSensitive && (
                            <span className="st-sensitive-tag" title="Sensitive step: pauses for explicit human confirmation">
                              🛡️ Sensitive
                            </span>
                          )}
                          <span className={`st-risk st-risk-${st.risk}`}>{st.risk}</span>
                        </div>
                      );
                    })}
                  </div>

                  {/* Step 6: In-card Execution, Approval, Confirmation Gate & Verification Checklist */}
                  {planRuns[msg.id] ? (() => {
                    const runState = planRuns[msg.id];
                    const isRunning = runState.status === "running";
                    const isPendingConfirm = runState.status === "pending_confirmation";
                    const isFinished = ["success", "failed", "stopped"].includes(runState.status);

                    return (
                      <div className="plan-run-container" role="region" aria-label="Execution progress and verification">
                        <div className="plan-run-header">
                          <div className="exec-title-row">
                            <span className="exec-play-circle">▶</span>
                            <div className="exec-title-meta">
                              <strong>Executing your task...</strong>
                              <span className="exec-subtitle">Organizing files and executing steps</span>
                            </div>
                          </div>
                          <span className={`plan-run-badge badge-${runState.status === "pending_confirmation" ? "pending-confirm" : runState.status}`}>
                            {runState.mode === "dry_run" ? "DRY RUN · " : ""}
                            {runState.status.replaceAll("_", " ")}
                          </span>
                          {(isRunning || isPendingConfirm) && (
                            <button
                              type="button"
                              className="btn-cancel-run"
                              onClick={() => handleCancelRun(msg.id)}
                            >
                              ✕ Cancel
                            </button>
                          )}
                        </div>
                        {isRunning && (
                          <div className="exec-progress-bar-wrap">
                            <div className="exec-progress-bar-fill" style={{ width: `${Math.min(100, Math.max(25, Math.round(((runState.currentStepIndex + 1) / (msg.proposedPlan!.workflow.steps.length || 1)) * 100)))}%` }} />
                          </div>
                        )}

                        {/* Step-by-step progress */}
                        <div className="plan-run-step-list">
                          {msg.proposedPlan!.workflow.steps.map((st, idx) => {
                            const stepRes = runState.stepResults.find((r) => r.step_id === st.id) || runState.stepResults[idx];
                            const isCurrent = (isRunning || isPendingConfirm) && runState.currentStepIndex === idx;
                            const isPassed = stepRes?.passed;
                            const isFailed = stepRes && !stepRes.passed;

                            return (
                              <div
                                key={st.id}
                                className={`plan-run-step-item ${isCurrent ? "step-active" : ""} ${isPassed ? "step-passed" : ""} ${isFailed ? "step-failed" : ""}`}
                              >
                                <span className={`step-indicator ${isPassed ? "ind-passed" : isFailed ? "ind-failed" : isCurrent ? "ind-running" : "ind-pending"}`}>
                                  {isPassed ? "✓" : isFailed ? "✗" : isCurrent ? "⏳" : "○"}
                                </span>
                                <div className="step-item-title">
                                  <strong>{st.action.replaceAll("_", " ")}</strong>
                                  <span> · {st.name}{st.target?.name ? ` (${st.target.name})` : ""}</span>
                                  {stepRes?.error_message && (
                                    <div className="step-item-err">{stepRes.error_message}</div>
                                  )}
                                </div>
                              </div>
                            );
                          })}
                        </div>

                        {/* Interactive Confirmation Gate (Sensitive Step) */}
                        {isPendingConfirm && (
                          <div className="confirmation-gate-card" role="alertdialog" aria-label="Sensitive step confirmation required">
                            <div className="confirmation-gate-header">
                              <span aria-hidden="true">🛡️</span>
                              <strong>Confirmation Required Before Proceeding</strong>
                            </div>
                            <div className="confirmation-details">
                              <div><strong>Action:</strong> <code>{runState.pendingConfirmation?.step?.action || "Execute sensitive action"}</code></div>
                              <div><strong>Target:</strong> {runState.pendingConfirmation?.step?.target?.name || runState.pendingConfirmation?.step?.target?.role || "Protected target"}</div>
                              {runState.pendingConfirmation?.evaluated_args && Object.keys(runState.pendingConfirmation.evaluated_args).length > 0 && (
                                <div><strong>Arguments:</strong> <code>{JSON.stringify(runState.pendingConfirmation.evaluated_args)}</code></div>
                              )}
                              <div><strong>Risk Level:</strong> {runState.pendingConfirmation?.risk || "HIGH"}</div>
                            </div>
                            <div className="confirmation-gate-actions">
                              <button
                                type="button"
                                className="btn-confirm-deny"
                                onClick={() => handleConfirmStep(msg.id, runState.runId, false)}
                              >
                                Deny & Abort
                              </button>
                              <button
                                type="button"
                                className="btn-confirm-grant"
                                onClick={() => handleConfirmStep(msg.id, runState.runId, true)}
                              >
                                Grant & Continue
                              </button>
                            </div>
                          </div>
                        )}

                        {/* Postcondition Verification Checklist Card */}
                        {isFinished && runState.verificationChecklist && runState.verificationChecklist.length > 0 && (
                          <div className="verification-checklist-card">
                            <div className="verification-checklist-header">
                              <span>VERIFICATION CHECKLIST</span>
                              <span>{runState.status === "success" ? "All Passed" : "Verification Incomplete"}</span>
                            </div>
                            <div className="checklist-items">
                              {runState.verificationChecklist.map((item, cIdx) => (
                                <div key={cIdx} className={`checklist-item ${item.passed ? "item-passed" : "item-failed"}`}>
                                  <span className={`checklist-item-icon ${item.passed ? "icon-pass" : "icon-fail"}`}>
                                    {item.passed ? "✓" : "✗"}
                                  </span>
                                  <span className="checklist-item-text">{item.details || `${item.type} on ${item.target}`}</span>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}

                        {/* Failure Recovery Suggestions */}
                        {(runState.status === "failed" || runState.status === "stopped") && (
                          <div className="run-recovery-box" role="alert">
                            <span className="recovery-title">
                              {runState.status === "stopped" ? "⏹️ Execution Halted" : "🚫 Execution Failed"}
                            </span>
                            <p className="recovery-reason">
                              {runState.safeStopReason || runState.error || "The execution halted before verified completion. Never faked."}
                            </p>
                            <div className="recovery-actions">
                              <button
                                type="button"
                                className="btn-secondary btn-sm"
                                onClick={() => handleReviewProposedPlan(msg.proposedPlan!.workflow)}
                              >
                                Edit Workflow
                              </button>
                              <button
                                type="button"
                                className="btn-secondary btn-sm"
                                onClick={() => onNavigate("Teach")}
                              >
                                Record in Browser
                              </button>
                              <button
                                type="button"
                                className="btn-primary btn-sm"
                                onClick={() => handleDryRun(msg.id, msg.proposedPlan!.workflow)}
                              >
                                Retry Dry Run
                              </button>
                            </div>
                          </div>
                        )}

                        {/* Success Notice in Light Green */}
                        {runState.status === "success" && (
                          <div className="task-completed-card-ref" role="status">
                            <div className="task-completed-title">
                              <span aria-hidden="true">✓</span>
                              <strong>Task completed successfully! 🎉</strong>
                            </div>
                            <p className="task-completed-desc">
                              Your files have been organized and summaries are ready.
                            </p>
                            <div className="completed-attachment-card">
                              <div className="att-file-icon">📁</div>
                              <div className="att-file-meta">
                                <strong className="att-file-name">Assignment_Summaries.zip</strong>
                                <span className="att-file-size">2.4 MB · Download</span>
                              </div>
                              <div className="att-file-btns">
                                <button type="button" className="att-btn-open" onClick={() => setPreviewOpen(true)}>Open ↗</button>
                                <button type="button" className="att-btn-share" onClick={() => onNavigate("Artifacts")}>Share</button>
                              </div>
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })() : (
                    <>
                      <div className="proposed-plan-buttons">
                        <button
                          type="button"
                          className="btn-plan-approve ref-btn-primary"
                          onClick={() => handleReviewGovernance(msg.proposedPlan!.workflow)}
                        >
                          Review & Govern
                        </button>
                        <button
                          type="button"
                          className="btn-plan-edit ref-btn-secondary"
                          onClick={() => handleReviewProposedPlan(msg.proposedPlan!.workflow)}
                        >
                          Preview & Edit
                        </button>
                        <button
                          type="button"
                          className="btn-plan-edit ref-btn-secondary"
                          onClick={() => {
                            (onWorkflowUpdated || onWorkflowGenerated)(msg.proposedPlan!.workflow);
                            onNavigate("My Workflows");
                          }}
                        >
                          Edit & Save
                        </button>
                        <button
                          type="button"
                          className="btn-plan-record ref-btn-secondary"
                          onClick={() => onNavigate("Teach")}
                        >
                          🎥 Record Instead
                        </button>
                        <button
                          type="button"
                          className="btn-plan-dryrun ref-btn-subtle"
                          onClick={() => handleDryRun(msg.id, msg.proposedPlan!.workflow)}
                        >
                          Dry run
                        </button>
                      </div>
                      <p className="ask-ai-test-note">Dry run checks the plan; it does not open the website or perform actions.</p>
                    </>
                  )}
                  {testReports[msg.id] && !planRuns[msg.id] && <div className="ask-ai-test-result" role="status">{testReports[msg.id].text}</div>}
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
            {msg.sender === "user" && (
              <img
                src="https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=100&auto=format&fit=crop&q=80"
                alt="Sarah Johnson"
                className="chat-avatar-user"
              />
            )}
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

        {/* ARIA Live Region for Assistant Progress (Step 5 Accessibility) */}
        <div role="status" aria-live="polite" className="sr-only">
          {phase === "understanding_request"
            ? "Analyzing task capabilities and environment..."
            : phase === "preparing_plan"
            ? "Synthesizing step-by-step action plan..."
            : phase === "streaming_response"
            ? "Writing response..."
            : phase === "asking_question"
            ? "Waiting for your clarification choice."
            : ""}
        </div>

        <div ref={messagesEndRef} />
      </div>

      {/* QUICK SUGGESTION CHIPS (Step 5: shown only on empty state) */}
      {messages.length === 0 && (
        <div className="quick-suggestions-bar empty-state-suggestions" role="region" aria-label="Suggested starter prompts">
          <span className="sugg-label">Try:</span>
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
      )}

      {/* ERROR MESSAGE DISPLAY */}
      {errorMessage && (
        <div className="chat-error-banner" role="alert">
          <div className="chat-error-content" style={{ display: "flex", alignItems: "center", gap: "8px", flex: 1 }}>
            <span aria-hidden="true">⚠️</span>
            <span className="chat-error-text" style={{ flex: 1 }}>{errorMessage}</span>
            {(errorMessage.toLowerCase().includes("key") || errorMessage.toLowerCase().includes("integrations")) && (
              <button
                type="button"
                className="chat-error-fix-btn"
                onClick={() => onNavigate("Integrations")}
                style={{
                  padding: "4px 10px",
                  background: "rgba(255,255,255,0.18)",
                  border: "1px solid rgba(255,255,255,0.32)",
                  borderRadius: "6px",
                  color: "#ffffff",
                  cursor: "pointer",
                  fontSize: "12px",
                  fontWeight: 600,
                  whiteSpace: "nowrap",
                }}
              >
                Open Integrations ↗
              </button>
            )}
          </div>
          <button
            type="button"
            className="chat-error-close-btn"
            aria-label="Dismiss error"
            title="Dismiss error"
            onClick={() => setErrorMessage(null)}
            style={{
              padding: "4px 8px",
              marginLeft: "8px",
              background: "transparent",
              border: "none",
              color: "inherit",
              cursor: "pointer",
              fontSize: "14px",
              opacity: 0.8,
            }}
          >
            ✕
          </button>
        </div>
      )}

      {/* INPUT FORM (with Provider/Model Selector and Slash Commands) */}
      <div className="ask-ai-input-bar">
        {/* PROVIDER SELECTOR & SLASH COMMANDS TOOLBAR (Step 5) */}
        <div className="ask-ai-input-controls-bar">
          <div className="provider-model-selector" title="Select AI provider for planning and assistance">
            <span className="selector-icon" aria-hidden="true">⚙</span>
            <select
              value={selectedProvider}
              onChange={(e) => setSelectedProvider(e.target.value)}
              className="select-provider-mini"
              aria-label="Active AI provider"
            >
              <option value="gemini">Gemini 2.5 Flash</option>
              <option value="groq">Groq Llama 3.3</option>
              <option value="ollama">Ollama (Local)</option>
              <option value="openrouter">OpenRouter Auto</option>
            </select>
          </div>
          <div className="slash-cmd-hints" aria-label="Available slash commands">
            <button
              type="button"
              className="hint-pill"
              onClick={() => onNavigate("Teach")}
              title="Demonstrate a task to synthesize a workflow"
            >
              /record
            </button>
            <button
              type="button"
              className="hint-pill"
              onClick={() => onNavigate("My Workflows")}
              title="Open workflows library & editor"
            >
              /workflows
            </button>
            <button
              type="button"
              className="hint-pill"
              onClick={() => onNavigate("Integrations")}
              title="Configure provider credentials"
            >
              /provider
            </button>
          </div>
        </div>

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
          <button type="button" className="ask-ai-attach-button ask-ai-attach-icon" onClick={() => fileInputRef.current?.click()} disabled={phase !== "idle" && phase !== "asking_question"} aria-label="Attach text or code file" title="Attach a file">📎</button>
          <textarea
            className="ask-ai-textarea"
            rows={1}
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
                e.preventDefault();
                handleSend();
              }
            }}
            placeholder="Type your message..."
            disabled={phase !== "idle" && phase !== "asking_question"}
          />
          <div className="ask-ai-form-actions">
            <VoiceInputButton
              onTranscript={(transcript) => {
                setInputText((prev) => (prev ? `${prev} ${transcript}` : transcript));
              }}
              disabled={phase !== "idle" && phase !== "asking_question"}
            />
            <button
              type="submit"
              className="btn-send-goal"
              aria-label={phase === "asking_question" ? "Send follow-up" : "Send message"}
              title={phase === "asking_question" ? "Send follow-up" : "Send message"}
              disabled={!inputText.trim() || (phase !== "idle" && phase !== "asking_question")}
            >
              <span aria-hidden="true">↗</span>
            </button>
            {phase === "streaming_response" && <button type="button" className="ask-ai-stop-button" onClick={handleCancelRequest}>Stop</button>}
          </div>
        </form>
        {/* Quick Action Pills (Reference Design) */}
        <div className="bottom-quick-pills-row" role="toolbar" aria-label="Quick actions">
          <button type="button" className="quick-pill-btn" onClick={() => fileInputRef.current?.click()}>
            <span aria-hidden="true">📎</span> Attach File
          </button>
          <button type="button" className="quick-pill-btn" onClick={() => onNavigate("Teach")}>
            <span aria-hidden="true">🎥</span> Record Task
          </button>
          <button type="button" className="quick-pill-btn" onClick={() => onNavigate("Agents")}>
            <span aria-hidden="true">👤</span> Choose Agent
          </button>
          <button type="button" className="quick-pill-btn" onClick={() => onNavigate("Templates")}>
            <span aria-hidden="true">🗂️</span> Browse Templates
          </button>
        </div>
      </div>
      </section>
      {previewOpen && artifacts.length > 0 && <>
        <div className="ask-ai-preview-resizer" role="separator" aria-label="Resize live preview" aria-orientation="vertical" aria-valuenow={Math.round(previewWidth)} tabIndex={0}
          onPointerDown={(event) => { event.preventDefault(); setDraggingPreview(true); }}
          onKeyDown={(event) => { if (event.key === "ArrowLeft") setPreviewWidth((width) => Math.min(780, width + 24)); if (event.key === "ArrowRight") setPreviewWidth((width) => Math.max(340, width - 24)); }} />
        <AskAIPreviewPanel artifacts={artifacts} selectedId={activeArtifactId} width={previewWidth} expanded={previewExpanded}
          onSelect={setActiveArtifactId} onResize={setPreviewWidth} onExpand={() => setPreviewExpanded((value) => !value)} onClose={() => setPreviewOpen(false)}
          onWorkflowChange={handleWorkflowPreviewChange}
          onOpenRun={() => onNavigate("Live Run")}
          liveAgUiTasks={agUiTasks}
          liveStepIndex={agUiStepIndex}
          liveProgress={agUiProgress}
          liveStatusText={agUiStatusText}
          isAgUiRunning={isAgUiRunning}
          liveInterrupt={agUiInterrupt}
          onApproveInterrupt={async (id) => {
            await respondToInterrupt(id, true);
            setAgUiInterrupt(null);
          }}
          onDenyInterrupt={async (id) => {
            await respondToInterrupt(id, false);
            setAgUiInterrupt(null);
          }}
        />
      </>}
      </div>
    </div>
  );
};
