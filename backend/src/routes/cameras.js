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

    // ✅ ADD THIS: Automatically start local detection for new camera
    if (cam.isActive) {
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
      cameraId: cam.cameraId,
      name: cam.name,
      location: cam.location,
      isRunning: queueStatus.cameras.some((c) => c.cameraId === cam.cameraId),
      isFire: queueStatus.fireDetections[cam.cameraId] || false,
      lastChecked: queueStatus.lastChecked[cam.cameraId] || null,
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
        cameraId: c.cameraId,
        name: c.name,
        location: c.location,
        isStreaming: queueStatus.streamingCameras.has(c.cameraId),
        isFire: queueStatus.fireDetections[c.cameraId] || false,
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

    const cameraList = await dynamodb.getCamerasByIds(userId, cameraIds);

    if (cameraList.length === 0) {
      return res.status(404).json({ error: "No cameras found" });
    }

    const started = [];
    const failed = [];

    for (const cam of cameraList) {
      try {
        // Update camera to active
        await dynamodb.updateCamera(userId, cam.cameraId, { isActive: true });
        
        addCameraToQueue(cam);
        started.push({ cameraId: cam.cameraId, name: cam.name });
      } catch (error) {
        failed.push({ cameraId: cam.cameraId, name: cam.name, error: error.message });
      }
    }

    res.json({
      started,
      failed,
      message: `Started detection for ${started.length} camera(s)`,
    });
  } catch (error) {
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

    const cameraList = await dynamodb.getCamerasByIds(userId, cameraIds);

    const stopped = [];

    for (const cam of cameraList) {
      // Update camera to inactive
      await dynamodb.updateCamera(userId, cam.cameraId, { isActive: false });
      
      removeCameraFromQueue(cam.cameraId);
      stopped.push({ cameraId: cam.cameraId, name: cam.name });
    }

    res.json({
      stopped,
      message: `Stopped detection for ${stopped.length} camera(s)`,
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get single camera
cameras.get("/:id", async (req, res) => {
  try {
    const userId = req.user.sub;
    const id = Number(req.params.id);  // ✅ Parse as number

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
    const id = Number(req.params.id);  // ✅ Parse as number

    await dynamodb.getCamera(userId, id);
    const cam = await dynamodb.updateCamera(userId, id, req.body);

    if (req.body.isActive !== undefined) {
      if (req.body.isActive) {
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
    const id = Number(req.params.id);  // ✅ Parse as number

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
