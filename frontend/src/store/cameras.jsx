import React, { createContext, useContext, useMemo, useState } from "react";

// Seed 10 cameras (5 local, 5 cloud). Edit URLs to match your setup.
const seed = [
  // local in-browser detection (HLS or WebRTC)
  { id: "cam-1",  name: "cam-1",  location: "Lobby",   detection: "local", stream: { type: "webrtc", gatewayBase: "http://127.0.0.1:8889", name: "cam1" } },
  { id: "cam-2",  name: "cam-2",  location: "Dock",    detection: "local", stream: { type: "webrtc", gatewayBase: "http://127.0.0.1:8889", name: "cam2" } },
  { id: "cam-3",  name: "cam-3",  location: "Yard",    detection: "local", stream: { type: "webrtc", gatewayBase: "http://127.0.0.1:8889", name: "cam3" } },
  { id: "cam-4",  name: "cam-4",  location: "Lab",     detection: "local", stream: { type: "webrtc", gatewayBase: "http://127.0.0.1:8889", name: "cam4" } },
  { id: "cam-5",  name: "cam-5",  location: "Warehouse", detection: "local", stream: { type: "webrtc", gatewayBase: "http://127.0.0.1:8889", name: "cam5" } },

  // cloud detection (AWS)
  { id: "cam-6",  name: "cam-6",  location: "North",   detection: "cloud", stream: { type: "webrtc", gatewayBase: "http://127.0.0.1:8889", name: "cam6" }, awsEndpoint: import.meta.env.VITE_AWS_FIRE_ENDPOINT, cloudFps: 2 },
  { id: "cam-7",  name: "cam-7",  location: "East",    detection: "cloud", stream: { type: "webrtc", gatewayBase: "http://127.0.0.1:8889", name: "cam7" }, awsEndpoint: import.meta.env.VITE_AWS_FIRE_ENDPOINT, cloudFps: 2 },
  { id: "cam-8",  name: "cam-8",  location: "South",   detection: "cloud", stream: { type: "webrtc", gatewayBase: "http://127.0.0.1:8889", name: "cam8" }, awsEndpoint: import.meta.env.VITE_AWS_FIRE_ENDPOINT, cloudFps: 2 },
  { id: "cam-9",  name: "cam-9",  location: "West",    detection: "cloud", stream: { type: "webrtc", gatewayBase: "http://127.0.0.1:8889", name: "cam9" }, awsEndpoint: import.meta.env.VITE_AWS_FIRE_ENDPOINT, cloudFps: 2 },
  { id: "cam-10", name: "cam-10", location: "Roof",    detection: "cloud", stream: { type: "webrtc", gatewayBase: "http://127.0.0.1:8889", name: "cam10"}, awsEndpoint: import.meta.env.VITE_AWS_FIRE_ENDPOINT, cloudFps: 2 }
];

const CamerasCtx = createContext(null);

export function CamerasProvider({ children }) {
  const [cameras, setCameras] = useState(seed);

  function addCamera(cam) {
    setCameras(prev => [...prev, { id: cam.name || `cam-${Date.now()}`, ...cam }]);
  }

  const value = useMemo(() => ({ cameras, addCamera, setCameras }), [cameras]);
  return <CamerasCtx.Provider value={value}>{children}</CamerasCtx.Provider>;
}

export const useCameras = () => useContext(CamerasCtx);

// Wrap provider around app sections that need it
export function withCamerasProvider(Component) {
  return function Wrapped(props) {
    return <CamerasProvider><Component {...props} /></CamerasProvider>;
  };
}
