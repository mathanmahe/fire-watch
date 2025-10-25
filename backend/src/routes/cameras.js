import { Router } from "express";
import { dynamodb } from "../db/dynamodb.js";
import {
  addCameraToQueue,
  removeCameraFromQueue,
  getQueueStatus,
} from "../services/detectionQueue.js";
import {
  detectServerIP,
  sanitizePathName,
} from "../services/mediamtxConfigGenerator.js";
import { startMediaMTX, stopMediaMTX } from "../services/mediamtx.js";

export const cameras = Router();

// Create camera
cameras.post("/", async (req, res) => {
  try {
    const userId = req.user.sub;

    // Auto-populate streamName and webrtcBase if not provided
    const serverIP = detectServerIP();

    const cameraData = {
      name: req.body.name,
      location: req.body.location || null,
      ip: req.body.ip || null,
      port: req.body.port || null,
      username: req.body.username || null,
      password: req.body.password || null,
      detection: "LOCAL", // Force local detection
      streamType: req.body.streamType || "WEBRTC",
      streamName: req.body.streamName || sanitizePathName(req.body.name),
      streamPath: req.body.streamPath || "/live",
      hlsUrl: req.body.hlsUrl || null,
      webrtcBase: req.body.webrtcBase || `http://${serverIP}:8889`,
      isActive: true,
    };

    const cam = await dynamodb.createCamera(userId, cameraData);

    // ✅ Regenerate MediaMTX config after adding camera
    try {
      console.log("🔄 Regenerating MediaMTX config after camera creation...");
      await stopMediaMTX();
      await startMediaMTX(userId);
      console.log("✅ MediaMTX restarted with new camera");
    } catch (err) {
      console.error("❌ Failed to restart MediaMTX:", err.message);
    }

    // ✅ CRITICAL: Attach userId to camera object before adding to queue
    if (cam.isActive) {
      cam.userId = userId;
      addCameraToQueue(cam);
      console.log(`✅ Added ${cam.name} to detection queue`);
    }

    res.json(cam);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// Get all cameras
cameras.get("/", async (req, res) => {
  try {
    const userId = req.user.sub;
    const list = await dynamodb.getCamerasByUserId(userId);
    res.json(list);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get detection status
cameras.get("/detection-status", async (req, res) => {
  try {
    const userId = req.user.sub;
    const cameraList = await dynamodb.getCamerasByUserId(userId);

    const queueStatus = getQueueStatus();

    const status = cameraList.map((cam) => ({
      id: cam.id,  // ✅ Use numeric id
      name: cam.name,
      location: cam.location,
      isRunning: queueStatus.cameras.some((c) => c.id === cam.id),  // ✅ Compare by id
      isFire: queueStatus.fireDetections[cam.id] || false,  // ✅ Use id as key
      lastChecked: queueStatus.lastChecked[cam.id] || null,  // ✅ Use id as key
    }));

    res.json(status);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get status/all
cameras.get("/status/all", async (req, res) => {
  try {
    const userId = req.user.sub;
    const cams = await dynamodb.getCamerasByUserId(userId);

    const queueStatus = getQueueStatus();

    res.json(
      cams.map((c) => ({
        id: c.id,  // ✅ Use numeric id
        name: c.name,
        location: c.location,
        isStreaming: queueStatus.streamingCameras.has(c.id),  // ✅ Compare by id
        isFire: queueStatus.fireDetections[c.id] || false,  // ✅ Use id as key
        isView: c.isActive,
      }))
    );
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Start detection
cameras.post("/start-detection", async (req, res) => {
  try {
    const userId = req.user.sub;
    const { cameraIds } = req.body;

    if (!Array.isArray(cameraIds) || cameraIds.length === 0) {
      return res
        .status(400)
        .json({ error: "cameraIds must be a non-empty array" });
    }

    // ✅ Convert and validate IDs
    const ids = cameraIds
      .map(id => Number(id))
      .filter(id => !isNaN(id));

    if (ids.length === 0) {
      return res.status(400).json({ error: "No valid camera IDs provided" });
    }

    console.log("▶️ Starting detection for IDs:", ids);

    const cameraList = await dynamodb.getCamerasByIds(userId, ids);

    if (cameraList.length === 0) {
      return res.status(404).json({ error: "No cameras found" });
    }

    const started = [];
    const failed = [];

    for (const cam of cameraList) {
      try {
        // Update camera to active
        await dynamodb.updateCamera(userId, cam.id, { isActive: true });
        
        // ✅ CRITICAL: Attach userId before adding to queue
        cam.userId = userId;
        addCameraToQueue(cam);
        started.push({ id: cam.id, name: cam.name });
        console.log(`▶️ Started detection for ${cam.name} (id: ${cam.id})`);
      } catch (error) {
        console.error(`❌ Failed to start ${cam.name}:`, error.message);
        failed.push({ id: cam.id, name: cam.name, error: error.message });
      }
    }

    res.json({
      started,
      failed,
      message: `Started detection for ${started.length} camera(s)`,
    });
  } catch (error) {
    console.error("❌ Start detection error:", error);
    res.status(500).json({ error: error.message });
  }
});

// Stop detection
cameras.post("/stop-detection", async (req, res) => {
  try {
    const userId = req.user.sub;
    const { cameraIds } = req.body;

    if (!Array.isArray(cameraIds) || cameraIds.length === 0) {
      return res
        .status(400).json({ error: "cameraIds must be a non-empty array" });
    }

    // ✅ Convert and validate IDs
    const ids = cameraIds
      .map(id => Number(id))
      .filter(id => !isNaN(id));

    if (ids.length === 0) {
      return res.status(400).json({ error: "No valid camera IDs provided" });
    }

    console.log("🛑 Stopping detection for IDs:", ids);

    const cameraList = await dynamodb.getCamerasByIds(userId, ids);

    const stopped = [];
    const failed = [];

    for (const cam of cameraList) {
      try {
        // Update camera to inactive
        await dynamodb.updateCamera(userId, cam.id, { isActive: false });
        
        removeCameraFromQueue(cam.id);
        stopped.push({ id: cam.id, name: cam.name });
        console.log(`⏸️ Stopped detection for ${cam.name} (id: ${cam.id})`);
      } catch (error) {
        console.error(`❌ Failed to stop ${cam.name}:`, error.message);
        failed.push({ id: cam.id, name: cam.name, error: error.message });
      }
    }

    res.json({
      stopped,
      failed,
      message: `Stopped detection for ${stopped.length} camera(s)`,
    });
  } catch (error) {
    console.error("❌ Stop detection error:", error);
    res.status(500).json({ error: error.message });
  }
});

// Get single camera
cameras.get("/:id", async (req, res) => {
  try {
    const userId = req.user.sub;
    const id = Number(req.params.id);

    const cam = await dynamodb.getCamera(userId, id);
    res.json(cam);
  } catch (error) {
    if (error.message === "Camera not found") {
      return res.status(404).json({ error: "Camera not found" });
    }
    res.status(500).json({ error: error.message });
  }
});

// Update camera
cameras.put("/:id", async (req, res) => {
  try {
    const userId = req.user.sub;
    const id = Number(req.params.id);

    await dynamodb.getCamera(userId, id);
    const cam = await dynamodb.updateCamera(userId, id, req.body);

    if (req.body.isActive !== undefined) {
      if (req.body.isActive) {
        // ✅ CRITICAL: Attach userId before adding to queue
        cam.userId = userId;
        addCameraToQueue(cam);
      } else {
        removeCameraFromQueue(cam.id);
      }
    }

    res.json(cam);
  } catch (error) {
    if (error.message === "Camera not found") {
      return res.status(404).json({ error: "Camera not found" });
    }
    res.status(400).json({ error: error.message });
  }
});

// Delete camera
cameras.delete("/:id", async (req, res) => {
  try {
    const userId = req.user.sub;
    const id = Number(req.params.id);

    await dynamodb.getCamera(userId, id);
    removeCameraFromQueue(id);
    await dynamodb.deleteCamera(userId, id);

    res.json({ ok: true });
  } catch (error) {
    if (error.message === "Camera not found") {
      return res.status(404).json({ error: "Camera not found" });
    }
    res.status(500).json({ error: error.message });
  }
});