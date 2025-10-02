import React from "react";
import { useCameras } from "../store/cameras.jsx";
import StreamingIcon from "./StreamingIcon.jsx";
import FireStatusButton from "./FireStatusButton.jsx";

export default function MiniStatusPanel() {
  const { cameras } = useCameras();

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
            <span className="camera-name">{cam.name}</span>
            <div className="status-icons">
              {cam.isFire ? (
                <span className="fire-icon fire">🔥</span>
              ) : (
                <FireStatusButton isFire={false} />
              )}
              <StreamingIcon isStreaming={cam.isStreaming} size={12} />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
