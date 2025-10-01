// public/videoPlayer.js  (ES module friendly)
// Requires Hls.js on the page.
// Usage:
//   const d = new VideoDetector({ source: "output/stream.m3u8", mount: "#grid", id: "cam-1" });
//   await d.start();

export class VideoDetector {
    constructor({
      source,                 // HLS URL (or MP4). For step 1 we assume HLS like your current flow.
      id,                     // unique id for this instance
      mount,                  // CSS selector or HTMLElement where we'll append the video/canvas UI
      workerUrl = "worker-client.js",
      modelInputSize = 640,   // YOLO input side (square)
      throttleMs = 60,        // ~16ms=60fps, 33ms=30fps, 60ms~16fps
      onDetections = () => {} // callback(boxes) per frame
    }) {
      this.source = source;
      this.id = id || `detector-${Math.random().toString(36).slice(2)}`;
      this.workerUrl = workerUrl;
      this.modelInputSize = modelInputSize;
      this.throttleMs = throttleMs;
      this.onDetections = onDetections;
      this.enabled = true;

      


  
      this._root = typeof mount === "string" ? document.querySelector(mount) : mount || document.body;
      this._video = null;
      this._overlay = null;
      this._ctx = null;
      this._hls = null;
      this._worker = null;
  
      // per-instance state (no globals)
      this._busy = false;
      this._rafHandle = null;
      this._lastTick = 0;
      this._boxes = [];
  
      // detection history
      this._detectionHistory = [];          // booleans
      this._fireAreasHistory = [];
      this._fireIncreaseHistory = [];
      this._MAX_FRAMES = 10;
      this._MAX_FRAMES_HISTORY = 10;
      this._THRESHOLD = 0.8;                // 80%
      this._AREA_INCREASE_PERCENT = 0.5;    // 50%
      // this.detectionHistory = [];          // booleans
      // this.fireAreasHistory = [];
      // this.fireIncreaseHistory = [];
      // this.MAX_FRAMES = 10;
      // this.MAX_FRAMES_HISTORY = 10;
      // this.THRESHOLD = 0.8;                // 80%
      // this.AREA_INCREASE_PERCENT = 0.5;    // 50%
    }

    setEnabled(val) { this.enabled = !!val; }
  
    render() {                        // new
      if (!this._container) this._buildUI();
      return this._container;
    }

    async start() {
      this.render();                  // make sure UI exists
      await this._attachStream();
      this._spawnWorker();
      this._bindVideoLoop();
    }
  
    stop() {
      if (this._rafHandle) cancelAnimationFrame(this._rafHandle);
      if (this._hls) { this._hls.destroy(); this._hls = null; }
      if (this._worker) { this._worker.terminate(); this._worker = null; }
    }
  
    destroy() {
      this.stop();
      if (this._root && this._container) this._root.removeChild(this._container);
    }

    // async attachWebRTC(stream) {
    //   this.render(); // ensure video/canvas exist
    //   const setSizes = () => {
    //     if (!this._video.videoWidth) return;
    //     this._overlay.width  = this._video.videoWidth;
    //     this._overlay.height = this._video.videoHeight;
    //   };
    //   this._video.srcObject = stream;
    //   this._video.addEventListener('loadedmetadata', setSizes, { once: true });
    //   try { await this._video.play(); } catch {}
    //   if (!this._worker) this._spawnWorker();
    //   this._bindVideoLoop();
    // }

    async attachWebRTC(stream) {
      this.render(); // ensure UI exists
    
      const v = this._video;
    
      // 1) Wire the stream and common flags
      v.autoplay = true;
      v.playsInline = true;
      v.muted = true;
      v.srcObject = stream;
    
      // 2) Keep overlay canvas in sync with video dimensions
      const setSizes = () => {
        if (!v.videoWidth) return;
        this._overlay.width  = v.videoWidth;
        this._overlay.height = v.videoHeight;
      };
      v.addEventListener('loadedmetadata', setSizes);
      v.addEventListener('resize', setSizes);
    
      // 3) Make sure the worker exists before the loop
      if (!this._worker) this._spawnWorker();
    
      // 4) Bind the loop BEFORE attempting to play (so we don't miss the 'play' event)
      this._bindVideoLoop();
    
      // 5) Kick playback; if it's already playing, start the loop immediately
      try { await v.play(); } catch (_) { /* UI play button may handle */ }
      if (!v.paused && v.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) {
        // ensure the first tick happens even if 'play' already fired
        if (!this._rafHandle) this._rafHandle = requestAnimationFrame((t) => this._lastTick = t - this.throttleMs - 1);
      }
    }
  
    // ————— internal helpers —————
    _buildUI() {
      const container = document.createElement("div");
      container.className = "detector rounded-xl shadow p-2";
      container.style.position = "relative";
      container.style.background = "#000";
      container.style.display = "grid";
      container.style.gridTemplateRows = "auto auto";
      container.style.gap = "6px";
  
      const header = document.createElement("div");
      header.textContent = this.id;
      header.style.color = "white";
      header.style.font = "600 14px system-ui";
      header.style.opacity = "0.85";
  
      const video = document.createElement("video");
      video.id = `${this.id}-video`;
      video.autoplay = true;
      video.muted = true;
      video.playsInline = true;
      video.controls = false;
      video.style.width = "100%";
      video.style.height = "auto";
      video.style.display = "block";
      video.crossOrigin = 'anonymous';
  
      const canvas = document.createElement("canvas");
      canvas.id = `${this.id}-overlay`;
      canvas.style.position = "absolute";
      canvas.style.inset = "22px 2px 2px 2px"; // under header
      canvas.style.pointerEvents = "none";
      canvas.style.display = "block";
  
      const stage = document.createElement("div");
      stage.style.position = "relative";
      stage.appendChild(video);
      stage.appendChild(canvas);
  
      container.appendChild(header);
      container.appendChild(stage);
  
      this._root.appendChild(container);
  
      this._container = container;
      this._video = video;
      this._overlay = canvas;
      this._ctx = canvas.getContext("2d");
    }
  
    async _attachStream() {
        
        const LIVE_STREAM_URL = this.source;
        const isHls = /\.m3u8(\?|$)/i.test(LIVE_STREAM_URL);
        console.log(this.id, 'attach', { url: LIVE_STREAM_URL, isHls });

        const setSizes = () => {
          if (!this._video.videoWidth) return;
          this._overlay.width  = this._video.videoWidth;
          this._overlay.height = this._video.videoHeight;
        };
      
        // ── HLS ONLY if the URL is actually an HLS playlist ──────────────────────────
        if (isHls && window.Hls && window.Hls.isSupported()) {
          this._hls = new Hls({
            liveDurationInfinity: true,
            xhrSetup: (xhr) => { xhr.withCredentials = false; }
            });
          this._hls.loadSource(LIVE_STREAM_URL);
          this._hls.attachMedia(this._video);
          this._hls.on(Hls.Events.MANIFEST_PARSED, () => this._video.play());
          this._video.addEventListener("loadedmetadata", setSizes);
          console.log(`[${this.id}] using Hls.js`);
          return;
        }
      
        // Native HLS (Safari)
        if (isHls && this._video.canPlayType("application/vnd.apple.mpegurl")) {
          this._video.src = LIVE_STREAM_URL;
          this._video.addEventListener("loadedmetadata", () => {
            setSizes();
            this._video.play().catch(()=>{/* show play button if you want */});
          });
          console.log(`[${this.id}] using native HLS`);
          return;
        }
      
        // ── MP4 / non-HLS fallback ───────────────────────────────────────────────────
        this._video.src = LIVE_STREAM_URL;
        this._video.addEventListener("loadedmetadata", () => {
          setSizes();
          const p = this._video.play();
          if (p && p.catch) {
            p.catch(() => {
              const btn = this._container?.querySelector(".play-button");
              if (btn) btn.style.display = "block";  // autoplay blocked
            });
          }
        });
        this._video.addEventListener("error", () => {
          console.error(`[${this.id}] video error`, this._video.error);
        });
        console.log(`[${this.id}] using MP4 fallback`);
      }
  
    _spawnWorker() {
      this._worker = new Worker(this.workerUrl, { type: "classic", name: this.id });
      this._worker.onmessage = (evt) => {
        const output = evt.data;
        // postprocess on main thread to keep worker lean
        this._boxes = this._processOutput(output, this._overlay.width, this._overlay.height);
        this.onDetections(this._boxes);
        this._busy = false;
      };
    }
  
    _bindVideoLoop() {
      if (!this.enabled) return;
      const tick = (t) => {
        this._rafHandle = requestAnimationFrame(tick);
  
        // throttle
        if (t - this._lastTick < this.throttleMs) return;
        this._lastTick = t;
  
        if (!this._video || !this._overlay) return;
        if (this._video.videoWidth === 0 || this._video.videoHeight === 0) return;
  
        // draw frame & boxes
        this._ctx.drawImage(this._video, 0, 0, this._overlay.width, this._overlay.height);
        this._drawBoxes(this._boxes);
  
        if (this._busy) return;
  
        const buffer = this._prepareInput(this._overlay);
        if (!buffer) return;
  
        // Transfer the underlying ArrayBuffer to avoid copying
        this._worker.postMessage(
          { type: "infer", data: buffer, dims: [1, 3, this.modelInputSize, this.modelInputSize] },
          [buffer] // Transferable
        );
        this._busy = true;
      };
      const start = () => {
        if (!this._rafHandle) this._rafHandle = requestAnimationFrame(tick);
      };
      
      // Start on future 'play'...
      this._video.addEventListener("play", start, { once: true });
      // ...and also start now if already playing
      if (!this._video.paused && this._video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) {
        start();
      }
    }
  
    _prepareInput() {
    const S = this.modelInputSize;

    // cache a scratch canvas so we don't recreate it every frame
    if (!this._scratch) {
        this._scratch = document.createElement('canvas');
        this._scratch.width = S;
        this._scratch.height = S;
        this._scratchCtx = this._scratch.getContext('2d', { willReadFrequently: true });
    }

    // draw the current video frame into the scratch canvas at model size
    // this._scratchCtx.drawImage(this._video, 0, 0, S, S);

    // const data = this._scratchCtx.getImageData(0, 0, S, S).data;

    this._scratchCtx.drawImage(this._video, 0, 0, S, S);
    let data;
    try {
    data = this._scratchCtx.getImageData(0, 0, S, S).data;
    } catch (e) {
    if (e.name === 'SecurityError') {
        // frame came from a CORS-blocked source, skip gracefully
        // optionally reset scratch to “untaint”
        this._scratch.width = S; this._scratch.height = S;
        return null;
    }
    throw e;
    }
    const N = S * S;
    const arr = new Float32Array(N * 3); // CHW, [0..1]

    let r = 0, g = N, b = 2 * N;
    for (let i = 0; i < data.length; i += 4) {
        arr[r++] = data[i]     / 255;
        arr[g++] = data[i + 1] / 255;
        arr[b++] = data[i + 2] / 255;
    }
    return arr.buffer;  // transferable ArrayBuffer
    }
  
    _processOutput(output, imgW, imgH) {
      // Mirrors your logic but scoped to this instance, with minor safeguards.
      let boxes = [];
      let fireCount = 0;
      let smokeCount = 0;
      let totalFireArea = 0;
  
      const cells = 8400;          // model-specific
      const clsCount = 3;          // Fire/Smoke/Other
      const probThreshold = 0.2;
  
      for (let i = 0; i < cells; i++) {
        // pick max-prob class
        let classId = 0, best = 0;
        for (let c = 0; c < clsCount; c++) {
          const p = output[cells * (c + 4) + i];
          if (p > best) { best = p; classId = c; }
        }
        if (best < probThreshold) continue;
  
        const xc = output[i];
        const yc = output[cells + i];
        const w  = output[2 * cells + i];
        const h  = output[3 * cells + i];
  
        const x1 = (xc - w / 2) / 640 * imgW;
        const y1 = (yc - h / 2) / 640 * imgH;
        const x2 = (xc + w / 2) / 640 * imgW;
        const y2 = (yc + h / 2) / 640 * imgH;
  
        const label = ["Fire", "Smoke", "Other"][classId];
        boxes.push([x1, y1, x2, y2, label, best]);
  
        const area = Math.max(0, (x2 - x1)) * Math.max(0, (y2 - y1));
        if (label === "Fire") { fireCount++; totalFireArea += area; }
        if (label === "Smoke") { smokeCount++; totalFireArea += area; }
      }
  
      // history updates
      const detected = fireCount > 0 || smokeCount > 0;
      this._detectionHistory.push(detected);
      if (this._detectionHistory.length > this._MAX_FRAMES) this._detectionHistory.shift();
  
      if (this._fireAreasHistory.length > 0) {
        const prev = this._fireAreasHistory[this._fireAreasHistory.length - 1];
        this._fireIncreaseHistory.push(totalFireArea > prev);
      } else {
        this._fireIncreaseHistory.push(false);
      }
      this._fireAreasHistory.push(totalFireArea);
      if (this._fireAreasHistory.length > this._MAX_FRAMES_HISTORY) {
        this._fireAreasHistory.shift();
        this._fireIncreaseHistory.shift();
      }
  
      const incCount = this._fireIncreaseHistory.filter(Boolean).length;
      const incRate  = incCount / this._fireIncreaseHistory.length;
      const detRate  = this._detectionHistory.filter(Boolean).length / this._detectionHistory.length;
  
      if (detRate >= this._THRESHOLD && incRate >= this._AREA_INCREASE_PERCENT) {
        console.log(`[${this.id}] Serious fire trend detected`);
      }
      // console.log("--------------------------------")
      // console.log("current detection id", this.id)
      // console.log("detectionHistory", this._detectionHistory)
      // console.log("fireAreasHistory", this._fireAreasHistory)
      // console.log("fireIncreaseHistory", this._fireIncreaseHistory)
      // console.log("detRate", detRate)
      // console.log("incRate", incRate)
      // console.log("boxes", boxes)
      // console.log("area increase percent", this._AREA_INCREASE_PERCENT)
      // console.log("threshold", this._THRESHOLD)
      // console.log("--------------------------------")
  
      // NMS (simple IoU)
      boxes.sort((a, b) => b[5] - a[5]);
      const keep = [];
      const iou = (A, B) => {
        const inter = (() => {
          const x1 = Math.max(A[0], B[0]);
          const y1 = Math.max(A[1], B[1]);
          const x2 = Math.min(A[2], B[2]);
          const y2 = Math.min(A[3], B[3]);
          return Math.max(0, x2 - x1) * Math.max(0, y2 - y1);
        })();
        const areaA = Math.max(0, A[2]-A[0]) * Math.max(0, A[3]-A[1]);
        const areaB = Math.max(0, B[2]-B[0]) * Math.max(0, B[3]-B[1]);
        const uni = areaA + areaB - inter;
        return uni <= 0 ? 0 : inter / uni;
      };
      while (boxes.length) {
        const head = boxes.shift();
        keep.push(head);
        boxes = boxes.filter(b => iou(head, b) < 0.7);
      }
      return keep;
    }
  
    _drawBoxes(boxes) {
      const ctx = this._ctx;
      ctx.save();
      ctx.lineWidth = 3;
      ctx.font = "18px system-ui";
      boxes.forEach(([x1, y1, x2, y2, label]) => {
        ctx.strokeStyle = "#00FF00";
        ctx.strokeRect(x1, y1, x2 - x1, y2 - y1);
        ctx.fillStyle = "#00FF00";
        const w = ctx.measureText(label).width;
        ctx.fillRect(x1, Math.max(0, y1 - 22), w + 10, 20);
        ctx.fillStyle = "#000";
        ctx.fillText(label, x1 + 4, Math.max(16, y1 - 6));
      });
      ctx.restore();
    }
  }
  
