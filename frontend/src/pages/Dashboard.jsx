import React, { useState } from "react";
import SideNav from "../components/SideNav.jsx";
import CameraGrid from "../components/CameraGrid.jsx";
import AddCameraDialog from "../components/AddCameraDialog.jsx";
import Status from "./Status.jsx";
import { useAuth } from "../auth/AuthContext.jsx";
import { useCameras } from "../store/cameras.jsx";
// add below imports
import { withCamerasProvider } from "../store/cameras.jsx";



function Dashboard() {
  const { logout } = useAuth();
  const [showAdd, setShowAdd] = useState(false);
  const [currentPage, setCurrentPage] = useState('video');
  const { cameras } = useCameras();

  const handleNavigate = (page) => {
    setCurrentPage(page);
  };

  return (
    <div className="shell">
      <SideNav 
        onNavigate={handleNavigate} 
        onLogout={logout} 
        currentPage={currentPage}
      />
      <main className="main">
        {currentPage === 'video' ? (
          <>
            <header className="toolbar">
              <h2>Streams 🔥🧯</h2>
              <div className="grow" />
              <button onClick={()=>setShowAdd(true)}>+ Add Camera</button>
            </header>

            <section className="content">
              <CameraGrid />
            </section>
          </>
        ) : (
          <Status />
        )}
      </main>

      {showAdd && <AddCameraDialog onClose={()=>setShowAdd(false)} />}
    </div>
  );
}

export default withCamerasProvider(Dashboard);

