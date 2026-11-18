import { useState } from "react";

const tabs = ["General", "Appearance", "Permissions", "Notifications", "Browser"];

export function SettingsView() {
  const [activeTab, setActiveTab] = useState("General");
  const [layout, setLayout] = useState<"knowledge" | "engineering">(
    localStorage.getItem("whistlecode.settings.layout") === "engineering" ? "engineering" : "knowledge",
  );

  const saveLayout = (next: "knowledge" | "engineering") => {
    setLayout(next);
    try { localStorage.setItem("whistlecode.settings.layout", next); } catch { /* optional */ }
  };

  return (
    <section className="settings-view">
      <header className="settings-header">
        <div>
          <h1>Settings</h1>
          <p>Configure workspace behavior and permissions.</p>
        </div>
      </header>

      <div className="settings-layout">
        <nav className="settings-nav" aria-label="Settings sections">
          {tabs.map((tab) => (
            <button key={tab} type="button" className={activeTab === tab ? "active" : ""} onClick={() => setActiveTab(tab)}>
              {tab}
            </button>
          ))}
        </nav>

        <div className="settings-content">
          <h2>{activeTab}</h2>
          <p>{activeTab === "General" ? "Choose the workspace layout and review global behavior." : `Configure ${activeTab.toLowerCase()} for this workspace.`}</p>

          {activeTab === "General" && (
            <>
              <div className="settings-section">
                <h3>Workspace style</h3>
                <div className="settings-layout-card">
                  <button type="button" className={layout === "knowledge" ? "active" : ""} onClick={() => saveLayout("knowledge")}>
                    <strong>Knowledge work</strong>
                    <span>Research, writing, review, and document-focused tasks.</span>
                  </button>
                  <button type="button" className={layout === "engineering" ? "active" : ""} onClick={() => saveLayout("engineering")}>
                    <strong>Software engineering</strong>
                    <span>Developer tools, code review, and automation workflows.</span>
                  </button>
                </div>
              </div>
              <div className="settings-section">
                <h3>Execution</h3>
                <div className="settings-row"><div><strong>Queued messages</strong><small>Delivery and follow-up behavior</small></div><button type="button">Review</button></div>
                <div className="settings-row"><div><strong>Approval policy</strong><small>Require confirmation before protected actions</small></div><button type="button">Configured</button></div>
              </div>
            </>
          )}

          {activeTab !== "General" && (
            <div className="settings-section">
              <div className="settings-row">
                <div><strong>{activeTab} preference</strong><small>Workspace defaults are applied before a run starts.</small></div>
                <button type="button">Open</button>
              </div>
              <div className="settings-row">
                <div><strong>Manage permissions</strong><small>Review allowed websites, tools, and protected resources.</small></div>
                <button type="button">Manage</button>
              </div>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
