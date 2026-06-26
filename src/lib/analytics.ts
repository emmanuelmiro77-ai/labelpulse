/**
 * Unified analytics + error tracking module.
 *
 * Wraps Sentry (errors + session replay) and PostHog (analytics + feature flags + funnel events).
 * Exposes ONE simple API for the rest of the app — components never import Sentry/PostHog directly.
 *
 * Configuration:
 *   - NEXT_PUBLIC_SENTRY_DSN: Sentry DSN (client)
 *   - SENTRY_DSN: Sentry DSN (server, optional fallback)
 *   - NEXT_PUBLIC_POSTHOG_KEY: PostHog project API key
 *   - NEXT_PUBLIC_POSTHOG_HOST: PostHog host (default: https://us.i.posthog.com)
 *
 * All tracking is no-op if env vars are missing → safe for local dev without setup.
 */

import * as Sentry from "@sentry/nextjs";
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
 * Identify user in both Sentry and PostHog.
 * Call after successful login (Google OAuth or beta code) and after profile changes.
 *
 * On server-side calls (API routes), only Sentry is updated.
 * On client-side calls, both Sentry and PostHog are updated.
 */
export function identifyUser(user: UserProfile): void {
  // Sentry: set user tag
  Sentry.setUser({
    email: user.email ?? undefined,
    username: user.artistName,
    // Custom properties
    plan: user.plan ?? "free",
    isBetaTester: user.isBetaTester ?? false,
  });

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
  Sentry.setUser(null);

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
 * Sentry also receives this as a breadcrumb (for context in error reports).
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

  // Sentry: add breadcrumb (will appear in next error report)
  Sentry.addBreadcrumb({
    category: "funnel",
    message: event,
    level: "info",
    data: properties,
  });
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
 */
export function captureError(
  error: unknown,
  context?: Record<string, string | number | boolean | null | undefined>,
): void {
  Sentry.captureException(error, {
    extra: context,
  });
}

/**
 * Capture a custom message (for non-error events worth tracking).
 *
 * Usage:
 *   captureMessage("Beta code login failed", "warning", { email });
 */
export function captureMessage(
  message: string,
  level: "info" | "warning" | "error" | "fatal" = "info",
  context?: Record<string, string | number | boolean | null | undefined>,
): void {
  Sentry.captureMessage(message, level);
  if (context) {
    Sentry.addBreadcrumb({
      category: "message",
      message,
      level: level === "fatal" ? "error" : level,
      data: context,
    });
  }
}

// ============================================================================
// FEATURE FLAGS (PostHog)
// ============================================================================

/**
 * Check if a feature flag is enabled (client-side only).
 * Returns false if PostHog is not loaded.
 *
 * Usage:
 *   if (isFeatureEnabled("beta_scraper_v3")) { ... }
 *
 * For server-side flag checks, use checkFeatureFlagServer().
 */
export function isFeatureEnabled(flag: string): boolean {
  if (typeof window === "undefined") return false;
  // Synchronous check after posthog has loaded
  let enabled = false;
  // We can't synchronously import here because posthog is dynamically loaded
  // Instead, expose posthog on window for direct access
  const w = window as unknown as { posthog?: { isFeatureEnabled: (f: string) => boolean } };
  if (w.posthog?.isFeatureEnabled) {
    enabled = w.posthog.isFeatureEnabled(flag) ?? false;
  }
  return enabled;
}

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
