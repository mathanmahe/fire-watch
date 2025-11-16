import React, { useState, useMemo } from "react";
import { useCameras } from "../store/cameras.jsx";
import StreamingIcon from "../components/StreamingIcon.jsx";
import FireStatusButton from "../components/FireStatusButton.jsx";
import AddCameraDialog from "../components/AddCameraDialog.jsx";
import {
  FaEye,
  FaEyeSlash,
  FaEdit,
  FaTrash,
  FaSave,
  FaSearch,
  FaTimes,
} from "react-icons/fa";
import { ImFire } from "react-icons/im";
import { useAuth } from "../auth/AuthContext.jsx";
import { toggleTheme } from "../utils/theme.js";
import { cameraApi } from "../services/cameraApi.js";

const ViewingStatusIcon = ({ isVisible }) => {
  return (
    <button
      className={`visibility-toggle ${isVisible ? "visible" : "hidden"}`}
      title={isVisible ? "Hide camera" : "Show camera"}
    >
      {isVisible ? <FaEye size={32} /> : <FaEyeSlash size={32} />}
    </button>
  );
};

export default function Status({ onNavigate, currentPage = "status" }) {
  const { cameras, deleteCamera, updateCamera, fetchCamerasFromDB } =
    useCameras();
  const { logout } = useAuth();
  const [showAdd, setShowAdd] = useState(false);
  const [theme, setTheme] = useState(
    document.documentElement.getAttribute("data-theme") || "dark"
  );
  const [editingCameraId, setEditingCameraId] = useState(null);
  const [editedValues, setEditedValues] = useState({});
  const [deletedCameraIds, setDeletedCameraIds] = useState(new Set());
  const [animatingOutIds, setAnimatingOutIds] = useState(new Set());
  const [searchQuery, setSearchQuery] = useState("");
  const [filter, setFilter] = useState("all");
  const [togglingDetection, setTogglingDetection] = useState(new Set());
  const [updatingAiType, setUpdatingAiType] = useState(new Set());
  const [samplingRate, setSamplingRate] = useState(30000); // Default 30 seconds
  const [updatingSamplingRate, setUpdatingSamplingRate] = useState(false);

  const handleNavigate = (page) => {
    if (onNavigate) {
      onNavigate(page);
    }
  };

  const onToggleTheme = () => setTheme(toggleTheme());

  const handleEditClick = async (camera) => {
    if (editingCameraId === camera.id) {
      // Save action - update camera in database
      try {
        await updateCamera(camera.id, editedValues);
        setEditingCameraId(null);
        setEditedValues({});

        await fetchCamerasFromDB();
      } catch (error) {
        console.error("Failed to save camera: ", error);
        alert(`Failed to save camera: ${error.message}`);
      }
    } else {
      // Edit action - enter edit mode
      setEditingCameraId(camera.id);
      setEditedValues({
        name: camera.name,
        location: camera.location,
        ip: camera.ip,
        port: camera.port,
      });
    }
  };

  const handleFieldChange = (field, value) => {
    setEditedValues((prev) => ({
      ...prev,
      [field]: value,
    }));
  };

  const handleDeleteClick = async (cameraId) => {
    // Start animation
    setAnimatingOutIds((prev) => new Set([...prev, cameraId]));

    try {
      // Call API to delete camera
      await deleteCamera(cameraId);

      // After animation completes, mark as deleted
      setTimeout(() => {
        setDeletedCameraIds((prev) => new Set([...prev, cameraId]));
        setAnimatingOutIds((prev) => {
          const newSet = new Set(prev);
          newSet.delete(cameraId);
          return newSet;
        });
      }, 300); // Match CSS animation duration

      console.log(`Camera ${cameraId} deleted successfully`);
    } catch (error) {
      console.error("Failed to delete camera:", error);
      // Stop animation if deletion failed
      setAnimatingOutIds((prev) => {
        const newSet = new Set(prev);
        newSet.delete(cameraId);
        return newSet;
      });
      alert(`Failed to delete camera: ${error.message}`);
    }
  };

  const handleDetectionChange = async (cameraId, newDetection) => {
    setTogglingDetection((prev) => new Set([...prev, cameraId]));
    try {
      await updateCamera(cameraId, { detection: newDetection });
      await fetchCamerasFromDB();
    } catch (error) {
      console.error("Failed to update detection: ", error);
      alert(`Failed to update detection: ${error.message}`);
    } finally {
      setTogglingDetection((prev) => {
        const newSet = new Set(prev);
        newSet.delete(cameraId);
        return newSet;
      });
    }
  };

  const handleAiTypeChange = async (cameraId, newAiType) => {
    setUpdatingAiType((prev) => new Set([...prev, cameraId]));
    try {
      await updateCamera(cameraId, { aiType: newAiType });
      await fetchCamerasFromDB();
    } catch (error) {
      console.error("Failed to update AI type: ", error);
      alert(`Failed to update AI type: ${error.message}`);
    } finally {
      setUpdatingAiType((prev) => {
        const newSet = new Set(prev);
        newSet.delete(cameraId);
        return newSet;
      });
    }
  };

  // Filter and search cameras
  const visibleCameras = useMemo(() => {
    let filtered = cameras.filter((c) => !deletedCameraIds.has(c.id));

    // Apply search filter
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(
        (c) =>
          c.name?.toLowerCase().includes(query) ||
          c.location?.toLowerCase().includes(query) ||
          c.ip?.toLowerCase().includes(query) ||
          c.port?.toString().toLowerCase().includes(query)
      );
    }

    // Apply status filter
    if (filter === "streaming") {
      filtered = filtered.filter((c) => c.isStreaming);
    } else if (filter === "fire") {
      filtered = filtered.filter((c) => c.isFire);
    }
    // "all" shows everything (no additional filter needed)

    return filtered;
  }, [cameras, deletedCameraIds, searchQuery, filter]);

  const handleClearSearch = () => {
    setSearchQuery("");
  };

  const handleFilterChange = (newFilter) => {
    setFilter(newFilter);
  };

  const handleClearFilters = () => {
    setFilter("all");
    setSearchQuery("");
  };

  // Fetch user's sampling rate on mount
  React.useEffect(() => {
    const fetchSamplingRate = async () => {
      try {
        const data = await cameraApi.request("/api/user/settings");
        setSamplingRate(data.samplingRate);
      } catch (error) {
        console.error("Failed to fetch sampling rate:", error);
      }
    };

    fetchSamplingRate();
  }, []);

  // Handle sampling rate change
  const handleSamplingRateChange = async (newRate) => {
    setUpdatingSamplingRate(true);
    try {
      const data = await cameraApi.request("/api/user/settings/sampling-rate", {
        method: "PUT",
        body: JSON.stringify({ samplingRate: newRate }),
      });

      setSamplingRate(data.samplingRate);
      console.log("Sampling rate updated successfully:", data);
    } catch (error) {
      console.error("Failed to update sampling rate:", error);
      alert(`Failed to update sampling rate: ${error.message}`);
    } finally {
      setUpdatingSamplingRate(false);
    }
  };

  // Sampling rate options
  const samplingRateOptions = [
    { value: 10000, label: "10s" },
    { value: 20000, label: "20s" },
    { value: 30000, label: "30s" },
    { value: 60000, label: "1m" },
    { value: 120000, label: "2m" },
    { value: 300000, label: "5m" },
    { value: 600000, label: "10m" },
  ];

  return (
    <div className="shell">
      <main className="main">
        <header className="toolbar">
          <div className="toolbar-brand">
            <img
              src="./fire_ai_logo.png"
              alt="FireWatch Logo"
              className="toolbar-logo"
            />
            <img
              src="./fire_ai_text.png"
              alt="FireWatch"
              className="toolbar-text"
            />
          </div>

          <nav className="toolbar-nav">
            <button
              className={`nav-btn ${currentPage === "video" ? "active" : ""}`}
              onClick={() => handleNavigate("video")}
            >
              Streams
            </button>
            <button
              className={`nav-btn ${currentPage === "status" ? "active" : ""}`}
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
              <div className="search-container">
                <div className="search-input-wrapper">
                  <FaSearch className="search-icon" />
                  <input
                    type="text"
                    className="search-input"
                    placeholder="Search cameras..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                  />
                  {searchQuery && (
                    <button
                      className="clear-search-btn"
                      onClick={handleClearSearch}
                      title="Clear search"
                    >
                      <FaTimes />
                    </button>
                  )}
                </div>
              </div>

              <div className="filter-buttons-container">
                <button
                  className={`filter-btn ${filter === "all" ? "active" : ""}`}
                  onClick={() => handleFilterChange("all")}
                >
                  All
                </button>
                <button
                  className={`filter-btn ${
                    filter === "streaming" ? "active" : ""
                  }`}
                  onClick={() => handleFilterChange("streaming")}
                >
                  Streaming
                </button>
                <button
                  className={`filter-btn ${filter === "fire" ? "active" : ""}`}
                  onClick={() => handleFilterChange("fire")}
                >
                  Fire
                </button>
                <button
                  className="filter-btn clear-filter-btn"
                  onClick={handleClearFilters}
                >
                  Clear
                </button>
              </div>

              <div className="sampling-rate-container">
                <label className="sampling-rate-label">Detect Every:</label>
                <select
                  className="sampling-rate-select"
                  value={samplingRate}
                  onChange={(e) =>
                    handleSamplingRateChange(Number(e.target.value))
                  }
                  disabled={updatingSamplingRate}
                >
                  {samplingRateOptions.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
                {updatingSamplingRate && (
                  <span className="sampling-rate-updating">⏳</span>
                )}
              </div>

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
              {visibleCameras.length === 0 ? (
                <div className="no-results">
                  <div className="no-results-icon">🔍</div>
                  <h3>No Matches Found</h3>
                  <p>
                    {searchQuery
                      ? `No cameras match "${searchQuery}"`
                      : filter !== "all"
                      ? `No cameras match the "${filter}" filter`
                      : "No cameras available"}
                  </p>
                  {(searchQuery || filter !== "all") && (
                    <button
                      className="clear-all-btn"
                      onClick={handleClearFilters}
                    >
                      Clear Filters
                    </button>
                  )}
                </div>
              ) : (
                <div className="modern-table">
                  <div className="modern-table-header">
                    <div className="header-cell name-col">Name</div>
                    <div className="header-cell location-col">Location</div>
                    <div className="header-cell ip-col">IP Address</div>
                    <div className="header-cell port-col">Port</div>
                    <div className="header-cell view-col">View</div>
                    <div className="header-cell stream-col">Stream</div>
                    <div className="header-cell fire-col">Fire</div>
                    <div className="header-cell detection-col">Detection</div>
                    <div className="header-cell aitype-col">AI Type</div>
                    <div className="header-cell actions-col">Actions</div>
                  </div>
                  <div className="modern-table-body">
                    {visibleCameras.map((c) => {
                      const isEditing = editingCameraId === c.id;
                      const isAnimatingOut = animatingOutIds.has(c.id);

                      return (
                        <div
                          key={c.id}
                          className={`modern-table-row ${
                            isAnimatingOut ? "deleting" : ""
                          }`}
                        >
                          <div className="table-cell name-col">
                            <span className="cell-label">Name</span>
                            {isEditing ? (
                              <input
                                type="text"
                                className="edit-input"
                                value={editedValues.name}
                                onChange={(e) =>
                                  handleFieldChange("name", e.target.value)
                                }
                              />
                            ) : (
                              <span className="cell-value">{c.name}</span>
                            )}
                          </div>
                          <div className="table-cell location-col">
                            <span className="cell-label">Location</span>
                            {isEditing ? (
                              <input
                                type="text"
                                className="edit-input"
                                value={editedValues.location}
                                onChange={(e) =>
                                  handleFieldChange("location", e.target.value)
                                }
                              />
                            ) : (
                              <span className="cell-value">{c.location}</span>
                            )}
                          </div>
                          <div className="table-cell ip-col">
                            <span className="cell-label">IP</span>
                            {isEditing ? (
                              <input
                                type="text"
                                className="edit-input"
                                value={editedValues.ip}
                                onChange={(e) =>
                                  handleFieldChange("ip", e.target.value)
                                }
                              />
                            ) : (
                              <span className="cell-value">
                                {c.ip || "N/A"}
                              </span>
                            )}
                          </div>
                          <div className="table-cell port-col">
                            <span className="cell-label">Port</span>
                            {isEditing ? (
                              <input
                                type="text"
                                className="edit-input"
                                value={editedValues.port}
                                onChange={(e) =>
                                  handleFieldChange("port", e.target.value)
                                }
                              />
                            ) : (
                              <span className="cell-value">
                                {c.port || "N/A"}
                              </span>
                            )}
                          </div>
                          <div className="table-cell view-col">
                            <span className="cell-label">View</span>
                            <ViewingStatusIcon isVisible={c.isVisible} />
                          </div>
                          <div className="table-cell stream-col">
                            <span className="cell-label">Stream</span>
                            <StreamingIcon
                              isStreaming={c.isStreaming}
                              size={28}
                            />
                          </div>
                          <div className="table-cell fire-col">
                            <span className="cell-label">Fire</span>
                            {c.isFire ? (
                              <ImFire
                                size={42}
                                style={{
                                  color: "#ff0000",
                                  filter: "drop-shadow(0 0 0 1px #ff6600)",
                                }}
                              />
                            ) : (
                              <FireStatusButton isFire={false} />
                            )}
                          </div>
                          <div className="table-cell detection-col">
                            <span className="cell-label">Detection</span>
                            <div className="detection-select-wrapper">
                              <select
                                className={`detection-select ${(
                                  c.detection || "LOCAL"
                                ).toLowerCase()} ${
                                  togglingDetection.has(c.id) ? "updating" : ""
                                }`}
                                value={c.detection || "LOCAL"}
                                onChange={(e) =>
                                  handleDetectionChange(c.id, e.target.value)
                                }
                                disabled={togglingDetection.has(c.id)}
                              >
                                <option value="LOCAL">💻 Local</option>
                                <option value="CLOUD">☁️ Cloud</option>
                                <option value="BOTH">🔄 Both</option>
                              </select>
                              {togglingDetection.has(c.id) && (
                                <span className="detection-updating">⏳</span>
                              )}
                            </div>
                          </div>
                          <div className="table-cell aitype-col">
                            <span className="cell-label">AI Type</span>
                            <div className="aitype-select-wrapper">
                              <select
                                className={`aitype-select ${
                                  updatingAiType.has(c.id) ? "updating" : ""
                                }`}
                                value={c.aiType || "FIRE"}
                                onChange={(e) =>
                                  handleAiTypeChange(c.id, e.target.value)
                                }
                                disabled={updatingAiType.has(c.id)}
                              >
                                <option value="FIRE">🔥 Fire Detect</option>
                                <option value="INTRUSION">🚶 Intrusion Detect</option>
                                <option value="CROWD_DENSITY">👥 Crowd Detect</option>
                                <option value="ANONYMIZATION">🕶️ Blur Faces</option>
                                <option value="WEAPON">🔫 Weapon Detect</option>
                              </select>
                            </div>
                          </div>
                          <div className="table-cell actions-col">
                            <span className="cell-label">Actions</span>
                            <div className="action-buttons">
                              <button
                                className={`action-btn ${
                                  isEditing ? "save-btn" : "edit-btn"
                                }`}
                                onClick={() => handleEditClick(c)}
                                title={
                                  isEditing ? "Save changes" : "Edit camera"
                                }
                              >
                                {isEditing ? (
                                  <FaSave size={16} />
                                ) : (
                                  <FaEdit size={16} />
                                )}
                              </button>
                              <button
                                className="action-btn delete-btn"
                                onClick={() => handleDeleteClick(c.id)}
                                title="Delete camera"
                              >
                                <FaTrash size={16} />
                              </button>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
