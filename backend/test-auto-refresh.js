import { 
  CognitoIdentityProviderClient, 
  InitiateAuthCommand 
} from "@aws-sdk/client-cognito-identity-provider";
import crypto from 'crypto';
import 'dotenv/config';
import fs from 'fs';

const client = new CognitoIdentityProviderClient({ 
  region: process.env.COGNITO_REGION 
});

const TOKEN_FILE = '.tokens.json';

function calculateSecretHash(username, clientId, clientSecret) {
  return crypto
    .createHmac('SHA256', clientSecret)
    .update(username + clientId)
    .digest('base64');
}

async function login(username, password) {
  const clientSecret = process.env.COGNITO_CLIENT_SECRET;
  const clientId = process.env.COGNITO_CLIENT_ID;
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

  const response = await client.send(command);
  
  if (response.AuthenticationResult) {
    const tokens = {
      idToken: response.AuthenticationResult.IdToken,
      accessToken: response.AuthenticationResult.AccessToken,
      refreshToken: response.AuthenticationResult.RefreshToken,
      expiresAt: Date.now() + (response.AuthenticationResult.ExpiresIn * 1000)
    };
    
    // Save tokens to file
    fs.writeFileSync(TOKEN_FILE, JSON.stringify(tokens, null, 2));
    console.log("Logged in successfully. Tokens saved.");
    return tokens;
  }
}

async function getValidToken() {
  // Check if we have saved tokens
  if (fs.existsSync(TOKEN_FILE)) {
    const tokens = JSON.parse(fs.readFileSync(TOKEN_FILE, 'utf8'));
    
    // Check if token is still valid (with 5 min buffer)
    if (tokens.expiresAt > Date.now() + 300000) {
      console.log("Using existing valid token");
      return tokens.idToken;
    }
    
    console.log("Token expired, refreshing...");
    // TODO: Implement refresh token flow if needed
  }
  
  // No valid token, need to login
  console.log("No valid token found. Please login.");
  const tokens = await login("rakshith911@gmail.com", "MyNewPassword123!");
  return tokens.idToken;
}

// Export for use in other scripts
export { getValidToken };

// If run directly, just get and display token
if (import.meta.url === `file://${process.argv[1]}`) {
  getValidToken().then(token => {
    console.log("\nID Token:", token);
  });
}