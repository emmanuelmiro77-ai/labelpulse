"use client";

import { useEffect, useState } from "react";
import posthog from "posthog-js";
import { PostHogProvider as PHProvider } from "posthog-js/react";

/**
 * PostHog Provider wrapper.
 *
 * Initializes PostHog only if NEXT_PUBLIC_POSTHOG_KEY is set.
 * Otherwise renders children as-is (no tracking, no errors).
 *
 * Usage in layout.tsx:
 *   <PostHogProvider>
 *     {children}
 *   </PostHogProvider>
 *
 * Components should use trackEvent() from @/lib/analytics instead of
 * calling posthog directly — that way they work in both client and server contexts.
 */

export function PostHogProvider({ children }: { children: React.ReactNode }) {
  const [initialized, setInitialized] = useState(false);

  useEffect(() => {
    const key = process.env.NEXT_PUBLIC_POSTHOG_KEY;
    const host = process.env.NEXT_PUBLIC_POSTHOG_HOST ?? "https://us.i.posthog.com";

    if (!key || typeof window === "undefined") return;
    if (posthog.__loaded) {
      setInitialized(true);
      return;
    }

    posthog.init(key, {
      api_host: host,
      // Disable in development to avoid polluting analytics
      // Override with NEXT_PUBLIC_POSTHOG_FORCE=true to enable in dev
      loaded: (ph) => {
        ph.__loaded = true;
      },
      // Capture page views automatically
      capture_pageview: true,
      capture_pageleave: true,
      // Session recording for beta (sample 20% to stay under free tier limits)
      disable_session_recording: false,
      // Respect Do Not Track header
      respect_dnt: true,
      // Disable cookies (use localStorage — more privacy-friendly)
      persistence: "localStorage",
      // Disable in development unless explicitly enabled
      opt_out_capturing_by_default: process.env.NODE_ENV !== "production" && process.env.NEXT_PUBLIC_POSTHOG_FORCE !== "true",
      // Sanitize URLs (remove label IDs etc)
      property_denylist: [
        "$set",
        "$set_once",
      ],
      // Enable autocapture for a/b testing (button clicks, form submits)
      autocapture: true,
    });

    // Mark as loaded for the analytics module to detect
    posthog.__loaded = true;

    // Expose on window for the isFeatureEnabled sync check
    (window as unknown as { posthog: typeof posthog }).posthog = posthog;

    setInitialized(true);
  }, []);

  // Render children even before PostHog initializes (no UI block)
  // PostHog will queue events and flush when ready
  if (!initialized) {
    return <>{children}</>;
  }

  return <PHProvider client={posthog}>{children}</PHProvider>;
}
