import express from "express";
import { WebSocketServer } from "ws";
import { createServer } from "http";
import cors from "cors";
import pino from "pino";
import { cfg } from "./config.js";
import { prisma } from "./db/prisma.js";
import { requireAuth } from "./auth/cognitoVerify.js";
import {
  startMediaMTX,
  stopMediaMTX,
  isMediaMTXRunning,
} from "./services/mediamtx.js";
import { cameras as camerasRouter } from "./routes/cameras.js";
import { CognitoJwtVerifier } from "aws-jwt-verify";
import { startCloudDetector } from "./services/cloudDetector.js"; // ✅ FIXED PATH

const log = pino({ name: "server" });
const app = express();
const httpServer = createServer(app);

// -------------------------------------------------------------------
// 🧠 WebSocket setup with JWT authentication
// -------------------------------------------------------------------
const wss = new WebSocketServer({ server: httpServer });
const wsClients = new Map(); // userId -> Set<WebSocket>

const verifier = CognitoJwtVerifier.create({
  userPoolId: cfg.cognito.poolId,
  tokenUse: "id",
  clientId: cfg.cognito.clientId,
});

wss.on("connection", async (ws, req) => {
  log.info("🔗 WebSocket connection attempt");

  const url = new URL(req.url, `http://${req.headers.host}`);
  const token = url.searchParams.get("token");

  if (!token) {
    ws.close(4001, "Missing token");
    log.warn("WebSocket rejected: missing token");
    return;
  }

  try {
    const payload = await verifier.verify(token);
    const userId = payload.sub;

    if (!wsClients.has(userId)) wsClients.set(userId, new Set());
    wsClients.get(userId).add(ws);
    log.info({ userId, email: payload.email }, "✅ WebSocket authenticated");

    ws.send(
      JSON.stringify({ type: "connected", message: "WebSocket connected" })
    );

    ws.on("close", () => {
      const clients = wsClients.get(userId);
      if (clients) {
        clients.delete(ws);
        if (clients.size === 0) wsClients.delete(userId);
      }
      log.info({ userId }, "❌ WebSocket disconnected");
    });
  } catch (error) {
    ws.close(4002, "Invalid token");
    log.warn({ error: error.message }, "❌ WebSocket authentication failed");
  }
});

// -------------------------------------------------------------------
// 🔥 Broadcast helper for fire detection
// -------------------------------------------------------------------
export function broadcastFireDetection(userId, cameraId, cameraName, isFire) {
  const clients = wsClients.get(userId);
  if (!clients || clients.size === 0) return;

  const payload = JSON.stringify({
    type: "fire-detection",
    cameraId,
    cameraName,
    isFire,
    timestamp: new Date().toISOString(),
  });

  for (const client of clients) {
    if (client.readyState === 1) client.send(payload);
  }

  log.info({ userId, cameraId, isFire }, "📢 Fire detection broadcasted");
}

// -------------------------------------------------------------------
// 🌐 Express configuration
// -------------------------------------------------------------------
app.use(
  cors({
    origin: true,
    credentials: true,
    allowedHeaders: ["Content-Type", "Authorization"],
  })
);
app.use(express.json({ limit: "5mb" }));

app.get("/healthz", async (_req, res) => {
  res.json({ ok: true, mediamtx: await isMediaMTXRunning() });
});

app.use("/api", requireAuth);
app.use("/api/cameras", camerasRouter);

// -------------------------------------------------------------------
// 🚀 Main Entrypoint with auto-start detection
// -------------------------------------------------------------------
async function main() {
  await prisma.$connect();

  // Step 1: Start MediaMTX
  try {
    log.info("Starting MediaMTX...");
    await startMediaMTX();
    log.info("MediaMTX started successfully");
  } catch (err) {
    log.error({ error: err.message }, "Failed to start MediaMTX");
  }

  // Step 2: Start Fire Detection Automatically for all active cameras
  try {
    const activeCameras = await prisma.camera.findMany({
      where: { isActive: true },
      orderBy: { id: "asc" },
    });

    if (activeCameras.length === 0) {
      log.warn("⚠️ No active cameras found in database.");
    } else {
      log.info(
        `🎥 Starting fire detection for ${activeCameras.length} cameras...`
      );
      for (const cam of activeCameras) {
        startCloudDetector(cam);
        log.info({ id: cam.id, name: cam.name }, "🔥 Fire detection started");
      }
    }
  } catch (error) {
    log.error({ error: error.message }, "Failed to start fire detection");
  }

  // Step 3: Launch HTTP + WebSocket server
  httpServer.listen(cfg.port, () =>
    log.info(`🚀 API & WebSocket listening on port ${cfg.port}`)
  );
}

// Graceful shutdown handlers
process.on("SIGTERM", async () => {
  log.info("SIGTERM received, shutting down...");
  await stopMediaMTX();
  await prisma.$disconnect();
  process.exit(0);
});

process.on("SIGINT", async () => {
  log.info("SIGINT received, shutting down...");
  await stopMediaMTX();
  await prisma.$disconnect();
  process.exit(0);
});

main().catch((e) => {
  log.error(e);
  process.exit(1);
});
