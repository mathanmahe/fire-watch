import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function deleteTestCameras() {
  try {
    console.log("🔍 Finding test cameras...\n");

    // Find all test cameras
    const testCameras = await prisma.camera.findMany({
      where: {
        name: {
          startsWith: "TestCamera",
        },
      },
      orderBy: { id: "asc" },
    });

    if (testCameras.length === 0) {
      console.log("✅ No test cameras found");
      return;
    }

    console.log(`Found ${testCameras.length} test cameras:`);
    testCameras.forEach((cam) => {
      console.log(`   - ${cam.name} (ID: ${cam.id})`);
    });

    console.log("\n🗑️  Deleting test cameras...");

    const result = await prisma.camera.deleteMany({
      where: {
        name: {
          startsWith: "TestCamera",
        },
      },
    });

    console.log(`\n✅ Deleted ${result.count} test cameras`);
  } catch (error) {
    console.error("❌ Error:", error.message);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

deleteTestCameras();