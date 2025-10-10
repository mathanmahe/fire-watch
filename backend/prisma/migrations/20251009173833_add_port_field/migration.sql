-- AddPortField
-- This migration adds a 'port' column to the Camera table
-- and extracts port numbers from existing 'ip' values (e.g., "192.168.1.201:554")

-- Step 1: Add the new 'port' column
ALTER TABLE "Camera" ADD COLUMN "port" TEXT;

-- Step 2: Extract port from ip column for existing records
-- This handles formats like "192.168.1.201:554" or "example.com:8554"
-- If ip contains ":", extract the port part; otherwise, leave port as NULL
UPDATE "Camera"
SET "port" = SUBSTR("ip", INSTR("ip", ':') + 1)
WHERE "ip" IS NOT NULL AND INSTR("ip", ':') > 0;

-- Step 3: Remove port from ip column (keep only the IP/hostname part)
-- Update ip to only contain the address part before the colon
UPDATE "Camera"
SET "ip" = SUBSTR("ip", 1, INSTR("ip", ':') - 1)
WHERE "ip" IS NOT NULL AND INSTR("ip", ':') > 0;
