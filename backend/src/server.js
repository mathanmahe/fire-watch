import express from "express";
import pino from "pino";
import { cfg } from "./config.js";
import { prisma } from "./db/prisma.js";
import { requireAuth } from "./auth/cognitoVerify.js";
import { startMediaMTX, isMediaMTXRunning } from "./services/mediamtx.js";
import { cameras as camerasRouter } from "./routes/cameras.js";

const log = pino({ name: "server" });
const app = express();

app.use(express.json({ limit: "5mb" }));

app.get("/healthz", (_req, res) => res.json({ ok: true, mediamtx: isMediaMTXRunning() }));

// Protect APIs with Cognito (uncomment line below once Amplify login is hooked up)
// app.use("/api", requireAuth);
app.use("/api/cameras", camerasRouter);

async function main() {
  await prisma.$connect();
  try { startMediaMTX(); } catch (e) { log.error(String(e)); }
  app.listen(cfg.port, () => log.info(`API listening on :${cfg.port}`));
}

main().catch(e => { log.error(e); process.exit(1); });
