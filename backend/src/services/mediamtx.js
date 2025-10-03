import Docker from "dockerode";
import fs from "node:fs";
import http from "node:http";
import pino from "pino";
import { cfg } from "../config.js";

const log = pino({ name: "mediamtx" });
const docker = new Docker(); // defaults to /var/run/docker.sock

let container = null;
const CONTAINER_NAME = "mediamtx-firewatch";
const IMAGE_NAME = "bluenviron/mediamtx:latest";

// Allow override via env, else default to 8000-8100
const ICE_MIN = Number(process.env.MEDIAMTX_ICE_MIN || 8000);
const ICE_MAX = Number(process.env.MEDIAMTX_ICE_MAX || 8100);

export async function startMediaMTX() {
  const configPath = cfg.mediamtx?.config || "./mediamtx.yml";
  const haveConfig = fs.existsSync(configPath);

  // If running already, return
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
  await waitForHttp("127.0.0.1", 8888, 10000);
  log.info("MediaMTX HTTP is responsive on :8888");
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
  // Pull latest every time to keep image fresh; or check presence first
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
  // TCP ports
  const exposed = { "8554/tcp": {}, "8888/tcp": {}, "8889/tcp": {} };
  const bindings = {
    "8554/tcp": [{ HostPort: "8554" }],
    "8888/tcp": [{ HostPort: "8888" }],
    "8889/tcp": [{ HostPort: "8889" }],
  };

  // UDP range
  for (let p = ICE_MIN; p <= ICE_MAX; p++) {
    exposed[`${p}/udp`] = {};
    bindings[`${p}/udp`] = [{ HostPort: String(p) }];
  }
  return { exposed, bindings };
}

async function createContainer({ configPath, haveConfig, isLinux }) {
  const binds = [];
  if (haveConfig) binds.push(`${configPath}:/mediamtx.yml:ro`);
  // Optional recordings directory
  if (process.env.MEDIAMTX_RECORDINGS_DIR) {
    binds.push(`${process.env.MEDIAMTX_RECORDINGS_DIR}:/recordings`);
  }

  // Prefer host network on Linux (no port mappings, best for WebRTC)
  if (isLinux && process.env.MEDIAMTX_NETWORK_MODE !== "bridge") {
    return docker.createContainer({
      name: CONTAINER_NAME,
      Image: IMAGE_NAME,
      Cmd: haveConfig ? ["-config", "/mediamtx.yml"] : [],
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
    Cmd: haveConfig ? ["-config", "/mediamtx.yml"] : [],
    HostConfig: {
      RestartPolicy: { Name: "unless-stopped" },
      Binds: binds,
      PortBindings: bindings,
    },
  });
}

async function stopAndRemoveContainer(c) {
  try { await c.stop({ t: 5 }); } catch (e) { log.warn(`stop: ${e.message}`); }
  try { await c.remove({ force: true }); } catch (e) { log.warn(`remove: ${e.message}`); }
}

async function waitForHttp(host, port, timeoutMs = 10000) {
  const deadline = Date.now() + timeoutMs;
  return new Promise((resolve, reject) => {
    const tick = () => {
      const req = http.request({ host, port, method: "GET", path: "/" }, (res) => {
        res.resume();
        resolve();
      });
      req.on("error", () => {
        if (Date.now() > deadline) return reject(new Error("MTX HTTP not ready"));
        setTimeout(tick, 300);
      });
      req.end();
    };
    tick();
  });
}
