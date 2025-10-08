import express from "express";
import http from "node:http";
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

const log = pino({ name: "server" });
const app = express();

// CORS configuration for browser access
app.use(
  cors({
    origin: true,
    credentials: true,
    allowedHeaders: ["Content-Type", "Authorization"],
  })
);

app.use(express.json({ limit: "5mb" }));

// MediaMTX HTTP health probe utility
async function probeMtxHttp() {
  return new Promise((resolve) => {
    const req = http.request(
      { host: "127.0.0.1", port: 8888, method: "HEAD", path: "/" },
      (res) => {
        res.resume();
        resolve(true);
      }
    );
    req.on("error", () => resolve(false));
    req.end();
  });
}

app.get("/healthz", async (_req, res) => {
  res.json({ ok: true, mediamtx: await probeMtxHttp() });
});

app.use("/api", requireAuth);
app.use("/api/cameras", camerasRouter);


async function main() {
  await prisma.$connect();

  // Start MediaMtx Docker container
  try {
    log.info("Starting MediaMtx Docker container...");
    await startMediaMTX();
    log.info("MediaMtx Docker container started successfully");
  } catch (e) {
    log.error({ error: e.message }, "Failed to start MediaMtx container");
    // Continue anyway - container might already be running externally
  }

  app.listen(cfg.port, () => log.info(`API listening on :${cfg.port}`));
}

// Graceful shutdown handling
process.on("SIGTERM", async () => {
  log.info("SIGTERM received, shutting down gracefully...");
  try {
    await stopMediaMTX();
    await prisma.$disconnect();
    process.exit(0);
  } catch (error) {
    log.error({ error }, "Error during shutdown");
    process.exit(1);
  }
});

process.on("SIGINT", async () => {
  log.info("SIGINT received, shutting down gracefully...");
  try {
    await stopMediaMTX();
    await prisma.$disconnect();
    process.exit(0);
  } catch (error) {
    log.error({ error }, "Error during shutdown");
    process.exit(1);
  }
});

main().catch((e) => {
  log.error(e);
  process.exit(1);
});
