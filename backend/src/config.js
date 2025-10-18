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

console.log('🔍 config.js - process.env.USER_ID:', process.env.USER_ID);

// ✅ Detect Electron mode
const isElectron = process.env.ELECTRON === 'true';

// ✅ Get ffmpeg path - use bundled version in production
function getFfmpegPath() {
  // If FFMPEG_BIN is explicitly set, use that
  if (process.env.FFMPEG_BIN) {
    console.log('🔍 Using FFMPEG_BIN from env:', process.env.FFMPEG_BIN);
    return process.env.FFMPEG_BIN;
  }

  // In Electron production, use bundled ffmpeg-static
  if (isElectron && ffmpegStatic) {
    const bundledPath = ffmpegStatic.default || ffmpegStatic;
    console.log('🔍 Using bundled ffmpeg:', bundledPath);
    return bundledPath;
  }

  // Development: try system ffmpeg
  console.log('🔍 Using system ffmpeg: ffmpeg');
  return 'ffmpeg';
}

// ✅ Get database path
function getDatabaseUrl() {
  if (isElectron) {
    const userDataPath = path.join(os.homedir(), '.firewatch');
    const dbPath = path.join(userDataPath, 'firewatch.db');
    console.log('🔍 Electron mode - Database path:', dbPath);
    return `file:${dbPath}`;
  }
  
  return process.env.DATABASE_URL || 'file:./prisma/firewatch.db';
}

export const cfg = {
  dbUrl: getDatabaseUrl(),
  userId: process.env.USER_ID,
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

console.log('🔍 config.js - cfg.userId:', cfg.userId);
console.log('🔍 config.js - cfg.ffmpeg:', cfg.ffmpeg);
console.log('🔍 config.js - cfg.dbUrl:', cfg.dbUrl);