import React from "react";

export default function StreamingIcon({ isStreaming, size = 12 }) {
  return (
    <div className={`stream-icon-container ${isStreaming ? 'streaming' : 'offline'}`}>
      <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor">
        <rect x="2" y="3" width="20" height="14" rx="2" stroke="currentColor" strokeWidth="1.5" fill="none"/>
        <path d="M8 21l4-7 4 7"/>
      </svg>
      {!isStreaming && (
        <div className="streaming-cross">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
            <path d="M18 6L6 18M6 6l12 12" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
          </svg>
        </div>
      )}
    </div>
  );
}
