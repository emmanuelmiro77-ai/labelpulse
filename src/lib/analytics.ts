/**
 * Unified analytics + error tracking module.
 *
 * Wraps Bugsnag (errors + breadcrumbs) and PostHog (analytics + feature flags + funnel events).
 * Exposes ONE simple API for the rest of the app — components never import Bugsnag/PostHog directly.
 *
 * Configuration:
 *   - NEXT_PUBLIC_BUGSNAG_API_KEY: Bugsnag API key (client-side, visible in bundle)
 *   - BUGSNAG_API_KEY: Bugsnag API key (server-side, private — optional, falls back to public)
 *   - NEXT_PUBLIC_POSTHOG_KEY: PostHog project API key
 *   - NEXT_PUBLIC_POSTHOG_HOST: PostHog host (default: https://us.i.posthog.com)
 *
 * All tracking is no-op if env vars are missing → safe for local dev without setup.
 *
 * Bugsnag free tier: 7,500 errors/month, 1 seat, 7-day retention.
 * PostHog free tier: 1M events/month, 5K session replays/month.
 *
 * Migration 2026-06-26: switched from Sentry to Bugsnag because Sentry
 * removed free forever tier (now trial-only → $80+/month).
 * See BETA_ROADMAP.md changelog for full justification.
 */

import Bugsnag from "./bugsnag";
import { isBugsnagActive } from "./bugsnag";
import type { User } from "next-auth";

// ============================================================================
// TYPES
// ============================================================================

export type FunnelEvent =
  | "signup_completed"
  | "onboarding_started"
  | "profile_completed"
  | "first_label_added"
  | "first_demo_added"
  | "first_pitch_generated"
  | "first_pitch_sent"
  | "pitch_copied_to_clipboard"
  | "pitch_sent_via_gmail"
  | "pitch_sent_via_inapp"
  | "cloud_sync_triggered"
  | "feedback_submitted"
  | "upgrade_button_clicked";

export interface UserProfile {
  email: string | null;
  artistName?: string;
  plan?: "free" | "pro" | "studio" | "lifetime_ea";
  isBetaTester?: boolean;
}

// ============================================================================
// USER IDENTIFICATION
// ============================================================================

/**
 * Identify user in both Bugsnag and PostHog.
 * Call after successful login (Google OAuth or beta code) and after profile changes.
 */
export function identifyUser(user: UserProfile): void {
  // Bugsnag: set user (id = email to allow searching across sessions)
  // Note: Bugsnag.setUser requires (id, email, name)
  if (isBugsnagActive()) {
    Bugsnag.setUser(
      user.email ?? "anonymous",
      user.email ?? undefined,
      user.artistName ?? undefined,
    );
    // Add custom metadata for filtering in dashboard
    Bugsnag.addMetadata("user", {
      plan: user.plan ?? "free",
      isBetaTester: user.isBetaTester ?? false,
    });
  }

  // PostHog: identify (client-side only — posthog-js is loaded client-side)
  if (typeof window !== "undefined") {
    void import("posthog-js").then(({ default: posthog }) => {
      if (posthog.__loaded) {
        posthog.identify(user.email ?? "anonymous", {
          email: user.email ?? undefined,
          artistName: user.artistName,
          plan: user.plan ?? "free",
          isBetaTester: user.isBetaTester ?? false,
        });
      }
    });
  }
}

/**
 * Clear user identification (call on logout).
 */
export function clearUser(): void {
  // Bugsnag: clear user
  if (isBugsnagActive()) {
    Bugsnag.setUser(undefined, undefined, undefined);
    Bugsnag.clearMetadata("user");
  }

  // PostHog: reset
  if (typeof window !== "undefined") {
    void import("posthog-js").then(({ default: posthog }) => {
      if (posthog.__loaded) {
        posthog.reset();
      }
    });
  }
}

// ============================================================================
// FUNNEL EVENT TRACKING
// ============================================================================

/**
 * Track a funnel event in PostHog.
 *
 * Usage:
 *   trackEvent("signup_completed");
 *   trackEvent("first_pitch_sent", { method: "gmail", labelGenre: "techno" });
 *
 * Bugsnag also receives this as a breadcrumb (for context in error reports).
 */
export function trackEvent(
  event: FunnelEvent,
  properties?: Record<string, string | number | boolean | null | undefined>,
): void {
  // PostHog: track event
  if (typeof window !== "undefined") {
    void import("posthog-js").then(({ default: posthog }) => {
      if (posthog.__loaded) {
        posthog.capture(event, properties);
      }
    });
  } else {
    // Server-side tracking (API routes)
    void import("posthog-node").then(({ PostHog }) => {
      const key = process.env.NEXT_PUBLIC_POSTHOG_KEY;
      const host = process.env.NEXT_PUBLIC_POSTHOG_HOST ?? "https://us.i.posthog.com";
      if (!key) return;
      // Note: PostHog client should ideally be cached, but for simplicity we create per-call
      // For high-traffic API routes, consider using a singleton client
      const client = new PostHog(key, { host });
      // distinctId must be a string — extract email from properties or fallback
      const distinctId =
        (typeof properties?.user_email === "string" ? properties.user_email : null) ??
        (typeof properties?.email === "string" ? properties.email : null) ??
        "server";
      client.capture({
        distinctId,
        event,
        properties: { ...properties, source: "server" },
      });
      void client.shutdown();
    });
  }

  // Bugsnag: leave breadcrumb (will appear in next error report)
  if (isBugsnagActive()) {
    Bugsnag.leaveBreadcrumb(event, properties || {}, "state");
  }
}

// ============================================================================
// ERROR CAPTURE
// ============================================================================

/**
 * Capture an exception with extra context.
 * Use in try/catch blocks where you want to know about errors but not crash the user.
 *
 * Usage:
 *   captureError(err, { context: "Saving label", labelId: id });
 *
 * NOTE: Bugsnag only sends events in production (enabledReleaseStages config).
 * In development, errors are logged to console but not sent.
 */
export function captureError(
  error: unknown,
  context?: Record<string, string | number | boolean | null | undefined>,
): void {
  if (!isBugsnagActive()) {
    // Fallback to console if Bugsnag not configured
    console.error("[captureError]", error, context);
    return;
  }

  // Convert non-Error to Error (Bugsnag prefers Error instances)
  const errorToReport =
    error instanceof Error ? error : new Error(String(error));

  Bugsnag.notify(errorToReport, (event) => {
    if (context) {
      event.addMetadata("context", context);
    }
    // Mark as handled (we're intentionally capturing, not crashing)
    event.unhandled = false;
    event.severity = "error";
  });
}

/**
 * Capture a custom message with severity level.
 *
 * Usage:
 *   captureMessage("Beta code login failed", "warning", { email });
 */
export function captureMessage(
  message: string,
  level: "info" | "warning" | "error" | "fatal" = "info",
  context?: Record<string, string | number | boolean | null | undefined>,
): void {
  if (!isBugsnagActive()) {
    // Fallback to console
    const fn = level === "error" || level === "fatal" ? console.error : console.warn;
    fn(`[captureMessage:${level}]`, message, context);
    return;
  }

  // Bugsnag severity mapping: info → info, warning → warning, error/fatal → error
  const severity = level === "fatal" ? "error" : level;

  Bugsnag.notify(new Error(message), (event) => {
    event.severity = severity as "info" | "warning" | "error";
    event.unhandled = false;
    if (context) {
      event.addMetadata("context", context);
    }
  });
}

// ============================================================================
// FEATURE FLAGS (PostHog only)
// ============================================================================

/**
 * Check if a feature flag is enabled (client-side only).
 * Returns false if PostHog is not loaded.
 *
 * Usage:
 *   if (isFeatureEnabled("beta_scraper_v3")) { ... }
 */
export function isFeatureEnabled(flag: string): boolean {
  if (typeof window === "undefined") return false;
  const w = window as unknown as { posthog?: { isFeatureEnabled: (f: string) => boolean } };
  if (w.posthog?.isFeatureEnabled) {
    return w.posthog.isFeatureEnabled(flag) ?? false;
  }
  return false;
}

/**
 * Feature flags available in LabelPulse.
 * Create these in PostHog Dashboard → Feature Flags.
 *
 * - beta_features_enabled: true for all beta testers (enables experimental features)
 * - beta_scraper_v3: enables the new Beatport scraper v3
 * - beta_artist_explorer: enables the artist explorer tab
 */
export const FEATURE_FLAGS = {
  BETA_FEATURES: "beta_features_enabled",
  SCRAPER_V3: "beta_scraper_v3",
  ARTIST_EXPLORER: "beta_artist_explorer",
} as const;

// ============================================================================
// HELPERS
// ============================================================================

/**
 * Identify user from a NextAuth session object.
 * Convenience wrapper for use in API routes and Server Components.
 */
export function identifyFromSession(session: {
  user?: User | null;
} | null): void {
  if (!session?.user?.email) {
    clearUser();
    return;
  }
  identifyUser({
    email: session.user.email,
    artistName: session.user.name ?? undefined,
    isBetaTester: true, // TODO: check against beta_access_codes table
  });
}
