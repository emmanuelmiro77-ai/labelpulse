/**
 * Post-build script: upload Next.js source maps to Bugsnag.
 *
 * Runs automatically via `npm run postbuild` after every `next build`.
 * Skipped silently if:
 *   - Bugsnag API key not configured (local dev, CI without secrets)
 *   - .next directory doesn't exist (build failed earlier)
 *   - Not running on Vercel (avoid uploading from random dev machines)
 *
 * Requirements:
 *   - BUGSNAG_API_KEY env var (server-side, set in Vercel)
 *   - NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA (auto-exposed by next.config.ts)
 *   - @bugsnag/source-maps package (devDependency)
 *
 * After upload, source maps are DELETED from the build output so they
 * don't get served publicly (which would expose original source code).
 *
 * Reference: https://docs.bugsnag.com/build-integrations/js/
 */

import { existsSync, rmSync } from "node:fs";
import { resolve, join } from "node:path";
import { execSync } from "node:child_process";

const apiKey = process.env.BUGSNAG_API_KEY;
const appVersion = process.env.NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA || process.env.VERCEL_GIT_COMMIT_SHA;
const isVercel = !!process.env.VERCEL;
const nextDir = resolve(".next");

// Skip conditions
if (!apiKey) {
  console.log("[bugsnag-sourcemaps] SKIP: BUGSNAG_API_KEY not set");
  process.exit(0);
}

if (!appVersion) {
  console.log("[bugsnag-sourcemaps] SKIP: NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA not set");
  process.exit(0);
}

if (!isVercel) {
  console.log("[bugsnag-sourcemaps] SKIP: not running on Vercel (local build)");
  process.exit(0);
}

if (!existsSync(nextDir)) {
  console.log("[bugsnag-sourcemaps] SKIP: .next directory not found (build failed?)");
  process.exit(0);
}

const staticDir = join(nextDir, "static");
if (!existsSync(staticDir)) {
  console.log("[bugsnag-sourcemaps] SKIP: .next/static not found");
  process.exit(0);
}

console.log(`[bugsnag-sourcemaps] Uploading source maps to Bugsnag...`);
console.log(`  appVersion: ${appVersion}`);
console.log(`  source:     ${staticDir}`);

try {
  // Use npx to ensure we get the right binary even if PATH is weird.
  // CLI command is `upload-browser` (not `upload`) for browser JS source maps.
  // --base-url is required for directory upload: tells Bugsnag the public URL
  // prefix where the JS bundles are served. Next.js serves .next/static/ at /_next/static/.
  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || "https://labelpulse.app";
  const cmd = [
    "npx",
    "--no-install",
    "bugsnag-source-maps",
    "upload-browser",
    "--api-key", apiKey,
    "--app-version", appVersion,
    "--directory", staticDir,
    "--project-root", process.cwd(),
    "--base-url", `${baseUrl}/_next/static/`,
    "--overwrite",
  ].join(" ");

  execSync(cmd, { stdio: "inherit", cwd: process.cwd() });
  console.log("[bugsnag-sourcemaps] ✅ Upload complete");
} catch (err) {
  console.error("[bugsnag-sourcemaps] ⚠️  Upload failed:", err.message);
  // Don't fail the build — source maps are a nice-to-have, not critical
  process.exit(0);
}

// SECURITY: delete source maps from build output so they're not served publicly.
// Stack traces will still resolve in Bugsnag because the maps were uploaded.
try {
  console.log("[bugsnag-sourcemaps] Removing .map files from build output (security)...");
  execSync(`find ${staticDir} -name "*.map" -type f -delete`, { stdio: "inherit" });
  console.log("[bugsnag-sourcemaps] ✅ Source maps removed from public output");
} catch (err) {
  console.warn("[bugsnag-sourcemaps] ⚠️  Could not delete .map files:", err.message);
}
