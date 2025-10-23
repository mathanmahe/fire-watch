import React from "react";
import { toggleTheme } from "../utils/theme.js";

export default function SideNav({ onNavigate, onLogout, currentPage }) {
  const [theme, setTheme] = React.useState(
    document.documentElement.getAttribute("data-theme") || "dark"
  );

  const onToggle = () => setTheme(toggleTheme());

  return (
    <aside className="sidenav">
      <div className="brand">
        <img
          src="/images/fire-icon.png"
          alt="Fire Watch Logo"
          className="brand-logo"
        />
        FireWatch
      </div>
      <nav>
        <a
          className={currentPage === "video" ? "active" : ""}
          onClick={() => onNavigate("video")}
        >
          Streams
        </a>
        <a
          className={currentPage === "status" ? "active" : ""}
          onClick={() => onNavigate("status")}
        >
          Status
        </a>
      </nav>

      <div className="sidenav-footer">
        <button
          className="theme-toggle"
          onClick={onToggle}
          aria-label="Toggle theme"
        >
          {theme === "dark" ? "🌙 Dark" : "☀️ Light"}
        </button>
        <button onClick={onLogout}>Sign out</button>
      </div>
    </aside>
  );
}
