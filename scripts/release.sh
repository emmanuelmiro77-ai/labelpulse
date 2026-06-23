#!/usr/bin/env bash
# release.sh — Tag a new release version of LabelPulse
#
# Usage:
#   ./scripts/release.sh                       # bumps patch (2.1.0 -> 2.1.1)
#   ./scripts/release.sh minor                 # bumps minor (2.1.0 -> 2.2.0)
#   ./scripts/release.sh major                 # bumps major (2.1.0 -> 3.0.0)
#   ./scripts/release.sh 2.5.0                 # explicit version
#   ./scripts/release.sh minor "Fix demo EP"   # with custom message
#
# What it does:
#   1. Verifies working tree is clean
#   2. Bumps version in package.json
#   3. Commits the bump
#   4. Creates annotated git tag v<version>
#   5. Pushes commit + tag to origin
#   6. Appends entry to VERSIONS.md
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

# Read current version
CURRENT_VERSION=$(node -p "require('./package.json').version")
ARG="${1:-patch}"
CUSTOM_MSG="${2:-}"

# Compute new version
if [[ "$ARG" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
  NEW_VERSION="$ARG"
elif [[ "$ARG" == "major" || "$ARG" == "minor" || "$ARG" == "patch" ]]; then
  NEW_VERSION=$(node -p "const s=require('./package.json').version.split('.').map(Number); if('$ARG'==='major'){s[0]++;s[1]=0;s[2]=0} else if('$ARG'==='minor'){s[1]++;s[2]=0} else {s[2]++}; s.join('.')")
else
  echo "❌ Invalid version argument: $ARG"
  echo "   Usage: $0 [patch|minor|major|X.Y.Z] [\"message\"]"
  exit 1
fi

if [[ "$NEW_VERSION" == "$CURRENT_VERSION" ]]; then
  echo "❌ Version is already $CURRENT_VERSION"
  exit 1
fi

if git rev-parse "v$NEW_VERSION" >/dev/null 2>&1; then
  echo "❌ Tag v$NEW_VERSION already exists"
  exit 1
fi

TIMESTAMP=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
DEFAULT_MSG="Release v$NEW_VERSION"
COMMIT_MSG="${CUSTOM_MSG:-$DEFAULT_MSG}"

echo "📦 Releasing: v$CURRENT_VERSION → v$NEW_VERSION"
echo "   Message: $COMMIT_MSG"
echo ""

# Bump package.json
node -e "const fs=require('fs'); const p=require('./package.json'); p.version='$NEW_VERSION'; fs.writeFileSync('./package.json', JSON.stringify(p,null,2)+'\n')"
echo "✓ Bumped package.json"

# Commit
git add package.json
git commit -m "release: v$NEW_VERSION — $COMMIT_MSG" >/dev/null
echo "✓ Committed"

# Tag
git tag -a "v$NEW_VERSION" -m "$COMMIT_MSG"
echo "✓ Tagged v$NEW_VERSION"

# Append to VERSIONS.md
if [[ ! -f VERSIONS.md ]]; then
  echo "# LabelPulse — Release History" > VERSIONS.md
  echo "" >> VERSIONS.md
  echo "| Version | Date (UTC) | Message |" >> VERSIONS.md
  echo "|---------|------------|---------|" >> VERSIONS.md
fi
echo "| v$NEW_VERSION | $TIMESTAMP | $COMMIT_MSG |" >> VERSIONS.md
echo "✓ Appended to VERSIONS.md"

git add VERSIONS.md
git commit -m "docs: release notes for v$NEW_VERSION" >/dev/null
git tag -a "v$NEW_VERSION" -f -m "$COMMIT_MSG" >/dev/null 2>&1 || true

# Push
echo ""
echo "🚀 Pushing to origin..."
git push origin main
git push origin "v$NEW_VERSION"

echo ""
echo "✅ Released v$NEW_VERSION successfully"
echo ""
echo "To rollback later: ./scripts/rollback.sh v$CURRENT_VERSION"
