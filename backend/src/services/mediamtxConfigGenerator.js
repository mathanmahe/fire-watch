import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import yaml from "js-yaml";
import pino from "pino";
import { prisma } from "../db/prisma.js";
import { cfg } from "../config.js"; // ✅ Import at top level, not inside function

const log = pino({ name: "mediamtx-config-generator" });

/**
 * Generates mediamtx.yml configuration file dynamically from database cameras
 * @returns {Promise<{serverIP: string, camerasCount: number}>} Generation result
 */
export async function generateMediaMTXConfig() {
  log.info("Starting MediaMTX config generation...");

  console.log("🔍 mediamtxConfigGenerator - cfg:", cfg);
  console.log("🔍 mediamtxConfigGenerator - cfg.userId:", cfg.userId);

  try {
    const currentUserId = cfg.userId;
    console.log("🔍 mediamtxConfigGenerator - currentUserId:", currentUserId);

    // ✅ Build where clause with user filter
    const whereClause = currentUserId
      ? { userId: currentUserId, isActive: true }
      : { isActive: true };

    // 1. Fetch cameras with user filtering
    const cameras = await prisma.camera.findMany({
      where: whereClause,
      orderBy: { id: "asc" },
    });

    if (currentUserId) {
      log.info(
        `Found ${cameras.length} active cameras for user ${currentUserId}`
      );
    } else {
      log.info(`Found ${cameras.length} active cameras in database`);
      log.warn("⚠️ No USER_ID set - generating config for ALL cameras");
    }

    // 2. Detect server IP address
    const serverIP = detectServerIP();
    log.info(`Detected server IP: ${serverIP}`);

    // 3. Build MediaMTX configuration object
    const config = buildMediaMTXConfig(cameras, serverIP);

    // 4. Convert to YAML and write to file
    const yamlString = yaml.dump(config, {
      indent: 2,
      lineWidth: -1, // Disable line wrapping
      noRefs: true,
      styles: {
        "!!bool": "lowercase", // Output booleans as yes/no
      },
      sortKeys: false, // Keep original order
    });

    const configPath = path.resolve(process.cwd(), "mediamtx.yml");
    await fs.writeFile(configPath, yamlString, "utf8");

    log.info(`MediaMTX config written to ${configPath}`);

    return {
      serverIP,
      camerasCount: cameras.length,
      configPath,
    };
  } catch (error) {
    log.error({ error: error.message }, "Failed to generate MediaMTX config");
    throw error;
  }
}

/**
 * Builds the complete MediaMTX configuration object
 * @param {Array} cameras - Array of camera records from database
 * @param {string} serverIP - Server IP address for WebRTC
 * @returns {Object} MediaMTX configuration object
 */
function buildMediaMTXConfig(cameras, serverIP) {
  const config = {
    logLevel: "info", // Changed from "debug" to reduce logs

    // ✅ OPTIMIZED HLS for low latency
    hls: true,
    hlsAddress: ":8888",
    hlsAllowOrigin: "*",
    hlsVariant: "lowLatency",
    hlsSegmentCount: 3, // ✅ Reduce segments for lower latency
    hlsSegmentDuration: "1s", // ✅ 1-second segments (was default 3s)
    hlsPartDuration: "200ms", // ✅ Sub-second chunks

    // ✅ OPTIMIZED WebRTC for low latency
    webrtc: true,
    webrtcAddress: ":8889",
    webrtcAllowOrigin: "*",
    webrtcLocalUDPAddress: ":8189",
    webrtcLocalTCPAddress: ":8189",
    webrtcIPsFromInterfaces: false,
    webrtcAdditionalHosts: [serverIP],

    // RTSP server
    rtsp: true,
    rtspAddress: ":8554",

    // ✅ Reduce read timeout for faster disconnection detection
    readTimeout: "10s",
    writeTimeout: "10s",

    // Camera paths
    paths: buildCameraPaths(cameras),
  };

  return config;
}

/**
 * Builds path configurations for all cameras
 * @param {Array} cameras - Array of camera records
 * @returns {Object} Paths object for MediaMTX config
 */
function buildCameraPaths(cameras) {
  const paths = {};

  for (const cam of cameras) {
    // Use camera name as the MediaMTX path name
    // Sanitize name to be URL-safe (replace spaces with underscores)
    const pathName = sanitizePathName(cam.name);

    const pathConfig = buildCameraPathConfig(cam);

    paths[pathName] = pathConfig;

    log.debug(
      { camera: cam.name, pathName, hasSource: !!pathConfig.source },
      "Generated camera path"
    );
  }

  return paths;
}

/**
 * Builds configuration for a single camera path
 * @param {Object} cam - Camera record from database
 * @returns {Object} Path configuration object
 */
function buildCameraPathConfig(cam) {
  const pathConfig = {};

  // Build source URL based on camera stream type
  if ((cam.streamType === "RTSP" || cam.streamType === "WEBRTC") && cam.ip) {
    // RTSP camera or WebRTC camera with IP address (both need RTSP source)
    pathConfig.source = buildRTSPUrl(cam);
  } else if (cam.streamType === "HLS" && cam.hlsUrl) {
    // Direct HLS URL
    pathConfig.source = cam.hlsUrl;
  }
  // For cameras without source info, leave empty (on-demand publishing)

  return pathConfig;
}

/**
 * Builds RTSP URL from camera configuration
 * @param {Object} cam - Camera record
 * @returns {string} RTSP URL
 */
function buildRTSPUrl(cam) {
  const username = encodeURIComponent(cam.username || "");
  const password = encodeURIComponent(cam.password || "");
  const port = cam.port || "554";
  let streamPath = cam.streamPath || "/live";

  // Ensure streamPath starts with /
  if (streamPath && !streamPath.startsWith("/")) {
    streamPath = "/" + streamPath;
  }

  // Build authentication part
  const auth = username && password ? `${username}:${password}@` : "";

  return `rtsp://${auth}${cam.ip}:${port}${streamPath}`;
}

/**
 * Sanitizes camera name to be a valid MediaMTX path name
 * @param {string} name - Camera name
 * @returns {string} Sanitized path name
 */
export function sanitizePathName(name) {
  return name
    .replace(/\s+/g, "_") // Replace spaces with underscores
    .replace(/[^a-zA-Z0-9_-]/g, "") // Remove special characters
    .toLowerCase(); // Convert to lowercase for consistency
}

/**
 * Detects the server's primary LAN IP address
 * @returns {string} Server IP address
 */
export function detectServerIP() {
  // Check for environment variable override
  const envIP = process.env.MEDIAMTX_SERVER_IP;
  if (envIP && envIP !== "auto") {
    log.info(`Using MEDIAMTX_SERVER_IP from environment: ${envIP}`);
    return envIP;
  }

  const interfaces = os.networkInterfaces();

  // Priority order for interface names (common naming conventions)
  const priorityPrefixes = ["eth", "en", "wlan", "wlp"];

  // First pass: look for priority interfaces
  for (const prefix of priorityPrefixes) {
    for (const [name, addresses] of Object.entries(interfaces)) {
      if (!name.startsWith(prefix)) continue;

      for (const addr of addresses) {
        // Skip internal and IPv6 addresses
        if (!addr.internal && addr.family === "IPv4") {
          log.info(`Detected IP from interface ${name}: ${addr.address}`);
          return addr.address;
        }
      }
    }
  }

  // Second pass: any non-internal IPv4
  for (const [name, addresses] of Object.entries(interfaces)) {
    for (const addr of addresses) {
      if (!addr.internal && addr.family === "IPv4") {
        log.info(`Detected IP from interface ${name}: ${addr.address}`);
        return addr.address;
      }
    }
  }

  // Fallback to localhost
  log.warn("Could not detect LAN IP, falling back to 127.0.0.1");
  return "127.0.0.1";
}

/**
 * Updates existing camera records with auto-generated fields
 * @param {number} cameraId - Camera ID to update
 * @returns {Promise<Object>} Updated camera record
 */
export async function updateCameraStreamFields(cameraId) {
  const serverIP = detectServerIP();

  const camera = await prisma.camera.findUnique({
    where: { id: cameraId },
  });

  if (!camera) {
    throw new Error(`Camera with ID ${cameraId} not found`);
  }

  // Auto-populate streamName, streamPath, and webrtcBase if not already set
  const updates = {};

  if (!camera.streamName) {
    updates.streamName = sanitizePathName(camera.name);
  }

  if (!camera.streamPath) {
    updates.streamPath = "/live";
  }

  if (!camera.webrtcBase) {
    updates.webrtcBase = `http://${serverIP}:8889`;
  }

  if (Object.keys(updates).length > 0) {
    const updated = await prisma.camera.update({
      where: { id: cameraId },
      data: updates,
    });

    log.info(
      { cameraId, updates },
      "Updated camera with auto-generated fields"
    );

    return updated;
  }

  return camera;
}
