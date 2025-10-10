import React, { useState } from "react";
import { useCameras } from "../store/cameras.jsx";

export default function AddCameraDialog({ onClose }) {
  const { addCamera } = useCameras();
  const [form, setForm] = useState({
    name: "",
    location: "",
    ip: "",
    port: "",
    username: "",
    password: "",
    detection: "LOCAL",
    streamType: "WEBRTC",
    hlsUrl: "",
    // webrtcBase and streamName are now auto-populated by the backend
    // webrtcBase:
    //   import.meta.env.VITE_MEDIAMTX_GATEWAY_BASE || "http://127.0.0.1:8889",
    // streamName: "camX",
  });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);

  const onChange = (k, v) => setForm((s) => ({ ...s, [k]: v }));

  async function submit(e) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);

    try {
      await addCamera({
        name: form.name || `cam-${Date.now()}`,
        location: form.location,
        ip: form.ip,
        port: form.port,
        username: form.username,
        password: form.password,
        detection: form.detection,
        streamType: form.streamType,
        hlsUrl: form.hlsUrl,
        // streamName and webrtcBase are now auto-populated by the backend
        // Note: awsEndpoint and cloudFps are NOT in the database schema
        // They are only used in seed mode for local testing
      });
      onClose();
    } catch (err) {
      // Show user-friendly error message
      console.error("Failed to add camera:", err);
      setError("Failed to add camera. Please check the console for details.");
      setSubmitting(false);
    }
  }

  return (
    <div className="add-camera-dialog">
      <h3>Add Camera</h3>
      <form onSubmit={submit} className="form">
        <div className="row">
          <label>Name</label>
          <input
            value={form.name}
            onChange={(e) => onChange("name", e.target.value)}
            required
          />
        </div>
        <div className="row">
          <label>Location</label>
          <input
            value={form.location}
            onChange={(e) => onChange("location", e.target.value)}
          />
        </div>
        <div className="row">
          <label>IP</label>
          <input
            value={form.ip}
            onChange={(e) => onChange("ip", e.target.value)}
          />
        </div>
        <div className="row">
          <label>Port</label>
          <input
            value={form.port}
            onChange={(e) => onChange("port", e.target.value)}
            placeholder="8554"
          />
        </div>
        <div className="row two">
          <div>
            <label>Username</label>
            <input
              value={form.username}
              onChange={(e) => onChange("username", e.target.value)}
            />
          </div>
          <div>
            <label>Password</label>
            <input
              type="password"
              value={form.password}
              onChange={(e) => onChange("password", e.target.value)}
            />
          </div>
        </div>

        {/* <div className="row">
          <label>Detection</label>
          <select
            value={form.detection}
            onChange={(e) => onChange("detection", e.target.value)}
          >
            <option value="local">Local (browser ONNX)</option>
            <option value="cloud">Cloud (AWS endpoint)</option>
          </select>
        </div> */}

        {/* <div className="row">
          <label>Stream Type</label>
          <select
            value={form.streamType}
            onChange={(e) => onChange("streamType", e.target.value)}
          >
            <option value="hls">HLS .m3u8</option>
            <option value="webrtc">WebRTC (WHEP)</option>
            <option value="mp4">MP4</option>
          </select>
        </div> */}

        {/* {form.streamType === "hls" && (
          <div className="row">
            <label>HLS URL</label>
            <input
              placeholder="http://.../cam1.m3u8"
              value={form.hlsUrl}
              onChange={(e) => onChange("hlsUrl", e.target.value)}
            />
          </div>
        )} */}

        {/* WebRTC fields are now auto-populated by the backend */}
        {/* {form.streamType === "WEBRTC" && (
          <>
            <div className="row">
              <label>Gateway Base</label>
              <input
                value={form.webrtcBase}
                onChange={(e) => onChange("webrtcBase", e.target.value)}
              />
            </div>
            <div className="row">
              <label>Path/Name</label>
              <input
                value={form.streamName}
                onChange={(e) => onChange("streamName", e.target.value)}
              />
            </div>
          </>
        )} */}

        {error && (
          <div style={{ color: "red", marginTop: "10px" }}>Error: {error}</div>
        )}

        <div className="actions">
          <button type="button" onClick={onClose} disabled={submitting}>
            Cancel
          </button>
          <button type="submit" disabled={submitting}>
            {submitting ? "Adding..." : "Add"}
          </button>
        </div>
      </form>
    </div>
  );
}
