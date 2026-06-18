"use client";

import { useEffect, useRef } from "react";
import { useSession } from "next-auth/react";
import { setCurrentUserEmail, isSupabaseConfigured } from "./supabase";
import { useAppStore, loadFromCloud, forceCloudSync } from "./store";

/**
 * Hook that bridges NextAuth session ↔ LabelPulse cloud sync.
 *
 * Responsibilities:
 *  1. Push the current user's email into the cloud-sync module so that
 *     saveStateToCloud / loadStateFromCloud use the correct row id
 *     (the user's email instead of the legacy "default").
 *  2. When a session becomes authenticated (user just logged in), trigger
 *     loadFromCloud() so that the local store gets populated from the user's
 *     cloud row. This is what makes "open the app on a new phone → login →
 *     all my data appears" work.
 *  3. When a session becomes unauthenticated (user logged out), optionally
 *     reset the local store to seed data so the next user starts fresh.
 *
 * Must be mounted ONCE at the top of the app (inside AuthProvider, e.g., in
 * the root page). Calling this hook multiple times is safe but wasteful.
 */
export function useAuthEffect(): void {
  const { data: session, status } = useSession();
  const hasRehydrated = useAppStore((s) => s.hasRehydrated);
  const hasCloudSynced = useAppStore((s) => s.hasCloudSynced);
  // Track the last email we acted on, so we only fire loadFromCloud() once
  // per actual email change (not on every status flicker).
  const lastActedEmailRef = useRef<string | null>(null);

  // Step 1: keep the cloud-sync module informed about the current user.
  useEffect(() => {
    const email = (session?.user?.email ?? null) as string | null;
    setCurrentUserEmail(email);
  }, [session?.user?.email]);

  // Step 2: when a session is authenticated AND the store has rehydrated
  // AND we haven't already acted for this email, pull from cloud.
  useEffect(() => {
    if (status !== "authenticated") return;
    if (!hasRehydrated) return; // wait for localStorage to load
    const email = (session?.user?.email ?? null) as string | null;
    if (!email) return;
    if (lastActedEmailRef.current === email) return;
    lastActedEmailRef.current = email;

    // Only trigger cloud pull if Supabase is configured (BYOK or env vars).
    // If not configured, the user can still use the app locally — they'll
    // just not have multi-device sync until they set credentials in Profile.
    if (!isSupabaseConfigured()) {
      console.info(
        "[LabelPulse Auth] User is logged in but Supabase is not configured. " +
        "Multi-device sync is OFF until credentials are set in Profile."
      );
      return;
    }

    console.info(
      `[LabelPulse Auth] User authenticated (${email}). Triggering cloud load.`
    );
    loadFromCloud().then(() => {
      // After loading, force an upload so any local-only changes (e.g., labels
      // the user edited on this device before logging in) get pushed to the
      // cloud. loadFromCloud already does this if cloud was empty, but if the
      // cloud had data we want to ensure local newer changes are not lost.
      setTimeout(() => forceCloudSync(), 1000);
    });
  }, [status, session?.user?.email, hasRehydrated, hasCloudSynced]);

  // Step 3: on logout, clear the last-acted email so re-login re-triggers
  // the cloud load. We do NOT wipe the local store on logout — that would
  // be destructive (the user might just be switching accounts on a shared
  // device, and we want their data to still be there if they log back in).
  // If the user wants a full wipe, they can use the "Reset data" button.
  useEffect(() => {
    if (status === "unauthenticated") {
      lastActedEmailRef.current = null;
    }
  }, [status]);
}
