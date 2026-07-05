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
  loadFromNewTables,
} from "./store";
import { identifyUser, clearUser, trackEvent } from "./analytics";
import { startOutboxAutoFlush, pauseOutboxFlush, resumeOutboxFlush, onCloudConflict } from "./outbox";

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
  const lastActedEmailRef = useRef<string | null>(null);

  // Step 0: avvia SEMPRE la coda di retry per le scritture verso il cloud,
  // indipendentemente da login/logout — se ci sono operazioni rimaste in
  // sospeso da una sessione precedente (rete assente, tab chiusa troppo
  // presto), vanno ritentate appena l'app si riapre.
  useEffect(() => {
    startOutboxAutoFlush();
    // 🔒 RACE CONDITION FIX: registra callback per ricaricare dal cloud su 409
    onCloudConflict(() => {
      console.log("[LabelPulse Auth] 🔄 409 conflict detected — reloading from cloud");
      loadFromNewTables().catch(() => {});
    });
  }, []);

  // Step 1: keep the cloud-sync module informed about the current user.
  useEffect(() => {
    const email = (session?.user?.email ?? null) as string | null;
    setCurrentUserEmail(email);
  }, [session?.user?.email]);

  // Step 2: CLOUD-FIRST BOOT — quando l'utente è autenticato, fetcha
  // SUBITO dal cloud. NON aspettare hasRehydrated — il cloud è la verità.
  useEffect(() => {
    if (status !== "authenticated") return;
    const email = (session?.user?.email ?? null) as string | null;
    if (!email) return;
    if (lastActedEmailRef.current === email) return;
    lastActedEmailRef.current = email;

    console.info(`[LabelPulse Auth] 🔑 User authenticated (${email}). Cloud-first boot...`);

    // Multi-user isolation: pulisci se il proprietario è diverso
    const wasCleared = verifyStorageOwner(email);
    if (wasCleared) {
      console.info(`[LabelPulse Auth] Local data was for a different user — cleared.`);
    } else {
      setStorageOwner(email);
    }

    // Imposta email per cloud sync
    setCurrentUserEmail(email);

    // If Supabase is not configured, log loudly
    if (!isSupabaseConfigured()) {
      console.error("[LabelPulse Auth] ⚠️ Supabase non configurato!");
      return;
    }

    // Track login
    identifyUser({
      email,
      artistName: session?.user?.name ?? undefined,
      isBetaTester: true,
    });
    trackEvent("signup_completed", { login_method: "google" });

    // 🔒 CLOUD-FIRST: fetcha TUTTO dal cloud e REPLICE lo stato locale.
    // Niente merge, niente union. Il cloud è l'unica verità.
    console.info("[LabelPulse Auth] ☁️ Syncing with Supabase...");

    // 🔒 CRITICAL: Pausa l'outbox PRIMA del fetch per evitare race condition.
    pauseOutboxFlush();

    Promise.all([
      loadFromCloud(),
      loadFromNewTables(),
    ]).then(() => {
      console.info("[LabelPulse Auth] ✅ Cloud sync complete. State replaced.");
      useAppStore.setState({ hasRehydrated: true, hasCloudSynced: true });
      // 🔒 Riprendi l'outbox — i dati cloud sono arrivati
      resumeOutboxFlush();
      loadArtistsOnBoot().catch(() => {});
    }).catch((err) => {
      console.error("[LabelPulse Auth] ❌ Cloud sync failed:", err);
      useAppStore.setState({ hasRehydrated: true, hasCloudSynced: true });
      // 🔒 Riprendi l'outbox anche in caso di fallimento
      resumeOutboxFlush();
    });
  }, [status, session?.user?.email]);

  // Step 3: on logout, wipe ALL local data so the next user starts fresh.
  // This is the second half of the multi-user isolation fix: even if the
  // next login doesn't trigger verifyStorageOwner (e.g., the next user
  // logs in much later), there's no previous user data to leak.
  useEffect(() => {
    if (status === "unauthenticated") {
      lastActedEmailRef.current = null;
      // Clear analytics identity on logout
      clearUser();
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

  // Step 4: rete di sicurezza — il realtime (use-realtime-sync.ts) richiede un
  // JWT Supabase valido, che scade dopo circa un'ora e NON viene mai
  // rinnovato automaticamente in questa versione. Se scade, il realtime
  // smette di aggiornare silenziosamente, senza errori visibili. Per non
  // dipendere solo da quello, ricarichiamo comunque le 5 tabelle dedicate:
  //  - ogni volta che la tab torna visibile (l'utente torna sull'app)
  //  - ogni 3 minuti mentre la tab è aperta e visibile
  // Così, anche nel caso peggiore (realtime morto), il ritardo massimo per
  // vedere una modifica fatta su un altro dispositivo è di pochi minuti,
  // non "mai finché non fai logout/login".
  useEffect(() => {
    if (status !== "authenticated") return;
    const email = (session?.user?.email ?? null) as string | null;
    if (!email || !isSupabaseConfigured()) return;

    const safeReload = () => {
      loadFromNewTables().catch((e) =>
        console.warn("[LabelPulse Auth] periodic loadFromNewTables failed:", e)
      );
    };

    const onVisibility = () => {
      if (document.visibilityState === "visible") safeReload();
    };
    document.addEventListener("visibilitychange", onVisibility);
    const interval = setInterval(safeReload, 3 * 60 * 1000);

    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      clearInterval(interval);
    };
  }, [status, session?.user?.email]);
}
