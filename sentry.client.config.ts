import * as Sentry from "@sentry/nextjs";

/**
 * Sentry client-side configuration.
 *
 * Activates only if NEXT_PUBLIC_SENTRY_DSN is set.
 * This allows local dev without Sentry (no DSN = no init = no errors).
 *
 * To enable Sentry:
 *   1. Create a project at https://sentry.io (free tier: 5K errors/month)
 *   2. Copy the DSN into NEXT_PUBLIC_SENTRY_DSN (Vercel env var)
 *   3. Copy the auth token into SENTRY_AUTH_TOKEN (Vercel env var, for source maps)
 *   4. Redeploy — first error will appear in Sentry dashboard
 *
 * User identification happens in src/lib/analytics.ts (setSentryUser).
 */

const SENTRY_DSN = process.env.NEXT_PUBLIC_SENTRY_DSN;

if (SENTRY_DSN && SENTRY_DSN.startsWith("https://")) {
  Sentry.init({
    dsn: SENTRY_DSN,

    // Adjust sampling in production for performance monitoring
    tracesSampleRate: process.env.NODE_ENV === "production" ? 0.2 : 1.0,

    // Capture 100% of errors (free tier covers 5K/month, more than enough for beta)
    replaysSessionSampleRate: 0.1,
    replaysOnErrorSampleRate: 1.0,

    // Session replay settings
    integrations: [
      Sentry.replayIntegration({
        // Mask sensitive inputs (passwords, emails) in replays
        maskAllText: true,
        blockAllMedia: false,
      }),
      // Capture console.error and console.warn as breadcrumbs
      Sentry.captureConsoleIntegration({ levels: ["error", "warn"] }),
    ],

    // Filter out known noise
    ignoreErrors: [
      // Browser extension noise
      "ResizeObserver loop completed with undelivered notifications",
      "ResizeObserver loop limit exceeded",
      // Network errors (not actionable)
      "Network request failed",
      "Failed to fetch",
      // Next.js chunk loading (user refreshes mid-load)
      "ChunkLoadError",
      // Cancelled route changes
      "AbortError",
      // Storage quota (handled in-app with toast)
      "QuotaExceededError",
    ],

    // Don't send events from browsers extensions or test runners
    beforeSend(event) {
      // Filter out errors from browser extensions
      if (event.request?.url?.includes("chrome-extension://")) {
        return null;
      }
      if (event.request?.url?.includes("moz-extension://")) {
        return null;
      }
      return event;
    },

    // Environment tagging
    environment: process.env.NODE_ENV === "production" ? "production" : "development",

    // Release tracking (matches Vercel deployment)
    release: process.env.NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA,
  });
}
