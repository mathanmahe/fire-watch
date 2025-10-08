import 'dotenv/config';

export const cfg = {
  dbUrl: process.env.DATABASE_URL,
  cognito: {
    poolId: process.env.COGNITO_USER_POOL_ID,
    clientId: process.env.COGNITO_CLIENT_ID,
    region: process.env.COGNITO_REGION || 'us-east-1'
  },
  mediamtx: {
    config: process.env.MEDIAMTX_CONFIG || './mediamtx.yml'
  },
  ffmpeg: process.env.FFMPEG_BIN || 'ffmpeg',
  fireEndpoint: process.env.FIRE_ENDPOINT,
  port: Number(process.env.PORT || 4000)
};
