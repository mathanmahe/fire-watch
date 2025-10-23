import fs from "node:fs/promises";
import path from "path";
import os from "node:os";
import yaml from "js-yaml";
import pino from "pino";
import { dynamodb } from "../db/dynamodb.js";

const log = pino({ name: "mediamtx-config-generator" });

/**
 * Generates mediamtx.yml configuration file dynamically from DynamoDB cameras
 * @param {string} outputPath - Optional path where to write the config file
 * @param {string} userId - Optional user ID to filter cameras
 * @returns {Promise<{serverIP: string, camerasCount: number}>} Generation result
 */
export async function generateMediaMTXConfig(outputPath, userId = null) {
  log.info("Starting MediaMTX config generation...");

  try {
    if (!userId) {
      log.warn("⚠️ No USER_ID provided - generating config with EMPTY paths");
      log.warn("⚠️ Config will be regenerated when user logs in via WebSocket");
    } else {
      log.info(`Generating config for user: ${userId}`);
    }

    // ✅ If no user ID, return empty paths
    let cameras = [];
    if (userId) {
      cameras = await dynamodb.getActiveCameras(userId);
      log.info(`Found ${cameras.length} active cameras for user ${userId}`);
    } else {
      log.info("No user ID - skipping camera query (empty paths)");
    }

    // 2. Detect server IP address
    const serverIP = detectServerIP();
    log.info(`Detected server IP: ${serverIP}`);

    // 3. Build MediaMTX configuration object
    const config = buildMediaMTXConfig(cameras, serverIP);

    // 4. Convert to YAML and write to file
    const yamlString = yaml.dump(config, {
      indent: 2,
      lineWidth: -1,
      noRefs: true,
      styles: {
        "!!bool": "lowercase",
      },
      sortKeys: false,
    });

    const configPath =
      outputPath || path.resolve(process.cwd(), "mediamtx.yml");
    await fs.writeFile(configPath, yamlString, "utf8");

    log.info(`MediaMTX config written to ${configPath} (${cameras.length} cameras)`);

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
 * @param {Array} cameras - Array of camera records from DynamoDB
 * @param {string} serverIP - Server IP address for WebRTC
 * @returns {Object} MediaMTX configuration object
 */
function buildMediaMTXConfig(cameras, serverIP) {
  const config = {
    logLevel: "info",

    hls: true,
    hlsAddress: ":8888",
    hlsAllowOrigin: "*",
    hlsVariant: "lowLatency",
    hlsSegmentCount: 3,
    hlsSegmentDuration: "1s",
    hlsPartDuration: "200ms",

    webrtc: true,
    webrtcAddress: ":8889",
    webrtcAllowOrigin: "*",
    webrtcLocalUDPAddress: ":8189",
    webrtcLocalTCPAddress: ":8189",
    webrtcIPsFromInterfaces: false,
    webrtcAdditionalHosts: [serverIP],

    rtsp: true,
    rtspAddress: ":8554",

    readTimeout: "10s",
    writeTimeout: "10s",

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
    const pathName = sanitizePathName(cam.streamName || cam.name);
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
 * @param {Object} cam - Camera record from DynamoDB
 * @returns {Object} Path configuration object
 */
function buildCameraPathConfig(cam) {
  const pathConfig = {};

  if ((cam.streamType === "RTSP" || cam.streamType === "WEBRTC") && cam.ip) {
    pathConfig.source = buildRTSPUrl(cam);
  } else if (cam.streamType === "HLS" && cam.hlsUrl) {
    pathConfig.source = cam.hlsUrl;
  }

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

  if (streamPath && !streamPath.startsWith("/")) {
    streamPath = "/" + streamPath;
  }

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
    .replace(/\s+/g, "_")
    .replace(/[^a-zA-Z0-9_-]/g, "")
    .toLowerCase();
}

/**
 * Detects the server's primary LAN IP address
 * @returns {string} Server IP address
 */
export function detectServerIP() {
  const envIP = process.env.MEDIAMTX_SERVER_IP;
  if (envIP && envIP !== "auto") {
    log.info(`Using MEDIAMTX_SERVER_IP from environment: ${envIP}`);
    return envIP;
  }

  const interfaces = os.networkInterfaces();
  const priorityPrefixes = ["eth", "en", "wlan", "wlp"];

  for (const prefix of priorityPrefixes) {
    for (const [name, addresses] of Object.entries(interfaces)) {
      if (!name.startsWith(prefix)) continue;

      for (const addr of addresses) {
        if (!addr.internal && addr.family === "IPv4") {
          log.info(`Detected IP from interface ${name}: ${addr.address}`);
          return addr.address;
        }
      }
    }
  }

  for (const [name, addresses] of Object.entries(interfaces)) {
    for (const addr of addresses) {
      if (!addr.internal && addr.family === "IPv4") {
        log.info(`Detected IP from interface ${name}: ${addr.address}`);
        return addr.address;
      }
    }
  }

  log.warn("Could not detect LAN IP, falling back to 127.0.0.1");
  return "127.0.0.1";
}
