// import express from "express";
// import http from "node:http";
// import cors from "cors";
// import pino from "pino";
// import { cfg } from "./config.js";
// import { prisma } from "./db/prisma.js";
// import { requireAuth } from "./auth/cognitoVerify.js";
// import {
//   startMediaMTX,
//   stopMediaMTX,
//   isMediaMTXRunning,
// } from "./services/mediamtx.js";
// import { cameras as camerasRouter } from "./routes/cameras.js";

// const log = pino({ name: "server" });
// const app = express();

// // CORS configuration for browser access
// app.use(
//   cors({
//     origin: true,
//     credentials: true,
//     allowedHeaders: ["Content-Type", "Authorization"],
//   })
// );

// app.use(express.json({ limit: "5mb" }));

// // MediaMTX HTTP health probe utility
// async function probeMtxHttp() {
//   return new Promise((resolve) => {
//     const req = http.request(
//       { host: "127.0.0.1", port: 8888, method: "HEAD", path: "/" },
//       (res) => {
//         res.resume();
//         resolve(true);
//       }
//     );
//     req.on("error", () => resolve(false));
//     req.end();
//   });
// }

// app.get("/healthz", async (_req, res) => {
//   res.json({ ok: true, mediamtx: await probeMtxHttp() });
// });

// app.use("/api", requireAuth);
// app.use("/api/cameras", camerasRouter);


// async function main() {
//   await prisma.$connect();

//   // Start MediaMtx Docker container
//   try {
//     log.info("Starting MediaMtx Docker container...");
//     await startMediaMTX();
//     log.info("MediaMtx Docker container started successfully");
//   } catch (e) {
//     log.error({ error: e.message }, "Failed to start MediaMtx container");
//     // Continue anyway - container might already be running externally
//   }

//   app.listen(cfg.port, () => log.info(`API listening on :${cfg.port}`));
// }

// // Graceful shutdown handling
// process.on("SIGTERM", async () => {
//   log.info("SIGTERM received, shutting down gracefully...");
//   try {
//     await stopMediaMTX();
//     await prisma.$disconnect();
//     process.exit(0);
//   } catch (error) {
//     log.error({ error }, "Error during shutdown");
//     process.exit(1);
//   }
// });

// process.on("SIGINT", async () => {
//   log.info("SIGINT received, shutting down gracefully...");
//   try {
//     await stopMediaMTX();
//     await prisma.$disconnect();
//     process.exit(0);
//   } catch (error) {
//     log.error({ error }, "Error during shutdown");
//     process.exit(1);
//   }
// });

// main().catch((e) => {
//   log.error(e);
//   process.exit(1);
// });

import express from "express";
import { WebSocketServer } from "ws";
import { createServer } from "http";
import cors from "cors"; // ✅ NEW
import pino from "pino";
import { cfg } from "./config.js";
import { prisma } from "./db/prisma.js";
import { requireAuth } from "./auth/cognitoVerify.js";
import { startMediaMTX, isMediaMTXRunning } from "./services/mediamtx.js";
import { cameras as camerasRouter } from "./routes/cameras.js";
import { setBroadcastFunction } from "./services/cloudDetector.js";
import { CognitoJwtVerifier } from "aws-jwt-verify";

const log = pino({ name: "server" });
const app = express();
const httpServer = createServer(app);

//
// ✅ 1. Enable CORS for frontend (Vite @ localhost:5173)
//
app.use(
  cors({
    origin: "http://localhost:5173",
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
  })
);

//
// ✅ 2. WebSocket Setup (Fire Detection Events)
//
const wss = new WebSocketServer({ server: httpServer });
const wsClients = new Map(); // userId → Set of WebSocket connections

const verifier = CognitoJwtVerifier.create({
  userPoolId: cfg.cognito.poolId,
  tokenUse: "id",
  clientId: cfg.cognito.clientId,
});

wss.on("connection", async (ws, req) => {
  log.info("WebSocket connection attempt");

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

    if (!wsClients.has(userId)) {
      wsClients.set(userId, new Set());
    }
    wsClients.get(userId).add(ws);

    log.info({ userId, email: payload.email }, "WebSocket authenticated");
    ws.send(JSON.stringify({ type: "connected", message: "WebSocket connected" }));

    ws.on("close", () => {
      const clients = wsClients.get(userId);
      if (clients) {
        clients.delete(ws);
        if (clients.size === 0) wsClients.delete(userId);
      }
      log.info({ userId }, "WebSocket disconnected");
    });

    ws.on("message", (msg) => {
      log.info({ userId, msg: msg.toString() }, "WebSocket message received");
    });
  } catch (err) {
    ws.close(4002, "Invalid token");
    log.warn({ error: err.message }, "WebSocket authentication failed");
  }
});

//
// ✅ 3. Broadcast helper
//
function broadcastFireDetection(userId, cameraId, cameraName, isFire) {
  const clients = wsClients.get(userId);
  if (!clients || clients.size === 0) {
    log.debug({ userId }, "No WebSocket clients for user");
    return;
  }

  const message = JSON.stringify({
    type: "fire-detection",
    cameraId,
    cameraName,
    isFire,
    timestamp: new Date().toISOString(),
  });

  clients.forEach((client) => {
    if (client.readyState === 1) client.send(message);
  });

  log.info({ userId, cameraId, isFire }, "Broadcasted fire detection event");
}
setBroadcastFunction(broadcastFireDetection);

//
// ✅ 4. Express Routes
//
app.use(express.json({ limit: "5mb" }));

app.get("/healthz", (_req, res) => {
  res.json({ ok: true, mediamtx: isMediaMTXRunning() });
});

app.use("/api", requireAuth);
app.use("/api/cameras", camerasRouter);

//
// ✅ 5. Start Server
//
async function main() {
  await prisma.$connect();
  try {
    startMediaMTX();
  } catch (err) {
    log.error(String(err));
  }

  httpServer.listen(cfg.port, () => {
    log.info(`API and WebSocket listening on :${cfg.port}`);
  });
}

main().catch((err) => {
  log.error(err);
  process.exit(1);
});
