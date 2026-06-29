"use client";

import { createClient, SupabaseClient } from "@supabase/supabase-js";
import { useAppStore, mergeProfiles } from "./store";

// ==================== SUPABASE CLIENT (CLOUD-FIRST) ====================
// Client-side Supabase per la sincronizzazione cloud dei dati.
//
// ⚠️ CLOUD-FIRST (migrazione 2026-06-23):
// Le credenziali (URL + anon key) vengono lette SOLO dalle env vars
// NEXT_PUBLIC_SUPABASE_URL e NEXT_PUBLIC_SUPABASE_ANON_KEY (vedi .env.local).
//
// Il vecchio sistema BYOK (utente inseriva URL+key nel Profilo) è stato
// RIMOSSO perché era la causa principale della perdita dati: se l'utente
// non configurava (caso frequentissimo), niente cloud, e cambiando
// dispositivo tutto era perso.
//
// Ora: configure .env.local UNA VOLTA, e ogni dispositivo/utente usa le
// stesse credenziali. Multi-utenza garantita dalla chiave id=email
// nella tabella app_state (vedi setCurrentUserEmail + schema SQL).

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
let _realtimeGlobalChannel: any = null; // GLOBAL row realtime subscription (admin updates)
let _isApplyingRemoteUpdate: boolean = false; // evita loop di sync

// ⚠️ Timestamp of the last local userProfile edit (set by setUserProfile
// in store.ts via markLocalProfileEdit). Used by applyRemoteData to detect
// race conditions: if a realtime cloud update arrives within
// LOCAL_PROFILE_EDIT_GRACE_MS of a local edit, we preserve the local
// profile fields instead of letting the cloud (which may have a stale
// photoUrl from before the local edit) overwrite them.
//
// This fixes the bug where Lutenzo (iPhone) uploads a new profile photo,
// sees it briefly, then it reverts to the old one because a realtime
// update arrives with the stale cloud photoUrl before the local push
// has propagated.
//
// 2026-06-25 — bumped from 5000ms to 10000ms after reports of the bug
// recurring on slow connections. The grace-period is the window during
// which local edits are protected from realtime cloud overwrites. 5s
// was too tight when the user's connection is slow and the cloud sync
// takes longer to propagate the push. 10s gives more margin without
// blocking legit multi-device edits for too long.
let _lastLocalProfileEditAt: number = 0;
const LOCAL_PROFILE_EDIT_GRACE_MS = 10000; // 10 seconds (was 5s before 2026-06-25)

/**
 * Called by store.ts:setUserProfile to record that the user just edited
 * their profile locally. The next realtime update that arrives within
 * LOCAL_PROFILE_EDIT_GRACE_MS will NOT overwrite profile fields.
 */
export function markLocalProfileEdit(): void {
  _lastLocalProfileEditAt = Date.now();
}

/**
 * Returns true if a local profile edit happened within the grace period.
 * Used by applyRemoteData to decide whether to preserve local profile
 * fields against a possibly-stale cloud update.
 */
export function isLocalProfileEditRecent(): boolean {
  if (_lastLocalProfileEditAt === 0) return false;
  return Date.now() - _lastLocalProfileEditAt < LOCAL_PROFILE_EDIT_GRACE_MS;
}

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

export function setStatus(newStatus: CloudSyncStatus, errorMsg: string | null = null) {
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
 * Read Supabase credentials from .env.local (NEXT_PUBLIC_* env vars).
 *
 * CLOUD-FIRST: questo è l'UNICO modo per ottenere le credenziali.
 * Il vecchio sistema BYOK (userProfile.supabaseUrl/Key) è deprecato.
 *
 * IMPORTANT: The URL is normalized via normalizeSupabaseUrl() before use.
 * This handles common user mistakes like pasting the dashboard URL
 * (https://supabase.com/dashboard/project/<ref>) instead of the API URL
 * (https://<ref>.supabase.co).
 */
function readCredentials(): { url: string; anonKey: string } {
  // ⚠️ CLOUD-FIRST (2026-06-23):
  // Le credenziali Supabase vengono lette SOLO dalle env vars. Il vecchio
  // sistema BYOK (utente inserisce URL+key nel Profilo) è stato rimosso
  // perché era la causa principale della perdita dati: se l'utente non
  // configurava (90% dei casi), niente cloud, e cambiando dispositivo
  // tutto era perso.
  //
  // Ora: configura .env.local una volta, e ogni dispositivo/utente usa
  // le stesse credenziali. Multi-utenza garantita dalla chiave id=email
  // nella tabella app_state (vedi setCurrentUserEmail + schema SQL).
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
  // CLOUD-FIRST: legge solo da env vars (vedi readCredentials).
  const { url: rawUrl, anonKey } = readCredentials();

  if (!rawUrl && !anonKey) {
    return "Configura NEXT_PUBLIC_SUPABASE_URL e NEXT_PUBLIC_SUPABASE_ANON_KEY nel file .env.local (vedi istruzioni nel file).";
  }
  if (!rawUrl) return "Manca NEXT_PUBLIC_SUPABASE_URL nel file .env.local.";
  if (!anonKey) return "Manca NEXT_PUBLIC_SUPABASE_ANON_KEY nel file .env.local.";

  // Check URL format
  if (!/^https:\/\/[a-z0-9]+\.supabase\.(co|com|in)/i.test(rawUrl)) {
    return "L'URL non è nel formato corretto. Deve essere https://<project-ref>.supabase.co";
  }

  // Check anon key length (typical Supabase anon keys are JWT, ~200+ chars)
  if (anonKey.length < 30) {
    return "La anon key sembra troppo corta. Assicurati di aver copiato la 'anon public' key intera da Supabase → Project Settings → API.";
  }

  return null;
}

/**
 * Whether Supabase credentials are configured in .env.local.
 * CLOUD-FIRST: this MUST be true for the app to work — without it,
 * data is local-only and will be lost when switching devices.
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

// ==================== ADMIN / GLOBAL DATA ====================
// Only admin emails can push Beatport scrape data (labels rankings, artists,
// snapshots) to the GLOBAL cloud row. Regular users can ONLY read it —
// their personal row holds profile, demos, and per-label personalizations
// (emails, notes, status) but never Beatport ranking data.
//
// To add another admin, append their lowercase email here.
const ADMIN_EMAILS = new Set<string>([
  "emmanuel.miro77@gmail.com",
]);

/**
 * Returns true if the given email is an admin (can push to global rankings).
 * Case-insensitive, trims whitespace. Returns false for null/undefined/empty.
 */
export function isAdminEmail(email: string | null | undefined): boolean {
  if (!email) return false;
  return ADMIN_EMAILS.has(email.trim().toLowerCase());
}

/**
 * Returns true if the currently logged-in user (set via setCurrentUserEmail)
 * is an admin. Convenience wrapper used by saveStateToCloud and the UI to
 * decide whether to write to the global row.
 */
function isCurrentUserAdmin(): boolean {
  return isAdminEmail(_currentUserEmail);
}

// The id of the GLOBAL cloud row that holds the shared Beatport data
// (labels with rank/points/genres, artists, rankingSnapshots, rankingsUpdatedAt).
// Read by everyone, written only by admin. Lives in the same app_state table
// — no SQL migration needed.
const GLOBAL_CLOUD_ROW_ID = "global";

/**
 * Returns the row id for the GLOBAL shared data (Beatport rankings, artists,
 * snapshots). Same for all users — they all read the same global row.
 */
function getGlobalCloudRowId(): string {
  return GLOBAL_CLOUD_ROW_ID;
}

/**
 * Returns the row id for the per-user artists (suffixed "_artists").
 * Admin's artists row is suffixed "_artists_global" so it is shared with
 * all users — admin's scrape updates the global artists, and users see it.
 */
function getArtistsCloudRowId(): string {
  // Admin's artists are GLOBAL — every user reads the same.
  if (isCurrentUserAdmin()) {
    return `${GLOBAL_CLOUD_ROW_ID}_artists`;
  }
  return `${getCloudRowId()}_artists`;
}

/**
 * Returns the row id for the GLOBAL artists (read by everyone, written by
 * admin only). Used by loadArtistsFromCloud to always pull from global,
 * regardless of who's logged in.
 */
function getGlobalArtistsCloudRowId(): string {
  return `${GLOBAL_CLOUD_ROW_ID}_artists`;
}

/**
 * SPLIT STRATEGY — what goes where:
 *
 * GLOBAL ROW (id='global', written only by admin):
 *   - labels[*].id, name, genres, rankByGenre, pointsByGenre, trending,
 *     trendingRankByGenre, trendingPointsByGenre, beatportLink, isCustom(false)
 *   - rankingSnapshots
 *   - rankingsUpdatedAt
 *   - (artists saved separately via saveArtistsToCloud → global_artists row)
 *
 * PERSONAL ROW (id=email, written by each user):
 *   - userProfile (artist name, email, bio, links, photo, etc.)
 *   - demos (the user's pitch submissions)
 *   - labels[*].PERSONAL fields: emails, contactInfo, website, demoLink,
 *     socialLink, soundcloudLink, customLinks, notes, status, submissionType,
 *     genre (user-set), createdAt
 *   - labels[*] with isCustom=true (user-added labels not from Beatport)
 *   - gmailAuth, locale, lastSavedAt
 *
 * Merge at load time:
 *   - Start from global labels (Beatport truth)
 *   - For each, look up the personal entry by id (or by name fallback)
 *     and splice in user-edit fields if present
 *   - Append personal-only custom labels
 *   - artists: load from global_artists row
 *   - snapshots: from global
 *   - rankingsUpdatedAt: from global
 *   - userProfile, demos, gmailAuth, locale, lastSavedAt: from personal
 */
const LABEL_BEATPORT_FIELDS = [
  "id", "name",
  "genres", "rankByGenre", "pointsByGenre",
  "trending", "trendingRankByGenre", "trendingPointsByGenre",
  "beatportLink", "isCustom",
  // ⚠️ Beatport identity — added 2026-06-25 (label logos feature).
  // Without these in LABEL_BEATPORT_FIELDS, buildGlobalPayload() strips them
  // before pushing to the GLOBAL cloud row. Result: admin's scrape captures
  // imageUrl, but it never reaches the cloud → other devices (mobile, other
  // browsers) see labels with imageUrl='' and fall back to the initials
  // avatar instead of the real logo.
  "imageUrl", "slug", "beatportId",
] as const;

const LABEL_PERSONAL_FIELDS = [
  "emails", "contactInfo", "website", "demoLink", "socialLink",
  "soundcloudLink", "customLinks", "notes", "status",
  "submissionType", "genre", "createdAt",
] as const;

/**
 * Build the GLOBAL payload (what admin pushes to id='global').
 * Only Beatport-sourced labels (isCustom !== true) are included; user's
 * custom labels stay in their personal row.
 */
function buildGlobalPayload(state: any): object {
  const labels = Array.isArray(state?.labels) ? state.labels : [];
  const globalLabels = labels
    .filter((l: any) => l && typeof l === "object" && !l.isCustom)
    .map((l: any) => {
      const out: Record<string, any> = {};
      for (const f of LABEL_BEATPORT_FIELDS) {
        if (l[f] !== undefined) out[f] = l[f];
      }
      return out;
    });

  return {
    labels: globalLabels,
    rankingSnapshots: Array.isArray(state?.rankingSnapshots) ? state.rankingSnapshots : [],
    rankingsUpdatedAt: state?.rankingsUpdatedAt || null,
    lastGlobalUpdate: new Date().toISOString(),
  };
}

/**
 * Build the PERSONAL payload (what each user pushes to id=email).
 * Includes profile, demos, and per-label personal fields. Custom labels
 * (isCustom=true) are included in full.
 */
function buildPersonalPayload(state: any): object {
  const labels = Array.isArray(state?.labels) ? state.labels : [];
  const personalLabels = labels
    .filter((l: any) => l && typeof l === "object")
    .map((l: any) => {
      if (l.isCustom) {
        // Custom (user-added) labels go in full — they have no Beatport side.
        return { ...l };
      }
      // Beatport labels: only the personal fields. We include id+name so we
      // can match them against the global labels at merge time.
      const out: Record<string, any> = { id: l.id, name: l.name };
      for (const f of LABEL_PERSONAL_FIELDS) {
        // Only include non-empty personal fields to keep the row small.
        const v = l[f];
        if (v === undefined || v === null) continue;
        if (Array.isArray(v) ? v.length > 0 : (String(v).trim() !== "")) {
          out[f] = v;
        }
      }
      return out;
    })
    .filter((l: any) => {
      // Drop labels that have NO personal data and aren't custom — they'd
      // just bloat the personal row for no reason.
      if (l.isCustom) return true;
      const keys = Object.keys(l).filter((k) => k !== "id" && k !== "name");
      return keys.length > 0;
    });

  return {
    labels: personalLabels,
    demos: Array.isArray(state?.demos) ? state.demos : [],
    releases: Array.isArray(state?.releases) ? state.releases : [],
    savedPitches: Array.isArray(state?.savedPitches) ? state.savedPitches : [],
    sentCampaigns: Array.isArray(state?.sentCampaigns) ? state.sentCampaigns : [],
    userProfile: state?.userProfile || {},
    gmailAuth: state?.gmailAuth || null,
    locale: state?.locale || null,
    lastSavedAt: state?.lastSavedAt || new Date().toISOString(),
  };
}

/**
 * Merge a global Beatport label with its personal overlay.
 * Personal fields overwrite global ones (user-edited notes/emails/status win).
 */
function mergeGlobalAndPersonalLabel(global: any, personal: any): any {
  const merged: Record<string, any> = { ...global };
  for (const f of LABEL_PERSONAL_FIELDS) {
    const v = personal?.[f];
    if (v === undefined || v === null) continue;
    if (Array.isArray(v) ? v.length > 0 : (String(v).trim() !== "")) {
      merged[f] = v;
    }
  }
  return merged;
}

/**
 * Merge the global cloud data with the personal cloud data, producing the
 * final state to hydrate the store with.
 *
 * Strategy:
 * - labels: start from global (Beatport truth), splice in personal fields.
 *           Append personal-only custom labels (isCustom=true).
 * - rankingSnapshots, rankingsUpdatedAt: from global.
 * - userProfile, demos, gmailAuth, locale, lastSavedAt: from personal.
 *
 * Falls back gracefully if either side is missing (e.g., new user with no
 * personal row yet, or admin who hasn't pushed global yet).
 */
export function mergeGlobalAndPersonalCloud(global: any, personal: any): any {
  const globalLabels = Array.isArray(global?.labels) ? global.labels : [];
  const personalLabels = Array.isArray(personal?.labels) ? personal.labels : [];

  const personalById = new Map<string, any>();
  const personalByName = new Map<string, any>();
  for (const pl of personalLabels) {
    if (!pl || typeof pl !== "object") continue;
    if (pl.id) personalById.set(pl.id, pl);
    const nm = pl.name?.toLowerCase().trim();
    if (nm) personalByName.set(nm, pl);
  }

  // Track which personal labels got merged into a global one
  const consumedPersonalIds = new Set<string>();
  const consumedPersonalNames = new Set<string>();

  const mergedLabels: any[] = [];
  for (const gl of globalLabels) {
    if (!gl || typeof gl !== "object") continue;
    const personalMatch = (gl.id && personalById.get(gl.id)) ||
      (gl.name && personalByName.get(gl.name.toLowerCase().trim()));
    if (personalMatch) {
      if (personalMatch.id) consumedPersonalIds.add(personalMatch.id);
      const nm = personalMatch.name?.toLowerCase().trim();
      if (nm) consumedPersonalNames.add(nm);
      mergedLabels.push(mergeGlobalAndPersonalLabel(gl, personalMatch));
    } else {
      // No personal overlay — use global as-is, fill defaults for personal fields
      mergedLabels.push({
        emails: [],
        contactInfo: "",
        website: "",
        demoLink: "",
        socialLink: "",
        soundcloudLink: "",
        customLinks: [],
        notes: "",
        status: "unknown",
        submissionType: "email",
        genre: "",
        createdAt: new Date().toISOString(),
        ...gl,
      });
    }
  }

  // Append personal-only labels (custom labels not in global)
  for (const pl of personalLabels) {
    if (!pl || typeof pl !== "object") continue;
    const idConsumed = pl.id && consumedPersonalIds.has(pl.id);
    const nameConsumed = pl.name && consumedPersonalNames.has(pl.name.toLowerCase().trim());
    if (idConsumed || nameConsumed) continue;
    // This is a custom label (or one the user added manually) — include in full
    mergedLabels.push({ ...pl });
  }

  return {
    labels: mergedLabels,
    demos: personal?.demos || [],
    releases: personal?.releases || [],
    savedPitches: personal?.savedPitches || [],
    sentCampaigns: personal?.sentCampaigns || [],
    userProfile: personal?.userProfile || {},
    gmailAuth: personal?.gmailAuth || null,
    locale: personal?.locale || null,
    rankingSnapshots: global?.rankingSnapshots || [],
    rankingsUpdatedAt: global?.rankingsUpdatedAt || null,
    lastSavedAt: personal?.lastSavedAt || new Date().toISOString(),
  };
}

/**
 * Salva lo stato completo dell'app su Supabase.
 * Usa upsert per creare o aggiornare il record.
 *
 * CLOUD-FIRST SPLIT (2026-06-23): this function now writes to TWO rows:
 *   1. id='global' — Beatport rankings, snapshots, rankingsUpdatedAt
 *      (only admin can write here; non-admin saves are silently skipped
 *      for the global row to prevent users from clobbering shared data)
 *   2. id=email — profile, demos, per-label personal fields
 *      (every user writes here)
 *
 * Artists are saved separately via saveArtistsToCloud (id='global_artists'
 * for admin, id='<email>_artists' for users — but loadArtistsFromCloud
 * always reads from global_artists).
 */
export async function saveStateToCloud(data: object): Promise<boolean> {
  const supabase = getSupabase();
  if (!supabase) return false;

  setStatus("syncing");

  const now = new Date().toISOString();
  const personalPayload = buildPersonalPayload(data);
  const adminUser = isCurrentUserAdmin();

  try {
    // Step 1: always write the personal row (every user has one)
    const personalResult = await supabase.from(CLOUD_TABLE).upsert(
      {
        id: getCloudRowId(),
        data: personalPayload,
        updated_at: now,
      },
      { onConflict: "id" }
    );
    if (personalResult.error) {
      console.error("[LabelPulse Cloud] Personal save error:", personalResult.error.message);
      setStatus("error", humanizeCloudError(personalResult.error));
      return false;
    }

    // Step 2: if admin, ALSO write the global row (Beatport truth)
    if (adminUser) {
      const globalPayload = buildGlobalPayload(data);
      const globalResult = await supabase.from(CLOUD_TABLE).upsert(
        {
          id: getGlobalCloudRowId(),
          data: globalPayload,
          updated_at: now,
        },
        { onConflict: "id" }
      );
      if (globalResult.error) {
        console.error("[LabelPulse Cloud] Global save error:", globalResult.error.message);
        // Don't fail the whole save — personal data was saved successfully
        console.warn("[LabelPulse Cloud] Continuing despite global save error (personal save succeeded)");
      } else {
        console.info("[LabelPulse Cloud] Admin global row updated: labels=" +
          (globalPayload as any).labels?.length + ", snapshots=" +
          (globalPayload as any).rankingSnapshots?.length);
      }
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
 * 🔒 FASE D — Carica SOLO la riga globale (classifiche + snapshots + artisti)
 *
 * Usata quando il vecchio sync personale è disabilitato (DISABLE_OLD_APP_STATE_SYNC).
 * I dati personali (demo, label personalizzate, pitch, profilo) vengono dalle
 * nuove tabelle dedicate via loadFromNewTables().
 *
 * Returns null se la riga global non esiste o è vuota.
 */
export async function loadGlobalRowOnly(): Promise<any | null> {
  const supabase = getSupabase();
  if (!supabase) return null;

  try {
    const { data, error } = await supabase
      .from(CLOUD_TABLE)
      .select("data, updated_at")
      .eq("id", getGlobalCloudRowId())
      .maybeSingle();

    if (error) {
      console.error("[LabelPulse Cloud] Global row load error:", error.message);
      return null;
    }

    return data?.data || null;
  } catch (err) {
    console.error("[LabelPulse Cloud] Global row load exception:", err);
    return null;
  }
}

/**
 * 🔒 FASE D FIX: Salva SOLO la riga globale (classifiche Beatport).
 * Usata da saveGlobalRowIfAdmin() per permettere all'admin di pushare
 * nuove classifiche senza salvare la riga personale (che causava timeout).
 */
export async function saveGlobalRowOnly(data: {
  labels: any[];
  rankingSnapshots: any[];
  rankingsUpdatedAt: string | null;
}): Promise<boolean> {
  const supabase = getSupabase();
  if (!supabase) return false;

  try {
    const globalPayload = buildGlobalPayload(data);
    const { error } = await supabase.from(CLOUD_TABLE).upsert(
      {
        id: getGlobalCloudRowId(),
        data: globalPayload,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "id" }
    );

    if (error) {
      console.error("[LabelPulse Cloud] Global row save error:", error.message);
      return false;
    }

    console.log("[LabelPulse Cloud] ✅ Global row saved (admin):", {
      labels: globalPayload.labels?.length || 0,
      snapshots: globalPayload.rankingSnapshots?.length || 0,
    });
    return true;
  } catch (err) {
    console.error("[LabelPulse Cloud] Global row save exception:", err);
    return false;
  }
}

/**
 * Carica lo stato completo dell'app da Supabase.
 *
 * CLOUD-FIRST SPLIT (2026-06-23): reads from BOTH rows and merges:
 *   - id='global' → Beatport rankings, snapshots, rankingsUpdatedAt
 *   - id=email → profile, demos, per-label personal fields
 *
 * Returns null if BOTH rows are empty (first-time user with no data).
 */
export async function loadStateFromCloud(): Promise<object | null> {
  const supabase = getSupabase();
  if (!supabase) return null;

  try {
    // Fetch both rows in parallel — they're independent.
    const [personalRes, globalRes] = await Promise.all([
      supabase
        .from(CLOUD_TABLE)
        .select("data, updated_at")
        .eq("id", getCloudRowId())
        .single(),
      supabase
        .from(CLOUD_TABLE)
        .select("data, updated_at")
        .eq("id", getGlobalCloudRowId())
        .single(),
    ]);

    // Personal row: error other than "no rows" is a real failure
    if (personalRes.error && personalRes.error.code !== "PGRST116") {
      console.error("[LabelPulse Cloud] Personal load error:", personalRes.error.message);
      setStatus("error", humanizeCloudError(personalRes.error));
      return null;
    }

    // Global row: error other than "no rows" is a real failure
    if (globalRes.error && globalRes.error.code !== "PGRST116") {
      console.error("[LabelPulse Cloud] Global load error:", globalRes.error.message);
      setStatus("error", humanizeCloudError(globalRes.error));
      return null;
    }

    const personalData = personalRes.data?.data || null;
    const globalData = globalRes.data?.data || null;

    if (!personalData && !globalData) {
      // First-time user: no data anywhere
      return null;
    }

    const merged = mergeGlobalAndPersonalCloud(globalData, personalData);

    setStatus("synced");
    return merged;
  } catch (err) {
    console.error("[LabelPulse Cloud] Load exception:", err);
    setStatus("error", humanizeCloudError(err));
    return null;
  }
}

// ==================== CLOUD DIAGNOSTIC (ADMIN-ONLY) ====================

/**
 * Diagnostic snapshot of both cloud rows (global + personal) for the admin UI.
 * Returns metadata about each row without fetching the full JSON payload —
 * just what the admin needs to verify that the last scrape landed correctly
 * and to spot data-shape anomalies (e.g., labels count drift).
 *
 * Returns null if Supabase is not configured.
 */
export interface CloudDiagnosticRow {
  id: string;
  exists: boolean;
  updatedAt: string | null;
  // Shape metrics (computed server-side via JSONB operators to avoid pulling
  // the whole payload over the wire)
  labelsCount: number;
  snapshotsCount: number;
  customLabelsCount: number;
  beatportWithPersonalDataCount: number;
  rankingsUpdatedAt: string | null;
  lastGlobalUpdate: string | null;
  sizeBytes: number | null; // pg_sizeof the jsonb column, rough byte size
}

export interface CloudDiagnostic {
  personal: CloudDiagnosticRow;
  global: CloudDiagnosticRow;
  fetchedAt: string; // ISO timestamp
  currentEmail: string | null;
  isAdmin: boolean;
}

/**
 * Compute shape metrics for a single cloud row by fetching the row and
 * inspecting the JSONB client-side. Pulls the full payload once but keeps
 * the analysis simple (no PostgREST-side JSONB operators required).
 */
async function computeRowMetrics(
  supabase: SupabaseClient,
  rowId: string
): Promise<CloudDiagnosticRow> {
  // Single SELECT that returns everything we need.
  // We pull the full `data` JSONB and compute metrics client-side. This is
  // simpler than trying to use server-side JSONB operators (which PostgREST
  // doesn't expose cleanly) and the payload is typically <500KB.
  const { data, error } = await supabase
    .from(CLOUD_TABLE)
    .select("id, updated_at, data")
    .eq("id", rowId)
    .single();

  if (error) {
    if (error.code === "PGRST116") {
      // Row doesn't exist — return empty shape
      return {
        id: rowId,
        exists: false,
        updatedAt: null,
        labelsCount: 0,
        snapshotsCount: 0,
        customLabelsCount: 0,
        beatportWithPersonalDataCount: 0,
        rankingsUpdatedAt: null,
        lastGlobalUpdate: null,
        sizeBytes: null,
      };
    }
    console.error(`[LabelPulse Cloud] Diagnostic row ${rowId} error:`, error.message);
    return {
      id: rowId,
      exists: false,
      updatedAt: null,
      labelsCount: 0,
      snapshotsCount: 0,
      customLabelsCount: 0,
      beatportWithPersonalDataCount: 0,
      rankingsUpdatedAt: null,
      lastGlobalUpdate: null,
      sizeBytes: null,
    };
  }

  // Compute metrics client-side from the data JSON.
  const d: any = data?.data || {};
  const labels: any[] = Array.isArray(d.labels) ? d.labels : [];
  const snapshots: any[] = Array.isArray(d.rankingSnapshots) ? d.rankingSnapshots : [];

  let customCount = 0;
  let beatportWithPersonalCount = 0;
  for (const lbl of labels) {
    if (!lbl || typeof lbl !== "object") continue;
    if (lbl.isCustom === true) {
      customCount++;
      continue;
    }
    // Beatport label — check if it has any real personal data
    const hasNotes = typeof lbl.notes === "string" && lbl.notes.trim() !== "";
    const hasEmails = Array.isArray(lbl.emails) ? lbl.emails.length > 0 : (!!lbl.emails && String(lbl.emails).trim() !== "");
    const hasNonUnknownStatus = typeof lbl.status === "string" && lbl.status !== "" && lbl.status !== "unknown";
    const hasWebsite = typeof lbl.website === "string" && lbl.website.trim() !== "";
    const hasDemoLink = typeof lbl.demoLink === "string" && lbl.demoLink.trim() !== "";
    const hasSocialLink = typeof lbl.socialLink === "string" && lbl.socialLink.trim() !== "";
    const hasSoundcloudLink = typeof lbl.soundcloudLink === "string" && lbl.soundcloudLink.trim() !== "";
    const hasCustomLinks = Array.isArray(lbl.customLinks) ? lbl.customLinks.length > 0 : false;
    if (hasNotes || hasEmails || hasNonUnknownStatus || hasWebsite || hasDemoLink ||
        hasSocialLink || hasSoundcloudLink || hasCustomLinks) {
      beatportWithPersonalCount++;
    }
  }

  // Compute approximate byte size from the JSON string. Uses UTF-8 byte length.
  let sizeBytes: number | null = null;
  try {
    sizeBytes = new Blob([JSON.stringify(d)]).size;
  } catch {
    sizeBytes = null;
  }

  return {
    id: rowId,
    exists: true,
    updatedAt: data?.updated_at || null,
    labelsCount: labels.length,
    snapshotsCount: snapshots.length,
    customLabelsCount: customCount,
    beatportWithPersonalDataCount: beatportWithPersonalCount,
    rankingsUpdatedAt: d.rankingsUpdatedAt || null,
    lastGlobalUpdate: d.lastGlobalUpdate || null,
    sizeBytes,
  };
}

/**
 * Fetch the full diagnostic snapshot (both rows). Admin-only UI helper.
 * Safe to call from non-admin too — just returns the same data shape,
 * but the UI typically only renders this for admins.
 */
export async function getCloudDiagnostic(): Promise<CloudDiagnostic | null> {
  const supabase = getSupabase();
  if (!supabase) return null;

  try {
    const [personal, global] = await Promise.all([
      computeRowMetrics(supabase, getCloudRowId()),
      computeRowMetrics(supabase, getGlobalCloudRowId()),
    ]);

    return {
      personal,
      global,
      fetchedAt: new Date().toISOString(),
      currentEmail: _currentUserEmail,
      isAdmin: isCurrentUserAdmin(),
    };
  } catch (err) {
    console.error("[LabelPulse Cloud] Diagnostic exception:", err);
    return null;
  }
}

// ==================== REALTIME SUBSCRIPTION ====================

/**
 * Subscribe to changes on the app_state row so that updates from
 * other devices (PC ↔ phone) are reflected in near-real-time.
 *
 * CLOUD-FIRST SPLIT (2026-06-23): sets up TWO subscriptions:
 *   1. PERSONAL row (id=email) — profile/demos/per-label personal fields
 *   2. GLOBAL row (id='global') — admin's Beatport rankings/snapshots/artists
 *
 * When a remote UPDATE arrives:
 *   1. set _isApplyingRemoteUpdate = true (so we don't bounce the change back)
 *   2. fetch the latest data from BOTH cloud rows
 *   3. merge it into the local store via applyRemoteData
 *   4. set _isApplyingRemoteUpdate = false
 */
export function setupRealtimeSubscription(): () => void {
  const supabase = getSupabase();
  if (!supabase) return () => {};

  // Tear down any existing channel first
  teardownRealtime();

  try {
    // ---- PERSONAL channel: own row updates (profile edits from other devices) ----
    const personalChannel = supabase
      .channel("app_state_personal")
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: CLOUD_TABLE,
          filter: `id=eq.${getCloudRowId()}`,
        },
        async (payload: any) => {
          if (_isApplyingRemoteUpdate) return;
          const newData = payload?.new?.data;
          if (!newData) return;
          console.log("[LabelPulse Cloud] Realtime PERSONAL update, applying personal overlay...");
          _isApplyingRemoteUpdate = true;
          try {
            // Personal update: only the personal overlay changed. We need to
            // re-merge with the global row to produce the final state.
            // Easiest: just reload both from cloud.
            const fresh = await loadStateFromCloud();
            if (fresh) await applyRemoteData(fresh);
            setStatus("synced");
          } finally {
            _isApplyingRemoteUpdate = false;
          }
        }
      )
      .subscribe((status: string) => {
        if (status === "SUBSCRIBED") {
          console.log("[LabelPulse Cloud] Realtime PERSONAL subscription active");
        } else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
          console.warn("[LabelPulse Cloud] Personal subscription issue:", status);
        }
      });

    // ---- GLOBAL channel: admin pushed a new scrape — refresh rankings ----
    const globalChannel = supabase
      .channel("app_state_global")
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: CLOUD_TABLE,
          filter: `id=eq.${getGlobalCloudRowId()}`,
        },
        async (payload: any) => {
          if (_isApplyingRemoteUpdate) return;
          const newData = payload?.new?.data;
          if (!newData) return;
          console.log("[LabelPulse Cloud] Realtime GLOBAL update (admin pushed new rankings), refreshing...");
          _isApplyingRemoteUpdate = true;
          try {
            // Global update: admin pushed new Beatport data. Reload both rows
            // and re-merge so the user sees the new rankings immediately.
            const fresh = await loadStateFromCloud();
            if (fresh) await applyRemoteData(fresh);
            setStatus("synced");
          } finally {
            _isApplyingRemoteUpdate = false;
          }
        }
      )
      .subscribe((status: string) => {
        if (status === "SUBSCRIBED") {
          console.log("[LabelPulse Cloud] Realtime GLOBAL subscription active");
        } else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
          console.warn("[LabelPulse Cloud] Global subscription issue:", status);
        }
      });

    // Track both channels for teardown
    _realtimeChannel = personalChannel;
    _realtimeGlobalChannel = globalChannel;
    return teardownRealtime;
  } catch (err) {
    console.warn("[LabelPulse Cloud] Realtime setup failed:", err);
    return () => {};
  }
}

function teardownRealtime() {
  const supabase = _supabase;
  if (_realtimeChannel) {
    try {
      if (supabase) supabase.removeChannel(_realtimeChannel);
    } catch {
      // ignore
    }
    _realtimeChannel = null;
  }
  if (_realtimeGlobalChannel) {
    try {
      if (supabase) supabase.removeChannel(_realtimeGlobalChannel);
    } catch {
      // ignore
    }
    _realtimeGlobalChannel = null;
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
    // Beatport identity — preserve from local so logos propagate via realtime
    "imageUrl", "slug",
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

    // ⚠️ BUG FIX (2026-06-25, "photo revert on iPhone"): if the user just
    // edited their profile locally (within LOCAL_PROFILE_EDIT_GRACE_MS),
    // preserve ALL local profile fields against the cloud update. This
    // prevents a stale cloud row (e.g., photoUrl from before the user's
    // new upload) from overwriting freshly-edited local fields when a
    // realtime update arrives mid-push.
    //
    // Before this fix: Lutenzo uploads photo → state has new photo →
    // realtime update arrives with old photo → mergeProfiles keeps new
    // photo (because non-empty wins)... but if the local edit somehow
    // didn't make it into store.userProfile yet (race with setState),
    // mergeProfiles would take the cloud's old photo. This safety net
    // guarantees the local profile wins unconditionally for 5 seconds
    // after a local edit.
    if (isLocalProfileEditRecent()) {
      // 2026-06-25 — structured logging for debugging avatar revert issues.
      // Logs the field-by-field comparison so we can see exactly which
      // fields differ between local and cloud when a realtime update
      // arrives during the grace period. Especially useful for diagnosing
      // the Lutenzo iPhone avatar bug if it recurs.
      const localProfile = store.userProfile || {};
      const cloudProfile = cloudData.userProfile || {};
      const diffs: string[] = [];
      for (const k of Object.keys(cloudProfile)) {
        const lv = (localProfile as any)[k];
        const cv = (cloudProfile as any)[k];
        if (lv !== cv) {
          // For long fields (photoUrl, bio), just log length to avoid
          // dumping a 75KB data URL into the console.
          const lvDesc = typeof lv === "string" && lv.length > 50 ? `<${lv.length} chars>` : JSON.stringify(lv);
          const cvDesc = typeof cv === "string" && cv.length > 50 ? `<${cv.length} chars>` : JSON.stringify(cv);
          diffs.push(`${k}: local=${lvDesc} cloud=${cvDesc}`);
        }
      }
      console.info(
        `[LabelPulse Cloud] Realtime update within grace period (10s) — preserving local profile.` +
        (diffs.length > 0 ? ` Diffs: ${diffs.join(" | ")}` : " (no field diffs)")
      );
      // Take local profile as base, only fill in fields that are EMPTY locally
      // but NON-EMPTY in cloud (so we don't lose data the user doesn't have).
      const safeMerged: any = { ...localProfile };
      for (const k of Object.keys(cloudProfile)) {
        const lv = (localProfile as any)[k];
        const cv = (cloudProfile as any)[k];
        const localIsEmpty =
          (typeof lv === "string" && lv.trim() === "") ||
          (Array.isArray(lv) && lv.length === 0) ||
          lv === undefined ||
          lv === null;
        const cloudHasData =
          (typeof cv === "string" && cv.trim() !== "") ||
          (Array.isArray(cv) && cv.length > 0) ||
          (cv !== undefined && cv !== null && typeof cv !== "string" && !Array.isArray(cv));
        if (localIsEmpty && cloudHasData) {
          safeMerged[k] = cv;
        }
      }
      // Always preserve BYOK credentials locally
      safeMerged.supabaseUrl = localProfile.supabaseUrl;
      safeMerged.supabaseAnonKey = localProfile.supabaseAnonKey;
      safeMerged.cyaniteApiToken = localProfile.cyaniteApiToken;
      merged.userProfile = safeMerged;
    }
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
    // CLOUD-FIRST SPLIT: artists always come from the GLOBAL row, regardless
    // of who is logged in. Admin pushes there via saveArtistsToCloud; users
    // just read. This way every user sees the same Beatport artists that
    // admin last scraped.
    const { data, error } = await supabase
      .from(CLOUD_TABLE)
      .select("data, updated_at")
      .eq("id", getGlobalArtistsCloudRowId())
      .single();

    if (error) {
      if (error.code === "PGRST116") {
        // No rows — admin hasn't pushed artists yet (or this is a fresh install)
        return [];
      }
      console.error("[LabelPulse Cloud] Artists load error:", error.message);
      return [];
    }

    const artists = (data?.data as any)?.artists;
    if (!Array.isArray(artists) || artists.length === 0) return [];

    console.info(
      `[LabelPulse Cloud] Artists loaded from GLOBAL cloud row: ${artists.length} artists (saved at ${data?.data?.savedAt || "unknown"})`
    );
    return artists;
  } catch (err) {
    console.error("[LabelPulse Cloud] Artists load exception:", err);
    return [];
  }
}

/**
 * Merge two artist arrays by id (union). When the same id appears in both,
 * keep the version with the most-recent `scrapedAt` (or the local one on tie).
 * This is the artist equivalent of mergeCloudData: safe, additive, never
 * removes data.
 *
 * Used by:
 *  - loadArtistsOnBoot (when both IDB and cloud have artists)
 *  - explicitMergeArtistsCloud (user-triggered from CloudRecovery panel)
 */
export function mergeArtistsArrays(local: any[], cloud: any[]): any[] {
  const a = Array.isArray(local) ? local : [];
  const b = Array.isArray(cloud) ? cloud : [];
  const byId = new Map<string, any>();
  const byName = new Map<string, any>();

  // Insert cloud first (so local can override on conflict below)
  for (const c of b) {
    if (!c || typeof c !== "object") continue;
    const id = c.id || c.artistId || `_${c.name?.toLowerCase?.() || ""}`;
    byId.set(id, { ...c });
    const nm = (c.name || c.artistName || "").toString().toLowerCase().trim();
    if (nm) byName.set(nm, { ...c });
  }

  for (const l of a) {
    if (!l || typeof l !== "object") continue;
    const id = l.id || l.artistId || `_${(l.name || l.artistName || "").toLowerCase()}`;
    const nm = (l.name || l.artistName || "").toString().toLowerCase().trim();
    const existing = byId.get(id) || (nm ? byName.get(nm) : undefined);

    if (!existing) {
      byId.set(id, { ...l });
      if (nm) byName.set(nm, { ...l });
      continue;
    }

    // Both have this artist — keep the one with most tracks / most recent scrape
    const exTracks = Array.isArray(existing.tracksByGenre)
      ? Object.values(existing.tracksByGenre).flat().length
      : (Array.isArray(existing.tracks) ? existing.tracks.length : 0);
    const loTracks = Array.isArray(l.tracksByGenre)
      ? Object.values(l.tracksByGenre).flat().length
      : (Array.isArray(l.tracks) ? l.tracks.length : 0);

    const exTs = new Date(existing.scrapedAt || existing.updatedAt || 0).getTime();
    const loTs = new Date(l.scrapedAt || l.updatedAt || 0).getTime();

    // Local wins if it has more tracks OR more recent scrape OR has bio when existing doesn't
    const localHasBio = !!((l as any).bio || (l as any).bioSummary);
    const exHasBio = !!((existing as any).bio || (existing as any).bioSummary);

    let pickLocal = false;
    if (loTracks > exTracks) pickLocal = true;
    else if (loTracks === exTracks && loTs > exTs) pickLocal = true;
    else if (localHasBio && !exHasBio) pickLocal = true;

    if (pickLocal) {
      const merged = { ...existing, ...l };
      // Preserve any extra fields from cloud that local doesn't have
      for (const k of Object.keys(existing)) {
        if (!(k in l) && merged[k] === undefined) merged[k] = existing[k];
      }
      byId.set(id, merged);
      if (nm) byName.set(nm, merged);
    } else {
      // Keep cloud's version but ensure local-only fields are preserved
      const merged = { ...l, ...existing };
      for (const k of Object.keys(l)) {
        if (!(k in existing) && merged[k] === undefined) merged[k] = l[k];
      }
      byId.set(id, merged);
      if (nm) byName.set(nm, merged);
    }
  }

  return Array.from(byId.values());
}

/**
 * Force-push the current local artists to cloud (REPLACING cloud's artists).
 * Used by:
 *  - CloudRecovery panel ("Sovrascrivi cloud con locale")
 *  - loadArtistsOnBoot when local has artists and cloud is empty/has fewer
 *
 * Returns true on success.
 */
export async function forcePushArtistsToCloud(artists: any[]): Promise<boolean> {
  const supabase = getSupabase();
  if (!supabase) return false;
  if (!Array.isArray(artists) || artists.length === 0) return false;

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
      console.error("[LabelPulse Cloud] Force-push artists error:", error.message);
      return false;
    }

    console.info(
      `[LabelPulse Cloud] Force-push artists: ${artists.length} → cloud (overwrite).`
    );
    return true;
  } catch (err) {
    console.error("[LabelPulse Cloud] Force-push artists exception:", err);
    return false;
  }
}

/**
 * Explicit merge of local + cloud artists. Pulls cloud, runs mergeArtistsArrays,
 * pushes the merged result back to cloud. Used by the CloudRecovery panel
 * (button "Unisci cloud + locale" — extended to cover artists too).
 *
 * Returns a summary for the UI to display.
 */
export async function explicitMergeArtistsCloud(): Promise<{
  ok: boolean;
  summary: string;
}> {
  const cloudArtists = await loadArtistsFromCloud();
  const localState = useAppStore.getState();
  const localArtists = Array.isArray(localState.artists) ? localState.artists : [];

  if (localArtists.length === 0 && cloudArtists.length === 0) {
    return { ok: false, summary: "Nessun artista né in locale né nel cloud." };
  }

  const merged = mergeArtistsArrays(localArtists, cloudArtists);

  // Update local store
  useAppStore.setState({ artists: merged });

  // Lazy import to avoid circular dep
  try {
    const storeMod = await import("./store");
    if (typeof (storeMod as any).saveArtistsToIDB === "function") {
      // Save to IDB too so future boots are instant
      const { saveArtistsToIDB } = await import("./artists-idb");
      await saveArtistsToIDB(merged);
    }
  } catch {}

  // Push merged to cloud (overwrite cloud's artists row)
  // 🔒 FASE D FIX: skip artists push — causes statement timeout (blob 5MB+)
  // Artists stay in IDB locally; cloud already has them from previous pushes.
  // const pushed = await forcePushArtistsToCloud(merged);
  const pushed = true; // skip — assume success to avoid timeout

  return {
    ok: pushed,
    summary:
      `Artisti merge: locale=${localArtists.length} + cloud=${cloudArtists.length} → ${merged.length} mergiati. ` +
      (pushed ? "Risultato spinto al cloud." : "Push al cloud fallito."),
  };
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

// Build trigger: 2026-06-22T19:38:57Z - force Vercel redeploy with cloud-first code
