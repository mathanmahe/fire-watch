import React, { useState } from "react";
import { useCameras } from "../store/cameras.jsx";
import StreamingIcon from "./StreamingIcon.jsx";
import FireStatusButton from "./FireStatusButton.jsx";
import { FaEye, FaEyeSlash, FaStopCircle, FaPlayCircle } from "react-icons/fa";
import { ImFire } from "react-icons/im";
import { cameraApi } from "../services/cameraApi.js";

export default function MiniStatusPanel({ viewMode = "grid" }) {
  const {
    cameras,
    toggleCameraVisibility,
    setCameraVisibilities,
    resetAllCameraStatuses,
  } = useCameras();
  const [filter, setFilter] = useState("all");
  const [isStoppingDetection, setIsStoppingDetection] = useState(false);
  const [isStartingDetection, setIsStartingDetection] = useState(false);
  const [detectionRunning, setDetectionRunning] = useState(true); // Assume detection starts running

  const handleFilterChange = (newFilter) => {
    // Toggle off if clicking the same filter
    const finalFilter = filter === newFilter ? null : newFilter;
    setFilter(finalFilter);

    // Build visibility map based on filter
    const visibilityMap = {};

    cameras.forEach((cam) => {
      if (finalFilter === null) {
        // No filter selected - hide all cameras
        visibilityMap[cam.id] = false;
      } else if (finalFilter === "all") {
        visibilityMap[cam.id] = true;
      } else if (finalFilter === "streaming") {
        visibilityMap[cam.id] = cam.isStreaming;
      } else if (finalFilter === "fire") {
        visibilityMap[cam.id] = cam.isFire;
      }
    });

    setCameraVisibilities(visibilityMap);
  };

  const handleStopDetection = async () => {
    if (isStoppingDetection || cameras.length === 0) return;

    setIsStoppingDetection(true);
    try {
      const cameraIds = cameras.map((cam) => cam.id);
      const response = await cameraApi.stopDetectionForAllCameras(cameraIds);
      console.log("Stop detection response:", response);

      // Hide all cameras after stopping detection
      const hideAllCameras = {};
      cameras.forEach((cam) => {
        hideAllCameras[cam.id] = false;
      });
      setCameraVisibilities(hideAllCameras);

      // Reset all camera statuses (isFire and isStreaming to false)
      resetAllCameraStatuses();

      setDetectionRunning(false);

      // Show success message or handle response
      alert(
        `Successfully stopped detection for ${response.stopped.length} camera(s)`
      );
    } catch (error) {
      console.error("Failed to stop detection:", error);
      alert(`Failed to stop detection: ${error.message}`);
    } finally {
      setIsStoppingDetection(false);
    }
  };

  const handleStartDetection = async () => {
    if (isStartingDetection || cameras.length === 0) return;

    setIsStartingDetection(true);
    try {
      const cameraIds = cameras.map((cam) => cam.id);
      const response = await cameraApi.startDetectionForAllCameras(cameraIds);
      console.log("Start detection response:", response);

      // Update detection state
      setDetectionRunning(true);

      // Show success message
      alert(
        `Successfully started detection for ${response.started.length} camera(s)`
      );
    } catch (error) {
      console.error("Failed to start detection:", error);
      alert(`Failed to start detection: ${error.message}`);
    } finally {
      setIsStartingDetection(false);
    }
  };

  const isDisabled = viewMode === "single";

  if (!cameras || cameras.length === 0) {
    return (
      <div className="mini-status-panel">
        <div className="mini-status-header">
          <h3>Camera Status</h3>
          <div className="mini-status-filters">
            <button
              className={`filter-btn ${filter === "all" ? "active" : ""}`}
              onClick={() => handleFilterChange("all")}
              disabled={isDisabled}
            >
              All
            </button>
            <button
              className={`filter-btn ${filter === "streaming" ? "active" : ""}`}
              onClick={() => handleFilterChange("streaming")}
              disabled={isDisabled}
            >
              Streaming
            </button>
            <button
              className={`filter-btn ${filter === "fire" ? "active" : ""}`}
              onClick={() => handleFilterChange("fire")}
              disabled={isDisabled}
            >
              Fire
            </button>
          </div>
        </div>
        <div className="mini-status-empty">
          <p>No cameras available</p>
        </div>
      </div>
    );
  }

  return (
    <div className="mini-status-panel">
      <div className="mini-status-header">
        <h3>View</h3>
        <div className="mini-status-filters">
          <button
            className={`filter-btn ${filter === "all" ? "active" : ""}`}
            onClick={() => handleFilterChange("all")}
            disabled={isDisabled}
          >
            All
          </button>
          <button
            className={`filter-btn ${filter === "streaming" ? "active" : ""}`}
            onClick={() => handleFilterChange("streaming")}
            disabled={isDisabled}
          >
            Streaming
          </button>
          <button
            className={`filter-btn ${filter === "fire" ? "active" : ""}`}
            onClick={() => handleFilterChange("fire")}
            disabled={isDisabled}
          >
            Fire
          </button>
        </div>
      </div>
      <div className="mini-status-list">
        {cameras.map((cam) => (
          <div key={cam.id} className="mini-status-item">
            <button
              className={`visibility-toggle ${
                cam.isVisible ? "visible" : "hidden"
              }`}
              onClick={() => toggleCameraVisibility(cam.id)}
              title={cam.isVisible ? "Hide camera" : "Show camera"}
            >
              {cam.isVisible ? <FaEye size={28} /> : <FaEyeSlash size={28} />}
            </button>
            <span className="camera-name">{cam.name}</span>
            <div className="status-icons">
              {cam.isFire ? (
                <ImFire
                  size={26}
                  style={{
                    color: "#ff0000",
                    filter: "drop-shadow(0 0 0 1px #ff6600)",
                  }}
                />
              ) : (
                <FireStatusButton isFire={false} />
              )}
              <StreamingIcon isStreaming={cam.isStreaming} size={22} />
            </div>
          </div>
        ))}
      </div>

      {/* Stop Detection Button */}
      <div className="stop-detection-section">
        {detectionRunning ? (
          <button
            className={`stop-detection-btn ${
              isStoppingDetection ? "loading" : ""
            }`}
            onClick={handleStopDetection}
            disabled={isStoppingDetection || cameras.length === 0}
            title="Stop fire detection for all cameras"
          >
            <FaStopCircle size={20} />
            <span>
              {isStoppingDetection ? "Stopping..." : "Stop Detection"}
            </span>
          </button>
        ) : (
          <button
            className={`start-detection-btn ${
              isStartingDetection ? "loading" : ""
            }`}
            onClick={handleStartDetection}
            disabled={isStartingDetection || cameras.length === 0}
            title="Start fire detection for all cameras"
          >
            <FaPlayCircle size={20} />
            <span>
              {isStartingDetection ? "Starting..." : "Start Detection"}
            </span>
          </button>
        )}
      </div>
    </div>
  );
}
