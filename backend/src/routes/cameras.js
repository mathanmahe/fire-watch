import { Router } from "express";
import { prisma } from "../db/prisma.js";
import { startCloudDetector, stopCloudDetector } from "../services/cloudDetector.js";

export const cameras = Router();

// Create
cameras.post("/", async (req, res) => {
  const cam = await prisma.camera.create({ data: req.body });
  if (cam.isActive && cam.detection === "CLOUD") startCloudDetector(cam);
  res.json(cam);
});

// Read all
cameras.get("/", async (_req, res) => {
  const list = await prisma.camera.findMany({ orderBy: { id: "asc" } });
  res.json(list);
});

// Update
cameras.put("/:id", async (req, res) => {
  const id = Number(req.params.id);
  const cam = await prisma.camera.update({ where: { id }, data: req.body });
  stopCloudDetector(id);
  if (cam.isActive && cam.detection === "CLOUD") startCloudDetector(cam);
  res.json(cam);
});

// Delete
cameras.delete("/:id", async (req, res) => {
  const id = Number(req.params.id);
  stopCloudDetector(id);
  await prisma.camera.delete({ where: { id } });
  res.json({ ok: true });
});

// (Optional) record a detection (for future)
cameras.post("/:id/detections", async (req, res) => {
  const id = Number(req.params.id);
  const { isFire, score, boxesJson, ts } = req.body;
  const det = await prisma.detection.create({
    data: { cameraId: id, isFire: !!isFire, score, boxesJson, ts: ts ? new Date(ts) : undefined }
  });
  res.json(det);
});

// simple status for table (replace with real stats later)
cameras.get("/status/all", async (_req, res) => {
  const cams = await prisma.camera.findMany({ orderBy: { id: "asc" } });
  res.json(cams.map(c => ({
    name: c.camera,
    location: c.location,
    isStreaming: true,
    isFire: false,
    isView: true
  })));
});
