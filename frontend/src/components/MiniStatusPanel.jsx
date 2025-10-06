import React from "react";
import { useCameras } from "../store/cameras.jsx";
import StreamingIcon from "./StreamingIcon.jsx";
import FireStatusButton from "./FireStatusButton.jsx";
import { FaEye, FaEyeSlash } from "react-icons/fa";
import { ImFire } from "react-icons/im";

export default function MiniStatusPanel() {
  const { cameras, toggleCameraVisibility } = useCameras();

  if (!cameras || cameras.length === 0) {
    return (
      <div className="mini-status-panel">
        <div className="mini-status-header">
          <h3>Camera Status</h3>
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
        <h3>Camera Status</h3>
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
