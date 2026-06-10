#!/bin/bash
cd /home/z/my-project
while true; do
  node .next/standalone/server.js
  echo "Server crashed, restarting in 2s..."
  sleep 2
done
