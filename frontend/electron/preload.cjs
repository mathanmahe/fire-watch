const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("electronAPI", {
  getBackendStatus: () => ipcRenderer.invoke("get-backend-status"),
  platform: process.platform,
  versions: process.versions,
});
