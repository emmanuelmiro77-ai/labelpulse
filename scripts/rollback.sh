#!/usr/bin/env bash
# rollback.sh — Roll back LabelPulse to a previous version
#
# Usage:
#   ./scripts/rollback.sh                  # interactive picker (lists recent tags)
#   ./scripts/rollback.sh v2.1.0           # explicit tag
#   ./scripts/rollback.sh --list           # just list available versions
#   ./scripts/rollback.sh --current        # show current version
#
# What it does:
#   1. Verifies working tree is clean
#   2. Lists recent git tags (or accepts one)
#   3. Creates a rollback commit pointing to the chosen tag
#   4. Pushes to origin
#   5. The previous HEAD is saved as branch "pre-rollback-<timestamp>"
#      so you can always go forward again.
#
set -euo pipefail

cd "$(dirname "$0")/.."

if ! git rev-parse --is-inside-work-tree >/dev/null 2>&1; then
  echo "❌ Not inside a git repository"
  exit 1
fi

if [[ -n "$(git status --porcelain)" ]]; then
  echo "❌ Working tree is not clean. Commit or stash first:"
  git status --short
  exit 1
fi

CURRENT_TAG=$(git describe --tags --abbrev=0 2>/dev/null || echo "none")
CURRENT_VERSION=$(node -p "require('./package.json').version" 2>/dev/null || echo "unknown")

# --current
if [[ "${1:-}" == "--current" ]]; then
  echo "Current version: v$CURRENT_VERSION"
  echo "Current tag:     $CURRENT_TAG"
  echo "Current HEAD:    $(git rev-parse --short HEAD)"
  exit 0
fi

# --list
if [[ "${1:-}" == "--list" ]]; then
  echo "Available releases (most recent first):"
  git tag --list 'v*' --sort=-version:refname | head -20
  exit 0
fi

# Explicit tag
TARGET="${1:-}"
if [[ -z "$TARGET" ]]; then
  echo "📋 Recent releases (most recent first):"
  echo ""
  git tag --list 'v*' --sort=-version:refname | head -15
  echo ""
  read -rp "Enter target version (e.g. v2.1.0) or press Enter to cancel: " TARGET
  if [[ -z "$TARGET" ]]; then
    echo "Cancelled."
    exit 0
  fi
fi

# Normalize: ensure "v" prefix
[[ "$TARGET" != v* ]] && TARGET="v$TARGET"

if ! git rev-parse "$TARGET" >/dev/null 2>&1; then
  echo "❌ Tag $TARGET does not exist"
  echo "Available tags:"
  git tag --list 'v*' --sort=-version:refname | head -20
  exit 1
fi

if [[ "$TARGET" == "v$CURRENT_VERSION" ]]; then
  echo "⚠️  Already at $TARGET"
  exit 0
fi

TIMESTAMP=$(date -u +"%Y%m%d-%H%M%S")
BACKUP_BRANCH="pre-rollback-$TIMESTAMP"

echo ""
echo "🔄 Rolling back:"
echo "   From: v$CURRENT_VERSION (HEAD $(git rev-parse --short HEAD))"
echo "   To:   $TARGET"
echo ""

# Safety branch on current HEAD
git branch "$BACKUP_BRANCH"
echo "✓ Saved current state as branch: $BACKUP_BRANCH"

# Checkout target tag files into working tree (without detaching HEAD)
git checkout "$TARGET" -- .
echo "✓ Restored files from $TARGET"

# Bump package.json to target version
TARGET_VERSION="${TARGET#v}"
node -e "const fs=require('fs'); const p=require('./package.json'); p.version='$TARGET_VERSION'; fs.writeFileSync('./package.json', JSON.stringify(p,null,2)+'\n')"

# Commit the rollback
git add -A
git commit -m "rollback: restored to $TARGET (from v$CURRENT_VERSION)

Backup of previous state: branch $BACKUP_BRANCH
To undo this rollback: git merge $BACKUP_BRANCH
" >/dev/null
echo "✓ Committed rollback"

# Push
echo ""
echo "🚀 Pushing to origin..."
git push origin main
git push origin "$BACKUP_BRANCH"

echo ""
echo "✅ Rolled back to $TARGET"
echo ""
echo "   Backup branch: $BACKUP_BRANCH (pushed to origin)"
echo "   To undo:       git merge $BACKUP_BRANCH"
