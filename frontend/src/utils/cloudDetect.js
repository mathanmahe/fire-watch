// Periodically grab a frame and POST to AWS endpoint.
// Assumes your Lambda expects { image_b64: "data:image/jpeg;base64,..." }.
// Adjust payload/field names to match frame_final.py.
export function startCloudDetect({ video, endpoint, intervalMs = 500, onResult, onError }) {
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    let stop = false;
  
    async function tick() {
      if (stop) return;
      try {
        if (video.videoWidth && video.videoHeight) {
          const S = Math.min(640, Math.max(video.videoWidth, video.videoHeight));
          canvas.width = S; canvas.height = S * (video.videoHeight / video.videoWidth);
          ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
          const dataUrl = canvas.toDataURL("image/jpeg", 0.7);
          const res = await fetch(endpoint, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ image_b64: dataUrl })
          });
          const json = await res.json().catch(()=> ({}));
          onResult?.(json);
        }
      } catch (e) {
        onError?.(e);
      } finally {
        setTimeout(tick, intervalMs);
      }
    }
  
    tick();
    return () => { stop = true; };
  }
  
  export function stopCloudDetect(abortFn) {
    try { abortFn?.(); } catch {}
  }
  