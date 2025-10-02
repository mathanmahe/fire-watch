import React, { useState } from "react";
import SideNav from "../components/SideNav.jsx";
import CameraGrid from "../components/CameraGrid.jsx";
import SingleCameraView from "../components/SingleCameraView.jsx";
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
  const [viewMode, setViewMode] = useState('grid'); // 'grid' or 'single'
  const [selectedCameraIndex, setSelectedCameraIndex] = useState(0);
  const { cameras } = useCameras();

  const handleNavigate = (page) => {
    setCurrentPage(page);
  };

  const handleViewModeChange = (mode) => {
    setViewMode(mode);
    if (mode === 'single' && cameras.length > 0) {
      setSelectedCameraIndex(0);
    }
  };

  const handleCameraChange = (index) => {
    setSelectedCameraIndex(index);
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
              <div className="view-controls">
                <button 
                  className={`view-btn ${viewMode === 'single' ? 'active' : ''}`}
                  onClick={() => handleViewModeChange('single')}
                  title="Single View"
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                    <rect x="3" y="3" width="18" height="18" rx="2" stroke="currentColor" strokeWidth="2" fill="none"/>
                  </svg>
                </button>
                <button 
                  className={`view-btn ${viewMode === 'grid' ? 'active' : ''}`}
                  onClick={() => handleViewModeChange('grid')}
                  title="Grid View"
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                    <rect x="3" y="3" width="7" height="7" rx="1" stroke="currentColor" strokeWidth="2" fill="none"/>
                    <rect x="14" y="3" width="7" height="7" rx="1" stroke="currentColor" strokeWidth="2" fill="none"/>
                    <rect x="3" y="14" width="7" height="7" rx="1" stroke="currentColor" strokeWidth="2" fill="none"/>
                    <rect x="14" y="14" width="7" height="7" rx="1" stroke="currentColor" strokeWidth="2" fill="none"/>
                  </svg>
                </button>
              </div>
              <button onClick={()=>setShowAdd(true)}>+ Add Camera</button>
            </header>

            <section className={`content ${viewMode === 'single' ? 'content--single' : ''}`}>
              {viewMode === 'grid' ? (
                <CameraGrid />
              ) : (
                <SingleCameraView 
                  selectedCameraIndex={selectedCameraIndex} 
                  onCameraChange={handleCameraChange}
                />
              )}
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

