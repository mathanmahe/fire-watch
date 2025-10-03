import React from "react";
import { useCameras } from "../store/cameras.jsx";
import CameraTile from "./CameraTile.jsx";

export default function CameraGrid() {
  const { cameras } = useCameras();
  
  // Filter cameras to only show visible ones
  const visibleCameras = cameras.filter(cam => cam.isVisible);
  
  return (
    <div className="grid">
      {visibleCameras.map((cam) => (
        <CameraTile key={cam.id} cam={cam} />
      ))}
    </div>
  );
}
