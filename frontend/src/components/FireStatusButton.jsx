import React from "react";

export default function FireStatusButton({ isFire }) {
  return (
    <div className={`fire-status-btn ${isFire ? 'fire' : 'clear'}`}>
      {isFire ? 'Fire' : ''}
    </div>
  );
}
