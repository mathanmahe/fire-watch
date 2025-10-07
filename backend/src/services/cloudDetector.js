import { cfg } from "../config.js";
import { spawn } from "node:child_process";
import fetch from "node-fetch";
import pino from "pino";

const log = pino({ name: "cloud-detector" });
const workers = new Map();

function inputUrlFromCamera(cam) {
  if (cam.streamType === "HLS" && cam.hlsUrl) {
    return cam.hlsUrl;
  }
  
  if (cam.streamType === "RTSP" && cam.ip) {
    const protocol = "rtsp://";
    // URL encode credentials to handle special characters like @
    const auth = (cam.username && cam.password) 
      ? `${encodeURIComponent(cam.username)}:${encodeURIComponent(cam.password)}@` 
      : "";
    const address = cam.ip;
    const path = cam.streamName || "/h264Preview_01_main";
    
    const url = `${protocol}${auth}${address}${path}`;
    log.info({ camera: cam.camera, url: url.replace(/:([^:@]+)@/, ':****@') }, "Built RTSP URL");
    return url;
  }
  
  const base = cam.webrtcBase?.replace(/:\d+$/, ":8888") || "http://127.0.0.1:8888";
  const name = cam.streamName || cam.camera;
  return `${base}/${encodeURIComponent(name)}/index.m3u8`;
}

function grabFrameOnce(srcUrl) {
  return new Promise((resolve, reject) => {
    const isRtsp = srcUrl.startsWith('rtsp://');
    const args = ["-y"];
    
    if (isRtsp) {
      args.push(
        "-rtsp_transport", "tcp",
        "-timeout", "5000000",
        "-analyzeduration", "1000000",
        "-probesize", "1000000"
      );
    }
    
    args.push(
      "-i", srcUrl,
      "-frames:v", "1",
      "-q:v", "2",
      "-f", "image2",
      "-"
    );
    
    const ff = spawn(cfg.ffmpeg, args, { stdio: ["ignore", "pipe", "pipe"] });
    const chunks = [];
    let err = "";
    
    ff.stdout.on("data", d => chunks.push(d));
    ff.stderr.on("data", d => err += d.toString());
    ff.on("error", reject);
    ff.on("close", (code) => {
      if (code === 0 && chunks.length) resolve(Buffer.concat(chunks));
      else reject(new Error(`ffmpeg exit ${code}: ${err.split("\n").slice(-3).join(" ")}`));
    });
  });
}

async function postToFireEndpoint(cameraName, jpeg) {
  const r = await fetch(cfg.fireEndpoint, {
    method: "POST",
    headers: { "Content-Type": "image/jpeg", "camera-id": cameraName },
    body: jpeg
  });
  if (!r.ok) throw new Error(`${r.status} ${await r.text().catch(()=>r.statusText)}`);
  return r.json().catch(()=> ({}));
}

export function startCloudDetector(cam, { fps = 0.2 } = {}) {
  if (workers.has(cam.id)) {
    log.warn({ cam: cam.camera }, "Detector already running");
    return;
  }
  
  const ms = Math.max(1000, Math.floor(1000 / fps));
  const src = inputUrlFromCamera(cam);
  log.info({ cam: cam.camera, userId: cam.userId, src: src.replace(/:([^:@]+)@/, ':****@') }, "Starting cloud detector");

  let alive = true;
  (async function loop() {
    while (alive) {
      try {
        const jpeg = await grabFrameOnce(src);
        const res = await postToFireEndpoint(cam.camera, jpeg);
        const fire = !!(res?.fire_detected || res?.isFire || (res?.detections?.length > 0));
        
        if (fire) {
          log.warn({ cam: cam.camera, userId: cam.userId }, "FIRE DETECTED - Lambda will trigger SNS");
        } else {
          log.info({ cam: cam.camera, fire }, "No fire detected");
        }
      } catch (e) {
        log.warn({ cam: cam.camera, err: String(e) }, "Cloud detection failed");
      }
      await new Promise(r => setTimeout(r, ms));
    }
  })();

  workers.set(cam.id, () => { alive = false; });
}

export function stopCloudDetector(camId) {
  const stop = workers.get(camId);
  if (stop) {
    stop();
    workers.delete(camId);
    log.info({ camId }, "Stopped cloud detector");
  }
}

export function getRunningDetectors() {
  return workers;
}