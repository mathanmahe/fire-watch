// src/utils/websocketClient.js
import { fetchAuthSession } from "aws-amplify/auth";
import { getWebSocketUrl } from "../config/electron.js";

let ws = null;
let reconnectTimer = null;
let onFireDetectionCallback = null;

/**
 * Initialize WebSocket connection.
 *  - Authenticates with Cognito ID token
 *  - Listens for "fire-detection" messages
 *  - Calls the provided callback to update camera state
 *
 * @param {Function} onFireDetection - Callback function (cameraId, isFire) => void
 */
export async function initWebSocket(onFireDetection) {
  onFireDetectionCallback = onFireDetection;

  try {
    const session = await fetchAuthSession();
    const token = session.tokens?.idToken?.toString();

    if (!token) {
      console.warn("⚠️ No Cognito token — skipping WebSocket init");
      return;
    }

    // Get base WebSocket URL and append token
    const baseWsUrl = getWebSocketUrl();
    const wsUrl = `${baseWsUrl}?token=${token}`;

    console.log("🌐 Connecting to WebSocket:", wsUrl);
    ws = new WebSocket(wsUrl);

    ws.onopen = () => console.log("✅ WebSocket connected");

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);

        if (data.type === "connected") {
          console.log("📡 WebSocket handshake complete");
        } else if (data.type === "fire-detection") {
          console.log("🔥 Fire event:", data);
          if (onFireDetectionCallback) {
            onFireDetectionCallback(data.cameraId, data.isFire);
          }
        }
      } catch (err) {
        console.error("❌ Error parsing WebSocket message:", err);
      }
    };

    ws.onclose = (evt) => {
      console.warn("⚠️ WebSocket closed:", evt.code, evt.reason);
      reconnectTimer = setTimeout(
        () => initWebSocket(onFireDetectionCallback),
        5000
      );
    };

    ws.onerror = (err) => {
      console.error("❌ WebSocket error:", err);
      ws.close();
    };
  } catch (err) {
    console.error("🚨 Failed to init WebSocket:", err);
  }
}

export function closeWebSocket() {
  if (reconnectTimer) clearTimeout(reconnectTimer);
  if (ws) {
    ws.close();
    ws = null;
  }
  onFireDetectionCallback = null;
}
