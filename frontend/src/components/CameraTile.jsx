import React, { useEffect, useRef, useState } from "react";
import Hls from "hls.js";
import { startCloudDetect, stopCloudDetect } from "../utils/cloudDetect.js";
import { playWebRTC } from "../utils/playWebRTC.js";
import { useCameras } from "../store/cameras.jsx";
import StreamingIcon from "./StreamingIcon.jsx";
import FireStatusButton from "./FireStatusButton.jsx";

// We'll lazy-load your ESM VideoDetector class from utils directory
let VideoDetectorClassPromise;
function loadVideoDetector() {
  if (!VideoDetectorClassPromise) {
    VideoDetectorClassPromise = import("../utils/videoDetector.js").then(m => m.VideoDetector || m.default);
  }
  return VideoDetectorClassPromise;
}

export default function CameraTile({ cam }) {
  const videoRef = useRef(null);
  const [status, setStatus] = useState("Idle");
  const [isFire, setIsFire] = useState(true); // can set this to true if you want to show the fire status button
  const [isStreaming, setIsStreaming] = useState(true);
  const [viewed, setViewed] = useState(true); // you can wire this to visibility/selection
  const { updateCameraStatus } = useCameras();

  // keep detector instance for local mode
  const detectorRef = useRef(null);
  // cloud interval/abort
  const abortRef = useRef(null);
  // PeerConnection for WebRTC (if used)
  const pcRef = useRef(null);

  // Update camera status in store whenever local state changes
  useEffect(() => {
    updateCameraStatus(cam.id, { isFire, isStreaming });
  }, [isFire, isStreaming, cam.id, updateCameraStatus]);

  useEffect(() => {
    const v = videoRef.current;
    let hls;
    let cancelled = false;

    async function attachStream() {
      if (cancelled) return;
      setStatus("Connecting…");
      try {
        if (cam.stream.type === "webrtc") {
          const { pc, stream } = await playWebRTC(cam.stream.gatewayBase, cam.stream.name);
          if (cancelled) return;
          pcRef.current = pc;
          v.srcObject = stream;
          await v.play().catch(()=>{});
        } else if (cam.stream.type === "hls") {
          if (Hls.isSupported()) {
            hls = new Hls({ liveDurationInfinity: true });
            hls.loadSource(cam.stream.url);
            hls.attachMedia(v);
            hls.on(Hls.Events.MANIFEST_PARSED, () => v.play().catch(()=>{}));
          } else if (v.canPlayType("application/vnd.apple.mpegurl")) {
            v.src = cam.stream.url;
            await v.play().catch(()=>{});
          } else {
            v.src = cam.stream.fallback || "";
            await v.play().catch(()=>{});
          }
        } else if (cam.stream.type === "mp4") {
          v.src = cam.stream.url;
          await v.play().catch(()=>{});
        }
        if (!cancelled) {
          setIsStreaming(true);
          setStatus("Streaming…");
        }
      } catch (err) {
        if (!cancelled) {
          setStatus(`Failed: ${err?.message || err}`);
        }
      }
    }

    // detection wiring
    async function startDetection() {
      if (cancelled) return;
      if (cam.detection === "local") {
        const VideoDetector = await loadVideoDetector();
        if (cancelled) return;
        const d = new VideoDetector({
          source: cam.stream.type === "hls" || cam.stream.type === "mp4" ? cam.stream.url : undefined,
          id: cam.name,
          mount: v.parentElement,           // mount UI in tile
          workerUrl: "../utils/worker-client.js",   // your worker
          throttleMs: 80,
          onDetections: (boxes) => {
            if (cancelled) return;
            const any = boxes && boxes.length > 0;
            setIsFire(any);
            // Don't update status for fire detection - keep it separate
          }
        });
        detectorRef.current = d;
        if (cam.stream.type === "webrtc") {
          // VideoDetector supports attachWebRTC(stream) as in your code
          // we wait until WebRTC stream is attached
          const s = v.srcObject;
          if (s) await d.attachWebRTC(s);
        } else {
          await d.start();
        }
      } else if (cam.detection === "cloud") {
        abortRef.current = startCloudDetect({
          video: v,
          endpoint: cam.awsEndpoint,
          intervalMs: cam.cloudFps ? 1000 / cam.cloudFps : 500, // ~2 fps default
          onResult: (r) => {
            if (cancelled) return;
            const any = !!(r?.isFire || (r?.detections?.length > 0));
            setIsFire(any);
            // Don't update status for fire detection - keep it separate
          },
          onError: (e) => {
            if (!cancelled) setStatus(`Cloud error: ${e?.message || e}`);
          }
        });
      }
    }

    attachStream().then(startDetection);

    return () => {
      cancelled = true;
      if (hls) { try { hls.destroy(); } catch{} }
      if (pcRef.current) { try { pcRef.current.close(); } catch{} }
      if (detectorRef.current) { try { detectorRef.current.destroy(); } catch{} }
      if (abortRef.current) stopCloudDetect(abortRef.current);
      // Don't call setIsStreaming(false) in cleanup - it causes additional renders
    };
  }, [cam]);

  return (
    <div className="tile">
      <div className="tile-header">
        <div className="tile-title">
          <span className="name">{cam.name}</span>
          <span className="location">{cam.location}</span>
        </div>
        <div className="tile-status-icons">
          <FireStatusButton isFire={isFire} />
          <StreamingIcon isStreaming={isStreaming} size={12} />
        </div>
      </div>
      <div className="video-wrap" onMouseEnter={()=>setViewed(true)}>
        <video ref={videoRef} muted playsInline />
        {status !== "Streaming…" && status !== "Idle" && (
          <div className="status-overlay">
            <span className="status-message">{status}</span>
          </div>
        )}
      </div>
    </div>
  );
}
