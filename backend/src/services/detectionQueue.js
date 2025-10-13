import pino from "pino";
import { detectFire, buildCameraUrl } from "./localDetector.js";
import { startCameraStream, stopCameraStream, isStreamActive } from "./streamManager.js";

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
const cameraStates = new Map(); // cameraId -> { isFire, lastChecked, consecutiveDetections, streamStarting }

// -------------------------------------------------------------------
// 🔧 Configuration
// -------------------------------------------------------------------
const INTERVAL_MS = 10000; // ✅ 10 seconds between cameras
const CONSECUTIVE_DETECTIONS_REQUIRED = 1; // Fire must be detected N times before starting stream
const CONSECUTIVE_CLEAR_REQUIRED = 3; // Must be clear N times before stopping stream

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
    log.warn({ cameraId: camera.id, name: camera.name }, "Camera already in queue");
    return;
  }

  cameraQueue.push(camera);
  
  // Initialize camera state
  cameraStates.set(camera.id, {
    isFire: false,
    lastChecked: null,
    consecutiveDetections: 0,
    consecutiveClear: 0,
    streamStarting: false, // ✅ Track if stream is being started
  });

  log.info({ 
    cameraId: camera.id, 
    name: camera.name,
    queueSize: cameraQueue.length 
  }, "📹 Camera added to detection queue");

  if (!isRunning) {
    startQueueLoop();
  }
}

// -------------------------------------------------------------------
// ➖ Remove Camera from Queue
// -------------------------------------------------------------------
export function removeCameraFromQueue(cameraId) {
  const index = cameraQueue.findIndex((c) => c.id === cameraId);
  
  if (index === -1) {
    log.warn({ cameraId }, "Camera not found in queue");
    return;
  }

  const camera = cameraQueue[index];
  cameraQueue.splice(index, 1);
  
  // Stop stream if active
  if (isStreamActive(cameraId)) {
    stopCameraStream(camera);
  }
  
  cameraStates.delete(cameraId);

  log.info({ 
    cameraId, 
    name: camera.name,
    queueSize: cameraQueue.length 
  }, "🗑️ Camera removed from detection queue");

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
  log.info({ queueSize: cameraQueue.length }, "▶️ Starting detection queue loop");

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
      log.info({ 
        cameraId: camera.id, 
        name: camera.name,
        position: `${currentIndex + 1}/${cameraQueue.length}`
      }, "🔍 Checking camera...");

      // Build camera URL
      const cameraUrl = buildCameraUrl(camera);
      
      // Run fire detection
      const result = await detectFire(cameraUrl, camera.name);
      
      // Update last checked time
      state.lastChecked = new Date().toISOString();

      if (result.isFire) {
        state.consecutiveDetections++;
        state.consecutiveClear = 0;
        
        log.warn({ 
          cameraId: camera.id, 
          name: camera.name,
          consecutive: state.consecutiveDetections,
          confidence: result.confidence 
        }, "🔥 FIRE DETECTED");

        // ✅ Start stream if threshold reached and not already streaming or starting
        if (state.consecutiveDetections >= CONSECUTIVE_DETECTIONS_REQUIRED && 
            !state.isFire && 
            !state.streamStarting &&
            !isStreamActive(camera.id)) {
          
          state.isFire = true;
          state.streamStarting = true; // ✅ Mark as starting to prevent duplicates
          
          log.warn({ 
            cameraId: camera.id, 
            name: camera.name 
          }, "🚨 FIRE CONFIRMED - Starting stream");

          try {
            await startCameraStream(camera);
            state.streamStarting = false; // ✅ Stream started successfully
            
            // Broadcast to WebSocket
            if (broadcastFireDetection) {
              broadcastFireDetection(camera.userId, camera.id, camera.name, true);
            }
          } catch (error) {
            log.error({ 
              cameraId: camera.id, 
              error: error.message 
            }, "❌ Failed to start stream");
            state.streamStarting = false; // ✅ Reset flag on error
            state.isFire = false; // Allow retry on next detection
          }
        }
      } else {
        state.consecutiveClear++;
        state.consecutiveDetections = 0;
        
        log.info({ 
          cameraId: camera.id, 
          name: camera.name,
          consecutiveClear: state.consecutiveClear 
        }, "✅ No fire detected");

        // Stop stream if threshold reached and currently streaming
        if (state.consecutiveClear >= CONSECUTIVE_CLEAR_REQUIRED && state.isFire) {
          state.isFire = false;
          
          log.info({ 
            cameraId: camera.id, 
            name: camera.name 
          }, "✅ FIRE CLEARED - Stopping stream");

          await stopCameraStream(camera);
          
          // Broadcast to WebSocket
          if (broadcastFireDetection) {
            broadcastFireDetection(camera.userId, camera.id, camera.name, false);
          }
        }
      }
    } catch (error) {
      log.error({ 
        cameraId: camera.id, 
        name: camera.name,
        error: error.message 
      }, "❌ Detection error");
      
      // ✅ Reset streamStarting flag on error
      if (state.streamStarting) {
        state.streamStarting = false;
      }
    }

    // Move to next camera
    currentIndex = (currentIndex + 1) % cameraQueue.length;

    // Schedule next iteration
    loopInterval = setTimeout(loop, INTERVAL_MS);
  }

  loop();
}

// -------------------------------------------------------------------
// ⏹️ Stop Detection Queue Loop
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

  log.info("⏹️ Detection queue stopped");
}

// -------------------------------------------------------------------
// 📊 Get Queue Status
// -------------------------------------------------------------------
export function getQueueStatus() {
  const fireDetections = {};
  const lastChecked = {};
  const streamingCameras = new Set();

  for (const [cameraId, state] of cameraStates.entries()) {
    fireDetections[cameraId] = state.isFire;
    lastChecked[cameraId] = state.lastChecked;
    
    if (state.isFire) {
      streamingCameras.add(cameraId);
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