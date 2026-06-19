"use client";

import { useEffect, useRef } from "react";
import { useSession } from "next-auth/react";
import { setCurrentUserEmail, isSupabaseConfigured } from "./supabase";
import {
  useAppStore,
  loadFromCloud,
  forceCloudSync,
  restoreProfileFromSidecar,
  restoreSnapshotsFromSidecar,
} from "./store";

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
 *  3. BEFORE pulling from cloud, restore the user profile from the sidecar
 *     backup. This is the safety net: if the cloud has no data for this
 *     email yet (first login from this account) but the user has a profile
 *     saved locally in PROFILE_BACKUP_KEY, that profile gets restored so
 *     the user doesn't see an empty artistName/bio/links after login.
 *  4. When a session becomes unauthenticated (user logged out), optionally
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

    // ⚠️ BEFORE doing anything with the cloud, restore the user profile
    // from the sidecar backup. This ensures that even if the cloud sync
    // ends up pulling nothing (first login from this email) or wiping
    // the store, the user's identity (artistName, bio, email, links)
    // is preserved from local sidecar.
    try {
      const profileRestored = restoreProfileFromSidecar();
      const snapshotsRestored = restoreSnapshotsFromSidecar();
      if (profileRestored || snapshotsRestored > 0) {
        console.info(
          `[LabelPulse Auth] Pre-cloud-restore: profile=${profileRestored ? "OK" : "niente"}, snapshots=${snapshotsRestored} recuperati.`
        );
      }
    } catch (e) {
      console.warn("[LabelPulse Auth] Sidecar restore failed:", e);
    }

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
      // ⚠️ CRITICAL FIX: do NOT blindly forceCloudSync after loadFromCloud.
      // The old code did `setTimeout(() => forceCloudSync(), 1000)` which
      // would take the local state (possibly empty seed) and write it to
      // cloud, OVERWRITING the user's cloud profile with empty data.
      // This was the root cause of the "profile data loss on re-login" bug.
      //
      // Instead, only push to cloud if local genuinely has real data that
      // cloud doesn't (e.g., the user entered data on this device before
      // logging in, or restored from sidecar). When in doubt, do nothing —
      // the user's next edit will trigger syncToCloud naturally.
      setTimeout(() => {
        try {
          const s = useAppStore.getState();
          const localProfileHasData =
            !!s.userProfile?.artistName ||
            !!s.userProfile?.bio ||
            !!s.userProfile?.email ||
            !!s.userProfile?.scLink ||
            !!s.userProfile?.photoUrl ||
            (Array.isArray(s.userProfile?.links) && s.userProfile.links.length > 0);
          const localHasDemos = s.demos.length > 0;
          const localHasSnapshots = s.rankingSnapshots.length > 0;
          if (localProfileHasData || localHasDemos || localHasSnapshots) {
            console.info(
              "[LabelPulse Auth] Local has real data after cloud load — pushing to cloud to backfill."
            );
            forceCloudSync();
          } else {
            console.info(
              "[LabelPulse Auth] Local is empty after cloud load — NOT pushing to cloud (would overwrite cloud with empty data)."
            );
          }
        } catch (e) {
          console.warn("[LabelPulse Auth] Post-cloud sync check failed:", e);
        }
      }, 1000);

      // ⚠️ POST-CLOUD SAFETY NET: after cloud sync, the cloud might have
      // sent an empty/partial profile (e.g., a fresh cloud row). Re-restore
      // from sidecar if the live profile is now empty but the sidecar had data.
      setTimeout(() => {
        try {
          const again = restoreProfileFromSidecar();
          if (again) {
            console.info(
              "[LabelPulse Auth] Post-cloud profile restore triggered — re-pushing to cloud."
            );
            setTimeout(() => forceCloudSync(), 500);
          }
        } catch {}
      }, 2500);
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
