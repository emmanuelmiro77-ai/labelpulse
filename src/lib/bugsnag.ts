/**
 * Bugsnag initialization module.
 *
 * Initializes Bugsnag with proper guards for Next.js:
 * - Client-side: uses NEXT_PUBLIC_BUGSNAG_API_KEY
 * - Server-side: uses BUGSNAG_API_KEY (falls back to public key)
 *
 * No-op if API key is not set → safe for local dev.
 *
 * Bugsnag free tier (verified 2026-06-26):
 * - 7,500 errors/month (sufficient for ~75-100 beta testers)
 * - 1M performance spans/month
 * - 1 user seat
 * - 7-day data retention (must check dashboard weekly)
 * - No Slack/Discord alerts (upgrade to $23/mo for that)
 *
 * Decision rationale: chose Bugsnag over Sentry because Sentry removed
 * their free forever tier in 2025-2026 (now trial-only → paid $80+/mo).
 * See BETA_ROADMAP.md changelog for full justification.
 */

import Bugsnag from "@bugsnag/js";

// Track whether Bugsnag has been started in this process.
// Bugsnag.start() throws if called twice with different config.
let isStarted = false;

// Helper: check if Bugsnag has a running client.
// The _client property exists at runtime but isn't in the public TS types.
function hasClient(): boolean {
  const b = Bugsnag as unknown as { _client?: unknown };
  return !!b._client;
}

function startIfConfigured(): boolean {
  if (isStarted) return true;
  if (hasClient()) {
    // Already started (e.g., by another import path)
    isStarted = true;
    return true;
  }

  // API key: server uses BUGSNAG_API_KEY, client uses NEXT_PUBLIC_BUGSNAG_API_KEY
  // The public key works on both sides, so we fall back to it.
  const apiKey =
    (typeof process !== "undefined" && process.env.BUGSNAG_API_KEY) ||
    (typeof process !== "undefined" && process.env.NEXT_PUBLIC_BUGSNAG_API_KEY) ||
    null;

  if (!apiKey || !apiKey.startsWith("y")) {
    // No API key configured → skip init
    // Bugsnag.notify() will silently no-op if not started
    return false;
  }

  const releaseStage =
    process.env.NODE_ENV === "production" ? "production" : "development";

  Bugsnag.start({
    apiKey,

    // Only send events in production (avoid polluting dashboard with dev errors)
    enabledReleaseStages: ["production"],

    // App version for release tracking (matches Vercel deployment SHA)
    appVersion: process.env.NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA,

    // Release stage tagging
    releaseStage,

    // Filter known noise (similar to Sentry config we had before)
    onError: [
      (event) => {
        const errors = event.errors || [];
        const firstError = errors[0];
        const errorMessage = firstError?.errorMessage || "";
        const errorClass = firstError?.errorClass || "";

        // Skip browser extension noise
        const url = event.request?.url || "";
        if (url.includes("chrome-extension://") || url.includes("moz-extension://")) {
          return false;
        }

        // Skip ResizeObserver loop warnings (browser quirk, not actionable)
        if (
          errorMessage.includes("ResizeObserver loop completed with undelivered notifications") ||
          errorMessage.includes("ResizeObserver loop limit exceeded")
        ) {
          return false;
        }

        // Skip chunk loading errors (user refreshes mid-load)
        if (errorClass === "ChunkLoadError") {
          return false;
        }

        // Skip cancelled route changes
        if (errorClass === "AbortError") {
          return false;
        }

        // Skip storage quota (handled in-app with toast)
        if (errorClass === "QuotaExceededError") {
          return false;
        }

        // Skip network errors on client (not actionable)
        if (
          typeof window !== "undefined" &&
          (errorMessage.includes("Network request failed") || errorMessage.includes("Failed to fetch"))
        ) {
          return false;
        }

        // Skip server-side connection errors (transient infra issues)
        if (typeof window === "undefined") {
          if (
            errorMessage.includes("connect ETIMEDOUT") ||
            errorMessage.includes("connect ECONNREFUSED") ||
            errorMessage.includes("ECONNRESET")
          ) {
            return false;
          }
        }

        return true;
      },
    ],

    // Mask PII in metadata by default (GDPR-friendly)
    redactedKeys: [
      "password",
      "token",
      "authorization",
      "cookie",
      "secret",
      "api_key",
      "apikey",
      "access_token",
      "refresh_token",
      "private_key",
      "photoUrl", // We don't want to leak photo data URLs in events
    ],
  });

  isStarted = true;
  return true;
}

// Auto-start on import (no-op if API key not configured)
startIfConfigured();

// Re-export Bugsnag so other modules can call Bugsnag.notify() etc.
export default Bugsnag;

// Export helper to check if Bugsnag is active
export function isBugsnagActive(): boolean {
  return isStarted || hasClient();
}
