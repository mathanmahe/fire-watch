import React, { createContext, useContext, useMemo, useState } from "react";

// Seed 10 cameras (5 local, 5 cloud). Edit URLs to match your setup.
const seed = [
  // local in-browser detection (HLS or WebRTC)
  {
    id: "cam-1",
    name: "cam-1",
    location: "Lobby",
    ip: "192.168.1.101",
    port: "8554",
    detection: "local",
    stream: {
      type: "webrtc",
      gatewayBase: import.meta.env.VITE_MEDIAMTX_GATEWAY_BASE,
      name: "cam1",
    },
  },
  {
    id: "cam-2",
    name: "cam-2",
    location: "Dock",
    ip: "192.168.1.102",
    port: "8554",
    detection: "local",
    stream: {
      type: "webrtc",
      gatewayBase: import.meta.env.VITE_MEDIAMTX_GATEWAY_BASE,
      name: "cam2",
    },
  },
  {
    id: "cam-3",
    name: "cam-3",
    location: "Yard",
    ip: "192.168.1.103",
    port: "8554",
    detection: "local",
    stream: {
      type: "webrtc",
      gatewayBase: import.meta.env.VITE_MEDIAMTX_GATEWAY_BASE,
      name: "cam3",
    },
  },
  {
    id: "cam-4",
    name: "cam-4",
    location: "Lab",
    ip: "192.168.1.104",
    port: "8554",
    detection: "local",
    stream: {
      type: "webrtc",
      gatewayBase: import.meta.env.VITE_MEDIAMTX_GATEWAY_BASE,
      name: "cam4",
    },
  },
  {
    id: "cam-5",
    name: "cam-5",
    location: "Warehouse",
    ip: "192.168.1.105",
    port: "8554",
    detection: "local",
    stream: {
      type: "webrtc",
      gatewayBase: import.meta.env.VITE_MEDIAMTX_GATEWAY_BASE,
      name: "cam5",
    },
  },

  // cloud detection (AWS)
  {
    id: "cam-6",
    name: "cam-6",
    location: "North",
    ip: "192.168.1.106",
    port: "8554",
    detection: "cloud",
    stream: {
      type: "webrtc",
      gatewayBase: import.meta.env.VITE_MEDIAMTX_GATEWAY_BASE,
      name: "cam6",
    },
    awsEndpoint: import.meta.env.VITE_AWS_FIRE_ENDPOINT,
    cloudFps: 2,
  },
  {
    id: "cam-7",
    name: "cam-7",
    location: "East",
    ip: "192.168.1.107",
    port: "8554",
    detection: "cloud",
    stream: {
      type: "webrtc",
      gatewayBase: import.meta.env.VITE_MEDIAMTX_GATEWAY_BASE,
      name: "cam7",
    },
    awsEndpoint: import.meta.env.VITE_AWS_FIRE_ENDPOINT,
    cloudFps: 2,
  },
  {
    id: "cam-8",
    name: "cam-8",
    location: "South",
    ip: "192.168.1.108",
    port: "8554",
    detection: "cloud",
    stream: {
      type: "webrtc",
      gatewayBase: import.meta.env.VITE_MEDIAMTX_GATEWAY_BASE,
      name: "cam8",
    },
    awsEndpoint: import.meta.env.VITE_AWS_FIRE_ENDPOINT,
    cloudFps: 2,
  },
  {
    id: "cam-9",
    name: "cam-9",
    location: "West",
    ip: "192.168.1.109",
    port: "8554",
    detection: "cloud",
    stream: {
      type: "webrtc",
      gatewayBase: import.meta.env.VITE_MEDIAMTX_GATEWAY_BASE,
      name: "cam9",
    },
    awsEndpoint: import.meta.env.VITE_AWS_FIRE_ENDPOINT,
    cloudFps: 2,
  },
  {
    id: "cam-10",
    name: "cam-10",
    location: "Roof",
    ip: "192.168.1.110",
    port: "8554",
    detection: "cloud",
    stream: {
      type: "webrtc",
      gatewayBase: import.meta.env.VITE_MEDIAMTX_GATEWAY_BASE,
      name: "cam10",
    },
    awsEndpoint: import.meta.env.VITE_AWS_FIRE_ENDPOINT,
    cloudFps: 2,
  },
];

const CamerasCtx = createContext(null);

export function CamerasProvider({ children }) {
  const [cameras, setCameras] = useState(seed);
  const [cameraStatuses, setCameraStatuses] = useState({});
  const [cameraVisibility, setCameraVisibility] = useState(() => {
    // For local detection testing, only have cam1 visible by default
    return {
      "cam-1": true, // cam1 is visible
      "cam-2": false, // hide cam2
      "cam-3": false, // hide cam3
      "cam-4": false, // hide cam4
      "cam-5": false, // hide cam5
      "cam-6": false, // hide cam6
      "cam-7": false, // hide cam7
      "cam-8": false, // hide cam8
      "cam-9": false, // hide cam9
      "cam-10": false, // hide cam10
    };

    /* 
    // UNCOMMENT BELOW AND COMMENT OUT ABOVE TO SHOW ALL CAMERAS BY DEFAULT
    return {
      "cam-1": true,   // cam1 visible
      "cam-2": true,   // cam2 visible
      "cam-3": true,   // cam3 visible
      "cam-4": true,   // cam4 visible
      "cam-5": true,   // cam5 visible
      "cam-6": true,   // cam6 visible
      "cam-7": true,   // cam7 visible
      "cam-8": true,   // cam8 visible
      "cam-9": true,   // cam9 visible
      "cam-10": true,  // cam9 visible
    };
    */
  });

  const addCamera = useMemo(
    () => (cam) => {
      setCameras((prev) => [
        ...prev,
        { id: cam.name || `cam-${Date.now()}`, ...cam },
      ]);
    },
    []
  );

  const updateCameraStatus = useMemo(
    () => (cameraId, status) => {
      setCameraStatuses((prev) => ({
        ...prev,
        [cameraId]: { ...prev[cameraId], ...status },
      }));
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

  const camerasWithStatus = useMemo(
    () =>
      cameras.map((cam) => ({
        ...cam,
        isFire: cameraStatuses[cam.id]?.isFire || false,
        isStreaming: cameraStatuses[cam.id]?.isStreaming || false,
        isVisible: cameraVisibility[cam.id] !== false, // default to true if not set
      })),
    [cameras, cameraStatuses, cameraVisibility]
  );

  const value = useMemo(
    () => ({
      cameras: camerasWithStatus,
      addCamera,
      setCameras,
      updateCameraStatus,
      toggleCameraVisibility,
      setCameraVisibilities,
    }),
    [
      camerasWithStatus,
      addCamera,
      updateCameraStatus,
      toggleCameraVisibility,
      setCameraVisibilities,
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
