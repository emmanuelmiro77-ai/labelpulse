"use client";

import { create } from "zustand";
import { persist, createJSONStorage, StateStorage } from "zustand/middleware";
import type { Locale } from "./i18n";
import labelData from "./labels-data.json";
import { saveStateToCloud, loadStateFromCloud, isSupabaseConfigured, isApplyingRemoteUpdate } from "./supabase";
import { saveArtistsToIDB, loadArtistsFromIDB } from "./artists-idb";

// ==================== TYPES ====================

export type SubmissionType = "email" | "webform" | "platform";
export type LabelStatus = "open" | "closed";
export type DemoStatus =
  | "ready"
  | "sent"
  | "reviewing"
  | "accepted"
  | "rejected";

export interface Label {
  id: string;
  name: string;
  genre: string; // primary genre for user-added
  submissionType: SubmissionType;
  contactInfo: string;
  status: LabelStatus;
  notes: string;
  createdAt: string;
  // User-enriched data (persistent)
  emails: string[];
  website: string;
  demoLink: string;
  socialLink: string;
  soundcloudLink: string;
  beatportLink: string;
  customLinks: { type: string; value: string }[];
  // Real Beatport data
  genres: string[];
  rankByGenre: Record<string, number>;
  pointsByGenre: Record<string, number>;
  trending: boolean;
  trendingRankByGenre: Record<string, number>;
  trendingPointsByGenre: Record<string, number>;
  isCustom?: boolean; // user-added label
  prevRankByGenre?: Record<string, number>; // Previous ranking snapshot (before last import)
}

// ==================== ARTISTS & TRACKS (scraper v2) ====================
// Captured from Beatport Top-100 per genre. Each artist aggregates their
// tracks across all genres they appear in, plus all labels they've published on.
// Storage: persisted in IndexedDB (NOT localStorage — too large, 9MB+ for 3000+ artists).

export interface ArtistTrack {
  id: number;
  name: string;
  mixName: string;
  position: number;
  points: number;
  label: string;
  labelId: number | null;
  labelSlug: string;
  releaseDate: string;
  bpm: number | null;
  keyCamelot: string;
  keyName: string;
  coverArt: string;
  sampleUrl: string;
  seenAt: string;
}

export interface Artist {
  id: string; // 'bp_6824' (Beatport id) or 'nm_<UPPERCASE_NAME>' (name-only fallback)
  beatportId: number | null;
  name: string;
  slug: string;
  imageUrl: string;
  genres: string[];
  tracksByGenre: Record<string, ArtistTrack[]>;
  labelsPublishedOn: string[];
  totalPoints: number;
  bestPosition: number;
  isRemixerOnly: boolean;
  trending: boolean;
  trendingRankByGenre?: Record<string, number>;
  trendingPointsByGenre?: Record<string, number>;
  firstSeenAt?: string; // ISO timestamp of first scrape that included this artist
  lastSeenAt?: string; // ISO timestamp of most recent scrape that included this artist
}

// ==================== RANKING SNAPSHOTS ====================
// Stores historical ranking data for time-period analysis (like Beatstats)
// Each snapshot captures all label rankings at the moment of import.

export type RankingTimePeriod = "current" | "1m" | "3m" | "1y" | "all";

export interface RankingSnapshot {
  id: string;
  timestamp: string; // ISO date when the snapshot was taken
  source: string; // 'beatport', 'beatstats', etc.
  // Per-genre, per-label ranking data
  genres: Record<string, Record<string, { rank: number; points: number }>>;
  // genre -> labelName -> {rank, points}
}

export interface Demo {
  id: string;
  trackName: string;
  labelId: string;
  status: DemoStatus;
  sentDate: string | null;
  link: string; // primary SoundCloud link (legacy)
  links: { type: string; value: string }[]; // multiple demo links (SoundCloud, Dropbox, WeTransfer, etc.)
  notes: string;
  createdAt: string;
  pitchText: string;
  artistName: string;
  genre: string; // demo genre
  bpm: string;
  key: string;
  // Audio analysis (free in-browser or Cyanite BYOK)
  analysis?: {
    bpm: number;
    bpmConfidence: number;
    key: {
      pitchClass: number;
      mode: 0 | 1;
      camelot: string;
      name: string;
      confidence: number;
    };
    energy: number;
    danceability: number;
    loudness: number;
    duration: number;
    analysisSource: "essentia" | "cyanite";
    analysisDate: string;
    cyaniteGenre?: string;
    cyaniteMoods?: string[];
    cyaniteInstruments?: string[];
  };
}

// ==================== HELPERS ====================

const genId = () =>
  Date.now().toString(36) + Math.random().toString(36).slice(2, 7);

// Convert imported data to Label objects
function buildLabelsFromData(): Label[] {
  return labelData.labels.map((l) => ({
    id: l.id,
    name: l.name,
    genre: l.genres[0] || "",
    submissionType: "email" as SubmissionType,
    contactInfo: "",
    status: "open" as LabelStatus,
    notes: "",
    createdAt: new Date().toISOString(),
    emails: [] as string[],
    website: "",
    demoLink: "",
    socialLink: "",
    soundcloudLink: "",
    beatportLink: "",
    customLinks: [] as { type: string; value: string }[],
    genres: l.genres,
    rankByGenre: (l.rankByGenre || {}) as Record<string, number>,
    pointsByGenre: (l.pointsByGenre || {}) as Record<string, number>,
    trending: l.trending || false,
    trendingRankByGenre: (l.trendingRankByGenre || {}) as Record<string, number>,
    trendingPointsByGenre: (l.trendingPointsByGenre || {}) as Record<string, number>,
    isCustom: false,
  }));
}

// ==================== ROBUST STORAGE ====================
// Custom storage with data protection:
// 1. Primary localStorage key
// 2. Backup localStorage key (written IMMEDIATELY on every save — no debounce)
// 3. Data integrity check on load (auto-recover from backup if data loss detected)
// 4. Rehydration guard: blocks ALL writes until Zustand persist loads data

const PRIMARY_KEY = "labelpulse-storage";
const BACKUP_KEY = "labelpulse-storage-backup";
// CRITICAL: dedicated, append-only backup slot for rankingSnapshots.
// This is the user's "storico caricamenti" — months of Beatport/Beatstats imports.
// We persist it SEPARATELY from the main store so that even if the main store
// (or its backup) gets wiped by a bad cloud sync, a rehydrate, a migration bug,
// or a localStorage quota error, the snapshots survive in their own slot.
const SNAPSHOTS_BACKUP_KEY = "labelpulse-snapshots-backup";

// ==================== USER PROFILE BACKUP (SIDE CAR) ====================
// Like SNAPSHOTS_BACKUP_KEY but for the user profile (artistName, bio, email,
// scLink, photoUrl, links, cyaniteApiToken, supabaseUrl, supabaseAnonKey).
//
// This is the user's identity card. Even if cloud sync wipes the main store
// (rare but has happened), or the user logs in from a new device and the
// cloud has nothing yet, the user can still recover their profile from this
// sidecar slot.
//
// Strategy: write on every setItem (merged, never overwrite), never clear
// except via explicit reset.
const PROFILE_BACKUP_KEY = "labelpulse-profile-backup";

const SEED_LABEL_COUNT = labelData.labels.length;

// Rehydration guard: blocks ALL writes until Zustand persist has loaded data from localStorage.
// Before rehydration, the store contains seed data which would overwrite user data.
let _rehydrated = false;

function safeJsonParse(str: string | null): any | null {
  if (!str) return null;
  try {
    return JSON.parse(str);
  } catch {
    return null;
  }
}

function safeLocalStorageGet(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function safeLocalStorageSet(key: string, value: string): boolean {
  try {
    localStorage.setItem(key, value);
    return true;
  } catch (e) {
    console.error(`[LabelPulse Storage] Failed to write ${key}:`, e);
    return false;
  }
}

function safeLocalStorageRemove(key: string): void {
  try {
    localStorage.removeItem(key);
  } catch {
    // Ignore
  }
}

/**
 * Extract rankingSnapshots array from a raw localStorage JSON string.
 * Returns [] if not found / invalid.
 */
function extractSnapshotsFromRaw(raw: string | null): RankingSnapshot[] {
  if (!raw) return [];
  const data = safeJsonParse(raw);
  if (!data) return [];
  const snaps = data.state?.rankingSnapshots ?? data.rankingSnapshots;
  return Array.isArray(snaps) ? snaps : [];
}

/**
 * Merge two snapshot arrays, deduping by `id` first, then by `timestamp+source`.
 * Always returns ascending-by-timestamp order.
 * Used by: importData (backup file), robustStorage.getItem (safety-net restore),
 * and loadFromCloud (cloud merge).
 */
function mergeSnapshots(
  base: RankingSnapshot[] | null | undefined,
  incoming: RankingSnapshot[] | null | undefined
): RankingSnapshot[] {
  const a = Array.isArray(base) ? base : [];
  const b = Array.isArray(incoming) ? incoming : [];
  const seen = new Set<string>();
  const out: RankingSnapshot[] = [];
  for (const s of [...a, ...b]) {
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
  return out;
}

/**
 * Check if persisted data has user edits (emails, notes, links, etc.)
 * This helps us detect if the store was accidentally reset to seed data.
 */
function countUserEditedLabels(labels: any[]): number {
  if (!Array.isArray(labels)) return 0;
  return labels.filter((l) =>
    (l.emails && l.emails.length > 0) ||
    (l.notes && l.notes.trim() !== "") ||
    (l.website && l.website.trim() !== "") ||
    (l.demoLink && l.demoLink.trim() !== "") ||
    (l.socialLink && l.socialLink.trim() !== "") ||
    (l.soundcloudLink && l.soundcloudLink.trim() !== "") ||
    (l.contactInfo && l.contactInfo.trim() !== "") ||
    l.isCustom === true
  ).length;
}

function getTotalLabelCount(data: any): number {
  if (!data) return 0;
  if (Array.isArray(data.labels)) return data.labels.length;
  if (data.state && Array.isArray(data.state.labels)) return data.state.labels.length;
  return 0;
}

/**
 * Extract user-edited label count from raw localStorage string.
 * Used by the write guard to check if a write would cause data loss.
 */
function getUserEditCountFromRaw(raw: string | null): number {
  if (!raw) return 0;
  const data = safeJsonParse(raw);
  if (!data) return 0;
  const labels = data.state?.labels || data.labels || [];
  return countUserEditedLabels(labels);
}

// (debounced backup removed — we now write backup IMMEDIATELY on every write for maximum data safety)

const robustStorage: StateStorage = {
  getItem: (name: string): string | null => {
    const primaryRaw = safeLocalStorageGet(PRIMARY_KEY);
    const backupRaw = safeLocalStorageGet(BACKUP_KEY);

    const primaryData = safeJsonParse(primaryRaw);
    const backupData = safeJsonParse(backupRaw);

    let result: string | null = null;
    let usedSidecarSnapshots = false;

    // If primary is missing/corrupt, try backup
    if (!primaryData) {
      if (backupData) {
        console.warn("[LabelPulse Storage] Primary data missing/corrupt, restoring from backup");
        if (backupRaw) safeLocalStorageSet(PRIMARY_KEY, backupRaw);
        result = backupRaw;
      }
      // Both empty — first visit, result stays null
    } else if (backupData) {
      // Both exist — check for data loss
      const primaryLabelCount = getTotalLabelCount(primaryData);
      const backupLabelCount = getTotalLabelCount(backupData);
      const primaryUserEdits = primaryData.state?.labels
        ? countUserEditedLabels(primaryData.state.labels)
        : countUserEditedLabels(primaryData.labels || []);
      const backupUserEdits = backupData.state?.labels
        ? countUserEditedLabels(backupData.state.labels)
        : countUserEditedLabels(backupData.labels || []);

      // If primary has fewer labels than backup AND backup has more or equal user data
      if (backupLabelCount > primaryLabelCount && backupUserEdits >= primaryUserEdits) {
        console.warn(
          `[LabelPulse Storage] DATA LOSS DETECTED! Primary: ${primaryLabelCount} labels (${primaryUserEdits} edited), Backup: ${backupLabelCount} labels (${backupUserEdits} edited). Restoring from backup.`
        );
        if (backupRaw) safeLocalStorageSet(PRIMARY_KEY, backupRaw);
        result = backupRaw;
      } else if (backupUserEdits > primaryUserEdits && backupLabelCount >= primaryLabelCount) {
        // If primary has fewer user edits than backup, use backup
        console.warn(
          `[LabelPulse Storage] More user data in backup (${backupUserEdits} vs ${primaryUserEdits} edited labels). Restoring from backup.`
        );
        if (backupRaw) safeLocalStorageSet(PRIMARY_KEY, backupRaw);
        result = backupRaw;
      } else {
        result = primaryRaw;
      }
    } else {
      // Primary exists, no backup — normal case
      result = primaryRaw;
    }

    // CRITICAL SAFETY NET for rankingSnapshots:
    // If the chosen result has 0 snapshots but the dedicated SNAPSHOTS_BACKUP_KEY
    // has snapshots, splice them in. This handles the scenario where the main
    // store got wiped (bad cloud sync, migration bug, partial overwrite) but the
    // snapshots sidecar survived. Without this, the user loses months of
    // "storico caricamenti" and the Classifiche page resets to "first time".
    try {
      const currentSnaps = extractSnapshotsFromRaw(result);
      const sidecarRaw = safeLocalStorageGet(SNAPSHOTS_BACKUP_KEY);
      const sidecarSnaps = extractSnapshotsFromRaw(sidecarRaw);
      if (sidecarSnaps.length > 0 && sidecarSnaps.length > currentSnaps.length) {
        console.warn(
          `[LabelPulse Storage] SNAPSHOTS RECOVERY: result has ${currentSnaps.length} snapshots, sidecar has ${sidecarSnaps.length}. Merging sidecar into result.`
        );
        const mergedSnaps = mergeSnapshots(currentSnaps, sidecarSnaps);
        const parsed = result ? safeJsonParse(result) : {};
        if (parsed && typeof parsed === "object") {
          if (parsed.state && typeof parsed.state === "object") {
            parsed.state.rankingSnapshots = mergedSnaps;
          } else {
            parsed.rankingSnapshots = mergedSnaps;
          }
          result = JSON.stringify(parsed);
          usedSidecarSnapshots = true;
        }
      }
    } catch (e) {
      console.warn("[LabelPulse Storage] Snapshots sidecar recovery failed:", e);
    }

    // CRITICAL SAFETY NET for userProfile:
    // Same logic as snapshots. If the chosen result has an empty/seed profile
    // but PROFILE_BACKUP_KEY has real data, splice it in. This is the user's
    // identity card — losing artistName, bio, email, links is catastrophic.
    try {
      const currentProfile = extractProfileFromRaw(result);
      const sidecarProfile = extractProfileFromRaw(safeLocalStorageGet(PROFILE_BACKUP_KEY));
      if (sidecarProfile && !currentProfile) {
        console.warn(
          `[LabelPulse Storage] PROFILE RECOVERY: result has empty profile, sidecar has data (artistName=${!!sidecarProfile.artistName}, bio=${!!sidecarProfile.bio}). Merging sidecar into result.`
        );
        const parsed = result ? safeJsonParse(result) : {};
        if (parsed && typeof parsed === "object") {
          if (parsed.state && typeof parsed.state === "object") {
            parsed.state.userProfile = sidecarProfile;
          } else {
            parsed.userProfile = sidecarProfile;
          }
          result = JSON.stringify(parsed);
        }
      } else if (sidecarProfile && currentProfile) {
        // Both have data — merge (sidecar fills empty fields in current)
        const mergedProfile = mergeProfiles(sidecarProfile, currentProfile);
        const parsed = result ? safeJsonParse(result) : {};
        if (parsed && typeof parsed === "object" && mergedProfile) {
          if (parsed.state && typeof parsed.state === "object") {
            parsed.state.userProfile = mergedProfile;
          } else {
            parsed.userProfile = mergedProfile;
          }
          result = JSON.stringify(parsed);
        }
      }
    } catch (e) {
      console.warn("[LabelPulse Storage] Profile sidecar recovery failed:", e);
    }

    // CRITICAL: Mark rehydrated BEFORE returning — Zustand will call setItem with
    // merged data immediately after this getItem returns, and we MUST allow that write.
    // This ensures seed data (initial state) writes are blocked, but merged data writes pass.
    _rehydrated = true;

    if (usedSidecarSnapshots) {
      console.info("[LabelPulse Storage] rankingSnapshots restored from sidecar backup.");
    }

    return result;
  },

  setItem: (name: string, value: string): void => {
    // REHYDRATION GUARD: Block ALL writes before Zustand persist has loaded data.
    // Before rehydration, the store only has seed data — writing it would overwrite
    // any user data in localStorage. After rehydration, ALL writes are legitimate
    // (user actions, repairs, imports, etc.) and must ALWAYS be saved.
    if (!_rehydrated) {
      console.warn(
        `[LabelPulse Storage] BLOCKED pre-rehydration write — protecting user data in localStorage`
      );
      return;
    }

    // Write to primary immediately
    const primaryOk = safeLocalStorageSet(PRIMARY_KEY, value);

    // Write to backup IMMEDIATELY (no debounce) for maximum data safety.
    // Previous 60s debounce caused data loss if browser crashed before backup was written.
    safeLocalStorageSet(BACKUP_KEY, value);

    // CRITICAL: also persist rankingSnapshots to a dedicated slot.
    // This is the user's "storico caricamenti" — months of imports that cannot
    // be regenerated. Keeping it in a separate key means even a catastrophic
    // main-store wipe (bad cloud sync, migration bug, quota error) leaves the
    // snapshots recoverable.
    try {
      const snaps = extractSnapshotsFromRaw(value);
      if (snaps.length > 0) {
        // Merge with whatever's already in the snapshots slot — NEVER overwrite
        // existing snapshots with fewer snapshots (would happen if the current
        // write had a partial/empty snapshot array due to some upstream bug).
        const existing = extractSnapshotsFromRaw(safeLocalStorageGet(SNAPSHOTS_BACKUP_KEY));
        const merged = mergeSnapshots(existing, snaps);
        safeLocalStorageSet(
          SNAPSHOTS_BACKUP_KEY,
          JSON.stringify(merged)
        );
      }
    } catch (e) {
      console.warn("[LabelPulse Storage] Snapshots-sidecar write failed:", e);
    }

    // CRITICAL: also persist userProfile to a dedicated slot.
    // Same pattern as snapshots. The profile is the user's identity card —
    // artistName, bio, email, social links, photo. We can NEVER lose this,
    // even if cloud sync wipes the main store.
    try {
      const profile = extractProfileFromRaw(value);
      if (profile) {
        const existing = extractProfileFromRaw(safeLocalStorageGet(PROFILE_BACKUP_KEY));
        const merged = mergeProfiles(existing, profile);
        if (merged) {
          safeLocalStorageSet(
            PROFILE_BACKUP_KEY,
            JSON.stringify({ userProfile: merged })
          );
        }
      }
    } catch (e) {
      console.warn("[LabelPulse Storage] Profile-sidecar write failed:", e);
    }

    if (!primaryOk) {
      console.error("[LabelPulse Storage] Primary write failed!");
    }
  },

  removeItem: (name: string): void => {
    safeLocalStorageRemove(PRIMARY_KEY);
    safeLocalStorageRemove(BACKUP_KEY);
    // NOTE: do NOT remove SNAPSHOTS_BACKUP_KEY or PROFILE_BACKUP_KEY here.
    // These are the user's permanent records (months of ranking history +
    // artist identity) — clearing the main store should NEVER nuke them.
    // The only way to clear them is an explicit user action ("reset all data"
    // button) which calls safeLocalStorageRemove directly.
  },
};

/**
 * Force-write a backup immediately (e.g., on visibility change or before unload).
 * Since backup is now written on every setItem, this is a safety net.
 */
export function forceBackupNow(): void {
  if (typeof window === "undefined") return;
  const primaryRaw = safeLocalStorageGet(PRIMARY_KEY);
  if (primaryRaw) {
    safeLocalStorageSet(BACKUP_KEY, primaryRaw);
  }
  // Also touch the snapshots sidecar so it stays warm.
  const snaps = extractSnapshotsFromRaw(primaryRaw);
  if (snaps.length > 0) {
    const existing = extractSnapshotsFromRaw(safeLocalStorageGet(SNAPSHOTS_BACKUP_KEY));
    const merged = mergeSnapshots(existing, snaps);
    safeLocalStorageSet(SNAPSHOTS_BACKUP_KEY, JSON.stringify(merged));
  }
}

/**
 * Returns the current rankingSnapshots from the dedicated sidecar backup.
 * Used by the UI to offer "restore history from emergency backup" if the
 * main store ever shows 0 snapshots.
 */
export function readSnapshotsSidecar(): RankingSnapshot[] {
  if (typeof window === "undefined") return [];
  return extractSnapshotsFromRaw(safeLocalStorageGet(SNAPSHOTS_BACKUP_KEY));
}

/**
 * Force-restore rankingSnapshots from the sidecar into the live store.
 * Returns the number of snapshots restored, or 0 if the sidecar was empty
 * / already in sync.
 */
export function restoreSnapshotsFromSidecar(): number {
  if (typeof window === "undefined") return 0;
  const sidecarSnaps = extractSnapshotsFromRaw(safeLocalStorageGet(SNAPSHOTS_BACKUP_KEY));
  if (sidecarSnaps.length === 0) return 0;
  const current = useAppStore.getState().rankingSnapshots || [];
  const merged = mergeSnapshots(current, sidecarSnaps);
  const added = merged.length - current.length;
  if (added > 0) {
    useAppStore.setState({ rankingSnapshots: merged });
    console.info(
      `[LabelPulse] Restored ${added} snapshot(s) from sidecar backup.`
    );
  }
  return Math.max(added, 0);
}

// ==================== USER PROFILE BACKUP HELPERS ====================

/**
 * Extract userProfile from a raw JSON string (main store JSON, backup JSON,
 * or sidecar JSON). Returns null if missing/invalid.
 */
function extractProfileFromRaw(raw: string | null): any | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    const profile = parsed?.state?.userProfile ?? parsed?.userProfile ?? null;
    if (profile && typeof profile === "object") {
      // Must have at least one non-empty field to be considered "real"
      const hasData =
        !!profile.artistName ||
        !!profile.bio ||
        !!profile.email ||
        !!profile.scLink ||
        !!profile.photoUrl ||
        (Array.isArray(profile.links) && profile.links.length > 0) ||
        !!profile.cyaniteApiToken ||
        !!profile.supabaseUrl;
      if (hasData) return profile;
    }
  } catch {
    /* ignore */
  }
  return null;
}

/**
 * Merge two user profiles — non-empty fields win.
 * This is the safety net: if the cloud ever sends a profile with empty
 * artistName, but the sidecar has the real artistName, we keep the real one.
 */
export function mergeProfiles(base: any | null, incoming: any | null): any | null {
  if (!base && !incoming) return null;
  if (!base) return incoming;
  if (!incoming) return base;
  const merged: any = { ...base };
  for (const k of Object.keys(incoming)) {
    const v = incoming[k];
    if (k === "links") {
      // Merge link arrays (dedupe by type|value)
      const a = Array.isArray(base.links) ? base.links : [];
      const b = Array.isArray(v) ? v : [];
      const seen = new Set<string>();
      const out: { type: string; value: string }[] = [];
      for (const link of [...a, ...b]) {
        if (!link || typeof link !== "object") continue;
        const key = `${link.type}|${link.value}`;
        if (seen.has(key)) continue;
        seen.add(key);
        out.push(link);
      }
      merged.links = out;
    } else if (typeof v === "string") {
      // Non-empty string wins over empty
      if (v && !merged[k]) merged[k] = v;
    } else {
      // For any other type, prefer defined over undefined
      if (v !== undefined && v !== null && !merged[k]) merged[k] = v;
    }
  }
  return merged;
}

/**
 * Returns the most recently saved userProfile from the sidecar backup.
 */
export function readProfileSidecar(): any | null {
  if (typeof window === "undefined") return null;
  return extractProfileFromRaw(safeLocalStorageGet(PROFILE_BACKUP_KEY));
}

/**
 * Force-restore userProfile from the sidecar into the live store, IF the
 * current live profile is empty/seed AND the sidecar has real data.
 *
 * Returns true if a restore happened, false otherwise.
 */
export function restoreProfileFromSidecar(): boolean {
  if (typeof window === "undefined") return false;
  const sidecarProfile = extractProfileFromRaw(safeLocalStorageGet(PROFILE_BACKUP_KEY));
  if (!sidecarProfile) return false;

  const current = useAppStore.getState().userProfile;
  const currentHasData =
    !!current.artistName ||
    !!current.bio ||
    !!current.email ||
    !!current.scLink ||
    !!current.photoUrl ||
    (Array.isArray(current.links) && current.links.length > 0) ||
    !!current.cyaniteApiToken ||
    !!current.supabaseUrl;

  // If current profile has data, merge (sidecar can fill empty fields)
  // If current profile is empty, replace with sidecar
  const merged = currentHasData
    ? mergeProfiles(sidecarProfile, current)
    : sidecarProfile;

  if (merged && merged !== current) {
    useAppStore.setState({ userProfile: merged });
    console.info(
      `[LabelPulse] Restored user profile from sidecar backup (had: ${currentHasData ? "partial" : "empty"}, now has: artistName=${!!merged.artistName}, bio=${!!merged.bio}, email=${!!merged.email}).`
    );
    return true;
  }
  return false;
}

// ==================== NO SEED DEMOS ====================

// ==================== STORE ====================

interface UserProfile {
  artistName: string;
  scLink: string;
  bio: string;
  email: string;
  photoUrl: string;
  links: { type: string; value: string }[];
  cyaniteApiToken: string; // BYOK: user's Cyanite API token (optional)
  supabaseUrl: string;     // BYOK: user's Supabase project URL (optional, for cloud sync)
  supabaseAnonKey: string; // BYOK: user's Supabase anon key (optional, for cloud sync)
}

interface GmailAuth {
  isConnected: boolean;
  email: string;
  accessToken: string;
  expiresAt: number;
}

interface AppState {
  labels: Label[];
  demos: Demo[];
  artists: Artist[]; // persisted in IndexedDB, loaded asynchronously on boot
  selectedArtistId: string | null; // for Artist Explorer detail view
  activeTab: "dashboard" | "labels" | "artists" | "rankings" | "demos" | "pitch" | "profile";
  locale: Locale;
  userProfile: UserProfile;
  gmailAuth: GmailAuth;
  rankingsUpdatedAt: string | null;
  lastSavedAt: string | null;
  hasRehydrated: boolean;
  hasCloudSynced: boolean;
  rankingSnapshots: RankingSnapshot[];

  // Label actions
  addLabel: (label: Partial<Omit<Label, "id" | "createdAt">> & { name: string }) => void;
  updateLabel: (id: string, updates: Partial<Label>) => void;
  deleteLabel: (id: string) => void;

  // Demo actions
  addDemo: (demo: Omit<Demo, "id" | "createdAt">) => void;
  updateDemo: (id: string, updates: Partial<Demo>) => void;
  deleteDemo: (id: string) => void;
  advanceDemoStatus: (id: string) => void;

  // Navigation
  setActiveTab: (tab: "dashboard" | "labels" | "artists" | "rankings" | "demos" | "pitch" | "profile") => void;

  // Artists (Phase 2 — Beatport scraper v2)
  setSelectedArtistId: (id: string | null) => void;
  setArtists: (artists: Artist[]) => void;

  // Language
  setLocale: (locale: Locale) => void;

  // User Profile
  setUserProfile: (profile: Partial<UserProfile>) => void;

  // Available genres
  getGenres: () => string[];

  // Gmail
  setGmailAuth: (auth: GmailAuth) => void;
  clearGmailAuth: () => void;

  // Rankings update tracking
  setRankingsUpdatedAt: (date: string) => void;

  // Ranking snapshots
  addRankingSnapshot: (source: string) => void;

  // Data backup
  exportData: () => string;
  importData: (jsonString: string) => boolean;
}

/**
 * Merge incoming artists (from a fresh scrape) with existing artists
 * (already in the store from previous scrapes).
 *
 * Strategy:
 * - Key by artist.id (e.g. "bp_6824"). Same Beatport id = same artist.
 * - For each artist that exists: union genres, union labelsPublishedOn,
 *   MERGE tracksByGenre by track.id (preserve tracks from older scrapes,
 *   update with new position info), sum totalPoints, min bestPosition.
 * - firstSeenAt preserved from existing; lastSeenAt = now.
 * - Trending recomputed fresh from current data.
 * - New artists: appended with firstSeenAt = lastSeenAt = now.
 *
 * This is what makes historical data accumulate: each scrape adds new
 * tracks to artists' tracksByGenre without losing previously-seen tracks.
 */
function mergeArtists(existing: Artist[], incoming: Artist[], now: string): Artist[] {
  const map = new Map<string, Artist>();

  // Seed with existing
  for (const a of existing) {
    map.set(a.id, { ...a });
  }

  for (const inc of incoming) {
    const ex = map.get(inc.id);
    if (!ex) {
      // New artist — first time we see them
      map.set(inc.id, {
        ...inc,
        firstSeenAt: now,
        lastSeenAt: now,
      });
      continue;
    }

    // Existing artist — merge fields
    // Union genres
    const genres = Array.from(new Set([...(ex.genres || []), ...(inc.genres || [])]));

    // Union labelsPublishedOn
    const labelsPublishedOn = Array.from(
      new Set([...(ex.labelsPublishedOn || []), ...(inc.labelsPublishedOn || [])])
    );

    // Merge tracksByGenre — preserve old tracks, add/update from incoming
    const tracksByGenre: Record<string, ArtistTrack[]> = { ...(ex.tracksByGenre || {}) };
    for (const genre of Object.keys(inc.tracksByGenre || {})) {
      const incTracks = inc.tracksByGenre[genre] || [];
      const exTracks = tracksByGenre[genre] || [];
      const byId = new Map<number, ArtistTrack>();
      // Seed with existing
      for (const t of exTracks) byId.set(t.id, t);
      // Update/add with incoming (incoming overrides — fresh positions)
      for (const t of incTracks) byId.set(t.id, t);
      tracksByGenre[genre] = Array.from(byId.values()).sort((a, b) => a.position - b.position);
    }

    // Recompute totalPoints & bestPosition from current incoming data
    // (the existing totals were from older scrapes — we want the snapshot
    // from THIS import to drive the points, otherwise the totals just
    // accumulate forever and "points" loses meaning).
    // BUT: keep max totalPoints seen (artists who peaked before should
    // keep credit). Actually no — let's use the LATEST totalPoints,
    // since that's the current ranking signal. Old tracks are still in
    // tracksByGenre for browsing, but the points reflect "right now".
    const totalPoints = inc.totalPoints;
    const bestPosition = Math.min(ex.bestPosition, inc.bestPosition);

    // Trending: use incoming (fresh computation)
    const trending = inc.trending;
    const trendingRankByGenre = inc.trendingRankByGenre;
    const trendingPointsByGenre = inc.trendingPointsByGenre;

    // isRemixerOnly: false if EITHER snapshot has them as primary
    const isRemixerOnly = ex.isRemixerOnly && inc.isRemixerOnly;

    map.set(inc.id, {
      ...ex,
      ...inc,
      genres,
      labelsPublishedOn,
      tracksByGenre,
      totalPoints,
      bestPosition,
      trending,
      trendingRankByGenre,
      trendingPointsByGenre,
      isRemixerOnly,
      firstSeenAt: ex.firstSeenAt || now,
      lastSeenAt: now,
    });
  }

  return Array.from(map.values());
}

/**
 * Merge helper: preserves ALL user-editable fields from existing label
 * when imported label has empty/default values for those fields.
 */
function mergePreservingUserData(existing: Label, imported: Label): Partial<Label> {
  // Before overwriting ranking data, save the current rank as "previous" snapshot.
  // This allows the Rankings page to show movement arrows (↑↓) between imports.
  const hasNewRankData = Object.keys(imported.rankByGenre || {}).length > 0;
  const currentRank = hasNewRankData && Object.keys(existing.rankByGenre || {}).length > 0
    ? { ...existing.rankByGenre }
    : existing.prevRankByGenre || {};

  return {
    // User-editable data — ALWAYS prefer existing if it has real data
    emails: imported.emails?.length ? imported.emails : existing.emails,
    contactInfo: imported.contactInfo?.trim() || existing.contactInfo,
    website: imported.website?.trim() || existing.website,
    demoLink: imported.demoLink?.trim() || existing.demoLink,
    socialLink: imported.socialLink?.trim() || existing.socialLink,
    soundcloudLink: imported.soundcloudLink?.trim() || existing.soundcloudLink,
    notes: imported.notes?.trim() || existing.notes,
    status: (imported.status === "open" || imported.status === "closed") ? imported.status : (existing.status || "open"),

    // Beatport/ranking data — prefer imported (it's the fresh data)
    genres: imported.genres?.length ? imported.genres : existing.genres,
    rankByGenre: Object.keys(imported.rankByGenre || {}).length ? imported.rankByGenre : existing.rankByGenre,
    pointsByGenre: Object.keys(imported.pointsByGenre || {}).length ? imported.pointsByGenre : existing.pointsByGenre,
    trending: imported.trending || existing.trending,
    trendingRankByGenre: Object.keys(imported.trendingRankByGenre || {}).length ? imported.trendingRankByGenre : existing.trendingRankByGenre,
    trendingPointsByGenre: Object.keys(imported.trendingPointsByGenre || {}).length ? imported.trendingPointsByGenre : existing.trendingPointsByGenre,

    // Ranking history — save current rank as "previous" when new data arrives
    prevRankByGenre: currentRank,
  };
}

/**
 * Label defaults for safe field initialization.
 */
const LABEL_DEFAULTS = {
  genres: [],
  rankByGenre: {},
  pointsByGenre: {},
  trending: false,
  trendingRankByGenre: {},
  trendingPointsByGenre: {},
  isCustom: false,
  website: "",
  demoLink: "",
  socialLink: "",
  soundcloudLink: "",
  beatportLink: "",
  customLinks: [],
  emails: [],
  notes: "",
  contactInfo: "",
  submissionType: "email" as SubmissionType,
  status: "open" as LabelStatus,
  genre: "",
  prevRankByGenre: {},
};

/**
 * Repair corrupted label data.
 * Detects and fixes: same email appearing on too many labels (likely corruption).
 */
function repairLabelData(labels: Label[]): Label[] {
  const emailLabelCount = new Map<string, number>();
  for (const l of labels) {
    if (l.emails && Array.isArray(l.emails)) {
      for (const e of l.emails) {
        if (e && e.trim()) {
          const key = e.toLowerCase().trim();
          emailLabelCount.set(key, (emailLabelCount.get(key) || 0) + 1);
        }
      }
    }
  }

  const corruptedEmails = new Set<string>();
  for (const [email, count] of emailLabelCount) {
    if (count > 5) {
      corruptedEmails.add(email);
      console.warn(
        `[LabelPulse Repair] Email "${email}" found on ${count} labels — likely corruption, will be removed from all but the owner.`
      );
    }
  }

  if (corruptedEmails.size === 0) {
    return labels;
  }

  const emailOwner = new Map<string, string>();
  for (const email of corruptedEmails) {
    for (const l of labels) {
      if (l.emails?.some(e => e.toLowerCase().trim() === email)) {
        const domain = email.split("@")[1]?.split(".")[0]?.toLowerCase();
        if (domain && l.name.toLowerCase().includes(domain)) {
          emailOwner.set(email, l.id);
          break;
        }
      }
    }
    if (!emailOwner.has(email)) {
      for (const l of labels) {
        if (l.emails?.some(e => e.toLowerCase().trim() === email)) {
          emailOwner.set(email, l.id);
          break;
        }
      }
    }
  }

  return labels.map(l => {
    if (!l.emails || !Array.isArray(l.emails)) return l;
    const cleanedEmails = l.emails.filter(e => {
      const key = e?.toLowerCase().trim();
      if (!key) return false;
      if (!corruptedEmails.has(key)) return true;
      return emailOwner.get(key) === l.id;
    });
    const cleanedContactInfo = cleanedEmails[0] || "";
    if (cleanedEmails.length !== l.emails.length || cleanedContactInfo !== l.contactInfo) {
      console.log(
        `[LabelPulse Repair] Cleaned label "${l.name}": removed ${l.emails.length - cleanedEmails.length} corrupted email(s)`
      );
      return { ...l, emails: cleanedEmails, contactInfo: cleanedContactInfo };
    }
    return l;
  });
}

export const useAppStore = create<AppState>()(
  persist(
    (set, get) => ({
      labels: buildLabelsFromData(),
      demos: [] as Demo[],
      artists: [] as Artist[], // populated from IndexedDB on boot (see loadArtistsFromIDB)
      selectedArtistId: null as string | null,
      activeTab: "dashboard" as const,
      locale: "it" as Locale,
      userProfile: { artistName: "", scLink: "", bio: "", email: "", photoUrl: "", links: [], cyaniteApiToken: "", supabaseUrl: "", supabaseAnonKey: "" } as UserProfile,
      gmailAuth: { isConnected: false, email: "", accessToken: "", expiresAt: 0 } as GmailAuth,
      rankingsUpdatedAt: null as string | null,
      lastSavedAt: null as string | null,
      hasRehydrated: false as boolean,
      hasCloudSynced: false as boolean,
      rankingSnapshots: [] as RankingSnapshot[],

      addLabel: (label) => {
        set((state) => ({
          labels: [
            ...state.labels,
            {
              ...label,
              id: genId(),
              createdAt: new Date().toISOString(),
              isCustom: true,
              genre: label.genre || "",
              contactInfo: label.contactInfo || "",
              status: label.status || "open",
              notes: label.notes || "",
              submissionType: label.submissionType || "email",
              genres: label.genres || (label.genre ? [label.genre] : []),
              rankByGenre: label.rankByGenre || {},
              pointsByGenre: label.pointsByGenre || {},
              trending: label.trending || false,
              trendingRankByGenre: label.trendingRankByGenre || {},
              trendingPointsByGenre: label.trendingPointsByGenre || {},
              website: label.website || "",
              demoLink: label.demoLink || "",
              socialLink: label.socialLink || "",
              soundcloudLink: label.soundcloudLink || "",
              emails: label.emails || [],
            },
          ],
          lastSavedAt: new Date().toISOString(),
        }));
        syncToCloud();
      },

      updateLabel: (id, updates) => {
        set((state) => ({
          labels: state.labels.map((l) =>
            l.id === id ? { ...l, ...updates } : l
          ),
          lastSavedAt: new Date().toISOString(),
        }));
        syncToCloud();
      },

      deleteLabel: (id) => {
        set((state) => ({
          labels: state.labels.filter((l) => l.id !== id),
          lastSavedAt: new Date().toISOString(),
        }));
        syncToCloud();
      },

      addDemo: (demo) => {
        set((state) => ({
          demos: [
            ...state.demos,
            { ...demo, id: genId(), createdAt: new Date().toISOString() },
          ],
          lastSavedAt: new Date().toISOString(),
        }));
        syncToCloud();
      },

      updateDemo: (id, updates) => {
        set((state) => ({
          demos: state.demos.map((d) =>
            d.id === id ? { ...d, ...updates } : d
          ),
          lastSavedAt: new Date().toISOString(),
        }));
        syncToCloud();
      },

      deleteDemo: (id) => {
        set((state) => ({
          demos: state.demos.filter((d) => d.id !== id),
          lastSavedAt: new Date().toISOString(),
        }));
        syncToCloud();
      },

      advanceDemoStatus: (id) => {
        const flow: DemoStatus[] = [
          "ready",
          "sent",
          "reviewing",
          "accepted",
        ];
        const demo = get().demos.find((d) => d.id === id);
        if (!demo) return;
        const idx = flow.indexOf(demo.status);
        if (idx < flow.length - 1) {
          const nextStatus = flow[idx + 1];
          const updates: Partial<Demo> = { status: nextStatus };
          if (nextStatus === "sent" && !demo.sentDate) {
            updates.sentDate = new Date().toISOString().split("T")[0];
          }
          set((state) => ({
            demos: state.demos.map((d) =>
              d.id === id ? { ...d, ...updates } : d
            ),
            lastSavedAt: new Date().toISOString(),
          }));
          syncToCloud();
        }
      },

      setActiveTab: (tab) => set({ activeTab: tab }),

      setSelectedArtistId: (id) => set({ selectedArtistId: id }),

      setArtists: (artists) => {
        set({ artists });
        // Persist to IndexedDB (fire-and-forget; non-blocking)
        if (typeof window !== "undefined") {
          saveArtistsToIDB(artists).catch((e) =>
            console.warn("[LabelPulse] Failed to persist artists to IndexedDB:", e)
          );
        }
      },
      setLocale: (locale) => { set({ locale }); syncToCloud(); },
      setUserProfile: (profile) => {
        set((state) => ({ userProfile: { ...state.userProfile, ...profile }, lastSavedAt: new Date().toISOString() }));
        syncToCloud();
        // ⚠️ CRITICAL: also trigger an IMMEDIATE (non-debounced) cloud sync.
        // syncToCloud is debounced 3 seconds — if the user saves and closes
        // the window within 3s, the cloud sync never fires and the profile
        // is lost. forceCloudSync uploads right now so the cloud always has
        // the latest profile, even if the user closes immediately after.
        // Use a tiny timeout (0ms) to let the state settle before reading.
        setTimeout(() => {
          try {
            forceCloudSync();
          } catch (e) {
            console.warn("[LabelPulse] Immediate profile sync failed:", e);
          }
        }, 0);
      },

      getGenres: () => labelData.genres,

      setGmailAuth: (auth) => { set({ gmailAuth: auth }); syncToCloud(); },
      clearGmailAuth: () => { set({ gmailAuth: { isConnected: false, email: "", accessToken: "", expiresAt: 0 } }); syncToCloud(); },

      setRankingsUpdatedAt: (date) => { set({ rankingsUpdatedAt: date }); syncToCloud(); },

      addRankingSnapshot: (source) => {
        const state = get();
        const snapshotId = genId();
        const timestamp = new Date().toISOString();

        // Build snapshot: genre -> labelName -> {rank, points}
        const genres: RankingSnapshot["genres"] = {};
        for (const label of state.labels) {
          if (!label.rankByGenre || Object.keys(label.rankByGenre).length === 0) continue;
          for (const genre of Object.keys(label.rankByGenre)) {
            if (!genres[genre]) genres[genre] = {};
            genres[genre][label.name] = {
              rank: label.rankByGenre[genre],
              points: label.pointsByGenre?.[genre] ?? 0,
            };
          }
        }

        const snapshot: RankingSnapshot = {
          id: snapshotId,
          timestamp,
          source,
          genres,
        };

        set((state) => ({
          rankingSnapshots: [...state.rankingSnapshots, snapshot],
          lastSavedAt: new Date().toISOString(),
        }));
        syncToCloud();
      },

      exportData: () => {
        const state = get();
        // CRITICAL: include rankingSnapshots in the backup. Without this, the
        // user's "storico caricamenti" (months of Beatport/Beatstats imports)
        // is lost when they restore from backup — Classifiche page resets to
        // "first time" and historical chart movement is gone forever.
        // Also include the sidecar snapshots so a backup taken after a partial
        // loss still captures whatever survived in the sidecar.
        const sidecarSnaps =
          typeof window !== "undefined"
            ? extractSnapshotsFromRaw(safeLocalStorageGet(SNAPSHOTS_BACKUP_KEY))
            : [];
        const rankingSnapshots = mergeSnapshots(state.rankingSnapshots, sidecarSnaps);
        const exportObj = {
          version: 2,
          app: "labelpulse",
          exportedAt: new Date().toISOString(),
          data: {
            labels: state.labels,
            demos: state.demos,
            userProfile: state.userProfile,
            locale: state.locale,
            rankingSnapshots,
            rankingsUpdatedAt: state.rankingsUpdatedAt,
            lastSavedAt: state.lastSavedAt,
          }
        };
        return JSON.stringify(exportObj, null, 2);
      },

      importData: (jsonString: string) => {
        try {
          const parsed = JSON.parse(jsonString);
          if (parsed.app !== "labelpulse" || !parsed.data) return false;
          
          const { labels: importedLabels = [], demos: importedDemos = [], userProfile, locale: importedLocale } = parsed.data;
          // Read snapshots from the backup file (new field, may be absent in old backups).
          const importedSnapshots: RankingSnapshot[] = Array.isArray(parsed.data?.rankingSnapshots)
            ? parsed.data.rankingSnapshots
            : [];
          const currentLabels = get().labels;
          const currentDemos = get().demos;
          const currentSnapshots = get().rankingSnapshots || [];

          // === LABEL MERGE ===
          const currentLabelById = new Map(currentLabels.map(l => [l.id, l]));
          const currentLabelByName = new Map(currentLabels.map(l => [l.name.toLowerCase().trim(), l]));

          const newLabels: Label[] = [];

          for (const imported of importedLabels as Label[]) {
            if (currentLabelById.has(imported.id)) {
              const existing = currentLabelById.get(imported.id)!;
              const merged = {
                ...existing,
                ...mergePreservingUserData(existing, imported),
              };
              currentLabelById.set(imported.id, merged);
              continue;
            }

            const nameKey = imported.name.toLowerCase().trim();
            if (currentLabelByName.has(nameKey)) {
              const existing = currentLabelByName.get(nameKey)!;
              const mergedLabel: Label = {
                ...existing,
                ...mergePreservingUserData(existing, imported),
              };
              currentLabelById.set(existing.id, mergedLabel);
              currentLabelByName.set(nameKey, mergedLabel);
              continue;
            }

            newLabels.push({
              ...imported,
              id: imported.id || genId(),
              createdAt: imported.createdAt || new Date().toISOString(),
              isCustom: imported.isCustom ?? true,
              genres: imported.genres || [],
              rankByGenre: imported.rankByGenre || {},
              pointsByGenre: imported.pointsByGenre || {},
              trending: imported.trending || false,
              trendingRankByGenre: imported.trendingRankByGenre || {},
              trendingPointsByGenre: imported.trendingPointsByGenre || {},
              emails: imported.emails || [],
              website: imported.website || "",
              demoLink: imported.demoLink || "",
              socialLink: imported.socialLink || "",
              soundcloudLink: imported.soundcloudLink || "",
              contactInfo: imported.contactInfo || "",
              notes: imported.notes || "",
              status: imported.status || "open",
              submissionType: imported.submissionType || "email",
            });
          }

          const mergedLabels = [...currentLabelById.values(), ...newLabels];

          // === DEMO MERGE ===
          const currentDemoById = new Map(currentDemos.map(d => [d.id, d]));
          const currentDemoByKey = new Map(
            currentDemos.map(d => [`${d.trackName.toLowerCase().trim()}||${d.labelId}`, d])
          );

          const newDemos: Demo[] = [];

          for (const imported of importedDemos as Demo[]) {
            if (currentDemoById.has(imported.id)) {
              const existing = currentDemoById.get(imported.id)!;
              currentDemoById.set(imported.id, {
                ...existing,
                ...imported,
                id: existing.id,
              });
              continue;
            }

            const key = `${imported.trackName?.toLowerCase().trim()}||${imported.labelId}`;
            if (currentDemoByKey.has(key)) {
              const existing = currentDemoByKey.get(key)!;
              const merged: Demo = {
                ...existing,
                ...imported,
                id: existing.id,
              };
              currentDemoById.set(existing.id, merged);
              currentDemoByKey.set(key, merged);
              continue;
            }

            newDemos.push({
              ...imported,
              id: imported.id || genId(),
              createdAt: imported.createdAt || new Date().toISOString(),
            });
          }

          const mergedDemos = [...currentDemoById.values(), ...newDemos];

          const isRankingsImport = parsed._meta?.source === 'beatport' || parsed._meta?.source === 'beatstats';
          const hasGenresAndLabels = parsed.genres && parsed.labels && Array.isArray(parsed.labels);

          // === BUILD SNAPSHOT OF THIS IMPORT ===
          // Create ONE snapshot representing the state AFTER this import (the
          // merged labels). For Beatstats historical imports, use _meta.scrapedPeriod
          // as the timestamp so the snapshot is correctly dated in the past
          // (e.g., 2024-12-31T23:59:59Z for "December 2024"). This lets the user
          // build up months/years of historical rankings in minutes and have them
          // sort chronologically in the Classifiche page period filters.
          //
          // CRITICAL FIX: the previous implementation created the snapshot via a
          // separate `set()` call BEFORE the final `set()`, but the final `set()`
          // overwrote rankingSnapshots with `mergedSnapshots` (which did NOT
          // include the pre-merge snapshot). Result: every import's snapshot was
          // silently discarded. The user's "storico caricamenti" never accumulated
          // — explaining the original data-loss report.
          let snapshotOfThisImport: RankingSnapshot | null = null;
          if (isRankingsImport || hasGenresAndLabels) {
            const source = parsed._meta?.source || 'import';
            // For beatstats historical imports, use the scraped period as the
            // snapshot timestamp. For everything else (beatport current, generic
            // imports), use "now".
            const snapshotTimestamp =
              source === 'beatstats' && parsed._meta?.scrapedPeriod
                ? parsed._meta.scrapedPeriod
                : new Date().toISOString();

            const snapshotGenres: RankingSnapshot["genres"] = {};
            // Build from the MERGED labels — this captures the state AS OF this
            // import (the new rankings are the data we just imported).
            // Cast to Label[] because earlier merge logic uses untyped maps (TS
            // infers `unknown[]`); at runtime the array contains valid Label objects.
            const mergedLabelsForSnapshot = mergedLabels as Label[];
            for (const label of mergedLabelsForSnapshot) {
              if (!label.rankByGenre || Object.keys(label.rankByGenre).length === 0) continue;
              for (const genre of Object.keys(label.rankByGenre)) {
                if (!snapshotGenres[genre]) snapshotGenres[genre] = {};
                snapshotGenres[genre][label.name] = {
                  rank: label.rankByGenre[genre],
                  points: label.pointsByGenre?.[genre] ?? 0,
                };
              }
            }
            snapshotOfThisImport = {
              id: genId(),
              timestamp: snapshotTimestamp,
              source,
              genres: snapshotGenres,
            };
          }

          // === SNAPSHOT MERGE ===
          // Never let an import wipe existing snapshots. Merge by id+timestamp+source.
          // Sources merged:
          //   1. currentSnapshots  — already in the live store
          //   2. snapshotOfThisImport — the snapshot we just built for THIS import
          //   3. importedSnapshots — from the backup file (if user is restoring a backup)
          //   4. sidecarSnaps     — from the emergency backup slot (labelpulse-snapshots-backup)
          // mergeSnapshots dedupes by id first, then by `timestamp|source`. This
          // means re-importing the same Beatstats period (e.g., "Dec 2024" twice)
          // is idempotent — the second import does not create a duplicate.
          const sidecarSnaps =
            typeof window !== "undefined"
              ? extractSnapshotsFromRaw(safeLocalStorageGet(SNAPSHOTS_BACKUP_KEY))
              : [];
          const thisSnapshotArr = snapshotOfThisImport ? [snapshotOfThisImport] : [];
          // Order matters for dedup: we want currentSnapshots + thisSnapshot first
          // (so the just-imported snapshot wins over a duplicate from the backup
          // file or sidecar — the user's fresh data should be the source of truth).
          const mergedSnapshots = mergeSnapshots(
            mergeSnapshots(currentSnapshots, thisSnapshotArr),
            mergeSnapshots(importedSnapshots, sidecarSnaps)
          );
          if (snapshotOfThisImport) {
            console.info(
              `[LabelPulse Import] Created snapshot: source=${snapshotOfThisImport.source}, timestamp=${snapshotOfThisImport.timestamp}, genres=${Object.keys(snapshotOfThisImport.genres).length}. Total snapshots: ${currentSnapshots.length} → ${mergedSnapshots.length}.`
            );
          }

          // === ARTIST MERGE (scraper v2) ===
          // If the imported JSON contains artists[] (from scraper v2), merge them
          // with existing artists in the store. Dedup by id (e.g. "bp_6824").
          // Tracks within each artist's tracksByGenre are also merged by track.id
          // so historical data accumulates across multiple scrapes.
          // See mergeArtists() for full strategy.
          let mergedArtists: Artist[] | undefined;
          const importedArtists: Artist[] = Array.isArray(parsed.artists) ? parsed.artists : [];
          if (importedArtists.length > 0) {
            const now = new Date().toISOString();
            const currentArtists = get().artists || [];
            mergedArtists = mergeArtists(currentArtists, importedArtists, now);
            console.info(
              `[LabelPulse Import] Artists: ${currentArtists.length} existing + ${importedArtists.length} incoming → ${mergedArtists.length} merged.`
            );
          }

          set({
            labels: mergedLabels,
            demos: mergedDemos,
            ...(mergedArtists ? { artists: mergedArtists } : {}),
            userProfile: userProfile || get().userProfile,
            locale: importedLocale || get().locale,
            rankingSnapshots: mergedSnapshots,
            // For beatstats historical imports, use scrapedPeriod as rankingsUpdatedAt
            // so the UI shows the actual period of the data (e.g., "dicembre 2024").
            // For everything else, use "now".
            rankingsUpdatedAt:
              parsed._meta?.source === 'beatstats' && parsed._meta?.scrapedPeriod
                ? parsed._meta.scrapedPeriod
                : (parsed.data?.rankingsUpdatedAt ||
                  (isRankingsImport || hasGenresAndLabels
                    ? new Date().toISOString()
                    : get().rankingsUpdatedAt)),
            lastSavedAt: new Date().toISOString(),
          });
          syncToCloud();

          // Persist artists to IndexedDB (non-blocking, fire-and-forget)
          if (mergedArtists && typeof window !== "undefined") {
            saveArtistsToIDB(mergedArtists).catch((e) =>
              console.warn("[LabelPulse Import] Failed to persist artists to IndexedDB:", e)
            );
          }

          return true;
        } catch {
          return false;
        }
      },
    }),
    {
      name: PRIMARY_KEY,
      version: 11,
      storage: createJSONStorage(() => robustStorage),
      migrate: (persisted: any, version: number) => {
        if (version < 5) {
          if (persisted.demos) {
            const seedIds = ["demo_1", "demo_2", "demo_3", "demo_4", "demo_5", "demo_6"];
            persisted.demos = persisted.demos.filter(
              (d: any) => !seedIds.includes(d.id)
            );
          }
          if (persisted.labels) {
            persisted.labels = persisted.labels.map((l: any) => ({
              ...l,
              genres: l.genres || (l.genre ? [l.genre] : []),
              rankByGenre: l.rankByGenre || {},
              pointsByGenre: l.pointsByGenre || {},
              trending: l.trending || false,
              trendingRankByGenre: l.trendingRankByGenre || {},
              trendingPointsByGenre: l.trendingPointsByGenre || {},
              isCustom: l.isCustom ?? false,
              website: l.website || "",
              demoLink: l.demoLink || "",
              socialLink: l.socialLink || "",
              soundcloudLink: l.soundcloudLink || "",
              emails: Array.isArray(l.emails) ? l.emails : (l.contactInfo ? [l.contactInfo] : []),
            }));
          }
          if (persisted.demos) {
            persisted.demos = persisted.demos.map((d: any) => ({
              ...d,
              sentDate: d.sentDate ?? null,
              link: d.link || "",
              notes: d.notes || "",
              pitchText: d.pitchText || "",
              artistName: d.artistName || "",
            }));
          }
          if (!persisted.locale) {
            persisted.locale = "it";
          }
          if (!persisted.userProfile) {
            persisted.userProfile = { artistName: "", scLink: "", cyaniteApiToken: "", supabaseUrl: "", supabaseAnonKey: "" };
          }
          if (!persisted.userProfile.cyaniteApiToken) {
            persisted.userProfile.cyaniteApiToken = "";
          }
          if (!persisted.userProfile.supabaseUrl) {
            persisted.userProfile.supabaseUrl = "";
          }
          if (!persisted.userProfile.supabaseAnonKey) {
            persisted.userProfile.supabaseAnonKey = "";
          }
        }
        if (version < 6) {
          if (!persisted.gmailAuth) {
            persisted.gmailAuth = { isConnected: false, email: "", accessToken: "", expiresAt: 0 };
          }
        }
        if (version < 7) {
          if (!persisted.rankingsUpdatedAt) {
            persisted.rankingsUpdatedAt = null;
          }
        }
        if (version < 8) {
          if (!persisted.lastSavedAt) {
            persisted.lastSavedAt = null;
          }
          if (persisted.labels) {
            persisted.labels = persisted.labels.map((l: any) => {
              if (l.notes === "open" || l.notes === "closed") {
                l.notes = "";
              }
              return l;
            });
          }
        }
        if (version < 10) {
          if (!persisted.rankingSnapshots) {
            persisted.rankingSnapshots = [];
          }
          if (persisted.labels) {
            persisted.labels = persisted.labels.map((l: any) => ({
              ...l,
              prevRankByGenre: l.prevRankByGenre || {},
            }));
          }
        }
        if (version < 11) {
          // Ensure userProfile has the new BYOK cloud sync fields
          if (persisted.userProfile) {
            if (!persisted.userProfile.supabaseUrl) {
              persisted.userProfile.supabaseUrl = "";
            }
            if (!persisted.userProfile.supabaseAnonKey) {
              persisted.userProfile.supabaseAnonKey = "";
            }
          }
        }
        return persisted;
      },
      partialize: (state) => ({
        labels: state.labels,
        demos: state.demos,
        activeTab: state.activeTab,
        locale: state.locale,
        userProfile: state.userProfile,
        gmailAuth: state.gmailAuth,
        rankingsUpdatedAt: state.rankingsUpdatedAt,
        lastSavedAt: state.lastSavedAt,
        rankingSnapshots: state.rankingSnapshots,
      }),
      merge: (persistedState: any, currentState: any) => {
        // SIMPLE & SAFE merge: preserve persisted data, add defaults, append new seed labels
        // CRITICAL: We must NEVER modify persisted user data during merge.

        if (!persistedState) {
          return currentState;
        }

        const merged = { ...currentState, ...persistedState };

        if (persistedState.labels && Array.isArray(persistedState.labels) && persistedState.labels.length > 0) {
          // Step 1: Add safe defaults to ALL persisted labels (never overwrite existing values)
          merged.labels = persistedState.labels.map((l: any) => ({
            ...LABEL_DEFAULTS,
            ...l,
          }));

          // Step 2: Append NEW seed labels that don't exist in persisted data
          const persistedIds = new Set(persistedState.labels.map((l: any) => l.id));
          const persistedNames = new Set(
            persistedState.labels
              .map((l: any) => l.name?.toLowerCase().trim())
              .filter(Boolean)
          );
          const seedLabels = buildLabelsFromData();
          for (const seed of seedLabels) {
            if (!persistedIds.has(seed.id) && !persistedNames.has(seed.name.toLowerCase().trim())) {
              merged.labels.push(seed);
            }
          }

          // Step 3: Repair corrupted data (e.g., same email on too many labels)
          merged.labels = repairLabelData(merged.labels);
        }

        return merged;
      },
      onRehydrateStorage: () => (state, error) => {
        // ALWAYS mark rehydrated — even on error — to avoid permanently blocking writes
        _rehydrated = true;

        if (error) {
          console.error("[LabelPulse Storage] Rehydration error:", error);
        } else if (state) {
          const userEditedCount = countUserEditedLabels(state.labels);
          console.log(
            `[LabelPulse Storage] Rehydrated: ${state.labels.length} labels, ${userEditedCount} with user data`
          );
        }

        // Signal to UI that rehydration is complete.
        // IMPORTANT: onRehydrateStorage can be called synchronously INSIDE create(),
        // before useAppStore is assigned. We use setTimeout to defer setState to the
        // next macrotask, by which time useAppStore will be fully initialized.
        if (typeof window !== "undefined") {
          setTimeout(() => {
            useAppStore.setState({ hasRehydrated: true });
          }, 0);
        }

        // Force an immediate backup after rehydration
        forceBackupNow();
      },
    }
  )
);

// Helper: get tier for a label in a given genre
export function getLabelTier(
  label: Label,
  genre?: string
): "top" | "mid" | "emerging" | null {
  if (!genre) genre = label.genres?.[0];
  if (!genre) return null;
  const rank = label.rankByGenre?.[genre];
  if (!rank) return label.trending ? "emerging" : null;
  if (rank <= 20) return "top";
  if (rank <= 50) return "mid";
  return label.trending ? "emerging" : null;
}

// ==================== CLOUD SYNC ====================
// Sistema di sincronizzazione con Supabase.
// - Ogni modifica ai dati viene salvata su Supabase (debounced)
// - All'avvio, i dati vengono caricati dal cloud se più recenti
// - Se Supabase non è configurato, funziona solo con localStorage

let _cloudSyncTimer: ReturnType<typeof setTimeout> | null = null;
const CLOUD_SYNC_DEBOUNCE_MS = 3000; // 3 secondi di debounce

/**
 * Sincronizza lo stato corrente con Supabase (debounced).
 * Chiamata dopo ogni azione utente che modifica i dati.
 */
export function syncToCloud(): void {
  if (!isSupabaseConfigured()) return;
  // Skip if we're applying a remote update (avoids feedback loop)
  if (isApplyingRemoteUpdate()) return;

  if (_cloudSyncTimer) {
    clearTimeout(_cloudSyncTimer);
  }

  _cloudSyncTimer = setTimeout(async () => {
    _cloudSyncTimer = null;
    if (isApplyingRemoteUpdate()) return;
    const state = useAppStore.getState();
    // Update lastSavedAt to track which device last wrote
    const lastSavedAt = new Date().toISOString();
    useAppStore.setState({ lastSavedAt });
    const dataToSync = {
      labels: state.labels,
      demos: state.demos,
      activeTab: state.activeTab,
      locale: state.locale,
      userProfile: state.userProfile,
      gmailAuth: state.gmailAuth,
      rankingsUpdatedAt: state.rankingsUpdatedAt,
      lastSavedAt,
      rankingSnapshots: state.rankingSnapshots,
    };
    await saveStateToCloud(dataToSync);
  }, CLOUD_SYNC_DEBOUNCE_MS);
}

/**
 * Forza la sincronizzazione immediata con Supabase (senza debounce).
 * Usata quando la pagina sta per essere chiusa o nascosta.
 */
export async function forceCloudSync(): Promise<void> {
  if (!isSupabaseConfigured()) return;
  if (isApplyingRemoteUpdate()) return;

  if (_cloudSyncTimer) {
    clearTimeout(_cloudSyncTimer);
    _cloudSyncTimer = null;
  }

  const state = useAppStore.getState();
  const lastSavedAt = new Date().toISOString();
  useAppStore.setState({ lastSavedAt });
  const dataToSync = {
    labels: state.labels,
    demos: state.demos,
    activeTab: state.activeTab,
    locale: state.locale,
    userProfile: state.userProfile,
    gmailAuth: state.gmailAuth,
    rankingsUpdatedAt: state.rankingsUpdatedAt,
    lastSavedAt,
    rankingSnapshots: state.rankingSnapshots,
  };
  await saveStateToCloud(dataToSync);
}

/**
 * Carica i dati dal cloud e aggiorna lo store se i dati cloud sono più recenti.
 * Chiamata una volta all'avvio dell'app, dopo la reidratazione da localStorage.
 */
export async function loadFromCloud(): Promise<void> {
  if (!isSupabaseConfigured()) {
    console.log("[LabelPulse Cloud] Supabase not configured, skipping cloud load");
    useAppStore.setState({ hasCloudSynced: true });
    return;
  }

  try {
    const cloudData = await loadStateFromCloud();
    if (!cloudData) {
      // Nessun dato nel cloud.
      // ⚠️ CRITICAL: only upload local data if it actually has real user data.
      // If the local state is just seed data (empty profile, default labels),
      // uploading it would create a cloud row with empty data — and future
      // logins would pull that empty data, making the user think their data
      // was lost. Only upload if the user has actually entered something
      // (artistName, bio, links, custom labels, demos, etc.).
      const localState = useAppStore.getState();
      const localHasRealData =
        !!localState.userProfile?.artistName ||
        !!localState.userProfile?.bio ||
        (Array.isArray(localState.userProfile?.links) && localState.userProfile.links.length > 0) ||
        !!localState.userProfile?.cyaniteApiToken ||
        !!localState.userProfile?.supabaseUrl ||
        localState.demos.length > 0 ||
        localState.rankingSnapshots.length > 0;

      if (localHasRealData) {
        console.log("[LabelPulse Cloud] No cloud data, uploading local data as initial sync");
        await forceCloudSync();
      } else {
        console.log("[LabelPulse Cloud] No cloud data and local is seed — skipping upload to avoid creating empty cloud row.");
      }
      useAppStore.setState({ hasCloudSynced: true });
      // Setup realtime subscription for future updates
      setupRealtimeSubscriptionSafe();
      return;
    }

    const cloud = cloudData as any;
    const localState = useAppStore.getState();

    // Confronta i timestamp per decidere quali dati usare
    const localSavedAt = localState.lastSavedAt ? new Date(localState.lastSavedAt).getTime() : 0;
    const cloudSavedAt = cloud.lastSavedAt ? new Date(cloud.lastSavedAt).getTime() : 0;

    // ⚠️ CRITICAL: Content-aware merge decision.
    // The old code only used timestamps: `if (cloudSavedAt > localSavedAt) merge else skip`.
    // This was BRITTLE because:
    //   1. If both timestamps are 0 (e.g., null on both sides), `0 > 0` is false → SKIP merge
    //      → cloud data is ignored even when local is empty seed.
    //   2. If local was the last writer (e.g., same device that just saved), local timestamp
    //      equals cloud timestamp → SKIP merge → if local was wiped (e.g., fresh incognito
    //      after a force-sync), cloud data is also ignored.
    //   3. After the skip, useAuthEffect's forceCloudSync() would push the EMPTY local state
    //      back to cloud, OVERWRITING the cloud's good data.
    //
    // FIX: Always merge if cloud has profile data that local doesn't have, regardless of
    // timestamps. Timestamps are only used as a tiebreaker when both have data.
    const cloudProfileHasData =
      !!cloud.userProfile?.artistName ||
      !!cloud.userProfile?.bio ||
      !!cloud.userProfile?.email ||
      !!cloud.userProfile?.scLink ||
      !!cloud.userProfile?.photoUrl ||
      (Array.isArray(cloud.userProfile?.links) && cloud.userProfile.links.length > 0);
    const localProfileHasData =
      !!localState.userProfile?.artistName ||
      !!localState.userProfile?.bio ||
      !!localState.userProfile?.email ||
      !!localState.userProfile?.scLink ||
      !!localState.userProfile?.photoUrl ||
      (Array.isArray(localState.userProfile?.links) && localState.userProfile.links.length > 0);

    const cloudHasLabels = Array.isArray(cloud.labels) && cloud.labels.length > 0;
    const cloudHasSnapshots = Array.isArray(cloud.rankingSnapshots) && cloud.rankingSnapshots.length > 0;
    const cloudHasDemos = Array.isArray(cloud.demos) && cloud.demos.length > 0;
    const localHasLabels = (localState.labels?.length ?? 0) > 0;
    const localHasSnapshots = (localState.rankingSnapshots?.length ?? 0) > 0;
    const localHasDemos = (localState.demos?.length ?? 0) > 0;

    // Force merge if cloud has profile data local doesn't have
    const cloudBringsNewProfile = cloudProfileHasData && !localProfileHasData;
    // Force merge if cloud has labels/snapshots/demos that local doesn't have
    const cloudBringsNewLabels = cloudHasLabels && !localHasLabels;
    const cloudBringsNewSnapshots = cloudHasSnapshots && !localHasSnapshots;
    const cloudBringsNewDemos = cloudHasDemos && !localHasDemos;

    const cloudIsNewerByTimestamp = cloudSavedAt > localSavedAt;
    const shouldMergeFromCloud =
      cloudBringsNewProfile ||
      cloudBringsNewLabels ||
      cloudBringsNewSnapshots ||
      cloudBringsNewDemos ||
      cloudIsNewerByTimestamp;

    if (shouldMergeFromCloud) {
      // I dati cloud sono più recenti O hanno contenuti che il locale non ha — mergia
      console.log(
        `[LabelPulse Cloud] Merging from cloud. Reasons: ` +
        `cloudBringsNewProfile=${cloudBringsNewProfile}, ` +
        `cloudBringsNewLabels=${cloudBringsNewLabels}, ` +
        `cloudBringsNewSnapshots=${cloudBringsNewSnapshots}, ` +
        `cloudBringsNewDemos=${cloudBringsNewDemos}, ` +
        `cloudIsNewerByTimestamp=${cloudIsNewerByTimestamp} ` +
        `(cloud: ${cloud.lastSavedAt}, local: ${localState.lastSavedAt}).`
      );

      // SAFETY CHECK: se il cloud è "più recente" ma ha array vuoti dove
      // il locale ha dati, NON fidarti — è probabile che il cloud sia stato
      // resettato / corrotto. Mantieni i dati locali e basta.
      if (
        (localHasLabels && !cloudHasLabels) ||
        (localHasSnapshots && !cloudHasSnapshots) ||
        (localHasDemos && !cloudHasDemos)
      ) {
        console.warn(
          "[LabelPulse Cloud] CLOUD DATA LOSS DETECTED — cloud is newer but has empty arrays where local has data. Skipping merge to preserve local data. Run a manual sync to upload local to cloud."
        );
        useAppStore.setState({ hasCloudSynced: true });
        // Trigger upload of local data so cloud gets repopulated
        setTimeout(() => forceCloudSync(), 500);
        setupRealtimeSubscriptionSafe();
        return;
      }

      // Usa la stessa logica di merge della reidratazione
      const merged = mergeCloudData(cloud, localState);
      console.log(
        `[LabelPulse Cloud] MERGE RESULT — profile from cloud: artistName=${cloud.userProfile?.artistName || "(empty)"}, bio=${cloud.userProfile?.bio ? "yes" : "no"}, links=${cloud.userProfile?.links?.length || 0}; ` +
        `local profile: artistName=${localState.userProfile?.artistName || "(empty)"}; ` +
        `merged profile: artistName=${(merged as any).userProfile?.artistName || "(empty)"}, bio=${(merged as any).userProfile?.bio ? "yes" : "no"}, links=${(merged as any).userProfile?.links?.length || 0}.`
      );
      useAppStore.setState({
        ...merged,
        hasCloudSynced: true,
      });
    } else {
      // I dati locali sono più recenti o uguali — mantieni i dati locali, aggiorna il cloud
      console.log("[LabelPulse Cloud] Local data is up to date. Cloud sync complete.");
      useAppStore.setState({ hasCloudSynced: true });
    }

    // Setup realtime subscription to receive future updates from other devices
    setupRealtimeSubscriptionSafe();
  } catch (err) {
    console.error("[LabelPulse Cloud] Load from cloud failed:", err);
    useAppStore.setState({ hasCloudSynced: true });
  }
}

/**
 * Setup the realtime subscription safely (only on client, only if configured).
 * Re-imported lazily to avoid circular deps at module load.
 */
function setupRealtimeSubscriptionSafe(): void {
  if (typeof window === "undefined") return;
  if (!isSupabaseConfigured()) return;
  // Defer to next tick so we don't block the initial render
  setTimeout(() => {
    try {
      // Re-import to avoid circular dependency
      import("./supabase").then(({ setupRealtimeSubscription }) => {
        setupRealtimeSubscription();
      });
    } catch (err) {
      console.warn("[LabelPulse Cloud] Realtime subscription setup failed:", err);
    }
  }, 100);
}

/**
 * Merge dei dati cloud con quelli locali, preservando i dati utente.
 * Usa la stessa logica della funzione merge di Zustand persist.
 *
 * CRITICAL SAFETY RULE: mai sovrascrivere array locali non-vuoti con
 * array cloud vuoti. Se il cloud ha perso dati (es. tabella corrotta,
 * sync parziale, progetto Supabase resettato), non vogliamo propagare
 * la perdita ai dispositivi che hanno ancora i dati.
 */
function mergeCloudData(cloudData: any, localState: any): Partial<AppState> {
  const merged: Partial<AppState> = {};

  // Labels: applica defaults e merge con seed data, come nella reidratazione
  if (cloudData.labels && Array.isArray(cloudData.labels) && cloudData.labels.length > 0) {
    merged.labels = cloudData.labels.map((l: any) => ({
      ...LABEL_DEFAULTS,
      ...l,
    }));

    // Aggiungi seed labels mancanti
    const cloudIds = new Set(cloudData.labels.map((l: any) => l.id));
    const cloudNames = new Set(
      cloudData.labels.map((l: any) => l.name?.toLowerCase().trim()).filter(Boolean)
    );
    const seedLabels = buildLabelsFromData();
    for (const seed of seedLabels) {
      if (!cloudIds.has(seed.id) && !cloudNames.has(seed.name.toLowerCase().trim())) {
        (merged.labels as Label[]).push(seed);
      }
    }

    // Repair corrupted data
    merged.labels = repairLabelData(merged.labels);
  } else {
    // Cloud non ha labels (o array vuoto) → mantieni locali
    merged.labels = localState.labels;
  }

  // Demos: SOLO se cloud ha effettivamente demos, mantieni locali altrimenti
  // (before: `Array.isArray(cloudData.demos) ? cloudData.demos : localState.demos`
  //  sovrascriveva demos locali con [] se cloud aveva demos:[])
  if (Array.isArray(cloudData.demos) && cloudData.demos.length > 0) {
    merged.demos = cloudData.demos;
  } else if (Array.isArray(cloudData.demos) && (!localState.demos || localState.demos.length === 0)) {
    // Cloud ha demos:[] e locale è vuoto → ok a usare [] (no-op)
    merged.demos = cloudData.demos;
  } else {
    merged.demos = localState.demos;
  }

  // Simple fields
  merged.activeTab = cloudData.activeTab || localState.activeTab;
  merged.locale = cloudData.locale || localState.locale;
  // ⚠️ CRITICAL: use mergeProfiles (non-empty fields win) instead of `||`.
  // If cloud has an empty {} profile (e.g., from a fresh seed upload),
  // `cloudData.userProfile || localState.userProfile` returns the empty cloud
  // profile (because {} is truthy), wiping the local profile. mergeProfiles
  // correctly keeps non-empty fields from BOTH sources.
  merged.userProfile =
    mergeProfiles(localState.userProfile, cloudData.userProfile) ||
    cloudData.userProfile ||
    localState.userProfile;
  merged.gmailAuth = cloudData.gmailAuth || localState.gmailAuth;
  merged.rankingsUpdatedAt = cloudData.rankingsUpdatedAt ?? localState.rankingsUpdatedAt;
  merged.lastSavedAt = cloudData.lastSavedAt ?? localState.lastSavedAt;

  // rankingSnapshots: STesso principio — non sovrascrivere snapshots locali
  // con array vuoto dal cloud. Gli snapshots sono il cuore delle classifiche
  // storiche, perderli significa perdere mesi di import Beatport/Beatstats.
  if (Array.isArray(cloudData.rankingSnapshots) && cloudData.rankingSnapshots.length > 0) {
    merged.rankingSnapshots = cloudData.rankingSnapshots;
  } else if (Array.isArray(cloudData.rankingSnapshots) && (!localState.rankingSnapshots || localState.rankingSnapshots.length === 0)) {
    // Cloud vuoto e locale vuoto → ok a usare []
    merged.rankingSnapshots = cloudData.rankingSnapshots;
  } else {
    // Locale ha dati, cloud vuoto → mantieni locali
    merged.rankingSnapshots = localState.rankingSnapshots || [];
  }

  return merged;
}

// ===================================================================
// ARTIST BOOT LOADER
// Called once on app boot (after Zustand rehydration) to load artists
// from IndexedDB into the in-memory store. Non-blocking — UI renders
// immediately with artists:[] and populates when IDB returns.
// ===================================================================
export async function loadArtistsOnBoot(): Promise<void> {
  if (typeof window === "undefined") return;
  try {
    const artists = await loadArtistsFromIDB();
    if (artists.length > 0) {
      useAppStore.setState({ artists });
      console.info(`[LabelPulse] Loaded ${artists.length} artists from IndexedDB`);
    }
  } catch (e) {
    console.warn("[LabelPulse] Failed to load artists from IndexedDB:", e);
  }
}
