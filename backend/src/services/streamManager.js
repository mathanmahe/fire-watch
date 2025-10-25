import { spawn } from "node:child_process";
import pino from "pino";
import { cfg } from "../config.js";

const log = pino({ name: "stream-manager" });
const activeStreams = new Map();

// -------------------------------------------------------------------
// DEPRECATED - start camera stream is handled in the frontend
// -------------------------------------------------------------------
export async function startCameraStream(camera) {
  if (activeStreams.has(camera.id)) {
    log.warn(
      { cameraId: camera.id, name: camera.name },
      "Stream already active"
    );
    return;
  }

  try {
    log.info(
      { cameraId: camera.id, name: camera.name },
      "▶️ Starting camera stream"
    );

    // Build source URL from REAL camera
    const sourceUrl = buildSourceUrl(camera);

    // Build MediaMTX destination - use different path to avoid conflict with MediaMTX source
    const streamName =
      camera.streamName || camera.name.replace(/\s+/g, "_").toLowerCase();
    const destUrl = `rtsp://localhost:8554/${streamName}-fire`; // Add -fire suffix to avoid conflict

    log.info(
      {
        cameraId: camera.id,
        source: sourceUrl.replace(/:([^:@]+)@/, ":****@"),
        destination: destUrl,
      },
      "Stream URLs"
    );

    const isHLS = sourceUrl.includes(".m3u8");

    // ✅ SIMPLIFIED FFMPEG ARGS for better reliability
    const ffmpegArgs = ["-y"];

    if (!isHLS) {
      // RTSP source - SIMPLIFIED
      ffmpegArgs.push(
        "-rtsp_transport",
        "tcp",
        "-i",
        sourceUrl,
        "-c:v",
        "copy", // Just copy, no re-encoding
        "-an", // ✅ Drop audio to reduce load
        "-f",
        "rtsp",
        destUrl
      );
    } else {
      // HLS source
      ffmpegArgs.push(
        "-i",
        sourceUrl,
        "-c:v",
        "copy",
        "-an", // ✅ Drop audio to reduce load
        "-f",
        "rtsp",
        destUrl
      );
    }

    const streamProcess = spawn(cfg.ffmpeg, ffmpegArgs, {
      stdio: ["ignore", "pipe", "pipe"],
    });

    let stderr = "";
    streamProcess.stderr.on("data", (data) => {
      stderr += data.toString();
    });

    streamProcess.on("error", (error) => {
      log.error(
        {
          cameraId: camera.id,
          name: camera.name,
          error: error.message,
        },
        "❌ Stream process error"
      );
      activeStreams.delete(camera.id);
    });

    streamProcess.on("close", (code) => {
      if (code !== 0) {
        log.error(
          {
            cameraId: camera.id,
            name: camera.name,
            code,
            stderr: stderr.split("\n").slice(-5).join("\n"),
          },
          "❌ Stream process exited"
        );
      } else {
        log.info(
          {
            cameraId: camera.id,
            name: camera.name,
          },
          "Stream process closed normally"
        );
      }
      activeStreams.delete(camera.id);
    });

    activeStreams.set(camera.id, {
      process: streamProcess,
      startTime: new Date(),
      camera,
    });

    log.info(
      {
        cameraId: camera.id,
        name: camera.name,
      },
      "✅ Stream started successfully"
    );
  } catch (error) {
    log.error(
      {
        cameraId: camera.id,
        name: camera.name,
        error: error.message,
      },
      "❌ Failed to start stream"
    );
    throw error;
  }
}

// -------------------------------------------------------------------
// ⏹️ Stop Camera Stream
// -------------------------------------------------------------------
export async function stopCameraStream(camera) {
  const stream = activeStreams.get(camera.id);

  if (!stream) {
    log.warn(
      { cameraId: camera.id, name: camera.name },
      "No active stream to stop"
    );
    return;
  }

  try {
    log.info(
      { cameraId: camera.id, name: camera.name },
      "⏹️ Stopping camera stream"
    );
    stream.process.kill("SIGTERM");

    setTimeout(() => {
      if (activeStreams.has(camera.id)) {
        log.warn({ cameraId: camera.id }, "Forcing stream kill");
        stream.process.kill("SIGKILL");
        activeStreams.delete(camera.id);
      }
    }, 2000);

    log.info(
      {
        cameraId: camera.id,
        name: camera.name,
        duration: Math.floor((new Date() - stream.startTime) / 1000) + "s",
      },
      "✅ Stream stopped"
    );
  } catch (error) {
    log.error(
      {
        cameraId: camera.id,
        name: camera.name,
        error: error.message,
      },
      "❌ Failed to stop stream"
    );
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
// 🔧 Build Source URL
// -------------------------------------------------------------------
function buildSourceUrl(camera) {
  // PRIORITY 1: RTSP camera with IP
  if (camera.ip && camera.ip.trim() !== "") {
    const protocol = "rtsp://";
    const auth =
      camera.username && camera.password
        ? `${encodeURIComponent(camera.username)}:${encodeURIComponent(
            camera.password
          )}@`
        : "";
    const addr = camera.port ? `${camera.ip}:${camera.port}` : camera.ip;
    const path = camera.streamPath || "/live";
    return `${protocol}${auth}${addr}${path}`;
  }

  // PRIORITY 2: Direct HLS URL
  if (camera.hlsUrl && camera.hlsUrl.trim() !== "") {
    return camera.hlsUrl;
  }

  throw new Error(
    `Cannot build stream URL for camera ${camera.name}. ` +
      `Needs either: ip+port or hlsUrl`
  );
}