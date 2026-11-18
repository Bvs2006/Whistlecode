import React, { useState, useEffect } from "react";
import { dailyLogService, DailyLogDetail, DailyLogSummary } from "../../services/dailyLogService";

interface Props {
  lastLogRefreshTrigger?: number;
}

export const DailyLogViewer: React.FC<Props> = ({ lastLogRefreshTrigger }) => {
  const [availableLogs, setAvailableLogs] = useState<DailyLogSummary[]>([]);
  const [selectedDate, setSelectedDate] = useState<string>(() => {
    return new Date().toISOString().split("T")[0];
  });
  const [logDetail, setLogDetail] = useState<DailyLogDetail | null>(null);
  const [viewMode, setViewMode] = useState<"markdown" | "raw">("markdown");
  const [loading, setLoading] = useState(false);

  // Load available dates
  useEffect(() => {
    let mounted = true;
    dailyLogService.listLogs().then((logs) => {
      if (mounted) {
        setAvailableLogs(logs);
        if (logs.length > 0 && !logs.some((l) => l.date === selectedDate)) {
          // If selectedDate has no logs, pick the latest available
          setSelectedDate(logs[0].date);
        }
      }
    });
    return () => {
      mounted = false;
    };
  }, [lastLogRefreshTrigger]);

  // Load selected date log content
  useEffect(() => {
    let mounted = true;
    setLoading(true);
    dailyLogService.getLogForDate(selectedDate).then((detail) => {
      if (mounted) {
        setLogDetail(detail);
        setLoading(false);
      }
    });
    return () => {
      mounted = false;
    };
  }, [selectedDate, lastLogRefreshTrigger]);

  return (
    <div className="daily-log-viewer card-panel">
      {/* Header */}
      <div className="log-viewer-header">
        <div className="header-title">
          <h3>📜 Daily Text Log Archive</h3>
          <span className="memory-badge" title="Past daily logs are auto-injected into the agent's memory loop">
            🧠 Cross-Session Memory Active
          </span>
        </div>

        {/* Date Selector & Mode Toggle */}
        <div className="log-controls">
          <select
            className="date-select"
            value={selectedDate}
            onChange={(e) => setSelectedDate(e.target.value)}
          >
            {availableLogs.length === 0 ? (
              <option value={selectedDate}>{selectedDate} (Today)</option>
            ) : (
              availableLogs.map((l) => (
                <option key={l.date} value={l.date}>
                  {l.date} ({l.count} runs)
                </option>
              ))
            )}
          </select>

          <div className="view-toggle">
            <button
              type="button"
              className={`toggle-btn ${viewMode === "markdown" ? "active" : ""}`}
              onClick={() => setViewMode("markdown")}
            >
              MD
            </button>
            <button
              type="button"
              className={`toggle-btn ${viewMode === "raw" ? "active" : ""}`}
              onClick={() => setViewMode("raw")}
            >
              TXT
            </button>
          </div>

          <a
            href={dailyLogService.getDownloadUrl(selectedDate)}
            download={`chronicle-log-${selectedDate}.txt`}
            className="btn btn-outline btn-download"
            title="Download plain text (.txt) log"
          >
            ⬇ Download .txt
          </a>
        </div>
      </div>

      {/* Log Body */}
      <div className="log-viewer-body">
        {loading ? (
          <div className="log-loading">
            <span className="spinner" />
            <p>Loading activity logs for {selectedDate}...</p>
          </div>
        ) : !logDetail || !logDetail.has_log ? (
          <div className="empty-log-state">
            <div className="empty-icon">📝</div>
            <h4>No logs recorded for {selectedDate} yet</h4>
            <p>
              When an AG-UI workflow completes, the Automated Post-Task Text Recorder
              compiles completed actions into this panel and stores them for future recall.
            </p>
          </div>
        ) : viewMode === "markdown" ? (
          <div className="log-markdown-content">
            <div className="log-stats-bar">
              <span><strong>Date:</strong> {logDetail.date}</span>
              <span><strong>Recorded Runs:</strong> {logDetail.entries_count}</span>
            </div>
            <pre className="markdown-pre">{logDetail.markdown}</pre>
          </div>
        ) : (
          <div className="log-raw-content">
            <div className="log-stats-bar">
              <span><strong>File:</strong> <code>{logDetail.date}.txt</code></span>
            </div>
            <pre className="raw-text-pre">{logDetail.raw_text}</pre>
          </div>
        )}
      </div>
    </div>
  );
};
