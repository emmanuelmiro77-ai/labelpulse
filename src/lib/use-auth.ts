"use client";

import { useEffect, useRef } from "react";
import { useSession } from "next-auth/react";
import { setCurrentUserEmail, isSupabaseConfigured } from "./supabase";
import {
  useAppStore,
  loadFromCloud,
  loadArtistsOnBoot,
  verifyStorageOwner,
  clearAllLocalData,
  setStorageOwner,
} from "./store";

/**
 * Hook that bridges NextAuth session ↔ LabelPulse cloud sync.
 *
 * ⚠️ CLOUD-FIRST (migrazione 2026-06-23):
 * Logica volontariamente SEMPLICE per essere infallibile:
 *
 *  1. Quando l'utente fa login (email disponibile), la passiamo al
 *     modulo cloud-sync così saveStateToCloud / loadStateFromCloud
 *     usano id=email come chiave nella tabella app_state.
 *  2. Al primo login da un'email (o cambio email), chiamiamo
 *     loadFromCloud() — il cloud è la SOURCE OF TRUTH, e i dati
 *     locali vengono mergiati (union by id, non sovrascritura).
 *  3. loadArtistsOnBoot() viene chiamato subito dopo per fare il
 *     merge degli artisti (IDB ↔ cloud).
 *
 * ⚠️ MULTI-USER ISOLATION (2026-06-26):
 *  4. PRIMA di loadFromCloud, verifichiamo che i dati localStorage
 *     appartengano all'utente corrente. Se il proprietario è diverso
 *     (es. user A ha fatto logout e user B fa login sullo stesso
 *     dispositivo), wipe completo di localStorage + IDB. Questo
 *     previene il bug critico dove user B vedeva i dati di user A.
 *  5. Al logout (status → unauthenticated), wipe completo così il
 *     prossimo utente parte da zero.
 *
 * Must be mounted ONCE at the top of the app (inside AuthProvider).
 */
export function useAuthEffect(): void {
  const { data: session, status } = useSession();
  const hasRehydrated = useAppStore((s) => s.hasRehydrated);
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

    // ⚠️ CRITICAL — Multi-user isolation check.
    // If localStorage currently holds another user's data (because the
    // previous user logged out without clearing, or this is a shared
    // device), wipe everything BEFORE we load from cloud. Otherwise the
    // cloud-merge UNION logic would mix the two users' data.
    const wasCleared = verifyStorageOwner(email);
    if (wasCleared) {
      console.info(
        `[LabelPulse Auth] Local data was for a different user — cleared. ` +
        `Loading ${email}'s data from cloud...`
      );
      // After clearing, the store is in seed state. Force hasRehydrated=true
      // so the rest of the app doesn't wait for another rehydration cycle.
      useAppStore.setState({ hasRehydrated: true });
    } else {
      // Same user or first-time — claim ownership if not already set.
      setStorageOwner(email);
    }

    // If Supabase is not configured, log loudly — the user needs to know.
    if (!isSupabaseConfigured()) {
      console.error(
        "[LabelPulse Auth] ⚠️ Supabase non configurato! " +
        "Configura NEXT_PUBLIC_SUPABASE_URL e NEXT_PUBLIC_SUPABASE_ANON_KEY " +
        "nel file .env.local e riavvia l'app. Senza cloud, i dati saranno " +
        "persi cambiando dispositivo."
      );
      return;
    }

    console.info(
      `[LabelPulse Auth] User authenticated (${email}). Loading from cloud...`
    );
    loadFromCloud().then(() => {
      loadArtistsOnBoot().catch((e) =>
        console.warn("[LabelPulse Auth] loadArtistsOnBoot failed:", e)
      );
    }).catch((e) =>
      console.error("[LabelPulse Auth] loadFromCloud failed:", e)
    );
  }, [status, session?.user?.email, hasRehydrated]);

  // Step 3: on logout, wipe ALL local data so the next user starts fresh.
  // This is the second half of the multi-user isolation fix: even if the
  // next login doesn't trigger verifyStorageOwner (e.g., the next user
  // logs in much later), there's no previous user data to leak.
  useEffect(() => {
    if (status === "unauthenticated") {
      lastActedEmailRef.current = null;
      // Clear local data on logout. We do this in a microtask to avoid
      // race conditions with NextAuth's session-clearing redirect.
      // The clear is idempotent — if the user logs back in as the same
      // email, verifyStorageOwner will see no owner and just re-claim.
      console.info("[LabelPulse Auth] User logged out — clearing local data");
      // Defer the clear so React doesn't complain about state updates
      // during render. setTimeout(0) is enough.
      setTimeout(() => {
        try {
          clearAllLocalData();
        } catch (e) {
          console.warn("[LabelPulse Auth] Error clearing local data on logout:", e);
        }
      }, 0);
    }
  }, [status]);
}
