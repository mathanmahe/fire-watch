import Docker from "dockerode";
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import pino from "pino";
import { cfg } from "../config.js";
import { generateMediaMTXConfig } from "./mediamtxConfigGenerator.js";

const log = pino({ name: "mediamtx" });
const docker = new Docker(); // defaults to /var/run/docker.sock

let container = null;
const CONTAINER_NAME = "mediamtx-firewatch";
const IMAGE_NAME = process.env.MEDIAMTX_IMAGE || "bluenviron/mediamtx:v1.14.0";

// Allow override via env, else default to 8000-8100
const ICE_MIN = Number(process.env.MEDIAMTX_ICE_MIN || 8000);
const ICE_MAX = Number(process.env.MEDIAMTX_ICE_MAX || 8100);

const isElectron = process.env.ELECTRON === "true";

export async function startMediaMTX() {
  // STEP 1: Generate MediaMTX config from database
  try {
    log.info("Generating MediaMTX configuration from database...");
    const result = await generateMediaMTXConfig();
    log.info(
      {
        serverIP: result.serverIP,
        camerasCount: result.camerasCount,
      },
      "MediaMTX config generated successfully"
    );
  } catch (error) {
    log.warn(
      { error: error.message },
      "Failed to generate MediaMTX config, will use existing config if available"
    );
  }

  // STEP 2: Resolve config path
  const rawPath = cfg.mediamtx?.config || "./mediamtx.yml";
  const configPath = path.isAbsolute(rawPath)
    ? rawPath
    : path.resolve(process.cwd(), rawPath);
  const haveConfig = fs.existsSync(configPath);

  // STEP 3: Check if container is already running
  const existing = await getExistingContainer();
  if (existing && (await isContainerRunning(existing))) {
    log.info("MediaMTX container is already running");
    container = existing;
    return container;
  }
  if (existing) await stopAndRemoveContainer(existing);

  await pullImageIfNeeded();

  const isLinux = process.platform === "linux";
  container = await createContainer({ configPath, haveConfig, isLinux });
  await container.start();
  log.info("MediaMTX container started");

  // Wait until HTTP port answers
  const timeout = Number(process.env.MEDIAMTX_READY_TIMEOUT_MS || 20000);
  await waitForHttp("127.0.0.1", 8888, timeout);
  log.info("MediaMTX HTTP is responsive on :8888");

  // Stream container logs if enabled
  if (process.env.MEDIAMTX_STREAM_LOGS === "true") {
    await streamMediaMtxLogs();
  }
  return container;
}

export async function stopMediaMTX() {
  const existing = await getExistingContainer();
  if (!existing) return;
  await stopAndRemoveContainer(existing);
  log.info("MediaMTX container stopped");
}

export async function isMediaMTXRunning() {
  const existing = await getExistingContainer();
  return existing ? isContainerRunning(existing) : false;
}

async function getExistingContainer() {
  try {
    const c = docker.getContainer(CONTAINER_NAME);
    await c.inspect();
    return c;
  } catch {
    return null;
  }
}

async function isContainerRunning(c) {
  try {
    const info = await c.inspect();
    return info.State?.Running === true;
  } catch {
    return false;
  }
}

async function pullImageIfNeeded() {
  // Check locally first
  try {
    await docker.getImage(IMAGE_NAME).inspect();
    log.info(`MediaMTX image ${IMAGE_NAME} already present locally`);
    return;
  } catch {}

  // Pull if not present
  log.info(`Pulling MediaMTX image ${IMAGE_NAME}...`);
  return new Promise((resolve, reject) => {
    docker.pull(IMAGE_NAME, (err, stream) => {
      if (err) return reject(err);
      docker.modem.followProgress(
        stream,
        (err2) => (err2 ? reject(err2) : resolve()),
        // progress events optional
        (event) => {
          if (event?.status) log.info(event.status);
        }
      );
    });
  });
}

function makePortMaps() {
  const exposed = {
    "8888/tcp": {},
    "8889/tcp": {},
    "8554/tcp": {},
    "8189/udp": {},
    "8189/tcp": {}, // WebRTC TCP fallback
  };
  const bindings = {
    "8888/tcp": [{ HostPort: "8888" }],
    "8889/tcp": [{ HostPort: "8889" }],
    "8554/tcp": [{ HostPort: "8554" }], // optional if you don't need RTSP ingress
    "8189/udp": [{ HostPort: "8189" }],
    "8189/tcp": [{ HostPort: "8189" }], // WebRTC TCP fallback
  };
  return { exposed, bindings };
}

async function createContainer({ configPath, haveConfig, isLinux }) {
  const binds = [];
  if (haveConfig) binds.push(`${configPath}:/mediamtx.yml:ro,z`);
  // Optional recordings directory
  if (process.env.MEDIAMTX_RECORDINGS_DIR) {
    binds.push(`${process.env.MEDIAMTX_RECORDINGS_DIR}:/recordings`);
  }

  // Electron-specific configuration
  if (isElectron) {
    // Ensure Docker is available
    try {
      await docker.ping();
    } catch (error) {
      throw new Error("Docker is not running. Please start Docker Desktop.");
    }
  }

  // Prefer host network on Linux (no port mappings, best for WebRTC)
  if (isLinux && process.env.MEDIAMTX_NETWORK_MODE !== "bridge") {
    return docker.createContainer({
      name: CONTAINER_NAME,
      Image: IMAGE_NAME,
      Cmd: haveConfig ? ["/mediamtx.yml"] : [],
      HostConfig: {
        NetworkMode: "host",
        RestartPolicy: { Name: "unless-stopped" },
        Binds: binds,
      },
      // no ExposedPorts/PortBindings needed in host mode
    });
  }

  // Cross-platform fallback: enumerate ports
  const { exposed, bindings } = makePortMaps();
  return docker.createContainer({
    name: CONTAINER_NAME,
    Image: IMAGE_NAME,
    ExposedPorts: exposed,
    Cmd: haveConfig ? ["/mediamtx.yml"] : [],
    HostConfig: {
      RestartPolicy: { Name: "unless-stopped" },
      Binds: binds,
      PortBindings: bindings,
    },
  });
}

async function stopAndRemoveContainer(c) {
  try {
    await c.stop({ t: 5 });
  } catch (e) {
    log.warn(`stop: ${e.message}`);
  }
  try {
    await c.remove({ force: true });
  } catch (e) {
    log.warn(`remove: ${e.message}`);
  }
}

export async function streamMediaMtxLogs() {
  if (!container) return;
  try {
    const logStream = await container.logs({
      follow: true,
      stdout: true,
      stderr: true,
      tail: 50,
    });
    logStream.on("data", (chunk) => log.info({ mtx: chunk.toString().trim() }));
  } catch (error) {
    log.error({ error: error.message }, "Failed to stream MediaMTX logs");
  }
}

async function waitForHttp(host, port, timeoutMs = 10000) {
  const deadline = Date.now() + timeoutMs;
  return new Promise((resolve, reject) => {
    const tick = () => {
      const req = http.request(
        { host, port, method: "GET", path: "/" },
        (res) => {
          res.resume();
          resolve();
        }
      );
      req.on("error", () => {
        if (Date.now() > deadline)
          return reject(new Error("MTX HTTP not ready"));
        setTimeout(tick, 300);
      });
      req.end();
    };
    tick();
  });
}
