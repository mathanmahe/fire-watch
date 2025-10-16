import Docker from "dockerode";
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import pino from "pino";
import os from "node:os";
import { cfg } from "../config.js";
import { generateMediaMTXConfig } from "./mediamtxConfigGenerator.js";

const log = pino({ name: "mediamtx" });
const docker = new Docker();

let container = null;
const CONTAINER_NAME = "mediamtx-firewatch";
const IMAGE_NAME = process.env.MEDIAMTX_IMAGE || "bluenviron/mediamtx:v1.14.0";

// ✅ FIX: Use user data directory for config when running in Electron
function getConfigPath() {
  const isElectron = process.env.ELECTRON === 'true';
  
  if (isElectron) {
    // ✅ Use user's home directory for Electron
    const userDataPath = path.join(os.homedir(), '.firewatch');
    
    // Create directory if it doesn't exist
    if (!fs.existsSync(userDataPath)) {
      fs.mkdirSync(userDataPath, { recursive: true });
      log.info({ path: userDataPath }, "Created FireWatch user data directory");
    }
    
    return path.join(userDataPath, 'mediamtx.yml');
  } else {
    // ✅ Use project directory for normal mode
    const rawPath = cfg.mediamtx?.config || "./mediamtx.yml";
    return path.isAbsolute(rawPath) ? rawPath : path.resolve(process.cwd(), rawPath);
  }
}

export async function startMediaMTX() {
  // STEP 1: Generate MediaMTX config
  try {
    log.info("Generating MediaMTX configuration from database...");
    
    // ✅ Generate config in accessible location
    const configPath = getConfigPath();
    const result = await generateMediaMTXConfig(configPath);
    
    log.info(
      {
        serverIP: result.serverIP,
        camerasCount: result.camerasCount,
        configPath: configPath,
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
  const configPath = getConfigPath();
  const haveConfig = fs.existsSync(configPath);

  if (!haveConfig) {
    log.warn({ configPath }, "MediaMTX config not found");
  }

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
  log.info({ configPath }, "MediaMTX container started");

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

// Rest of the file stays the same...
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
  try {
    await docker.getImage(IMAGE_NAME).inspect();
    log.info(`MediaMTX image ${IMAGE_NAME} already present locally`);
    return;
  } catch {}

  log.info(`Pulling MediaMTX image ${IMAGE_NAME}...`);
  return new Promise((resolve, reject) => {
    docker.pull(IMAGE_NAME, (err, stream) => {
      if (err) return reject(err);
      docker.modem.followProgress(
        stream,
        (err2) => (err2 ? reject(err2) : resolve()),
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
    "8189/tcp": {},
  };
  const bindings = {
    "8888/tcp": [{ HostPort: "8888" }],
    "8889/tcp": [{ HostPort: "8889" }],
    "8554/tcp": [{ HostPort: "8554" }],
    "8189/udp": [{ HostPort: "8189" }],
    "8189/tcp": [{ HostPort: "8189" }],
  };
  return { exposed, bindings };
}

async function createContainer({ configPath, haveConfig, isLinux }) {
  const binds = [];
  if (haveConfig) binds.push(`${configPath}:/mediamtx.yml:ro`);

  if (process.env.MEDIAMTX_RECORDINGS_DIR) {
    binds.push(`${process.env.MEDIAMTX_RECORDINGS_DIR}:/recordings`);
  }

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
    });
  }

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