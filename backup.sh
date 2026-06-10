#!/bin/bash
# LabelPulse Backup Script
# Usage: bash backup.sh

PROJECT_DIR="/home/z/my-project"
BACKUP_DIR="/home/z/my-project/download/backups"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
BACKUP_FILE="$BACKUP_DIR/labelpulse_backup_$TIMESTAMP.tar.gz"

mkdir -p "$BACKUP_DIR"

echo "=== LabelPulse Backup ==="
echo "Creating backup..."

# Create tar.gz excluding node_modules, .next cache, and logs
tar -czf "$BACKUP_FILE" \
  --exclude='node_modules' \
  --exclude='.next/cache' \
  --exclude='dev.log' \
  --exclude='server.log' \
  --exclude='download/backups' \
  -C /home/z/my-project \
  . 2>/dev/null

SIZE=$(du -h "$BACKUP_FILE" | cut -f1)
echo ""
echo "✅ Backup completato!"
echo "📁 File: $BACKUP_FILE"
echo "📦 Dimensione: $SIZE"
echo ""
echo "Per ripristinare:"
echo "  1. Copia il file .tar.gz sul server"
echo "  2. tar -xzf labelpulse_backup_$TIMESTAMP.tar.gz -C /home/z/my-project/"
echo "  3. cd /home/z/my-project && bun install && bun run build"
echo "  4. NODE_ENV=production bun .next/standalone/server.js"
