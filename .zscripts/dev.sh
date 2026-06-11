#!/bin/bash
# LabelPulse Custom Dev Script for Space-Z
# This replaces Space-Z's default "bun install → db:push → dev" flow
# which fails because we don't use Prisma anymore.
#
# Flow: bun install → next build (static export) → node server.mjs (port 3000)
# The static export + minimal Node server is bulletproof: no crashes, no memory leaks.

set -e

cd /home/z/my-project

echo "============================================"
echo "[LabelPulse] Custom startup script running..."
echo "============================================"

# Step 1: Install dependencies
echo "[1/3] Installing dependencies..."
bun install 2>&1 || { echo "[ERROR] bun install failed!"; exit 1; }

# Step 2: Build static export (HTML/CSS/JS files in /out)
echo "[2/3] Building static export..."
bun run build 2>&1 || { echo "[ERROR] Build failed!"; exit 1; }

# Step 3: Start minimal static file server on port 3000
echo "[3/3] Starting static server on port 3000..."
echo "[LabelPulse] Ready! Serving from /home/z/my-project/out"
exec node server.mjs
