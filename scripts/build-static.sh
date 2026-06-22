#!/bin/bash
# Build LabelPulse as a static export (for local server.mjs deployment).
#
# Why this script exists:
#   Next.js's `output: export` mode has multiple issues with API routes:
#     1. Catch-all route handlers (like /api/auth/[...nextauth]) can't be
#        statically exported — even with empty `generateStaticParams`.
#     2. Marking route handlers as `force-static` triggers an EISDIR bug
#        where Next.js tries to copy `api.body` (a file) to `out/api`
#        (already created as a directory by parallel route writes).
#
# Workaround:
#   Temporarily move ALL API routes out of src/app/api/ during the build.
#   This is safe because server.mjs (the local static file server) does
#   NOT handle /api/* routes — it only serves static files. The API routes
#   are only used in the Vercel deployment (which uses `next build` without
#   NEXT_EXPORT=true, so this script doesn't run).
#
# After the build:
#   - All API route folders are restored to their original locations
#   - The essentia.js WASM files are copied to /out/ explicitly (Next.js
#     sometimes drops large binary assets during static export)

set -e

cd /home/z/my-project

API_DIR="src/app/api"
API_BACKUP="src/_api_backup_static_build"

if [ -d "$API_DIR" ]; then
  echo "[build-static] Temporarily excluding $API_DIR for static export..."
  if [ -d "$API_BACKUP" ]; then rm -rf "$API_BACKUP"; fi
  mv "$API_DIR" "$API_BACKUP"
  # Recreate an empty api dir so other code that references it doesn't fail
  mkdir -p "$API_DIR"
fi

# Run the static export build
echo "[build-static] Running NEXT_EXPORT=true next build..."
set +e
NEXT_EXPORT=true npx next build
BUILD_EXIT=$?
set -e

# Always restore the api folder, even if the build failed
echo "[build-static] Restoring $API_DIR..."
rm -rf "$API_DIR"
mv "$API_BACKUP" "$API_DIR"

if [ $BUILD_EXIT -ne 0 ]; then
  echo "[build-static] Build failed with exit code $BUILD_EXIT"
  exit $BUILD_EXIT
fi

# Copy essentia.js WASM files to /out/ (Next.js static export sometimes
# drops large binary assets — this guarantees they're present)
echo "[build-static] Copying essentia.js WASM files to out/..."
cp -v public/essentia-wasm.web.js out/ 2>/dev/null || true
cp -v public/essentia-wasm.web.wasm out/ 2>/dev/null || true
cp -v public/essentia.js-core.js out/ 2>/dev/null || true

echo "[build-static] Done. Build exit code: $BUILD_EXIT"
exit $BUILD_EXIT
