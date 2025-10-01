import React from "react";

export default function SideNav({ onAddCamera, onLogout }) {
  return (
    <aside className="sidenav">
      <div className="brand">FireWatch</div>
      <nav>
        <a className="active">Video</a>
        <a>Chats</a>
        <a>Schedule</a>
        <a>Settings</a>
      </nav>
      <div className="sidenav-footer">
        <button onClick={onAddCamera}>+ Add Camera</button>
        <button onClick={onLogout}>Sign out</button>
      </div>
    </aside>
  );
}
