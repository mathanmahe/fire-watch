// const API_BASE = import.meta.env.VITE_API_BASE || "http://localhost:4000";

import { getBackendUrl } from "../config/electron.js";

const API_BASE = getBackendUrl();
class CameraApiService {
  constructor() {
    this.token = null;
  }

  setToken(token) {
    this.token = token;
  }

  clearToken() {
    this.token = null;
  }

  async request(endPoint, options = {}) {
    const url = `${API_BASE}${endPoint}`;

    const config = {
      headers: {
        "Content-Type": "application/json",
        ...(this.token && { Authorization: `Bearer ${this.token}` }),
        ...options.headers,
      },
      ...options,
    };

    const response = await fetch(url, config);

    if (!response.ok) {
      const error = await response
        .json()
        .catch(() => ({ error: "Request failed" }));
      throw new Error(error.error || `HTTP ${response.status}`);
    }

    return response.json();
  }

  async getCameras() {
    return this.request("/api/cameras");
  }

  async createCamera(cameraData) {
    return this.request("/api/cameras", {
      method: "POST",
      body: JSON.stringify(cameraData),
    });
  }

  async updateCamera(id, cameraData) {
    return this.request(`/api/cameras/${id}`, {
      method: "PUT",
      body: JSON.stringify(cameraData),
    });
  }

  async deleteCamera(id) {
    return this.request(`/api/cameras/${id}`, {
      method: "DELETE",
    });
  }

  async stopDetectionForAllCameras(cameraIds) {
    return this.request("/api/cameras/stop-detection", {
      method: "POST",
      body: JSON.stringify({ cameraIds }),
    });
  }

  async startDetectionForAllCameras(cameraIds) {
    return this.request("/api/cameras/start-detection", {
      method: "POST",
      body: JSON.stringify({ cameraIds }),
    });
  }
}

export const cameraApi = new CameraApiService();
