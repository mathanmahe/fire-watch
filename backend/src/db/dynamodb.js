import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, PutCommand, GetCommand, UpdateCommand, DeleteCommand, QueryCommand, ScanCommand } from "@aws-sdk/lib-dynamodb";
import pino from "pino";

const log = pino({ name: "dynamodb" });

// Create DynamoDB client
const client = new DynamoDBClient({
  region: process.env.AWS_REGION || "us-east-1",
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  },
});

// Create Document client for easier operations
const docClient = DynamoDBDocumentClient.from(client);

const CAMERAS_TABLE = process.env.DYNAMODB_CAMERAS_TABLE || "FireWatch-Cameras";
const USERS_TABLE = process.env.DYNAMODB_USERS_TABLE || "FireWatch-Users";

// ===================================================================
// USERS OPERATIONS
// ===================================================================

/**
 * Get user settings (including sampling rate)
 */
export async function getUser(userId) {
  try {
    const result = await docClient.send(new GetCommand({
      TableName: USERS_TABLE,
      Key: { userId },
    }));

    return result.Item || null;
  } catch (error) {
    log.error({ error: error.message, userId }, "Failed to get user");
    throw error;
  }
}

/**
 * Create user with default settings
 */
export async function createUser(userId, defaultSamplingRate = 30000) {
  const item = {
    userId,
    samplingRate: defaultSamplingRate,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  try {
    await docClient.send(new PutCommand({
      TableName: USERS_TABLE,
      Item: item,
    }));

    log.info({ userId, samplingRate: defaultSamplingRate }, "User created with default settings");
    return item;
  } catch (error) {
    log.error({ error: error.message, userId }, "Failed to create user");
    throw error;
  }
}

/**
 * Get user or create if doesn't exist (ensures user always exists)
 */
export async function ensureUser(userId, defaultSamplingRate = 30000) {
  try {
    let user = await getUser(userId);

    if (!user) {
      log.info({ userId }, "User not found, creating with defaults");
      user = await createUser(userId, defaultSamplingRate);
    } else {
      log.info({ userId, samplingRate: user.samplingRate }, "User found");
    }

    return user;
  } catch (error) {
    log.error({ error: error.message, userId }, "Failed to ensure user");
    throw error;
  }
}

/**
 * Update user sampling rate
 */
export async function updateUserSamplingRate(userId, samplingRate) {
  try {
    const result = await docClient.send(new UpdateCommand({
      TableName: USERS_TABLE,
      Key: { userId },
      UpdateExpression: "SET samplingRate = :samplingRate, updatedAt = :updatedAt",
      ExpressionAttributeValues: {
        ":samplingRate": samplingRate,
        ":updatedAt": new Date().toISOString(),
      },
      ReturnValues: "ALL_NEW",
    }));

    log.info({ userId, samplingRate }, "User sampling rate updated");
    return result.Attributes;
  } catch (error) {
    log.error({ error: error.message, userId, samplingRate }, "Failed to update sampling rate");
    throw error;
  }
}

/**
 * Get user's sampling rate (returns default if user doesn't exist)
 */
export async function getUserSamplingRate(userId, defaultSamplingRate = 30000) {
  try {
    const user = await getUser(userId);
    return user?.samplingRate || defaultSamplingRate;
  } catch (error) {
    log.error({ error: error.message, userId }, "Failed to get user sampling rate");
    return defaultSamplingRate; // Return default on error
  }
}

// ===================================================================
// ID COUNTER - Get next numeric ID
// ===================================================================
async function getNextCameraId(userId) {
  // Use current timestamp as ID (unique enough)
  return Date.now();
}

// ===================================================================
// CAMERA OPERATIONS
// ===================================================================

/**
 * Create a new camera
 */
export async function createCamera(userId, cameraData) {
  const id = await getNextCameraId(userId);
  
  const item = {
    userId,
    id,  // ✅ Numeric ID
    ...cameraData,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  try {
    await docClient.send(new PutCommand({
      TableName: CAMERAS_TABLE,
      Item: item,
    }));

    log.info({ userId, id }, "Camera created");
    return item;
  } catch (error) {
    log.error({ error: error.message, userId }, "Failed to create camera");
    throw error;
  }
}

/**
 * Get all cameras for a user
 */
export async function getCamerasByUserId(userId) {
  try {
    const result = await docClient.send(new QueryCommand({
      TableName: CAMERAS_TABLE,
      KeyConditionExpression: "userId = :userId",
      ExpressionAttributeValues: {
        ":userId": userId,
      },
    }));

    log.info({ userId, count: result.Items?.length || 0 }, "Cameras retrieved");
    return result.Items || [];
  } catch (error) {
    log.error({ error: error.message, userId }, "Failed to get cameras");
    throw error;
  }
}

/**
 * Get single camera
 */
export async function getCamera(userId, id) {
  try {
    const result = await docClient.send(new GetCommand({
      TableName: CAMERAS_TABLE,
      Key: { userId, id },
    }));

    if (!result.Item) {
      throw new Error("Camera not found");
    }

    return result.Item;
  } catch (error) {
    log.error({ error: error.message, userId, id }, "Failed to get camera");
    throw error;
  }
}

/**
 * Update camera
 */
export async function updateCamera(userId, id, updates) {
  try {
    // Build update expression
    const updateExpressions = [];
    const expressionAttributeNames = {};
    const expressionAttributeValues = {};

    Object.keys(updates).forEach((key) => {
      updateExpressions.push(`#${key} = :${key}`);
      expressionAttributeNames[`#${key}`] = key;
      expressionAttributeValues[`:${key}`] = updates[key];
    });

    // Always update updatedAt
    updateExpressions.push(`#updatedAt = :updatedAt`);
    expressionAttributeNames['#updatedAt'] = 'updatedAt';
    expressionAttributeValues[':updatedAt'] = new Date().toISOString();

    const result = await docClient.send(new UpdateCommand({
      TableName: CAMERAS_TABLE,
      Key: { 
        userId: userId,
        id: Number(id)  // ✅ Must be number
      },
      UpdateExpression: `SET ${updateExpressions.join(', ')}`,
      ExpressionAttributeNames: expressionAttributeNames,
      ExpressionAttributeValues: expressionAttributeValues,
      ReturnValues: "ALL_NEW",
    }));

    log.info({ userId, id }, "Camera updated");
    return result.Attributes;
  } catch (error) {
    log.error({ error: error.message, userId, id }, "Failed to update camera");
    throw error;
  }
}

/**
 * Delete camera
 */
export async function deleteCamera(userId, id) {
  try {
    await docClient.send(new DeleteCommand({
      TableName: CAMERAS_TABLE,
      Key: { 
        userId: userId,  // ✅ Partition key
        id: Number(id)   // ✅ Sort key (must be number)
      },
    }));

    log.info({ userId, id }, "Camera deleted");
    return true;
  } catch (error) {
    log.error({ error: error.message, userId, id }, "Failed to delete camera");
    throw error;
  }
}

/**
 * Get active cameras for a user
 */
export async function getActiveCameras(userId) {
  try {
    const result = await docClient.send(new QueryCommand({
      TableName: CAMERAS_TABLE,
      KeyConditionExpression: "userId = :userId",
      FilterExpression: "isActive = :isActive",
      ExpressionAttributeValues: {
        ":userId": userId,
        ":isActive": true,
      },
    }));

    log.info({ userId, count: result.Items?.length || 0 }, "Active cameras retrieved");
    return result.Items || [];
  } catch (error) {
    log.error({ error: error.message, userId }, "Failed to get active cameras");
    throw error;
  }
}

/**
 * Get cameras by IDs
 */
export async function getCamerasByIds(userId, cameraIds) {
  try {
    const cameras = [];
    
    // ✅ Filter out invalid IDs
    const validIds = cameraIds.filter(id => !isNaN(id) && id !== null && id !== undefined);
    
    if (validIds.length === 0) {
      log.warn({ userId }, "No valid camera IDs provided");
      return [];
    }
    
    for (const id of validIds) {
      try {
        const camera = await getCamera(userId, Number(id));
        cameras.push(camera);
      } catch (error) {
        log.warn({ userId, id }, "Camera not found in batch get");
      }
    }

    log.info({ userId, count: cameras.length }, "Cameras retrieved by IDs");
    return cameras;
  } catch (error) {
    log.error({ error: error.message, userId }, "Failed to get cameras by IDs");
    throw error;
  }
}

export const dynamodb = {
  // User operations
  getUser,
  createUser,
  ensureUser,
  updateUserSamplingRate,
  getUserSamplingRate,

  // Camera operations
  createCamera,
  getCamerasByUserId,
  getCamera,
  updateCamera,
  deleteCamera,
  getActiveCameras,
  getCamerasByIds,
};