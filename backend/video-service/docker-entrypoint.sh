#!/bin/bash
set -e

echo "Starting Video Processing Service..."

# Start mediasoup server in background
echo "Starting mediasoup server..."
node mediasoup/server.ts &
MEDIASOUP_PID=$!

# Wait for mediasoup to be ready
sleep 5

# Start FastAPI server
echo "Starting FastAPI server..."
exec python -m uvicorn src.main:app --host 0.0.0.0 --port 8003
