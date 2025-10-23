// src/hooks/useWebSocket.js
import { useEffect, useCallback, useRef } from "react";
import { initWebSocket, closeWebSocket } from "../utils/webSocketClient.js";
import { useCameras } from "../store/cameras.jsx";

/**
 * Custom hook to manage WebSocket connection for fire detection alerts.
 * Automatically shows cameras and starts streams when fire is detected.
 */
export function useWebSocket() {
  const { updateCameraStatus, setCameraVisibilityById } = useCameras();
  const isInitialized = useRef(false);

  const handleFireDetection = useCallback(
    (cameraId, isFire) => {
      console.log(`🔥 Fire detection update: Camera ${cameraId}, isFire=${isFire}`);

      // Update fire status
      updateCameraStatus(cameraId, { isFire });

      // When fire is detected, automatically show the camera and start stream
      if (isFire) {
        console.log(`🎥 Auto-showing camera ${cameraId} due to fire detection`);
        setCameraVisibilityById(cameraId, true);
      }
    },
    [updateCameraStatus, setCameraVisibilityById]
  );

  useEffect(() => {
    // Prevent multiple initializations
    if (isInitialized.current) return;

    console.log("🔌 Initializing WebSocket connection...");
    isInitialized.current = true;
    initWebSocket(handleFireDetection);

    return () => {
      console.log("🔌 Cleaning up WebSocket connection...");
      closeWebSocket();
      isInitialized.current = false;
    };
  }, [handleFireDetection]);
}
