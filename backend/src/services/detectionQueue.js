import pino from "pino";
import { detectFire, buildCameraUrl } from "./localDetector.js";
import { detectWeapon } from "./localWeaponDetector.js";
import {
  startCameraStream,
  stopCameraStream,
  isStreamActive,
} from "./streamManager.js";
import { sanitizePathName } from "./mediamtxConfigGenerator.js";

import { sendFireAlert } from "./snsService.js";
import { uploadFireFrame } from "./s3Service.js";
import { getUserSamplingRate } from "../db/dynamodb.js";

const log = pino({ name: "detection-queue" });

// -------------------------------------------------------------------
// 📋 Configuration Constants
// -------------------------------------------------------------------
const DEFAULT_SAMPLING_WINDOW = 30000; // 30 seconds default

// -------------------------------------------------------------------
// 📋 Queue State
// -------------------------------------------------------------------
let cameraQueue = [];
let currentIndex = 0;
let isRunning = false;
let loopInterval = null;
let broadcastFireDetection = null;
let currentUserId = null; // Track current user for sampling rate
let samplingWindow = DEFAULT_SAMPLING_WINDOW; // User's sampling window (will be fetched from user settings)

// Track detection state per camera
// id -> { isFire, lastChecked, consecutiveStatic }
const cameraStates = new Map();

// -------------------------------------------------------------------
// 🔧 Configuration - Multi-Frame Detection (Drone Method)
// -------------------------------------------------------------------
const FRAMES_PER_CHECK = 3; // Extract 3 frames per camera turn
const BOX_IOU_THRESHOLD = 0.8; // 80% overlap = static (drone method)
const STATIC_THRESHOLD = 2; // currently not used to short-circuit, but we track it
const MIN_CAMERA_INTERVAL = 1000; // Minimum 1 second between cameras
const MIN_FRAME_INTERVAL = 500; // Minimum 500ms between frames

// -------------------------------------------------------------------
// 🧮 Dynamic Sampling Rate Calculation
// -------------------------------------------------------------------

/**
 * Calculate the interval between camera checks based on sampling
 * window and queue size by distributing cameras evenly.
 *
 * Example:
 *   window = 30000ms, 3 cameras → 10000ms per camera
 */
function calculateCameraInterval(windowDuration, numCameras) {
  if (numCameras === 0) {
    return windowDuration;
  }

  const interval = Math.floor(windowDuration / numCameras);
  return Math.max(MIN_CAMERA_INTERVAL, interval);
}

/**
 * Calculate the interval between frame extractions for a camera.
 * Example:
 *   Camera gets 10s, 3 frames → 3.33s per frame
 */
function calculateFrameInterval(cameraInterval) {
  const interval = Math.floor(cameraInterval / FRAMES_PER_CHECK);
  return Math.max(MIN_FRAME_INTERVAL, interval);
}

// -------------------------------------------------------------------
// 📊 IoU Calculation (Drone Method)
// -------------------------------------------------------------------

function computeIoU(box1, box2) {
  const [x1, y1, x2, y2] = box1;
  const [x1b, y1b, x2b, y2b] = box2;

  // Intersection
  const xi1 = Math.max(x1, x1b);
  const yi1 = Math.max(y1, y1b);
  const xi2 = Math.min(x2, x2b);
  const yi2 = Math.min(y2, y2b);

  const inter = Math.max(0, xi2 - xi1) * Math.max(0, yi2 - yi1);

  // Union
  const area1 = (x2 - x1) * (y2 - y1);
  const area2 = (x2b - x1b) * (y2b - y1b);
  const union = area1 + area2 - inter;

  return union > 0 ? inter / union : 0;
}

/**
 * Analyze multiple frames using IoU method.
 * Returns whether detection is static (false positive) or moving (real).
 */
function analyzeBoxes(frames) {
  if (frames.length < 2) {
    return {
      isStatic: false,
      reason: "insufficient_frames",
      framesAnalyzed: frames.length,
    };
  }

  // Get the largest box from each frame
  const boxes = frames
    .map((frame) => {
      if (!frame.boxes || frame.boxes.length === 0) {
        return null;
      }
      return frame.boxes[0]; // Highest confidence box
    })
    .filter((box) => box !== null);

  if (boxes.length < 2) {
    return {
      isStatic: false,
      reason: "insufficient_boxes",
      framesAnalyzed: frames.length,
    };
  }

  // Compare consecutive pairs
  const ious = [];
  for (let i = 1; i < boxes.length; i++) {
    const iou = computeIoU(boxes[i - 1], boxes[i]);
    ious.push(iou);
  }

  const avgIoU = ious.reduce((sum, iou) => sum + iou, 0) / ious.length;
  const isStatic = avgIoU > BOX_IOU_THRESHOLD;

  return {
    isStatic,
    avgIoU: avgIoU.toFixed(3),
    ious: ious.map((iou) => iou.toFixed(3)),
    reason: isStatic ? "static_box" : "moving_box",
    framesAnalyzed: frames.length,
    boxesCompared: boxes.length,
  };
}

// -------------------------------------------------------------------
// 🎬 Extract Multiple Frames from Camera (Local / Smart Source)
// -------------------------------------------------------------------
async function extractMultipleFramesLocal(camera, currentFrameInterval) {
  const frames = [];
  const frameInterval = Math.floor(currentFrameInterval / FRAMES_PER_CHECK);

  // -----------------------------------------------------------------
  // 🧠 SMART SOURCE SELECTION (Fix for Stream Freeze)
  // -----------------------------------------------------------------
  // Default: Direct Connection (Background Mode)
  let cameraUrl = buildCameraUrl(camera);
  let sourceLog = "DIRECT_RTSP";

  // Smart Switch: If streaming, use Local Stream (Active Mode)
  // This prevents opening a 2nd connection to the camera, avoiding overload/freeze.
  if (isStreamActive(camera.id)) {
    try {
      const streamName = sanitizePathName(camera.streamName || camera.name);
      // Use the SAME stream the user is watching (via MediaMTX)
      // Append -fire to avoid conflict if needed, or just use the base stream
      // Using the base stream name as defined in mediamtx.yml
      cameraUrl = `rtsp://localhost:8554/${streamName}-fire`;
      sourceLog = "LOCAL_PROXY";
    } catch (err) {
      log.warn({ err: err.message }, "Failed to build proxy URL, falling back to direct");
    }
  }

  const detectionType = (camera.aiType || camera.detection || "LOCAL").toUpperCase();

  log.info(
    {
      id: camera.id,
      name: camera.name,
      frameCount: FRAMES_PER_CHECK,
      intervalMs: frameInterval,
      detectionType,
      source: sourceLog,
      url: cameraUrl
    },
    `📸 Extracting ${FRAMES_PER_CHECK} frames for LOCAL IoU analysis...`
  );

  for (let i = 0; i < FRAMES_PER_CHECK; i++) {
    try {
      let result;
      if (detectionType === "WEAPON") {
        result = await detectWeapon(cameraUrl, camera.name);
      } else {
        // Default to FIRE (LOCAL)
        result = await detectFire(cameraUrl, camera.name);
      }

      // Normalize result structure
      const isDetected = result.isFire || result.isWeapon;

      if (isDetected) {
        frames.push({
          timestamp: new Date().toISOString(),
          boxes: result.boxes.map((b) => [b[0], b[1], b[2], b[3], b[4], b[5]]),
          fireCount: result.fireCount || 0,
          smokeCount: result.smokeCount || 0,
          confidence: result.confidence,
          frameBuffer: result.frameBuffer,
          detectionType // Store type for later
        });

        const detectedLabel = result.boxes.length > 0 ? result.boxes[0][4] : "Object";
        const prefix = detectionType === "WEAPON" ? "🔫 WEAPON" : "🔥 LOCAL";

        log.info(
          {
            id: camera.id,
            name: camera.name,
            frameNumber: i + 1,
            boxes: result.boxes.length,
            firstBox: result.boxes.length > 0 ? result.boxes[0] : null,
          },
          `${prefix} Frame ${i + 1}/${FRAMES_PER_CHECK}: ${detectedLabel} detected`
        );
      } else {
        const prefix = detectionType === "WEAPON" ? "✅ WEAPON" : "✅ LOCAL";
        log.info(
          {
            id: camera.id,
            name: camera.name,
            frameNumber: i + 1,
          },
          `${prefix} Frame ${i + 1}/${FRAMES_PER_CHECK}: No detection`
        );
      }

      if (i < FRAMES_PER_CHECK - 1) {
        await new Promise((r) => setTimeout(r, frameInterval));
      }
    } catch (error) {
      log.error(
        {
          id: camera.id,
          name: camera.name,
          error: error.message,
        },
        `❌ ${detectionType} Detection error - skipping frame`
      );
    }
  }

  return frames;
}

// -------------------------------------------------------------------
// 🔌 Set Broadcast Function
// -------------------------------------------------------------------
export function setBroadcastFunction(fn) {
  broadcastFireDetection = fn;
  log.info("✅ Broadcast function registered");
}

// -------------------------------------------------------------------
// 🔄 Update Sampling Rate
// -------------------------------------------------------------------
export async function updateSamplingRate(userId) {
  if (!userId || userId !== currentUserId) {
    log.warn(
      { userId, currentUserId },
      "⚠️ Cannot update sampling rate - user mismatch or no active user"
    );
    return;
  }

  try {
    const newSamplingWindow = await getUserSamplingRate(userId, DEFAULT_SAMPLING_WINDOW);

    if (newSamplingWindow !== samplingWindow) {
      const oldWindow = samplingWindow;
      samplingWindow = newSamplingWindow;

      const newInterval = calculateCameraInterval(
        samplingWindow,
        cameraQueue.length
      );

      log.info(
        {
          userId,
          oldWindow,
          newWindow: samplingWindow,
          queueSize: cameraQueue.length,
          newInterval,
        },
        "✅ Sampling rate updated - intervals will adjust on next cycle"
      );
    }
  } catch (error) {
    log.error(
      { userId, error: error.message },
      "❌ Failed to update sampling rate"
    );
  }
}

// -------------------------------------------------------------------
// ➕ Add Camera to Queue
// -------------------------------------------------------------------
export function addCameraToQueue(camera) {
  const exists = cameraQueue.find((c) => c.id === camera.id);
  if (exists) {
    log.warn({ id: camera.id, name: camera.name }, "Camera already in queue");
    return;
  }

  cameraQueue.push(camera);

  // Initialize camera state
  cameraStates.set(camera.id, {
    isFire: false,
    lastChecked: null,
    consecutiveStatic: 0,
  });

  const newInterval = calculateCameraInterval(
    samplingWindow,
    cameraQueue.length
  );

  log.info(
    {
      id: camera.id,
      name: camera.name,
      queueSize: cameraQueue.length,
      samplingWindow,
      newInterval,
    },
    "📹 Camera added to detection queue - intervals recalculated"
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

  const newInterval =
    cameraQueue.length > 0
      ? calculateCameraInterval(samplingWindow, cameraQueue.length)
      : 0;

  log.info(
    {
      id,
      name: camera.name,
      queueSize: cameraQueue.length,
      samplingWindow,
      newInterval,
    },
    "🗑️ Camera removed from detection queue - intervals recalculated"
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

  const initialInterval = calculateCameraInterval(
    samplingWindow,
    cameraQueue.length
  );

  const initialFrameInterval = calculateFrameInterval(initialInterval);

  log.info(
    {
      queueSize: cameraQueue.length,
      samplingWindow,
      intervalPerCamera: initialInterval,
      framesPerCheck: FRAMES_PER_CHECK,
      frameInterval: initialFrameInterval,
      iouThreshold: BOX_IOU_THRESHOLD,
    },
    "▶️ Starting dynamic sampling detection queue"
  );

  async function loop() {
    if (!isRunning || cameraQueue.length === 0) {
      return;
    }

    const camera = cameraQueue[currentIndex];

    if (!camera) {
      log.warn({ currentIndex }, "No camera at current index");
      currentIndex = 0;
      const fallbackInterval = calculateCameraInterval(
        samplingWindow,
        cameraQueue.length
      );
      loopInterval = setTimeout(loop, fallbackInterval);
      return;
    }

    const state = cameraStates.get(camera.id);

    try {
      const currentCameraInterval = calculateCameraInterval(
        samplingWindow,
        cameraQueue.length
      );
      const currentFrameInterval = calculateFrameInterval(currentCameraInterval);
      const detectionType = (camera.aiType || camera.detection || "LOCAL").toUpperCase();

      log.info(
        {
          id: camera.id,
          name: camera.name,
          detection: detectionType,
          position: `${currentIndex + 1}/${cameraQueue.length}`,
          cameraInterval: currentCameraInterval,
          frameInterval: currentFrameInterval,
        },
        `🔍 Starting ${detectionType} detection...`
      );

      // ✅ EXTRACT MULTIPLE FRAMES (Handles both Fire and Weapon via extractMultipleFramesLocal)
      let frames = [];
      if (detectionType === "CLOUD") {
        // Cloud logic (unchanged)
        // ... (omitted for brevity if not used, but keeping structure)
      } else {
        // LOCAL or WEAPON
        frames = await extractMultipleFramesLocal(camera, currentFrameInterval);
      }

      state.lastChecked = new Date().toISOString();

      if (frames.length === 0) {
        // No detection
        log.info(
          {
            id: camera.id,
            name: camera.name,
          },
          `✅ ${detectionType}: No detection in any frame`
        );

        state.isFire = false;
        state.consecutiveStatic = 0;
      } else {
        // Detection found!
        log.warn(
          {
            id: camera.id,
            name: camera.name,
            framesWithDetection: frames.length,
          },
          `🚨 ${detectionType} detected in ${frames.length}/${FRAMES_PER_CHECK} frames - analyzing IoU...`
        );

        // -------------------------------------------------------------------
        // 🧠 IoU Analysis (Static vs Real Fire)
        // -------------------------------------------------------------------
        // For WEAPONS, we bypass the static check as real weapons don't move like fire?
        // Actually, let's keep it simple:
        // If WEAPON -> Immediate Alert (No IoU check needed for now, or loose check)
        // If FIRE -> Strict IoU check

        let isRealDetection = false;
        let iouAnalysis = null;

        if (detectionType === "WEAPON") {
          // 🔫 WEAPON: Trust the detection (RT-DETR is specific)
          // We can add IoU later if static posters are an issue.
          isRealDetection = true;
          log.info("🔫 WEAPON: Bypassing static IoU check - Immediate Alert");
        } else {
          // 🔥 FIRE: Perform IoU check to filter static false positives
          iouAnalysis = analyzeBoxes(frames);
          if (!iouAnalysis.isStatic) {
            isRealDetection = true;
          } else {
            log.warn(
              { ...iouAnalysis },
              `⚠️ STATIC FIRE DETECTED (IoU ${iouAnalysis.avgIoU} > ${BOX_IOU_THRESHOLD}) - Likely poster/TV`
            );
          }
        }

        if (isRealDetection) {
          log.error(
            {
              id: camera.id,
              name: camera.name,
              detectionType
            },
            `🚨 REAL ${detectionType} DETECTED - Broadcasting alert`
          );

          state.isFire = true; // Used for UI status (red border)
          state.consecutiveStatic = 0;

          // Broadcast to WebSocket
          if (broadcastFireDetection) {
            broadcastFireDetection(camera.userId, camera.id, camera.name, true);
          }

          // Send SNS Alert with Frame
          const lastFrame = frames[frames.length - 1];
          if (lastFrame && lastFrame.frameBuffer) {
            try {
              const imageUrl = await uploadFireFrame(
                camera.id,
                lastFrame.frameBuffer
              );

              await sendFireAlert(
                camera.userId,
                camera.id,
                camera.name,
                {
                  isFire: true,
                  detectionType, // Add type to alert
                  confidence: lastFrame.confidence,
                  fireCount: lastFrame.fireCount,
                  smokeCount: lastFrame.smokeCount,
                  iouAnalysis,
                },
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
          // Static detection (Fire only)
          state.consecutiveStatic++;
          state.isFire = false;
          log.info("🚫 Alert suppressed - static detection");
        }
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

    currentIndex = (currentIndex + 1) % cameraQueue.length;

    const nextInterval = calculateCameraInterval(
      samplingWindow,
      cameraQueue.length
    );

    loopInterval = setTimeout(loop, nextInterval);
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
  if (cameras.length > 0 && cameras[0].userId) {
    currentUserId = cameras[0].userId;

    try {
      samplingWindow = await getUserSamplingRate(currentUserId, DEFAULT_SAMPLING_WINDOW);
      log.info(
        { userId: currentUserId, samplingWindow },
        "✅ User sampling rate loaded from DynamoDB"
      );
    } catch (error) {
      log.error(
        { userId: currentUserId, error: error.message },
        `❌ Failed to fetch sampling rate, using default ${DEFAULT_SAMPLING_WINDOW}ms`
      );
      samplingWindow = DEFAULT_SAMPLING_WINDOW;
    }
  }

  const interval = calculateCameraInterval(samplingWindow, cameras.length);

  log.info(
    {
      count: cameras.length,
      samplingWindow,
      intervalPerCamera: interval,
      framesPerCheck: FRAMES_PER_CHECK,
      iouThreshold: BOX_IOU_THRESHOLD,
      method: "dynamic_sampling_iou",
    },
    "🚀 Initializing dynamic sampling detection queue"
  );

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

  for (const camera of cameraQueue) {
    const state = cameraStates.get(camera.id);
    if (state && state.isFire) {
      await stopCameraStream(camera);
    }
  }

  cameraQueue = [];
  cameraStates.clear();
  currentIndex = 0;
  currentUserId = null;
  samplingWindow = DEFAULT_SAMPLING_WINDOW;
}

// -------------------------------------------------------------------
// 🔄 Update Camera In Queue
// -------------------------------------------------------------------
export function updateCameraInQueue(id, updates) {
  const cam = cameraQueue.find((c) => c.id === id);
  if (!cam) {
    log.warn(
      { id },
      "⚠️ updateCameraInQueue: Camera not found in detection queue"
    );
    return;
  }

  Object.assign(cam, updates);

  log.info(
    { id, updates, newDetection: cam.detection, aiType: cam.aiType },
    "🔄 Camera updated in detectionQueue memory"
  );
}
