import 'dotenv/config';
import path from 'path';
import { fileURLToPath } from 'url';
import os from 'os';

// ✅ Import bundled ffmpeg
let ffmpegStatic;
try {
  ffmpegStatic = await import('ffmpeg-static');
} catch (err) {
  console.warn('⚠️ ffmpeg-static not found, will use system ffmpeg');
}

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ✅ Detect Electron mode
const isElectron = process.env.ELECTRON === 'true';

// ✅ Get ffmpeg path - use bundled version in production
function getFfmpegPath() {
  if (process.env.FFMPEG_BIN) {
    return process.env.FFMPEG_BIN;
  }
  if (isElectron && ffmpegStatic) {
    const bundledPath = ffmpegStatic.default || ffmpegStatic;
    return bundledPath;
  }
  return 'ffmpeg';
}

export const cfg = {
  // ✅ NO userId - will be set dynamically on login
  userId: null,
  
  cognito: {
    poolId: process.env.COGNITO_USER_POOL_ID,
    clientId: process.env.COGNITO_CLIENT_ID,
    region: process.env.COGNITO_REGION || 'us-east-1'
  },
  mediamtx: {
    config: process.env.MEDIAMTX_CONFIG || './mediamtx.yml'
  },
  ffmpeg: getFfmpegPath(),
  fireEndpoint: process.env.FIRE_ENDPOINT,
  port: Number(process.env.PORT || 4000),
  isElectron
};

console.log('✅ Config loaded - DynamoDB mode (no local database)');
