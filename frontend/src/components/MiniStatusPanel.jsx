import React from "react";
import { useCameras } from "../store/cameras.jsx";

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
            <div className="status-icons">
              <span className={`fire-icon ${cam.isFire ? 'fire' : 'clear'}`}>
                {cam.isFire ? '🔥' : '✅'}
              </span>
              <span className={`stream-icon ${cam.isStreaming ? 'streaming' : 'offline'}`}>
                {cam.isStreaming ? (
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
                    <rect x="2" y="3" width="20" height="14" rx="2" stroke="currentColor" strokeWidth="1.5" fill="none"/>
                    <path d="M8 21l4-7 4 7"/>
                  </svg>
                ) : null}
              </span>
            </div>
            <span className="camera-name">{cam.name}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
