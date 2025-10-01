```fireWatch/
    frontend/
    ├── index.html
    ├── package.json
    ├── vite.config.js
    ├── public/
    │   ├── videoDetector.js
    │   └── worker-client.js
    └── src/
        ├── App.jsx
        ├── main.jsx
        ├── styles.css
        ├── auth/
        │   └── AuthContext.jsx
        ├── components/
        │   ├── AddCameraDialog.jsx
        │   ├── CameraGrid.jsx
        │   ├── CameraTile.jsx
        │   ├── SideNav.jsx
        │   └── StatusPanel.jsx
        ├── pages/
        │   ├── Dashboard.jsx
        │   └── Login.jsx
        ├── store/
        │   └── cameras.js
        └── utils/
            ├── cloudDetect.js
            └── playWebRTC.js
    backend/
    ├── .env
    ├── package.json
    ├── prisma/
    │   └── schema.prisma
    └── src/
        ├── server.js
        ├── config.js
        ├── auth/
        │   └── cognitoVerify.js
        ├── db/
        │   └── prisma.js
        ├── routes/
        │   └── cameras.js
        └── services/
            ├── mediamtx.js
            └── cloudDetector.js   
```


# Run frontend

```
cd fireWatch/frontend
npm i
npm run dev
```


# Run backend

```
cd fireWatch/backend
npm i
npm run migrate     # creates firewatch.db and tables
# confirm mediamtx.yml path in .env and ffmpeg is installed
npm run dev
```


here’s a clean “what-does-what” you can paste into your README.

# FireWatch: File Detailed Directory Description

## frontend/

### Root

* **index.html** — Vite entry HTML. Mounts the React app at `#root` and loads `/src/main.jsx`.
* **package.json** — Frontend dependencies and scripts (`dev`, `build`, `preview`).
* **vite.config.js** — Vite config; includes React plugin and COOP/COEP headers for in-browser ONNX.

### public/

* **videoDetector.js** — Your in-browser ONNX detector module (imports ORT worker, runs local detections on a video element/stream).
* **worker-client.js** — Web worker that loads the ONNX model and does inference off the main thread.

### src/

* **main.jsx** — React bootstrap; renders `<App />` and imports global styles.
* **App.jsx** — App router shell. Wraps children in `AuthProvider`. Decides between `<Login />` and `<Dashboard />`.
* **styles.css** — Global Tailwind-like utility styles for the three-panel layout and components.

#### auth/

* **AuthContext.jsx** — Auth state provider. Stubbed login/logout now; later wires to AWS Amplify/Cognito and supplies the JWT to API calls.

#### pages/

* **Login.jsx** — Minimal sign-in form (email/password). Calls `AuthContext.login`. Replace with Amplify UI or a custom Cognito flow.
* **Dashboard.jsx** — Main three-panel page (left nav + camera grid + status panel). Hosts the “Add Camera” modal and ties together grid and status.

#### components/

* **SideNav.jsx** — Left navigation (Video/Chats/Schedule/Settings). Exposes “+ Add Camera” and “Sign out” buttons.
* **CameraGrid.jsx** — 3×3 (scrollable) responsive grid that renders a list of `<CameraTile />` from the camera store.
* **CameraTile.jsx** — The live player + detection status card per camera.

  * Attaches stream via WebRTC (WHEP) or HLS.
  * If `detection === "local"`, lazy-loads `videoDetector.js` and runs in-browser ONNX, updating tile status.
  * If `detection === "cloud"`, samples frames (from the video element) and calls the AWS endpoint (via `cloudDetect.js`).
  * Displays **Live/Down**, **FIRE/CLEAR**, and camera metadata.
* **StatusPanel.jsx** — Right-side table showing per-camera runtime flags (isStreaming/isFire/isView), name, and location. (Lightweight now; can be wired to live back-end events later.)
* **AddCameraDialog.jsx** — Modal form to add a camera (name, location, IP, creds, detection type, stream type & URL/gateway). Pushes to the camera store.

#### store/

* **cameras.js** — Simple React context for camera metadata and list management.

  * Seeds 10 demo cameras (5 local, 5 cloud).
  * `addCamera()` merges new cameras; used by `AddCameraDialog`.
  * Can be extended to sync with backend CRUD.

#### utils/

* **cloudDetect.js** — Grabs JPEG frames from a `<video>` (via canvas) at a fixed interval and POSTs to the AWS fire-detection endpoint. Handles result callbacks/errors.
* **playWebRTC.js** — Minimal WHEP client:

  * Creates `RTCPeerConnection`, sends offer to `http://<gateway>/<name>/whep`, sets remote answer, and returns a `MediaStream`.

---

## backend/

### Root

* **.env** — Runtime config (SQLite path, Cognito IDs, MediaMTX paths, AWS fire endpoint, ffmpeg path, API port).
* **package.json** — Backend dependencies, Prisma generation, and scripts (`dev`, `migrate`).

### prisma/

* **schema.prisma** — Prisma schema for **SQLite**:

  * `Camera` table (your six required fields: `id`, `camera`, `location`, `ip`, `username`, `password`) plus practical fields (`detection`, `streamType`, `streamName`, `webrtcBase`, `hlsUrl`, timestamps).
  * `Detection` table (optional future use) for timestamped results per camera.

### src/

* **server.js** — Express app entrypoint.

  * JSON middleware.
  * `/healthz` for liveness and MediaMTX status.
  * (Optional) `requireAuth` gate for `/api/*` once Cognito is wired.
  * Mounts `/api/cameras` routes.
  * Connects Prisma and **starts MediaMTX** on boot.
* **config.js** — Loads `.env` and exports typed config (DB URL, Cognito, MediaMTX, ffmpeg, AWS endpoint, port).

#### auth/

* **cognitoVerify.js** — Middleware to verify **Cognito ID/access tokens** using `@aws-jwt-verify`. Attaches `req.user` on success.

#### db/

* **prisma.js** — Prisma client singleton (`@prisma/client`).

#### routes/

* **cameras.js** — REST API for camera metadata + simple status:

  * `POST /api/cameras` — Create a camera (starts a cloud detector if `detection === CLOUD`).
  * `GET /api/cameras` — List cameras.
  * `PUT /api/cameras/:id` — Update camera (restarts cloud detector if needed).
  * `DELETE /api/cameras/:id` — Delete camera (stops detector).
  * `POST /api/cameras/:id/detections` — (Optional) Persist a detection into the `Detection` table.
  * `GET /api/cameras/status/all` — Lightweight status snapshot for the UI.

#### services/

* **mediamtx.js** — Manages the **MediaMTX** process:

  * Spawns MediaMTX with your `mediamtx.yml`.
  * Streams logs, exposes `start/stop/isRunning`.
  * Provides the WHEP/HLS endpoints consumed by the frontend.
* **cloudDetector.js** — Background workers for **cloud detection**:

  * For each `CLOUD` camera, builds an input URL (HLS via MediaMTX or provided HLS).
  * Uses **ffmpeg** to grab periodic JPEG frames (e.g., 2 fps).
  * POSTs **raw JPEG bytes** to your AWS fire-detection endpoint with a `camera-id` header.
  * (Hook point) Persist results to `Detection` or publish alerts.

---

## FLOW

* **Frontend local detection flow**: `CameraTile` → `playWebRTC()` (MediaMTX WHEP) → attach `<video>` → `videoDetector.js` runs ONNX in browser → updates tile/status.
* **Frontend cloud detection flow**: `CameraTile` → play stream (WebRTC/HLS) → `cloudDetect.js` captures frames → hits **AWS endpoint** → updates tile/status.
* **Backend control plane**: CRUD cameras in SQLite via Prisma; starts MediaMTX; for `CLOUD` cameras, `cloudDetector.js` samples frames server-side and posts to AWS (optional if you keep client-side sampling).

