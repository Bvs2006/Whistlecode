import { useState } from "react";
import { Header } from "./components/Header";
import { Sidebar } from "./components/Sidebar";
import { AskAIView } from "./components/views/AskAIView";
import { OverviewView } from "./components/views/OverviewView";
import { TeachTaskView } from "./components/views/TeachTaskView";
import { WorkflowBuilderView } from "./components/views/WorkflowBuilderView";
import { PlanApprovalView } from "./components/views/PlanApprovalView";
import { LiveRunView } from "./components/views/LiveRunView";
import { PluginManagerView } from "./components/plugins/PluginManagerView";
import { AuditTrailViewer } from "./components/audit/AuditTrailViewer";
import type { AppSection, WorkflowDefinition, ApprovalRecord } from "./types";

const DEFAULT_WORKFLOW: WorkflowDefinition = {
  workflow_id: "wf_create_customer",
  title: "Support Ticket Automation & Customer Portal",
  intent: "Observe and execute support ticket routing, customer profile registration, and restaurant booking",
  allowed_origins: ["http://localhost:8000", "http://127.0.0.1:8000"],
  parameters: [
    { name: "customer_name", type: "string", default_value: "John Smith", required: true },
    { name: "customer_email", type: "string", default_value: "john@example.com", required: true },
    { name: "urgency", type: "string", default_value: "HIGH", required: true },
    { name: "min_rating", type: "number", default_value: 4.5, required: true },
  ],
  steps: [
    {
      id: "s1",
      name: "Navigate to Customer Portal",
      action: "navigate",
      args: { url: "http://localhost:8000/testsite#customers" },
      risk: "low",
      requires_confirmation: false,
      idempotent: true,
      preconditions: [],
      postconditions: [{ type: "url_matches", value: "testsite" }],
      enabled: true,
      next_step_id: "s2",
    },
    {
      id: "s2",
      name: "Enter Customer Name",
      action: "type",
      target: { test_id: "customer-name-input", role: "textbox", name: "Customer Full Name" },
      args: { value: "{{customer_name}}" },
      risk: "medium",
      requires_confirmation: false,
      idempotent: true,
      preconditions: [],
      postconditions: [{ type: "field_value_equals", selector: "customer-name-input", value: "{{customer_name}}" }],
      enabled: true,
      next_step_id: "s3",
    },
    {
      id: "s3",
      name: "Enter Customer Email",
      action: "type",
      target: { test_id: "customer-email-input", role: "textbox", name: "Email Address" },
      args: { value: "{{customer_email}}" },
      risk: "medium",
      requires_confirmation: false,
      idempotent: true,
      preconditions: [],
      postconditions: [],
      enabled: true,
      next_step_id: "s4",
    },
    {
      id: "s4",
      name: "Submit Registration Form",
      action: "submit",
      target: { test_id: "btn-save-customer", role: "button", name: "Save Customer" },
      args: {},
      risk: "high",
      requires_confirmation: true,
      idempotent: false,
      preconditions: [],
      postconditions: [{ type: "element_exists", selector: ".alert-success" }],
      enabled: true,
    },
  ],
  final_postconditions: [
    { type: "element_exists", selector: ".alert-success" }
  ],
  version: 1,
  content_hash: "sha256:d8a9e0f391b19a3b68f94d930219c1b3f021938b8120391c01b239481923ab91",
  change_summary: "Initial verified benchmark workflow",
};

export function App() {
  const [activeSection, setActiveSection] = useState<AppSection>("Overview");
  const [currentWorkflow, setCurrentWorkflow] = useState<WorkflowDefinition>(DEFAULT_WORKFLOW);
  const [activeApproval, setActiveApproval] = useState<ApprovalRecord | null>(null);

  const handleWorkflowGenerated = (wf: WorkflowDefinition) => {
    setCurrentWorkflow(wf);
    setActiveApproval(null);
    setActiveSection("My Workflows");
  };

  const handleWorkflowSaved = (wf: WorkflowDefinition) => {
    setCurrentWorkflow(wf);
    setActiveApproval(null);
  };

  const handleNavigate = (sec: AppSection) => {
    setActiveSection(sec);
  };

  return (
    <div className="app-shell">
      {/* 1. LEFT SIDEBAR (Image 1 style) */}
      <Sidebar
        activeSection={activeSection}
        onNavigate={handleNavigate}
      />

      {/* 2. MAIN VIEWPORT */}
      <main className="main-viewport">
        {/* Sleek 10-Stage Lifecycle Ribbon */}
        <Header
          activeSection={activeSection}
          onNavigateSection={handleNavigate}
        />

        {/* 1. IMAGE 1: OVERVIEW */}
        {activeSection === "Overview" && (
          <OverviewView
            onNavigate={handleNavigate}
            onSelectWorkflow={(wf) => {
              setCurrentWorkflow(wf);
              setActiveSection("My Workflows");
            }}
          />
        )}

        {/* 2. IMAGE 2: TEACH A TASK */}
        {activeSection === "Teach a Task" && (
          <TeachTaskView
            onWorkflowGenerated={handleWorkflowGenerated}
            onNavigate={handleNavigate}
          />
        )}

        {/* 3. IMAGE 3: WORKFLOW BUILDER */}
        {activeSection === "My Workflows" && (
          <WorkflowBuilderView
            workflow={currentWorkflow}
            onWorkflowSaved={handleWorkflowSaved}
            onNavigateToPreview={() => setActiveSection("Permissions")}
            onNavigate={handleNavigate}
          />
        )}

        {/* 4. IMAGE 4: PLAN AND APPROVAL (Human Override) */}
        {activeSection === "Permissions" && (
          <PlanApprovalView
            workflow={currentWorkflow}
            approval={activeApproval}
            onApprovalCreated={(appr) => setActiveApproval(appr)}
            onNavigateToLiveRun={() => setActiveSection("Live Run")}
            onNavigate={handleNavigate}
          />
        )}

        {/* 5. IMAGE 5: LIVE RUN (UiPath Automation Cloud style) */}
        {activeSection === "Live Run" && (
          <LiveRunView
            workflow={currentWorkflow}
            approval={activeApproval}
            onNavigateToAudit={() => setActiveSection("Activity")}
            onNavigate={handleNavigate}
          />
        )}

        {/* 6. IMAGE 6: ACTIVITY & IMPROVEMENT */}
        {activeSection === "Activity" && (
          <AuditTrailViewer />
        )}

        {/* SETTINGS / PLUGINS */}
        {activeSection === "Settings" && (
          <PluginManagerView />
        )}

        {/* ASK AI — GENERAL TASK AGENT */}
        {activeSection === "Ask AI" && (
          <AskAIView
            onNavigate={handleNavigate}
            onWorkflowGenerated={handleWorkflowGenerated}
          />
        )}
      </main>
    </div>
  );
}

export default App;
