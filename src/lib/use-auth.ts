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
  setAutoBackupEmail,
  restoreFromSnapshot,
} from "./store";
import { identifyUser, clearUser, trackEvent } from "./analytics";

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

    // 🔒 FIX: Salva SEMPRE l'email di NextAuth nel userProfile DOPO verifyStorageOwner.
    // verifyStorageOwner potrebbe chiamare clearAllLocalData() che resetta userProfile.email="".
    // Chiamando setUserProfile DOPO, l'email viene ripristinata correttamente.
    useAppStore.getState().setUserProfile({ email });

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

    // 🔒 AUTO-BACKUP: attiva il salvataggio automatico per questo utente.
    // Da ora, ogni modifica allo stato viene salvata su IndexedDB keyed per email.
    setAutoBackupEmail(email);

    // 🔒 CLOUD-FIRST PURO: fetcha TUTTO dal cloud e REPLICE lo stato locale.
    // Niente merge, niente union. Il cloud è l'unica verità.
    // Se il cloud fallisce o ritorna vuoto, fallback su auto-backup IndexedDB.
    console.info("[LabelPulse Auth] ☁️ Syncing with Supabase...");

    // 🔒 FIX COMMIT 3: Timeout di 15s sul cloud sync. Se Supabase non risponde
    // (rete lenta, Vercel cold start, Supabase down), fallback su snapshot locale
    // invece di bloccare l'app indefinitamente.
    const cloudSyncPromise = Promise.all([
      loadFromCloud(),
      loadFromNewTables(),
    ]);

    const timeoutPromise = new Promise<never>((_, reject) => {
      setTimeout(() => reject(new Error("Cloud sync timeout (15s)")), 15000);
    });

    Promise.race([cloudSyncPromise, timeoutPromise])
      .then(async () => {
        console.info("[LabelPulse Auth] ✅ Cloud sync complete. State replaced.");

        // 🔒 DIAGNOSTICA: logga cosa è arrivato dal cloud
        const state = useAppStore.getState();
        const labelsWithUserData = state.labels.filter((l: any) =>
          (l.emails && l.emails.length > 0) ||
          (l.notes && l.notes.trim() !== "") ||
          (l.website && l.website.trim() !== "") ||
          l.isCustom === true
        ).length;

        console.log("[LabelPulse Auth] Cloud sync result:", {
          labels: state.labels.length,
          labelsWithUserData,
          demos: state.demos.length,
          savedPitches: state.savedPitches.length,
          sentCampaigns: state.sentCampaigns.length,
          hasArtistName: !!state.userProfile?.artistName,
          hasBio: !!state.userProfile?.bio,
          hasPhoto: !!state.userProfile?.photoUrl,
          hasScLink: !!state.userProfile?.scLink,
          rankingSnapshots: state.rankingSnapshots?.length || 0,
        });

        useAppStore.setState({ hasRehydrated: true, hasCloudSynced: true });

        // 🔒 AUTO-BACKUP FALLBACK: se il cloud sync ha ritornato stati vuoti
        // per i dati PERSONALI dell'utente (profilo vuoto, 0 demo, 0 label
        // personalizzate, 0 pitch), ripristina dall'ultimo snapshot.
        const hasUserData =
          (state.userProfile?.artistName && state.userProfile.artistName.trim() !== "") ||
          (state.userProfile?.bio && state.userProfile.bio.trim() !== "") ||
          (state.userProfile?.photoUrl && state.userProfile.photoUrl.trim() !== "") ||
          (state.userProfile?.scLink && state.userProfile.scLink.trim() !== "") ||
          state.demos.length > 0 ||
          labelsWithUserData > 0 ||
          state.savedPitches.length > 0 ||
          state.sentCampaigns.length > 0;

        if (!hasUserData) {
          console.warn("[LabelPulse Auth] ⚠️ Cloud sync returned empty user data — trying snapshot restore");
          const restored = await restoreFromSnapshot(email);
          if (restored) {
            console.info("[LabelPulse Auth] ✅ State restored from local snapshot");
          } else {
            console.warn("[LabelPulse Auth] No snapshot available for restore — user is new or first device");
          }
        }

        loadArtistsOnBoot().catch(() => {});
      })
      .catch(async (err) => {
        console.error("[LabelPulse Auth] ❌ Cloud sync failed:", err);
        // 🔒 AUTO-BACKUP FALLBACK: se il cloud sync fallisce o va in timeout,
        // ripristina dall'ultimo snapshot locale per non bloccare l'utente
        console.info("[LabelPulse Auth] 🔄 Attempting snapshot restore due to cloud failure");
        const restored = await restoreFromSnapshot(email);
        if (restored) {
          console.info("[LabelPulse Auth] ✅ State restored from local snapshot after cloud failure");
        } else {
          console.warn("[LabelPulse Auth] No snapshot available — starting with seed data");
        }
        useAppStore.setState({ hasRehydrated: true, hasCloudSynced: true });
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
