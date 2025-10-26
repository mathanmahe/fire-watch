import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import pino from "pino";

const log = pino({ name: "s3-service" });

const s3Client = new S3Client({
  region: process.env.AWS_REGION || "us-east-1",
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  },
});

const S3_BUCKET = process.env.S3_BUCKET || "fire-alert-frames";

export async function uploadFireFrame(cameraId, imageBuffer) {
  try {
    const now = new Date();
    const datePath = now.toISOString().split("T")[0]; // YYYY-MM-DD
    const timeStr = now
      .toISOString()
      .replace(/[:.]/g, "-")
      .split("T")[1]
      .split(".")[0]; // HH-MM-SS
    const s3Key = `${cameraId}/${datePath}/frame_${timeStr}.jpg`;

    const command = new PutObjectCommand({
      Bucket: S3_BUCKET,
      Key: s3Key,
      Body: imageBuffer,
      ContentType: "image/jpeg",
    });

    await s3Client.send(command);

    const imageUrl = `https://${S3_BUCKET}.s3.amazonaws.com/${s3Key}`;

    log.info({ cameraId, s3Key, imageUrl }, "✅ Fire frame uploaded to S3");
    return imageUrl;
  } catch (error) {
    log.error(
      { cameraId, error: error.message },
      "❌ Failed to upload frame to S3"
    );
    throw error;
  }
}
