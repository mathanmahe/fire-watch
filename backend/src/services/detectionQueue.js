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

// Track detection state per camera
const cameraStates = new Map(); // id -> { isFire, lastChecked, consecutiveStatic }

// -------------------------------------------------------------------
// 🔧 Configuration - Multi-Frame Detection (Drone Method)
// -------------------------------------------------------------------
const CAMERA_ROTATION_INTERVAL = 10000; // 10 seconds per camera slot
const FRAMES_PER_CHECK = 3; // Extract 3 frames per camera turn
const FRAME_INTERVAL = 3000; // 3 seconds between frame extractions
const BOX_IOU_THRESHOLD = 0.80; // 95% overlap = static (drone method)
const STATIC_THRESHOLD = 2; // Number of consecutive static detections before suppressing alert

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
      framesAnalyzed: frames.length
    };
  }

  // Get the largest fire box from each frame
  const boxes = frames.map(frame => {
    if (!frame.boxes || frame.boxes.length === 0) {
      return null;
    }
    // Return the box with highest confidence (first box after NMS)
    return frame.boxes[0];
  }).filter(box => box !== null);

  if (boxes.length < 2) {
    return {
      isStatic: false,
      reason: "insufficient_boxes",
      framesAnalyzed: frames.length
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
        iou: iou.toFixed(3)
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
    ious: ious.map(iou => iou.toFixed(3)),
    reason: isStatic ? "static_fire_box" : "moving_fire_box",
    framesAnalyzed: frames.length,
    boxesCompared: boxes.length
  };
}

// -------------------------------------------------------------------
// 🎬 Extract Multiple Frames from Camera
// -------------------------------------------------------------------
async function extractMultipleFrames(camera) {
  const frames = [];
  const cameraUrl = buildCameraUrl(camera);

  log.info(
    { 
      id: camera.id, 
      name: camera.name, 
      frameCount: FRAMES_PER_CHECK,
      intervalMs: FRAME_INTERVAL
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
          boxes: result.boxes.map(b => [b[0], b[1], b[2], b[3]]), // Just coordinates [x1, y1, x2, y2]
          fireCount: result.fireCount,
          smokeCount: result.smokeCount,
          confidence: result.confidence,
          frameBuffer: result.frameBuffer
        });

        log.info(
          {
            id: camera.id,
            name: camera.name,
            frameNumber: i + 1,
            fireCount: result.fireCount,
            smokeCount: result.smokeCount,
            boxes: result.boxes.length
          },
          `🔥 Frame ${i + 1}/${FRAMES_PER_CHECK}: Fire detected`
        );
      } else {
        log.info(
          {
            id: camera.id,
            name: camera.name,
            frameNumber: i + 1
          },
          `✅ Frame ${i + 1}/${FRAMES_PER_CHECK}: No fire`
        );
      }

      // Wait before extracting next frame (unless it's the last frame)
      if (i < FRAMES_PER_CHECK - 1) {
        await new Promise(resolve => setTimeout(resolve, FRAME_INTERVAL));
      }

    } catch (error) {
      log.error(
        {
          id: camera.id,
          name: camera.name,
          frameNumber: i + 1,
          error: error.message
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
    consecutiveStatic: 0
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
    { 
      queueSize: cameraQueue.length,
      framesPerCheck: FRAMES_PER_CHECK,
      frameInterval: FRAME_INTERVAL,
      iouThreshold: BOX_IOU_THRESHOLD,
      rotationInterval: CAMERA_ROTATION_INTERVAL
    },
    "▶️ Starting IoU-based detection queue loop (drone method)"
  );

  async function loop() {
    if (!isRunning || cameraQueue.length === 0) {
      return;
    }

    const camera = cameraQueue[currentIndex];

    if (!camera) {
      log.warn({ currentIndex }, "No camera at current index");
      currentIndex = 0;
      loopInterval = setTimeout(loop, CAMERA_ROTATION_INTERVAL);
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
        "🔍 Starting IoU-based multi-frame check..."
      );

      // ✅ EXTRACT MULTIPLE FRAMES (3 frames, 3 seconds apart)
      const frames = await extractMultipleFrames(camera);

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
            framesWithFire: frames.length
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
              ...iouAnalysis
            },
            "🚨 REAL FIRE DETECTED (IoU < 95% = moving) - Broadcasting alert"
          );

          state.isFire = true;
          state.consecutiveStatic = 0;

          // Broadcast to WebSocket
          if (broadcastFireDetection) {
            broadcastFireDetection(
              camera.userId,
              camera.id,
              camera.name,
              true
            );
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
                  iouAnalysis
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
              ...iouAnalysis
            },
            `⚠️ STATIC FIRE DETECTED (IoU ${iouAnalysis.avgIoU} > ${BOX_IOU_THRESHOLD}) - Likely poster/TV/image`
          );

          log.info(
            {
              id: camera.id,
              name: camera.name,
              consecutiveStatic: state.consecutiveStatic
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

    // Schedule next iteration
    loopInterval = setTimeout(loop, CAMERA_ROTATION_INTERVAL);
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
  log.info(
    { 
      count: cameras.length,
      framesPerCheck: FRAMES_PER_CHECK,
      iouThreshold: BOX_IOU_THRESHOLD,
      method: "drone_iou"
    },
    "🚀 Initializing IoU-based detection queue (drone method)"
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
}