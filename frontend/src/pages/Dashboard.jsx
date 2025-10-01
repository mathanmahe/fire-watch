import React, { useState } from "react";
import SideNav from "../components/SideNav.jsx";
import CameraGrid from "../components/CameraGrid.jsx";
import StatusPanel from "../components/StatusPanel.jsx";
import AddCameraDialog from "../components/AddCameraDialog.jsx";
import { useAuth } from "../auth/AuthContext.jsx";
import { useCameras } from "../store/cameras.js";
// add below imports
import { withCamerasProvider } from "../store/cameras.js";



function Dashboard() {
  const { logout } = useAuth();
  const [showAdd, setShowAdd] = useState(false);
  const { cameras } = useCameras();

  return (
    <div className="shell">
      <SideNav onAddCamera={()=>setShowAdd(true)} onLogout={logout} />
      <main className="main">
        <header className="toolbar">
          <h2>Design All Hands 🔥🧯</h2>
          <div className="grow" />
          <button onClick={()=>setShowAdd(true)}>+ Add Camera</button>
        </header>

        <section className="content">
          <CameraGrid />
          <StatusPanel />
        </section>
      </main>

      {showAdd && <AddCameraDialog onClose={()=>setShowAdd(false)} />}
    </div>
  );
}

export default withCamerasProvider(Dashboard);

