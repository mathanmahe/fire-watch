import React from "react";
import { useCameras } from "../store/cameras.js";

export default function StatusPanel() {
  const { cameras } = useCameras();
  return (
    <aside className="status">
      <div className="status-header">
        <h3>Statuses</h3>
      </div>
      <div className="table-wrap">
        <table className="table">
          <thead>
            <tr>
              <th>Name</th><th>Location</th><th>isStreaming</th><th>isFire</th><th>isView</th>
            </tr>
          </thead>
          <tbody>
            {cameras.map(c => (
              <tr key={c.id}>
                <td>{c.name}</td>
                <td>{c.location}</td>
                <td>{String(c._runtime?.isStreaming ?? true)}</td>
                <td>{String(c._runtime?.isFire ?? false)}</td>
                <td>{String(c._runtime?.isView ?? true)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </aside>
  );
}
