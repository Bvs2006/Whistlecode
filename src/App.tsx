import { useEffect, useState } from "react";
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
import { ArtifactsView } from "./components/views/ArtifactsView";
import { ChronicleCommandCenter } from "./components/ag_ui/ChronicleCommandCenter";
import { AgentStudioView } from "./components/agents/AgentStudioView";
import { SkillsAndMemoryView } from "./components/skills/SkillsAndMemoryView";
import { IntegrationHubView } from "./components/integrations/IntegrationHubView";
import { AutomationsView } from "./components/automations/AutomationsView";
import { UnifiedActivityCenter } from "./components/activity/UnifiedActivityCenter";
import { WorkflowTemplatesView } from "./components/templates/WorkflowTemplatesView";
import { SettingsView } from "./components/views/SettingsView";
import { api } from "./api/client";

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

type AskAICommand =
  | { kind: "new-chat"; id: number }
  | { kind: "open-thread"; threadId: string; id: number };
type AskAIAction = { kind: "new-chat" } | { kind: "open-thread"; threadId: string };

export function App() {
  const [activeSection, setActiveSection] = useState<AppSection>("Ask AI");
  const [initialGoal, setInitialGoal] = useState("");
  const [currentWorkflow, setCurrentWorkflow] = useState<WorkflowDefinition>(createEmptyWorkflow);
  const [activeApproval, setActiveApproval] = useState<ApprovalRecord | null>(null);
  const [showWorkspace, setShowWorkspace] = useState(false);
  const [recordingPreset, setRecordingPreset] = useState<{ url: string; description: string } | null>(null);
  const [askAICommand, setAskAICommand] = useState<AskAICommand | null>(null);
  const [savedWorkflows, setSavedWorkflows] = useState<WorkflowDefinition[]>([]);

  useEffect(() => {
    document.documentElement.dataset.theme = "light";
  }, []);

  useEffect(() => {
    if (!showWorkspace) return;
    let active = true;
    api.listWorkflows()
      .then((response) => {
        if (active) setSavedWorkflows((response.workflows || []).map((item: any) => item.latest_data).filter(Boolean));
      })
      .catch(() => {
        if (active) setSavedWorkflows([]);
      });
    return () => { active = false; };
  }, [showWorkspace]);

  const handleWorkflowGenerated = (wf: WorkflowDefinition) => {
    setCurrentWorkflow(wf);
    setActiveApproval(null);
    setActiveSection("My Workflows");
    setInitialGoal("");
    setRecordingPreset(null);
  };

  const handleWorkflowSaved = (wf: WorkflowDefinition) => {
    setCurrentWorkflow(wf);
    setActiveApproval(null);
    setSavedWorkflows((current) => [wf, ...current.filter((item) => item.workflow_id !== wf.workflow_id)]);
  };

  const handleWorkflowDraftUpdated = (wf: WorkflowDefinition) => {
    setCurrentWorkflow(wf);
    setActiveApproval(null);
  };

  const handleNavigate = (sec: AppSection) => {
    setActiveSection(sec);
  };

  const handleAskAIAction = (action: AskAIAction) => {
    setActiveSection("Ask AI");
    setAskAICommand((current) => ({ ...action, id: (current?.id || 0) + 1 }) as AskAICommand);
  };

  if (!showWorkspace) return <LandingPage onLaunch={(prompt) => {
    setInitialGoal(prompt || "");
    setActiveSection("Ask AI");
    setShowWorkspace(true);
  }} />;

  return (
    <div className="app-shell" data-theme="light">
      {/* 1. LEFT SIDEBAR (Image 1 style) */}
      <Sidebar
        activeSection={activeSection}
        onNavigate={handleNavigate}
        onAskAIAction={handleAskAIAction}
      />

      {/* 2. MAIN VIEWPORT */}
      <main className="main-viewport">
        {/* 1. WORKSPACE / OVERVIEW */}
        {(activeSection === "Overview" || activeSection === "Workspace") && (
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

        {/* WORKFLOW TEMPLATES (CADDI AI INSPIRED) */}
        {activeSection === "Templates" && (
          <WorkflowTemplatesView
            onUseTemplate={(wf) => {
              setCurrentWorkflow(wf);
              setActiveApproval(null);
              setActiveSection("My Workflows");
            }}
            onRecordDemonstration={(preset) => {
              setRecordingPreset(preset);
              setActiveSection("Teach");
            }}
            onNavigateSection={handleNavigate}
          />
        )}

        {/* AI AGENT STUDIO */}
        {activeSection === "Agents" && (
          <AgentStudioView
            onRunAgent={(agent) => {
              if (agent.workflow_plan) {
                setCurrentWorkflow(agent.workflow_plan);
                setActiveApproval(null);
                setActiveSection("Live Run");
              } else {
                setInitialGoal(`Run agent '${agent.name}': ${agent.description}`);
                setActiveSection("Ask AI");
              }
            }}
            onNavigateToAskAI={(prompt) => {
              setInitialGoal(prompt);
              setActiveSection("Ask AI");
            }}
          />
        )}

        {/* 2. TEACH A TASK / RECORDING STUDIO (PRESERVED) */}
        {(activeSection === "Teach a Task" || activeSection === "Teach" || activeSection === "Recording Studio") && (
          <RecordingStudio onWorkflowGenerated={handleWorkflowGenerated} initialPreset={recordingPreset} />
        )}

        {/* SKILLS & PERSISTENT MEMORY */}
        {activeSection === "Skills & Memory" && (
          <SkillsAndMemoryView />
        )}

        {/* TRIGGERS & AUTOMATIONS */}
        {activeSection === "Automations" && (
          <AutomationsView />
        )}

        {/* 3. DISCOVER / WORKFLOW BUILDER (PRESERVED) */}
        {(activeSection === "My Workflows" || activeSection === "Discover") && (
          <WorkflowBuilderView
            workflow={currentWorkflow}
            onWorkflowSaved={handleWorkflowSaved}
            onNavigateToPreview={() => setActiveSection("Permissions")}
            onNavigate={handleNavigate}
          />
        )}

        {/* 4. GOVERNANCE / PERMISSIONS / APPROVAL (PRESERVED) */}
        {(activeSection === "Permissions" || activeSection === "Governance" || activeSection === "Approval & Scope") && (
          <PlanApprovalView
            workflow={currentWorkflow}
            approval={activeApproval}
            onApprovalCreated={(appr) => setActiveApproval(appr)}
            onApprovalRevoked={() => setActiveApproval(null)}
            onNavigateToLiveRun={() => setActiveSection("Live Run")}
            onNavigate={handleNavigate}
          />
        )}

        {/* UNIFIED ACTIVITY CENTER */}
        {activeSection === "Execution History" && (
          <UnifiedActivityCenter
            onInspectRun={(runId) => setActiveSection("Live Run")}
            onNavigateSection={handleNavigate}
          />
        )}

        {/* 5. EXECUTION MONITOR / LIVE RUN (PRESERVED) */}
        {(activeSection === "Live Run" || activeSection === "Run Monitor") && (
          <LiveRunView
            workflow={currentWorkflow}
            approval={activeApproval}
            onNavigateToAudit={() => setActiveSection("Activity")}
            onNavigate={handleNavigate}
          />
        )}

        {/* 6. ACTIVITY & AUDIT TRAIL (PRESERVED) */}
        {(activeSection === "Activity" || activeSection === "Activity & Audit") && (
          <AuditTrailViewer />
        )}

        {/* INTEGRATION HUB */}
        {activeSection === "Integrations" && (
          <IntegrationHubView />
        )}

        {/* PLUGINS & TOOLS (PRESERVED) */}
        {activeSection === "Plugins & Tools" && (
          <PluginManagerView />
        )}

        {activeSection === "Artifacts" && (
          <ArtifactsView
            onStartRecording={(preset) => { setRecordingPreset(preset); setActiveSection("Teach a Task"); }}
            onNavigate={handleNavigate}
          />
        )}

        {activeSection === "Settings" && <SettingsView />}

        {/* ASK AI — GENERAL TASK AGENT */}
        {activeSection === "Ask AI" && (
          <AskAIView
            onNavigate={handleNavigate}
            onWorkflowGenerated={handleWorkflowGenerated}
            onWorkflowUpdated={handleWorkflowDraftUpdated}
            onApprovalUpdated={setActiveApproval}
            initialPrompt={initialGoal}
            savedWorkflows={savedWorkflows}
            activeWorkflow={currentWorkflow.steps.length ? currentWorkflow : undefined}
            activeApproval={activeApproval}
            onStartRecording={(preset) => {
              setRecordingPreset(preset);
              setActiveSection("Teach");
            }}
            sidebarCommand={askAICommand}
          />
        )}
      </main>
    </div>
  );
}

export default App;
