import * as ort from "onnxruntime-node";
import sharp from "sharp";
import { spawn } from "node:child_process";
import { cfg } from "../config.js";
import pino from "pino";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const log = pino({ name: "local-detector" });

// -------------------------------------------------------------------
// 🎯 ONNX Session Management (Singleton)
// -------------------------------------------------------------------
let sessionPromise = null;

function getSession() {
  if (!sessionPromise) {
    const modelPath = path.resolve(__dirname, "../../models/best.onnx");
    log.info({ modelPath }, "Loading Fire ONNX model...");

    sessionPromise = ort.InferenceSession.create(modelPath, {
      executionProviders: ["cpu"],
    }).then((session) => {
      log.info("✅ Fire ONNX session ready");
      log.info({ inputNames: session.inputNames, outputNames: session.outputNames }, "Model Metadata");
      return session;
    }).catch((err) => {
      log.error({ error: err.message }, "❌ Failed to load Fire ONNX model");
      sessionPromise = null;
      throw err;
    });
  }
  return sessionPromise;
}

// -------------------------------------------------------------------
// 🖼️ Frame Extraction via ffmpeg
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
// 🔄 Image Preprocessing (Canvas → Sharp)
// -------------------------------------------------------------------
async function prepareInput(jpegBuffer, modelInputSize = 640) {
  try {
    const { data, info } = await sharp(jpegBuffer)
      .resize(modelInputSize, modelInputSize, {
        fit: "contain",
        background: { r: 114, g: 114, b: 114 }
      })
      .raw()
      .toBuffer({ resolveWithObject: true });

    const N = modelInputSize * modelInputSize;
    const arr = new Float32Array(N * 3);

    // Standard normalization (0-1)
    let r = 0, g = N, b = 2 * N;
    for (let i = 0; i < data.length; i += 3) {
      arr[r++] = data[i] / 255.0;
      arr[g++] = data[i + 1] / 255.0;
      arr[b++] = data[i + 2] / 255.0;
    }

    return arr;
  } catch (e) {
    log.error({ error: e.message }, "Failed to preprocess image");
    throw e;
  }
}

// -------------------------------------------------------------------
// 🧠 ONNX Inference
// -------------------------------------------------------------------
async function runInference(inputTensor) {
  try {
    const session = await getSession();

    // RT-DETR usually expects [1, 3, 640, 640]
    const tensor = new ort.Tensor(
      "float32",
      inputTensor,
      [1, 3, 640, 640]
    );

    // Run inference
    const inputName = session.inputNames[0];
    const feeds = {};
    feeds[inputName] = tensor;

    const outputs = await session.run(feeds);
    return outputs;
  } catch (e) {
    log.error({ error: e.message }, "Inference failed");
    throw e;
  }
}

// -------------------------------------------------------------------
// 📊 Process RT-DETR Output
// -------------------------------------------------------------------
function processOutput(outputs, imgW = 640, imgH = 640) {
  let boxes = [];
  let fireCount = 0;
  let smokeCount = 0;
  let totalFireArea = 0;

  // Debug output keys
  const keys = Object.keys(outputs);

  let rawBoxes = null;
  let rawScores = null;
  let combined = null;

  if (keys.includes("boxes") && keys.includes("scores")) {
    rawBoxes = outputs["boxes"].data;
    rawScores = outputs["scores"].data;
  } else if (keys.length === 1) {
    combined = outputs[keys[0]].data;
  } else {
    log.warn({ keys }, "Unknown output format, trying to parse...");
  }

  const numQueries = 300; // Standard RT-DETR query count
  const numClasses = 3; // Fire, Smoke, Other
  const probThreshold = 0.85; // Confidence threshold (Increased to 0.85 to stop false positives)

  // Helper to get box coordinates
  const getBox = (i) => {
    if (rawBoxes) {
      // rawBoxes is [1, 300, 4] flattened
      const offset = i * 4;
      return [
        rawBoxes[offset],
        rawBoxes[offset + 1],
        rawBoxes[offset + 2],
        rawBoxes[offset + 3]
      ];
    } else if (combined) {
      // combined is [1, 300, 4+classes] flattened
      // stride = 4 + numClasses
      const stride = 4 + numClasses;
      const offset = i * stride;
      return [
        combined[offset],
        combined[offset + 1],
        combined[offset + 2],
        combined[offset + 3]
      ];
    }
    return [0, 0, 0, 0];
  };

  // Helper to get max score and class
  const getScore = (i) => {
    let maxScore = 0;
    let maxClass = -1;

    if (rawScores) {
      // rawScores is [1, 300, numClasses] flattened
      const offset = i * numClasses;
      for (let c = 0; c < numClasses; c++) {
        const s = rawScores[offset + c];
        if (s > maxScore) {
          maxScore = s;
          maxClass = c;
        }
      }
    } else if (combined) {
      // combined is [1, 300, 4+classes] flattened
      const stride = 4 + numClasses;
      const offset = i * stride + 4; // Skip 4 box coords
      for (let c = 0; c < numClasses; c++) {
        const s = combined[offset + c];
        if (s > maxScore) {
          maxScore = s;
          maxClass = c;
        }
      }
    }
    return { maxScore, maxClass };
  };

  // DEBUG: Log top 5 scores regardless of threshold
  const allScores = [];
  for (let i = 0; i < numQueries; i++) {
    const { maxScore, maxClass } = getScore(i);
    allScores.push({ score: maxScore, class: maxClass });
  }
  allScores.sort((a, b) => b.score - a.score);
  const top5 = allScores.slice(0, 5).map(s => ({
    score: s.score.toFixed(4),
    label: ["Fire", "Smoke", "Other"][s.class] || "Unknown"
  }));
  log.info({ top5 }, "🔥 LOCAL: Top 5 Raw Scores");

  for (let i = 0; i < numQueries; i++) {
    const { maxScore, maxClass } = getScore(i);

    if (maxScore < probThreshold) continue;

    const [cx, cy, w, h] = getBox(i);

    // Convert cx, cy, w, h (normalized 0-1) to x1, y1, x2, y2 (pixel coords)
    const x1 = (cx - w / 2) * imgW;
    const y1 = (cy - h / 2) * imgH;
    const x2 = (cx + w / 2) * imgW;
    const y2 = (cy + h / 2) * imgH;

    const label = ["Fire", "Smoke", "Other"][maxClass] || "Unknown";

    // Store in format expected by detectionQueue: [x1, y1, x2, y2, label, confidence]
    boxes.push([x1, y1, x2, y2, label, maxScore]);

    const area = Math.max(0, x2 - x1) * Math.max(0, y2 - y1);
    if (label === "Fire") {
      fireCount++;
      totalFireArea += area;
    }
    if (label === "Smoke") {
      smokeCount++;
      totalFireArea += area;
    }
  }

  // Sort by confidence
  boxes.sort((a, b) => b[5] - a[5]);

  const detected = fireCount > 0 || smokeCount > 0;

  return {
    boxes,
    detected,
    fireCount,
    smokeCount,
    totalFireArea,
  };
}

// -------------------------------------------------------------------
// 🔥 Main Detection Function
// -------------------------------------------------------------------
export async function detectFire(cameraUrl, cameraName) {
  try {
    const jpegBuffer = await grabFrameOnce(cameraUrl);
    const inputTensor = await prepareInput(jpegBuffer, 640);
    const outputs = await runInference(inputTensor);

    // Log output shape for debugging
    const debugShapes = {};
    for (const key in outputs) {
      debugShapes[key] = outputs[key].dims;
    }
    log.info({ camera: cameraName, outputShapes: debugShapes }, "🔥 LOCAL: RT-DETR Inference Output");

    const result = processOutput(outputs, 640, 640);

    log.info({
      camera: cameraName,
      detected: result.detected,
      fireCount: result.fireCount,
      smokeCount: result.smokeCount,
      boxCount: result.boxes.length,
    }, "🔥 LOCAL: Detection complete");

    return {
      isFire: result.detected,
      confidence: result.boxes.length > 0 ? result.boxes[0][5] : 0,
      boxes: result.boxes,
      fireCount: result.fireCount,
      smokeCount: result.smokeCount,
      frameBuffer: jpegBuffer,
    };
  } catch (error) {
    log.error({
      camera: cameraName,
      error: error.message,
    }, "🔥 LOCAL: Detection failed");

    return {
      isFire: false,
      confidence: 0,
      boxes: [],
      error: error.message,
      frameBuffer: null,
    };
  }
}

// -------------------------------------------------------------------
// 🎥 Build Camera Input URL
// -------------------------------------------------------------------
export function buildCameraUrl(cam) {
  // ✅ PRIORITY 1: RTSP camera with IP address (YOUR REAL CAMERA)
  if (cam.ip && cam.ip.trim() !== '') {
    const protocol = "rtsp://";
    const auth = cam.username && cam.password
      ? `${encodeURIComponent(cam.username)}:${encodeURIComponent(cam.password)}@`
      : "";
    const addr = cam.port ? `${cam.ip}:${cam.port}` : cam.ip;
    const path = cam.streamPath || "/live";
    const url = `${protocol}${auth}${addr}${path}`;

    log.debug({ cameraId: cam.id, url: url.replace(/:([^:@]+)@/, ":****@") }, "Built RTSP URL for detection");
    return url;
  }

  // ✅ PRIORITY 2: HLS stream URL
  if (cam.hlsUrl && cam.hlsUrl.trim() !== '') {
    log.debug({ cameraId: cam.id, url: cam.hlsUrl }, "Using HLS URL for detection");
    return cam.hlsUrl;
  }

  // ❌ Don't use MediaMTX as source - that's the destination!
  const errorMsg = `Cannot build camera URL for ${cam.name}. ` +
    `Camera needs either: (1) ip+port for RTSP, or (2) hlsUrl for HLS. ` +
    `Current: ip=${cam.ip || 'null'}, hlsUrl=${cam.hlsUrl || 'null'}`;

  log.error({ cameraId: cam.id, name: cam.name }, errorMsg);
  throw new Error(errorMsg);
}