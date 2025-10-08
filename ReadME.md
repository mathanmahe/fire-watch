```fireWatch/
    ├── frontend/
    │   ├── index.html
    │   ├── package.json
    │   ├── vite.config.js
    │   ├── models/
    │   │   └── yolov11n_bestFire.onnx
    │   ├── node_modules/
    │   ├── package-lock.json
    │   └── src/
    │       ├── App.jsx
    │       ├── main.jsx
    │       ├── styles.css
    │       ├── auth/
    │       │   └── AuthContext.jsx
    │       ├── components/
    │       │   ├── AddCameraDialog.jsx
    │       │   ├── CameraGrid.jsx
    │       │   ├── CameraTile.jsx
    │       │   ├── FireStatusButton.jsx
    │       │   ├── MiniStatusPanel.jsx
    │       │   ├── SideNav.jsx
    │       │   ├── SingleCameraView.jsx
    │       │   ├── StatusPanel.jsx
    │       │   └── StreamingIcon.jsx
    │       ├── pages/
    │       │   ├── Dashboard.jsx
    │       │   ├── Login.jsx
    │       │   └── Status.jsx
    │       ├── store/
    │       │   └── cameras.jsx
    │       └── utils/
    │           ├── cloudDetect.js
    │           ├── playWebRTC.js
    │           ├── theme.js
    │           ├── videoDetector.js
    │           └── worker-client.js
    ├── backend/
    │   ├── .env
    │   ├── mediamtx.yml
    │   ├── package.json
    │   ├── package-lock.json
    │   ├── Readme.md
    │   ├── prisma/
    │   │   ├── firewatch.db
    │   │   ├── migrations/
    │   │   │   ├── 20251001193330_init/
    │   │   │   │   └── migration.sql
    │   │   │   ├── 20251001203431_init/
    │   │   │   │   └── migration.sql
    │   │   │   └── migration_lock.toml
    │   │   └── schema.prisma
    │   ├── test-api.js
    │   ├── test-auto-refresh.js
    │   ├── test-login.js
    │    └── src/
    │        ├── server.js
    │        ├── config.js
    │        ├── auth/
    │        │   └── cognitoVerify.js
    │        ├── db/
    │        │   └── prisma.js
    │       ├── routes/
    │       │   └── cameras.js
    │       └── services/
    │           ├── mediamtx.js
    │           └── cloudDetector.js
    ├── fire_sample2.mp4
    ├── todo.md
    ├── ReadME.md
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

# Run sample videos

```
./stream-videos.sh
```

To stream some sample videos in the videos dir onto cameras 3-7

# FireWatch: File Detailed Directory Description

## frontend/

### Root

- **index.html** — Vite entry HTML. Mounts the React app at `#root` and loads `/src/main.jsx`.
- **package.json** — Frontend dependencies and scripts (`dev`, `build`, `preview`).
- **package-lock.json** — Locked dependency versions for reproducible frontend installs.
- **vite.config.js** — Vite config; includes React plugin and COOP/COEP headers for in-browser ONNX.

### models/

- **yolov11n_bestFire.onnx** — Pre-trained ONNX model for local fire detection:
  - Lightweight YOLOv11 nano model optimized for fire detection
  - Used by `videoDetector.js` for in-browser fire detection
  - Runs inference on video frames captured from camera streams
  - Model delivers real-time fire detection without cloud dependencies

> **Note**: Copy ONNX Runtime Web binaries to `models/ort/` for Vite to serve them correctly for in-browser inference.

### src/

- **main.jsx** — React bootstrap; renders `<App />` and imports global styles.
- **App.jsx** — App router shell. Wraps children in `AuthProvider`. Decides between `<Login />` and `<Dashboard />`.
- **styles.css** — Global Tailwind-like utility styles for the three-panel layout and components.

#### auth/

- **AuthContext.jsx** — Auth state provider. Stubbed login/logout now; later wires to AWS Amplify/Cognito and supplies the JWT to API calls.

#### pages/

- **Login.jsx** — Minimal sign-in form (email/password). Calls `AuthContext.login`. Replace with Amplify UI or a custom Cognito flow.
- **Dashboard.jsx** — Main three-panel page (left nav + camera grid + status panel). Hosts the "Add Camera" modal and ties together grid and status. Features view mode switching (grid/single) and status panel toggle.
- **Status.jsx** — Dedicated status page showing comprehensive camera status table with streaming, fire detection, and viewing status.

#### components/

- **SideNav.jsx** — Left navigation (Video/Status). Exposes "+ Add Camera" and "Sign out" buttons.
- **CameraGrid.jsx** — 3×3 (scrollable) responsive grid that renders a list of `<CameraTile />` from the camera store.
- **CameraTile.jsx** — The live player + detection status card per camera.

  - Attaches stream via WebRTC (WHEP) or HLS.
  - If `detection === "local"`, lazy-loads `videoDetector.js` and runs in-browser ONNX, updating tile status.
  - If `detection === "cloud"`, samples frames (from the video element) and calls the AWS endpoint (via `cloudDetect.js`).
  - Displays **Live/Down**, **FIRE/CLEAR**, and camera metadata.

- **SingleCameraView.jsx** — Single camera view mode with navigation controls to cycle through cameras.
- **FireStatusButton.jsx** — Reusable fire status indicator component.
- **StreamingIcon.jsx** — Reusable streaming status indicator with visual states.
- **MiniStatusPanel.jsx** — Compact status panel showing camera visibility toggles and status icons.
- **StatusPanel.jsx** — Right-side table showing per-camera runtime flags (isStreaming/isFire/isView), name, and location. (Lightweight now; can be wired to live back-end events later.)
- **AddCameraDialog.jsx** — Modal form to add a camera (name, location, IP, creds, detection type, stream type & URL/gateway). Pushes to the camera store.

#### store/

- **cameras.jsx** — Simple React context for camera metadata and list management.

  - Seeds 10 demo cameras (5 local, 5 cloud).
  - `addCamera()` merges new cameras; used by `AddCameraDialog`.
  - Manages camera status (isFire, isStreaming) and visibility state.
  - Provides `toggleCameraVisibility()` for show/hide functionality.
  - Can be extended to sync with backend CRUD.

#### utils/

- **cloudDetect.js** — Grabs JPEG frames from a `<video>` (via canvas) at a fixed interval and POSTs to the AWS fire-detection endpoint. Handles result callbacks/errors.
- **playWebRTC.js** — Minimal WHEP client:

  - Creates `RTCPeerConnection`, sends offer to `http://<gateway>/<name>/whep`, sets remote answer, and returns a `MediaStream`.

- **videoDetector.js** — Your in-browser ONNX detector module (imports ORT worker, runs local detections on a video element/stream).
- **worker-client.js** — Web worker that loads the ONNX model and does inference off the main thread.
- **theme.js** — Theme management utilities for light/dark mode switching with localStorage persistence.

---

## backend/

### Root

- **.env** — Runtime config (SQLite path, Cognito IDs, MediaMTX paths, AWS fire endpoint, ffmpeg path, API port)
- **mediamtx.yml** — MediaMTX configuration file for stream management:
  - Configures HLS server on port 8888 with low-latencies variant
  - Sets up WebRTC server (WHEP/WHIP) on port 8889
  - Defines RTSP server on port 8554 for accepting RTSP publishers
  - Pre-configured camera sources pulling from RTSP streams (cam1-cam5)
  - Includes WebRTC ICE settings and additional hosts configuration
- **package.json** — Backend dependencies, Prisma generation, and scripts (`dev`, `migrate`).
- **package-lock.json** — Locked dependency versions for reproducible installs.
- **Readme.md** — Backend-specific documentation covering:
  - Recent changes and implementations (auth middleware, multi-user isolation)
  - Database schema modifications (userId field, unique constraints)
  - AWS services integration (Cognito, Lambda, SNS)
  - Test utilities and CLI authentication tools
- **test-api.js** — API testing script with automatic token refresh for authenticated endpoints.
- **test-auto-refresh.js** — Token management utilities for API testing with Cognito authentication.
- **test-login.js** — CLI tool for user authentication with Cognito, handles NEW_PASSWORD_REQUIRED challenge.

### prisma/

- **schema.prisma** — Prisma schema for **SQLite**:

  - `Camera` table with multi-user support via `userId` field (links to Cognito user sub).
  - Multi-tenancy constraint: `@@unique([userId, camera])` - users can have cameras with same names.
  - Added index: `@@index([userId])` for query optimization.
  - Fields: `id`, `camera`, `location`, `ip`, `username`, `password`, `detection`, `streamType`, `streamName`, `webrtcBase`, `hlsUrl`, `userId`, timestamps.
  - `Detection` table (optional future use) for timestamped results per camera.

- **firewatch.db** — SQLite database file.
- **migrations/** — Database migration files for schema changes.

### src/

- **server.js** — Express app entrypoint.

  - JSON middleware.
  - `/healthz` for liveness and MediaMTX status.
  - `requireAuth` middleware protecting all `/api/*` routes with Cognito JWT verification.
  - Mounts `/api/cameras` routes.
  - Connects Prisma and **starts MediaMTX** on boot.
  - Auto-starts cloud detectors for existing cameras with `detection: "CLOUD"`.

- **config.js** — Loads `.env` and exports typed config (DB URL, Cognito, MediaMTX, ffmpeg, AWS endpoint, port).

#### auth/

- **cognitoVerify.js** — Middleware to verify **Cognito ID/access tokens** using `@aws-jwt-verify`.
  - Extracts user info from Cognito ID token.
  - Attaches `req.user` (with sub and email) to authenticated requests.
  - Returns 401 for missing or invalid tokens.

#### db/

- **prisma.js** — Prisma client singleton (`@prisma/client`).

#### routes/

- **cameras.js** — REST API for camera metadata with multi-user isolation:

  - **Multi-user isolation**: All routes filter by `req.user.sub` (Cognito user ID).
  - `POST /api/cameras` — Create a camera (links to authenticated user via userId field, starts cloud detector if `detection === CLOUD`).
  - `GET /api/cameras` — List cameras (users only see their own cameras).
  - `PUT /api/cameras/:id` — Update camera (ownership verification before allowing modifications, restarts cloud detector if needed).
  - `DELETE /api/cameras/:id` — Delete camera (ownership verification, stops detector).
  - `POST /api/cameras/:id/detections` — (Optional) Persist a detection into the `Detection` table.
  - `GET /api/cameras/status/all` — Lightweight status snapshot for the UI.
  - Auto-starts/stops cloud detector when camera is activated/deactivated.
  - Error handling for ownership violations.

#### services/

- **mediamtx.js** — Manages the **MediaMTX** process:

  - Spawns MediaMTX with your `mediamtx.yml`.
  - Streams logs, exposes `start/stop/isRunning`.
  - Provides the WHEP/HLS endpoints consumed by the frontend.

- **cloudDetector.js** — Background workers for **cloud detection**:

  - Converts frame extraction from Python to Node.js.
  - RTSP support: Builds RTSP URLs with credentials (`rtsp://user:pass@ip:port/path`).
  - Uses **ffmpeg** to grab frames every 5 seconds (configurable fps).
  - Sends JPEG frames to AWS Lambda endpoint.
  - Lambda response triggers SNS (handled by Lambda, not backend).
  - Maintains worker map to track active detectors per camera.
  - Graceful start/stop for detectors.

---

## FLOW

### Authentication Flow

- **Backend**: All `/api/*` routes protected by `requireAuth` middleware using Cognito JWT verification.
- **Frontend**: `AuthContext` manages authentication state, routes between `<Login />` and `<Dashboard />`.
- **Testing**: `test-login.js` provides CLI authentication, `test-auto-refresh.js` manages token refresh for API testing.

### Frontend Detection Flows

- **Local Detection**: `CameraTile` → `playWebRTC()` (MediaMTX WHEP) → attach `<video>` → `videoDetector.js` runs ONNX in browser → updates tile/status.
- **Cloud Detection**: `CameraTile` → play stream (WebRTC/HLS) → `cloudDetect.js` captures frames → hits **AWS endpoint** → updates tile/status.

### Backend Control Plane

- **Multi-user**: CRUD cameras in SQLite via Prisma with user isolation via `userId` field.
- **MediaMTX**: Starts MediaMTX on server boot for stream management.
- **Cloud Detection**: For `CLOUD` cameras, `cloudDetector.js` samples frames server-side and posts to AWS Lambda.
- **Auto-start**: Existing cloud detectors automatically start when server boots.

### View Modes

- **Grid View**: Traditional 3×3 camera grid with scrollable layout.
- **Single View**: Focused single camera view with navigation controls to cycle through cameras.
- **Status Panel**: Toggle-able compact status panel showing camera visibility and status indicators.

### Database Schema

- **Multi-tenancy**: `Camera` table includes `userId` field linking to Cognito user sub.
- **Constraints**: `@@unique([userId, camera])` allows users to have cameras with same names.
- **Indexing**: `@@index([userId])` for query optimization.
- **Migrations**: Database schema managed through Prisma migrations.

## Docker Implementation for MediaMtx - PROPOSED, SUBJECT TO CHANGE

# Network topology

1. User device - browser to frontend, served locally on the device
2. Browser loads streams from MediaMTX at http://ONPREM_IP:8889/... (WHEP) and/or http://ONPREM_IP:8888/... (HLS).
3. Browser calls Backend API at http://ONPREM_IP:4000/api/....
4. Backend (host) talks to MediaMTX via localhost: http://127.0.0.1:8888 (HLS) / :8889 (WHEP).
5. Optional cloud path: Backend uses ffmpeg to grab frames from http://127.0.0.1:8888/<cam>/index.m3u8 and POST to your AWS Lambda.

# On prem host prerequisites

Docker, Node.js, ffmpeg, open firewall ports -

- `4000/tcp`: backend API
- `8888/tcp`: MediaMTX HLS/HTTP
- `8889/tcp`: MediaMTX WHEP/WHIP
- `8554/tcp`: MediaMTX RTSP (if you ingest via RTSP)
- `8000–8100/udp`: MediaMTX WebRTC ICE (adjust range if you prefer)

# # docker debug commands

# show logs

`docker logs mediamtx-firewatch  `

# verify running

`docker ps | grep mediamtx-firewatch`

# delete container

`docker rm -f mediamtx-firewatch    `

## WebRTC Streaming & Fire Detection - Key Changes

# 1. Fixed WebRTC ICE Connection Issues (mediamtx.yml, mediamtx.js):

    - Enabled TCP fallback for WebRTC (webrtcLocalTCPAddress: :8189)
    - Fixed ICE candidate advertising (removed host.docker.internal, kept only 10.0.0.160) - Added TCP port 8189 to Docker container configuration

# 2. Fixed Bounding Box Display (CameraTile.jsx, videoDetector.js:

    - Canvas now overlays video transparently (removed video drawing from canvas)
    - Manual worker spawn and video loop binding instead of using attachWebRTC()
    - Added ResizeObserver to sync canvas size when switching views (grid ↔ single) - Doubled font size for bounding box labels (width / 30) for better visibility in grid view

# 3. Responsive Grid Improvements (styles.css):

    - Added breakpoints at 1300px (320px rows) and 1600px (400px rows) to prevent video cropping on wider screens
    - Ensure videoPlayer grows with the tile surround it.
    - add Spinner and failed to load icons.

# 4. Video Player Improvements:

- Changed video element from height: auto to height: 100% to fill entire tile (controls and player UI now fill full tile even when video isn't playing)
- Added responsive breakpoint at 2500px width (grid rows: 520px) to prevent video cropping on ultra-wide screens

MediaMTX Configuration:

- Switched cam1 and cam2 back to real RTSP camera sources
- Added cam3-7 as on-demand publishing paths for ffmpeg video streams

UI Polish:

- Changed "Video" nav link to "Streams"
- Changed "FireWatch" to "Fire Watch" (with space)
- Added light theme variants for better theming support
