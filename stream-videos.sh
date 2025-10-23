#!/bin/bash

# Stream sample videos to MediaMTX for demo purposes
# This script streams videos from vids/ directory to cam3, cam4, cam5, cam6

MEDIAMTX_HOST="10.0.0.160"
MEDIAMTX_PORT="8554"
VIDS_DIR="/Users/mathan/FireWatch/vids"

# Array to store PIDs of ffmpeg processes
FFMPEG_PIDS=()

# Function to cleanup all ffmpeg processes
cleanup() {
  echo ""
  echo "Cleaning up ffmpeg processes..."
  pkill -f "ffmpeg.*rtsp://$MEDIAMTX_HOST" || true
  # Also kill any processes in our PID array
  for pid in "${FFMPEG_PIDS[@]}"; do
    if kill -0 "$pid" 2>/dev/null; then
      kill "$pid" 2>/dev/null || true
    fi
  done
  echo "Cleanup complete."
  exit 0
}

# Set up signal handlers for cleanup
trap cleanup SIGINT SIGTERM EXIT

# Function to stream a video file to a specific camera path
stream_video() {
  local video_file="$1"
  local cam_path="$2"

  echo "Starting stream: $video_file -> rtsp://$MEDIAMTX_HOST:$MEDIAMTX_PORT/$cam_path"

  ffmpeg -re -stream_loop -1 \
    -i "$video_file" \
    -c:v libx264 -preset ultrafast -tune zerolatency \
    -b:v 2M -maxrate 2M -bufsize 4M \
    -pix_fmt yuv420p -g 50 \
    -f rtsp -rtsp_transport tcp \
    "rtsp://$MEDIAMTX_HOST:$MEDIAMTX_PORT/$cam_path" \
    > "/tmp/ffmpeg_${cam_path}.log" 2>&1 &

  echo "Started $cam_path (PID: $!)"
  FFMPEG_PIDS+=($!)
}

# Kill any existing ffmpeg processes streaming to MediaMTX
echo "Stopping any existing ffmpeg streams..."
pkill -f "ffmpeg.*rtsp://$MEDIAMTX_HOST" || true

# Wait a moment for cleanup
sleep 1

# Stream videos to different camera paths
stream_video "$VIDS_DIR/fire2.mp4" "cam3"
stream_video "$VIDS_DIR/fire3.mp4" "cam4"
stream_video "$VIDS_DIR/fireVideo.mp4" "cam5"
stream_video "$VIDS_DIR/no-fire.mp4" "cam6"
stream_video "$VIDS_DIR/fire_sample2.mp4" "cam7"

echo ""
echo "All streams started!"
echo "To view logs: tail -f /tmp/ffmpeg_cam*.log"
echo "Press Ctrl+C to stop all streams and exit"
echo ""
echo "Waiting for streams to run... (Press Ctrl+C to stop)"

# Keep the script running and wait for signals
while true; do
  sleep 1
done
