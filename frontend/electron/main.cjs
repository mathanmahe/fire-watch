// const { app, BrowserWindow, Menu, ipcMain } = require("electron");
// const path = require("path");
// const isDev = require("electron-is-dev");
// const { spawn } = require("child_process");

// let mainWindow;
// let backendProcess;

// function createWindow() {
//   mainWindow = new BrowserWindow({
//     width: 1400,
//     height: 900,
//     webPreferences: {
//       nodeIntegration: false,
//       contextIsolation: true,
//       enableRemoteModule: false,
//       preload: path.join(__dirname, "preload.cjs"),
//     },
//     icon: path.join(__dirname, "../images/fire_ai_logo.png"),
//     titleBarStyle: "default",
//     show: false,
//   });

//   // Load the React app
//   const startUrl = isDev ? "http://localhost:5173" : "http://localhost:4000";

//   console.log("🔍 Loading URL:", startUrl);
//   mainWindow.loadURL(startUrl);

//   mainWindow.once("ready-to-show", () => {
//     mainWindow.show();
//   });

//   if (isDev) {
//     mainWindow.webContents.openDevTools();
//   }
// }

// function startBackend() {
//   const backendPath = isDev
//     ? path.join(__dirname, "../../backend")
//     : path.join(process.resourcesPath, "backend");

//   const command = isDev ? "npm" : "node";
//   const args = isDev ? ["run", "dev"] : ["src/server.js"];

//   console.log("🔍 Starting backend from:", backendPath);
//   console.log("🔍 Command:", command, args.join(" "));

//   backendProcess = spawn(command, args, {
//     cwd: backendPath,
//     stdio: "inherit",
//     shell: true,
//     env: {
//       ...process.env,
//       NODE_ENV: isDev ? "development" : "production",
//       ELECTRON: "true", // Signal to backend that it's running in Electron
//       PORT: "4000", // Ensure backend uses port 4000
//     },
//   });

//   backendProcess.on("error", (err) => {
//     console.error("Backend process error:", err);
//   });
// }

// app.whenReady().then(() => {
//   createWindow();
//   startBackend();

//   app.on("activate", () => {
//     if (BrowserWindow.getAllWindows().length === 0) {
//       createWindow();
//     }
//   });
// });

// app.on("window-all-closed", () => {
//   if (backendProcess) {
//     backendProcess.kill();
//   }
//   if (process.platform !== "darwin") {
//     app.quit();
//   }
// });

// // Handle backend communication
// ipcMain.handle("get-backend-status", async () => {
//   // Check if backend is running
//   return { running: !!backendProcess };
// });

const { app, BrowserWindow, Menu, ipcMain, shell } = require("electron");
const fs = require("fs");
const path = require("path");
const { spawn } = require("child_process");

// ✅ Logging setup
function ensureDir(p) {
  try {
    fs.mkdirSync(p, { recursive: true });
  } catch {}
}

function logPaths() {
  // Electron exposes a per-app logs dir
  const logsDir = app.getPath("logs"); // e.g. ~/Library/Logs/FireAI
  ensureDir(logsDir);
  return {
    dir: logsDir,
    backend: path.join(logsDir, "backend.log"),
    main: path.join(logsDir, "main.log"),
  };
}

const LOG = logPaths();
const mainLog = fs.createWriteStream(LOG.main, { flags: "a" });
const stamp = () => new Date().toISOString();

// write your main-process logs to file as well
function mlog(...args) {
  const line = `[${stamp()}] [main] ${args
    .map((a) => (typeof a === "string" ? a : JSON.stringify(a)))
    .join(" ")}\n`;
  mainLog.write(line);
  console.log(...args); // still visible in dev tools when running via npm
}

// (optional) add a menu/shortcut to open Logs folder:
function openLogsFolder() {
  shell.openPath(LOG.dir);
}

let mainWindow;
let backendProcess;

// ✅ FIX: Proper dev detection
const isDev = !app.isPackaged;

mlog("🔍 isDev:", isDev);
mlog("🔍 app.isPackaged:", app.isPackaged);

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
    icon: path.join(__dirname, "../dist/fire_ai_logo.png"),
    titleBarStyle: "default",
    show: false,
  });

  // ✅ FIX: Load from file in production, dev server in dev
  if (isDev) {
    mlog("🔍 DEV MODE: Loading URL: http://localhost:5173");
    mainWindow.loadURL("http://localhost:5173");
    mainWindow.webContents.openDevTools();
  } else {
    // ✅ PRODUCTION: Load from built files
    const indexPath = path.join(__dirname, "../dist/index.html");
    mlog("🔍 PRODUCTION MODE: Loading file:", indexPath);
    mainWindow.loadFile(indexPath);

    // ✅ Open DevTools for debugging (remove this later)
    mainWindow.webContents.openDevTools();
  }

  mainWindow.once("ready-to-show", () => {
    mainWindow.show();
  });

  // ✅ Log load failures
  mainWindow.webContents.on(
    "did-fail-load",
    (event, errorCode, errorDescription) => {
      mlog("❌ Failed to load:", errorCode, errorDescription);
    }
  );

  // ✅ Log when page finishes loading
  mainWindow.webContents.on("did-finish-load", () => {
    mlog("✅ Page loaded successfully");
  });
}

function startBackend() {
  const backendPath = isDev
    ? path.join(__dirname, "../../backend")
    : path.join(process.resourcesPath, "backend");

  const command = isDev ? "npm" : process.execPath;
  const serverEntry = path.join(backendPath, "src", "server.js");
  const args = isDev ? ["run", "dev"] : [serverEntry];

  mlog("🔍 Starting backend from:", backendPath);
  mlog("🔍 Command:", command, args.join(" "));

  // ✅ FIX: Build proper PATH with common binary locations
  const systemPaths = [
    "/usr/local/bin",
    "/usr/bin",
    "/bin",
    "/opt/homebrew/bin",
    "/opt/local/bin",
  ];

  const currentPath = process.env.PATH || "";
  const newPath = [...systemPaths, ...currentPath.split(":")]
    .filter(Boolean)
    .join(":");

  backendProcess = spawn(command, args, {
    cwd: backendPath,
    stdio: ["ignore", "pipe", "pipe"],
    shell: false,
    env: {
      ...process.env,
      PATH: newPath, // ✅ This gives backend access to system ffmpeg
      NODE_ENV: isDev ? "development" : "production",
      ELECTRON: "true",
      ELECTRON_RUN_AS_NODE: "1",
      PORT: "4000",
    },
  });

  // Pipe backend output to logs/backend.log
  const backendLog = fs.createWriteStream(LOG.backend, { flags: "a" });
  backendProcess.stdout.on("data", (buf) => {
    backendLog.write(`[${stamp()}] [backend:stdout] ${buf}`);
    console.log("[Backend]", buf.toString().trim());
  });
  backendProcess.stderr.on("data", (buf) => {
    backendLog.write(`[${stamp()}] [backend:stderr] ${buf}`);
    console.error("[Backend Error]", buf.toString().trim());
  });

  backendProcess.on("error", (err) => {
    const line = `[${stamp()}] [backend:error] ${err.stack || err}\n`;
    backendLog.write(line);
    mlog("backend spawn error", err);
  });

  backendProcess.on("exit", (code, signal) => {
    const line = `[${stamp()}] [backend:exit] code=${code} signal=${signal}\n`;
    backendLog.write(line);
    mlog("backend exited", { code, signal });
  });

  mlog("Backend started. Logs:", LOG);
  mlog("Backend PATH:", newPath);
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

app.on("before-quit", () => {
  if (backendProcess) {
    backendProcess.kill();
  }
});

// Handle backend communication
ipcMain.handle("get-backend-status", async () => {
  return { running: !!backendProcess };
});
