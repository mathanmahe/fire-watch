import React from "react";
// document.documentElement.setAttribute('data-theme', isDark ? 'dark' : 'light');
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
      <button className="theme-toggle" aria-label="Toggle dark mode">🌙</button>
      

      <div className="sidenav-footer">
        <button onClick={onLogout}>Sign out</button>
      </div>
    </aside>
  );
}
