-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Camera" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "location" TEXT,
    "ip" TEXT,
    "port" TEXT,
    "username" TEXT,
    "password" TEXT,
    "detection" TEXT NOT NULL DEFAULT 'CLOUD',
    "streamType" TEXT NOT NULL DEFAULT 'WEBRTC',
    "streamName" TEXT,
    "streamPath" TEXT,
    "hlsUrl" TEXT,
    "webrtcBase" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);
INSERT INTO "new_Camera" ("createdAt", "detection", "hlsUrl", "id", "ip", "isActive", "location", "name", "password", "port", "streamName", "streamType", "updatedAt", "userId", "username", "webrtcBase") SELECT "createdAt", "detection", "hlsUrl", "id", "ip", "isActive", "location", "name", "password", "port", "streamName", "streamType", "updatedAt", "userId", "username", "webrtcBase" FROM "Camera";
DROP TABLE "Camera";
ALTER TABLE "new_Camera" RENAME TO "Camera";
CREATE INDEX "Camera_userId_idx" ON "Camera"("userId");
CREATE UNIQUE INDEX "Camera_userId_name_key" ON "Camera"("userId", "name");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
