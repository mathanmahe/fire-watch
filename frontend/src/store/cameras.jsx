// import React, { createContext, useContext, useMemo, useState } from "react";

// // Seed 10 cameras (5 local, 5 cloud). Edit URLs to match your setup.
// const seed = [
//   // local in-browser detection (HLS or WebRTC)
//   {
//     id: "cam-1",
//     name: "cam-1",
//     location: "Lobby",
//     ip: "192.168.1.101",
//     port: "8554",
//     detection: "local",
//     stream: {
//       type: "webrtc",
//       gatewayBase: import.meta.env.VITE_MEDIAMTX_GATEWAY_BASE,
//       name: "cam1",
//     },
//   },
//   {
//     id: "cam-2",
//     name: "cam-2",
//     location: "Dock",
//     ip: "192.168.1.102",
//     port: "8554",
//     detection: "local",
//     stream: {
//       type: "webrtc",
//       gatewayBase: import.meta.env.VITE_MEDIAMTX_GATEWAY_BASE,
//       name: "cam2",
//     },
//   },
//   {
//     id: "cam-3",
//     name: "cam-3",
//     location: "Yard",
//     ip: "192.168.1.103",
//     port: "8554",
//     detection: "local",
//     stream: {
//       type: "webrtc",
//       gatewayBase: import.meta.env.VITE_MEDIAMTX_GATEWAY_BASE,
//       name: "cam3",
//     },
//   },
//   {
//     id: "cam-4",
//     name: "cam-4",
//     location: "Lab",
//     ip: "192.168.1.104",
//     port: "8554",
//     detection: "local",
//     stream: {
//       type: "webrtc",
//       gatewayBase: import.meta.env.VITE_MEDIAMTX_GATEWAY_BASE,
//       name: "cam4",
//     },
//   },
//   {
//     id: "cam-5",
//     name: "cam-5",
//     location: "Warehouse",
//     ip: "192.168.1.105",
//     port: "8554",
//     detection: "local",
//     stream: {
//       type: "webrtc",
//       gatewayBase: import.meta.env.VITE_MEDIAMTX_GATEWAY_BASE,
//       name: "cam5",
//     },
//   },

//   // local detection for testing (cameras 6-7)
//   {
//     id: "cam-6",
//     name: "cam-6",
//     location: "North",
//     ip: "192.168.1.106",
//     port: "8554",
//     detection: "local",
//     stream: {
//       type: "webrtc",
//       gatewayBase: import.meta.env.VITE_MEDIAMTX_GATEWAY_BASE,
//       name: "cam6",
//     },
//   },
//   {
//     id: "cam-7",
//     name: "cam-7",
//     location: "East",
//     ip: "192.168.1.107",
//     port: "8554",
//     detection: "local",
//     stream: {
//       type: "webrtc",
//       gatewayBase: import.meta.env.VITE_MEDIAMTX_GATEWAY_BASE,
//       name: "cam7",
//     },
//   },
//   {
//     id: "cam-8",
//     name: "cam-8",
//     location: "South",
//     ip: "192.168.1.108",
//     port: "8554",
//     detection: "cloud",
//     stream: {
//       type: "webrtc",
//       gatewayBase: import.meta.env.VITE_MEDIAMTX_GATEWAY_BASE,
//       name: "cam8",
//     },
//     awsEndpoint: import.meta.env.VITE_AWS_FIRE_ENDPOINT,
//     cloudFps: 2,
//   },
//   {
//     id: "cam-9",
//     name: "cam-9",
//     location: "West",
//     ip: "192.168.1.109",
//     port: "8554",
//     detection: "cloud",
//     stream: {
//       type: "webrtc",
//       gatewayBase: import.meta.env.VITE_MEDIAMTX_GATEWAY_BASE,
//       name: "cam9",
//     },
//     awsEndpoint: import.meta.env.VITE_AWS_FIRE_ENDPOINT,
//     cloudFps: 2,
//   },
//   {
//     id: "cam-10",
//     name: "cam-10",
//     location: "Roof",
//     ip: "192.168.1.110",
//     port: "8554",
//     detection: "cloud",
//     stream: {
//       type: "webrtc",
//       gatewayBase: import.meta.env.VITE_MEDIAMTX_GATEWAY_BASE,
//       name: "cam10",
//     },
//     awsEndpoint: import.meta.env.VITE_AWS_FIRE_ENDPOINT,
//     cloudFps: 2,
//   },
// ];

// const CamerasCtx = createContext(null);

// export function CamerasProvider({ children }) {
//   const [cameras, setCameras] = useState(seed);
//   const [cameraStatuses, setCameraStatuses] = useState({});
//   const [cameraVisibility, setCameraVisibility] = useState(() => {
//     // For local detection testing, only have cam1 visible by default
//     return {
//       "cam-1": true, // cam1 is visible
//       "cam-2": false, // hide cam2
//       "cam-3": false, // hide cam3
//       "cam-4": false, // hide cam4
//       "cam-5": false, // hide cam5
//       "cam-6": false, // hide cam6
//       "cam-7": false, // hide cam7
//       "cam-8": false, // hide cam8
//       "cam-9": false, // hide cam9
//       "cam-10": false, // hide cam10
//     };

//     /* 
//     // UNCOMMENT BELOW AND COMMENT OUT ABOVE TO SHOW ALL CAMERAS BY DEFAULT
//     return {
//       "cam-1": true,   // cam1 visible
//       "cam-2": true,   // cam2 visible
//       "cam-3": true,   // cam3 visible
//       "cam-4": true,   // cam4 visible
//       "cam-5": true,   // cam5 visible
//       "cam-6": true,   // cam6 visible
//       "cam-7": true,   // cam7 visible
//       "cam-8": true,   // cam8 visible
//       "cam-9": true,   // cam9 visible
//       "cam-10": true,  // cam9 visible
//     };
//     */
//   });

//   const addCamera = useMemo(
//     () => (cam) => {
//       setCameras((prev) => [
//         ...prev,
//         { id: cam.name || `cam-${Date.now()}`, ...cam },
//       ]);
//     },
//     []
//   );

//   const updateCameraStatus = useMemo(
//     () => (cameraId, status) => {
//       setCameraStatuses((prev) => ({
//         ...prev,
//         [cameraId]: { ...prev[cameraId], ...status },
//       }));
//     },
//     []
//   );

//   const toggleCameraVisibility = useMemo(
//     () => (cameraId) => {
//       setCameraVisibility((prev) => {
//         const currentVisibility = prev[cameraId] !== false; // true if undefined or true, false if explicitly false
//         const newVisibility = !currentVisibility;
//         return {
//           ...prev,
//           [cameraId]: newVisibility,
//         };
//       });
//     },
//     []
//   );

//   const setCameraVisibilities = useMemo(
//     () => (visibilityMap) => {
//       setCameraVisibility(visibilityMap);
//     },
//     []
//   );

//   const camerasWithStatus = useMemo(
//     () =>
//       cameras.map((cam) => ({
//         ...cam,
//         isFire: cameraStatuses[cam.id]?.isFire || false,
//         isStreaming: cameraStatuses[cam.id]?.isStreaming || false,
//         isVisible: cameraVisibility[cam.id] !== false, // default to true if not set
//       })),
//     [cameras, cameraStatuses, cameraVisibility]
//   );

//   const value = useMemo(
//     () => ({
//       cameras: camerasWithStatus,
//       addCamera,
//       setCameras,
//       updateCameraStatus,
//       toggleCameraVisibility,
//       setCameraVisibilities,
//     }),
//     [
//       camerasWithStatus,
//       addCamera,
//       updateCameraStatus,
//       toggleCameraVisibility,
//       setCameraVisibilities,
//     ]
//   );

//   return <CamerasCtx.Provider value={value}>{children}</CamerasCtx.Provider>;
// }

// export const useCameras = () => useContext(CamerasCtx);

// // Wrap provider around app sections that need it
// export function withCamerasProvider(Component) {
//   return function Wrapped(props) {
//     return (
//       <CamerasProvider>
//         <Component {...props} />
//       </CamerasProvider>
//     );
//   };
// }

import React, { createContext, useContext, useMemo, useState, useCallback, useEffect } from "react";
import { useFireDetection } from "../websocket/useFireDetection";
import { useAuth } from "../auth/AuthContext";

const CamerasCtx = createContext(null);

export function CamerasProvider({ children }) {
  const { token } = useAuth();
  const [cameras, setCameras] = useState([]);
  const [cameraStatuses, setCameraStatuses] = useState({});
  const [cameraVisibility, setCameraVisibility] = useState({});
  const [loading, setLoading] = useState(true);

  // Fetch cameras from backend on mount
  useEffect(() => {
    async function fetchCameras() {
      if (!token) {
        console.log('No token, skipping camera fetch');
        setLoading(false);
        return;
      }
      
      try {
        console.log('Fetching cameras from backend...');
        const response = await fetch('http://localhost:4000/api/cameras', {
          headers: {
            'Authorization': `Bearer ${token}`
          }
        });
        
        if (response.ok) {
          const backendCameras = await response.json();
          console.log('Fetched cameras from backend:', backendCameras);
          
          // Transform backend cameras to frontend format
          const formattedCameras = backendCameras.map(cam => ({
            id: String(cam.id), // Convert to string for consistency
            name: cam.camera,
            location: cam.location || 'Unknown',
            ip: cam.ip,
            port: cam.ip?.includes(':') ? cam.ip.split(':')[1] : '554',
            detection: cam.detection?.toLowerCase() || 'cloud',
            stream: {
              type: (cam.streamType || 'RTSP').toLowerCase(),
              // For RTSP cameras, we'll build the URL from camera data
              url: cam.streamType === 'RTSP' 
                ? `rtsp://${cam.username}:${cam.password}@${cam.ip}${cam.streamName || ''}`
                : cam.hlsUrl,
              gatewayBase: import.meta.env.VITE_MEDIAMTX_GATEWAY_BASE,
              name: cam.streamName || cam.camera,
            },
            awsEndpoint: import.meta.env.VITE_AWS_FIRE_ENDPOINT,
            cloudFps: 2,
          }));
          
          console.log('Formatted cameras:', formattedCameras);
          setCameras(formattedCameras);
          
          // Initialize visibility (all hidden by default)
          const initialVisibility = {};
          formattedCameras.forEach(cam => {
            initialVisibility[cam.id] = false;
          });
          setCameraVisibility(initialVisibility);
          
        } else {
          console.error('Failed to fetch cameras:', response.status, response.statusText);
        }
      } catch (error) {
        console.error('Error fetching cameras:', error);
      } finally {
        setLoading(false);
      }
    }
    
    fetchCameras();
  }, [token]);

  // Handle fire detection from backend WebSocket
  const handleFireDetected = useCallback((cameraId, cameraName) => {
    console.log(`🔥 FIRE DETECTED on ${cameraName} (Backend ID: ${cameraId})`);
    
    // Convert to string to match frontend camera IDs
    const frontendCameraId = String(cameraId);
    
    // Check if camera exists
    const camera = cameras.find(cam => cam.id === frontendCameraId);
    if (!camera) {
      console.error(`Camera ${frontendCameraId} not found in frontend cameras`);
      console.log('Available cameras:', cameras.map(c => ({ id: c.id, name: c.name })));
      return;
    }
    
    console.log(`Found camera: ${camera.name}`);
    console.log(`Setting isVisible=true for camera ${frontendCameraId}`);
    
    // Set camera visibility to true - this will make it appear in the grid
    setCameraVisibility((prev) => {
      const updated = {
        ...prev,
        [frontendCameraId]: true,
      };
      console.log('Updated visibility:', updated);
      return updated;
    });

    // Update fire status
    setCameraStatuses((prev) => ({
      ...prev,
      [frontendCameraId]: {
        ...prev[frontendCameraId],
        isFire: true,
      },
    }));

    // Show browser notification
    if ('Notification' in window && Notification.permission === 'granted') {
      new Notification('🔥 Fire Detected!', {
        body: `Fire detected on ${cameraName}`,
        icon: '/fire-icon.png',
      });
    }

    // Play alert sound (optional)
    try {
      const audio = new Audio('/alert.mp3');
      audio.play().catch(e => console.log('Could not play alert sound:', e));
    } catch (e) {
      console.log('Alert sound not available');
    }
  }, [cameras]);

  // Connect to WebSocket for fire detection
  useFireDetection({
    token,
    onFireDetected: handleFireDetected,
  });

  // Request notification permission on mount
  useEffect(() => {
    if ('Notification' in window && Notification.permission === 'default') {
      Notification.requestPermission().then(permission => {
        console.log('Notification permission:', permission);
      });
    }
  }, []);

  const addCamera = useCallback((cam) => {
    setCameras((prev) => [
      ...prev,
      { id: cam.id || String(Date.now()), ...cam },
    ]);
  }, []);

  const updateCameraStatus = useCallback((cameraId, status) => {
    setCameraStatuses((prev) => ({
      ...prev,
      [cameraId]: { ...prev[cameraId], ...status },
    }));
  }, []);

  const toggleCameraVisibility = useCallback((cameraId) => {
    setCameraVisibility((prev) => {
      const currentVisibility = prev[cameraId] !== false;
      const newVisibility = !currentVisibility;
      console.log(`Toggling camera ${cameraId}: ${currentVisibility} → ${newVisibility}`);
      return {
        ...prev,
        [cameraId]: newVisibility,
      };
    });
  }, []);

  const setCameraVisibilities = useCallback((visibilityMap) => {
    console.log('Setting camera visibilities:', visibilityMap);
    setCameraVisibility(visibilityMap);
  }, []);

  const camerasWithStatus = useMemo(
    () =>
      cameras.map((cam) => ({
        ...cam,
        isFire: cameraStatuses[cam.id]?.isFire || false,
        isStreaming: cameraStatuses[cam.id]?.isStreaming || false,
        isVisible: cameraVisibility[cam.id] === true, // Only visible if explicitly set to true
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
      loading,
    }),
    [
      camerasWithStatus,
      addCamera,
      updateCameraStatus,
      toggleCameraVisibility,
      setCameraVisibilities,
      loading,
    ]
  );

  return <CamerasCtx.Provider value={value}>{children}</CamerasCtx.Provider>;
}

export const useCameras = () => useContext(CamerasCtx);

export function withCamerasProvider(Component) {
  return function Wrapped(props) {
    return (
      <CamerasProvider>
        <Component {...props} />
      </CamerasProvider>
    );
  };
}