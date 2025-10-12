import { PrismaClient } from "@prisma/client";
import readline from "readline";

const prisma = new PrismaClient();

function askQuestion(query) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => rl.question(query, (ans) => { rl.close(); resolve(ans.trim()); }));
}

async function createTestCameras() {
  const numCameras = process.argv[2] ? parseInt(process.argv[2]) : 5;

  try {
    const cameras = await prisma.camera.findMany({
      where: { isActive: true },
      orderBy: { id: "asc" },
    });

    if (cameras.length === 0) {
      console.error("❌ No active cameras found.");
      process.exit(1);
    }

    console.log("\n📋 Available Active Cameras:");
    cameras.forEach((cam) => {
      console.log(`[${cam.id}] ${cam.name} | Stream=${cam.streamName} | IP=${cam.ip || "N/A"}`);
    });

    const input = await askQuestion("\n👉 Enter source camera ID: ");
    const sourceCameraId = parseInt(input);

    const sourceCamera = cameras.find((c) => c.id === sourceCameraId);
    if (!sourceCamera) {
      console.error(`❌ Camera with ID ${sourceCameraId} not found.`);
      process.exit(1);
    }

    console.log(`\n📹 Source camera: ${sourceCamera.name} (ID: ${sourceCamera.id})`);

    // ensure it has a group key
    let sourceGroupKey = sourceCamera.sourceGroupKey;
    if (!sourceGroupKey) {
      sourceGroupKey = `SRC-${sourceCamera.id}`;
      await prisma.camera.update({
        where: { id: sourceCamera.id },
        data: { sourceGroupKey },
      });
      console.log(`🔗 Assigned group key '${sourceGroupKey}'`);
    }

    const createdCameras = [];
    console.log(`\n🎥 Creating ${numCameras} duplicate test cameras...\n`);

    for (let i = 1; i <= numCameras; i++) {
      const { id, name, createdAt, updatedAt, ...config } = sourceCamera;

      const camera = await prisma.camera.create({
        data: {
          ...config,
          name: `TestCamera${i}`,
          location: config.location ? `${config.location} (Test ${i})` : `Test Location ${i}`,
          streamName: sourceCamera.streamName, // ✅ same working stream
          sourceGroupKey,                      // ✅ link for replication
          isActive: true,
        },
      });

      createdCameras.push(camera);
      console.log(`✅ Created: ${camera.name} (ID: ${camera.id})`);
    }

    console.log(`\n🎉 Created ${numCameras} test cameras`);
    console.log(`📊 Group Key: ${sourceGroupKey}`);
    console.log(`💡 Detection will now replicate across this group\n`);
  } catch (error) {
    console.error("❌ Error:", error.message);
  } finally {
    await prisma.$disconnect();
  }
}

createTestCameras();
