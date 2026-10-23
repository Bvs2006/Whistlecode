import { useState } from "react";
import { Header } from "./components/Header";
import { Sidebar } from "./components/Sidebar";
import { AskAIView } from "./components/views/AskAIView";
import { OverviewView } from "./components/views/OverviewView";
import { RecordingStudio } from "./components/recording/RecordingStudio";
import { WorkflowBuilderView } from "./components/views/WorkflowBuilderView";
import { PlanApprovalView } from "./components/views/PlanApprovalView";
import { LiveRunView } from "./components/views/LiveRunView";
import { PluginManagerView } from "./components/plugins/PluginManagerView";
import { AuditTrailViewer } from "./components/audit/AuditTrailViewer";
import type { AppSection, WorkflowDefinition, ApprovalRecord } from "./types";
import { LandingPage } from "./components/LandingPage";
import { PaperOrganizerSandboxView } from "./components/views/PaperOrganizerSandboxView";

const createEmptyWorkflow = (): WorkflowDefinition => ({
  workflow_id: `wf_${crypto.randomUUID()}`,
  title: "Untitled workflow",
  intent: "",
  allowed_origins: [],
  parameters: [],
  steps: [],
  final_postconditions: [],
  version: 1,
  content_hash: "",
  change_summary: "New workflow draft",
});

export function App() {
  const [activeSection, setActiveSection] = useState<AppSection>("Overview");
  const [initialGoal, setInitialGoal] = useState("");
  const [currentWorkflow, setCurrentWorkflow] = useState<WorkflowDefinition>(createEmptyWorkflow);
  const [activeApproval, setActiveApproval] = useState<ApprovalRecord | null>(null);
  const [showWorkspace, setShowWorkspace] = useState(false);

  const handleWorkflowGenerated = (wf: WorkflowDefinition) => {
    setCurrentWorkflow(wf);
    setActiveApproval(null);
    setActiveSection("My Workflows");
    setInitialGoal("");
  };

  const handleWorkflowSaved = (wf: WorkflowDefinition) => {
    setCurrentWorkflow(wf);
    setActiveApproval(null);
  };

  const handleWorkflowDraftUpdated = (wf: WorkflowDefinition) => {
    setCurrentWorkflow(wf);
    setActiveApproval(null);
  };

  const handleNavigate = (sec: AppSection) => {
    setActiveSection(sec);
  };

  if (!showWorkspace) return <LandingPage onLaunch={() => setShowWorkspace(true)} />;

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
            onAskGoal={(goal) => { setInitialGoal(goal); setActiveSection("Ask AI"); }}
            onSelectWorkflow={(wf) => {
              setCurrentWorkflow(wf);
              setActiveApproval(null);
              setActiveSection("My Workflows");
            }}
          />
        )}

        {/* 2. IMAGE 2: TEACH A TASK */}
        {activeSection === "Teach a Task" && (
          <RecordingStudio onWorkflowGenerated={handleWorkflowGenerated} />
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
            onApprovalRevoked={() => setActiveApproval(null)}
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
        {activeSection === "Test Site Sandbox" && <PaperOrganizerSandboxView />}

        {/* ASK AI — GENERAL TASK AGENT */}
        {activeSection === "Ask AI" && (
          <AskAIView
            onNavigate={handleNavigate}
            onWorkflowGenerated={handleWorkflowGenerated}
            onWorkflowUpdated={handleWorkflowDraftUpdated}
            initialPrompt={initialGoal}
            activeWorkflow={currentWorkflow.steps.length ? currentWorkflow : undefined}
            activeApproval={activeApproval}
          />
        )}
      </main>
    </div>
  );
}

export default App;
