// Electron-specific configuration
export const isElectron = () => {
  return typeof window !== "undefined" && window.electronAPI;
};

export const getBackendUrl = () => {
  if (isElectron()) {
    return "http://localhost:4000"; // Backend runs locally in Electron
  }
  return process.env.VITE_BACKEND_URL || "http://localhost:4000";
};

export const getWebSocketUrl = () => {
  if (isElectron()) {
    return "ws://localhost:4000"; // WebSocket runs locally in Electron
  }
  return process.env.VITE_WS_URL || "ws://localhost:4000";
};

export const getMediaMTXUrl = (webrtcBase) => {
  if (isElectron()) {
    // In Electron, MediaMTX runs in Docker and advertises both LAN IP and 127.0.0.1
    // Replace LAN IP with 127.0.0.1 to connect via loopback (more reliable in Docker bridge mode)
    try {
      const url = new URL(webrtcBase);
      // Replace the hostname with 127.0.0.1 but keep the port
      return `${url.protocol}//127.0.0.1:${url.port || '8889'}`;
    } catch (e) {
      // Fallback if URL parsing fails
      return "http://127.0.0.1:8889";
    }
  }
  return webrtcBase;
};
