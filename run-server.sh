#!/bin/bash
# LabelPulse - Robust static file server with auto-restart
# Serves pre-built static files. Extremely lightweight - unlikely to be killed.

cd /home/z/my-project

# Build if needed
if [ ! -d "out" ] || [ ! -f "out/index.html" ]; then
    echo "[$(date)] Building LabelPulse..." >> /home/z/my-project/server-restart.log
    bun run build 2>&1 >> /home/z/my-project/server-restart.log
fi

echo "[$(date)] Starting LabelPulse static server on port 3000..." >> /home/z/my-project/server-restart.log

# Auto-restart loop - serves static files
while true; do
    cd /home/z/my-project
    bunx serve out -p 3000 -s 2>&1
    echo "[$(date)] Static server stopped, restarting in 2s..." >> /home/z/my-project/server-restart.log
    sleep 2
done
