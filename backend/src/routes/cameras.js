import { Router } from "express";
import { prisma } from "../db/prisma.js";
import {
  addCameraToQueue,
  removeCameraFromQueue,
  getQueueStatus,
} from "../services/detectionQueue.js";
import {
  detectServerIP,
  sanitizePathName,
} from "../services/mediamtxConfigGenerator.js";

export const cameras = Router();

// Create camera
cameras.post("/", async (req, res) => {
  try {
    const userId = req.user.sub;

    // Auto-populate streamName and webrtcBase if not provided
    const serverIP = detectServerIP();

    const cameraData = {
      ...req.body,
      userId,
      streamName: req.body.streamName || sanitizePathName(req.body.name),
      streamPath: req.body.streamPath || "/live",
      webrtcBase: req.body.webrtcBase || `http://${serverIP}:8889`,
      detection: "LOCAL", // Force local detection
      isActive: true,
    };

    const cam = await prisma.camera.create({
      data: cameraData,
    });

    // Automatically start local detection for new camera
    if (cam.isActive) {
      addCameraToQueue(cam);
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
    const list = await prisma.camera.findMany({
      where: { userId },
      orderBy: { id: "asc" },
    });
    res.json(list);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get detection status - MOVED BEFORE /:id
cameras.get("/detection-status", async (req, res) => {
  try {
    const userId = req.user.sub;
    const cameraList = await prisma.camera.findMany({
      where: { userId },
      orderBy: { id: "asc" },
    });

    const queueStatus = getQueueStatus();

    const status = cameraList.map((cam) => ({
      id: cam.id,
      name: cam.name,
      location: cam.location,
      isRunning: queueStatus.cameras.some((c) => c.id === cam.id),
      isFire: queueStatus.fireDetections[cam.id] || false,
      lastChecked: queueStatus.lastChecked[cam.id] || null,
    }));

    res.json(status);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get status/all - MOVED BEFORE /:id
cameras.get("/status/all", async (req, res) => {
  try {
    const userId = req.user.sub;
    const cams = await prisma.camera.findMany({
      where: { userId },
      orderBy: { id: "asc" },
    });

    const queueStatus = getQueueStatus();

    res.json(
      cams.map((c) => ({
        id: c.id,
        name: c.name,
        location: c.location,
        isStreaming: queueStatus.streamingCameras.has(c.id),
        isFire: queueStatus.fireDetections[c.id] || false,
        isView: c.isActive,
      }))
    );
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Start detection - MOVED BEFORE /:id
cameras.post("/start-detection", async (req, res) => {
  try {
    const userId = req.user.sub;
    const { cameraIds } = req.body;

    if (!Array.isArray(cameraIds) || cameraIds.length === 0) {
      return res
        .status(400)
        .json({ error: "cameraIds must be a non-empty array" });
    }

    const cameraList = await prisma.camera.findMany({
      where: {
        id: { in: cameraIds },
        userId: userId,
      },
    });

    if (cameraList.length === 0) {
      return res.status(404).json({ error: "No cameras found" });
    }

    const started = [];
    const failed = [];

    for (const cam of cameraList) {
      try {
        // Update camera to active
        await prisma.camera.update({
          where: { id: cam.id },
          data: { isActive: true },
        });
        
        addCameraToQueue(cam);
        started.push({ id: cam.id, name: cam.name });
      } catch (error) {
        failed.push({ id: cam.id, name: cam.name, error: error.message });
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

// Stop detection - MOVED BEFORE /:id
cameras.post("/stop-detection", async (req, res) => {
  try {
    const userId = req.user.sub;
    const { cameraIds } = req.body;

    if (!Array.isArray(cameraIds) || cameraIds.length === 0) {
      return res
        .status(400)
        .json({ error: "cameraIds must be a non-empty array" });
    }

    const cameraList = await prisma.camera.findMany({
      where: {
        id: { in: cameraIds },
        userId: userId,
      },
    });

    const stopped = [];

    for (const cam of cameraList) {
      // Update camera to inactive
      await prisma.camera.update({
        where: { id: cam.id },
        data: { isActive: false },
      });
      
      removeCameraFromQueue(cam.id);
      stopped.push({ id: cam.id, name: cam.name });
    }

    res.json({
      stopped,
      message: `Stopped detection for ${stopped.length} camera(s)`,
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// NOW THE PARAMETERIZED ROUTES (/:id MUST BE LAST)
// Get single camera
cameras.get("/:id", async (req, res) => {
  try {
    const userId = req.user.sub;
    const id = Number(req.params.id);

    const cam = await prisma.camera.findFirst({
      where: { id, userId },
    });

    if (!cam) {
      return res.status(404).json({ error: "Camera not found" });
    }

    res.json(cam);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Update camera
cameras.put("/:id", async (req, res) => {
  try {
    const userId = req.user.sub;
    const id = Number(req.params.id);

    const existing = await prisma.camera.findFirst({
      where: { id, userId },
    });

    if (!existing) {
      return res.status(404).json({ error: "Camera not found" });
    }

    const cam = await prisma.camera.update({
      where: { id },
      data: req.body,
    });

    // If isActive changed, update queue
    if (req.body.isActive !== undefined) {
      if (req.body.isActive) {
        addCameraToQueue(cam);
      } else {
        removeCameraFromQueue(cam.id);
      }
    }

    res.json(cam);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// Delete camera
cameras.delete("/:id", async (req, res) => {
  try {
    const userId = req.user.sub;
    const id = Number(req.params.id);

    const existing = await prisma.camera.findFirst({
      where: { id, userId },
    });

    if (!existing) {
      return res.status(404).json({ error: "Camera not found" });
    }

    // Remove from detection queue and stop any active streams
    removeCameraFromQueue(id);
    
    await prisma.camera.delete({ where: { id } });

    res.json({ ok: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Post detection result
cameras.post("/:id/detections", async (req, res) => {
  try {
    const userId = req.user.sub;
    const id = Number(req.params.id);

    const cam = await prisma.camera.findFirst({
      where: { id, userId },
    });

    if (!cam) {
      return res.status(404).json({ error: "Camera not found" });
    }

    const { isFire, score, boxesJson, ts } = req.body;
    const det = await prisma.detection.create({
      data: {
        cameraId: id,
        isFire: !!isFire,
        score,
        boxesJson,
        ts: ts ? new Date(ts) : undefined,
      },
    });

    res.json(det);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});