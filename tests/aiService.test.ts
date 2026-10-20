import test from "node:test";
import assert from "node:assert/strict";
import { MockAIService } from "../src/services/aiService.ts";
import type { WorkflowDefinition } from "../src/types.ts";

test("MockAIService - rejects empty input", async () => {
  const service = new MockAIService();
  await assert.rejects(
    async () => {
      await service.processGoal("   ", { savedWorkflows: [], history: [] });
    },
    {
      name: "Error",
      message: "Goal cannot be empty.",
    }
  );
});

test("MockAIService - supports cancellation via AbortSignal", async () => {
  const service = new MockAIService();
  const controller = new AbortController();

  const promise = service.processGoal("Organize my downloads", {
    savedWorkflows: [],
    history: [],
    signal: controller.signal,
  });

  // Cancel immediately
  controller.abort();

  await assert.rejects(
    async () => {
      await promise;
    },
    {
      name: "AbortError",
    }
  );
});

test("MockAIService - triggers clarifying question on ambiguous dining task", async () => {
  const service = new MockAIService();
  const res = await service.processGoal("Book a restaurant for dinner", {
    savedWorkflows: [],
    history: [],
  });

  assert.equal(res.sender, "ai");
  assert.equal(res.type, "clarification_request");
  assert.ok(res.clarification, "Expected clarification question object");
  assert.ok(
    res.clarification?.question.includes("prioritize restaurant choices"),
    "Expected restaurant ranking question"
  );
  assert.ok((res.clarification?.options?.length ?? 0) >= 3, "Expected multiple options");

  // Now resolve the clarification
  const resolved = await service.resolveClarification(
    res.clarification!.id,
    "Rating (Highest rated >= 4.5 stars)",
    { savedWorkflows: [], history: [res] }
  );

  assert.equal(resolved.sender, "ai");
  assert.equal(resolved.type, "action_proposal");
  assert.ok(resolved.proposedPlan, "Expected proposed plan after clarification");
  assert.ok(
    resolved.text.toLowerCase().includes("actions will not run until approved"),
    "Must explicitly warn actions are not yet executed"
  );
});

test("MockAIService - matches existing saved workflow", async () => {
  const service = new MockAIService();
  const savedWf: WorkflowDefinition = {
    workflow_id: "wf_saved_paper",
    title: "Research paper organizer",
    intent: "Organize AI research papers by conference topic",
    allowed_origins: ["http://localhost:8000"],
    parameters: [],
    steps: [
      {
        id: "s1",
        name: "Scan directory",
        action: "navigate",
        args: {},
        risk: "low",
        requires_confirmation: false,
        idempotent: true,
        preconditions: [],
        postconditions: [],
        enabled: true,
      },
    ],
    final_postconditions: [],
    version: 1,
    content_hash: "sha256:123456",
  };

  const res = await service.processGoal("Please organize my papers", {
    savedWorkflows: [savedWf],
    history: [],
  });

  assert.equal(res.sender, "ai");
  assert.equal(res.type, "action_proposal");
  assert.equal(res.matchedWorkflow?.workflow_id, "wf_saved_paper");
  assert.ok(res.text.includes("Research paper organizer"));
});

test("MockAIService - answer only query does not propose computer actions", async () => {
  const service = new MockAIService();
  const res = await service.processGoal("What can you do?", {
    savedWorkflows: [],
    history: [],
  });

  assert.equal(res.sender, "ai");
  assert.equal(res.type, "answer_only");
  assert.equal(res.proposedPlan, undefined, "Must not propose any plan for informational queries");
  assert.ok(res.text.includes("Informational response: No computer actions"));
});
