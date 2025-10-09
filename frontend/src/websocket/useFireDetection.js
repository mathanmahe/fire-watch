import { useEffect, useRef } from 'react';

export function useFireDetection({ onFireDetected, token }) {
  const ws = useRef(null);
  const reconnectTimeout = useRef(null);

  useEffect(() => {
    if (!token) {
      console.log('No token provided, WebSocket not connecting');
      return;
    }

    const connect = () => {
      // Connect to backend WebSocket
      const wsUrl = `ws://localhost:4000?token=${token}`;
      console.log('Connecting to WebSocket...');
      ws.current = new WebSocket(wsUrl);

      ws.current.onopen = () => {
        console.log('🔥 Fire detection WebSocket connected');
      };

      ws.current.onmessage = (event) => {
        const data = JSON.parse(event.data);
        console.log('WebSocket message received:', data);
        
        // Handle fire detection events
        if (data.type === 'fire-detection') {
          console.log(`Fire status for camera ${data.cameraId}: ${data.isFire}`);
          
          if (data.isFire && onFireDetected) {
            console.log('🔥 FIRE DETECTED - Calling onFireDetected');
            onFireDetected(data.cameraId, data.cameraName);
          }
        }
      };

      ws.current.onerror = (error) => {
        console.error('WebSocket error:', error);
      };

      ws.current.onclose = () => {
        console.log('WebSocket disconnected, will reconnect in 3s...');
        
        // Auto-reconnect after 3 seconds
        reconnectTimeout.current = setTimeout(() => {
          console.log('Reconnecting WebSocket...');
          connect();
        }, 3000);
      };
    };

    connect();

    // Cleanup
    return () => {
      console.log('Cleaning up WebSocket connection');
      if (reconnectTimeout.current) {
        clearTimeout(reconnectTimeout.current);
      }
      if (ws.current) {
        ws.current.close();
      }
    };
  }, [token, onFireDetected]);
}