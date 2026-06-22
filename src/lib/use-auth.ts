"use client";

import { useEffect, useRef } from "react";
import { useSession } from "next-auth/react";
import { setCurrentUserEmail, isSupabaseConfigured } from "./supabase";
import {
  useAppStore,
  loadFromCloud,
  loadArtistsOnBoot,
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
 * Tutto qui. Niente sidecar restore, niente timeout post-login, niente
 * merge a tre vie. Quelle erano safety-net per il vecchio sistema BYOK
 * dove il sync poteva fallire silenziosamente. Ora le credenziali sono
 * obbligatorie via env vars, quindi il sync non fallisce.
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

  // Step 3: on logout, clear the last-acted email so re-login re-triggers
  // the cloud load.
  useEffect(() => {
    if (status === "unauthenticated") {
      lastActedEmailRef.current = null;
    }
  }, [status]);
}
