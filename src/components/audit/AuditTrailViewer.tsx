import React, { useState, useEffect } from "react";
import { api } from "../../api/client";
import type { AuditEntry } from "../../types";

const eventLabels: Record<string, string> = {
  AI_PLAN_PROPOSED: "Draft prepared",
  RUN_STARTED: "Run started",
  RUN_COMPLETED: "Run completed",
  RUN_FAILED: "Run stopped",
  APPROVAL_CREATED: "Plan approved",
  APPROVAL_REVOKED: "Approval revoked",
  APPROVAL_DENIED: "Approval declined",
  POLICY_EVALUATION: "Permission checked",
  WORKFLOW_SAVED: "Workflow saved",
  PLUGIN_TOOL_APPROVED: "Action approved",
  PLUGIN_TOOL_EXECUTED: "Action completed",
  PLUGIN_TOOL_FAILED: "Action failed",
};

const describeEvent = (entry: AuditEntry) => {
  const details = entry.details || {};
  const pieces: string[] = [];
  if (details.action) pieces.push(`Action: ${String(details.action).replaceAll("_", " ")}`);
  if (details.risk) pieces.push(`Risk: ${details.risk}`);
  if (details.mode) pieces.push(`Mode: ${String(details.mode).replaceAll("_", " ")}`);
  if (typeof details.success === "boolean") pieces.push(details.success ? "Completed successfully" : "Did not complete");
  if (details.steps_count) pieces.push(`${details.steps_count} steps`);
  if (details.expires_at) pieces.push(`Expires ${new Date(details.expires_at).toLocaleString()}`);
  return pieces.join(" · ") || "Recorded in activity history";
};

export const AuditTrailViewer: React.FC = () => {
  const [entries, setEntries] = useState<AuditEntry[]>([]);
  const [isChainValid, setIsChainValid] = useState<boolean | null>(null);
  const [loading, setLoading] = useState(false);

  const loadAudit = async () => {
    setLoading(true);
    try {
      const res = await api.getAuditTrail(50);
      setEntries(res.entries || []);
      setIsChainValid(res.is_chain_valid);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadAudit();
  }, []);

  return (
    <div className="card-panel">
      <div className="panel-header-row">
        <div>
          <h2>Activity history</h2>
          <p className="subtitle">
            Review workflow changes, approvals, and run decisions. Sensitive values are hidden from this history.
          </p>
        </div>
        <div className="header-status-group">
          {isChainValid !== null && (
            <span className={`badge-chain ${isChainValid ? "chain-valid" : "chain-broken"}`}>
              {isChainValid ? "✓ History verified" : "✕ History needs review"}
            </span>
          )}
          <button className="btn btn-secondary btn-sm" onClick={loadAudit} disabled={loading}>
            Refresh history
          </button>
        </div>
      </div>

      <div className="audit-table-wrapper">
        <table className="audit-table">
          <thead>
            <tr>
              <th>ID</th>
              <th>When</th>
              <th>By</th>
              <th>Activity</th>
              <th>Details</th>
            </tr>
          </thead>
          <tbody>
            {entries.length === 0 ? (
              <tr>
                <td colSpan={5} className="empty-state">
                  No audit entries recorded yet.
                </td>
              </tr>
            ) : (
              entries.map((entry) => (
                <tr key={entry.id}>
                  <td><strong>#{entry.id}</strong></td>
                  <td>
                    {new Date(entry.timestamp).toLocaleString()}
                  </td>
                  <td><span className={`actor-pill actor-${entry.actor}`}>{entry.actor === "user" ? "You" : "WhistleCode"}</span></td>
                  <td>{eventLabels[entry.event_type] || entry.event_type.toLowerCase().replaceAll("_", " ")}</td>
                  <td><div className="audit-details-preview">{describeEvent(entry)}</div></td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};
