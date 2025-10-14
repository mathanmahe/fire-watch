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
import {
  startDetectionQueue,
  stopDetectionQueue,
  setBroadcastFunction,
} from "./services/detectionQueue.js";

const log = pino({ name: "server" });
const app = express();
const httpServer = createServer(app);

// ✅ Track current user
let currentUserId = cfg.userId || null;

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

    // ✅ AUTO-DETECT: If this is a new user, restart detection queue
    if (!currentUserId || currentUserId !== userId) {
      log.info(
        { oldUser: currentUserId, newUser: userId },
        "🔄 New user detected, switching detection queue"
      );

      currentUserId = userId;

      // Stop existing queue
      await stopDetectionQueue();

      // Load cameras for new user
      const userCameras = await prisma.camera.findMany({
        where: { userId: currentUserId, isActive: true },
        orderBy: { id: "asc" },
      });

      if (userCameras.length > 0) {
        log.info(
          { userId, count: userCameras.length },
          "🎥 Starting detection for new user's cameras"
        );
        await startDetectionQueue(userCameras);
      } else {
        log.warn({ userId }, "⚠️ No cameras found for this user");
      }
    }

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
        if (clients.size === 0) {
          wsClients.delete(userId);
          log.info({ userId }, "❌ Last WebSocket disconnected for user");

          // ✅ OPTIONAL: Stop detection when user disconnects
          // if (userId === currentUserId) {
          //   log.info("⏸️ Stopping detection queue (no users connected)");
          //   stopDetectionQueue();
          //   currentUserId = null;
          // }
        }
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
  log.info(
    { userId, cameraId, cameraName, isFire, totalUsers: wsClients.size },
    "🔥 broadcastFireDetection called"
  );

  const clients = wsClients.get(userId);

  if (!clients || clients.size === 0) {
    log.warn(
      { userId, cameraId, availableUsers: Array.from(wsClients.keys()) },
      "⚠️ No WebSocket clients found for userId"
    );
    return;
  }

  const payload = JSON.stringify({
    type: "fire-detection",
    cameraId,
    cameraName,
    isFire,
    timestamp: new Date().toISOString(),
  });

  log.info(
    { userId, cameraId, clientCount: clients.size, payload },
    "📡 Sending to WebSocket clients"
  );

  let sentCount = 0;
  for (const client of clients) {
    if (client.readyState === 1) {
      client.send(payload);
      sentCount++;
    } else {
      log.warn(
        { userId, cameraId, readyState: client.readyState },
        "⚠️ Client not in OPEN state"
      );
    }
  }

  log.info(
    { userId, cameraId, isFire, sentCount },
    "📢 Fire detection broadcasted"
  );
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
// 🚀 Main Entrypoint
// -------------------------------------------------------------------
async function main() {
  await prisma.$connect();

  setBroadcastFunction(broadcastFireDetection);
  log.info("🔌 WebSocket broadcast function registered with detection queue");

  // Start MediaMTX
  try {
    log.info("Starting MediaMTX...");
    await startMediaMTX();
    log.info("MediaMTX started successfully");
  } catch (err) {
    log.error({ error: err.message }, "Failed to start MediaMTX");
  }

  // ✅ Check if USER_ID is set in env
  if (cfg.userId) {
    log.info(
      { userId: cfg.userId },
      "👤 USER_ID found in environment, starting detection"
    );
    currentUserId = cfg.userId;

    // Set all cameras to active for server startup
    log.info(
      { userId: cfg.userId },
      "🔄 Setting all cameras to active for server startup"
    );
    await prisma.camera.updateMany({
      where: { userId: currentUserId },
      data: { isActive: true },
    });

    const activeCameras = await prisma.camera.findMany({
      where: { userId: currentUserId, isActive: true },
      orderBy: { id: "asc" },
    });

    if (activeCameras.length > 0) {
      log.info(
        `🎥 Starting LOCAL fire detection for ${activeCameras.length} camera(s)...`
      );
      await startDetectionQueue(activeCameras);
      log.info("🔥 Local detection queue started successfully");
    } else {
      log.warn(`⚠️ No active cameras found for user ${currentUserId}`);
    }
  } else {
    // ✅ No USER_ID set - wait for WebSocket connection to auto-detect
    log.info(
      "⏳ No USER_ID in environment - waiting for user to connect via WebSocket"
    );
    log.info("💡 Detection will start automatically when user logs in");
  }

  httpServer.listen(cfg.port, () =>
    log.info(`🚀 API & WebSocket listening on port ${cfg.port}`)
  );
}

// Graceful shutdown handlers
process.on("SIGTERM", async () => {
  log.info("SIGTERM received, shutting down...");
  await stopDetectionQueue();
  await stopMediaMTX();
  await prisma.$disconnect();
  process.exit(0);
});

process.on("SIGINT", async () => {
  log.info("SIGINT received, shutting down...");
  await stopDetectionQueue();
  await stopMediaMTX();
  await prisma.$disconnect();
  process.exit(0);
});

main().catch((e) => {
  log.error(e);
  process.exit(1);
});
