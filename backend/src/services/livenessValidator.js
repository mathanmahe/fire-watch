import * as ort from "onnxruntime-node";
import sharp from "sharp";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";


const __dirname = path.dirname(fileURLToPath(import.meta.url));

function log(msg, data) {
    if (data) console.log(msg, JSON.stringify(data));
    else console.log(msg);
}

class LivenessValidator {
    constructor() {
        // Path to the model you uploaded
        this.modelPath = path.resolve(__dirname, "../../models/depth_anything_v2_small.onnx");
        this.session = null;
        // Normalization constants for Depth Anything V2
        this.mean = [0.485, 0.456, 0.406];
        this.std = [0.229, 0.224, 0.225];
    }

    async init() {
        if (!this.session) {
            if (!fs.existsSync(this.modelPath)) {
                console.error(`[LivenessValidator] Model not found at: ${this.modelPath}`);
                return;
            }
            try {
                this.session = await ort.InferenceSession.create(this.modelPath);
                console.log('[LivenessValidator] Depth model loaded successfully.');
            } catch (err) {
                console.error('[LivenessValidator] Failed to load depth model:', err);
            }
        }
    }

    // Preprocess image for ONNX (Resize 518x518 -> Normalize -> HWC to CHW)
    async preprocess(imageBuffer) {
        const { data, info } = await sharp(imageBuffer)
            .resize(518, 518, { fit: 'fill' })
            .removeAlpha()
            .raw()
            .toBuffer({ resolveWithObject: true });

        const float32Data = new Float32Array(3 * 518 * 518);

        for (let i = 0; i < 518 * 518; i++) {
            for (let c = 0; c < 3; c++) {
                let val = data[i * 3 + c] / 255.0;
                val = (val - this.mean[c]) / this.std[c];
                float32Data[c * 518 * 518 + i] = val;
            }
        }
        return new ort.Tensor('float32', float32Data, [1, 3, 518, 518]);
    }

    async isWeapon3D(imageBuffer, bbox) {
        // Returns TRUE if Real (3D), FALSE if Fake (2D)
        if (!this.session) await this.init();
        if (!this.session) return true; // Fail safe: assume real if model broken

        try {
            // 1. Run Inference
            const inputTensor = await this.preprocess(imageBuffer);
            const feeds = {};
            feeds[this.session.inputNames[0]] = inputTensor;
            const results = await this.session.run(feeds);
            const output = results[this.session.outputNames[0]].data;

            // 2. Map bbox (relative to original img) to 518x518 map
            const metadata = await sharp(imageBuffer).metadata();
            const scaleX = 518 / metadata.width;
            const scaleY = 518 / metadata.height;

            // bbox is [x1, y1, x2, y2] based on detectionQueue usage
            // Convert to x, y, w, h for calculation if needed, but here we just need bounds
            const x1 = bbox[0];
            const y1 = bbox[1];
            const x2 = bbox[2];
            const y2 = bbox[3];

            const bx = Math.floor(x1 * scaleX);
            const by = Math.floor(y1 * scaleY);
            const bw = Math.floor((x2 - x1) * scaleX);
            const bh = Math.floor((y2 - y1) * scaleY);

            // 3. Analyze Variance inside the box
            const values = [];
            for (let y = by; y < by + bh; y++) {
                for (let x = bx; x < bx + bw; x++) {
                    if (y >= 0 && y < 518 && x >= 0 && x < 518) {
                        values.push(output[y * 518 + x]);
                    }
                }
            }

            if (values.length === 0) return false;

            // Calculate Standard Deviation
            const mean = values.reduce((a, b) => a + b, 0) / values.length;
            const variance = values.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / values.length;
            const stdDev = Math.sqrt(variance);

            // Min/Max for debugging
            const min = Math.min(...values);
            const max = Math.max(...values);

            log('[Liveness] Weapon Depth Stats:', { stdDev: stdDev.toFixed(5), min: min.toFixed(5), max: max.toFixed(5), range: (max - min).toFixed(5) });

            // Threshold: Lowered significantly to catch thin objects like knives
            // Previously was stdDev / 15.0 > 0.4 (effective stdDev > 6.0)
            // Now checking raw stdDev. Knives might be around 0.05 - 0.2
            return stdDev > 0.001;
        } catch (err) {
            console.error("[Liveness] Error processing weapon depth:", err);
            return true; // Fail safe
        }
    }

    async isFireMoving(framesBuffer, bbox) {
        // Expects array of 3 image buffers (JPEGs)
        if (framesBuffer.length < 3) return false; // Need more frames to decide

        try {
            // bbox is [x1, y1, x2, y2]
            const x1 = Math.max(0, Math.floor(bbox[0]));
            const y1 = Math.max(0, Math.floor(bbox[1]));
            const width = Math.floor(bbox[2] - bbox[0]);
            const height = Math.floor(bbox[3] - bbox[1]);

            if (width <= 0 || height <= 0) return false;

            // Crop the fire region from all 3 frames
            const crops = await Promise.all(framesBuffer.map(async (buf) => {
                return sharp(buf)
                    .extract({
                        left: x1,
                        top: y1,
                        width: width,
                        height: height
                    })
                    .greyscale()
                    .resize(100, 100, { fit: 'fill' }) // Normalize size for speed
                    .raw()
                    .toBuffer();
            }));

            // Compare pixels
            let movingPixels = 0;
            const totalPixels = crops[0].length;
            const diffThreshold = 15; // Lowered from 20 to catch subtle smoke/fire

            for (let i = 0; i < totalPixels; i++) {
                const d1 = Math.abs(crops[0][i] - crops[1][i]);
                const d2 = Math.abs(crops[1][i] - crops[2][i]);

                // If it changed in both steps, it's flickering
                if (d1 > diffThreshold && d2 > diffThreshold) {
                    movingPixels++;
                }
            }

            const ratio = movingPixels / totalPixels;
            console.log(`[Liveness] Fire Motion Ratio: ${ratio.toFixed(5)}`);

            // Threshold: Lowered from 0.02 (2%) to 0.005 (0.5%) to catch small distant fires
            return ratio > 0.005;
        } catch (err) {
            console.error("[Liveness] Error processing fire motion:", err);
            return false;
        }
    }
}

export default new LivenessValidator();
