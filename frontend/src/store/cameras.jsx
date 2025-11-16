import React, {
  createContext,
  useContext,
  useMemo,
  useState,
  useEffect,
} from "react";
import { cameraApi } from "../services/cameraApi.js";

// Mode detection: true = use seed data, false = fetch from DB
const USE_SEED_DATA = import.meta.env.VITE_USE_SEED_DATA === "true";

// Seed 10 cameras (5 local, 5 cloud). Edit URLs to match your setup.
const seed = [
  // local in-browser detection (HLS or WebRTC)
  {
    id: 1,
    name: "cam-1",
    location: "Lobby",
    ip: "192.168.1.101",
    port: "8554",
    detection: "LOCAL",
    streamType: "WEBRTC",
    webrtcBase: import.meta.env.VITE_MEDIAMTX_GATEWAY_BASE,
    streamName: "cam-1",
    streamPath: "/live",
  },
  {
    id: 2,
    name: "cam-2",
    location: "Dock",
    ip: "192.168.1.102",
    port: "8554",
    detection: "LOCAL",
    streamType: "WEBRTC",
    webrtcBase: import.meta.env.VITE_MEDIAMTX_GATEWAY_BASE,
    streamName: "cam-2",
    streamPath: "/live",
  },
  {
    id: 3,
    name: "cam-3",
    location: "Yard",
    ip: "192.168.1.103",
    port: "8554",
    detection: "LOCAL",
    streamType: "WEBRTC",
    webrtcBase: import.meta.env.VITE_MEDIAMTX_GATEWAY_BASE,
    streamName: "cam3",
    streamPath: "/live",
  },
  {
    id: 4,
    name: "cam-4",
    location: "Lab",
    ip: "192.168.1.104",
    port: "8554",
    detection: "LOCAL",
    streamType: "WEBRTC",
    webrtcBase: import.meta.env.VITE_MEDIAMTX_GATEWAY_BASE,
    streamName: "cam4",
    streamPath: "/live",
  },
  {
    id: 5,
    name: "cam-5",
    location: "Warehouse",
    ip: "192.168.1.105",
    port: "8554",
    detection: "LOCAL",
    streamType: "WEBRTC",
    webrtcBase: import.meta.env.VITE_MEDIAMTX_GATEWAY_BASE,
    streamName: "cam5",
    streamPath: "/live",
  },

  // local detection for testing (cameras 6-7)
  {
    id: 6,
    name: "cam-6",
    location: "North",
    ip: "192.168.1.106",
    port: "8554",
    detection: "LOCAL",
    streamType: "WEBRTC",
    webrtcBase: import.meta.env.VITE_MEDIAMTX_GATEWAY_BASE,
    streamName: "cam6",
    streamPath: "/live",
  },
  {
    id: 7,
    name: "cam-7",
    location: "East",
    ip: "192.168.1.107",
    port: "8554",
    detection: "LOCAL",
    streamType: "WEBRTC",
    webrtcBase: import.meta.env.VITE_MEDIAMTX_GATEWAY_BASE,
    streamName: "cam7",
    streamPath: "/live",
  },
  {
    id: 8,
    name: "cam-8",
    location: "South",
    ip: "192.168.1.108",
    port: "8554",
    detection: "CLOUD",
    streamType: "WEBRTC",
    webrtcBase: import.meta.env.VITE_MEDIAMTX_GATEWAY_BASE,
    streamName: "cam8",
    streamPath: "/live",
    awsEndpoint: import.meta.env.VITE_AWS_FIRE_ENDPOINT,
    cloudFps: 2,
  },
  {
    id: 9,
    name: "cam-9",
    location: "West",
    ip: "192.168.1.109",
    port: "8554",
    detection: "CLOUD",
    streamType: "WEBRTC",
    webrtcBase: import.meta.env.VITE_MEDIAMTX_GATEWAY_BASE,
    streamName: "cam9",
    streamPath: "/live",
    awsEndpoint: import.meta.env.VITE_AWS_FIRE_ENDPOINT,
    cloudFps: 2,
  },
  {
    id: 10,
    name: "cam-10",
    location: "Roof",
    ip: "192.168.1.110",
    port: "8554",
    detection: "CLOUD",
    streamType: "WEBRTC",
    webrtcBase: import.meta.env.VITE_MEDIAMTX_GATEWAY_BASE,
    streamName: "cam10",
    streamPath: "/live",
    awsEndpoint: import.meta.env.VITE_AWS_FIRE_ENDPOINT,
    cloudFps: 2,
  },
];

const CamerasCtx = createContext(null);

export function CamerasProvider({ children }) {
  // Initialize with seed data if in seed mode, empty array if in DB mode
  const [cameras, setCameras] = useState(USE_SEED_DATA ? seed : []);
  const [cameraStatuses, setCameraStatuses] = useState({});
  const [loading, setLoading] = useState(!USE_SEED_DATA); // Loading state for DB mode
  const [error, setError] = useState(null);

  const [cameraVisibility, setCameraVisibility] = useState(() => {
    if (USE_SEED_DATA) {
      // Seed mode: only have cam1 visible by default for local testing
      return {
        1: true,
        2: false,
        3: false,
        4: false,
        5: false,
        6: false,
        7: false,
        8: false,
        9: false,
        10: false,
      };
    } else {
      // DB mode: all cameras hidden by default (will be shown via WebSocket or manual toggle)
      return {};
    }
  });

  // Fetch cameras from API in DB mode
  useEffect(() => {
    if (!USE_SEED_DATA) {
      fetchCamerasFromDB();
    }
  }, []);

  // Wait for backend to be ready before fetching cameras
  const waitForBackend = async (maxWait = 30000) => {
    const startTime = Date.now();
    const checkInterval = 1000; // Check every 1 second

    console.log("[DB Mode] ⏳ Waiting for backend to start...");

    while (Date.now() - startTime < maxWait) {
      try {
        const response = await fetch("http://localhost:4000/healthz");
        if (response.ok) {
          console.log("[DB Mode] ✅ Backend is ready");
          return true;
        }
      } catch (err) {
        // Backend not ready yet, continue waiting
      }
      await new Promise((resolve) => setTimeout(resolve, checkInterval));
    }

    console.error("[DB Mode] ❌ Backend did not start in time");
    return false;
  };

  const fetchCamerasFromDB = async () => {
    setLoading(true);
    setError(null);
    console.log("[DB Mode] Checking if backend is ready...");

    // Wait for backend to be ready
    const backendReady = await waitForBackend();

    if (!backendReady) {
      setError("Backend did not start in time. Please refresh the page.");
      setLoading(false);
      return;
    }

    console.log("[DB Mode] Loading cameras from database...");
    try {
      const camerasFromDB = await cameraApi.getCameras();
      console.log(
        `[DB Mode] ✓ Fetched ${camerasFromDB.length} cameras from database`
      );
      setCameras(camerasFromDB);

      // Initialize visibility: all cameras hidden by default in DB mode
      const initialVisibility = {};
      camerasFromDB.forEach((cam) => {
        initialVisibility[cam.id] = false;
      });
      setCameraVisibility(initialVisibility);
    } catch (err) {
      console.error("[DB Mode] ✗ Failed to fetch cameras:", err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const addCamera = useMemo(
    () => async (cam) => {
      if (USE_SEED_DATA) {
        // Seed mode: just update local state
        setCameras((prev) => {
          const maxId =
            prev.length > 0 ? Math.max(...prev.map((c) => c.id)) : 0;
          return [...prev, { id: maxId + 1, ...cam }];
        });
        console.log("[Seed Mode] Added camera locally:", cam.name);
      } else {
        // DB mode: save to database via API
        try {
          console.log("[DB Mode] Creating camera in database:", cam.name);
          const createdCamera = await cameraApi.createCamera(cam);
          console.log("[DB Mode] ✓ Camera created with ID:", createdCamera.id);

          // Add to local state
          setCameras((prev) => [...prev, createdCamera]);

          // Initialize visibility for new camera
          setCameraVisibility((prev) => ({
            ...prev,
            [createdCamera.id]: false,
          }));
        } catch (err) {
          console.error("[DB Mode] ✗ Failed to create camera:");
          console.error(err); // Log full error to console

          // Throw user-friendly error message
          const message = err.message?.includes("Unknown argument")
            ? "Invalid camera data. Please check all fields."
            : "Failed to save camera to database.";
          throw new Error(message);
        }
      }
    },
    []
  );

  const updateCameraStatus = useMemo(
    () => (cameraId, status) => {
      console.log(`[Camera Store] 🔥 Updating status for camera ${cameraId}:`, status);
      setCameraStatuses((prev) => {
        const newStatuses = {
          ...prev,
          [cameraId]: { ...prev[cameraId], ...status },
        };
        console.log(`[Camera Store] 📊 New statuses:`, newStatuses);
        return newStatuses;
      });
    },
    []
  );

  const toggleCameraVisibility = useMemo(
    () => (cameraId) => {
      setCameraVisibility((prev) => {
        const currentVisibility = prev[cameraId] !== false; // true if undefined or true, false if explicitly false
        const newVisibility = !currentVisibility;
        return {
          ...prev,
          [cameraId]: newVisibility,
        };
      });
    },
    []
  );

  const setCameraVisibilities = useMemo(
    () => (visibilityMap) => {
      setCameraVisibility(visibilityMap);
    },
    []
  );

  const setCameraVisibilityById = useMemo(
    () => (cameraId, isVisible) => {
      setCameraVisibility((prev) => ({
        ...prev,
        [cameraId]: isVisible,
      }));
    },
    []
  );

  const resetAllCameraStatuses = useMemo(
    () => () => {
      setCameraStatuses({});
    },
    []
  );

  const deleteCamera = useMemo(
    () => async (cameraId) => {
      if (USE_SEED_DATA) {
        // Seed mode: just update local state
        setCameras((prev) => prev.filter((cam) => cam.id !== cameraId));
        console.log("[Seed Mode] Deleted camera locally:", cameraId);
      } else {
        // DB mode: delete from database via API
        try {
          console.log("[DB Mode] Deleting camera from database:", cameraId);
          await cameraApi.deleteCamera(cameraId);
          console.log("[DB Mode] ✓ Camera deleted successfully");

          // Remove from local state
          setCameras((prev) => prev.filter((cam) => cam.id !== cameraId));

          // Remove from visibility state
          setCameraVisibility((prev) => {
            const newVisibility = { ...prev };
            delete newVisibility[cameraId];
            return newVisibility;
          });

          // Remove from status state
          setCameraStatuses((prev) => {
            const newStatuses = { ...prev };
            delete newStatuses[cameraId];
            return newStatuses;
          });
        } catch (err) {
          console.error("[DB Mode] ✗ Failed to delete camera:", err);
          throw new Error("Failed to delete camera from database.");
        }
      }
    },
    []
  );

  const updateCamera = useMemo(
    () => async (cameraId, updates) => {
      if (USE_SEED_DATA) {
        // Seed mode: just update local state
        setCameras((prev) =>
          prev.map((cam) =>
            cam.id === cameraId ? { ...cam, ...updates } : cam
          )
        );
        console.log("[Seed Mode] Updated camera locally:", cameraId, updates);
      } else {
        // DB mode: update in database via API
        try {
          console.log(
            "[DB Mode] Updating camera in database:",
            cameraId,
            updates
          );
          const updatedCamera = await cameraApi.updateCamera(cameraId, updates);
          console.log("[DB Mode] ✓ Camera updated successfully");

          setCameras((prev) =>
            prev.map((cam) => (cam.id === cameraId ? updatedCamera : cam))
          );
        } catch (err) {
          console.error("[DB mode] ✗ Failed to update camera:", err);
          throw new Error("Failed to update camera in database.");
        }
      }
    },
    []
  );

  const camerasWithStatus = useMemo(
    () => {
      const result = cameras.map((cam) => ({
        ...cam,
        isFire: cameraStatuses[cam.id]?.isFire || false,
        isStreaming: cameraStatuses[cam.id]?.isStreaming || false,
        isVisible: cameraVisibility[cam.id] !== false, // default to true if not set
      }));
      console.log(`[Camera Store] 📹 camerasWithStatus recomputed:`,
        result.map(c => ({ id: c.id, name: c.name, isFire: c.isFire, isStreaming: c.isStreaming }))
      );
      return result;
    },
    [cameras, cameraStatuses, cameraVisibility]
  );

  const value = useMemo(
    () => ({
      cameras: camerasWithStatus,
      addCamera,
      setCameras,
      updateCameraStatus,
      updateCamera,
      toggleCameraVisibility,
      setCameraVisibilities,
      setCameraVisibilityById,
      resetAllCameraStatuses,
      deleteCamera,
      loading,
      error,
      fetchCamerasFromDB,
      mode: USE_SEED_DATA ? "seed" : "db",
    }),
    [
      camerasWithStatus,
      addCamera,
      updateCameraStatus,
      updateCamera,
      toggleCameraVisibility,
      setCameraVisibilities,
      setCameraVisibilityById,
      resetAllCameraStatuses,
      deleteCamera,
      loading,
      error,
    ]
  );

  return <CamerasCtx.Provider value={value}>{children}</CamerasCtx.Provider>;
}

export const useCameras = () => useContext(CamerasCtx);

// Wrap provider around app sections that need it
export function withCamerasProvider(Component) {
  return function Wrapped(props) {
    return (
      <CamerasProvider>
        <Component {...props} />
      </CamerasProvider>
    );
  };
}
