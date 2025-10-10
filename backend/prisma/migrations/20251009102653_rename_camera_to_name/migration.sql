-- RenameCameraToName
-- This migration renames the 'camera' column to 'name' in the Camera table
-- and updates the unique constraint accordingly

-- Step 1: Add the new 'name' column
ALTER TABLE "Camera" ADD COLUMN "name" TEXT;

-- Step 2: Copy data from 'camera' to 'name' column
UPDATE "Camera" SET "name" = "camera";

-- Step 3: Make 'name' column NOT NULL
-- Note: SQLite doesn't support ALTER COLUMN, so we need to recreate the table
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;

-- Create new table with 'name' instead of 'camera'
CREATE TABLE "new_Camera" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "location" TEXT,
    "ip" TEXT,
    "username" TEXT,
    "password" TEXT,
    "detection" TEXT NOT NULL DEFAULT 'LOCAL',
    "streamType" TEXT NOT NULL DEFAULT 'WEBRTC',
    "streamName" TEXT,
    "hlsUrl" TEXT,
    "webrtcBase" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- Copy data from old table to new table
INSERT INTO "new_Camera" ("id", "userId", "name", "location", "ip", "username", "password", "detection", "streamType", "streamName", "hlsUrl", "webrtcBase", "isActive", "createdAt", "updatedAt")
SELECT "id", "userId", "name", "location", "ip", "username", "password", "detection", "streamType", "streamName", "hlsUrl", "webrtcBase", "isActive", "createdAt", "updatedAt"
FROM "Camera";

-- Drop old table
DROP TABLE "Camera";

-- Rename new table to original name
ALTER TABLE "new_Camera" RENAME TO "Camera";

-- Recreate indexes
CREATE INDEX "Camera_userId_idx" ON "Camera"("userId");
CREATE UNIQUE INDEX "Camera_userId_name_key" ON "Camera"("userId", "name");

PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
