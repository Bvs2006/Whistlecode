import type { AppSection } from "../types";

type HeaderProps = {
  activeSection: AppSection;
};

export function Header({ activeSection }: HeaderProps) {
  return (
    <header className="global-top-ribbon">
      <div className="ribbon-left">
        <span>WhistleCode</span>
        <span>/</span>
        <strong>{activeSection === "Overview" ? "WhistleRoom" : activeSection === "Ask AI" ? "Conversation" : activeSection}</strong>
      </div>

      <div className="ribbon-right">
        <div className="safe-guard-badge">
          <span className="dot-pulse" />
          <span>Policy Guard Active</span>
        </div>
      </div>
    </header>
  );
}
