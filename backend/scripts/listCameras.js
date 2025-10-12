import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function listCameras() {
  try {
    const cameras = await prisma.camera.findMany({
      orderBy: { id: "asc" },
    });

    if (cameras.length === 0) {
      console.log("📭 No cameras found in database");
      return;
    }

    console.log(`\n📹 Found ${cameras.length} camera(s):\n`);

    cameras.forEach((cam, index) => {
      console.log(`${index + 1}. ${cam.name} (ID: ${cam.id})`);
      console.log(`   User: ${cam.userId}`);
      console.log(`   Location: ${cam.location || 'N/A'}`);
      console.log(`   Type: ${cam.streamType}`);
      console.log(`   Active: ${cam.isActive ? '✅ Yes' : '❌ No'}`);
      
      if (cam.ip) {
        console.log(`   IP: ${cam.ip}:${cam.port || 554}`);
        console.log(`   Stream: ${cam.streamPath || '/live'}`);
      }
      
      if (cam.hlsUrl) {
        console.log(`   HLS: ${cam.hlsUrl}`);
      }
      
      console.log(`   Stream Name: ${cam.streamName || 'N/A'}`);
      console.log("");
    });

    console.log(`💡 To duplicate a specific camera, use:`);
    console.log(`   node scripts/createTestCameras.js <num> <cameraId>`);
    console.log(`   Example: node scripts/createTestCameras.js 5 ${cameras[0].id}\n`);

  } catch (error) {
    console.error("❌ Error:", error.message);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

listCameras();