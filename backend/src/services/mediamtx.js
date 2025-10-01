import { spawn } from "node:child_process";
import fs from "node:fs";
import pino from "pino";
import { cfg } from "../config.js";

const log = pino({ name: "mediamtx" });
let proc = null;

export function startMediaMTX() {
  if (proc) return proc;
  if (!cfg.mediamtx.config || !fs.existsSync(cfg.mediamtx.config)) {
    throw new Error(`mediamtx.yml not found at ${cfg.mediamtx.config}`);
  }
  log.info("Starting MediaMTX…");
  proc = spawn(cfg.mediamtx.bin, ["-config", cfg.mediamtx.config], { stdio: ["ignore", "pipe", "pipe"] });
  proc.stdout.on("data", d => log.info(d.toString().trim()));
  proc.stderr.on("data", d => log.warn(d.toString().trim()));
  proc.on("exit", (code) => { log.error({ code }, "MediaMTX exited"); proc = null; });
  return proc;
}

export function stopMediaMTX() { if (proc) proc.kill("SIGTERM"); }
export function isMediaMTXRunning() { return !!proc; }
