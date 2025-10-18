// frontend/src/utils/worker-client.js
import * as ort from "onnxruntime-web";
import modelUrl from "../../models/yolov11n_bestFire.onnx?url"; // <-- data: URL after build

// Compute paths relative to the built worker file location.
// In build: worker lives in dist/assets/** so dist root is ../../
// const ASSETS_DIR = new URL("./", import.meta.url); // file:///.../dist/assets/
// const DIST_ROOT = new URL("../../", import.meta.url);

// const modelPath = new URL("yolov11n_bestFire.onnx", DIST_ROOT).href;
// ort.env.wasm.wasmPaths = new URL("ort/", DIST_ROOT).href; // points to dist/ort/
// ort.env.wasm.wasmPaths = ASSETS_DIR.href;

const wasmDir = new URL("./ort/", import.meta.url).href;
ort.env.wasm.wasmPaths = wasmDir;

ort.env.wasm.simd = true;
ort.env.wasm.numThreads = 1;

const sessionOptions = { executionProviders: ["wasm"] };

// In packaged Electron (file://) you usually won't have cross-origin isolation,
// so SharedArrayBuffer may be unavailable. Keep it adaptive.
// ort.env.wasm.simd = true; // harmless if unsupported
// if (typeof SharedArrayBuffer !== "undefined") {
//   ort.env.wasm.numThreads = 4;
//   console.log("[worker] Multithread enabled");
// } else {
//   console.warn(
//     "[worker] SharedArrayBuffer not available; running single-thread"
//   );
// }

let sessionPromise;
function getSession() {
  if (!sessionPromise) {
    sessionPromise = ort.InferenceSession.create(modelUrl, sessionOptions).then(
      (s) => {
        console.log("[worker] ONNX session ready");
        return s;
      }
    );
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
