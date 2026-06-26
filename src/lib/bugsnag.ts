/**
 * Bugsnag initialization module (errors + performance + React ErrorBoundary).
 *
 * Initializes:
 *   - Bugsnag (errors) with @bugsnag/plugin-react for ErrorBoundary
 *   - BugsnagPerformance (Core Web Vitals + route changes + fetch/XHR)
 *
 * Server-side: uses BUGSNAG_API_KEY (falls back to public key).
 * Client-side: uses NEXT_PUBLIC_BUGSNAG_API_KEY (falls back to server key).
 *
 * No-op if no API key is configured → safe for local dev.
 *
 * Bugsnag free tier (verified 2026-06-26):
 *   - 7,500 errors/month (sufficient for ~75-100 beta testers)
 *   - 7,500 performance spans/month (free performance included)
 *   - 1 user seat
 *   - 7-day data retention (must check dashboard weekly)
 *   - No Slack/Discord alerts (upgrade to $23/mo for that)
 *
 * API key format: 32-character hex string (e.g. "1fa4d8a88468f9c892f1c59e9305cd2c").
 * Newer projects may use the "y" prefix format. Both are accepted.
 */

import Bugsnag from "@bugsnag/js";
import BugsnagPluginReact from "@bugsnag/plugin-react";
import BugsnagPerformance from "@bugsnag/browser-performance";

// Track whether Bugsnag has been started in this process.
// Bugsnag.start() throws if called twice with different config.
let isStarted = false;
let isPerfStarted = false;

// Cached ErrorBoundary (lazy-initialized on first access from a client component).
// Using `any` here because Bugsnag's plugin types are complex and vary across
// versions — the runtime contract is "a React component class that accepts
// children + FallbackComponent props", which we enforce at the call site.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let cachedErrorBoundary: any = null;

// Helper: check if Bugsnag has a running client.
// The _client property exists at runtime but isn't in the public TS types.
function hasClient(): boolean {
  const b = Bugsnag as unknown as { _client?: unknown };
  return !!b._client;
}

/**
 * Validate API key format. Accepts:
 *   - 32-char hex (legacy format): "1fa4d8a88468f9c892f1c59e9305cd2c"
 *   - "y"-prefixed (newer format): "y1fa4d8a8..."
 *   - Any string >= 20 chars as a fallback (Bugsnag may change format)
 */
function isValidApiKey(key: string | null | undefined): key is string {
  if (!key) return false;
  if (key.length < 20) return false;
  // 32-char hex
  if (/^[a-f0-9]{32}$/i.test(key)) return true;
  // y-prefixed (new format)
  if (key.startsWith("y") && key.length >= 25) return true;
  // Fallback: trust the user if it's long enough
  return true;
}

function resolveApiKey(): string | null {
  // Public key (NEXT_PUBLIC_*) is exposed to the client bundle.
  // Private key (no prefix) is server-only.
  // For browser-side error tracking, we MUST use the public key.
  // Server-side prefers the private key, but falls back to public.
  if (typeof window !== "undefined") {
    // Client: only NEXT_PUBLIC_* is available
    return process.env.NEXT_PUBLIC_BUGSNAG_API_KEY || null;
  }
  // Server: try private first, fall back to public
  return (
    process.env.BUGSNAG_API_KEY ||
    process.env.NEXT_PUBLIC_BUGSNAG_API_KEY ||
    null
  );
}

function startIfConfigured(): boolean {
  if (isStarted) return true;
  if (hasClient()) {
    // Already started (e.g., by another import path)
    isStarted = true;
    return true;
  }

  const apiKey = resolveApiKey();
  if (!isValidApiKey(apiKey)) {
    // No valid API key → skip init. Bugsnag.notify() will silently no-op.
    return false;
  }

  const releaseStage =
    process.env.NODE_ENV === "production" ? "production" : "development";

  Bugsnag.start({
    apiKey,
    plugins: [new BugsnagPluginReact()],

    // Only send events in production (avoid polluting dashboard with dev errors)
    enabledReleaseStages: ["production"],

    // App version for release tracking (matches Vercel deployment SHA)
    appVersion: process.env.NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA,

    // Release stage tagging
    releaseStage,

    // Filter known noise
    onError: [
      (event) => {
        const errors = event.errors || [];
        const firstError = errors[0];
        const errorMessage = firstError?.errorMessage || "";
        const errorClass = firstError?.errorClass || "";

        // Skip browser extension noise
        const url = event.request?.url || "";
        if (
          url.includes("chrome-extension://") ||
          url.includes("moz-extension://")
        ) {
          return false;
        }

        // Skip ResizeObserver loop warnings (browser quirk, not actionable)
        if (
          errorMessage.includes(
            "ResizeObserver loop completed with undelivered notifications"
          ) ||
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
          (errorMessage.includes("Network request failed") ||
            errorMessage.includes("Failed to fetch"))
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

  // Start performance monitoring (same API key, same release stage filter)
  if (!isPerfStarted) {
    try {
      BugsnagPerformance.start({
        apiKey,
        releaseStage,
        enabledReleaseStages: ["production"],
      });
      isPerfStarted = true;
    } catch {
      // Performance start can fail in non-browser environments or if already
      // started. Safe to ignore — error tracking still works.
    }
  }

  return true;
}

// Auto-start on import (no-op if API key not configured)
startIfConfigured();

// Re-export Bugsnag so other modules can call Bugsnag.notify() etc.
export default Bugsnag;
export { BugsnagPerformance };

// Export helper to check if Bugsnag is active
export function isBugsnagActive(): boolean {
  return isStarted || hasClient();
}

/**
 * Get a React ErrorBoundary component (cached after first call).
 *
 * MUST be called from a Client Component ('use client') because
 * ErrorBoundary uses React state to catch render errors.
 *
 * Returns null if Bugsnag is not configured (caller should fall back
 * to a no-op Fragment wrapper).
 */
export function getErrorBoundary() {
  if (cachedErrorBoundary) return cachedErrorBoundary;
  if (!isBugsnagActive()) return null;

  const reactPlugin = Bugsnag.getPlugin("react");
  if (!reactPlugin) return null;

  // createErrorBoundary requires React — lazy import to keep this module
  // importable from server components too.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const React = require("react") as typeof import("react");
  cachedErrorBoundary = reactPlugin.createErrorBoundary(React);
  return cachedErrorBoundary;
}
