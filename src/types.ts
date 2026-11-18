export type NavItem = {
  label: string;
  icon: string;
};

export type AppSection =
  | "Overview"
  | "Workspace"
  | "Ask AI"
  | "Templates"
  | "Agents"
  | "Discover"
  | "Teach"
  | "Automations"
  | "Skills & Memory"
  | "Artifacts"
  | "Teach a Task"
  | "Recording Studio"
  | "My Workflows"
  | "Permissions"
  | "Governance"
  | "Live Run"
  | "Activity"
  | "Integrations"
  | "Dashboard"
  | "Run Monitor"
  | "Execution History"
  | "Approval & Scope"
  | "Activity & Audit"
  | "Plugins & Tools"
  | "Settings";

export type Workflow = {
  name: string;
  description: string;
  steps: number;
  lastUsed: string;
  accent: "violet" | "blue" | "orange";
};

export type Observation = {
  time: string;
  title: string;
  detail: string;
  kind: "note" | "screen" | "click";
  isDemo: true;
};

export type ActionType =
  | "navigate"
  | "click"
  | "type"
  | "select"
  | "check"
  | "uncheck"
  | "wait_for"
  | "assert"
  | "extract"
  | "submit"
  | "confirm_gate"
  | "tool_call"
  | "branch";

export type RiskLevel = "low" | "medium" | "high" | "critical";

export type AgentState =
  | "Idle"
  | "Learning"
  | "Waiting for approval"
  | "Running"
  | "Completed"
  | "Failed"
  | "Needs help";

export type ActiveTask = {
  id: string;
  title: string;
  status: AgentState;
  progress: number;
  startedAt: string;
  workflowId: string;
  currentStep?: string;
  isSampleData?: boolean;
};

export type PendingApproval = {
  id: string;
  workflowId: string;
  workflowTitle: string;
  actionCount: number;
  risk: RiskLevel;
  scopeSummary: string;
  submittedAt: string;
  expiresInMinutes: number;
  isSampleData?: boolean;
};

export type TargetDescriptor = {
  role?: string;
  name?: string;
  test_id?: string;
  label?: string;
  text?: string;
  css_fallback?: string;
  context?: {
    within?: string;
    landmark?: string;
  };
  bounding_box?: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
  active_window?: string;
  min_confidence?: number;
};

export type Precondition = {
  type: string;
  target?: TargetDescriptor;
  value?: string;
  selector?: string;
};

export type Postcondition = {
  type: string;
  target?: TargetDescriptor;
  value?: string;
  selector?: string;
};

export type ParameterDefinition = {
  name: string;
  type: string;
  description?: string;
  default_value?: any;
  required: boolean;
};

export type Step = {
  id: string;
  name: string;
  action: ActionType;
  target?: TargetDescriptor;
  args: Record<string, any>;
  risk: RiskLevel;
  requires_confirmation: boolean;
  idempotent: boolean;
  preconditions: Precondition[];
  postconditions: Postcondition[];
  enabled: boolean;
  notes?: string;
  condition?: string;
  next_step_id?: string;
  branches?: Record<string, string>;
  plugin_id?: string;
  tool_name?: string;
  screenshot?: string;
  active_window?: string;
};

export type ClarificationQuestion = {
  id: string;
  step_id?: string;
  question: string;
  explanation?: string;
  options: string[];
  selected_option?: string;
  custom_answer?: string;
  context?: string;
};

export type WorkflowDefinition = {
  workflow_id: string;
  title: string;
  intent: string;
  allowed_origins: string[];
  parameters: ParameterDefinition[];
  steps: Step[];
  final_postconditions: Postcondition[];
  clarifications?: ClarificationQuestion[];
  version: number;
  content_hash: string;
  parent_version?: number;
  change_summary?: string;
  created_at?: string;
};

export type RecordedEvent = {
  id: string;
  recording_id: string;
  timestamp: number;
  type: string;
  url: string;
  target?: TargetDescriptor;
  value?: string;
  is_masked: boolean;
  screenshot?: string;
  active_window?: string;
  metadata?: Record<string, any>;
};

export type RecordingSession = {
  id: string;
  created_at: string;
  task_description: string;
  status: "active" | "paused" | "stopped";
  target_url: string;
  events: RecordedEvent[];
};

export type ApprovalRecord = {
  id: string;
  workflow_id: string;
  version: number;
  version_hash: string;
  scope: {
    allowed_origins: string[];
    allowed_action_types: string[];
    parameter_constraints: Record<string, any>;
    max_risk_level: string;
  };
  approver: string;
  created_at: string;
  expires_at: string;
  revoked_at?: string;
  signature: string;
};

export type StepExecutionResult = {
  step_id: string;
  action: string;
  target_summary?: string;
  decision: "ALLOW" | "REQUIRE_CONFIRMATION" | "DENY";
  reason_code: string;
  passed: boolean;
  observed_state?: Record<string, any>;
  error_message?: string;
  timestamp: number;
};

export type RunRecord = {
  id: string;
  workflow_id: string;
  version: number;
  version_hash: string;
  approval_id?: string;
  mode: "dry_run" | "test" | "run";
  parameters: Record<string, any>;
  state: string;
  verification_state?: "VERIFIED_SUCCESS" | "FAILED" | "UNCERTAIN";
  started_at: string;
  ended_at?: string;
  step_results: StepExecutionResult[];
  current_step_index: number;
  safe_stop_reason?: string;
};

export type AuditEntry = {
  id: number;
  timestamp: string;
  actor: string;
  event_type: string;
  workflow_id?: string;
  version_hash?: string;
  ref_ids: Record<string, any>;
  details: Record<string, any>;
  prev_hash: string;
  entry_hash: string;
};

export type PlanPreviewStep = {
  step_index: number;
  step_id: string;
  name: string;
  action: string;
  target_label: string;
  evaluated_args: Record<string, any>;
  expected_result: string;
  risk: RiskLevel;
  requires_confirmation: boolean;
  policy_decision: string;
  policy_reason: string;
};

export type PlanPreviewResponse = {
  workflow_id: string;
  title: string;
  content_hash: string;
  steps: PlanPreviewStep[];
  parameters: ParameterDefinition[];
  overall_risk: RiskLevel;
  is_approved: boolean;
  allowed_origins: string[];
};

export type ToolDefinition = {
  name: string;
  display_name: string;
  description: string;
  parameters_schema: Record<string, any>;
  risk_level: RiskLevel;
  requires_confirmation?: boolean;
};

export type PluginManifest = {
  id: string;
  name: string;
  version: string;
  description: string;
  author: string;
  enabled: boolean;
  icon: string;
  tools: ToolDefinition[];
  resource_types: string[];
  settings_schema?: Record<string, any>;
  settings?: Record<string, any>;
};

export type WorkflowSearchResult = {
  id: string;
  title: string;
  intent: string;
  parameters: ParameterDefinition[];
  steps: Step[];
  latest_version?: number;
  content_hash?: string;
  relevance_score: number;
  match_reasons: string[];
};
