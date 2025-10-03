import { Router } from "express";
import { prisma } from "../db/prisma.js";
import { startCloudDetector, stopCloudDetector } from "../services/cloudDetector.js";

export const cameras = Router();

// Create camera - linked to authenticated user
cameras.post("/", async (req, res) => {
  try {
    const userId = req.user.sub; // From Cognito JWT
    const cam = await prisma.camera.create({ 
      data: { 
        ...req.body, 
        userId 
      } 
    });
    
    if (cam.isActive && cam.detection === "CLOUD") {
      startCloudDetector(cam);
    }
    
    res.json(cam);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// Get all cameras - only for authenticated user
cameras.get("/", async (req, res) => {
  try {
    const userId = req.user.sub;
    const list = await prisma.camera.findMany({ 
      where: { userId },
      orderBy: { id: "asc" } 
    });
    res.json(list);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get single camera - verify ownership
cameras.get("/:id", async (req, res) => {
  try {
    const userId = req.user.sub;
    const id = Number(req.params.id);
    
    const cam = await prisma.camera.findFirst({ 
      where: { id, userId } 
    });
    
    if (!cam) {
      return res.status(404).json({ error: "Camera not found" });
    }
    
    res.json(cam);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Update camera - verify ownership
cameras.put("/:id", async (req, res) => {
  try {
    const userId = req.user.sub;
    const id = Number(req.params.id);
    
    // Verify ownership
    const existing = await prisma.camera.findFirst({ 
      where: { id, userId } 
    });
    
    if (!existing) {
      return res.status(404).json({ error: "Camera not found" });
    }
    
    const cam = await prisma.camera.update({ 
      where: { id }, 
      data: req.body 
    });
    
    // Restart cloud detector if needed
    stopCloudDetector(id);
    if (cam.isActive && cam.detection === "CLOUD") {
      startCloudDetector(cam);
    }
    
    res.json(cam);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// Delete camera - verify ownership
cameras.delete("/:id", async (req, res) => {
  try {
    const userId = req.user.sub;
    const id = Number(req.params.id);
    
    const existing = await prisma.camera.findFirst({ 
      where: { id, userId } 
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

// Camera status - only user's cameras
cameras.get("/status/all", async (req, res) => {
  try {
    const userId = req.user.sub;
    const cams = await prisma.camera.findMany({ 
      where: { userId },
      orderBy: { id: "asc" } 
    });
    
    res.json(cams.map(c => ({
      id: c.id,
      name: c.camera,
      location: c.location,
      isStreaming: c.isActive,
      isFire: false, // This should be dynamically updated
      isView: c.isActive
    })));
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Post detection result - verify camera ownership
cameras.post("/:id/detections", async (req, res) => {
  try {
    const userId = req.user.sub;
    const id = Number(req.params.id);
    
    // Verify camera ownership
    const cam = await prisma.camera.findFirst({ 
      where: { id, userId } 
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
        ts: ts ? new Date(ts) : undefined 
      }
    });
    
    res.json(det);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});