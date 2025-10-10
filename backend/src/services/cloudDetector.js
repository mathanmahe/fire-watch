import { cfg } from "../config.js";
import { spawn } from "node:child_process";
import fetch from "node-fetch";
import pino from "pino";

const log = pino({ name: "cloud-detector" });
const workers = new Map();

// Store broadcast function (set by setBroadcastFunction)
let broadcastFireDetection = null;

/**
 * Set the broadcast function for fire detection alerts.
 * Called from server.js to avoid circular dependency.
 */
export function setBroadcastFunction(fn) {
  broadcastFireDetection = fn;
  log.info("✅ WebSocket broadcast function registered");
}

// -------------------------------------------------------------------
// 🎥 Build camera input URL (RTSP / HLS / WebRTC)
// -------------------------------------------------------------------
function inputUrlFromCamera(cam) {
  if (cam.streamType === "HLS" && cam.hlsUrl) {
    return cam.hlsUrl;
  }

  if (cam.streamType === "RTSP" && cam.ip) {
    const protocol = "rtsp://";
    const auth =
      cam.username && cam.password
        ? `${encodeURIComponent(cam.username)}:${encodeURIComponent(
            cam.password
          )}@`
        : "";
    const addr = cam.port ? `${cam.ip}:${cam.port}` : cam.ip;
    const path = cam.streamPath || "/live";
    const url = `${protocol}${auth}${addr}${path}`;
    log.info({ cam: cam.name, url: url.replace(/:([^:@]+)@/, ":****@") });
    return url;
  }

  const base = cam.webrtcBase?.replace(/:\d+$/, ":8888") || "http://127.0.0.1:8888";
  const name = cam.streamName || cam.name;
  return `${base}/${encodeURIComponent(name)}/index.m3u8`;
}

// -------------------------------------------------------------------
// 🖼️ Capture single frame via ffmpeg
// -------------------------------------------------------------------
function grabFrameOnce(srcUrl) {
  return new Promise((resolve, reject) => {
    const isRtsp = srcUrl.startsWith("rtsp://");
    const args = ["-y"];
    if (isRtsp) {
      args.push(
        "-rtsp_transport", "tcp",
        "-timeout", "5000000",
        "-analyzeduration", "1000000",
        "-probesize", "1000000"
      );
    }

    args.push("-i", srcUrl, "-frames:v", "1", "-q:v", "2", "-f", "image2", "-");

    const ff = spawn(cfg.ffmpeg, args, { stdio: ["ignore", "pipe", "pipe"] });
    const chunks = [];
    let err = "";

    ff.stdout.on("data", (d) => chunks.push(d));
    ff.stderr.on("data", (d) => (err += d.toString()));
    ff.on("error", reject);
    ff.on("close", (code) => {
      if (code === 0 && chunks.length) resolve(Buffer.concat(chunks));
      else reject(new Error(`ffmpeg exit ${code}: ${err.split("\n").slice(-3).join(" ")}`));
    });
  });
}

// -------------------------------------------------------------------
// ☁️ Post frame to Fire Detection API
// -------------------------------------------------------------------
async function postToFireEndpoint(cameraName, jpeg) {
  const r = await fetch(cfg.fireEndpoint, {
    method: "POST",
    headers: { "Content-Type": "image/jpeg", "camera-id": cameraName },
    body: jpeg,
  });
  if (!r.ok) throw new Error(`${r.status} ${await r.text().catch(() => r.statusText)}`);
  return r.json().catch(() => ({}));
}

// -------------------------------------------------------------------
// 🚨 Main Cloud Detector Loop
// -------------------------------------------------------------------
export function startCloudDetector(cam, { fps = 0.2 } = {}) {
  if (workers.has(cam.id)) {
    log.warn({ cam: cam.name }, "Detector already running");
    return;
  }

  const ms = Math.max(1000, Math.floor(1000 / fps));
  const src = inputUrlFromCamera(cam);
  log.info({ cam: cam.name, userId: cam.userId, src: src.replace(/:([^:@]+)@/, ":****@") }, "Starting detector");

  let alive = true;
  (async function loop() {
    while (alive) {
      try {
        const jpeg = await grabFrameOnce(src);
        const res = await postToFireEndpoint(cam.name, jpeg);
        const fire = !!(res?.fire_detected || res?.isFire || res?.detections?.length > 0);

        if (fire) {
          log.warn({ cam: cam.name, userId: cam.userId, cameraId: cam.id }, "🔥 FIRE DETECTED");
          if (broadcastFireDetection) {
            log.info({ userId: cam.userId, cameraId: cam.id, cameraName: cam.name }, "📢 Broadcasting fire detection to WebSocket clients");
            broadcastFireDetection(cam.userId, cam.id, cam.name, true);
          } else {
            log.warn("⚠️ broadcastFireDetection function not available");
          }
        } else {
          log.info({ cam: cam.name, fire }, "✅ No fire detected");
          if (broadcastFireDetection) {
            broadcastFireDetection(cam.userId, cam.id, cam.name, false);
          }
        }
      } catch (e) {
        log.warn({ cam: cam.name, err: String(e) }, "⚠️ Cloud detection failed");
      }
      await new Promise((r) => setTimeout(r, ms));
    }
  })();

  workers.set(cam.id, () => {
    alive = false;
  });
}

// -------------------------------------------------------------------
// 🛑 Stop Detector
// -------------------------------------------------------------------
export function stopCloudDetector(camId) {
  const stop = workers.get(camId);
  if (stop) {
    stop();
    workers.delete(camId);
    log.info({ camId }, "🛑 Stopped cloud detector");
  }
}

// -------------------------------------------------------------------
// 📋 List running detectors
// -------------------------------------------------------------------
export function getRunningDetectors() {
  return workers;
}
