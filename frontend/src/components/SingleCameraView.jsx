import React from "react";
import { useCameras } from "../store/cameras.jsx";
import CameraTile from "./CameraTile.jsx";

export default function SingleCameraView({ selectedCameraIndex = 0, onCameraChange }) {
  const { cameras } = useCameras();
  
  if (!cameras || cameras.length === 0) {
    return (
      <div className="single-view-empty">
        <p>No cameras available</p>
      </div>
    );
  }

  const selectedCamera = cameras[selectedCameraIndex] || cameras[0];

  const handlePreviousCamera = () => {
    const prevIndex = selectedCameraIndex > 0 ? selectedCameraIndex - 1 : cameras.length - 1;
    onCameraChange?.(prevIndex);
  };

  const handleNextCamera = () => {
    const nextIndex = selectedCameraIndex < cameras.length - 1 ? selectedCameraIndex + 1 : 0;
    onCameraChange?.(nextIndex);
  };

  return (
    <div className="single-view">
      <div className="single-view-container">
        <CameraTile cam={selectedCamera} />
        {cameras.length > 1 && (
          <div className="camera-nav">
            <button 
              className="nav-btn nav-btn--prev" 
              onClick={handlePreviousCamera}
              title="Previous Camera"
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                <path d="M15.41 7.41L14 6l-6 6 6 6 1.41-1.41L10.83 12z"/>
              </svg>
            </button>
            <span className="camera-counter">
              {selectedCameraIndex + 1} / {cameras.length}
            </span>
            <button 
              className="nav-btn nav-btn--next" 
              onClick={handleNextCamera}
              title="Next Camera"
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                <path d="M8.59 16.59L10 18l6-6-6-6-1.41 1.41L13.17 12z"/>
              </svg>
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
