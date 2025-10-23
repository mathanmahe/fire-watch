import React from "react";
import { useCameras } from "../store/cameras.jsx";
import CameraTile from "./CameraTile.jsx";
import { CSSTransition, TransitionGroup } from "react-transition-group";

export default function CameraGrid() {
  const { cameras } = useCameras();

  // Filter cameras to only show visible ones
  const visibleCameras = cameras.filter(cam => cam.isVisible);

  return (
    <div className="grid">
      <TransitionGroup component={null}>
        {visibleCameras.map((cam) => {
          const nodeRef = React.createRef();
          return (
            <CSSTransition
              key={cam.id}
              timeout={300}
              classNames="tile-transition"
              nodeRef={nodeRef}
            >
              <div ref={nodeRef} className="tile-wrapper">
                <CameraTile cam={cam} />
              </div>
            </CSSTransition>
          );
        })}
      </TransitionGroup>
    </div>
  );
}
