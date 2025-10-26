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
    const modelPath = path.resolve(__dirname, "../../models/yolov11n_bestFire.onnx");
    log.info({ modelPath }, "Loading ONNX model...");
    
    sessionPromise = ort.InferenceSession.create(modelPath, {
      executionProviders: ["cpu"],
    }).then((session) => {
      log.info("✅ ONNX session ready");
      return session;
    }).catch((err) => {
      log.error({ error: err.message }, "❌ Failed to load ONNX model");
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
      .resize(modelInputSize, modelInputSize, { fit: "fill" })
      .raw()
      .toBuffer({ resolveWithObject: true });

    const N = modelInputSize * modelInputSize;
    const arr = new Float32Array(N * 3);

    let r = 0, g = N, b = 2 * N;
    for (let i = 0; i < data.length; i += 3) {
      arr[r++] = data[i] / 255;
      arr[g++] = data[i + 1] / 255;
      arr[b++] = data[i + 2] / 255;
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
    
    const tensor = new ort.Tensor(
      "float32",
      inputTensor,
      [1, 3, 640, 640]
    );

    const outputs = await session.run({ images: tensor });
    const outputData = outputs[Object.keys(outputs)[0]].data;
    
    return outputData;
  } catch (e) {
    log.error({ error: e.message }, "Inference failed");
    throw e;
  }
}

// -------------------------------------------------------------------
// 📊 Process ONNX Output
// -------------------------------------------------------------------
function processOutput(output, imgW = 640, imgH = 640) {
  let boxes = [];
  let fireCount = 0;
  let smokeCount = 0;
  let totalFireArea = 0;

  const cells = 8400;
  const clsCount = 3;
  const probThreshold = 0.2;

  for (let i = 0; i < cells; i++) {
    let classId = 0, best = 0;
    for (let c = 0; c < clsCount; c++) {
      const p = output[cells * (c + 4) + i];
      if (p > best) {
        best = p;
        classId = c;
      }
    }
    if (best < probThreshold) continue;

    const xc = output[i];
    const yc = output[cells + i];
    const w = output[2 * cells + i];
    const h = output[3 * cells + i];

    const x1 = ((xc - w / 2) / 640) * imgW;
    const y1 = ((yc - h / 2) / 640) * imgH;
    const x2 = ((xc + w / 2) / 640) * imgW;
    const y2 = ((yc + h / 2) / 640) * imgH;

    const label = ["Fire", "Smoke", "Other"][classId];
    boxes.push([x1, y1, x2, y2, label, best]);

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

  // NMS
  boxes.sort((a, b) => b[5] - a[5]);
  const keep = [];
  
  const iou = (A, B) => {
    const x1 = Math.max(A[0], B[0]);
    const y1 = Math.max(A[1], B[1]);
    const x2 = Math.min(A[2], B[2]);
    const y2 = Math.min(A[3], B[3]);
    const inter = Math.max(0, x2 - x1) * Math.max(0, y2 - y1);
    
    const areaA = Math.max(0, A[2] - A[0]) * Math.max(0, A[3] - A[1]);
    const areaB = Math.max(0, B[2] - B[0]) * Math.max(0, B[3] - B[1]);
    const uni = areaA + areaB - inter;
    return uni <= 0 ? 0 : inter / uni;
  };

  while (boxes.length) {
    const head = boxes.shift();
    keep.push(head);
    boxes = boxes.filter((b) => iou(head, b) < 0.7);
  }

  const detected = fireCount > 0 || smokeCount > 0;
  
  return {
    boxes: keep,
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
    const outputData = await runInference(inputTensor);
    const result = processOutput(outputData, 640, 640);
    
    log.info({ 
      camera: cameraName, 
      detected: result.detected,
      fireCount: result.fireCount,
      smokeCount: result.smokeCount 
    }, "Detection complete");
    
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
      error: error.message 
    }, "Detection failed");
    
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
// 🎥 Build Camera Input URL (CRITICAL FIX)
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