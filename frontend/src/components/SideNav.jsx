import React from "react";

export default function SideNav({ onNavigate, onLogout, currentPage }) {
  return (
    <aside className="sidenav">
      <div className="brand">FireWatch</div>
      <nav>
        <a 
          className={currentPage === 'video' ? 'active' : ''} 
          onClick={() => onNavigate('video')}
        >
          Video
        </a>
        <a 
          className={currentPage === 'status' ? 'active' : ''} 
          onClick={() => onNavigate('status')}
        >
          Status
        </a>
      </nav>
      <div className="sidenav-footer">
        <button onClick={onLogout}>Sign out</button>
      </div>
    </aside>
  );
}
