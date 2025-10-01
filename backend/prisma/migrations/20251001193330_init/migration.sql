-- CreateTable
CREATE TABLE "Camera" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
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

-- CreateTable
CREATE TABLE "Detection" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "cameraId" INTEGER NOT NULL,
    "ts" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "isFire" BOOLEAN NOT NULL,
    "score" REAL,
    "boxesJson" TEXT,
    CONSTRAINT "Detection_cameraId_fkey" FOREIGN KEY ("cameraId") REFERENCES "Camera" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "Camera_camera_key" ON "Camera"("camera");

-- CreateIndex
CREATE INDEX "Detection_cameraId_ts_idx" ON "Detection"("cameraId", "ts");

-- CreateIndex
CREATE INDEX "Detection_ts_idx" ON "Detection"("ts");
