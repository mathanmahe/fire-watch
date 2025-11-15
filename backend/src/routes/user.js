import { Router } from "express";
import { dynamodb } from "../db/dynamodb.js";
import { updateSamplingRate } from "../services/detectionQueue.js";
import pino from "pino";

const log = pino({ name: "user-routes" });

export const user = Router();

// Valid sampling rate options (in milliseconds)
const VALID_SAMPLING_RATES = [
  10000,   // 10 seconds
  20000,   // 20 seconds
  30000,   // 30 seconds
  60000,   // 1 minute
  120000,  // 2 minutes
  300000,  // 5 minutes
  600000,  // 10 minutes
];

// Get user settings
user.get("/settings", async (req, res) => {
  try {
    const userId = req.user.sub;

    const userSettings = await dynamodb.getUser(userId);

    if (!userSettings) {
      return res.status(404).json({ error: "User settings not found" });
    }

    log.info({ userId, samplingRate: userSettings.samplingRate }, "User settings retrieved");

    res.json({
      userId: userSettings.userId,
      samplingRate: userSettings.samplingRate,
      createdAt: userSettings.createdAt,
      updatedAt: userSettings.updatedAt,
    });
  } catch (error) {
    log.error({ error: error.message, userId: req.user.sub }, "Failed to get user settings");
    res.status(500).json({ error: "Failed to retrieve user settings" });
  }
});

// Update sampling rate
user.put("/settings/sampling-rate", async (req, res) => {
  try {
    const userId = req.user.sub;
    const { samplingRate } = req.body;

    // Validate sampling rate
    if (!samplingRate || typeof samplingRate !== "number") {
      return res.status(400).json({ error: "Sampling rate must be a number" });
    }

    if (!VALID_SAMPLING_RATES.includes(samplingRate)) {
      return res.status(400).json({
        error: "Invalid sampling rate",
        validOptions: VALID_SAMPLING_RATES,
        message: "Sampling rate must be one of: 10s, 20s, 30s, 1m, 2m, 5m, 10m",
      });
    }

    // Update in database
    const updatedUser = await dynamodb.updateUserSamplingRate(userId, samplingRate);

    // Update detection queue with new sampling rate
    await updateSamplingRate(userId);

    log.info(
      { userId, oldRate: updatedUser.samplingRate, newRate: samplingRate },
      "✅ Sampling rate updated successfully"
    );

    res.json({
      message: "Sampling rate updated successfully",
      userId: updatedUser.userId,
      samplingRate: updatedUser.samplingRate,
      updatedAt: updatedUser.updatedAt,
    });
  } catch (error) {
    log.error(
      { error: error.message, userId: req.user.sub },
      "❌ Failed to update sampling rate"
    );
    res.status(500).json({ error: "Failed to update sampling rate" });
  }
});
