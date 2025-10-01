import { 
  CognitoIdentityProviderClient, 
  InitiateAuthCommand,
  RespondToAuthChallengeCommand 
} from "@aws-sdk/client-cognito-identity-provider";
import crypto from 'crypto';
import 'dotenv/config';

const client = new CognitoIdentityProviderClient({ 
  region: process.env.COGNITO_REGION 
});

function calculateSecretHash(username, clientId, clientSecret) {
  return crypto
    .createHmac('SHA256', clientSecret)
    .update(username + clientId)
    .digest('base64');
}

async function login(username, tempPassword, newPassword) {
  console.log("\nAttempting login...");
  console.log("Username:", username);
  
  const clientSecret = process.env.COGNITO_CLIENT_SECRET;
  const clientId = process.env.COGNITO_CLIENT_ID;
  
  if (!clientSecret) {
    console.error("ERROR: COGNITO_CLIENT_SECRET not found in .env");
    return;
  }
  
  const secretHash = calculateSecretHash(username, clientId, clientSecret);
  
  const command = new InitiateAuthCommand({
    AuthFlow: "USER_PASSWORD_AUTH",
    ClientId: clientId,
    AuthParameters: {
      USERNAME: username,
      PASSWORD: tempPassword,
      SECRET_HASH: secretHash
    },
  });

  try {
    const response = await client.send(command);
    
    // Check if password change is required
    if (response.ChallengeName === "NEW_PASSWORD_REQUIRED") {
      console.log("\nPassword change required. Setting new password...");
      
      const challengeCommand = new RespondToAuthChallengeCommand({
        ChallengeName: "NEW_PASSWORD_REQUIRED",
        ClientId: clientId,
        ChallengeResponses: {
          USERNAME: username,
          PASSWORD: tempPassword,
          NEW_PASSWORD: newPassword,
          SECRET_HASH: secretHash
        },
        Session: response.Session
      });
      
      const challengeResponse = await client.send(challengeCommand);
      
      if (challengeResponse.AuthenticationResult) {
        console.log("\nPassword changed successfully!");
        console.log("\nID Token:");
        console.log(challengeResponse.AuthenticationResult.IdToken);
        console.log("\nAccess Token:");
        console.log(challengeResponse.AuthenticationResult.AccessToken);
        return challengeResponse.AuthenticationResult;
      }
    } else if (response.AuthenticationResult) {
      console.log("\nLogin successful!");
      console.log("\nID Token:");
      console.log(response.AuthenticationResult.IdToken);
      console.log("\nAccess Token:");
      console.log(response.AuthenticationResult.AccessToken);
      return response.AuthenticationResult;
    }
    
  } catch (error) {
    console.error("\nLogin failed!");
    console.error("Error:", error.message);
  }
}

// Update with your credentials
// Format: login(email, temporaryPassword, newPermanentPassword)
login("rakshith911@gmail.com", "MyNewPassword123!", "MyNewPassword123!");