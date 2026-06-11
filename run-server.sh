#!/bin/bash
cd /home/z/my-project
while true; do
  bun x next dev -p 3000 --turbopack 2>&1
  echo "[$(date)] Server crashed, restarting in 3s..." >> /home/z/my-project/server-restart.log
  sleep 3
done
