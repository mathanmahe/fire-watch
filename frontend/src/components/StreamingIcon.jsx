import React from "react";
import { BsFillCameraVideoFill } from "react-icons/bs";
import { BsFillCameraVideoOffFill } from "react-icons/bs";

export default function StreamingIcon({ isStreaming, size = 12 }) {
  const iconColor = isStreaming ? "#03dac6" : "#f3d078"; // Teal for streaming (same as no fire), Yellow for offline
  const iconStyle = {
    color: iconColor,
    filter: "drop-shadow(0 0 0 1px #000000)",
    WebkitFilter: "drop-shadow(0 0 0 1px #000000)",
  };

  return (
    <div
      className={`stream-icon-container ${
        isStreaming ? "streaming" : "offline"
      }`}
    >
      {isStreaming ? (
        <BsFillCameraVideoFill size={size} style={iconStyle} />
      ) : (
        <BsFillCameraVideoOffFill size={size} style={iconStyle} />
      )}
    </div>
  );
}
