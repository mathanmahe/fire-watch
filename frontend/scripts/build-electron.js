#!/usr/bin/env node

import { execSync } from "child_process";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";

// Get __dirname equivalent in ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

console.log("🚀 Starting FireWatch Electron build process...");

try {
  // Step 1: Build frontend
  console.log("📦 Building frontend...");
  execSync("npm run build", {
    stdio: "inherit",
    cwd: path.join(__dirname, ".."),
  });
  console.log("✅ Frontend build completed");

  // Step 2: Install backend dependencies
  console.log("📦 Installing backend dependencies...");
  const backendPath = path.join(__dirname, "../../backend");

  // Check if backend directory exists
  if (!fs.existsSync(backendPath)) {
    throw new Error("Backend directory not found at: " + backendPath);
  }

  // Install production dependencies for backend
  execSync("npm install --production", {
    stdio: "inherit",
    cwd: backendPath,
  });
  console.log("✅ Backend dependencies installed");

  // Step 3: Build Electron app
  console.log("📦 Building Electron app...");
  execSync("electron-builder --publish=never", {
    stdio: "inherit",
    cwd: path.join(__dirname, ".."),
  });

  console.log("🎉 FireWatch Electron app build completed successfully!");
  console.log("📁 Output directory: dist-electron/");
} catch (error) {
  console.error("❌ Build failed:", error.message);
  process.exit(1);
}
