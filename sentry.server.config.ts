import * as Sentry from "@sentry/nextjs";

/**
 * Sentry server-side configuration (Node.js runtime).
 *
 * Activates only if SENTRY_DSN is set (server-side env var, no NEXT_PUBLIC_ prefix).
 * Captures errors from API routes and Server Components.
 */

const SENTRY_DSN = process.env.SENTRY_DSN || process.env.NEXT_PUBLIC_SENTRY_DSN;

if (SENTRY_DSN && SENTRY_DSN.startsWith("https://")) {
  Sentry.init({
    dsn: SENTRY_DSN,

    // Lower sampling for server (high traffic)
    tracesSampleRate: 0.1,

    // Environment tagging
    environment: process.env.NODE_ENV === "production" ? "production" : "development",

    release: process.env.NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA,

    // Filter known noise
    ignoreErrors: [
      "connect ETIMEDOUT",
      "connect ECONNREFUSED",
      "ECONNRESET",
    ],
  });
}
