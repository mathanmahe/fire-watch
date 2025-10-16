const fs = require("fs-extra");
const path = require("path");

async function bundleBackend() {
  const backendSrc = path.join(__dirname, "../../backend");
  const electronBackend = path.join(__dirname, "../electron/backend");

  // Copy backend files
  await fs.copy(backendSrc, electronBackend, {
    filter: (src) => {
      // Exclude node_modules, but include package.json for dependencies
      return !src.includes("node_modules") || src.includes("package.json");
    },
  });

  console.log("Backend bundled for Electron");
}

bundleBackend().catch(console.error);
