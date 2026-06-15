#!/bin/bash
# LabelPulse - Keep-alive for static file server
# Uses the lightest possible server (python3 http.server)
# Extremely unlikely to be killed by the sandbox

cd /home/z/my-project/out

while true; do
    python3 -m http.server 3000 --bind 0.0.0.0 2>&1
    echo "[$(date)] Static server stopped, restarting in 2s..." >> /home/z/my-project/server-restart.log
    sleep 2
done
