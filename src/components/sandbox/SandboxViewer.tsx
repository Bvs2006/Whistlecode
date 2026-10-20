import React from "react";

export const SandboxViewer: React.FC = () => {
  return (
    <div className="card-panel">
      <div className="panel-header-row">
        <div>
          <h2>Isolated Benchmark Sandbox (Test Site)</h2>
          <p className="subtitle">
            Controlled local environment for testing browser automation without impacting real accounts or external services.
          </p>
        </div>
        <a
          href="http://localhost:8000/testsite"
          target="_blank"
          rel="noopener noreferrer"
          className="btn btn-secondary btn-sm"
        >
          Open in New Window ↗
        </a>
      </div>

      <div className="sandbox-frame-wrapper">
        <iframe
          src="http://localhost:8000/testsite"
          title="WhistleCode Benchmark Test Site"
          className="sandbox-iframe"
        />
      </div>
    </div>
  );
};
