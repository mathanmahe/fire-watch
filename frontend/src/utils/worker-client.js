importScripts("https://cdn.jsdelivr.net/npm/onnxruntime-web/dist/ort.min.js");

// Use CDN for WASM files instead of local server
ort.env.wasm.wasmPaths = "https://cdn.jsdelivr.net/npm/onnxruntime-web/dist/";

const sessionOptions = {
    executionProviders: ['cpu'], // Prioritize GPU (WebGL), then WASM, then CPU
};

if (typeof SharedArrayBuffer !== "undefined") {
    ort.env.wasm.numThreads = 4; // Use multi-threading if supported
    console.log("Multithread supported");
} else {
    console.warn("SharedArrayBuffer not supported. Falling back to single-threaded execution.");
}

if (ort.env.wasm.simd) {
    ort.env.wasm.simd = true; // Enable SIMD if supported
    console.log("SIMD supported in this browser.");
} else {
    console.warn("SIMD not supported in this browser.");
}

let sessionPromise;
function getSession() {
  if (!sessionPromise) {
    sessionPromise = ort.InferenceSession.create("http://127.0.0.1:8089/yolov11n_bestFire.onnx", sessionOptions);
  }
  return sessionPromise;
}

onmessage = async (event) => {
  const { type, data, dims } = event.data || {};
  if (type !== 'infer' || !data) return;

  try {
    const session = await getSession();
    const tensor = new ort.Tensor(new Float32Array(data), dims || [1,3,640,640]);
    const outputs = await session.run({ images: tensor });
    postMessage(outputs["output0"].data);
  } catch (err) {
    console.error("Error during inference:", err);
  }
};

