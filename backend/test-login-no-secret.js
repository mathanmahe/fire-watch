import {
  CognitoIdentityProviderClient,
  AdminInitiateAuthCommand,
  AdminRespondToAuthChallengeCommand,
} from "@aws-sdk/client-cognito-identity-provider";
import "dotenv/config";

const client = new CognitoIdentityProviderClient({
  region: process.env.COGNITO_REGION,
});

async function login(username, tempPassword, newPassword) {
  console.log("\nAttempting login (no secret hash)...");
  console.log("Username:", username);

  const clientId = process.env.COGNITO_CLIENT_ID;
  const userPoolId = process.env.COGNITO_USER_POOL_ID;

  if (!clientId) {
    console.error("ERROR: COGNITO_CLIENT_ID not found in .env");
    return;
  }

  if (!userPoolId) {
    console.error("ERROR: COGNITO_USER_POOL_ID not found in .env");
    return;
  }

  const command = new AdminInitiateAuthCommand({
    AuthFlow: "ADMIN_USER_PASSWORD_AUTH", // Changed from ADMIN_NO_SRP_AUTH
    UserPoolId: userPoolId,
    ClientId: clientId,
    AuthParameters: {
      USERNAME: username,
      PASSWORD: tempPassword,
    },
  });

  try {
    const response = await client.send(command);

    // Check if password change is required
    if (response.ChallengeName === "NEW_PASSWORD_REQUIRED") {
      console.log("\nPassword change required. Setting new password...");

      const challengeCommand = new AdminRespondToAuthChallengeCommand({
        ChallengeName: "NEW_PASSWORD_REQUIRED",
        UserPoolId: userPoolId,
        ClientId: clientId,
        ChallengeResponses: {
          USERNAME: username,
          PASSWORD: tempPassword,
          NEW_PASSWORD: newPassword,
          // No SECRET_HASH parameter needed
        },
        Session: response.Session,
      });

      const challengeResponse = await client.send(challengeCommand);

      if (challengeResponse.AuthenticationResult) {
        console.log("\nPassword changed successfully!");
        console.log("\nID Token:");
        console.log(challengeResponse.AuthenticationResult.IdToken);
        console.log("\nAccess Token:");
        console.log(challengeResponse.AuthenticationResult.AccessToken);
        console.log("\nRefresh Token:");
        console.log(challengeResponse.AuthenticationResult.RefreshToken);
        return challengeResponse.AuthenticationResult;
      }
    } else if (response.AuthenticationResult) {
      console.log("\nLogin successful!");
      console.log("\nID Token:");
      console.log(response.AuthenticationResult.IdToken);
      console.log("\nAccess Token:");
      console.log(response.AuthenticationResult.AccessToken);
      console.log("\nRefresh Token:");
      console.log(response.AuthenticationResult.RefreshToken);
      return response.AuthenticationResult;
    }
  } catch (error) {
    console.error("\nLogin failed!");
    console.error("Error:", error.message);
    console.error("Error code:", error.name);

    // Additional error details for debugging
    if (error.$metadata) {
      console.error("Request ID:", error.$metadata.requestId);
    }
  }
}

let username = "username";
let tempPassword = "tempPassword";
let newPassword = "newPassword";
login(username, tempPassword, newPassword);
