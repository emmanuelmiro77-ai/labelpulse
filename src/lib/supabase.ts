"use client";

import { createClient, SupabaseClient } from "@supabase/supabase-js";
import { useAppStore, mergeProfiles } from "./store";

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
 *
 * IMPORTANT: The URL is normalized via normalizeSupabaseUrl() before use.
 * This handles common user mistakes like pasting the dashboard URL
 * (https://supabase.com/dashboard/project/<ref>) instead of the API URL
 * (https://<ref>.supabase.co).
 */
function readCredentials(): { url: string; anonKey: string } {
  if (typeof window !== "undefined") {
    try {
      const state = useAppStore.getState();
      const rawUrl = (state.userProfile as any)?.supabaseUrl?.trim() || "";
      const anonKey = (state.userProfile as any)?.supabaseAnonKey?.trim() || "";
      const url = normalizeSupabaseUrl(rawUrl);
      if (url && anonKey) return { url, anonKey };
      // If only URL is present (no anon key), still return normalized url
      // so we can produce a clearer "missing anon key" error downstream.
      if (url && !anonKey) return { url, anonKey: "" };
    } catch {
      // store not ready yet
    }
  }
  // Fallback to env vars (legacy)
  const envUrl = normalizeSupabaseUrl(
    process.env.NEXT_PUBLIC_SUPABASE_URL || ""
  );
  const envKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";
  return { url: envUrl, anonKey: envKey };
}

/**
 * Normalize a user-supplied Supabase URL into the API format
 * (https://<project-ref>.supabase.co).
 *
 * Handles:
 *   - Dashboard URLs: https://supabase.com/dashboard/project/<ref>/...
 *     → https://<ref>.supabase.co
 *   - URLs with trailing slash or path: stripped
 *   - URLs without protocol: https:// prefix added
 *   - URLs that are already correct: returned unchanged
 *
 * Returns "" if the input is empty or doesn't look like a Supabase URL.
 */
export function normalizeSupabaseUrl(input: string): string {
  if (!input) return "";
  let url = input.trim();

  // Add protocol if missing
  if (!/^https?:\/\//i.test(url)) {
    url = "https://" + url;
  }

  // Case 1: Dashboard URL → extract project ref
  //   https://supabase.com/dashboard/project/<ref>
  //   https://supabase.com/dashboard/project/<ref>/settings/api
  const dashMatch = url.match(
    /supabase\.com\/dashboard\/project\/([a-z0-9]+)/i
  );
  if (dashMatch) {
    return `https://${dashMatch[1].toLowerCase()}.supabase.co`;
  }

  // Case 2: Already in API format (https://<ref>.supabase.co[/...])
  const apiMatch = url.match(/^(https?:\/\/)([a-z0-9]+)\.supabase\.(co|com|in)/i);
  if (apiMatch) {
    // Strip any trailing path/slash, keep just the host
    try {
      const u = new URL(url);
      return `${u.protocol}//${u.hostname.toLowerCase()}`;
    } catch {
      return url;
    }
  }

  // Case 3: Unknown format — return as-is, will fail at fetch time
  // (better to let the user see the error than silently mangle it)
  return url;
}

/**
 * Returns a human-readable validation error for the current credentials,
 * or null if credentials look valid. Used to give the user actionable
 * feedback in the Profilo UI before they even try to sync.
 */
export function validateSupabaseCredentials(): string | null {
  if (typeof window === "undefined") return null;
  const state = useAppStore.getState();
  const rawUrl = (state.userProfile as any)?.supabaseUrl?.trim() || "";
  const anonKey = (state.userProfile as any)?.supabaseAnonKey?.trim() || "";

  if (!rawUrl && !anonKey) return null; // nothing configured yet, no error
  if (!rawUrl) return "Manca il Project URL.";
  if (!anonKey) return "Manca la anon key — copiala da Supabase → Project Settings → API.";

  // Check if user pasted a dashboard URL (we'll auto-fix it, but warn)
  if (/supabase\.com\/dashboard\/project\//i.test(rawUrl)) {
    // Already auto-normalized — no error needed, just inform
    return null;
  }

  // Check URL format
  const normalized = normalizeSupabaseUrl(rawUrl);
  if (!/^https:\/\/[a-z0-9]+\.supabase\.(co|com|in)/i.test(normalized)) {
    return "L'URL non è nel formato corretto. Deve essere https://<project-ref>.supabase.co";
  }

  // Check anon key length (typical Supabase anon keys are JWT, ~200+ chars)
  if (anonKey.length < 30) {
    return "La anon key sembra troppo corta. Assicurati di aver copiato la 'anon public' key intera.";
  }

  return null;
}

/**
 * Whether the user has provided Supabase credentials (either BYOK or env).
 */
export function isSupabaseConfigured(): boolean {
  const { url, anonKey } = readCredentials();
  return !!(url && anonKey);
}

/**
 * Translate a low-level fetch/supabase error into an actionable Italian
 * message. The browser surfaces network errors (CORS, DNS, refused
 * connection) as "TypeError: Failed to fetch" which is useless to the
 * user — we replace it with a hint about URL/key correctness.
 */
function humanizeCloudError(err: any): string {
  const raw = err?.message || err?.toString?.() || String(err);
  const lower = raw.toLowerCase();

  if (lower.includes("failed to fetch") || lower.includes("networkerror")) {
    return (
      "Impossibile contattare Supabase. Cause possibili:\n" +
      "• URL non corretto (deve essere https://<project-ref>.supabase.co, NON l'URL del dashboard)\n" +
      "• Anon key mancante o sbagliata\n" +
      "• Il progetto Supabase è in pausa (riattivalo dal dashboard)"
    );
  }
  if (lower.includes("cors")) {
    return "Blocco CORS: verifica che l'URL sia https://<project-ref>.supabase.co e che la anon key sia corretta.";
  }
  if (lower.includes("jwt") || lower.includes("invalid api key")) {
    return "Anon key non valida. Copia da Supabase → Project Settings → API → 'anon public' (NON la service_role key).";
  }
  if (lower.includes("relation") && lower.includes("does not exist")) {
    return (
      "La tabella 'app_state' non esiste su Supabase. Vai in Supabase → SQL Editor " +
      "→ incolla il contenuto di supabase-schema.sql → esegui."
    );
  }
  if (lower.includes("permission denied") || lower.includes("rls")) {
    return (
      "Permessi insufficienti sulla tabella 'app_state'. Esegui di nuovo " +
      "supabase-schema.sql in Supabase → SQL Editor (contiene i GRANT necessari)."
    );
  }
  return raw;
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
    // Surface a clear error if URL is present but anon key is missing
    if (url && !anonKey) {
      setStatus(
        "error",
        "Manca la anon key — copiala da Supabase → Project Settings → API → 'anon public'"
      );
    } else if (_status !== "unconfigured" && _status !== "error") {
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
// Backward-compat default for users who have not logged in with Google yet.
// Once they do, the row id becomes their lowercased email — so each Google
// account maps to its own isolated row in app_state (multi-profile support).
const DEFAULT_CLOUD_ROW_ID = "default";

// ⚠️ Artists are stored in a SEPARATE cloud row (suffixed "_artists") because:
// 1. A full Beatport scrape produces ~3400 artists / ~3000 tracks totaling ~9MB.
//    Putting it in the main app_state row alongside labels/demos/profile would
//    risk hitting Supabase's JSONB column size limit and slow down EVERY sync
//    (even tiny profile updates would re-upload 9MB).
// 2. Artists change infrequently (only when user re-scrapes), while labels/
//    profile change often (notes, tier, status). Splitting them keeps the
//    frequent-sync path lightweight.
// 3. On a new device, the user gets labels/profile/snapshots from the main
//    row, then this function pulls artists separately. Without this, a user
//    logging in on a new phone would see 0 artists even with perfect cloud sync.
function getArtistsCloudRowId(): string {
  return `${getCloudRowId()}_artists`;
}

// Module-level holder for the current user's email. Populated by
// useAuthEffect() (see use-auth.ts) — must be set BEFORE any cloud sync
// operation, otherwise we'd fall back to "default" and mix profiles.
let _currentUserEmail: string | null = null;

/**
 * Set the current user's email (called from useAuthEffect on session change).
 * Pass null on logout. When null, cloud sync falls back to the legacy "default"
 * row id (so existing users without Google login keep their data).
 */
export function setCurrentUserEmail(email: string | null): void {
  const normalized = email?.trim().toLowerCase() || null;
  if (_currentUserEmail !== normalized) {
    _currentUserEmail = normalized;
    // Invalidate the cached Supabase client so the next call re-evaluates
    // credentials + row id. Not strictly required (creds don't depend on email)
    // but keeps the state consistent.
  }
}

/**
 * Returns the row id to use for cloud sync. Uses the logged-in user's email
 * if available, falls back to "default" for legacy / unauthenticated users.
 */
function getCloudRowId(): string {
  return _currentUserEmail || DEFAULT_CLOUD_ROW_ID;
}

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
        id: getCloudRowId(),
        data: data,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "id" }
    );

    if (error) {
      console.error("[LabelPulse Cloud] Save error:", error.message);
      setStatus("error", humanizeCloudError(error));
      return false;
    }

    setStatus("synced");
    return true;
  } catch (err) {
    console.error("[LabelPulse Cloud] Save exception:", err);
    setStatus("error", humanizeCloudError(err));
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
      .eq("id", getCloudRowId())
      .single();

    if (error) {
      if (error.code === "PGRST116") {
        // No rows returned — first time, no data in cloud yet
        return null;
      }
      console.error("[LabelPulse Cloud] Load error:", error.message);
      setStatus("error", humanizeCloudError(error));
      return null;
    }

    if (!data?.data || Object.keys(data.data).length === 0) {
      return null;
    }

    setStatus("synced");
    return data.data as object;
  } catch (err) {
    console.error("[LabelPulse Cloud] Load exception:", err);
    setStatus("error", humanizeCloudError(err));
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
          filter: `id=eq.${getCloudRowId()}`,
        },
        async (payload: any) => {
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
            await applyRemoteData(newData);
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
 *
 * CRITICAL SAFETY RULE: same as mergeCloudData in store.ts — never
 * overwrite local non-empty arrays with empty cloud arrays. This is
 * the realtime-update path, and we want the same protection here.
 */
async function applyRemoteData(cloudData: any): Promise<void> {
  // Lazy require to avoid circular import
  const store = useAppStore.getState();
  const localLastSavedAt = store.lastSavedAt
    ? new Date(store.lastSavedAt).getTime()
    : 0;
  const cloudLastSavedAt = cloudData?.lastSavedAt
    ? new Date(cloudData.lastSavedAt).getTime()
    : 0;

  // ⚠️ CRITICAL: Content-aware merge decision (same as loadFromCloud).
  // The old code did `if (cloudLastSavedAt <= localLastSavedAt) return;`
  // which would silently DROP realtime updates if the local timestamp was
  // newer or equal — even if the cloud had profile data local didn't have.
  //
  // This was the realtime-update variant of the same bug that wiped user
  // data on re-login. Always apply if cloud brings new profile data, even
  // if its timestamp looks "older".
  const cloudProfileHasData =
    !!cloudData?.userProfile?.artistName ||
    !!cloudData?.userProfile?.bio ||
    !!cloudData?.userProfile?.email ||
    !!cloudData?.userProfile?.scLink ||
    !!cloudData?.userProfile?.photoUrl ||
    (Array.isArray(cloudData?.userProfile?.links) && cloudData.userProfile.links.length > 0);
  const localProfileHasData =
    !!store.userProfile?.artistName ||
    !!store.userProfile?.bio ||
    !!store.userProfile?.email ||
    !!store.userProfile?.scLink ||
    !!store.userProfile?.photoUrl ||
    (Array.isArray(store.userProfile?.links) && store.userProfile.links.length > 0);

  const cloudBringsNewProfile = cloudProfileHasData && !localProfileHasData;
  const cloudHasLabels = Array.isArray(cloudData?.labels) && cloudData.labels.length > 0;
  const cloudHasDemos = Array.isArray(cloudData?.demos) && cloudData.demos.length > 0;
  const cloudHasSnapshots = Array.isArray(cloudData?.rankingSnapshots) && cloudData.rankingSnapshots.length > 0;
  // ⚠️ CRITICAL FIX (data-loss bug 2026-06-22, post-login "no charts" v2):
  // Mirror the fix in store.ts:loadFromCloud — ALWAYS run merge if cloud has
  // ANY content, not just when local is empty. The merge function is content-
  // aware (unions by id, preserves Beatport fields per-genre with local wins),
  // so running it unconditionally only adds data, never removes it.
  const cloudHasAnyContent = cloudHasLabels || cloudHasDemos || cloudHasSnapshots || cloudProfileHasData;
  const cloudIsNewerByTimestamp = cloudLastSavedAt > localLastSavedAt;
  const shouldApply =
    cloudBringsNewProfile ||
    cloudHasAnyContent ||
    cloudIsNewerByTimestamp;

  if (!shouldApply) {
    return;
  }

  const merged: any = {};

  // ⚠️ CRITICAL FIX (data-loss bug 2026-06-22):
  // Mirror the fix in store.ts:mergeCloudData — do UNION BY ID instead of
  // REPLACE for arrays. This is the realtime-update path; same protection.
  // Lazy-import mergeSnapshots from store to avoid circular dep at module
  // load time. (We already import mergeProfiles at top of file.)
  let mergeSnapshotsFn: any = null;
  try {
    // Re-require lazily — store.ts imports from supabase.ts at top level
    const storeMod = await import("./store");
    mergeSnapshotsFn = (storeMod as any).mergeSnapshotsPublic || null;
  } catch {
    // fall through — we'll handle snapshots below
  }

  // ---------- LABELS: union by id, preserve user-edit fields from local ----------
  const cloudLabels = Array.isArray(cloudData.labels) ? cloudData.labels : [];
  const localLabels = Array.isArray(store.labels) ? store.labels : [];
  const labelUserEditFields = [
    "emails", "notes", "website", "demoLink", "socialLink",
    "soundcloudLink", "status", "tier", "instagramLink", "facebookLink",
    "bandcampLink", "beatstatsLink",
  ];
  const labelsById = new Map<string, any>();
  const labelsByName = new Map<string, any>();
  for (const cl of cloudLabels) {
    if (!cl || typeof cl !== "object") continue;
    labelsById.set(cl.id, { ...cl });
    const nm = cl.name?.toLowerCase().trim();
    if (nm) labelsByName.set(nm, cl);
  }
  for (const ll of localLabels) {
    if (!ll || typeof ll !== "object") continue;
    const nm = ll.name?.toLowerCase().trim();
    const existing = labelsById.get(ll.id) || (nm ? labelsByName.get(nm) : undefined);
    if (existing) {
      for (const f of labelUserEditFields) {
        const lv = (ll as any)[f];
        if (Array.isArray(lv) ? lv.length > 0 : (lv && String(lv).trim() !== "")) {
          (existing as any)[f] = lv;
        }
      }
      // ⚠️ CRITICAL FIX (data-loss bug 2026-06-22, post-login "no charts"):
      // Also preserve Beatport data fields (rankByGenre, pointsByGenre, etc.)
      // from local. Without this, a realtime echo of a partial cloud row
      // (e.g., one that lost rankByGenre during a previous bad sync) would
      // wipe the user's just-restored scraped data.
      // Same logic as mergeCloudData in store.ts:
      //   - Object fields: union by genre key, local wins on conflict
      //   - Array field (genres): union (dedupe)
      //   - Boolean (trending): true wins
      for (const f of ["rankByGenre", "pointsByGenre", "trendingRankByGenre", "trendingPointsByGenre", "prevRankByGenre"]) {
        const lv = (ll as any)[f];
        if (lv && typeof lv === "object" && !Array.isArray(lv)) {
          const cv = (existing as any)[f];
          const baseObj = (cv && typeof cv === "object" && !Array.isArray(cv)) ? cv : {};
          (existing as any)[f] = { ...baseObj, ...lv };
        }
      }
      if (Array.isArray(ll.genres) && ll.genres.length > 0) {
        const cv = Array.isArray(existing.genres) ? existing.genres : [];
        const seen = new Set(cv.map((g: any) => String(g).toLowerCase().trim()));
        const mergedGenres = [...cv];
        for (const g of ll.genres) {
          const key = String(g).toLowerCase().trim();
          if (key && !seen.has(key)) {
            seen.add(key);
            mergedGenres.push(g);
          }
        }
        existing.genres = mergedGenres;
      }
      if (ll.trending === true) {
        existing.trending = true;
      }
    } else {
      labelsById.set(ll.id, { ...ll });
      if (nm) labelsByName.set(nm, ll);
    }
  }
  if (labelsById.size > 0) {
    merged.labels = Array.from(labelsById.values());
  }

  // ---------- DEMOS: union by id, prefer newest createdAt ----------
  const cloudDemos = Array.isArray(cloudData.demos) ? cloudData.demos : [];
  const localDemos = Array.isArray(store.demos) ? store.demos : [];
  const demosById = new Map<string, any>();
  for (const d of cloudDemos) {
    if (!d || typeof d !== "object" || !d.id) continue;
    demosById.set(d.id, d);
  }
  for (const d of localDemos) {
    if (!d || typeof d !== "object" || !d.id) continue;
    const existing = demosById.get(d.id);
    if (!existing) {
      demosById.set(d.id, d);
    } else {
      const exTs = new Date(existing.createdAt || 0).getTime();
      const loTs = new Date(d.createdAt || 0).getTime();
      if (loTs > exTs) {
        demosById.set(d.id, d);
      } else if (loTs === exTs && ((d.notes && d.notes.trim()) || (d.pitchText && d.pitchText.trim()))) {
        demosById.set(d.id, d);
      }
    }
  }
  merged.demos = Array.from(demosById.values());

  if (cloudData.userProfile) {
    // ⚠️ CRITICAL: Use mergeProfiles so that non-empty fields from BOTH
    // local and cloud win. Previously this was a spread that OVERWROTE
    // local with cloud — so if cloud had artistName="" and local had
    // artistName="Emmanuel Miro", the local data was silently lost.
    // mergeProfiles ensures non-empty wins in both directions.
    const mergedProfile = mergeProfiles(store.userProfile, cloudData.userProfile);
    merged.userProfile = {
      ...(mergedProfile || cloudData.userProfile),
      // Preserve BYOK credentials — never overwrite with cloud versions
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

  // ---------- RANKING SNAPSHOTS: union by id via mergeSnapshots ----------
  // mergeSnapshots is defined in store.ts. We try to use the lazy-loaded
  // copy; if that fails (e.g., circular dep issue), fall back to local
  // snapshots so we don't lose data.
  const cloudSnaps = Array.isArray(cloudData.rankingSnapshots) ? cloudData.rankingSnapshots : [];
  const localSnaps = Array.isArray(store.rankingSnapshots) ? store.rankingSnapshots : [];
  if (mergeSnapshotsFn && typeof mergeSnapshotsFn === "function") {
    merged.rankingSnapshots = mergeSnapshotsFn(localSnaps, cloudSnaps);
  } else {
    // Manual union by id as fallback
    const seen = new Set<string>();
    const out: any[] = [];
    for (const s of [...localSnaps, ...cloudSnaps]) {
      if (!s || typeof s !== "object") continue;
      const key = s.id || `${s.timestamp}|${s.source}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(s);
    }
    out.sort(
      (x, y) =>
        new Date(x.timestamp || 0).getTime() - new Date(y.timestamp || 0).getTime()
    );
    merged.rankingSnapshots = out;
  }
  if (cloudData.locale) merged.locale = cloudData.locale;

  useAppStore.setState(merged);

  // ⚠️ CRITICAL FIX (post-login "no profile / no charts" bug 2026-06-22):
  // After applying the remote data, immediately re-restore profile and
  // snapshots from sidecar backups if the live store is now empty. The
  // merge above should preserve local data, but in edge cases (partial
  // cloud row, schema drift, an older app version) the merged result can
  // still be missing data the user definitely had. The sidecar backups
  // are the safety net — splice them back in. Runs on next tick so
  // setState has committed first.
  setTimeout(() => {
    try {
      // Lazy import to avoid circular dep at module load
      import("./store").then((storeMod: any) => {
        const profileRestored = storeMod.restoreProfileFromSidecar?.();
        const snapsRestored = storeMod.restoreSnapshotsFromSidecar?.();
        if (profileRestored || snapsRestored > 0) {
          console.info(
            `[LabelPulse Cloud] Post-realtime sidecar restore: profile=${profileRestored ? "OK" : "niente"}, snaps=${snapsRestored} recuperati.`
          );
        }
      });
    } catch (e) {
      console.warn("[LabelPulse Cloud] Post-realtime sidecar restore failed:", e);
    }
  }, 0);
}

// ==================== ARTISTS CLOUD SYNC (separate row) ====================
// Artists live in their own cloud row (id = "<email>_artists") to keep the
// main app_state row lightweight. See getArtistsCloudRowId() for rationale.

/**
 * Save artists array to cloud (separate row).
 * Called when artists are imported (scrape) or updated.
 * Uses upsert with onConflict:"id" so it replaces the previous artists row.
 *
 * NOTE: artists array can be large (~9MB for 3400 artists). The Supabase
 * JSONB column supports up to 1GB, so this is fine size-wise. The main
 * concern is upload time on slow connections — we don't block UI on this.
 */
export async function saveArtistsToCloud(artists: any[]): Promise<boolean> {
  const supabase = getSupabase();
  if (!supabase) return false;
  if (!Array.isArray(artists) || artists.length === 0) {
    // Don't upload empty arrays — would wipe cloud's good data
    return false;
  }

  try {
    const { error } = await supabase.from(CLOUD_TABLE).upsert(
      {
        id: getArtistsCloudRowId(),
        data: { artists, savedAt: new Date().toISOString() },
        updated_at: new Date().toISOString(),
      },
      { onConflict: "id" }
    );

    if (error) {
      console.error("[LabelPulse Cloud] Artists save error:", error.message);
      return false;
    }

    console.info(
      `[LabelPulse Cloud] Artists saved to cloud: ${artists.length} artists`
    );
    return true;
  } catch (err) {
    console.error("[LabelPulse Cloud] Artists save exception:", err);
    return false;
  }
}

/**
 * Load artists array from cloud (separate row).
 * Returns [] if no artists in cloud or if not configured.
 *
 * Called on boot after the main cloud sync — artists are pulled separately
 * so they don't block the initial UI render (labels/profile/snapshots come
 * first, artists come second).
 */
export async function loadArtistsFromCloud(): Promise<any[]> {
  const supabase = getSupabase();
  if (!supabase) return [];

  try {
    const { data, error } = await supabase
      .from(CLOUD_TABLE)
      .select("data, updated_at")
      .eq("id", getArtistsCloudRowId())
      .single();

    if (error) {
      if (error.code === "PGRST116") {
        // No rows — first time, no artists in cloud yet
        return [];
      }
      console.error("[LabelPulse Cloud] Artists load error:", error.message);
      return [];
    }

    const artists = (data?.data as any)?.artists;
    if (!Array.isArray(artists) || artists.length === 0) return [];

    console.info(
      `[LabelPulse Cloud] Artists loaded from cloud: ${artists.length} artists (saved at ${data?.data?.savedAt || "unknown"})`
    );
    return artists;
  } catch (err) {
    console.error("[LabelPulse Cloud] Artists load exception:", err);
    return [];
  }
}

/**
 * Returns the timestamp of the last artists cloud sync, or null if never synced.
 * Useful for the diagnostic UI to show "artists last synced: X ago".
 */
export async function getArtistsCloudSyncInfo(): Promise<{ count: number; savedAt: string | null } | null> {
  const supabase = getSupabase();
  if (!supabase) return null;

  try {
    const { data, error } = await supabase
      .from(CLOUD_TABLE)
      .select("data, updated_at")
      .eq("id", getArtistsCloudRowId())
      .single();

    if (error) {
      if (error.code === "PGRST116") return { count: 0, savedAt: null };
      return null;
    }

    const artists = (data?.data as any)?.artists;
    return {
      count: Array.isArray(artists) ? artists.length : 0,
      savedAt: (data?.data as any)?.savedAt || data?.updated_at || null,
    };
  } catch {
    return null;
  }
}

/**
 * Returns the count of labels in the main cloud row + lastSavedAt timestamp.
 * Used by the diagnostic UI to show "cloud has X labels, last synced Y ago".
 */
export async function getMainCloudSyncInfo(): Promise<{
  labels: number;
  labelsWithRankings: number;
  snapshots: number;
  demos: number;
  profileHasData: boolean;
  lastSavedAt: string | null;
} | null> {
  const supabase = getSupabase();
  if (!supabase) return null;

  try {
    const { data, error } = await supabase
      .from(CLOUD_TABLE)
      .select("data, updated_at")
      .eq("id", getCloudRowId())
      .single();

    if (error) {
      if (error.code === "PGRST116") {
        return { labels: 0, labelsWithRankings: 0, snapshots: 0, demos: 0, profileHasData: false, lastSavedAt: null };
      }
      return null;
    }

    const d = (data?.data as any) || {};
    const labels = Array.isArray(d.labels) ? d.labels : [];
    const labelsWithRankings = labels.filter(
      (l: any) => l && typeof l.rankByGenre === "object" && Object.keys(l.rankByGenre || {}).length > 0
    ).length;
    const profile = d.userProfile || {};
    const profileHasData =
      !!profile.artistName || !!profile.bio || !!profile.email ||
      !!profile.scLink || !!profile.photoUrl ||
      (Array.isArray(profile.links) && profile.links.length > 0);

    return {
      labels: labels.length,
      labelsWithRankings,
      snapshots: Array.isArray(d.rankingSnapshots) ? d.rankingSnapshots.length : 0,
      demos: Array.isArray(d.demos) ? d.demos.length : 0,
      profileHasData,
      lastSavedAt: d.lastSavedAt || data?.updated_at || null,
    };
  } catch {
    return null;
  }
}

/**
 * Force-push the current local state to cloud, REPLACING the cloud row entirely.
 * DANGEROUS: only use when the user explicitly clicks "Sovrascrivi cloud con locale".
 * Used by the diagnostic UI as a recovery action.
 *
 * Returns true on success, false on failure.
 */
export async function forcePushLocalToCloud(): Promise<boolean> {
  const supabase = getSupabase();
  if (!supabase) return false;

  const store = useAppStore.getState();
  const lastSavedAt = new Date().toISOString();
  const dataToSync = {
    labels: store.labels,
    demos: store.demos,
    activeTab: store.activeTab,
    locale: store.locale,
    userProfile: store.userProfile,
    gmailAuth: store.gmailAuth,
    rankingsUpdatedAt: store.rankingsUpdatedAt,
    lastSavedAt,
    rankingSnapshots: store.rankingSnapshots,
  };

  try {
    const { error } = await supabase.from(CLOUD_TABLE).upsert(
      {
        id: getCloudRowId(),
        data: dataToSync,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "id" }
    );
    if (error) {
      console.error("[LabelPulse Cloud] Force-push error:", error.message);
      return false;
    }
    console.info("[LabelPulse Cloud] Force-push: local → cloud (overwrite).");
    setStatus("synced");
    return true;
  } catch (err) {
    console.error("[LabelPulse Cloud] Force-push exception:", err);
    return false;
  }
}

/**
 * Force-pull cloud state into local store, REPLACING local entirely.
 * DANGEROUS: only use when the user explicitly clicks "Sovrascrivi locale con cloud".
 * Used by the diagnostic UI as a recovery action.
 *
 * Returns true on success, false on failure.
 */
export async function forcePullCloudToLocal(): Promise<boolean> {
  const cloudData = await loadStateFromCloud();
  if (!cloudData) {
    console.warn("[LabelPulse Cloud] Force-pull: cloud has no data.");
    return false;
  }

  const cloud = cloudData as any;
  // Replace local with cloud entirely (no merge)
  useAppStore.setState({
    labels: Array.isArray(cloud.labels) ? cloud.labels : [],
    demos: Array.isArray(cloud.demos) ? cloud.demos : [],
    activeTab: cloud.activeTab || "dashboard",
    locale: cloud.locale || "it",
    userProfile: cloud.userProfile || {},
    gmailAuth: cloud.gmailAuth || null,
    rankingsUpdatedAt: cloud.rankingsUpdatedAt || null,
    lastSavedAt: cloud.lastSavedAt || null,
    rankingSnapshots: Array.isArray(cloud.rankingSnapshots) ? cloud.rankingSnapshots : [],
    hasCloudSynced: true,
  });

  console.info("[LabelPulse Cloud] Force-pull: cloud → local (overwrite).");
  return true;
}

/**
 * Explicit merge: pull cloud, run mergeCloudData, push merged back.
 * This is what loadFromCloud SHOULD do, but as a user-triggered action
 * so the user can see the result and confirm data is recovered.
 *
 * Returns a summary of what happened, for the diagnostic UI to display.
 */
export async function explicitMergeLocalAndCloud(): Promise<{
  ok: boolean;
  summary: string;
}> {
  const cloudData = await loadStateFromCloud();
  if (!cloudData) {
    return {
      ok: false,
      summary: "Cloud non ha dati. Impossibile mergiare.",
    };
  }

  // Lazy import to avoid circular dep
  const storeMod = await import("./store");
  const mergeCloudDataFn = (storeMod as any).mergeCloudDataPublic;
  if (!mergeCloudDataFn) {
    return { ok: false, summary: "mergeCloudData non disponibile." };
  }

  const localState = useAppStore.getState();
  const merged = mergeCloudDataFn(cloudData, localState);
  useAppStore.setState({ ...merged, hasCloudSynced: true });

  // Push merged back to cloud so other devices get it too
  await forcePushLocalToCloud();

  const beforeLabels = localState.labels?.length || 0;
  const afterLabels = (merged as any).labels?.length || 0;
  const beforeSnaps = localState.rankingSnapshots?.length || 0;
  const afterSnaps = (merged as any).rankingSnapshots?.length || 0;

  return {
    ok: true,
    summary:
      `Merge completato. ` +
      `Label: ${beforeLabels} → ${afterLabels}. ` +
      `Snapshot: ${beforeSnaps} → ${afterSnaps}. ` +
      `Risultato spinto al cloud.`,
  };
}
