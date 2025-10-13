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
      console.log(`[${cam.id}] ${cam.name} | User=${cam.userId.slice(0, 8)}... | IP=${cam.ip || "N/A"}`);
    });

    const input = await askQuestion("\n👉 Enter source camera ID: ");
    const sourceCameraId = parseInt(input);

    const sourceCamera = cameras.find((c) => c.id === sourceCameraId);
    if (!sourceCamera) {
      console.error(`❌ Camera with ID ${sourceCameraId} not found.`);
      process.exit(1);
    }

    console.log(`\n📹 Source camera: ${sourceCamera.name} (ID: ${sourceCamera.id})`);
    console.log(`   User: ${sourceCamera.userId}`);
    console.log(`   IP: ${sourceCamera.ip}`);
    console.log(`   Stream Type: ${sourceCamera.streamType}`);
    console.log(`   Stream Path: ${sourceCamera.streamPath}`);

    const createdCameras = [];
    console.log(`\n🎥 Creating ${numCameras} duplicate test cameras...\n`);

    for (let i = 1; i <= numCameras; i++) {
      const { id, name, streamName, createdAt, updatedAt, ...config } = sourceCamera;

      const camera = await prisma.camera.create({
        data: {
          ...config,
          name: `TestCamera${i}`,
          location: config.location ? `${config.location} (Test ${i})` : `Test Location ${i}`,
          streamName: `testcamera${i}`, // ✅ UNIQUE stream name for each test camera
          isActive: true,
        },
      });

      createdCameras.push(camera);
      console.log(`✅ Created: ${camera.name} (ID: ${camera.id}, Stream: ${camera.streamName})`);
    }

    console.log(`\n🎉 Created ${numCameras} test cameras`);
    console.log(`\n📊 Summary:`);
    console.log(`   Source: ${sourceCamera.name} (${sourceCamera.streamName})`);
    console.log(`   Duplicates: ${createdCameras.map(c => c.streamName).join(', ')}`);
    console.log(`   All point to: ${sourceCamera.ip}:${sourceCamera.port}${sourceCamera.streamPath}`);
    console.log(`\n💡 When fire detected, each will create separate MediaMTX stream:`);
    createdCameras.forEach(c => {
      console.log(`   - http://192.168.1.196:8888/${c.streamName}/index.m3u8`);
    });
    console.log(`\n🧹 To delete: node scripts/deleteTestCameras.js\n`);
  } catch (error) {
    console.error("❌ Error:", error.message);
  } finally {
    await prisma.$disconnect();
  }
}

createTestCameras();