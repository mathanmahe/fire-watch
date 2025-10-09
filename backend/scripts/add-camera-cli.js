import readline from "readline";
import { prisma } from "../src/db/prisma.js";
import { getValidToken } from "../test-auto-refresh.js";
import { CognitoJwtVerifier } from "aws-jwt-verify";
import { cfg } from "../src/config.js";
import "dotenv/config";

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

function question(prompt) {
  return new Promise((resolve) => rl.question(prompt, resolve));
}

async function getUserFromToken(token) {
  const verifier = CognitoJwtVerifier.create({
    userPoolId: cfg.cognito.poolId,
    tokenUse: "id",
    clientId: cfg.cognito.clientId,
  });

  const payload = await verifier.verify(token);
  return { sub: payload.sub, email: payload.email };
}

async function apiCall(token, method, path, body = null) {
  const url = `http://localhost:${cfg.port}${path}`;

  const options = {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
  };

  if (body) {
    options.body = JSON.stringify(body);
  }

  const response = await fetch(url, options);

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || "API call failed");
  }

  return response.json();
}

async function listCameras(token) {
  const cameras = await apiCall(token, "GET", "/api/cameras");

  if (cameras.length === 0) {
    console.log("\nNo cameras found. Add a camera first.\n");
    return cameras;
  }

  console.log("\nYour Cameras:");
  cameras.forEach((cam) => {
    console.log(`  ${cam.id}. ${cam.name} - ${cam.location}`);
  });
  console.log("");

  return cameras;
}

async function addCamera(userId) {
  console.log("\n--- Add New Camera ---\n");

  const cameraName = await question("Camera Name: ");
  const location = await question("Location: ");
  const ip = await question("Camera IP (e.g., 192.168.1.201): ");
  const port = await question("Camera Port (e.g., 554): ");
  const username = await question("Username: ");
  const password = await question("Password: ");

  console.log("\nSaving camera...");

  try {
    await prisma.camera.create({
      data: {
        userId: userId,
        name: cameraName,
        location: location,
        ip: ip,
        port: port,
        username: username,
        password: password,
        streamType: "RTSP",
        streamName: "/h264Preview_01_main",
        detection: "CLOUD",
        isActive: true,
      },
    });

    console.log(`\nCamera "${cameraName}" added successfully!\n`);
  } catch (error) {
    if (error.code === "P2002") {
      console.log(`\nCamera "${cameraName}" already exists.\n`);
    } else {
      console.log("\nFailed to add camera:", error.message, "\n");
    }
  }
}

async function startDetection(token) {
  const cameras = await listCameras(token);

  if (cameras.length === 0) return;

  const choice = await question(
    "Start detection for:\n  1. All cameras\n  2. Select specific cameras\nChoice: "
  );

  let cameraIds = [];

  if (choice === "1") {
    cameraIds = cameras.map((c) => c.id);
  } else if (choice === "2") {
    const input = await question(
      "Enter camera IDs (comma-separated, e.g., 1,3,5): "
    );
    cameraIds = input
      .split(",")
      .map((id) => parseInt(id.trim()))
      .filter((id) => !isNaN(id));

    if (cameraIds.length === 0) {
      console.log("\nNo valid camera IDs entered.\n");
      return;
    }
  } else {
    console.log("\nInvalid choice.\n");
    return;
  }

  console.log("\nStarting fire detection...");

  try {
    const result = await apiCall(
      token,
      "POST",
      "/api/cameras/start-detection",
      { cameraIds }
    );

    console.log(`\n${result.message}`);

    if (result.started.length > 0) {
      console.log("\nStarted:");
      result.started.forEach((cam) =>
        console.log(`  - ${cam.name} (ID: ${cam.id})`)
      );
    }

    if (result.failed && result.failed.length > 0) {
      console.log("\nFailed:");
      result.failed.forEach((cam) =>
        console.log(`  - ${cam.name} (ID: ${cam.id}): ${cam.error}`)
      );
    }

    console.log(
      "\nDetection running in background. Check server logs for status.\n"
    );
  } catch (error) {
    console.log("\nFailed to start detection:", error.message, "\n");
  }
}

async function stopDetection(token) {
  const cameras = await listCameras(token);

  if (cameras.length === 0) return;

  const choice = await question(
    "Stop detection for:\n  1. All cameras\n  2. Select specific cameras\nChoice: "
  );

  let cameraIds = [];

  if (choice === "1") {
    cameraIds = cameras.map((c) => c.id);
  } else if (choice === "2") {
    const input = await question("Enter camera IDs (comma-separated): ");
    cameraIds = input
      .split(",")
      .map((id) => parseInt(id.trim()))
      .filter((id) => !isNaN(id));

    if (cameraIds.length === 0) {
      console.log("\nNo valid camera IDs entered.\n");
      return;
    }
  } else {
    console.log("\nInvalid choice.\n");
    return;
  }

  console.log("\nStopping fire detection...");

  try {
    const result = await apiCall(token, "POST", "/api/cameras/stop-detection", {
      cameraIds,
    });

    console.log(`\n${result.message}`);

    if (result.stopped.length > 0) {
      console.log("\nStopped:");
      result.stopped.forEach((cam) =>
        console.log(`  - ${cam.name} (ID: ${cam.id})`)
      );
    }

    console.log("");
  } catch (error) {
    console.log("\nFailed to stop detection:", error.message, "\n");
  }
}

async function showStatus(token) {
  try {
    const status = await apiCall(token, "GET", "/api/cameras/detection-status");

    console.log("\nDetection Status:");
    status.forEach((cam) => {
      const running = cam.isRunning ? "RUNNING" : "STOPPED";
      console.log(`  ${cam.id}. ${cam.name} - ${cam.location} [${running}]`);
    });
    console.log("");
  } catch (error) {
    console.log("\nFailed to get status:", error.message, "\n");
  }
}

async function showMenu(user, token) {
  console.log(`\nLogged in as: ${user.email}`);
  console.log("\n--- Fire Watch Menu ---");
  console.log("1. Add new camera");
  console.log("2. List cameras");
  console.log("3. Start fire detection");
  console.log("4. Stop fire detection");
  console.log("5. Detection status");
  console.log("6. Exit\n");

  const choice = await question("Select option: ");

  switch (choice) {
    case "1":
      await addCamera(user.sub);
      return true;
    case "2":
      await listCameras(token);
      return true;
    case "3":
      await startDetection(token);
      return true;
    case "4":
      await stopDetection(token);
      return true;
    case "5":
      await showStatus(token);
      return true;
    case "6":
      return false;
    default:
      console.log("\nInvalid choice.\n");
      return true;
  }
}

async function main() {
  console.log("\n=== Fire Watch ===\n");

  const token = await getValidToken();
  const user = await getUserFromToken(token);

  let continueMenu = true;

  while (continueMenu) {
    continueMenu = await showMenu(user, token);
  }

  console.log("\nGoodbye!\n");
  rl.close();
  await prisma.$disconnect();
}

main().catch(console.error);
