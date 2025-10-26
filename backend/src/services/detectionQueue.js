import pino from "pino";
import { detectFire, buildCameraUrl } from "./localDetector.js";
import {
  startCameraStream,
  stopCameraStream,
  isStreamActive,
} from "./streamManager.js";

import { sendFireAlert } from "./snsService.js";
import { uploadFireFrame } from "./s3Service.js";

const log = pino({ name: "detection-queue" });

// -------------------------------------------------------------------
// 📋 Queue State
// -------------------------------------------------------------------
let cameraQueue = [];
let currentIndex = 0;
let isRunning = false;
let loopInterval = null;
let broadcastFireDetection = null;

// Track detection state per camera (use id instead of cameraId)
const cameraStates = new Map(); // id -> { isFire, lastChecked }

// -------------------------------------------------------------------
// 🔧 Configuration
// -------------------------------------------------------------------
const INTERVAL_MS = 10000; // ✅ 10 seconds between cameras

// -------------------------------------------------------------------
// 🔌 Set Broadcast Function
// -------------------------------------------------------------------
export function setBroadcastFunction(fn) {
  broadcastFireDetection = fn;
  log.info("✅ Broadcast function registered");
}

// -------------------------------------------------------------------
// ➕ Add Camera to Queue
// -------------------------------------------------------------------
export function addCameraToQueue(camera) {
  const exists = cameraQueue.find((c) => c.id === camera.id);
  if (exists) {
    log.warn(
      { id: camera.id, name: camera.name },
      "Camera already in queue"
    );
    return;
  }

  cameraQueue.push(camera);

  // Initialize camera state
  cameraStates.set(camera.id, {
    isFire: false,
    lastChecked: null,
  });

  log.info(
    {
      id: camera.id,
      name: camera.name,
      queueSize: cameraQueue.length,
    },
    "📹 Camera added to detection queue"
  );

  if (!isRunning) {
    startQueueLoop();
  }
}

// -------------------------------------------------------------------
// ➖ Remove Camera from Queue
// -------------------------------------------------------------------
export function removeCameraFromQueue(id) {
  const index = cameraQueue.findIndex((c) => c.id === id);

  if (index === -1) {
    log.warn({ id }, "Camera not found in queue");
    return;
  }

  const camera = cameraQueue[index];
  cameraQueue.splice(index, 1);

  // Stop stream if active
  if (isStreamActive(id)) {
    stopCameraStream(camera);
  }

  cameraStates.delete(id);

  log.info(
    {
      id,
      name: camera.name,
      queueSize: cameraQueue.length,
    },
    "🗑️ Camera removed from detection queue"
  );

  if (currentIndex >= cameraQueue.length) {
    currentIndex = 0;
  }

  if (cameraQueue.length === 0 && isRunning) {
    stopQueueLoop();
  }
}

// -------------------------------------------------------------------
// ▶️ Start Detection Queue Loop
// -------------------------------------------------------------------
async function startQueueLoop() {
  if (isRunning) {
    log.warn("Detection queue already running");
    return;
  }

  isRunning = true;
  log.info(
    { queueSize: cameraQueue.length },
    "▶️ Starting detection queue loop"
  );

  async function loop() {
    if (!isRunning || cameraQueue.length === 0) {
      return;
    }

    const camera = cameraQueue[currentIndex];

    if (!camera) {
      log.warn({ currentIndex }, "No camera at current index");
      currentIndex = 0;
      loopInterval = setTimeout(loop, INTERVAL_MS);
      return;
    }

    const state = cameraStates.get(camera.id);

    try {
      log.info(
        {
          id: camera.id,
          name: camera.name,
          position: `${currentIndex + 1}/${cameraQueue.length}`,
        },
        "🔍 Checking camera..."
      );

      // Build camera URL
      const cameraUrl = buildCameraUrl(camera);

      // Run fire detection
      const result = await detectFire(cameraUrl, camera.name);

      // Update last checked time
      state.lastChecked = new Date().toISOString();

      // ✅ SIMPLE LOGIC: Fire detected = START, No fire = STOP
      if (result.isFire) {
        log.warn(
          {
            id: camera.id,
            name: camera.name,
            confidence: result.confidence,
            fireCount: result.fireCount,
            smokeCount: result.smokeCount,
          },
          "🔥 FIRE/SMOKE DETECTED"
        );

        // ✅ Broadcast EVERY TIME fire is detected
        log.warn(
          {
            id: camera.id,
            name: camera.name,
            wasAlreadyFire: state.isFire,
          },
          "🚨 FIRE - Broadcasting"
        );

        state.isFire = true;

        // Broadcast to WebSocket
        if (broadcastFireDetection) {
          broadcastFireDetection(
            camera.userId,
            camera.id,
            camera.name,
            true
          );
        }

        // Send SNS Alert with Frame
        if (result.frameBuffer) {
          try {
            // Upload frame to S3
            const imageUrl = await uploadFireFrame(
              camera.id,
              result.frameBuffer
            );

            // Send SNS alert to user's email
            await sendFireAlert(
              camera.userId,
              camera.id,
              camera.name,
              result,
              imageUrl
            );

            log.info("✅ SNS alert with image sent successfully");
          } catch (error) {
            log.error(
              {
                userId: camera.userId,
                cameraId: camera.id,
                error: error.message,
              },
              "❌ SNS alert with image failed"
            );
          }
        }
      } else {
        // ✅ No fire detected - just update state
        log.info(
          {
            id: camera.id,
            name: camera.name,
          },
          "✅ No fire detected"
        );

        // Update state to false (so next fire detection will trigger broadcast)
        state.isFire = false;
      }
    } catch (error) {
      log.error(
        {
          id: camera.id,
          name: camera.name,
          error: error.message,
        },
        "❌ Detection error"
      );
    }

    // Move to next camera
    currentIndex = (currentIndex + 1) % cameraQueue.length;

    // Schedule next iteration
    loopInterval = setTimeout(loop, INTERVAL_MS);
  }

  loop();
}

// -------------------------------------------------------------------
// ⏸️ Stop Detection Queue Loop
// -------------------------------------------------------------------
function stopQueueLoop() {
  if (!isRunning) {
    return;
  }

  isRunning = false;

  if (loopInterval) {
    clearTimeout(loopInterval);
    loopInterval = null;
  }

  log.info("⏸️ Detection queue stopped");
}

// -------------------------------------------------------------------
// 📊 Get Queue Status
// -------------------------------------------------------------------
export function getQueueStatus() {
  const fireDetections = {};
  const lastChecked = {};
  const streamingCameras = new Set();

  for (const [id, state] of cameraStates.entries()) {
    fireDetections[id] = state.isFire;
    lastChecked[id] = state.lastChecked;

    if (state.isFire) {
      streamingCameras.add(id);
    }
  }

  return {
    isRunning,
    cameras: cameraQueue,
    currentIndex,
    queueSize: cameraQueue.length,
    fireDetections,
    lastChecked,
    streamingCameras,
  };
}

// -------------------------------------------------------------------
// 🚀 Start Queue with Initial Cameras
// -------------------------------------------------------------------
export async function startDetectionQueue(cameras) {
  log.info({ count: cameras.length }, "🚀 Initializing detection queue");

  for (const camera of cameras) {
    addCameraToQueue(camera);
  }

  if (cameras.length > 0 && !isRunning) {
    startQueueLoop();
  }
}

// -------------------------------------------------------------------
// 🛑 Stop Queue and Clean Up
// -------------------------------------------------------------------
export async function stopDetectionQueue() {
  log.info("🛑 Stopping detection queue");

  stopQueueLoop();

  // Stop all active streams
  for (const camera of cameraQueue) {
    const state = cameraStates.get(camera.id);
    if (state && state.isFire) {
      await stopCameraStream(camera);
    }
  }

  cameraQueue = [];
  cameraStates.clear();
  currentIndex = 0;
}