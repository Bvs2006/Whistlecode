import type { WorkflowDefinition } from "../types";

export type AgUiEventType =
  | "RUN_STARTED"
  | "RUN_FINISHED"
  | "RUN_ERROR"
  | "TEXT_MESSAGE_START"
  | "TEXT_MESSAGE_CONTENT"
  | "TEXT_MESSAGE_END"
  | "TOOL_CALL_START"
  | "TOOL_CALL_ARGS"
  | "TOOL_CALL_END"
  | "TOOL_CALL_RESULT"
  | "TOOL_CALL"
  | "STATE_SNAPSHOT"
  | "STATE_DELTA"
  | "ACTIVITY_SNAPSHOT"
  | "ACTIVITY_DELTA"
  | "STEP_STARTED"
  | "STEP_FINISHED"
  | "INTERRUPT";

export type TaskStatus =
  | "pending"
  | "in_progress"
  | "completed"
  | "failed"
  | "awaiting_approval"
  | "skipped";

export interface AgUiTask {
  id: string;
  title: string;
  status: TaskStatus;
  action: string;
  target?: string;
  args?: Record<string, any>;
  risk: string;
  requires_approval: boolean;
  result?: string;
  error?: string;
  started_at?: string;
  completed_at?: string;
}

export interface InterruptPayload {
  interrupt_id: string;
  task_id: string;
  step_index: number;
  action: string;
  target: string;
  risk: string;
  message: string;
  evaluated_args: Record<string, any>;
}

export interface RunFinishedPayload {
  status: "completed" | "failed" | "stopped";
  tasks_completed: number;
  total_tasks: number;
  summary_text: string;
  log_file_path?: string;
}

export interface AgUiStreamCallbacks {
  onRunStarted?: (data: { run_id: string; workflow_title: string; total_steps: number; mode: string }) => void;
  onTextMessageStart?: (data: { message_id: string; role: string }) => void;
  onTextMessageContent?: (delta: string, message_id?: string) => void;
  onTextMessageEnd?: (data: { message_id: string }) => void;
  onStateSnapshot?: (state: Record<string, any>) => void;
  onStateDelta?: (delta: Record<string, any>) => void;
  onActivitySnapshot?: (tasks: AgUiTask[], currentStepIndex: number, progressPercent: number) => void;
  onActivityDelta?: (data: { task_id: string; status: TaskStatus; progress_percent?: number }) => void;
  onStepStarted?: (data: { step_id: string; step_index: number; name: string; action: string }) => void;
  onStepFinished?: (data: { step_id: string; step_index: number; success: boolean; output?: string; error?: string }) => void;
  onToolCallStart?: (data: { tool_call_id: string; tool_name: string; action: string; target?: string; risk: string }) => void;
  onToolCallArgs?: (data: { tool_call_id: string; delta: string }) => void;
  onToolCallEnd?: (data: { tool_call_id: string; tool_name: string; args: Record<string, any> }) => void;
  onToolCallResult?: (data: { task_id: string; tool_call_id?: string; success: boolean; output?: string; error?: string }) => void;
  onToolCall?: (data: { task_id: string; step_index: number; name: string; action: string; risk: string }) => void;
  onInterrupt?: (data: InterruptPayload) => void;
  onRunFinished?: (data: RunFinishedPayload) => void;
  onError?: (error: string) => void;
}

async function parseSseStream(response: Response, callbacks: AgUiStreamCallbacks): Promise<void> {
  const reader = response.body?.getReader();
  if (!reader) throw new Error("Streaming response body unavailable.");

  const decoder = new TextDecoder("utf-8");
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const blocks = buffer.split("\n\n");
    buffer = blocks.pop() || "";

    for (const block of blocks) {
      if (!block.trim()) continue;

      let eventType = "";
      let eventDataStr = "";

      for (const line of block.split("\n")) {
        if (line.startsWith("event: ")) {
          eventType = line.slice(7).trim();
        } else if (line.startsWith("data: ")) {
          eventDataStr = line.slice(6).trim();
        }
      }

      if (!eventDataStr) continue;

      try {
        const payload = JSON.parse(eventDataStr);
        const type = (eventType || payload.type) as AgUiEventType;

        switch (type) {
          case "RUN_STARTED":
            callbacks.onRunStarted?.(payload);
            break;
          case "TEXT_MESSAGE_START":
            callbacks.onTextMessageStart?.(payload);
            break;
          case "TEXT_MESSAGE_CONTENT":
            callbacks.onTextMessageContent?.(payload.delta, payload.message_id);
            break;
          case "TEXT_MESSAGE_END":
            callbacks.onTextMessageEnd?.(payload);
            break;
          case "STATE_SNAPSHOT":
            callbacks.onStateSnapshot?.(payload.state);
            break;
          case "STATE_DELTA":
            callbacks.onStateDelta?.(payload.delta);
            break;
          case "ACTIVITY_SNAPSHOT":
            callbacks.onActivitySnapshot?.(
              payload.tasks || [],
              payload.current_step_index ?? 0,
              payload.progress_percent ?? 0
            );
            break;
          case "ACTIVITY_DELTA":
            callbacks.onActivityDelta?.(payload);
            break;
          case "STEP_STARTED":
            callbacks.onStepStarted?.(payload);
            break;
          case "STEP_FINISHED":
            callbacks.onStepFinished?.(payload);
            break;
          case "TOOL_CALL_START":
            callbacks.onToolCallStart?.(payload);
            break;
          case "TOOL_CALL_ARGS":
            callbacks.onToolCallArgs?.(payload);
            break;
          case "TOOL_CALL_END":
            callbacks.onToolCallEnd?.(payload);
            break;
          case "TOOL_CALL_RESULT":
            callbacks.onToolCallResult?.(payload);
            break;
          case "TOOL_CALL":
            callbacks.onToolCall?.(payload);
            break;
          case "INTERRUPT":
            callbacks.onInterrupt?.(payload);
            break;
          case "RUN_FINISHED":
            callbacks.onRunFinished?.(payload);
            break;
          case "RUN_ERROR":
            callbacks.onError?.(payload.message || "An error occurred during execution.");
            break;
          default:
            break;
        }
      } catch (parseErr) {
        console.warn("Failed to parse AG-UI SSE event:", parseErr, eventDataStr);
      }
    }
  }
}

export async function runAgUiAgent(
  workflow: WorkflowDefinition,
  parameters: Record<string, any> = {},
  approvalId?: string | null,
  mode: "dry_run" | "test" | "run" = "run",
  callbacks: AgUiStreamCallbacks = {},
  signal?: AbortSignal
): Promise<void> {
  const response = await fetch("/api/ag-ui/run", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      workflow,
      parameters,
      approval_id: approvalId,
      mode,
    }),
    signal,
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Failed to start AG-UI agent: ${errText || response.statusText}`);
  }

  await parseSseStream(response, callbacks);
}

export async function streamAgUiAssistant(
  message: string,
  history: Array<{ role: string; content: string }> = [],
  workflow?: WorkflowDefinition | null,
  parameters: Record<string, any> = {},
  approvalId?: string | null,
  mode: "dry_run" | "test" | "run" = "run",
  executeActions: boolean = false,
  callbacks: AgUiStreamCallbacks = {},
  signal?: AbortSignal
): Promise<void> {
  const response = await fetch("/api/ag-ui/chat/stream", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      message,
      history,
      workflow: workflow || null,
      parameters,
      approval_id: approvalId,
      mode,
      execute_actions: executeActions,
    }),
    signal,
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Failed to connect to AG-UI assistant stream: ${errText || response.statusText}`);
  }

  await parseSseStream(response, callbacks);
}

export async function respondToInterrupt(interruptId: string, grant: boolean): Promise<void> {
  const response = await fetch("/api/ag-ui/interrupt/respond", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ interrupt_id: interruptId, grant }),
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Failed to submit approval: ${errText || response.statusText}`);
  }
}
