import React, { useEffect, useState } from "react";
import type { AppSection } from "../types";

type SidebarAction = { kind: "new-chat" } | { kind: "open-thread"; threadId: string };
type ChatHistoryItem = { id: string; title: string; updatedAt: number };
const THREADS_STORAGE_KEY = "whistlecode.ask-ai.threads.v1";
const THREADS_UPDATED_EVENT = "whistlecode:ask-ai-threads-updated";

type SidebarProps = {
  activeSection: string;
  onNavigate: (section: AppSection) => void;
  onAskAIAction: (action: SidebarAction) => void;
};

export function Sidebar({ activeSection, onNavigate, onAskAIAction }: SidebarProps) {
  const [collapsed, setCollapsed] = useState(false);
  const [chatHistory, setChatHistory] = useState<ChatHistoryItem[]>([]);

  useEffect(() => {
    const refreshHistory = () => {
      try {
        const stored = JSON.parse(localStorage.getItem(THREADS_STORAGE_KEY) || "[]");
        setChatHistory(Array.isArray(stored) ? stored.filter((item) => item && typeof item.id === "string" && Array.isArray(item.messages)).slice(0, 30) : []);
      } catch { setChatHistory([]); }
    };
    refreshHistory();
    window.addEventListener(THREADS_UPDATED_EVENT, refreshHistory);
    window.addEventListener("storage", refreshHistory);
    return () => { window.removeEventListener(THREADS_UPDATED_EVENT, refreshHistory); window.removeEventListener("storage", refreshHistory); };
  }, []);

  const toggleCollapsed = () => setCollapsed((current) => {
    const next = !current;
    try { localStorage.setItem("whistlecode.sidebar.collapsed", String(next)); } catch { /* Sidebar preference is optional. */ }
    return next;
  });

  const mainNavItems: { section: AppSection; label: string; icon: string; hasBadge?: boolean }[] = [
    { section: "Ask AI", label: "Ask AI", icon: "💬" },
    { section: "Agents", label: "My Agents", icon: "🤖" },
    { section: "Templates", label: "Discover", icon: "🧭" },
    { section: "Teach", label: "Recording Studio", icon: "🎙️", hasBadge: true },
    { section: "My Workflows", label: "Workflows", icon: "🔀" },
    { section: "Artifacts", label: "Community", icon: "👥" },
    { section: "Integrations", label: "Integrations", icon: "🧩" },
    { section: "Execution History", label: "Activity", icon: "📈" },
  ];

  const workspaceNavItems: { section: AppSection; label: string; icon: string }[] = [
    { section: "My Workflows", label: "Saved Workflows", icon: "🗂️" },
    { section: "Skills & Memory", label: "My Skills", icon: "✨" },
    { section: "Overview", label: "Shared with Me", icon: "👥" },
  ];

  return (
    <aside className={`sidebar-ref-layout ${collapsed ? "is-collapsed" : ""}`} aria-label="Workspace sidebar">
      {/* Brand Header */}
      <div className="sidebar-brand-ref">
        <div className="brand-logo-box">
          <img src="/whistlecode-mark.svg" alt="" className="brand-logo-img" />
        </div>
        <div className="brand-text-col">
          <strong className="brand-title">WHISTLECODE</strong>
          <span className="brand-subtitle">From Request to Action.</span>
        </div>
        <button
          type="button"
          className="sidebar-toggle-btn"
          onClick={toggleCollapsed}
          title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
        >
          <svg viewBox="0 0 20 20" aria-hidden="true" width="16" height="16">
            <path d={collapsed ? "M7 5l5 5-5 5" : "M13 5l-5 5 5 5"} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" fill="none" />
          </svg>
        </button>
      </div>

      {/* Main Navigation */}
      <nav className="sidebar-nav-ref" aria-label="Main navigation">
        <div className="nav-items-list">
          {mainNavItems.map((item) => {
            const isActive = activeSection === item.section;
            return (
              <button
                key={item.label}
                type="button"
                className={`sidebar-nav-pill ${isActive ? "active" : ""}`}
                onClick={() => {
                  if (item.section === "Ask AI" && activeSection === "Ask AI") {
                    onAskAIAction({ kind: "new-chat" });
                  } else {
                    onNavigate(item.section);
                  }
                }}
                title={item.label}
              >
                <span className="pill-icon">{item.icon}</span>
                <span className="pill-label">{item.label}</span>
                {item.hasBadge && <span className="pill-red-dot" aria-label="Active recording available" />}
              </button>
            );
          })}
        </div>

        {/* Section: My Workspace */}
        <div className="workspace-group-ref">
          <div className="workspace-group-heading">My Workspace</div>
          <div className="nav-items-list">
            {workspaceNavItems.map((item) => {
              const isActive = activeSection === item.section && item.label !== "Saved Workflows";
              return (
                <button
                  key={item.label}
                  type="button"
                  className={`sidebar-nav-pill workspace-pill ${isActive ? "active" : ""}`}
                  onClick={() => onNavigate(item.section)}
                  title={item.label}
                >
                  <span className="pill-icon">{item.icon}</span>
                  <span className="pill-label">{item.label}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Rocket Promo Card: Share Your Workflow */}
        <div className="sidebar-rocket-card">
          <div className="rocket-icon">🚀</div>
          <div className="rocket-title">Share Your Workflow</div>
          <p className="rocket-desc">Help others and grow the WHISTLECODE community.</p>
          <button
            type="button"
            className="rocket-btn"
            onClick={() => onNavigate("Artifacts")}
          >
            Publish Now
          </button>
        </div>
      </nav>

      {/* Sidebar Footer User Info */}
      <div className="sidebar-user-footer-ref">
        <img
          src="https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=100&auto=format&fit=crop&q=80"
          alt="Sarah Johnson"
          className="user-avatar-img"
        />
        <div className="user-details-col">
          <strong className="user-name">Sarah Johnson</strong>
          <span className="user-tier-badge">Pro Plan</span>
        </div>
        <button
          type="button"
          className="user-settings-btn"
          title="Settings"
          onClick={() => onNavigate("Settings")}
        >
          ⚙️
        </button>
      </div>
    </aside>
  );
}
