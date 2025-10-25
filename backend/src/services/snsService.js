import {
  SNSClient,
  PublishCommand,
  ListSubscriptionsByTopicCommand,
} from "@aws-sdk/client-sns";
import pino from "pino";

const log = pino({ name: "sns-service" });

const snsClient = new SNSClient({
  region: process.env.AWS_REGION || "us-east-1",
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  },
});

const SNS_TOPIC_ARN = process.env.SNS_TOPIC_ARN;

// -------------------------------------------------------------------
// 📝 Note: Users are pre-subscribed via standalone script
// -------------------------------------------------------------------
// Users must be subscribed using:
//   node scripts/subscribe_cognito_user.js <email> <userId>
//
// This sets up SNS filtering so each user only receives alerts
// for their own userId (from MessageAttributes)

// -------------------------------------------------------------------
// 🔥 Send Fire Alert to User's Email (with filtering)
// -------------------------------------------------------------------
export async function sendFireAlert(
  userId,
  cameraId,
  cameraName,
  detectionResult,
  imageUrl = null
) {
  try {
    // ✅ User is pre-subscribed via standalone script
    // ✅ SNS filtering ensures only the target userId receives the notification

    const message = `
  🔥 Fire detected from ${cameraName} (${cameraId})!

  Detection Details:
  - Camera: ${cameraName}
  - Confidence: ${detectionResult.confidence?.toFixed(2) || "N/A"}
  - Fire Count: ${detectionResult.fireCount || 0}
  - Smoke Count: ${detectionResult.smokeCount || 0}
  - Timestamp: ${new Date().toISOString()}

  ${imageUrl ? `Image: ${imageUrl}` : ""}

  Detection Boxes:
  ${JSON.stringify(detectionResult.boxes || [], null, 2)}
      `.trim();

    const command = new PublishCommand({
      TopicArn: SNS_TOPIC_ARN,
      Subject: `🔥 Fire Alert - ${cameraName}`,
      Message: message,
      MessageAttributes: {
        userId: {
          DataType: "String",
          StringValue: userId,
        },
        cameraId: {
          DataType: "String",
          StringValue: cameraId,
        },
      },
    });

    const result = await snsClient.send(command);
    log.info(
      {
        userId,
        cameraId,
        messageId: result.MessageId,
      },
      "✅ SNS fire alert sent"
    );

    return result;
  } catch (error) {
    log.error(
      {
        userId,
        cameraId,
        error: error.message,
      },
      "❌ Failed to send SNS alert"
    );
    throw error;
  }
}

// -------------------------------------------------------------------
// 📋 List Current Subscriptions (for debugging)
// -------------------------------------------------------------------
export async function listSubscriptions() {
  try {
    const command = new ListSubscriptionsByTopicCommand({
      TopicArn: SNS_TOPIC_ARN,
    });

    const result = await snsClient.send(command);
    log.info(
      {
        subscriptions: result.Subscriptions?.length || 0,
      },
      "📋 Current SNS subscriptions"
    );

    return result.Subscriptions || [];
  } catch (error) {
    log.error({ error: error.message }, "❌ Failed to list subscriptions");
    throw error;
  }
}
