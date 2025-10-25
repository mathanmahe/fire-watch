import React, { useState } from "react";
import CameraGrid from "../components/CameraGrid.jsx";
import SingleCameraView from "../components/SingleCameraView.jsx";
import MiniStatusPanel from "../components/MiniStatusPanel.jsx";
import AddCameraDialog from "../components/AddCameraDialog.jsx";
import Status from "./Status.jsx";
import { useAuth } from "../auth/AuthContext.jsx";
import { useCameras } from "../store/cameras.jsx";
import { toggleTheme } from "../utils/theme.js";
import { CSSTransition } from "react-transition-group";
import { withCamerasProvider } from "../store/cameras.jsx";
import { useWebSocket } from "../hooks/useWebSocket.js";

function Dashboard() {
  const { logout } = useAuth();
  const [showAdd, setShowAdd] = useState(false);
  const [currentPage, setCurrentPage] = useState("video");
  const [viewMode, setViewMode] = useState("grid"); // 'grid' or 'single'
  const [selectedCameraIndex, setSelectedCameraIndex] = useState(0);
  const [showStatusPanel, setShowStatusPanel] = useState(false);
  const [isExiting, setIsExiting] = useState(false);
  const [isSecondaryToolbarExiting, setIsSecondaryToolbarExiting] =
    useState(false);
  const [theme, setTheme] = React.useState(
    document.documentElement.getAttribute("data-theme") || "dark"
  );
  const { cameras, toggleCameraVisibility } = useCameras();
  const statusPanelRef = React.useRef(null);

  // Initialize WebSocket connection for fire detection alerts
  useWebSocket();

  const handleNavigate = (page) => {
    if (currentPage === "video" && page !== "video") {
      // Trigger exit animation for secondary toolbar
      setIsSecondaryToolbarExiting(true);
      setTimeout(() => {
        setCurrentPage(page);
        setIsSecondaryToolbarExiting(false);
      }, 300); // Match the animation duration
    } else {
      setCurrentPage(page);
    }
  };

  const onToggleTheme = () => setTheme(toggleTheme());

  const handleViewModeChange = (mode) => {
    setViewMode(mode);
    if (mode === "single" && cameras.length > 0) {
      setSelectedCameraIndex(0);
      // Ensure the selected camera is visible when entering single view mode
      const selectedCamera = cameras[selectedCameraIndex] || cameras[0];
      if (selectedCamera && !selectedCamera.isVisible) {
        toggleCameraVisibility(selectedCamera.id);
      }
    }
  };

  const handleCameraChange = (index) => {
    setSelectedCameraIndex(index);
  };

  return (
    <div className="shell">
      <main className="main">
        {currentPage === "video" ? (
          <>
            <header className="toolbar">
              <div className="toolbar-brand">
                <img
                  src="./fire-icon.png"
                  alt="FireWatch Logo"
                  className="toolbar-logo"
                />
                <span className="toolbar-title">FireWatch</span>
              </div>

              <nav className="toolbar-nav">
                <button
                  className={`nav-btn ${
                    currentPage === "video" ? "active" : ""
                  }`}
                  onClick={() => handleNavigate("video")}
                >
                  Streams
                </button>
                <button
                  className={`nav-btn ${
                    currentPage === "status" ? "active" : ""
                  }`}
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

            {/* Secondary Toolbar - Only visible on Streams tab */}
            {currentPage === "video" && (
              <div
                className={`secondary-toolbar ${
                  isSecondaryToolbarExiting ? "exiting" : ""
                }`}
              >
                <div className="view-controls">
                  <button
                    className={`view-btn ${
                      viewMode === "single" ? "active" : ""
                    }`}
                    onClick={() => handleViewModeChange("single")}
                    title="Single View"
                  >
                    <svg
                      width="24"
                      height="24"
                      viewBox="0 0 24 24"
                      fill="currentColor"
                    >
                      <rect
                        x="3"
                        y="3"
                        width="18"
                        height="18"
                        rx="2"
                        stroke="currentColor"
                        strokeWidth="2"
                        fill="none"
                      />
                    </svg>
                    <span>Single</span>
                  </button>
                  <button
                    className={`view-btn ${
                      viewMode === "grid" ? "active" : ""
                    }`}
                    onClick={() => handleViewModeChange("grid")}
                    title="Grid View"
                  >
                    <svg
                      width="24"
                      height="24"
                      viewBox="0 0 24 24"
                      fill="currentColor"
                    >
                      <rect
                        x="3"
                        y="3"
                        width="7"
                        height="7"
                        rx="1"
                        stroke="currentColor"
                        strokeWidth="2"
                        fill="none"
                      />
                      <rect
                        x="14"
                        y="3"
                        width="7"
                        height="7"
                        rx="1"
                        stroke="currentColor"
                        strokeWidth="2"
                        fill="none"
                      />
                      <rect
                        x="3"
                        y="14"
                        width="7"
                        height="7"
                        rx="1"
                        stroke="currentColor"
                        strokeWidth="2"
                        fill="none"
                      />
                      <rect
                        x="14"
                        y="14"
                        width="7"
                        height="7"
                        rx="1"
                        stroke="currentColor"
                        strokeWidth="2"
                        fill="none"
                      />
                    </svg>
                    <span>Grid</span>
                  </button>
                  <button
                    className={`view-btn ${showStatusPanel ? "active" : ""}`}
                    onClick={() => setShowStatusPanel(!showStatusPanel)}
                    title="Toggle Status Panel"
                  >
                    <svg
                      width="24"
                      height="24"
                      viewBox="0 0 24 24"
                      fill="currentColor"
                    >
                      <path d="M3 3h18v2H3V3zm0 4h18v2H3V7zm0 4h18v2H3v-2zm0 4h18v2H3v-2zm0 4h18v2H3v-2z" />
                    </svg>
                    <span>Status Panel</span>
                  </button>
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
              </div>
            )}

            {currentPage === "video" ? (
              <section
                className={`content ${
                  viewMode === "single"
                    ? showStatusPanel || isExiting
                      ? "content--single-with-status"
                      : "content--single"
                    : showStatusPanel || isExiting
                    ? "content--with-status"
                    : "content--grid"
                }`}
              >
                {viewMode === "single" ? (
                  <SingleCameraView
                    selectedCameraIndex={selectedCameraIndex}
                    onCameraChange={handleCameraChange}
                  />
                ) : (
                  <CameraGrid />
                )}
                <CSSTransition
                  in={showStatusPanel}
                  timeout={300}
                  classNames="status-panel"
                  unmountOnExit
                  nodeRef={statusPanelRef}
                  onExit={() => setIsExiting(true)}
                  onExited={() => setIsExiting(false)}
                >
                  <div ref={statusPanelRef}>
                    <MiniStatusPanel viewMode={viewMode} />
                  </div>
                </CSSTransition>
              </section>
            ) : (
              <Status onNavigate={handleNavigate} currentPage={currentPage} />
            )}
          </>
        ) : (
          <Status onNavigate={handleNavigate} currentPage={currentPage} />
        )}
      </main>
    </div>
  );
}

export default withCamerasProvider(Dashboard);
