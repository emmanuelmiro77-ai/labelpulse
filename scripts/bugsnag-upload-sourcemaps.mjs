/**
 * Post-build script: upload Next.js source maps to Bugsnag.
 *
 * Runs via `npm run postbuild` after every `next build`. Also runs when
 * Vercel invokes `npm run build` directly (because `build` script chains
 * `next build` + this script).
 *
 * Skipped silently if:
 *   - Bugsnag API key not configured (local dev, CI without secrets)
 *   - .next directory doesn't exist (build failed earlier)
 *   - No source map files found in .next/static
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

import { existsSync, readdirSync, statSync } from "node:fs";
import { resolve, join } from "node:path";
import { execSync } from "node:child_process";

function findMapFiles(dir) {
  const out = [];
  if (!existsSync(dir)) return out;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      out.push(...findMapFiles(full));
    } else if (entry.isFile() && entry.name.endsWith(".map")) {
      out.push(full);
    }
  }
  return out;
}

const apiKey = process.env.BUGSNAG_API_KEY;
const appVersion =
  process.env.NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA ||
  process.env.VERCEL_GIT_COMMIT_SHA;
const nextDir = resolve(".next");

// Skip conditions
if (!apiKey) {
  console.log("[bugsnag-sourcemaps] SKIP: BUGSNAG_API_KEY not set");
  process.exit(0);
}

if (!appVersion) {
  console.log("[bugsnag-sourcemaps] SKIP: VERCEL_GIT_COMMIT_SHA not set");
  console.log("[bugsnag-sourcemaps] NOTE: this is normal for local dev.");
  console.log("[bugsnag-sourcemaps] On Vercel, VERCEL_GIT_COMMIT_SHA is auto-injected.");
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

// Pre-flight: count source maps to upload
const mapFiles = findMapFiles(staticDir);
if (mapFiles.length === 0) {
  console.log("[bugsnag-sourcemaps] ⚠️  NO source maps found in .next/static!");
  console.log("[bugsnag-sourcemaps] Make sure `productionBrowserSourceMaps: true` is set in next.config.ts");
  process.exit(0);
}

const totalSizeBytes = mapFiles.reduce((sum, f) => sum + statSync(f).size, 0);
const totalSizeMB = (totalSizeBytes / 1024 / 1024).toFixed(2);

console.log(`[bugsnag-sourcemaps] Uploading source maps to Bugsnag...`);
console.log(`  appVersion: ${appVersion}`);
console.log(`  source:     ${staticDir}`);
console.log(`  files:      ${mapFiles.length} source maps (${totalSizeMB} MB total)`);
console.log(`  samples:    ${mapFiles.slice(0, 3).map((f) => f.replace(process.cwd() + "/", "")).join(", ")}${mapFiles.length > 3 ? " ..." : ""}`);

try {
  // CLI command is `upload-browser` (not `upload`) for browser JS source maps.
  //
  // --base-url supports `*` as a wildcard. We use `*/_next/static/` so Bugsnag
  // matches source maps across ALL deployment URLs (production domain + Vercel
  // preview URLs like labelpulse-abc123.vercel.app). Without the wildcard,
  // source maps uploaded with a fixed base-url don't match events from
  // different deployment URLs → "Source mapping failed" in dashboard.
  const cmd = [
    "npx",
    "--no-install",
    "bugsnag-source-maps",
    "upload-browser",
    "--api-key", apiKey,
    "--app-version", appVersion,
    "--directory", staticDir,
    "--project-root", process.cwd(),
    "--base-url", "*/_next/static/",
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
