import pino from "pino";
import { detectFire, buildCameraUrl } from "./localDetector.js";
import {
  startCameraStream,
  stopCameraStream,
  isStreamActive,
} from "./streamManager.js";

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
const cameraStates = new Map(); // id -> { isFire, lastChecked, consecutiveStatic }

// -------------------------------------------------------------------
// 🔧 Configuration - Multi-Frame Detection (Drone Method)
// -------------------------------------------------------------------
const FRAMES_PER_CHECK = 3; // Extract 3 frames per camera turn
const BOX_IOU_THRESHOLD = 0.8; // 80% overlap = static (drone method)
const STATIC_THRESHOLD = 2; // Number of consecutive static detections before suppressing alert
const MIN_CAMERA_INTERVAL = 1000; // Minimum 1 second between cameras to prevent overload
const MIN_FRAME_INTERVAL = 500; // Minimum 500ms between frame extractions

// -------------------------------------------------------------------
// 🧮 Dynamic Sampling Rate Calculation
// -------------------------------------------------------------------

/**
 * Calculate the interval between camera checks based on sampling window and queue size
 * Algorithm: Distribute all cameras evenly across the sampling window
 *
 * Example: 10-second window with 5 cameras = 2 seconds per camera
 *          30-second window with 6 cameras = 5 seconds per camera
 *
 * @param {number} windowDuration - User's configured sampling window in milliseconds
 * @param {number} numCameras - Number of cameras in the queue
 * @returns {number} Interval in milliseconds between camera checks
 */
function calculateCameraInterval(windowDuration, numCameras) {
  if (numCameras === 0) {
    return windowDuration;
  }

  // Distribute cameras evenly across the window
  const interval = Math.floor(windowDuration / numCameras);

  // Enforce minimum interval to prevent system overload
  return Math.max(MIN_CAMERA_INTERVAL, interval);
}

/**
 * Calculate the interval between frame extractions for a camera
 * Algorithm: Split the per-camera interval by the number of frames
 *
 * Example: Camera gets 10 seconds, 3 frames = 3.33 seconds per frame
 *          Camera gets 3 seconds, 3 frames = 1 second per frame
 *
 * @param {number} cameraInterval - Time allocated for this camera in milliseconds
 * @returns {number} Interval in milliseconds between frame extractions
 */
function calculateFrameInterval(cameraInterval) {
  // Divide camera's time budget by number of frames
  const interval = Math.floor(cameraInterval / FRAMES_PER_CHECK);

  // Enforce minimum interval to ensure frames are temporally separated
  return Math.max(MIN_FRAME_INTERVAL, interval);
}

// -------------------------------------------------------------------
// 📊 IoU Calculation (Drone Method)
// -------------------------------------------------------------------

/**
 * Calculate Intersection over Union (IoU) between two bounding boxes
 * This is the EXACT method used in the drone code
 */
function computeIoU(box1, box2) {
  const [x1, y1, x2, y2] = box1;
  const [x1b, y1b, x2b, y2b] = box2;

  // Intersection coordinates
  const xi1 = Math.max(x1, x1b);
  const yi1 = Math.max(y1, y1b);
  const xi2 = Math.min(x2, x2b);
  const yi2 = Math.min(y2, y2b);

  // Intersection area
  const inter = Math.max(0, xi2 - xi1) * Math.max(0, yi2 - yi1);

  // Union area
  const area1 = (x2 - x1) * (y2 - y1);
  const area2 = (x2b - x1b) * (y2b - y1b);
  const union = area1 + area2 - inter;

  return union > 0 ? inter / union : 0;
}

/**
 * Analyze multiple frames using IoU method (like drone code)
 * Returns whether fire is static (false positive) or moving (real fire)
 */
function analyzeFireBoxes(frames) {
  if (frames.length < 2) {
    return {
      isStatic: false,
      reason: "insufficient_frames",
      framesAnalyzed: frames.length,
    };
  }

  // Get the largest fire box from each frame
  const boxes = frames
    .map((frame) => {
      if (!frame.boxes || frame.boxes.length === 0) {
        return null;
      }
      // Return the box with highest confidence (first box after NMS)
      return frame.boxes[0];
    })
    .filter((box) => box !== null);

  if (boxes.length < 2) {
    return {
      isStatic: false,
      reason: "insufficient_boxes",
      framesAnalyzed: frames.length,
    };
  }

  // Compare each consecutive pair using IoU
  const ious = [];
  for (let i = 1; i < boxes.length; i++) {
    const iou = computeIoU(boxes[i - 1], boxes[i]);
    ious.push(iou);

    log.debug(
      {
        frameComparison: `${i - 1} vs ${i}`,
        iou: iou.toFixed(3),
      },
      "🔍 Fire box IoU comparison"
    );
  }

  // Calculate average IoU
  const avgIoU = ious.reduce((sum, iou) => sum + iou, 0) / ious.length;

  // Check if fire is static (high IoU = boxes in same position)
  const isStatic = avgIoU > BOX_IOU_THRESHOLD;

  return {
    isStatic,
    avgIoU: avgIoU.toFixed(3),
    ious: ious.map((iou) => iou.toFixed(3)),
    reason: isStatic ? "static_fire_box" : "moving_fire_box",
    framesAnalyzed: frames.length,
    boxesCompared: boxes.length,
  };
}

// -------------------------------------------------------------------
// 🎬 Extract Multiple Frames from Camera
// -------------------------------------------------------------------
async function extractMultipleFrames(camera, frameInterval) {
  const frames = [];
  const cameraUrl = buildCameraUrl(camera);

  log.info(
    {
      id: camera.id,
      name: camera.name,
      frameCount: FRAMES_PER_CHECK,
      intervalMs: frameInterval,
    },
    `📸 Extracting ${FRAMES_PER_CHECK} frames for IoU analysis...`
  );

  for (let i = 0; i < FRAMES_PER_CHECK; i++) {
    try {
      // Extract frame
      const result = await detectFire(cameraUrl, camera.name);

      if (result.isFire) {
        // Store frame data for IoU analysis
        frames.push({
          timestamp: new Date().toISOString(),
          boxes: result.boxes.map((b) => [b[0], b[1], b[2], b[3]]), // Just coordinates [x1, y1, x2, y2]
          fireCount: result.fireCount,
          smokeCount: result.smokeCount,
          confidence: result.confidence,
          frameBuffer: result.frameBuffer,
        });

        log.info(
          {
            id: camera.id,
            name: camera.name,
            frameNumber: i + 1,
            fireCount: result.fireCount,
            smokeCount: result.smokeCount,
            boxes: result.boxes.length,
          },
          `🔥 Frame ${i + 1}/${FRAMES_PER_CHECK}: Fire detected`
        );
      } else {
        log.info(
          {
            id: camera.id,
            name: camera.name,
            frameNumber: i + 1,
          },
          `✅ Frame ${i + 1}/${FRAMES_PER_CHECK}: No fire`
        );
      }

      // Wait before extracting next frame (unless it's the last frame)
      if (i < FRAMES_PER_CHECK - 1) {
        await new Promise((resolve) => setTimeout(resolve, frameInterval));
      }
    } catch (error) {
      log.error(
        {
          id: camera.id,
          name: camera.name,
          frameNumber: i + 1,
          error: error.message,
        },
        `❌ Frame ${i + 1}/${FRAMES_PER_CHECK} extraction failed`
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
// 🔄 Update Sampling Rate (called when user updates settings)
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

  // Calculate new interval with updated queue size
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

  // Calculate new interval with updated queue size
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
    "▶️ Starting dynamic sampling detection queue (all cameras within window)"
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
      // ✅ Calculate dynamic intervals for this iteration
      const currentCameraInterval = calculateCameraInterval(
        samplingWindow,
        cameraQueue.length
      );
      const currentFrameInterval = calculateFrameInterval(currentCameraInterval);

      log.info(
        {
          id: camera.id,
          name: camera.name,
          position: `${currentIndex + 1}/${cameraQueue.length}`,
          cameraInterval: currentCameraInterval,
          frameInterval: currentFrameInterval,
        },
        "🔍 Starting IoU-based multi-frame check..."
      );

      // ✅ EXTRACT MULTIPLE FRAMES with dynamic interval
      const frames = await extractMultipleFrames(camera, currentFrameInterval);

      // Update last checked time
      state.lastChecked = new Date().toISOString();

      if (frames.length === 0) {
        // No fire detected in any frame
        log.info(
          {
            id: camera.id,
            name: camera.name,
          },
          "✅ No fire detected in any frame"
        );

        state.isFire = false;
        state.consecutiveStatic = 0;
      } else {
        // Fire detected in at least one frame - analyze using IoU
        log.warn(
          {
            id: camera.id,
            name: camera.name,
            framesWithFire: frames.length,
          },
          `🔥 Fire detected in ${frames.length}/${FRAMES_PER_CHECK} frames - analyzing IoU...`
        );

        // ✅ ANALYZE USING IoU METHOD (like drone code)
        const iouAnalysis = analyzeFireBoxes(frames);

        if (!iouAnalysis.isStatic) {
          // ✅ MOVING FIRE - Real fire detected!
          log.error(
            {
              id: camera.id,
              name: camera.name,
              ...iouAnalysis,
            },
            "🚨 REAL FIRE DETECTED (IoU < 95% = moving) - Broadcasting alert"
          );

          state.isFire = true;
          state.consecutiveStatic = 0;

          // Broadcast to WebSocket
          if (broadcastFireDetection) {
            broadcastFireDetection(camera.userId, camera.id, camera.name, true);
          }

          // Send SNS Alert with Frame (use last frame with fire)
          const lastFrame = frames[frames.length - 1];
          if (lastFrame && lastFrame.frameBuffer) {
            try {
              // Upload frame to S3
              const imageUrl = await uploadFireFrame(
                camera.id,
                lastFrame.frameBuffer
              );

              // Send SNS alert to user's email
              await sendFireAlert(
                camera.userId,
                camera.id,
                camera.name,
                {
                  isFire: true,
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
          // ❌ STATIC FIRE - False positive (poster/screen/image)
          state.consecutiveStatic++;

          log.warn(
            {
              id: camera.id,
              name: camera.name,
              consecutiveStatic: state.consecutiveStatic,
              ...iouAnalysis,
            },
            `⚠️ STATIC FIRE DETECTED (IoU ${iouAnalysis.avgIoU} > ${BOX_IOU_THRESHOLD}) - Likely poster/TV/image`
          );

          log.info(
            {
              id: camera.id,
              name: camera.name,
              consecutiveStatic: state.consecutiveStatic,
            },
            "🚫 Alert suppressed - static fire detected (poster/screen/painting) - NO BROADCAST"
          );

          state.isFire = false;
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

    // Move to next camera
    currentIndex = (currentIndex + 1) % cameraQueue.length;

    // ✅ Calculate dynamic interval based on current queue size and user's sampling window
    const nextInterval = calculateCameraInterval(
      samplingWindow,
      cameraQueue.length
    );

    log.debug(
      {
        samplingWindow,
        queueSize: cameraQueue.length,
        calculatedInterval: nextInterval,
      },
      "⏱️ Scheduling next camera check"
    );

    // Schedule next iteration with dynamic interval
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
  // Extract userId from first camera (all cameras belong to same user)
  if (cameras.length > 0 && cameras[0].userId) {
    currentUserId = cameras[0].userId;

    // Fetch user's sampling rate from DynamoDB
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
      samplingWindow = DEFAULT_SAMPLING_WINDOW; // Fallback to default
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
    "🚀 Initializing dynamic sampling detection queue (all cameras within window)"
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
  currentUserId = null;
  samplingWindow = DEFAULT_SAMPLING_WINDOW; // Reset to default
}
