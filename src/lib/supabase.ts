"use client";

import { createClient, SupabaseClient } from "@supabase/supabase-js";
import { useAppStore } from "./store";

// ==================== SUPABASE CLIENT (BYOK) ====================
// Client-side Supabase per la sincronizzazione cloud dei dati.
//
// Le credenziali (URL + anon key) vengono fornite dall'utente tramite la
// pagina Profilo (sezione "Sincronizzazione Cloud"). Vengono salvate nel
// localStorage (nel campo userProfile) e usate per creare dinamicamente il
// client Supabase. Questo approccio "Bring Your Own Key" permette:
//   - sync reale tra PC e telefono (ciascun device usa le stesse credenziali)
//   - l'utente è libero di cambiare progetto Supabase quando vuole
//   - nessun segreto nell'.env (che potrebbe sparire nei deploy)

// ==================== STATE TRACKING ====================

export type CloudSyncStatus =
  | "unconfigured"   // nessuna credenziale
  | "connecting"     // credenziali presenti, caricando dati iniziali
  | "synced"         // ultimo sync riuscito
  | "syncing"        // sync in corso
  | "error";         // ultimo sync fallito

let _supabase: SupabaseClient | null = null;
let _currentCredsKey: string = ""; // stringa "url|key" usata per detectare cambi
let _status: CloudSyncStatus = "unconfigured";
let _lastSyncAt: string | null = null;
let _lastError: string | null = null;
let _realtimeChannel: any = null;
let _isApplyingRemoteUpdate: boolean = false; // evita loop di sync

type Listener = () => void;
const listeners = new Set<Listener>();

export function getCloudStatus(): CloudSyncStatus {
  return _status;
}

export function getLastSyncAt(): string | null {
  return _lastSyncAt;
}

export function getLastError(): string | null {
  return _lastError;
}

export function subscribeToCloudStatus(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function setStatus(newStatus: CloudSyncStatus, errorMsg: string | null = null) {
  _status = newStatus;
  if (errorMsg !== null) _lastError = errorMsg;
  if (newStatus === "synced" || newStatus === "syncing") {
    _lastError = null;
  }
  if (newStatus === "synced") {
    _lastSyncAt = new Date().toISOString();
  }
  listeners.forEach((l) => l());
}

// ==================== CREDENTIALS DETECTION ====================

/**
 * Read Supabase credentials from the Zustand store (userProfile).
 * Falls back to env vars if set (for backward compatibility).
 */
function readCredentials(): { url: string; anonKey: string } {
  if (typeof window !== "undefined") {
    try {
      const state = useAppStore.getState();
      const url = (state.userProfile as any)?.supabaseUrl?.trim() || "";
      const anonKey = (state.userProfile as any)?.supabaseAnonKey?.trim() || "";
      if (url && anonKey) return { url, anonKey };
    } catch {
      // store not ready yet
    }
  }
  // Fallback to env vars (legacy)
  const envUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
  const envKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";
  return { url: envUrl, anonKey: envKey };
}

/**
 * Whether the user has provided Supabase credentials (either BYOK or env).
 */
export function isSupabaseConfigured(): boolean {
  const { url, anonKey } = readCredentials();
  return !!(url && anonKey);
}

/**
 * Get or create the Supabase client. If the credentials have changed
 * since the last call, a new client is created and the old realtime
 * channel is torn down.
 */
export function getSupabase(): SupabaseClient | null {
  if (typeof window === "undefined") return null;

  const { url, anonKey } = readCredentials();
  if (!url || !anonKey) {
    // No credentials — reset everything
    if (_supabase) {
      teardownRealtime();
      _supabase = null;
      _currentCredsKey = "";
    }
    if (_status !== "unconfigured" && _status !== "error") {
      setStatus("unconfigured");
    }
    return null;
  }

  const credsKey = `${url}|${anonKey}`;
  if (_supabase && _currentCredsKey === credsKey) {
    return _supabase;
  }

  // Credentials changed (or first time) — create a fresh client
  try {
    if (_supabase) {
      teardownRealtime();
      _supabase = null;
    }
    _supabase = createClient(url, anonKey, {
      auth: { persistSession: false },
    });
    _currentCredsKey = credsKey;
    return _supabase;
  } catch (err) {
    console.error("[LabelPulse Cloud] Failed to create client:", err);
    setStatus("error", err instanceof Error ? err.message : String(err));
    return null;
  }
}

// ==================== CLOUD SYNC FUNCTIONS ====================

const CLOUD_TABLE = "app_state";
const CLOUD_ROW_ID = "default";

/**
 * Salva lo stato completo dell'app su Supabase.
 * Usa upsert per creare o aggiornare il record.
 */
export async function saveStateToCloud(data: object): Promise<boolean> {
  const supabase = getSupabase();
  if (!supabase) return false;

  setStatus("syncing");

  try {
    const { error } = await supabase.from(CLOUD_TABLE).upsert(
      {
        id: CLOUD_ROW_ID,
        data: data,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "id" }
    );

    if (error) {
      console.error("[LabelPulse Cloud] Save error:", error.message);
      setStatus("error", error.message);
      return false;
    }

    setStatus("synced");
    return true;
  } catch (err) {
    console.error("[LabelPulse Cloud] Save exception:", err);
    setStatus("error", err instanceof Error ? err.message : String(err));
    return false;
  }
}

/**
 * Carica lo stato completo dell'app da Supabase.
 * Ritorna null se non ci sono dati o se Supabase non è configurato.
 */
export async function loadStateFromCloud(): Promise<object | null> {
  const supabase = getSupabase();
  if (!supabase) return null;

  try {
    const { data, error } = await supabase
      .from(CLOUD_TABLE)
      .select("data, updated_at")
      .eq("id", CLOUD_ROW_ID)
      .single();

    if (error) {
      if (error.code === "PGRST116") {
        // No rows returned — first time, no data in cloud yet
        return null;
      }
      console.error("[LabelPulse Cloud] Load error:", error.message);
      setStatus("error", error.message);
      return null;
    }

    if (!data?.data || Object.keys(data.data).length === 0) {
      return null;
    }

    setStatus("synced");
    return data.data as object;
  } catch (err) {
    console.error("[LabelPulse Cloud] Load exception:", err);
    setStatus("error", err instanceof Error ? err.message : String(err));
    return null;
  }
}

// ==================== REALTIME SUBSCRIPTION ====================

/**
 * Subscribe to changes on the app_state row so that updates from
 * other devices (PC ↔ phone) are reflected in near-real-time.
 *
 * When a remote UPDATE arrives, we:
 *   1. set _isApplyingRemoteUpdate = true (so we don't bounce the change back)
 *   2. fetch the latest data from cloud
 *   3. merge it into the local store
 *   4. set _isApplyingRemoteUpdate = false
 */
export function setupRealtimeSubscription(): () => void {
  const supabase = getSupabase();
  if (!supabase) return () => {};

  // Tear down any existing channel first
  teardownRealtime();

  try {
    const channel = supabase
      .channel("app_state_changes")
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: CLOUD_TABLE,
          filter: `id=eq.${CLOUD_ROW_ID}`,
        },
        (payload: any) => {
          // Skip our own updates to avoid feedback loops
          if (_isApplyingRemoteUpdate) return;

          const newData = payload?.new?.data;
          const newUpdatedAt = payload?.new?.updated_at;
          if (!newData) return;

          console.log(
            "[LabelPulse Cloud] Realtime update received, updated_at:",
            newUpdatedAt
          );

          // Apply the remote data to the local store
          _isApplyingRemoteUpdate = true;
          try {
            applyRemoteData(newData);
            setStatus("synced");
          } finally {
            _isApplyingRemoteUpdate = false;
          }
        }
      )
      .subscribe((status: string) => {
        if (status === "SUBSCRIBED") {
          console.log("[LabelPulse Cloud] Realtime subscription active");
        } else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
          console.warn("[LabelPulse Cloud] Realtime subscription issue:", status);
        }
      });

    _realtimeChannel = channel;
    return teardownRealtime;
  } catch (err) {
    console.warn("[LabelPulse Cloud] Realtime setup failed:", err);
    return () => {};
  }
}

function teardownRealtime() {
  if (_realtimeChannel) {
    try {
      const supabase = _supabase;
      if (supabase) {
        supabase.removeChannel(_realtimeChannel);
      }
    } catch {
      // ignore
    }
    _realtimeChannel = null;
  }
}

/**
 * Returns true if the current saveStateToCloud call should be skipped
 * because we're applying a remote update (avoids loop).
 */
export function isApplyingRemoteUpdate(): boolean {
  return _isApplyingRemoteUpdate;
}

/**
 * Apply remote data to the local store. Uses the same merge logic
 * as loadFromCloud().
 */
function applyRemoteData(cloudData: any): void {
  // Lazy require to avoid circular import
  const store = useAppStore.getState();
  const localLastSavedAt = store.lastSavedAt
    ? new Date(store.lastSavedAt).getTime()
    : 0;
  const cloudLastSavedAt = cloudData?.lastSavedAt
    ? new Date(cloudData.lastSavedAt).getTime()
    : 0;

  // Only apply if cloud is newer than local
  if (cloudLastSavedAt <= localLastSavedAt) {
    return;
  }

  // Use the existing mergeCloudData by importing it from store
  // (dynamic to avoid circular deps at module load)
  // We'll just call setState with the relevant fields.
  const merged: any = {};

  if (cloudData.labels && Array.isArray(cloudData.labels)) {
    merged.labels = cloudData.labels;
  }
  if (cloudData.demos && Array.isArray(cloudData.demos)) {
    merged.demos = cloudData.demos;
  }
  if (cloudData.userProfile) {
    // Preserve BYOK credentials — never overwrite with cloud versions
    // (they're already the same since they ARE the cloud credentials)
    merged.userProfile = {
      ...cloudData.userProfile,
      // Keep local BYOK fields as source of truth
      supabaseUrl: store.userProfile.supabaseUrl,
      supabaseAnonKey: store.userProfile.supabaseAnonKey,
      cyaniteApiToken: store.userProfile.cyaniteApiToken,
    };
  }
  if (cloudData.gmailAuth) merged.gmailAuth = cloudData.gmailAuth;
  if (cloudData.rankingsUpdatedAt !== undefined) {
    merged.rankingsUpdatedAt = cloudData.rankingsUpdatedAt;
  }
  if (cloudData.lastSavedAt) merged.lastSavedAt = cloudData.lastSavedAt;
  if (Array.isArray(cloudData.rankingSnapshots)) {
    merged.rankingSnapshots = cloudData.rankingSnapshots;
  }
  if (cloudData.locale) merged.locale = cloudData.locale;

  useAppStore.setState(merged);
}
