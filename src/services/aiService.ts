import type { WorkflowDefinition, ClarificationQuestion, RiskLevel } from "../types";

export type MessageType =
  | "answer_only"
  | "action_proposal"
  | "clarification_request"
  | "system_notice";

export type ConversationMessage = {
  id: string;
  sender: "user" | "ai" | "system";
  text: string;
  timestamp: string;
  type: MessageType;
  clarification?: ClarificationQuestion;
  matchedWorkflow?: WorkflowDefinition;
  proposedPlan?: {
    workflow: WorkflowDefinition;
    estimatedSteps: number;
    risk: RiskLevel;
    summary: string;
  };
};

export type ConversationPhase =
  | "idle"
  | "understanding_request"
  | "asking_question"
  | "preparing_plan"
  | "ready_for_approval";

export interface AIServiceContext {
  savedWorkflows: WorkflowDefinition[];
  history: ConversationMessage[];
  signal?: AbortSignal;
}

export interface AIService {
  processGoal(goal: string, context: AIServiceContext): Promise<ConversationMessage>;
  resolveClarification(
    questionId: string,
    answer: string,
    context: AIServiceContext
  ): Promise<ConversationMessage>;
}

export class MockAIService implements AIService {
  private delay(ms: number, signal?: AbortSignal): Promise<void> {
    return new Promise((resolve, reject) => {
      if (signal?.aborted) {
        return reject(new DOMException("Aborted", "AbortError"));
      }
      const timeout = setTimeout(() => {
        resolve();
      }, ms);
      if (signal) {
        signal.addEventListener("abort", () => {
          clearTimeout(timeout);
          reject(new DOMException("Aborted", "AbortError"));
        });
      }
    });
  }

  async processGoal(goal: string, context: AIServiceContext): Promise<ConversationMessage> {
    const trimmed = goal.trim();
    if (!trimmed) {
      throw new Error("Goal cannot be empty.");
    }

    // Simulate understanding delay with abort signal support
    await this.delay(400, context.signal);

    const lower = trimmed.toLowerCase();

    // 1. INFORMATIONAL QUERY (Answering only — NO computer actions proposed)
    const isInfoQuery =
      lower.includes("what can you do") ||
      lower.includes("how do you work") ||
      lower.includes("what is safe mode") ||
      lower.includes("explain policy") ||
      lower.includes("who are you") ||
      lower.startsWith("help");

    if (isInfoQuery) {
      return {
        id: `msg_ai_${Date.now().toString(36)}`,
        sender: "ai",
        timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
        type: "answer_only",
        text:
          "I am WhistleCode, your desktop workflow learning agent. I observe user demonstrations, synthesize reusable workflows, enforce strict zero-LLM security policies, and require explicit approval before performing any consequential actions.\n\n" +
          "ℹ️ Informational response: No computer actions or file changes were proposed or executed.",
      };
    }

    // 2. CHECK IF GOAL MATCHES A SAVED WORKFLOW
    const matched = context.savedWorkflows.find((wf) => {
      const titleLower = wf.title.toLowerCase();
      const intentLower = wf.intent.toLowerCase();
      return (
        (lower.includes("paper") && (titleLower.includes("paper") || intentLower.includes("paper"))) ||
        (lower.includes("price") && (titleLower.includes("price") || intentLower.includes("price"))) ||
        (lower.includes("customer") && (titleLower.includes("customer") || intentLower.includes("customer"))) ||
        (lower.includes("restaurant") && (titleLower.includes("restaurant") || intentLower.includes("restaurant")))
      );
    });

    if (matched) {
      return {
        id: `msg_ai_${Date.now().toString(36)}`,
        sender: "ai",
        timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
        type: "action_proposal",
        text: `I identified an existing saved workflow that matches your goal: "${matched.title}" (v${matched.version}).\n\nWould you like to review and run this existing workflow, or propose modified parameters?`,
        matchedWorkflow: matched,
        proposedPlan: {
          workflow: matched,
          estimatedSteps: matched.steps.length,
          risk: matched.steps.some((s) => s.risk === "high") ? "high" : "medium",
          summary: `Reuses verified procedure "${matched.title}" with ${matched.steps.length} policy-checked steps.`,
        },
      };
    }

    // 3. AMBIGUOUS GOAL REQUIRING CLARIFICATION DIALOGUE
    if (lower.includes("restaurant") || lower.includes("food") || lower.includes("dinner")) {
      return {
        id: `msg_ai_${Date.now().toString(36)}`,
        sender: "ai",
        timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
        type: "clarification_request",
        text: "I can help find and book a dining reservation, but there are multiple criteria to rank candidates.",
        clarification: {
          id: "clarify_restaurant_sort",
          question: "How should I prioritize restaurant choices for this booking?",
          explanation: "Multiple candidate restaurants meet the general query; choosing requires knowing your primary ranking preference.",
          options: [
            "Rating (Highest rated >= 4.5 stars)",
            "Price (Budget / lowest tier $)",
            "Distance (Nearest location < 1.0 mi)",
            "Ask me to choose manually from top 3",
          ],
        },
      };
    }

    if (lower.includes("organize") || lower.includes("files") || lower.includes("download")) {
      return {
        id: `msg_ai_${Date.now().toString(36)}`,
        sender: "ai",
        timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
        type: "clarification_request",
        text: "I can organize your files into sandbox topic directories, but need to confirm the scope.",
        clarification: {
          id: "clarify_folder_scope",
          question: "Which folder should be scanned, and which file types should be organized?",
          explanation: "File movement operations require strict sandbox directory scoping and reversible undo tokens.",
          options: [
            "Test sandbox folder (PDF files only, non-destructive)",
            "Download folder (All document formats: PDF, DOCX, TXT)",
            "Review each file path individually before moving",
          ],
        },
      };
    }

    // 4. GENERAL AUTOMATION GOAL: PROPOSE COMPUTER ACTION PLAN
    // Note: NEVER claim action is executed; it is ONLY proposed and pending approval!
    const synthesizedWorkflow: WorkflowDefinition = {
      workflow_id: `wf_syn_${Date.now().toString(36)}`,
      title: `Automate: ${trimmed.slice(0, 42)}`,
      intent: trimmed,
      allowed_origins: ["http://localhost:8000"],
      parameters: [
        { name: "target_entity", type: "string", default_value: trimmed.slice(0, 20), required: true },
        { name: "max_items", type: "number", default_value: 10, required: false },
      ],
      steps: [
        {
          id: "s1",
          name: "Inspect permitted target application",
          action: "navigate",
          args: { url: "http://localhost:8000/testsite" },
          risk: "low",
          requires_confirmation: false,
          idempotent: true,
          preconditions: [],
          postconditions: [],
          enabled: true,
        },
        {
          id: "s2",
          name: "Extract element state & evaluate parameters",
          action: "type",
          args: { value: "{{target_entity}}" },
          risk: "medium",
          requires_confirmation: false,
          idempotent: true,
          preconditions: [],
          postconditions: [],
          enabled: true,
        },
        {
          id: "s3",
          name: "Submit action to target system",
          action: "submit",
          args: {},
          risk: "high",
          requires_confirmation: true,
          idempotent: false,
          preconditions: [],
          postconditions: [{ type: "element_exists", selector: ".alert-success" }],
          enabled: true,
        },
      ],
      final_postconditions: [{ type: "element_exists", selector: ".alert-success" }],
      version: 1,
      content_hash: `sha256:${Math.random().toString(16).slice(2)}`,
      change_summary: "Generated from natural language goal",
    };

    return {
      id: `msg_ai_${Date.now().toString(36)}`,
      sender: "ai",
      timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
      type: "action_proposal",
      text:
        `I prepared a step-by-step action plan to achieve your goal: "${trimmed}".\n\n` +
        "⚡ Notice: These actions are PROPOSED ONLY. No changes have been made to your computer or applications. You must review the scope and grant explicit approval before execution.",
      proposedPlan: {
        workflow: synthesizedWorkflow,
        estimatedSteps: synthesizedWorkflow.steps.length,
        risk: "high",
        summary: `3 steps proposed with high-risk submission gate at step 3.`,
      },
    };
  }

  async resolveClarification(
    questionId: string,
    answer: string,
    context: AIServiceContext
  ): Promise<ConversationMessage> {
    await this.delay(350, context.signal);

    const isRestaurant = questionId.includes("restaurant");
    const title = isRestaurant ? "Restaurant Booking Workflow" : "File Organizer Workflow";

    const synthesized: WorkflowDefinition = {
      workflow_id: `wf_clarified_${Date.now().toString(36)}`,
      title,
      intent: `Automated procedure with clarified constraint: ${answer}`,
      allowed_origins: ["http://localhost:8000"],
      parameters: isRestaurant
        ? [
            { name: "ranking_preference", type: "string", default_value: answer, required: true },
            { name: "party_size", type: "number", default_value: 2, required: true },
          ]
        : [
            { name: "scope_rule", type: "string", default_value: answer, required: true },
            { name: "sandbox_folder", type: "string", default_value: "sandbox_papers/", required: true },
          ],
      steps: [
        {
          id: "s1",
          name: "Initialize and filter candidates by constraint",
          action: "navigate",
          args: { filter: answer },
          risk: "low",
          requires_confirmation: false,
          idempotent: true,
          preconditions: [],
          postconditions: [],
          enabled: true,
        },
        {
          id: "s2",
          name: "Select verified candidate matching rule",
          action: "click",
          args: { rule: answer },
          risk: "medium",
          requires_confirmation: false,
          idempotent: true,
          preconditions: [],
          postconditions: [],
          enabled: true,
        },
        {
          id: "s3",
          name: "Dispatch action through confirmation gate",
          action: "submit",
          args: {},
          risk: "high",
          requires_confirmation: true,
          idempotent: false,
          preconditions: [],
          postconditions: [{ type: "element_exists", selector: ".alert-success" }],
          enabled: true,
        },
      ],
      final_postconditions: [{ type: "element_exists", selector: ".alert-success" }],
      version: 1,
      content_hash: `sha256:${Math.random().toString(16).slice(2)}`,
      change_summary: `Clarified parameter: ${answer}`,
    };

    return {
      id: `msg_ai_${Date.now().toString(36)}`,
      sender: "ai",
      timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
      type: "action_proposal",
      text:
        `Thank you. I updated the plan using your selection: "${answer}".\n\n` +
        "⚡ Notice: The plan is ready for review. Actions will NOT run until approved in Guarded Mode.",
      proposedPlan: {
        workflow: synthesized,
        estimatedSteps: synthesized.steps.length,
        risk: "high",
        summary: `Plan customized with constraint: ${answer}.`,
      },
    };
  }
}

// Export singleton instance
export const defaultAIService: AIService = new MockAIService();
