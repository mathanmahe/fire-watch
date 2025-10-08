import React, { useEffect } from "react";
import { useCameras } from "../store/cameras.jsx";
import CameraTile from "./CameraTile.jsx";

export default function SingleCameraView({
  selectedCameraIndex = 0,
  onCameraChange,
}) {
  const { cameras, toggleCameraVisibility } = useCameras();

  if (!cameras || cameras.length === 0) {
    return (
      <div className="single-view-empty">
        <p>No cameras available</p>
      </div>
    );
  }

  const selectedCamera = cameras[selectedCameraIndex] || cameras[0];

  // Ensure the currently selected camera is visible
  useEffect(() => {
    if (selectedCamera && !selectedCamera.isVisible) {
      toggleCameraVisibility(selectedCamera.id);
    }
  }, [selectedCamera, toggleCameraVisibility]);

  const handlePreviousCamera = () => {
    const prevIndex =
      selectedCameraIndex > 0 ? selectedCameraIndex - 1 : cameras.length - 1;

    // Hide current camera if it's visible
    if (selectedCamera && selectedCamera.isVisible) {
      toggleCameraVisibility(selectedCamera.id);
    }

    onCameraChange?.(prevIndex);
  };

  const handleNextCamera = () => {
    const nextIndex =
      selectedCameraIndex < cameras.length - 1 ? selectedCameraIndex + 1 : 0;

    // Hide current camera if it's visible
    if (selectedCamera && selectedCamera.isVisible) {
      toggleCameraVisibility(selectedCamera.id);
    }

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
              <svg
                width="24"
                height="24"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M15 18l-6-6 6-6" />
              </svg>
            </button>
            <div className="camera-page-indicator">
              <span className="page-text">Page</span>
              <span className="page-numbers">
                {selectedCameraIndex + 1} of {cameras.length}
              </span>
            </div>
            <button
              className="nav-btn nav-btn--next"
              onClick={handleNextCamera}
              title="Next Camera"
            >
              <svg
                width="24"
                height="24"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M9 18l6-6-6-6" />
              </svg>
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
