import React, { useState } from "react";
import { useCameras } from "../store/cameras.jsx";

export default function AddCameraDialog({ onClose }) {
  const { addCamera } = useCameras();
  const [form, setForm] = useState({
    name: "",
    location: "",
    ip: "",
    username: "",
    password: "",
    detection: "local",
    streamType: "hls",
    hlsUrl: "",
    webrtcGateway:
      import.meta.env.VITE_MEDIAMTX_GATEWAY_BASE || "http://127.0.0.1:8889",
    webrtcName: "camX",
  });

  const onChange = (k, v) => setForm((s) => ({ ...s, [k]: v }));

  function submit(e) {
    e.preventDefault();
    const stream =
      form.streamType === "webrtc"
        ? {
            type: "webrtc",
            gatewayBase: form.webrtcGateway,
            name: form.webrtcName,
          }
        : { type: "hls", url: form.hlsUrl };
    addCamera({
      name: form.name || `cam-${Date.now()}`,
      location: form.location,
      ip: form.ip,
      username: form.username,
      password: form.password,
      detection: form.detection,
      stream,
      awsEndpoint: import.meta.env.VITE_AWS_FIRE_ENDPOINT,
    });
    onClose();
  }

  return (
    <div className="modal">
      <div className="modal-card">
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

          <div className="row">
            <label>Detection</label>
            <select
              value={form.detection}
              onChange={(e) => onChange("detection", e.target.value)}
            >
              <option value="local">Local (browser ONNX)</option>
              <option value="cloud">Cloud (AWS endpoint)</option>
            </select>
          </div>

          <div className="row">
            <label>Stream Type</label>
            <select
              value={form.streamType}
              onChange={(e) => onChange("streamType", e.target.value)}
            >
              <option value="hls">HLS .m3u8</option>
              <option value="webrtc">WebRTC (WHEP)</option>
              <option value="mp4">MP4</option>
            </select>
          </div>

          {form.streamType === "hls" && (
            <div className="row">
              <label>HLS URL</label>
              <input
                placeholder="http://.../cam1.m3u8"
                value={form.hlsUrl}
                onChange={(e) => onChange("hlsUrl", e.target.value)}
              />
            </div>
          )}

          {form.streamType === "webrtc" && (
            <>
              <div className="row">
                <label>Gateway Base</label>
                <input
                  value={form.webrtcGateway}
                  onChange={(e) => onChange("webrtcGateway", e.target.value)}
                />
              </div>
              <div className="row">
                <label>Path/Name</label>
                <input
                  value={form.webrtcName}
                  onChange={(e) => onChange("webrtcName", e.target.value)}
                />
              </div>
            </>
          )}

          <div className="actions">
            <button type="button" onClick={onClose}>
              Cancel
            </button>
            <button type="submit">Add</button>
          </div>
        </form>
      </div>
    </div>
  );
}
