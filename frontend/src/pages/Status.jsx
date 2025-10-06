import React, { useState } from "react";
import { useCameras } from "../store/cameras.jsx";
import StreamingIcon from "../components/StreamingIcon.jsx";
import FireStatusButton from "../components/FireStatusButton.jsx";
import AddCameraDialog from "../components/AddCameraDialog.jsx";
import { FaEye, FaEyeSlash } from "react-icons/fa";
import { useAuth } from "../auth/AuthContext.jsx";
import { toggleTheme } from "../utils/theme.js";

const StatusBadge = ({ label, active, isFire = false }) => {
  const getBadgeStyle = () => {
    if (isFire) {
      return {
        backgroundColor: active ? "#ff6666" : "#6bcf76",
        color: "#ffffff",
        padding: "4px 8px",
        borderRadius: "12px",
        fontSize: "12px",
        fontWeight: "500",
        display: "inline-block",
      };
    }
    return {
      backgroundColor: active ? "#6bcf76" : "#ff6666",
      color: "#ffffff",
      padding: "4px 8px",
      borderRadius: "12px",
      fontSize: "12px",
      fontWeight: "500",
      display: "inline-block",
    };
  };

  return <span style={getBadgeStyle()}>{active ? "Yes" : "No"}</span>;
};

const ViewingStatusIcon = ({ isVisible }) => {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      {isVisible ? <FaEye size={16} /> : <FaEyeSlash size={16} />}
    </div>
  );
};

export default function Status({ onNavigate }) {
  const { cameras } = useCameras();
  const { logout } = useAuth();
  const [showAdd, setShowAdd] = useState(false);
  const [theme, setTheme] = useState(
    document.documentElement.getAttribute("data-theme") || "dark"
  );

  const handleNavigate = (page) => {
    if (onNavigate) {
      onNavigate(page);
    }
  };

  const onToggleTheme = () => setTheme(toggleTheme());

  return (
    <div className="shell">
      <main className="main">
        <header className="toolbar">
          <div className="toolbar-brand">
            <img
              src="/images/fire-icon.png"
              alt="FireWatch Logo"
              className="toolbar-logo"
            />
            <span className="toolbar-title">FireWatch</span>
          </div>

          <nav className="toolbar-nav">
            <button
              className={`nav-btn ${false ? "active" : ""}`}
              onClick={() => handleNavigate("video")}
            >
              Streams
            </button>
            <button
              className={`nav-btn ${true ? "active" : ""}`}
              onClick={() => handleNavigate("status")}
            >
              Status
            </button>
          </nav>

          <div className="toolbar-controls">
            <button
              className="theme-toggle"
              onClick={onToggleTheme}
              aria-label="Toggle theme"
            >
              {theme === "dark" ? "🌙" : "☀️"}
            </button>

            <button onClick={logout}>Sign out</button>
          </div>
        </header>

        <div className="status-content">
          <div className="status-panel">
            <div className="status-panel-header">
              <h3>Camera Status</h3>
              <div className="add-camera-container">
                <button
                  className={`view-btn ${showAdd ? "active" : ""}`}
                  onClick={() => setShowAdd(!showAdd)}
                  title="Add Camera"
                >
                  <svg
                    width="24"
                    height="24"
                    viewBox="0 0 24 24"
                    fill="currentColor"
                  >
                    <path d="M4 4h3l2-2h6l2 2h3c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2zm8 3c-2.8 0-5 2.2-5 5s2.2 5 5 5 5-2.2 5-5-2.2-5-5-5zm0 8c-1.7 0-3-1.3-3-3s1.3-3 3-3 3 1.3 3 3-1.3 3-3 3z" />
                  </svg>
                  <span>Add Camera</span>
                </button>
                {showAdd && (
                  <div className="add-camera-form">
                    <AddCameraDialog onClose={() => setShowAdd(false)} />
                  </div>
                )}
              </div>
            </div>

            <div className="status-table-wrapper">
              <table className="status-table">
                <thead>
                  <tr>
                    <th>Name</th>
                    <th>Location</th>
                    <th>Streaming</th>
                    <th>Fire</th>
                    <th>Viewing</th>
                  </tr>
                </thead>
                <tbody>
                  {cameras.map((c) => (
                    <tr key={c.id}>
                      {["name", "location"].map((k, i) => (
                        <td key={i}>{c[k]}</td>
                      ))}
                      <td>
                        <StreamingIcon isStreaming={c.isStreaming} size={14} />
                      </td>
                      <td>
                        <FireStatusButton isFire={c.isFire} />
                      </td>
                      <td>
                        <ViewingStatusIcon isVisible={c.isVisible} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
