import { Router } from "express";
import { prisma } from "../db/prisma.js";
import {
  startCloudDetector,
  stopCloudDetector,
  getRunningDetectors,
} from "../services/cloudDetector.js";
import { detectServerIP, sanitizePathName } from "../services/mediamtxConfigGenerator.js";

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
      // Auto-populate streamName if not provided
      streamName: req.body.streamName || sanitizePathName(req.body.name),
      // Auto-populate webrtcBase if not provided
      webrtcBase: req.body.webrtcBase || `http://${serverIP}:8889`,
    };

    const cam = await prisma.camera.create({
      data: cameraData,
    });

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

// SPECIFIC ROUTES MUST COME BEFORE /:id ROUTES
// Get detection status - MOVED BEFORE /:id
cameras.get("/detection-status", async (req, res) => {
  try {
    const userId = req.user.sub;
    const cameraList = await prisma.camera.findMany({
      where: { userId },
      orderBy: { id: "asc" },
    });

    const running = getRunningDetectors();

    const status = cameraList.map((cam) => ({
      id: cam.id,
      name: cam.name,
      location: cam.location,
      isRunning: running.has(cam.id),
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

    const running = getRunningDetectors();

    res.json(
      cams.map((c) => ({
        id: c.id,
        name: c.name,
        location: c.location,
        isStreaming: running.has(c.id),
        isFire: false,
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
        startCloudDetector(cam);
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
      stopCloudDetector(cam.id);
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

    stopCloudDetector(id);
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
