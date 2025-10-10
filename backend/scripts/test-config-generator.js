#!/usr/bin/env node

/**
 * Test script for MediaMTX config generator
 * Usage: node scripts/test-config-generator.js
 */

import { generateMediaMTXConfig, detectServerIP } from "../src/services/mediamtxConfigGenerator.js";
import { prisma } from "../src/db/prisma.js";
import fs from "node:fs/promises";
import path from "node:path";

async function testConfigGenerator() {
  console.log("🧪 Testing MediaMTX Config Generator\n");

  try {
    // 1. Show current server IP detection
    console.log("1️⃣  Detecting server IP...");
    const serverIP = detectServerIP();
    console.log(`   ✅ Server IP: ${serverIP}\n`);

    // 2. Show cameras in database
    console.log("2️⃣  Fetching cameras from database...");
    const cameras = await prisma.camera.findMany({
      where: { isActive: true },
      orderBy: { id: "asc" },
    });
    console.log(`   ✅ Found ${cameras.length} active cameras:`);
    cameras.forEach((cam, idx) => {
      console.log(`      ${idx + 1}. ${cam.name} (${cam.streamType})`);
      if (cam.ip) {
        console.log(`         RTSP: ${cam.ip}:${cam.port || 554}`);
      }
    });
    console.log("");

    // 3. Generate config
    console.log("3️⃣  Generating MediaMTX config...");
    const result = await generateMediaMTXConfig();
    console.log(`   ✅ Config generated successfully`);
    console.log(`      Path: ${result.configPath}`);
    console.log(`      Cameras: ${result.camerasCount}`);
    console.log(`      Server IP: ${result.serverIP}\n`);

    // 4. Read and display generated config
    console.log("4️⃣  Generated config preview:\n");
    const configPath = path.resolve(process.cwd(), "mediamtx.yml");
    const configContent = await fs.readFile(configPath, "utf8");

    // Show first 50 lines
    const lines = configContent.split("\n");
    const preview = lines.slice(0, 50).join("\n");
    console.log("─".repeat(60));
    console.log(preview);
    if (lines.length > 50) {
      console.log(`\n... (${lines.length - 50} more lines)`);
    }
    console.log("─".repeat(60));
    console.log("");

    console.log("✅ Test completed successfully!\n");

  } catch (error) {
    console.error("❌ Test failed:", error.message);
    console.error(error.stack);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

testConfigGenerator();
