import * as ort from "onnxruntime-node";
import sharp from "sharp";
import { spawn } from "node:child_process";
import { cfg } from "../config.js";
import pino from "pino";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const log = pino({ name: "local-weapon-detector" });

// -------------------------------------------------------------------
// 🎯 ONNX Session Management (Singleton)
// -------------------------------------------------------------------
let sessionPromise = null;

function getSession() {
    if (!sessionPromise) {
        const modelPath = path.resolve(__dirname, "../../models/weapons.onnx");
        log.info({ modelPath }, "Loading Weapons ONNX model...");

        sessionPromise = ort.InferenceSession.create(modelPath, {
            executionProviders: ["cpu"],
        }).then((session) => {
            log.info("✅ Weapons ONNX session ready");
            log.info({ inputNames: session.inputNames, outputNames: session.outputNames }, "Model Metadata");
            return session;
        }).catch((err) => {
            log.error({ error: err.message }, "❌ Failed to load Weapons ONNX model");
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
                // Standard args, no aggressive timeouts to avoid premature failure
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
    const numClasses = 2; // Knife, Pistol
    const probThreshold = 0.65; // Increased to reduce false positives

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
        label: ["Knife", "Pistol"][s.class] || "Unknown"
    }));
    log.info({ top5 }, "🔫 WEAPON: Top 5 Raw Scores");

    for (let i = 0; i < numQueries; i++) {
        const { maxScore, maxClass } = getScore(i);

        if (maxScore < probThreshold) continue;

        const [cx, cy, w, h] = getBox(i);

        // Convert cx, cy, w, h (normalized 0-1) to x1, y1, x2, y2 (pixel coords)
        const x1 = (cx - w / 2) * imgW;
        const y1 = (cy - h / 2) * imgH;
        const x2 = (cx + w / 2) * imgW;
        const y2 = (cy + h / 2) * imgH;

        // Model trained on Knife (0) and Pistol (1)
        const label = ["Knife", "Pistol"][maxClass] || "Weapon";

        // Store in format expected by detectionQueue: [x1, y1, x2, y2, label, confidence]
        boxes.push([x1, y1, x2, y2, label, maxScore]);
    }

    // Sort by confidence
    boxes.sort((a, b) => b[5] - a[5]);

    const detected = boxes.length > 0;

    return {
        boxes,
        detected,
    };
}

// -------------------------------------------------------------------
// 🔫 Main Weapon Detection Function
// -------------------------------------------------------------------
export async function detectWeapon(cameraUrl, cameraName) {
    try {
        const jpegBuffer = await grabFrameOnce(cameraUrl);
        const inputTensor = await prepareInput(jpegBuffer, 640);
        const outputs = await runInference(inputTensor);

        // Log output shape for debugging
        const debugShapes = {};
        for (const key in outputs) {
            debugShapes[key] = outputs[key].dims;
        }
        log.info({ camera: cameraName, outputShapes: debugShapes }, "🔫 WEAPON: RT-DETR Inference Output");

        const result = processOutput(outputs, 640, 640);

        log.info({
            camera: cameraName,
            detected: result.detected,
            boxCount: result.boxes.length,
        }, "🔫 WEAPON: Detection complete");

        return {
            isWeapon: result.detected,
            confidence: result.boxes.length > 0 ? result.boxes[0][5] : 0,
            boxes: result.boxes,
            frameBuffer: jpegBuffer,
        };
    } catch (error) {
        log.error({
            camera: cameraName,
            error: error.message,
        }, "🔫 WEAPON: Detection failed");

        return {
            isWeapon: false,
            confidence: 0,
            boxes: [],
            error: error.message,
            frameBuffer: null,
        };
    }
}
