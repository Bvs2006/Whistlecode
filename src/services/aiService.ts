import type { WorkflowDefinition, ClarificationQuestion, RiskLevel } from "../types";
import { api } from "../api/client";

export type MessageType = "answer_only" | "action_proposal" | "clarification_request" | "system_notice";

export type ConversationMessage = {
  id: string;
  sender: "user" | "ai" | "system";
  text: string;
  timestamp: string;
  type: MessageType;
  artifactId?: string;
    feedback?: "up" | "down";
  clarification?: ClarificationQuestion;
  matchedWorkflow?: WorkflowDefinition;
  proposedPlan?: {
    workflow: WorkflowDefinition;
    estimatedSteps: number;
    risk: RiskLevel;
    summary: string;
  };
};

export type ConversationPhase = "idle" | "understanding_request" | "streaming_response" | "asking_question" | "preparing_plan" | "ready_for_approval";

export interface AIServiceContext {
  savedWorkflows: WorkflowDefinition[];
  history: ConversationMessage[];
  activeWorkflow?: WorkflowDefinition;
  skipWorkflowSearch?: boolean;
  signal?: AbortSignal;
}

export interface AIService {
  processGoal(goal: string, context: AIServiceContext): Promise<ConversationMessage>;
  resolveClarification(questionId: string, answer: string, context: AIServiceContext): Promise<ConversationMessage>;
}

const workflowRisk = (workflow: WorkflowDefinition): RiskLevel => {
  const risks = workflow.steps.filter((step) => step.enabled).map((step) => step.risk);
  if (risks.includes("critical")) return "critical";
  if (risks.includes("high")) return "high";
  if (risks.includes("medium")) return "medium";
  return "low";
};

class WorkflowAssistantService implements AIService {
  async processGoal(goal: string, context: AIServiceContext): Promise<ConversationMessage> {
    const trimmed = goal.trim();
    if (!trimmed) throw new Error("Enter a task to continue.");
    const lower = trimmed.toLowerCase();
    if (["what can you do", "how do you work", "who are you", "explain permissions", "how do approvals work", "how do workflow approvals work", "help"].some((phrase) => lower.includes(phrase))) {
      return {
        id: `msg_info_${Date.now().toString(36)}`,
        sender: "ai",
        timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
        type: "answer_only",
        text: "WhistleCode turns task descriptions and reviewed demonstrations into editable workflows. You can inspect each step, limit where it may run, approve sensitive actions, and review the activity history. No actions were proposed or run for this question.",
      };
    }
    const previousDraft = [...context.history].reverse().find((message) => message.proposedPlan)?.proposedPlan?.workflow;
    const activeIsNewer = Boolean(context.activeWorkflow && previousDraft
      && context.activeWorkflow.workflow_id === previousDraft.workflow_id
      && context.activeWorkflow.version > previousDraft.version);
    const candidateWorkflow = activeIsNewer ? context.activeWorkflow : previousDraft?.steps.length ? previousDraft : context.activeWorkflow;
    const explicitRevisionVerb = /\b(revise|edit|modify|update|change|adjust)\b/i.test(trimmed);
    const namesWorkflowPart = /\b(workflow|plan|step|action)\b/i.test(trimmed);
    const refersToCurrentWork = /\b(this|that|it|current|existing|previous|saved)\b/i.test(trimmed);
    const explicitlyRevising = Boolean(candidateWorkflow && (
      (explicitRevisionVerb && namesWorkflowPart) ||
      (/\b(add|remove|delete|rename|reorder|replace|make)\b/i.test(trimmed) && refersToCurrentWork)
    ));
    const currentWorkflow = explicitlyRevising ? candidateWorkflow : undefined;
    const search = currentWorkflow?.steps.length || context.skipWorkflowSearch
      ? { results: [] }
      : await api.searchWorkflows(trimmed, context.signal);
    const matched = (search.results || []).find((item: any) => item.relevance_score >= 5);
    if (matched) {
      const workflow = matched as WorkflowDefinition;
      return {
        id: `msg_match_${Date.now().toString(36)}`,
        sender: "ai",
        timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
        type: "action_proposal",
        text: `I found a saved workflow that may fit: “${workflow.title}”. Review it before continuing. No actions have been run.`,
        matchedWorkflow: workflow,
        proposedPlan: {
          workflow,
          estimatedSteps: workflow.steps.length,
          risk: workflowRisk(workflow),
          summary: `${workflow.steps.length} saved steps are ready for review.`,
        },
      };
    }
    const result = currentWorkflow?.steps.length
      ? await api.reviseWorkflow(currentWorkflow, trimmed, context.signal)
      : await api.proposeGoal(trimmed, context.signal);
    if (result.status === "clarification_needed" && result.clarifications?.length) {
      const clarification = result.clarifications[0] as ClarificationQuestion;
      return {
        id: `msg_clarify_${Date.now().toString(36)}`,
        sender: "ai",
        timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
        type: "clarification_request",
        text: result.message || "I need one detail before I can prepare the workflow draft.",
        clarification,
      };
    }
    const workflow = result.workflow as WorkflowDefinition | undefined;
    if (!workflow?.steps?.length) {
      throw new Error("No workflow draft was returned. Add the website and the result you want, then try again.");
    }
    return {
      id: `msg_draft_${Date.now().toString(36)}`,
      sender: "ai",
      timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
      type: "action_proposal",
      text: currentWorkflow?.steps.length
        ? `I prepared version ${workflow.version} of “${workflow.title}” from your request. Review the revised steps and scope before approval. Nothing has been run.`
        : `WhistleCode prepared a draft with ${workflow.steps.length} steps. Review the targets, actions, arguments, risk, and permissions before approval. No actions have been run.`,
      proposedPlan: {
        workflow,
        estimatedSteps: workflow.steps.length,
        risk: (result.risk as RiskLevel) || workflowRisk(workflow),
        summary: result.summary || `${workflow.steps.length} draft steps are ready for review.`,
      },
    };
  }

  async resolveClarification(_questionId: string, answer: string, context: AIServiceContext): Promise<ConversationMessage> {
    const clarification = [...context.history].reverse().find((message) => message.clarification?.id === _questionId)?.clarification;
    const userMessages = context.history.filter((message) => message.sender === "user").map((message) => message.text);
    const originalGoal = userMessages.find((text) => !text.startsWith("Selected preference:")) || "Create a workflow plan";
    const previousAnswers = userMessages.filter((text) => text.startsWith("Selected preference:"));
    const resolved = [
      ...previousAnswers,
      `Question: ${clarification?.question || "Clarification"}\nAnswer: ${answer}`,
    ];
    const clarifiedGoal = `${originalGoal}\n\nResolved clarification answers (use these decisions; do not ask them again):\n${resolved.join("\n")}`;
    return this.processGoal(clarifiedGoal, { ...context, skipWorkflowSearch: true });
  }
}

export const defaultAIService: AIService = new WorkflowAssistantService();
