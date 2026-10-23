import React from "react";
import type { WorkflowDefinition, ApprovalRecord, AppSection } from "../../types";
import { RunMonitor } from "../execution/RunMonitor";

type Props = {
  workflow: WorkflowDefinition;
  approval: ApprovalRecord | null;
  onNavigateToAudit: () => void;
  onNavigate?: (section: AppSection) => void;
};

export const LiveRunView: React.FC<Props> = ({ workflow, approval, onNavigateToAudit }) => (
  <RunMonitor workflow={workflow} approval={approval} onNavigateToAudit={onNavigateToAudit} />
);
