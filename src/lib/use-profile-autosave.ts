"use client";

import { useEffect } from "react";
import { initProfileAutosave } from "./store";

/**
 * 🔒 FASE 6A — Hook dedicato all'inizializzazione del controller di
 * autosave del profilo.
 *
 * Responsabilità: registra UNA VOLTA (al mount) i listener di unload
 * (visibilitychange / pagehide / beforeunload) che chiamano
 * flushProfileSave() con keepalive per garantire il salvataggio del
 * profilo prima che la tab venga chiusa.
 *
 * Non contiene logica di autenticazione. Non dipende da useSession,
 * useAuthEffect, o dal modulo use-auth.ts. Vive in un modulo a sé
 * stante, parallelo a:
 *   - use-auth.ts         (logica di autenticazione)
 *   - use-realtime-sync.ts (sottoscrizioni Realtime Supabase)
 *
 * Da chiamare una sola volta al bootstrap dell'app (page.tsx), accanto
 * a useAuthEffect() e useRealtimeSync().
 */
export function useProfileAutosave(): void {
  useEffect(() => {
    initProfileAutosave();
  }, []);
}
