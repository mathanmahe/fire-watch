import { getValidToken } from './test-auto-refresh.js';

async function apiCall(method, path, body = null) {
  const token = await getValidToken();
  const url = `http://localhost:4000${path}`;
  
  const options = {
    method,
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    }
  };
  
  if (body) {
    options.body = JSON.stringify(body);
  }
  
  const response = await fetch(url, options);
  const data = await response.json();
  
  console.log(`${method} ${path}:`, JSON.stringify(data, null, 2));
  return data;
}

// Examples
async function main() {
  // List cameras
  await apiCall('GET', '/api/cameras');
  
  // Add camera
  // await apiCall('POST', '/api/cameras', {
  //   camera: "New Camera",
  //   location: "Office",
  //   detection: "CLOUD",
  //   streamType: "HLS"
  // });
  
  // Delete camera
  // await apiCall('DELETE', '/api/cameras/1');
}

main();