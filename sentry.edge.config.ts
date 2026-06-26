import * as Sentry from "@sentry/nextjs";

/**
 * Sentry edge runtime configuration (Middleware, Edge API routes).
 *
 * Activates only if SENTRY_DSN is set.
 */

const SENTRY_DSN = process.env.SENTRY_DSN || process.env.NEXT_PUBLIC_SENTRY_DSN;

if (SENTRY_DSN && SENTRY_DSN.startsWith("https://")) {
  Sentry.init({
    dsn: SENTRY_DSN,
    tracesSampleRate: 0.1,
    environment: process.env.NODE_ENV === "production" ? "production" : "development",
    release: process.env.NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA,
  });
}
