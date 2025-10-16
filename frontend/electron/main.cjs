const { app, BrowserWindow, Menu, ipcMain } = require("electron");
const path = require("path");
const isDev = require("electron-is-dev");
const { spawn } = require("child_process");

let mainWindow;
let backendProcess;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      enableRemoteModule: false,
      preload: path.join(__dirname, "preload.cjs"),
    },
    icon: path.join(__dirname, "../images/fire-icon.png"),
    titleBarStyle: "default",
    show: false,
  });

  // Load the React app
  const startUrl = isDev ? "http://localhost:5173" : "http://localhost:4000";

  console.log("🔍 Loading URL:", startUrl);
  mainWindow.loadURL(startUrl);

  mainWindow.once("ready-to-show", () => {
    mainWindow.show();
  });

  if (isDev) {
    mainWindow.webContents.openDevTools();
  }
}

function startBackend() {
  const backendPath = isDev
    ? path.join(__dirname, "../../backend")
    : path.join(process.resourcesPath, "backend");

  const command = isDev ? "npm" : "node";
  const args = isDev ? ["run", "dev"] : ["src/server.js"];

  console.log("🔍 Starting backend from:", backendPath);
  console.log("🔍 Command:", command, args.join(" "));

  backendProcess = spawn(command, args, {
    cwd: backendPath,
    stdio: "inherit",
    shell: true,
    env: {
      ...process.env,
      NODE_ENV: isDev ? "development" : "production",
      ELECTRON: "true", // Signal to backend that it's running in Electron
      PORT: "4000", // Ensure backend uses port 4000
    },
  });

  backendProcess.on("error", (err) => {
    console.error("Backend process error:", err);
  });
}

app.whenReady().then(() => {
  createWindow();
  startBackend();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on("window-all-closed", () => {
  if (backendProcess) {
    backendProcess.kill();
  }
  if (process.platform !== "darwin") {
    app.quit();
  }
});

// Handle backend communication
ipcMain.handle("get-backend-status", async () => {
  // Check if backend is running
  return { running: !!backendProcess };
});
