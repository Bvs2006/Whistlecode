import React from "react";
import type { AppSection } from "../types";

type HeaderProps = {
  activeSection: AppSection;
  onSearch?: (query: string) => void;
};

export function Header({ activeSection, onSearch }: HeaderProps) {
  return (
    <header className="global-top-ribbon-ref">
      {/* Search Input Box */}
      <div className="header-search-container">
        <span className="search-icon" aria-hidden="true">🔍</span>
        <input
          type="text"
          className="header-search-input"
          placeholder="Search workflows, agents, or ask anything..."
          aria-label="Search workflows, agents, or ask anything"
          onKeyDown={(e) => {
            if (e.key === "Enter" && onSearch) {
              onSearch((e.target as HTMLInputElement).value);
            }
          }}
        />
        <kbd className="search-kbd-pill">Ctrl + K</kbd>
      </div>

      {/* Right Controls */}
      <div className="header-right-controls">
        <div className="status-online-pill">
          <span className="online-green-dot" />
          <span>Online</span>
        </div>

        <div className="header-v-divider" />

        <div className="model-selector-pill">
          <span className="gemini-icon">G</span>
          <strong>Gemini</strong>
          <span className="dropdown-caret">▾</span>
        </div>

        <div className="notification-bell-btn" title="2 unread notifications">
          <span className="bell-icon">🔔</span>
          <span className="bell-badge">2</span>
        </div>

        <div className="header-avatar-btn">
          <img
            src="https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=100&auto=format&fit=crop&q=80"
            alt="Sarah Johnson"
            className="header-avatar-img"
          />
        </div>
      </div>
    </header>
  );
}
