import React, { useState, useEffect } from "react";
import { api } from "../../api/client";
import type { AuditEntry } from "../../types";

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
          <h2>Tamper-Evident Audit Trail (AUD)</h2>
          <p className="subtitle">
            Every observation, proposal, policy decision, approval, and execution action is logged into an append-only, SHA-256 hash-chained ledger. Sensitive secrets are scrubbed at source.
          </p>
        </div>
        <div className="header-status-group">
          {isChainValid !== null && (
            <span className={`badge-chain ${isChainValid ? "chain-valid" : "chain-broken"}`}>
              {isChainValid ? "✓ Cryptographic Chain Valid" : "✕ Tamper Warning: Chain Broken"}
            </span>
          )}
          <button className="btn btn-secondary btn-sm" onClick={loadAudit} disabled={loading}>
            Refresh Ledger
          </button>
        </div>
      </div>

      <div className="audit-table-wrapper">
        <table className="audit-table">
          <thead>
            <tr>
              <th>ID</th>
              <th>Timestamp</th>
              <th>Actor</th>
              <th>Event Type</th>
              <th>Version Hash</th>
              <th>Details & Policy Reasons</th>
              <th>Entry Hash (SHA-256)</th>
            </tr>
          </thead>
          <tbody>
            {entries.length === 0 ? (
              <tr>
                <td colSpan={7} className="empty-state">
                  No audit entries recorded yet.
                </td>
              </tr>
            ) : (
              entries.map((entry) => (
                <tr key={entry.id}>
                  <td><strong>#{entry.id}</strong></td>
                  <td>{new Date(entry.timestamp).toLocaleTimeString()}</td>
                  <td><span className={`actor-pill actor-${entry.actor}`}>{entry.actor}</span></td>
                  <td><code>{entry.event_type}</code></td>
                  <td>
                    {entry.version_hash ? (
                      <code className="hash-code">{entry.version_hash.slice(0, 10)}...</code>
                    ) : (
                      "—"
                    )}
                  </td>
                  <td>
                    <div className="audit-details-preview">
                      {JSON.stringify(entry.details)}
                    </div>
                  </td>
                  <td>
                    <code className="hash-code-sm" title={entry.entry_hash}>
                      {entry.entry_hash.slice(0, 12)}...
                    </code>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};
