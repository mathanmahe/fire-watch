// frontend/src/utils/worker-client.js
import * as ort from "onnxruntime-web";

// Serve wasm from same-origin static path:
ort.env.wasm.wasmPaths = "/models/ort/";

// const sessionOptions = {
//   executionProviders: ["cpu"], // Prioritize GPU (WebGL), then WASM, then CPU
// };

// Optional perf flags (require COOP/COEP, which you already set)
ort.env.wasm.numThreads = 4;
ort.env.wasm.simd = true;
if (typeof SharedArrayBuffer !== "undefined") {
  ort.env.wasm.numThreads = 4; // Use multi-threading if supported
  console.log("Multithread supported");
} else {
  console.warn(
    "SharedArrayBuffer not supported. Falling back to single-threaded execution."
  );
}

if (ort.env.wasm.simd) {
  ort.env.wasm.simd = true; // Enable SIMD if supported
  console.log("SIMD supported in this browser.");
} else {
  console.warn("SIMD not supported in this browser.");
}

// Use valid web EPs: 'wasm' (safe everywhere) or 'webgpu' (if enabled) / 'webgl'
const sessionOptions = { executionProviders: ["wasm"] };

let sessionPromise;
function getSession() {
  if (!sessionPromise) {
    sessionPromise = ort.InferenceSession.create(
      "/yolov11n_bestFire.onnx", // served from models/ at web root
      sessionOptions
    ).then((s) => {
      // Helpful log to confirm model loaded
      console.log("[worker] ONNX session ready");
      return s;
    });
  }
  return sessionPromise;
}

self.onmessage = async (event) => {
  const { type, data, dims } = event.data || {};
  if (type !== "infer" || !data) return;

  try {
    const session = await getSession();
    const tensor = new ort.Tensor(
      new Float32Array(data),
      dims || [1, 3, 640, 640]
    );
    const outputs = await session.run({ images: tensor });
    // postMessage(outputs["output0"].data);
    // Be resilient to output name differences
    const first = outputs[Object.keys(outputs)[0]];
    self.postMessage(first.data);
  } catch (err) {
    console.error("[worker] inference error:", err);
  }
};
