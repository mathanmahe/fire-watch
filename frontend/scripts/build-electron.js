const { execSync } = require("child_process");
const path = require("path");

async function buildElectron() {
  console.log("Building React app...");
  execSync("npm run build", { stdio: "inherit" });

  console.log("Bundling backend...");
  execSync("node scripts/bundle-backend.js", { stdio: "inherit" });

  console.log("Building Electron app...");
  execSync("npm run electron-pack", { stdio: "inherit" });

  console.log("Build complete!");
}

buildElectron().catch(console.error);
