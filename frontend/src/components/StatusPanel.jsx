import React from "react";
import { useCameras } from "../store/cameras.jsx";

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

export default function StatusPanel() {
  const { cameras } = useCameras();
  return (
    <div style={{ 
      width: '100%', 
      height: '100%', 
      padding: '20px', 
      overflow: 'hidden',
      display: 'flex',
      flexDirection: 'column',
      boxSizing: 'border-box',
      minHeight: 0
    }}>
      <div style={{ 
        flex: 1, 
        overflow: 'auto',
        width: '100%',
        boxSizing: 'border-box',
        minHeight: 0
      }}>
<table
  style={{
    width: '100%',
    borderCollapse: 'collapse',
    fontSize: '14px',
    tableLayout: 'fixed'         // <<< important: prevents content from forcing column widths
  }}
>
  <thead>
    <tr>
      <th style={{ textAlign: 'left', borderBottom: '1px solid #202531', padding: '12px 16px', color: '#96a0ad', fontWeight: 600, /* remove minWidth */ whiteSpace: 'nowrap' }}>Name</th>
      <th style={{ textAlign: 'left', borderBottom: '1px solid #202531', padding: '12px 16px', color: '#96a0ad', fontWeight: 600, whiteSpace: 'nowrap' }}>Location</th>
      <th style={{ textAlign: 'left', borderBottom: '1px solid #202531', padding: '12px 16px', color: '#96a0ad', fontWeight: 600, whiteSpace: 'nowrap' }}>Streaming</th>
      <th style={{ textAlign: 'left', borderBottom: '1px solid #202531', padding: '12px 16px', color: '#96a0ad', fontWeight: 600, whiteSpace: 'nowrap' }}>Fire</th>
      <th style={{ textAlign: 'left', borderBottom: '1px solid #202531', padding: '12px 16px', color: '#96a0ad', fontWeight: 600, whiteSpace: 'nowrap' }}>Viewing</th>
    </tr>
  </thead>
  <tbody>
    {cameras.map(c => (
      <tr key={c.id}>
        {['name','location'].map((k, i) => (
          <td
            key={i}
            style={{
              textAlign: 'left',
              borderBottom: '1px solid #202531',
              padding: '12px 16px',
              color: '#d5d9e0',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap'   // keeps a compact row without pushing width
            }}
          >
            {c[k]}
          </td>
        ))}
        <td style={{ textAlign: 'left', borderBottom: '1px solid #202531', padding: '12px 16px', color: '#d5d9e0' }}>
          <StatusBadge active={c._runtime?.isStreaming ?? true} />
        </td>
        <td style={{ textAlign: 'left', borderBottom: '1px solid #202531', padding: '12px 16px', color: '#d5d9e0' }}>
          <StatusBadge active={c._runtime?.isFire ?? false} isFire />
        </td>
        <td style={{ textAlign: 'left', borderBottom: '1px solid #202531', padding: '12px 16px', color: '#d5d9e0' }}>
          <StatusBadge active={c._runtime?.isView ?? true} />
        </td>
      </tr>
    ))}
  </tbody>
</table>
      </div>
    </div>
  );
}
