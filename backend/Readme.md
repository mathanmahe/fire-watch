Files Modified/Created
src/server.js

Added authentication middleware (requireAuth) to protect all /api/* routes
Implemented auto-start for cloud detectors on server boot
All active cameras with detection: "CLOUD" automatically begin monitoring when server starts
Added function startExistingDetectors() to load cameras from database on startup

src/config.js

Added Cognito configuration (poolId, clientId, region)
Added SNS configuration (topicArn, region)
Centralized environment variable management

src/auth/cognitoVerify.js

JWT token verification middleware using aws-jwt-verify
Extracts user info from Cognito ID token
Attaches req.user (with sub and email) to authenticated requests
Returns 401 for missing or invalid tokens

src/routes/cameras.js

Multi-user isolation: All routes filter by req.user.sub (Cognito user ID)
Create: Links new cameras to authenticated user via userId field
Read: Users only see their own cameras
Update/Delete: Ownership verification before allowing modifications
Auto-starts/stops cloud detector when camera is activated/deactivated
Added error handling for ownership violations

src/services/cloudDetector.js

Converts frame extraction from Python to Node.js
RTSP support: Builds RTSP URLs with credentials (rtsp://user:pass@ip:port/path)
Uses FFmpeg to grab frames every 5 seconds (configurable fps)
Sends JPEG frames to AWS Lambda endpoint
Lambda response triggers SNS (handled by Lambda, not backend)
Maintains worker map to track active detectors per camera
Graceful start/stop for detectors

src/services/mediamtx.js

No changes (existing file)

prisma/schema.prisma

Added userId field to Camera model (links to Cognito user sub)
Multi-tenancy constraint: @@unique([userId, camera]) - users can have cameras with same names
Added index: @@index([userId]) for query optimization
Removed enum types (not supported by SQLite)
Changed detection and streamType from enums to String fields

.env
Added new environment variables:
COGNITO_USER_POOL_ID
COGNITO_CLIENT_ID
COGNITO_CLIENT_SECRET
COGNITO_REGION
SNS_TOPIC_ARN
AWS_REGION
package.json
Added dependencies:

aws-jwt-verify - JWT verification
@aws-sdk/client-cognito-identity-provider - Login/auth operations

test-login.js (new)

CLI tool for user authentication
Handles NEW_PASSWORD_REQUIRED challenge
Calculates SECRET_HASH for Cognito client secret
Saves tokens for API testing


Database Changes
Migration: 20251001193330_init

Added userId column to Camera table
Added unique constraint on (userId, camera)
Added index on userId


AWS Services Integrated

AWS Cognito: User authentication and JWT tokens
AWS Lambda: Fire detection inference (existing endpoint)
AWS SNS: Email notifications triggered by Lambda

