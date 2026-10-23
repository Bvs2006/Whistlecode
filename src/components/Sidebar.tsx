import React, { useState } from "react";
import type { AppSection } from "../types";

type SidebarProps = {
  activeSection: string;
  onNavigate: (section: AppSection) => void;
};

export function Sidebar({ activeSection, onNavigate }: SidebarProps) {
  const [searchVal, setSearchVal] = useState("");

  const menuItems: { section: AppSection; label: string; icon: string }[] = [
    { section: "Overview", label: "Overview", icon: "⊞" },
    { section: "Ask AI", label: "Ask AI", icon: "💬" },
    { section: "Teach a Task", label: "Teach a Task", icon: "◎" },
    { section: "My Workflows", label: "My Workflows", icon: "☊" },
    { section: "Activity", label: "Activity", icon: "🕒" },
    { section: "Permissions", label: "Permissions", icon: "🛡" },
    { section: "Live Run", label: "Live Run", icon: "▶" },
    { section: "Test Site Sandbox", label: "Paper Sandbox", icon: "▧" },
  ];
  const visibleMenuItems = menuItems.filter((item) =>
    !searchVal.trim() || item.label.toLowerCase().includes(searchVal.trim().toLowerCase()) || item.section.toLowerCase().includes(searchVal.trim().toLowerCase())
  );

  return (
    <aside className="sidebar-img1">
      {/* TOP SEARCH BAR (Image 1 style: 🔍 Search workflows, tasks and history) */}
      <div className="sidebar-search-box-img1">
        <span className="search-icon-img1">🔍</span>
        <input
          type="text"
          className="sidebar-search-input-img1"
          placeholder="Find a workspace section"
          value={searchVal}
          onChange={(e) => setSearchVal(e.target.value)}
        />
      </div>

      <div className="workspace-label-img1">WORKSPACE</div>

      {/* NAV ITEMS */}
      <nav className="sidebar-nav-list-img1">
        {visibleMenuItems.map((item) => {
          const isActive = activeSection === item.section;
          return (
            <button
              key={item.section}
              type="button"
              className={`sidebar-nav-item-img1 ${isActive ? "active" : ""}`}
              title={item.label}
              aria-label={item.label}
              onClick={() => onNavigate(item.section)}
            >
              <span className="nav-icon-img1">{item.icon}</span>
              <span className="nav-label-img1">{item.label}</span>
            </button>
          );
        })}
        {visibleMenuItems.length === 0 && <p className="sidebar-no-results">No matching section</p>}

        <div className="sidebar-divider-img1" />

        <button
          type="button"
          className={`sidebar-nav-item-img1 ${activeSection === "Settings" ? "active" : ""}`}
          title="Settings"
          aria-label="Settings"
          onClick={() => onNavigate("Settings")}
        >
          <span className="nav-icon-img1">⚙</span>
          <span className="nav-label-img1">Settings</span>
        </button>
      </nav>

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
