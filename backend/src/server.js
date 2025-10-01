import express from "express";
import pino from "pino";
import { cfg } from "./config.js";
import { prisma } from "./db/prisma.js";
import { requireAuth } from "./auth/cognitoVerify.js";
import { startMediaMTX, isMediaMTXRunning } from "./services/mediamtx.js";
import { cameras as camerasRouter } from "./routes/cameras.js";
import { startCloudDetector } from "./services/cloudDetector.js";

const log = pino({ name: "server" });
const app = express();

app.use(express.json({ limit: "5mb" }));

app.get("/healthz", (_req, res) => res.json({ ok: true, mediamtx: isMediaMTXRunning() }));

app.use("/api", requireAuth);
app.use("/api/cameras", camerasRouter);

async function startExistingDetectors() {
  try {
    const activeCameras = await prisma.camera.findMany({
      where: {
        isActive: true,
        detection: "CLOUD"
      }
    });
    
    log.info({ count: activeCameras.length }, "Starting cloud detectors for active cameras");
    
    for (const cam of activeCameras) {
      startCloudDetector(cam);
    }
  } catch (error) {
    log.error({ error: error.message }, "Failed to start existing detectors");
  }
}

async function main() {
  await prisma.$connect();
  try { startMediaMTX(); } catch (e) { log.error(String(e)); }
  
  // Start detectors for all active cameras on server start
  await startExistingDetectors();
  
  app.listen(cfg.port, () => log.info(`API listening on :${cfg.port}`));
}

main().catch(e => { log.error(e); process.exit(1); });