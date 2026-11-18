import React, { useEffect, useState } from "react";
import type { AppSection } from "../types";

type SidebarAction = { kind: "new-chat" } | { kind: "open-thread"; threadId: string };
type ChatHistoryItem = { id: string; title: string; updatedAt: number };
const THREADS_STORAGE_KEY = "whistlecode.ask-ai.threads.v1";
const THREADS_UPDATED_EVENT = "whistlecode:ask-ai-threads-updated";

type SidebarProps = {
  activeSection: string;
  theme: "dark" | "light";
  onNavigate: (section: AppSection) => void;
  onAskAIAction: (action: SidebarAction) => void;
  onToggleTheme: () => void;
};

export function Sidebar({ activeSection, theme, onNavigate, onAskAIAction, onToggleTheme }: SidebarProps) {
  const [collapsed, setCollapsed] = useState(() => localStorage.getItem("whistlecode.sidebar.collapsed") === "true");
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

  const menuGroups: { label: string; items: { section: AppSection; label: string; icon: string }[] }[] = [
    {
      label: "WORKSPACE",
      items: [
        { section: "Workspace", label: "Workspace", icon: "⊞" },
        { section: "Ask AI", label: "Ask AI", icon: "💬" },
        { section: "Teach", label: "Record task", icon: "◉" },
        { section: "Templates", label: "Templates", icon: "✨" },
      ],
    },
    {
      label: "AUTOMATION",
      items: [
        { section: "Automations", label: "Automations", icon: "⚡" },
        { section: "My Workflows", label: "Workflow Editor", icon: "🛠️" },
        { section: "Execution History", label: "Activity", icon: "▥" },
      ],
    },
  ];
  return (
    <aside className={`sidebar-img1 ${collapsed ? "is-collapsed" : ""}`} aria-label="Workspace sidebar">
      <div className="sidebar-brand-row">
        <a href="#workspace" className="sidebar-brand-lockup" aria-label="WhistleCode workspace">
          <img src="/whistlecode-mark.svg" alt="" />
          <span>whistle<span>code</span></span>
        </a>
        <button type="button" className="sidebar-collapse-button" onClick={toggleCollapsed}
          aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"} aria-expanded={!collapsed}
          title={collapsed ? "Expand sidebar" : "Collapse sidebar"}>
          <svg viewBox="0 0 20 20" aria-hidden="true"><rect x="2.5" y="3" width="15" height="14" rx="2.5" /><path d={collapsed ? "M7 3v14m4-4 3-3-3-3" : "M7 3v14m6-9-3 3 3 3"} /></svg>
        </button>
      </div>
      <button type="button" className={`sidebar-new-chat ${activeSection === "Ask AI" ? "active" : ""}`} title="Start a new chat" onClick={() => onAskAIAction({ kind: "new-chat" })}>
        <span aria-hidden="true">＋</span><span className="nav-label-img1">New chat</span>
      </button>
      {/* NAV ITEMS */}
      <nav className="sidebar-nav-list-img1" aria-label="Workspace navigation">
        {menuGroups.map((group) => {
          const items = group.items;
          return <div className="sidebar-nav-group" key={group.label}>
          <div className="sidebar-nav-group-label">{group.label}</div>
          {items.map((item) => {
          const isActive = activeSection === item.section;
          return (
            <button
              key={item.section}
              type="button"
              className={`sidebar-nav-item-img1 ${isActive ? "active" : ""}`}
              title={item.label}
              aria-label={item.label}
              aria-current={isActive ? "page" : undefined}
              onClick={() => onNavigate(item.section)}
            >
              <span className="nav-icon-img1">{item.icon}</span>
              <span className="nav-label-img1">{item.label}</span>
            </button>
          );
        })}
          </div>;
        })}
        <div className="sidebar-divider-img1" />
      </nav>

      <button
        type="button"
        className={`sidebar-nav-item-img1 ${activeSection === "Settings" ? "active" : ""}`}
        title="Settings"
        aria-label="Settings"
        aria-current={activeSection === "Settings" ? "page" : undefined}
        onClick={() => onNavigate("Settings")}
      >
        <span className="nav-icon-img1">⚙</span>
        <span className="nav-label-img1">Settings</span>
      </button>

      <button type="button" className="sidebar-theme-toggle" onClick={onToggleTheme}
        aria-label={`Switch to ${theme === "dark" ? "light" : "dark"} theme`} title={`Switch to ${theme === "dark" ? "light" : "dark"} theme`}>
        <span aria-hidden="true">{theme === "dark" ? "☼" : "◐"}</span>
        <span className="nav-label-img1">{theme === "dark" ? "Light theme" : "Dark theme"}</span>
      </button>

      {/* FOOTER USER INFO */}
      <div className="sidebar-footer-user-img1">
        <div className="user-flag-img1">🇮🇳</div>
        <div className="user-info-img1">
          <strong>B.Venkata Srujith</strong>
          <small>Safe Engine Active</small>
        </div>
      </div>
    </aside>
  );
}
