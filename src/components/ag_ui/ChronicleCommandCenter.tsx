import React, { useState, useRef } from "react";
import type { WorkflowDefinition, ApprovalRecord } from "../../types";
import { runAgUiAgent, respondToInterrupt, AgUiTask, InterruptPayload } from "../../services/agUiStream";
import { LiveTaskBoard } from "./LiveTaskBoard";
import { DailyLogViewer } from "./DailyLogViewer";
import { VoiceInputButton } from "./VoiceInputButton";

interface Props {
  currentWorkflow: WorkflowDefinition;
  activeApproval: ApprovalRecord | null;
  savedWorkflows?: WorkflowDefinition[];
  onSelectWorkflow?: (wf: WorkflowDefinition) => void;
}

export const ChronicleCommandCenter: React.FC<Props> = ({
  currentWorkflow,
  activeApproval,
  savedWorkflows = [],
  onSelectWorkflow,
}) => {
  // Mobile tab state
  const [mobileTab, setMobileTab] = useState<"ask" | "tasks" | "logs">("tasks");

  // AG-UI Execution state
  const [isRunning, setIsRunning] = useState(false);
  const [tasks, setTasks] = useState<AgUiTask[]>(() =>
    currentWorkflow.steps.filter((s) => s.enabled).map((s, idx) => ({
      id: s.id || `s_${idx + 1}`,
      title: s.name,
      status: "pending",
      action: s.action,
      target: s.target?.name || s.target?.test_id || "Element",
      args: s.args || {},
      risk: s.risk,
      requires_approval: s.requires_confirmation || s.risk === "high" || s.risk === "critical",
    }))
  );
  const [currentStepIndex, setCurrentStepIndex] = useState(0);
  const [progressPercent, setProgressPercent] = useState(0);
  const [statusText, setStatusText] = useState("Ready");
  const [activeInterrupt, setActiveInterrupt] = useState<InterruptPayload | null>(null);
  const [lastLogRefresh, setLastLogRefresh] = useState(0);
  const [executionMode, setExecutionMode] = useState<"run" | "dry_run">("run");

  // Chat / Prompt state
  const [promptInput, setPromptInput] = useState("");
  const [chatMessages, setChatMessages] = useState<Array<{ sender: "user" | "agent"; text: string; time: string }>>([
    {
      sender: "agent",
      text: "👋 Welcome to the **Chronicle AG-UI Daily Task Agent**. Trigger tasks via text or voice, monitor live steps on the task board, and all completed actions will automatically be compiled into your Daily Text Log.",
      time: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
    },
  ]);

  const abortControllerRef = useRef<AbortController | null>(null);

  // Sync tasks when currentWorkflow changes
  React.useEffect(() => {
    if (!isRunning) {
      setTasks(
        currentWorkflow.steps.filter((s) => s.enabled).map((s, idx) => ({
          id: s.id || `s_${idx + 1}`,
          title: s.name,
          status: "pending",
          action: s.action,
          target: s.target?.name || s.target?.test_id || "Element",
          args: s.args || {},
          risk: s.risk,
          requires_approval: s.requires_confirmation || s.risk === "high" || s.risk === "critical",
        }))
      );
      setProgressPercent(0);
      setCurrentStepIndex(0);
    }
  }, [currentWorkflow, isRunning]);

  const addChatMessage = (sender: "user" | "agent", text: string) => {
    setChatMessages((prev) => [
      ...prev,
      {
        sender,
        text,
        time: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
      },
    ]);
  };

  const handleStartAgUiRun = async (overrideWorkflow?: WorkflowDefinition) => {
    const wf = overrideWorkflow || currentWorkflow;
    if (!wf.steps || wf.steps.length === 0) {
      alert("Please select or build a workflow with at least one step before running.");
      return;
    }

    setIsRunning(true);
    setStatusText("Initializing AG-UI stream...");
    setActiveInterrupt(null);
    setProgressPercent(0);
    setCurrentStepIndex(0);

    addChatMessage("user", `▶ Starting '${wf.title}' (${executionMode === "dry_run" ? "Dry Run" : "Live Execution"})`);

    const controller = new AbortController();
    abortControllerRef.current = controller;

    try {
      await runAgUiAgent(
        wf,
        {},
        activeApproval?.id,
        executionMode,
        {
          onRunStarted: (data) => {
            setStatusText(`Running (${data.total_steps} steps)`);
            addChatMessage("agent", `⚡ Connected to AG-UI SSE stream for **${data.workflow_title}**.`);
          },
          onStateDelta: (delta) => {
            if (delta.current_step !== undefined) {
              setCurrentStepIndex(delta.current_step);
            }
          },
          onActivitySnapshot: (updatedTasks, stepIndex, percent) => {
            setTasks(updatedTasks);
            setCurrentStepIndex(stepIndex);
            setProgressPercent(percent);
          },
          onToolCall: (data) => {
            setStatusText(`Executing: ${data.name}`);
          },
          onToolCallResult: (data) => {
            if (!data.success) {
              addChatMessage("agent", `⚠️ Step result error: ${data.error || "Failed"}`);
            }
          },
          onInterrupt: (interruptData) => {
            setActiveInterrupt(interruptData);
            setStatusText("Awaiting Human-in-the-Loop Approval");
            addChatMessage(
              "agent",
              `🛡️ **HITL Guardrail Paused**: Action \`${interruptData.action}\` on **${interruptData.target}** requires your approval.`
            );
            // Switch to tasks tab on mobile so user sees the approval drawer immediately
            setMobileTab("tasks");
          },
          onRunFinished: (data) => {
            setStatusText("Completed");
            setActiveInterrupt(null);
            setLastLogRefresh(Date.now());
            addChatMessage(
              "agent",
              `✅ **Run Finished (${data.status})**\nCompleted ${data.tasks_completed}/${data.total_tasks} steps.\n\nActions saved to **Daily Text Log** archive.`
            );
          },
          onError: (errMsg) => {
            setStatusText("Error");
            addChatMessage("agent", `❌ AG-UI Stream Error: ${errMsg}`);
          },
        },
        controller.signal
      );
    } catch (err: any) {
      if (err.name !== "AbortError") {
        setStatusText("Execution failed");
        addChatMessage("agent", `❌ Failed: ${err.message || "Unknown error"}`);
      }
    } finally {
      setIsRunning(false);
      abortControllerRef.current = null;
    }
  };

  const handleApproveInterrupt = async (interruptId: string) => {
    try {
      await respondToInterrupt(interruptId, true);
      setActiveInterrupt(null);
      setStatusText("Approval granted. Resuming...");
      addChatMessage("user", "✓ Approved action via Human-in-the-Loop guardrail.");
    } catch (e: any) {
      alert("Failed to submit approval: " + e.message);
    }
  };

  const handleDenyInterrupt = async (interruptId: string) => {
    try {
      await respondToInterrupt(interruptId, false);
      setActiveInterrupt(null);
      setStatusText("Action denied");
      addChatMessage("user", "✕ Denied action via Human-in-the-Loop guardrail.");
    } catch (e: any) {
      alert("Failed to deny action: " + e.message);
    }
  };

  const handleSendPrompt = () => {
    const text = promptInput.trim();
    if (!text) return;
    setPromptInput("");
    addChatMessage("user", text);

    // If matches a saved workflow or natural task, select and run
    const matched = savedWorkflows.find((w) =>
      w.title.toLowerCase().includes(text.toLowerCase()) ||
      text.toLowerCase().includes(w.title.toLowerCase())
    );

    if (matched) {
      onSelectWorkflow?.(matched);
      addChatMessage("agent", `Found matching workflow: **${matched.title}**. Running via AG-UI stream...`);
      handleStartAgUiRun(matched);
    } else {
      addChatMessage(
        "agent",
        `Received: "${text}". Running current workflow '**${currentWorkflow.title}**' with this objective.`
      );
      handleStartAgUiRun();
    }
  };

  return (
    <div className="chronicle-command-center">
      {/* Top Banner */}
      <div className="command-center-top-bar">
        <div className="command-center-branding">
          <h2>🌐 ChronicleAI Command Center</h2>
          <span className="protocol-badge">AG-UI Protocol · SSE Streaming</span>
        </div>

        {/* Workflow & Mode Selectors */}
        <div className="top-bar-controls">
          <div className="control-group">
            <label>Active Workflow:</label>
            <select
              value={currentWorkflow.workflow_id}
              onChange={(e) => {
                const selected = savedWorkflows.find((w) => w.workflow_id === e.target.value);
                if (selected) onSelectWorkflow?.(selected);
              }}
              disabled={isRunning}
            >
              <option value={currentWorkflow.workflow_id}>{currentWorkflow.title}</option>
              {savedWorkflows
                .filter((w) => w.workflow_id !== currentWorkflow.workflow_id)
                .map((w) => (
                  <option key={w.workflow_id} value={w.workflow_id}>
                    {w.title}
                  </option>
                ))}
            </select>
          </div>

          <div className="control-group">
            <label>Mode:</label>
            <select
              value={executionMode}
              onChange={(e) => setExecutionMode(e.target.value as any)}
              disabled={isRunning}
            >
              <option value="run">⚡ Live Run</option>
              <option value="dry_run">🛡️ Dry Run</option>
            </select>
          </div>

          <button
            type="button"
            className={`btn ${isRunning ? "btn-secondary" : "btn-primary"} run-trigger-btn`}
            onClick={() => (isRunning ? abortControllerRef.current?.abort() : handleStartAgUiRun())}
          >
            {isRunning ? "⏹ Stop Stream" : "▶ Start AG-UI Run"}
          </button>
        </div>
      </div>

      {/* Main 3-Column Workspace (>=1024px) / Tabbed View (<768px) */}
      <div className={`command-center-grid active-tab-${mobileTab}`}>
        {/* COLUMN 1: Prompt & Conversational Stream */}
        <div className="column column-chat card-panel">
          <div className="panel-header-row">
            <h3>💬 Conversational Agent</h3>
            <span className="model-pill">Ollama / AG-UI</span>
          </div>

          {/* Chat Messages Log */}
          <div className="chat-messages-scroll">
            {chatMessages.map((msg, i) => (
              <div key={i} className={`chat-bubble bubble-${msg.sender}`}>
                <div className="bubble-header">
                  <span className="bubble-author">{msg.sender === "user" ? "You" : "ChronicleAI"}</span>
                  <span className="bubble-time">{msg.time}</span>
                </div>
                <div className="bubble-body">{msg.text}</div>
              </div>
            ))}
          </div>

          {/* Prompt & Voice Input Row */}
          <div className="prompt-input-row">
            <input
              type="text"
              className="chat-input"
              placeholder="Type a daily task or click mic to speak..."
              value={promptInput}
              onChange={(e) => setPromptInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleSendPrompt()}
              disabled={isRunning}
            />
            {/* Voice Input Web Speech API button */}
            <VoiceInputButton
              onTranscript={(transcript) => {
                setPromptInput(transcript);
                addChatMessage("user", `🎙️ Voice: "${transcript}"`);
                handleStartAgUiRun();
              }}
              disabled={isRunning}
            />
            <button
              type="button"
              className="btn btn-primary btn-send"
              onClick={handleSendPrompt}
              disabled={isRunning || !promptInput.trim()}
            >
              Send
            </button>
          </div>
        </div>

        {/* COLUMN 2: Live AG-UI Task Board */}
        <div className="column column-tasks">
          <LiveTaskBoard
            tasks={tasks}
            currentStepIndex={currentStepIndex}
            progressPercent={progressPercent}
            isRunning={isRunning}
            statusText={statusText}
            interrupt={activeInterrupt}
            onApproveInterrupt={handleApproveInterrupt}
            onDenyInterrupt={handleDenyInterrupt}
          />
        </div>

        {/* COLUMN 3: Daily Text Log Viewer */}
        <div className="column column-logs">
          <DailyLogViewer lastLogRefreshTrigger={lastLogRefresh} />
        </div>
      </div>

      {/* Mobile Bottom Navigation Bar (<768px) */}
      <nav className="mobile-bottom-tabs" aria-label="Mobile navigation">
        <button
          type="button"
          className={`mobile-tab-btn ${mobileTab === "ask" ? "active" : ""}`}
          onClick={() => setMobileTab("ask")}
        >
          <span className="tab-icon">💬</span>
          <span className="tab-label">Ask / Voice</span>
        </button>

        <button
          type="button"
          className={`mobile-tab-btn ${mobileTab === "tasks" ? "active" : ""}`}
          onClick={() => setMobileTab("tasks")}
        >
          <span className="tab-icon">⚡</span>
          <span className="tab-label">Live Tasks</span>
          {activeInterrupt && <span className="tab-alert-dot" />}
        </button>

        <button
          type="button"
          className={`mobile-tab-btn ${mobileTab === "logs" ? "active" : ""}`}
          onClick={() => setMobileTab("logs")}
        >
          <span className="tab-icon">📜</span>
          <span className="tab-label">Saved Logs</span>
        </button>
      </nav>
    </div>
  );
};
