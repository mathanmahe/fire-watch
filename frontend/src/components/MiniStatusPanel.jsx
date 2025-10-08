import React, { useState } from "react";
import { useCameras } from "../store/cameras.jsx";
import StreamingIcon from "./StreamingIcon.jsx";
import FireStatusButton from "./FireStatusButton.jsx";
import { FaEye, FaEyeSlash } from "react-icons/fa";
import { ImFire } from "react-icons/im";

export default function MiniStatusPanel({ viewMode = "grid" }) {
  const { cameras, toggleCameraVisibility, setCameraVisibilities } =
    useCameras();
  const [filter, setFilter] = useState("all");

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
    </div>
  );
}
