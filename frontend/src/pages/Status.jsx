import React from "react";
import { useCameras } from "../store/cameras.jsx";
import StreamingIcon from "../components/StreamingIcon.jsx";
import FireStatusButton from "../components/FireStatusButton.jsx";
import { FaEye, FaEyeSlash } from "react-icons/fa";

const StatusBadge = ({ label, active, isFire = false }) => {
  const getBadgeStyle = () => {
    if (isFire) {
      return {
        backgroundColor: active ? '#ff6666' : '#6bcf76',
        color: '#ffffff',
        padding: '4px 8px',
        borderRadius: '12px',
        fontSize: '12px',
        fontWeight: '500',
        display: 'inline-block'
      };
    }
    return {
      backgroundColor: active ? '#6bcf76' : '#ff6666',
      color: '#ffffff',
      padding: '4px 8px',
      borderRadius: '12px',
      fontSize: '12px',
      fontWeight: '500',
      display: 'inline-block'
    };
  };

  return (
    <span style={getBadgeStyle()}>
      {active ? "Yes" : "No"}
    </span>
  );
};

const ViewingStatusIcon = ({ isVisible }) => {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      {isVisible ? <FaEye size={16} /> : <FaEyeSlash size={16} />}
    </div>
  );
};

export default function Status() {
  const { cameras } = useCameras();
  
  return (
    <div className="status-page">
      <header className="status-header">
        <h2>Status</h2>
      </header>

      <div className="status-content">
        <div className="status-panel">
          <div className="status-panel-header">
            <h3>Camera Status</h3>
          </div>
          
          <div className="status-table-wrapper">
            <table className="status-table">
                <thead>
                  <tr>
                    <th>Name</th>
                    <th>Location</th>
                    <th>Streaming</th>
                    <th>Fire</th>
                    <th>Viewing</th>
                  </tr>
                </thead>
                <tbody>
                  {cameras.map(c => (
                    <tr key={c.id}>
                      {['name','location'].map((k, i) => (
                        <td key={i}>
                          {c[k]}
                        </td>
                      ))}
                      <td>
                        <StreamingIcon isStreaming={c.isStreaming} size={14} />
                      </td>
                      <td>
                        <FireStatusButton isFire={c.isFire} />
                      </td>
                      <td>
                        <ViewingStatusIcon isVisible={c.isVisible} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
  );
}
