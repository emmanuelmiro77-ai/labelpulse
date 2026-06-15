#!/bin/bash
# LabelPulse - Static File Server Startup
# This script serves the pre-built static files.
# No Node.js server process needed - just a lightweight static file server.

cd /home/z/my-project

# Check if build exists
if [ ! -d "out" ]; then
    echo "Building LabelPulse static export..."
    bun run build
fi

echo "Starting LabelPulse static server on port 3000..."

# Try serve (npm package) first, fallback to python
if command -v bunx &> /dev/null; then
    exec bunx serve out -p 3000 -s
elif command -v python3 &> /dev/null; then
    cd out
    exec python3 -m http.server 3000
elif command -v python &> /dev/null; then
    cd out
    exec python -m http.server 3000
else
    echo "ERROR: No static file server available!"
    exit 1
fi
