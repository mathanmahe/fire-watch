/*
  Warnings:

  - Added the required column `userId` to the `Camera` table without a default value. This is not possible if the table is not empty.

*/
-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Camera" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "userId" TEXT NOT NULL,
    "camera" TEXT NOT NULL,
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
INSERT INTO "new_Camera" ("camera", "createdAt", "detection", "hlsUrl", "id", "ip", "isActive", "location", "password", "streamName", "streamType", "updatedAt", "username", "webrtcBase") SELECT "camera", "createdAt", "detection", "hlsUrl", "id", "ip", "isActive", "location", "password", "streamName", "streamType", "updatedAt", "username", "webrtcBase" FROM "Camera";
DROP TABLE "Camera";
ALTER TABLE "new_Camera" RENAME TO "Camera";
CREATE INDEX "Camera_userId_idx" ON "Camera"("userId");
CREATE UNIQUE INDEX "Camera_userId_camera_key" ON "Camera"("userId", "camera");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
