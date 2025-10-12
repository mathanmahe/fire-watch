import { spawn } from "node:child_process";
import pino from "pino";
import { cfg } from "../config.js";

const log = pino({ name: "stream-manager" });

// Track active streams
const activeStreams = new Map(); // cameraId -> { process, startTime }

// -------------------------------------------------------------------
// ▶️ Start Camera Stream
// -------------------------------------------------------------------
export async function startCameraStream(camera) {
  if (activeStreams.has(camera.id)) {
    log.warn({ cameraId: camera.id, name: camera.name }, "Stream already active");
    return;
  }

  try {
    log.info({ cameraId: camera.id, name: camera.name }, "▶️ Starting camera stream");

    // Build source URL
    const sourceUrl = buildSourceUrl(camera);
    
    // Build MediaMTX destination
    const streamName = camera.streamName || camera.name.replace(/\s+/g, "_").toLowerCase();
    const destUrl = `rtsp://localhost:8554/${streamName}`;

    log.info({ 
      cameraId: camera.id,
      source: sourceUrl.replace(/:([^:@]+)@/, ":****@"), // Hide password
      destination: destUrl 
    }, "Stream URLs");

    // Determine if source is HLS or RTSP
    const isHLS = sourceUrl.includes(".m3u8") || camera.streamType === "HLS";

    // Spawn ffmpeg process to relay stream to MediaMTX
    const ffmpegArgs = ["-y"];

    if (!isHLS) {
      // RTSP source - add TCP transport
      ffmpegArgs.push(
        "-rtsp_transport", "tcp",
        "-timeout", "5000000",
        "-i", sourceUrl
      );
    } else {
      // HLS source
      ffmpegArgs.push(
        "-i", sourceUrl
      );
    }

    // Output to MediaMTX RTSP
    ffmpegArgs.push(
      "-c:v", "copy",        // Copy video codec (no re-encoding)
      "-c:a", "copy",        // Copy audio codec (if present)
      "-f", "rtsp",          // Output format
      destUrl
    );

    const streamProcess = spawn(cfg.ffmpeg, ffmpegArgs, {
      stdio: ["ignore", "pipe", "pipe"]
    });

    let stderr = "";
    streamProcess.stderr.on("data", (data) => {
      stderr += data.toString();
    });

    streamProcess.on("error", (error) => {
      log.error({ 
        cameraId: camera.id, 
        name: camera.name,
        error: error.message 
      }, "❌ Stream process error");
      activeStreams.delete(camera.id);
    });

    streamProcess.on("close", (code) => {
      if (code !== 0) {
        log.error({ 
          cameraId: camera.id, 
          name: camera.name,
          code,
          stderr: stderr.split("\n").slice(-5).join("\n") 
        }, "❌ Stream process exited");
      } else {
        log.info({ 
          cameraId: camera.id, 
          name: camera.name 
        }, "Stream process closed normally");
      }
      activeStreams.delete(camera.id);
    });

    activeStreams.set(camera.id, {
      process: streamProcess,
      startTime: new Date(),
      camera,
    });

    log.info({ 
      cameraId: camera.id, 
      name: camera.name 
    }, "✅ Stream started successfully");

  } catch (error) {
    log.error({ 
      cameraId: camera.id, 
      name: camera.name,
      error: error.message 
    }, "❌ Failed to start stream");
    throw error;
  }
}

// -------------------------------------------------------------------
// ⏹️ Stop Camera Stream
// -------------------------------------------------------------------
export async function stopCameraStream(camera) {
  const stream = activeStreams.get(camera.id);
  
  if (!stream) {
    log.warn({ cameraId: camera.id, name: camera.name }, "No active stream to stop");
    return;
  }

  try {
    log.info({ cameraId: camera.id, name: camera.name }, "⏹️ Stopping camera stream");

    // Kill the ffmpeg process
    stream.process.kill("SIGTERM");

    // Give it 2 seconds to gracefully exit, then force kill
    setTimeout(() => {
      if (activeStreams.has(camera.id)) {
        log.warn({ cameraId: camera.id }, "Forcing stream kill");
        stream.process.kill("SIGKILL");
        activeStreams.delete(camera.id);
      }
    }, 2000);

    log.info({ 
      cameraId: camera.id, 
      name: camera.name,
      duration: Math.floor((new Date() - stream.startTime) / 1000) + "s"
    }, "✅ Stream stopped");

  } catch (error) {
    log.error({ 
      cameraId: camera.id, 
      name: camera.name,
      error: error.message 
    }, "❌ Failed to stop stream");
  }
}

// -------------------------------------------------------------------
// ❓ Check if Stream is Active
// -------------------------------------------------------------------
export function isStreamActive(cameraId) {
  return activeStreams.has(cameraId);
}

// -------------------------------------------------------------------
// 📊 Get Active Streams
// -------------------------------------------------------------------
export function getActiveStreams() {
  const streams = [];
  for (const [cameraId, stream] of activeStreams.entries()) {
    streams.push({
      cameraId,
      cameraName: stream.camera.name,
      startTime: stream.startTime,
      duration: Math.floor((new Date() - stream.startTime) / 1000),
    });
  }
  return streams;
}

// -------------------------------------------------------------------
// 🛑 Stop All Streams
// -------------------------------------------------------------------
export async function stopAllStreams() {
  log.info({ count: activeStreams.size }, "🛑 Stopping all streams");

  const promises = [];
  for (const [cameraId, stream] of activeStreams.entries()) {
    promises.push(stopCameraStream(stream.camera));
  }

  await Promise.all(promises);
  activeStreams.clear();
}

// -------------------------------------------------------------------
// 🔧 Build Source URL (handles RTSP, HLS, WebRTC)
// -------------------------------------------------------------------
function buildSourceUrl(camera) {
  // Handle RTSP cameras with IP address
  if (camera.streamType === "RTSP" && camera.ip) {
    const protocol = "rtsp://";
    const auth = camera.username && camera.password
      ? `${encodeURIComponent(camera.username)}:${encodeURIComponent(camera.password)}@`
      : "";
    const addr = camera.port ? `${camera.ip}:${camera.port}` : camera.ip;
    const path = camera.streamPath || "/live";
    return `${protocol}${auth}${addr}${path}`;
  }

  // Handle HLS streams with direct URL
  if (camera.streamType === "HLS" && camera.hlsUrl) {
    return camera.hlsUrl;
  }

  // Handle WebRTC via MediaMTX HLS endpoint (for streams already in MediaMTX)
  if (camera.streamType === "WEBRTC" && camera.streamName) {
    const base = camera.webrtcBase?.replace(/:\d+$/, ":8888") || "http://127.0.0.1:8888";
    const name = camera.streamName;
    return `${base}/${encodeURIComponent(name)}/index.m3u8`;
  }

  // If nothing matches, throw error
  throw new Error(`Cannot build stream URL for camera ${camera.name}. Camera needs either: (1) RTSP with ip/port, (2) HLS with hlsUrl, or (3) WebRTC with streamName`);
}