import React from "react";
import { useCameras } from "../store/cameras.js";
import CameraTile from "./CameraTile.jsx";

export default function CameraGrid() {
  const { cameras } = useCameras();
  return (
    <div className="grid">
      {cameras.map((cam) => (
        <CameraTile key={cam.id} cam={cam} />
      ))}
    </div>
  );
}
