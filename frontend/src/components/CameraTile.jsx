// import React, { useEffect, useRef, useState } from "react";
// import Hls from "hls.js";
// import { FaSpinner, FaExclamationCircle } from "react-icons/fa";
// import { startCloudDetect, stopCloudDetect } from "../utils/cloudDetect.js";
// import { playWebRTC } from "../utils/playWebRTC.js";
// import { useCameras } from "../store/cameras.jsx";
// import StreamingIcon from "./StreamingIcon.jsx";
// import FireStatusButton from "./FireStatusButton.jsx";

// // We'll lazy-load your ESM VideoDetector class from utils directory
// let VideoDetectorClassPromise;
// function loadVideoDetector() {
//   if (!VideoDetectorClassPromise) {
//     VideoDetectorClassPromise = import("../utils/videoDetector.js").then(
//       (m) => m.VideoDetector || m.default
//     );
//   }
//   return VideoDetectorClassPromise;
// }

// export default function CameraTile({ cam }) {
//   const videoRef = useRef(null);
//   const [status, setStatus] = useState("Idle");
//   const [isFire, setIsFire] = useState(false); // can set this to true if you want to show the fire status button
//   const [isStreaming, setIsStreaming] = useState(false);
//   const [viewed, setViewed] = useState(true); // you can wire this to visibility/selection
//   const [showSpinner, setShowSpinner] = useState(false);
//   const { updateCameraStatus } = useCameras();

//   // keep detector instance for local mode
//   const detectorRef = useRef(null);
//   // cloud interval/abort
//   const abortRef = useRef(null);
//   // PeerConnection for WebRTC (if used)
//   const pcRef = useRef(null);
//   // ResizeObserver for canvas sync
//   const resizeObserverRef = useRef(null);
//   // Timeout for spinner delay
//   const spinnerTimeoutRef = useRef(null);

//   // Update camera status in store whenever local state changes
//   useEffect(() => {
//     updateCameraStatus(cam.id, { isFire, isStreaming });
//   }, [isFire, isStreaming, cam.id, updateCameraStatus]);

//   useEffect(() => {
//     const v = videoRef.current;
//     let hls;
//     let cancelled = false;
//     let connectionAttempted = false;

//     async function attachStream() {
//       if (cancelled || connectionAttempted) return;
//       connectionAttempted = true;

//       const updateStatus = (msg) => {
//         console.log(`[${cam.name}] ${msg}`);

//         // Clear any existing spinner timeout
//         if (spinnerTimeoutRef.current) {
//           clearTimeout(spinnerTimeoutRef.current);
//           spinnerTimeoutRef.current = null;
//         }

//         if (msg === "Connecting…") {
//           setShowSpinner(true);
//           setStatus(msg);
//         } else if (
//           msg.startsWith("Failed") ||
//           msg.includes("error") ||
//           msg.includes("Error")
//         ) {
//           // Always wait 2 seconds before showing error, regardless of current spinner state
//           spinnerTimeoutRef.current = setTimeout(() => {
//             setShowSpinner(false);
//             setStatus(msg);
//           }, 2000);
//         } else {
//           // For other statuses (like "Streaming…"), hide spinner immediately
//           setShowSpinner(false);
//           setStatus(msg);
//         }
//       };

//       updateStatus("Connecting…");
//       try {
//         if (cam.stream.type === "webrtc") {
//           const { pc, stream } = await playWebRTC(
//             cam.stream.gatewayBase,
//             cam.stream.name
//           );
//           if (cancelled) {
//             console.log(
//               `[${cam.name}] Connection cancelled, closing PeerConnection`
//             );
//             pc.close();
//             return;
//           }
//           pcRef.current = pc;

//           // Monitor video element for errors
//           v.onerror = (e) => {
//             console.error(`[${cam.name}] Video element error:`, e);
//             if (!cancelled) updateStatus("Video Error");
//           };

//           // Set srcObject
//           v.srcObject = stream;
//           console.log(
//             `[${cam.name}] Stream assigned, tracks:`,
//             stream
//               .getTracks()
//               .map(
//                 (t) =>
//                   `${t.kind}:${t.readyState}:${t.muted ? "muted" : "unmuted"}`
//               )
//           );

//           // Monitor track state changes
//           stream.getTracks().forEach((track) => {
//             track.addEventListener("mute", () =>
//               console.log(`[${cam.name}] Track ${track.kind} muted!`)
//             );
//             track.addEventListener("unmute", () =>
//               console.log(`[${cam.name}] Track ${track.kind} unmuted`)
//             );
//             track.addEventListener("ended", () =>
//               console.log(`[${cam.name}] Track ${track.kind} ended!`)
//             );
//           });

//           // Wait for video to be ready with a proper event listener approach
//           const waitForVideo = new Promise((resolve) => {
//             let resolved = false;

//             const checkAndResolve = (event) => {
//               if (resolved) return;
//               console.log(
//                 `[${cam.name}] Video event: ${event.type}, readyState: ${v.readyState}`
//               );

//               if (v.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) {
//                 resolved = true;
//                 cleanup();
//                 resolve(true);
//               }
//             };

//             const cleanup = () => {
//               v.removeEventListener("loadstart", checkAndResolve);
//               v.removeEventListener("loadedmetadata", checkAndResolve);
//               v.removeEventListener("loadeddata", checkAndResolve);
//               v.removeEventListener("canplay", checkAndResolve);
//               v.removeEventListener("canplaythrough", checkAndResolve);
//             };

//             // Listen to all relevant events
//             v.addEventListener("loadstart", checkAndResolve);
//             v.addEventListener("loadedmetadata", checkAndResolve);
//             v.addEventListener("loadeddata", checkAndResolve);
//             v.addEventListener("canplay", checkAndResolve);
//             v.addEventListener("canplaythrough", checkAndResolve);

//             // Timeout after 5 seconds
//             setTimeout(() => {
//               if (!resolved) {
//                 console.warn(
//                   `[${cam.name}] Video ready timeout, readyState: ${v.readyState}`
//                 );
//                 resolved = true;
//                 cleanup();
//                 resolve(false);
//               }
//             }, 5000);

//             // Check immediately in case already ready
//             if (v.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) {
//               resolved = true;
//               cleanup();
//               resolve(true);
//             }
//           });

//           const videoReady = await waitForVideo;

//           // Try to play
//           try {
//             await v.play();
//             console.log(
//               `[${cam.name}] Video playing, readyState: ${v.readyState}`
//             );
//             if (!cancelled) {
//               setIsStreaming(true);
//               updateStatus("Streaming…");
//             }
//           } catch (e) {
//             console.error(
//               `[${cam.name}] Play failed:`,
//               e.message,
//               "readyState:",
//               v.readyState
//             );
//             if (!cancelled) {
//               updateStatus(`Play error: ${e.message}`);
//             }
//           }
//         } else if (cam.stream.type === "hls") {
//           if (Hls.isSupported()) {
//             hls = new Hls({ liveDurationInfinity: true });
//             hls.loadSource(cam.stream.url);
//             hls.attachMedia(v);
//             hls.on(Hls.Events.MANIFEST_PARSED, () => v.play().catch(() => {}));
//           } else if (v.canPlayType("application/vnd.apple.mpegurl")) {
//             v.src = cam.stream.url;
//             await v.play().catch(() => {});
//           } else {
//             v.src = cam.stream.fallback || "";
//             await v.play().catch(() => {});
//           }
//         } else if (cam.stream.type === "mp4") {
//           v.src = cam.stream.url;
//           await v.play().catch(() => {});
//         }
//         if (!cancelled) {
//           setIsStreaming(true);
//           updateStatus("Streaming…");
//         }
//       } catch (err) {
//         if (!cancelled) {
//           updateStatus(`Failed: ${err?.message || err}`);
//         }
//       }
//     }

//     // detection wiring
//     async function startDetection() {
//       if (cancelled) return;
//       if (cam.detection === "local") {
//         console.log(`[${cam.name}] Starting local detection...`);
//         const VideoDetector = await loadVideoDetector();
//         if (cancelled) return;

//         // Don't let VideoDetector create its own video - use existing one
//         const d = new VideoDetector({
//           id: cam.name,
//           mount: null, // Don't mount - we'll attach to existing video
//           workerUrl: "../utils/worker-client.js",
//           throttleMs: 80,
//           onDetections: (boxes) => {
//             if (cancelled) return;
//             const any = boxes && boxes.length > 0;
//             setIsFire(any);
//           },
//         });

//         // Manually set the internal video reference to our existing element
//         d._video = v;
//         d._root = v.parentElement;

//         // Create overlay canvas for bounding boxes
//         if (!d._overlay) {
//           const canvas = document.createElement("canvas");
//           canvas.style.position = "absolute";
//           canvas.style.top = "0";
//           canvas.style.left = "0";
//           canvas.style.pointerEvents = "none";
//           v.parentElement.appendChild(canvas);
//           d._overlay = canvas;
//           d._ctx = canvas.getContext("2d");

//           // Sync canvas size with video element's rendered size
//           const syncCanvasSize = () => {
//             if (v.videoWidth && v.videoHeight) {
//               // Set canvas internal resolution to video's natural size
//               canvas.width = v.videoWidth;
//               canvas.height = v.videoHeight;

//               // Set canvas display size to match video element's rendered size
//               const rect = v.getBoundingClientRect();
//               canvas.style.width = `${rect.width}px`;
//               canvas.style.height = `${rect.height}px`;

//               // Position canvas to overlay video exactly
//               const videoRect = v.getBoundingClientRect();
//               const parentRect = v.parentElement.getBoundingClientRect();
//               canvas.style.left = `${videoRect.left - parentRect.left}px`;
//               canvas.style.top = `${videoRect.top - parentRect.top}px`;

//               console.log(
//                 `[${cam.name}] Canvas synced: ${canvas.width}x${canvas.height} display: ${rect.width}x${rect.height}`
//               );
//             }
//           };
//           v.addEventListener("loadedmetadata", syncCanvasSize);
//           v.addEventListener("resize", syncCanvasSize);
//           v.addEventListener("play", syncCanvasSize);

//           // Use ResizeObserver to sync canvas when video element resizes (e.g., view changes)
//           resizeObserverRef.current = new ResizeObserver(() => {
//             syncCanvasSize();
//           });
//           resizeObserverRef.current.observe(v);
//         }

//         detectorRef.current = d;

//         // Start the detector (spawn worker and bind video loop)
//         // DON'T call attachWebRTC or start() since we're manually managing video/canvas
//         if (!d._worker) {
//           // Spawn worker
//           const url = new URL("../utils/worker-client.js", import.meta.url);
//           d._worker = new Worker(url, { type: "module", name: cam.name });

//           d._worker.onmessage = (evt) => {
//             const output = evt.data;
//             d._boxes = d._processOutput(
//               output,
//               d._overlay.width,
//               d._overlay.height
//             );
//             d.onDetections(d._boxes);
//             d._busy = false;
//           };

//           d._worker.onerror = (e) => {
//             console.error(`[${cam.name}] Worker error:`, e);
//             d._worker = null;
//           };

//           console.log(`[${cam.name}] Worker created`);
//         }

//         // Bind video loop
//         if (!d._rafHandle) {
//           const tick = (t) => {
//             d._rafHandle = requestAnimationFrame(tick);
//             if (t - d._lastTick < d.throttleMs) return;
//             d._lastTick = t;

//             if (!d._video || !d._overlay) return;
//             if (d._video.videoWidth === 0 || d._video.videoHeight === 0) return;

//             // Clear canvas and draw only boxes (NOT the video)
//             d._ctx.clearRect(0, 0, d._overlay.width, d._overlay.height);
//             d._drawBoxes(d._boxes);

//             if (d._busy) return;

//             // Prepare input from video element (not canvas)
//             const buffer = d._prepareInput(d._video);
//             if (!buffer) return;

//             if (d._worker) {
//               d._worker.postMessage(
//                 {
//                   type: "infer",
//                   data: buffer,
//                   dims: [1, 3, d.modelInputSize, d.modelInputSize],
//                 },
//                 [buffer]
//               );
//             }
//             d._busy = true;
//           };

//           // Start loop when video plays
//           const startLoop = () => {
//             if (!d._rafHandle) {
//               d._rafHandle = requestAnimationFrame(tick);
//               console.log(`[${cam.name}] Detection loop started`);
//             }
//           };

//           v.addEventListener("play", startLoop, { once: true });

//           // Also start now if already playing
//           if (!v.paused && v.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) {
//             startLoop();
//           }
//         }
//       } else if (cam.detection === "cloud") {
//         abortRef.current = startCloudDetect({
//           video: v,
//           endpoint: cam.awsEndpoint,
//           intervalMs: cam.cloudFps ? 1000 / cam.cloudFps : 500, // ~2 fps default
//           onResult: (r) => {
//             if (cancelled) return;
//             const any = !!(r?.isFire || r?.detections?.length > 0);
//             setIsFire(any);
//             // Don't update status for fire detection - keep it separate
//           },
//           onError: (e) => {
//             if (!cancelled) updateStatus(`Cloud error: ${e?.message || e}`);
//           },
//         });
//       }
//     }

//     attachStream().then(startDetection);

//     return () => {
//       console.log(`[${cam.name}] Cleaning up...`);
//       cancelled = true;

//       // Clear spinner timeout
//       if (spinnerTimeoutRef.current) {
//         clearTimeout(spinnerTimeoutRef.current);
//         spinnerTimeoutRef.current = null;
//       }

//       if (hls) {
//         try {
//           hls.destroy();
//         } catch (e) {
//           console.warn(`[${cam.name}] HLS cleanup error:`, e);
//         }
//       }

//       if (pcRef.current) {
//         try {
//           console.log(`[${cam.name}] Closing PeerConnection`);
//           pcRef.current.close();
//           pcRef.current = null;
//         } catch (e) {
//           console.warn(`[${cam.name}] PC cleanup error:`, e);
//         }
//       }

//       if (detectorRef.current) {
//         try {
//           // Remove overlay canvas if it exists
//           if (
//             detectorRef.current._overlay &&
//             detectorRef.current._overlay.parentElement
//           ) {
//             detectorRef.current._overlay.parentElement.removeChild(
//               detectorRef.current._overlay
//             );
//           }
//           detectorRef.current.stop();
//           detectorRef.current = null;
//         } catch (e) {
//           console.warn(`[${cam.name}] Detector cleanup error:`, e);
//         }
//       }

//       if (abortRef.current) {
//         stopCloudDetect(abortRef.current);
//         abortRef.current = null;
//       }

//       // Clean up ResizeObserver
//       if (resizeObserverRef.current) {
//         resizeObserverRef.current.disconnect();
//         resizeObserverRef.current = null;
//       }

//       // Clean up video element
//       if (v) {
//         v.srcObject = null;
//         v.onerror = null;
//       }
//     };
//   }, [
//     cam.id,
//     cam.stream.type,
//     cam.stream.gatewayBase,
//     cam.stream.name,
//     cam.detection,
//   ]);

//   return (
//     <div className="tile">
//       <div className="tile-header">
//         <div className="tile-title">
//           <StreamingIcon isStreaming={isStreaming} size={22} />
//           <span className="name">{cam.name}</span>
//           <span className="location">{cam.location}</span>
//         </div>
//         <div className="tile-status-icons">
//           <FireStatusButton isFire={isFire} />
//         </div>
//       </div>
//       <div className="video-wrap" onMouseEnter={() => setViewed(true)}>
//         <video ref={videoRef} autoPlay muted playsInline controls />
//         {(showSpinner || (status !== "Streaming…" && status !== "Idle")) && (
//           <div className="status-overlay">
//             {showSpinner ? (
//               <FaSpinner className="status-icon spinning" size={32} />
//             ) : status.startsWith("Failed") ||
//               status.includes("error") ||
//               status.includes("Error") ? (
//               <FaExclamationCircle className="status-icon error" size={32} />
//             ) : null}
//           </div>
//         )}
//       </div>
//     </div>
//   );
// }

import React, { useEffect, useRef } from "react";
import Hls from "hls.js";

export default function CameraTile({ cam }) {
  const videoRef = useRef(null);

  useEffect(() => {
    // Don't attach stream until the camera becomes visible
    if (!cam.isVisible) {
      console.log(`🚫 ${cam.camera} hidden, skipping stream`);
      return;
    }

    const videoEl = videoRef.current;
    if (!videoEl) return;

    // Build the correct playable stream URL
    let streamUrl = null;

    if (cam.streamType === "HLS" && cam.hlsUrl) {
      streamUrl = cam.hlsUrl; // test URL or remote HLS
    } else if (cam.streamType === "RTSP" && cam.streamName) {
      // Convert RTSP -> HLS via local MediaMTX gateway
      // Remove leading slash from streamName if present
      const cleanName = cam.streamName.replace(/^\//, "");
      streamUrl = `http://localhost:8889/${cleanName}/index.m3u8`;
    }

    if (!streamUrl) {
      console.warn(`⚠️ No valid stream URL for ${cam.camera}`);
      return;
    }

    console.log(`🎥 Starting stream for ${cam.camera}: ${streamUrl}`);

    // Attach HLS stream
    if (Hls.isSupported()) {
      const hls = new Hls({ enableWorker: true });
      hls.loadSource(streamUrl);
      hls.attachMedia(videoEl);
      hls.on(Hls.Events.MANIFEST_PARSED, () => {
        videoEl.play().catch((err) => console.error("Video play error:", err));
      });
      return () => {
        console.log(`🛑 Stopping HLS for ${cam.camera}`);
        hls.destroy();
      };
    } else if (videoEl.canPlayType("application/vnd.apple.mpegurl")) {
      // Native HLS playback (Safari)
      videoEl.src = streamUrl;
      videoEl.play().catch((err) => console.error("Native play error:", err));
      return () => {
        videoEl.pause();
        videoEl.removeAttribute("src");
      };
    } else {
      console.warn("❌ HLS not supported in this browser");
    }
  }, [cam.isVisible, cam.streamType, cam.hlsUrl, cam.streamName]);

  return (
    <div className="camera-tile">
      <h3 className="camera-title">{cam.camera}</h3>
      <video
        id={`camera-${cam.id}`}
        ref={videoRef}
        controls
        autoPlay
        muted
        playsInline
        style={{ width: "100%", height: "100%", background: "#000" }}
      />
    </div>
  );
}
