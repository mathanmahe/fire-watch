import { 
  CognitoIdentityProviderClient, 
  InitiateAuthCommand,
  RespondToAuthChallengeCommand 
} from "@aws-sdk/client-cognito-identity-provider";
import crypto from 'crypto';
import readline from 'readline';
import 'dotenv/config';
import fs from 'fs';

const client = new CognitoIdentityProviderClient({ 
  region: process.env.COGNITO_REGION 
});

const TOKEN_FILE = '.tokens.json';

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

function question(prompt) {
  return new Promise((resolve) => rl.question(prompt, resolve));
}

function calculateSecretHash(username, clientId, clientSecret) {
  return crypto
    .createHmac('SHA256', clientSecret)
    .update(username + clientId)
    .digest('base64');
}

async function login(username, password) {
  const clientSecret = process.env.COGNITO_CLIENT_SECRET;
  const clientId = process.env.COGNITO_CLIENT_ID;
  
  if (!clientSecret) {
    throw new Error("COGNITO_CLIENT_SECRET not found in .env");
  }
  
  const secretHash = calculateSecretHash(username, clientId, clientSecret);
  
  const command = new InitiateAuthCommand({
    AuthFlow: "USER_PASSWORD_AUTH",
    ClientId: clientId,
    AuthParameters: {
      USERNAME: username,
      PASSWORD: password,
      SECRET_HASH: secretHash
    },
  });

  try {
    const response = await client.send(command);
    
    // Handle password change challenge
    if (response.ChallengeName === "NEW_PASSWORD_REQUIRED") {
      console.log("\nPassword change required.");
      const newPassword = await question("Enter new password: ");
      
      const challengeCommand = new RespondToAuthChallengeCommand({
        ChallengeName: "NEW_PASSWORD_REQUIRED",
        ClientId: clientId,
        ChallengeResponses: {
          USERNAME: username,
          PASSWORD: password,
          NEW_PASSWORD: newPassword,
          SECRET_HASH: secretHash
        },
        Session: response.Session
      });
      
      const challengeResponse = await client.send(challengeCommand);
      
      if (challengeResponse.AuthenticationResult) {
        const tokens = {
          idToken: challengeResponse.AuthenticationResult.IdToken,
          accessToken: challengeResponse.AuthenticationResult.AccessToken,
          refreshToken: challengeResponse.AuthenticationResult.RefreshToken,
          expiresAt: Date.now() + (challengeResponse.AuthenticationResult.ExpiresIn * 1000)
        };
        
        fs.writeFileSync(TOKEN_FILE, JSON.stringify(tokens, null, 2));
        console.log("\nPassword changed and logged in successfully.\n");
        return tokens;
      }
    } 
    
    // Normal login
    if (response.AuthenticationResult) {
      const tokens = {
        idToken: response.AuthenticationResult.IdToken,
        accessToken: response.AuthenticationResult.AccessToken,
        refreshToken: response.AuthenticationResult.RefreshToken,
        expiresAt: Date.now() + (response.AuthenticationResult.ExpiresIn * 1000)
      };
      
      fs.writeFileSync(TOKEN_FILE, JSON.stringify(tokens, null, 2));
      console.log("\nLogin successful.\n");
      return tokens;
    }
    
  } catch (error) {
    throw new Error(`Login failed: ${error.message}`);
  }
}

async function promptLogin() {
  console.log("\n--- Login Required ---\n");
  const username = await question("Email: ");
  const password = await question("Password: ");
  
  try {
    const tokens = await login(username, password);
    return tokens.idToken;
  } catch (error) {
    console.log(`\n${error.message}\n`);
    throw error;
  }
}

export async function getValidToken(skipPrompt = false) {
  // Check if we have saved tokens
  if (fs.existsSync(TOKEN_FILE)) {
    const tokens = JSON.parse(fs.readFileSync(TOKEN_FILE, 'utf8'));
    
    // Check if token is still valid (with 5 min buffer)
    if (tokens.expiresAt > Date.now() + 300000) {
      if (!skipPrompt) console.log("\nUsing existing valid token.\n");
      return tokens.idToken;
    }
    
    if (!skipPrompt) console.log("\nToken expired.\n");
  }
  
  // No valid token - need to login
  if (skipPrompt) {
    throw new Error("No valid token and skipPrompt is true");
  }
  
  return await promptLogin();
}

// Allow clearing saved tokens
export function clearTokens() {
  if (fs.existsSync(TOKEN_FILE)) {
    fs.unlinkSync(TOKEN_FILE);
    console.log("Tokens cleared.");
  }
}

// If run directly
if (import.meta.url === `file://${process.argv[1]}`) {
  getValidToken().then(token => {
    console.log("ID Token obtained successfully.");
    rl.close();
  }).catch(err => {
    console.error("Failed:", err.message);
    rl.close();
    process.exit(1);
  });
}