"use client";

import { create } from "zustand";
import { persist, createJSONStorage, StateStorage } from "zustand/middleware";
import { get as idbGet, set as idbSet, del as idbDel } from "idb-keyval";
import type { Locale } from "./i18n";
import labelData from "./labels-data.json";
import { saveStateToCloud, loadStateFromCloud, isSupabaseConfigured, isApplyingRemoteUpdate, markLocalProfileEdit } from "./supabase";
import { saveArtistsToIDB, loadArtistsFromIDB, clearArtistsIDB } from "./artists-idb";
import type { PitchTrackEntry } from "./pitch-utils";
import {
  apiCreateDemo,
  apiUpdateDemo,
  apiDeleteDemo,
  apiUpsertLabelData,
  apiDeleteLabelData,
  apiCreatePitch,
  apiUpdatePitch,
  apiDeletePitch,
  apiUpsertProfile,
  apiCreateRelease,
  apiUpdateRelease,
  apiDeleteRelease,
} from "./api-client";

// ==================== TYPES ====================

export type SubmissionType = "email" | "webform" | "platform";
/**
 * LabelStatus — the demo-submission policy of a label.
 *
 * - "open":    user has explicitly confirmed the label accepts demos
 *              (either by manual edit, or by sending a demo to it)
 * - "closed":  user has explicitly marked the label as not accepting demos
 * - "unknown": default for seed labels — we have no real signal. Used for
 *              all labels imported from Beatport that the user hasn't
 *              interacted with yet. See fix 2026-06-25: previously every
 *              seed label defaulted to "open", which made the dashboard
 *              show "1976 accettano demo" — a misleading number since
 *              Beatport doesn't expose this data and we never verified it.
 */
export type LabelStatus = "open" | "closed" | "unknown";
export type DemoStatus =
  | "ready"
  | "sent"
  | "reviewing"
  | "accepted"
  | "rejected";

/**
 * 🔒 Task B: Risposta event-driven dalla label (stile LabelRadar).
 * Ogni risposta è un evento con data, tipo e note opzionali.
 * Lo stato del demo viene calcolato automaticamente da getDemoStatus().
 */
export type DemoResponseType = "accepted" | "rejected" | "feedback" | "pending";

export interface DemoResponse {
  id: string;
  date: string;       // ISO timestamp
  type: DemoResponseType;
  note?: string;
}

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
  isFavorite?: boolean; // 🔒 FEATURE: preferiti (1 click per ritrovare)
  prevRankByGenre?: Record<string, number>; // Previous ranking snapshot (before last import)
  // ⚠️ Beatport identity (added 2026-06-24, beta tester Frank fonico request:
  // "aggiungerei se si può, il logo delle labels, per un riconoscimento immediato").
  // Captured by the scraper when the label is imported. imageUrl is the Beatport
  // CDN URL for the label's logo. slug/beatportId let us build a Beatport link
  // and a predicible fallback URL. These fields are OPTIONAL because the seed
  // labels-data.json does not have them — only scraper-imported labels do.
  beatportId?: number | null;
  slug?: string;
  imageUrl?: string;
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

/**
 * A Release is a logical grouping of one or more Demos — used for EPs
 * (2+ tracks) and conceptually also for singles (1 track). The `type`
 * field discriminates. Single-track Demos do NOT require a Release — they
 * are standalone (parentReleaseId === null). For EPs, the Release owns a
 * list of trackIds and the matching Demos have parentReleaseId set.
 */
export interface Release {
  id: string;
  type: "single" | "ep";
  title: string; // EP title ("Night Shift EP"); for singles = trackName
  artists: string[]; // primary + collaborators (e.g. ["Emmanuel Miro", "DJ X"])
  trackIds: string[]; // Demo ids belonging to this release
  genre: string; // overall release genre
  notes: string;
  createdAt: string;
  /**
   * Optional SoundCloud URL of the EP as a single album/private set.
   * When set, pitches that include this whole EP will reference THIS link
   * instead of the per-track SC links, so the label can preview the EP as
   * a continuous sequence (the way it's meant to be heard).
   * Empty/null = the EP doesn't have a single SoundCloud URL yet; pitches
   * fall back to listing each track's individual SC link.
   */
  epSoundCloudUrl?: string;
}

export interface Demo {
  id: string;
  trackName: string;
  /**
   * Artists credited on this track. The first is the primary producer
   * (typically the user, from userProfile.artistName). Additional entries
   * are collaborators (featuring / co-producer / remix). When omitted
   * (older demos pre-v13), fall back to [artistName].
   */
  artists?: string[];
  /**
   * If this demo belongs to a Release (EP), the release id. Null/undefined
   * for standalone singles.
   */
  parentReleaseId?: string | null;
  labelId: string;
  status: DemoStatus;
  sentDate: string | null;
  link: string; // primary SoundCloud link (legacy)
  links: { type: string; value: string }[]; // multiple demo links (SoundCloud, Dropbox, WeTransfer, etc.)
  notes: string;
  createdAt: string;
  pitchText: string;
  artistName: string; // LEGACY — kept for backward compat; use artists[] in new code
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
  // Reply tracking — when a label responds (auto-detected via Gmail API or
  // entered manually by the user). Allows the tracker to show "Ricevuto ACK",
  // "Risposta positiva", etc. without the user having to remember.
  replyStatus?: "none" | "ack" | "info" | "positive" | "rejected";
  replyText?: string;       // full text of the label's reply email
  replyDate?: string | null; // ISO date when the reply was received
  replySender?: string;     // who replied (e.g. "Patrick Scuro, Animarum")
  followUpDueDate?: string | null; // ISO date after which a follow-up is suggested
  // Gmail thread ID of the original pitch email — when present, replies to
  // the label are sent in the same Gmail thread (so the conversation stays
  // grouped in both the user's and the label's inbox).
  gmailThreadId?: string;
  // Gmail message ID of the label's reply — used as In-Reply-To header when
  // sending a follow-up so mail clients correctly thread the message.
  gmailReplyMessageId?: string;
  // Material submission tracking — when the label accepts and asks for
  // materials (WAV/stems/artwork), we record what was sent here.
  materialSentDate?: string | null;
  materialSentLinks?: string[]; // list of URLs sent to the label
  /**
   * Structured multi-track pitch info — populated when this Demo was saved
   * from a multi-track (EP or "selection of N tracks") pitch. Each entry
   * is one track with its own SoundCloud link, so the demo detail dialog
   * can render every track's link instead of just the single `link` field
   * (which only holds the first/primary track's URL in EP mode).
   *
   * Backward compat: existing demos (pre-v18) don't have this field. The
   * detail dialog falls back to parsing `pitchText` for SoundCloud URLs,
   * or just shows the single `link` as before.
   */
  pitchTracks?: PitchTrackEntry[];
  // Rilevamento automatico e NLP
  gmailUnreadResponse?: boolean; // se c'è una risposta da visualizzare/gestire
  nlpMatchedTracks?: string[];   // tracce dell'EP che l'NLP pensa siano d'interesse
  /**
   * 🔒 Task B: Storico risposte event-driven (stile LabelRadar).
   * Ogni risposta della label è un evento. Lo status viene calcolato
   * automaticamente da getDemoStatus(responses) invece di essere editato manualmente.
   * Migration: se responses è undefined ma status esiste, viene creato
   * automaticamente il primo record (vedi getDemoStatus).
   */
  responses?: DemoResponse[];
}

// ==================== SAVED PITCHES (Bozze) ====================
// A SavedPitch is a snapshot of the PitchGenerator form state, captured
// when the user clicks "Salva come bozza" instead of "Invia Campagna".
// It can be resumed later (re-loaded into the form) or deleted.
//
// Status:
//   - "draft"   : work-in-progress, NOT shown in Demo section
//   - "ready"   : ready to send, also surfaced in Demo section as "pronta per invio"
//
// When status === "ready", a Demo row is created with status "ready" and
// a `savedPitchId` link (stored in demo.notes as "[savedPitch:<id>]" prefix
// for reverse lookup). Sending the campaign from the pitch tab consumes
// the SavedPitch (deletes or marks as "sent" via SentCampaign).

export type SavedPitchStatus = "draft" | "ready";

export interface SavedPitch {
  id: string;
  name: string; // user-given or auto-generated "TrackName → N labels"
  status: SavedPitchStatus;
  createdAt: string;
  updatedAt: string;
  // Snapshot of PitchGenerator state at save time:
  trackName: string;
  artistName: string;
  scLink: string; // primary scLink (single mode) — for EP single-link, see epSingleLink
  tone: "professional" | "confident" | "friendly" | "storytelling";
  language: "en" | "it" | "es" | "fr" | "de" | "pt";
  customNote: string;
  selectedGenre: string;
  trackBpm: string;
  trackKey: string;
  // EP mode state
  epMode: boolean;
  epLinkMode: "separate" | "single";
  epSingleLink: string;
  selectedDemoIds: string[]; // ids of demos included in the EP (when epMode)
  // Target labels
  selectedLabelIds: string[];
  // Per-track scLinks (for ep-multi mode) — keyed by demo id
  perTrackLinks?: Record<string, string>;
}

// ==================== SENT CAMPAIGNS (Inviati) ====================
// A SentCampaign is the historical record of a campaign that was actually
// sent. Created at the end of `handleSendCampaign` in pitch-generator.tsx.
// Each recipient gets its own entry with the exact subject/body that went
// out + the demoId of the Demo row that was auto-created for it.

export interface SentCampaignRecipient {
  labelId: string;
  labelName: string; // denormalized in case the label is later deleted
  email: string; // primary email used
  subject: string;
  body: string; // exact text that went out
  gmailUrl: string; // the generated compose URL
  demoId: string | null; // Demo row created for this recipient (if any)
  status: "opened" | "skipped"; // opened = window opened, skipped = no email
}

export interface SentCampaign {
  id: string;
  name: string; // user-given or auto "TrackName → N labels"
  sentAt: string;
  // Snapshot of pitch state at send time (same fields as SavedPitch minus status)
  trackName: string;
  artistName: string;
  scLink: string;
  tone: "professional" | "confident" | "friendly" | "storytelling";
  language: "en" | "it" | "es" | "fr" | "de" | "pt";
  customNote: string;
  selectedGenre: string;
  epMode: boolean;
  epLinkMode: "separate" | "single";
  epSingleLink: string;
  selectedDemoIds: string[];
  selectedLabelIds: string[];
  // Send results
  recipients: SentCampaignRecipient[];
  sentCount: number;
  skippedCount: number;
  // Optional link back to the SavedPitch this was sent from (if any)
  savedPitchId?: string | null;
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
    status: "unknown" as LabelStatus,
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
    // Beatport identity (optional — only present on scraper-imported labels)
    beatportId: (l as any).beatportId ?? null,
    slug: (l as any).slug ?? "",
    imageUrl: (l as any).imageUrl ?? "",
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

// ==================== MULTI-USER ISOLATION (2026-06-26) ====================
// CRITICAL FIX: previously localStorage was GLOBAL — the same key
// "labelpulse-storage" was used by ALL users on a given device. When user A
// logged out, their data (demos, profile, label emails, saved pitches)
// REMAINED in localStorage. When user B logged in on the same device,
// Zustand persist rehydrated user A's data into user B's session. Worse,
// the cloud-merge logic does UNION BY ID, so user A's data was kept and
// merged with user B's (possibly empty) cloud data → user B saw user A's
// demos, profile bio, label emails, saved pitches, etc.
//
// This was reported as a CRITICAL data isolation bug ("è tutto mischiato").
//
// FIX: track the "owner" of the current localStorage data in a separate
// key. On login, if the current session's email doesn't match the owner,
// WIPE all local data before rehydrating. On logout, also wipe so the
// next user starts fresh. This ensures each user's data is strictly
// isolated per-device, and cloud sync (which is already per-email on the
// Supabase side) is the single source of truth across devices.
const OWNER_KEY = "labelpulse-storage-owner";

/**
 * Returns the email of the user who owns the current localStorage data,
 * or null if no owner is recorded (first-time user, or pre-fix data).
 */
export function getStorageOwner(): string | null {
  try {
    return localStorage.getItem(OWNER_KEY);
  } catch {
    return null;
  }
}

/**
 * Records the owner of the current localStorage data. Called after any
 * successful rehydration or cloud load — the data currently in localStorage
 * belongs to this user.
 */
export function setStorageOwner(email: string | null): void {
  try {
    if (email) {
      localStorage.setItem(OWNER_KEY, email);
    } else {
      localStorage.removeItem(OWNER_KEY);
    }
  } catch {
    // localStorage may be unavailable (private mode, quota) — non-fatal.
  }
}

/**
 * ⚠️ CRITICAL — Wipe ALL local user data.
 *
 * Called in two scenarios:
 *   1. On login, when the session's email doesn't match the current owner
 *      (different user logging in on the same device).
 *   2. On explicit logout, so the next user starts fresh.
 *
 * Removes:
 *   - Primary localStorage key (full Zustand state)
 *   - Backup localStorage key
 *   - Snapshots backup key
 *   - Profile backup (sidecar) key
 *   - Owner key itself
 *   - IndexedDB artists store
 *   - Zustand in-memory state (reset to seed defaults)
 *
 * After this, the app is in a "fresh install" state. The caller is
 * responsible for triggering cloud sync (loadFromCloud) to repopulate
 * the store for the new user.
 */
export function clearAllLocalData(): void {
  console.info("[LabelPulse Storage] Clearing ALL local data (multi-user isolation)");
  try {
    localStorage.removeItem(PRIMARY_KEY);
    localStorage.removeItem(BACKUP_KEY);
    localStorage.removeItem(SNAPSHOTS_BACKUP_KEY);
    localStorage.removeItem(PROFILE_BACKUP_KEY);
    localStorage.removeItem(OWNER_KEY);
    // ⚠️ CRITICAL (regression caught by store.isolation.test.ts, 2026-06-25):
    // Also remove the artists sidecar. clearArtistsIDB() below only clears
    // IndexedDB — the localStorage mirror "labelpulse-artists-backup" was
    // left behind, leaking the previous user's saved artists into the new
    // user's session on next reload.
    // Note: ARTISTS_SIDECAR_KEY is defined later in the file (hoisting does
    // NOT apply to `const`), so we use the literal string here.
    localStorage.removeItem("labelpulse-artists-backup");
  } catch (e) {
    console.warn("[LabelPulse Storage] Error removing localStorage keys:", e);
  }
  // Clear IndexedDB (artists) — async but we don't wait
  clearArtistsIDB().catch((e) =>
    console.warn("[LabelPulse Storage] Error clearing artists IDB:", e)
  );
  // ⚠️ CRITICAL FIX (2026-06-26, login-blocked-after-logout bug):
  // DO NOT reset _rehydrated or hasRehydrated to false here.
  //
  // The Zustand persist onRehydrateStorage callback (which sets these
  // flags back to true) fires ONLY ONCE at the initial app mount. If
  // we set them to false here (e.g. on logout), NOTHING will ever flip
  // them back — page.tsx will show "Loading LabelPulse..." forever and
  // the user is locked out of the app, unable to even see the login
  // button.
  //
  // After explicit clear, the store is in a fresh-seed state with no
  // user data to protect — so writes can safely proceed immediately.
  _rehydrated = true;
  // Reset the in-memory Zustand store to seed defaults. We mirror the
  // exact same initial state shape used in create<AppState>()(persist(...))
  // below — but only the data fields, NOT the action functions (those are
  // preserved by setState's merge behavior when overwrite=false).
  // We pass overwrite=false (default) so existing actions stay intact.
  useAppStore.setState({
    labels: buildLabelsFromData(),
    demos: [],
    artists: [],
    selectedArtistId: null,
    selectedLabelId: null,
    navigationReturnTo: null,
    activeTab: "dashboard",
    locale: "it" as Locale,
    userProfile: {
      artistName: "", scLink: "", bio: "", email: "", photoUrl: "",
      links: [], cyaniteApiToken: "", supabaseUrl: "", supabaseAnonKey: "",
      notifications: { master: false, followUp: true, rankings: true, weeklyRecap: true },
    } as UserProfile,
    gmailAuth: { isConnected: false, email: "", accessToken: "", expiresAt: 0 } as GmailAuth,
    releases: [],
    savedPitches: [],
    sentCampaigns: [],
    lastReplyScanAt: null,
    newRepliesCount: 0,
    rankingsUpdatedAt: null,
    lastSavedAt: null,
    // ⚠️ Keep hasRehydrated=true (do NOT reset to false here).
    // See comment above — resetting it would lock the user out of the app
    // because onRehydrateStorage only fires once at initial mount.
    hasRehydrated: true,
    hasCloudSynced: false,
    rankingSnapshots: [],
  }, false);
}

/**
 * Verifies that the current localStorage data belongs to the given email.
 * If it doesn't (different user), wipes all local data so the new user
 * starts fresh and loads their own data from cloud.
 *
 * Called from useAuthEffect when the session's email is established.
 * Returns true if data was cleared (caller should trigger cloud load).
 */
export function verifyStorageOwner(email: string | null): boolean {
  if (!email) {
    // No email (unauthenticated) — don't touch existing data. The user
    // might be in the middle of a session that hasn't logged in yet.
    return false;
  }
  const owner = getStorageOwner();
  if (owner === email) {
    // Same user — data is theirs, no action needed.
    return false;
  }
  if (owner && owner !== email) {
    // DIFFERENT user — wipe everything before they see the previous
    // user's data. This is the critical multi-tenant isolation step.
    console.info(
      `[LabelPulse Storage] Owner mismatch (was "${owner}", now "${email}") — clearing local data`
    );
    clearAllLocalData();
    setStorageOwner(email);
    return true;
  }
  // No previous owner — first-time user on this device. Claim ownership.
  setStorageOwner(email);
  return false;
}

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
  } catch (e: any) {
    // 🔒 FASE A FIX (QuotaExceededError): detect quota errors and try to recover
    const isQuotaError =
      e?.name === "QuotaExceededError" ||
      e?.code === 22 ||
      e?.code === 1014 ||
      (typeof e?.message === "string" && e.message.toLowerCase().includes("quota"));

    if (isQuotaError) {
      console.warn(`[LabelPulse Storage] QuotaExceededError on ${key}. Attempting recovery...`);

      // Strategy: clear all sidecar backups (they're emergency copies — cloud is the source of truth)
      const sidecarKeys = [
        "labelpulse-storage-backup",
        "labelpulse-snapshots-backup",
        "labelpulse-profile-backup",
        "labelpulse-artists-backup",
        "labelpulse-demos-backup",
      ];
      let cleared = 0;
      for (const sk of sidecarKeys) {
        if (sk === key) continue; // don't clear what we're trying to write
        try {
          if (localStorage.getItem(sk)) {
            localStorage.removeItem(sk);
            cleared++;
          }
        } catch {}
      }
      console.warn(`[LabelPulse Storage] Cleared ${cleared} sidecar backup(s) to free space.`);

      // Retry the original write
      try {
        localStorage.setItem(key, value);
        console.info(`[LabelPulse Storage] Write succeeded after clearing sidecars: ${key}`);

        // 🔔 Notify UI that storage is under pressure (non-blocking)
        if (typeof window !== "undefined") {
          window.dispatchEvent(new CustomEvent("labelpulse:storage-quota-warning", {
            detail: { cleared, recovered: true }
          }));
        }
        return true;
      } catch (e2: any) {
        console.error(`[LabelPulse Storage] Write still failing after clearing sidecars:`, e2);

        // 🔒 LAST RESORT: trigger immediate cloud sync (no debounce) so data isn't lost
        // The state is still in memory (Zustand store); we just need to push it to cloud NOW.
        // We can't import syncToCloud here (circular dep), so dispatch an event that the
        // store subscription will pick up and trigger forceCloudSync().
        if (typeof window !== "undefined") {
          window.dispatchEvent(new CustomEvent("labelpulse:storage-quota-exceeded", {
            detail: { key, error: e2?.message || "quota_exceeded" }
          }));
        }
        return false;
      }
    }

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
 * Public alias for mergeSnapshots, exported so supabase.ts can use it via
 * lazy import (to avoid circular deps at module load time).
 */
export const mergeSnapshotsPublic = mergeSnapshots;

/**
 * Public alias for mergeCloudData, exported so supabase.ts can use it via
 * lazy import (to avoid circular deps at module load time). Used by the
 * explicitMergeLocalAndCloud recovery action.
 */
export const mergeCloudDataPublic = mergeCloudData;

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

// Track backup write failures so we can stop spamming the console when
// localStorage is full. After MAX_BACKUP_FAILURES consecutive QuotaExceeded
// errors, we disable the backup entirely (until next page reload) and only
// log a single warning. The primary key keeps being written normally.
// The backup is a safety net — if it can't fit, we can't do anything about
// it from the app, so we don't keep retrying every keystroke.
const MAX_BACKUP_FAILURES = 3;
let _backupFailures = 0;
let _backupDisabled = false;

// 🔒 Task 3: Adattatore IndexedDB per Zustand persist.
// Sostituisce localStorage (5MB limite iOS) con IndexedDB (50MB+ su iOS).
// Migrazione automatica: al primo avvio, se IndexedDB è vuoto ma localStorage
// ha dati, li copia e poi pulisce localStorage.
const idbStorage: StateStorage = {
  getItem: async (name: string): Promise<string | null> => {
    try {
      const val = await idbGet(name);
      if (val) return val as string;

      // 🔒 Migrazione: se IndexedDB è vuoto, prova localStorage
      if (typeof window !== "undefined" && window.localStorage) {
        const localVal = window.localStorage.getItem(name);
        if (localVal) {
          console.log(`[LabelPulse IDB] Migrating ${name} from localStorage → IndexedDB (${(localVal.length / 1024).toFixed(1)} KB)`);
          await idbSet(name, localVal);
          // NON cancellare localStorage subito — attendi conferma che IDB funziona
          return localVal;
        }
      }
      return null;
    } catch (err) {
      console.error(`[LabelPulse IDB] getItem failed for ${name}:`, err);
      // Fallback a localStorage se IndexedDB non disponibile
      if (typeof window !== "undefined" && window.localStorage) {
        return window.localStorage.getItem(name);
      }
      return null;
    }
  },
  setItem: async (name: string, value: string): Promise<void> => {
    try {
      await idbSet(name, value);
      // Pulisci il vecchio localStorage dopo che IDB ha avuto successo
      if (typeof window !== "undefined" && window.localStorage) {
        const localVal = window.localStorage.getItem(name);
        if (localVal) {
          window.localStorage.removeItem(name);
          console.log(`[LabelPulse IDB] Cleaned localStorage ${name} after IDB write`);
        }
      }
    } catch (err) {
      console.error(`[LabelPulse IDB] setItem failed for ${name}:`, err);
      // Fallback a localStorage se IndexedDB non disponibile
      if (typeof window !== "undefined" && window.localStorage) {
        try {
          window.localStorage.setItem(name, value);
        } catch (e) {
          console.error(`[LabelPulse IDB] localStorage fallback also failed:`, e);
        }
      }
    }
  },
  removeItem: async (name: string): Promise<void> => {
    try {
      await idbDel(name);
      if (typeof window !== "undefined" && window.localStorage) {
        window.localStorage.removeItem(name);
      }
    } catch (err) {
      console.error(`[LabelPulse IDB] removeItem failed for ${name}:`, err);
    }
  },
};

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
    // THROTTLE: if backup has failed MAX_BACKUP_FAILURES times in a row (usually
    // because localStorage quota is exceeded — common when the user has 1900+
    // labels with user data), stop retrying until next page reload. We log a
    // single warning instead of spamming console.error on every keystroke.
    if (!_backupDisabled) {
      const backupOk = safeLocalStorageSet(BACKUP_KEY, value);
      if (!backupOk) {
        _backupFailures += 1;
        if (_backupFailures >= MAX_BACKUP_FAILURES) {
          _backupDisabled = true;
          console.warn(
            `[LabelPulse Storage] Backup disabled after ${_backupFailures} consecutive failures (localStorage quota exceeded). Primary storage is still working. Consider exporting a manual backup from the Backup Dati button.`
          );
        }
      } else if (_backupFailures > 0) {
        // Reset on success — transient failure recovered
        _backupFailures = 0;
      }
    }

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
    } else if (k === "photoUrl" && typeof v === "string" && typeof merged[k] === "string") {
      // 2026-06-25 — Lutenzo iPhone bug second-layer defense.
      // Both local and cloud have a photoUrl (both non-empty). The general
      // rule "non-empty wins" would keep base[k] (local). But there's a
      // subtle race: if base.photoUrl is momentarily undefined during a
      // setState cycle, the general branch below would accept the incoming
      // (stale cloud) value. The grace-period in supabase.ts covers that
      // for 10 seconds after a local edit — this is the second layer that
      // runs AFTER the grace-period expires.
      //
      // Heuristic: avatar data URLs are ~30-80 KB long (JPEG 256×256 @0.85).
      // If both have a photoUrl and they differ, prefer the LONGER one — a
      // longer data URL almost always means a fresher upload (more detail,
      // less recompression). This is not bulletproof but catches the most
      // common case: cloud has a 30 KB version (uploaded weeks ago, recompressed
      // by some intermediate sync), local has the 75 KB version just uploaded.
      if (v.length > merged[k].length * 1.2) {
        // incoming is significantly larger (>20%) — likely fresher
        merged[k] = v;
      }
      // otherwise: keep base[k] (local). Don't touch.
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

// ==================== ARTISTS SIDE CAR ====================
// Like PROFILE_BACKUP_KEY but for the artists array. A full Beatport scrape
// produces ~3400 artists / ~9MB. localStorage has a 5-10MB quota on most
// browsers, so we TRY to write artists here but FAIL GRACEFULLY if quota
// exceeded — the IndexedDB + cloud are the primary stores, this is just
// an emergency backup for when both fail.
//
// Strategy:
//  - writeArtistsSidecar: best-effort write, truncate if needed (keep first
//    N artists rather than fail entirely). Skip silently if quota exceeded.
//  - readArtistsSidecar: returns [] if missing/corrupt
//  - restoreArtistsFromSidecar: splice into live store if local is empty
const ARTISTS_SIDECAR_KEY = "labelpulse-artists-backup";
const ARTISTS_SIDECAR_MAX = 200; // cap to first 200 artists (~600KB) to fit quota

export function writeArtistsSidecar(artists: any[]): void {
  if (typeof window === "undefined") return;
  if (!Array.isArray(artists) || artists.length === 0) return;
  try {
    // If small enough, write all. Otherwise, write first N + a marker.
    const capped = artists.length > ARTISTS_SIDECAR_MAX
      ? artists.slice(0, ARTISTS_SIDECAR_MAX)
      : artists;
    const payload = JSON.stringify({
      savedAt: new Date().toISOString(),
      count: artists.length,
      capped: artists.length > ARTISTS_SIDECAR_MAX,
      artists: capped,
    });
    safeLocalStorageSet(ARTISTS_SIDECAR_KEY, payload);
  } catch (e) {
    // Quota exceeded — try with even fewer artists
    try {
      const tiny = artists.slice(0, 50);
      const payload = JSON.stringify({
        savedAt: new Date().toISOString(),
        count: artists.length,
        capped: true,
        artists: tiny,
      });
      safeLocalStorageSet(ARTISTS_SIDECAR_KEY, payload);
    } catch {
      // Give up silently — IDB + cloud are the primary stores
    }
  }
}

export function readArtistsSidecar(): any[] {
  if (typeof window === "undefined") return [];
  const raw = safeLocalStorageGet(ARTISTS_SIDECAR_KEY);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    const arr = parsed?.artists;
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
}

/**
 * Restore artists from sidecar IF the live store has 0 artists.
 * Returns the number of artists restored (0 if nothing happened).
 * Does NOT replace live artists if live already has data — sidecar is
 * only an emergency recovery, not a primary source.
 */
export function restoreArtistsFromSidecar(): number {
  if (typeof window === "undefined") return 0;
  const sidecar = readArtistsSidecar();
  if (sidecar.length === 0) return 0;

  const current = useAppStore.getState().artists || [];
  if (current.length > 0) return 0;

  useAppStore.setState({ artists: sidecar });
  console.info(
    `[LabelPulse] Restored ${sidecar.length} artists from sidecar backup (live store was empty).`
  );
  // Also persist to IDB so future boots are fast
  saveArtistsToIDB(sidecar).catch(() => {});
  return sidecar.length;
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
  /**
   * Web Push notification preferences. Persisted client-side + mirrored
   * to the server (push_subscriptions table) on every toggle.
   * - master: whether notifications are enabled at all (push permission
   *   granted AND user opted in)
   * - followUp: 7-day reminder for demos awaiting reply
   * - rankings: notify when admin updates Beatport rankings
   * - weeklyRecap: Monday 9am recap of the previous week's activity
   */
  notifications?: {
    master: boolean;
    followUp: boolean;
    rankings: boolean;
    weeklyRecap: boolean;
  };
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
  selectedLabelId: string | null; // cross-tab navigation: clicking a label name from Artist Explorer sets this, then LabelFinder opens the detail dialog
  /**
   * Navigation return-to state. When the user navigates from Label detail →
   * Artist detail (via handleOpenArtist), we stash `{ kind: 'label', labelId }`
   * here. The Artist Explorer's "Back" button checks this first: if set, it
   * returns to the Labels tab and re-opens that label's detail dialog
   * (preserving scroll position would be a bonus, but re-opening the dialog
   * is the minimum viable UX). If null/empty, Back falls back to the artist
   * list (existing behavior).
   */
  navigationReturnTo: { kind: "label"; labelId: string; labelName?: string } | null;
  activeTab: "dashboard" | "labels" | "artists" | "rankings" | "demos" | "pitch" | "profile";
  locale: Locale;
  userProfile: UserProfile;
  gmailAuth: GmailAuth;
  /**
   * ISO timestamp of the last Gmail reply scan. Used both for UI display
   * ("last checked 2 minutes ago") and as the `sinceDate` for the next
   * scan (so we don't re-fetch replies we've already seen).
   */
  lastReplyScanAt: string | null;
  /**
   * Count of demos with new/updated replies detected during the most
   * recent scan. Surfaced in the Gmail popover as a notification badge.
   */
  newRepliesCount: number;
  rankingsUpdatedAt: string | null;
  lastSavedAt: string | null;
  hasRehydrated: boolean;
  hasCloudSynced: boolean;
  rankingSnapshots: RankingSnapshot[];

  // Label actions
  addLabel: (label: Partial<Omit<Label, "id" | "createdAt">> & { name: string }) => void;
  updateLabel: (id: string, updates: Partial<Label>) => void;
  toggleFavoriteLabel: (id: string) => void; // 🔒 FEATURE: preferiti (1 click)
  deleteLabel: (id: string) => void;

  // Demo actions
  addDemo: (demo: Omit<Demo, "id" | "createdAt">) => string; // returns new id
  updateDemo: (id: string, updates: Partial<Demo>) => void;
  deleteDemo: (id: string) => void;
  advanceDemoStatus: (id: string) => void;
  addDemoResponse: (demoId: string, response: Omit<DemoResponse, "id">) => void; // 🔒 Task B
  removeDemoResponse: (demoId: string, responseId: string) => void; // 🔒 Task B

  // Release (EP / single grouping) actions
  releases: Release[];
  addRelease: (release: Omit<Release, "id" | "createdAt">) => string; // returns new id
  updateRelease: (id: string, updates: Partial<Release>) => void;
  deleteRelease: (id: string) => void;

  // Saved Pitches (Bozze) — work-in-progress or ready-to-send pitches
  savedPitches: SavedPitch[];
  addSavedPitch: (pitch: Omit<SavedPitch, "id" | "createdAt" | "updatedAt">) => string;
  updateSavedPitch: (id: string, updates: Partial<SavedPitch>) => void;
  deleteSavedPitch: (id: string) => void;

  // Sent Campaigns (Inviati) — historical record of sent campaigns
  sentCampaigns: SentCampaign[];
  addSentCampaign: (campaign: Omit<SentCampaign, "id" | "sentAt">) => string;
  deleteSentCampaign: (id: string) => void;

  // Navigation
  setActiveTab: (tab: "dashboard" | "labels" | "artists" | "rankings" | "demos" | "pitch" | "profile") => void;

  // Artists (Phase 2 — Beatport scraper v2)
  setSelectedArtistId: (id: string | null) => void;
  setArtists: (artists: Artist[]) => void;

  // Cross-tab label focus (Phase 2 — used by Artist Explorer → Label Finder)
  setSelectedLabelId: (id: string | null) => void;

  // Navigation return-to (used by Artist Explorer Back button to return
  // to the label detail dialog the user was viewing before)
  setNavigationReturnTo: (target: { kind: "label"; labelId: string; labelName?: string } | null) => void;

  // Language
  setLocale: (locale: Locale) => void;

  // User Profile
  setUserProfile: (profile: Partial<UserProfile>) => void;

  // Available genres
  getGenres: () => string[];

  // Gmail
  setGmailAuth: (auth: GmailAuth) => void;
  clearGmailAuth: () => void;
  /**
   * Scan Gmail for replies to all sent demos. Updates each demo's replyStatus,
   * replyText, replyDate, replySender fields. Auto-advances demo status when
   * a positive/rejected reply is detected. Returns a summary of detected
   * replies so the UI can show a toast / notification.
   *
   * NOTE: This action is async and depends on the browser being online +
   * Gmail being connected. It returns a structured result so the caller
   * can show toasts per the user's locale.
   */
  scanGmailReplies: () => Promise<{
    scanned: number;
    newReplies: number;
    errors: number;
    details: Array<{
      demoId: string;
      trackName: string;
      category: "ack" | "info" | "positive" | "rejected" | "none";
      from: string;
      date: string;
    }>;
  }>;

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
  //
  // IDEMPOTENT IMPORT FIX: previously, every import — even an identical re-import —
  // would clobber prevRankByGenre with a copy of the current rankByGenre. After
  // an identical re-import, prevRank == currentRank for every genre, so all
  // movements became 0 and Spotlight risers disappeared. This broke the UX:
  // "if I re-import the same scrape, I should see what I saw before".
  //
  // The fix: only snapshot the existing rank as "previous" for genres where the
  // rank has actually CHANGED. For genres where imported rank === existing rank,
  // preserve the existing prevRankByGenre[genre] so users keep seeing the risers
  // they had before the (identical) re-import.
  const importedRank = imported.rankByGenre || {};
  const existingRank = existing.rankByGenre || {};
  const existingPrev = existing.prevRankByGenre || {};
  const hasNewRankData = Object.keys(importedRank).length > 0;

  let newPrevRankByGenre: Record<string, number>;
  if (hasNewRankData) {
    // Start from the existing prev snapshot — we only overwrite entries for
    // genres where the rank actually changed.
    newPrevRankByGenre = { ...existingPrev };
    for (const [genre, newRank] of Object.entries(importedRank)) {
      const oldRank = existingRank[genre];
      if (oldRank !== undefined && oldRank !== newRank) {
        // Rank changed for this genre → snapshot the old rank as "previous".
        newPrevRankByGenre[genre] = oldRank;
      }
      // If oldRank === newRank → leave existing prevRankByGenre[genre] untouched
      // (preserves the snapshot from the last actual change → risers persist).
      // If oldRank is undefined (genre new for this label) → don't set prev
      // (label is a new entry for this genre, no previous rank to compare to).
    }
  } else {
    // No new rank data → keep existing prevRankByGenre unchanged.
    newPrevRankByGenre = existingPrev;
  }

  return {
    // User-editable data — ALWAYS prefer existing if it has real data
    emails: imported.emails?.length ? imported.emails : existing.emails,
    contactInfo: imported.contactInfo?.trim() || existing.contactInfo,
    website: imported.website?.trim() || existing.website,
    demoLink: imported.demoLink?.trim() || existing.demoLink,
    socialLink: imported.socialLink?.trim() || existing.socialLink,
    soundcloudLink: imported.soundcloudLink?.trim() || existing.soundcloudLink,
    notes: imported.notes?.trim() || existing.notes,
    status: (imported.status === "open" || imported.status === "closed" || imported.status === "unknown")
      ? imported.status
      : (existing.status && existing.status !== "unknown" ? existing.status : "unknown"),

    // Beatport/ranking data — prefer imported (it's the fresh data)
    genres: imported.genres?.length ? imported.genres : existing.genres,
    rankByGenre: Object.keys(imported.rankByGenre || {}).length ? imported.rankByGenre : existing.rankByGenre,
    pointsByGenre: Object.keys(imported.pointsByGenre || {}).length ? imported.pointsByGenre : existing.pointsByGenre,
    trending: imported.trending || existing.trending,
    trendingRankByGenre: Object.keys(imported.trendingRankByGenre || {}).length ? imported.trendingRankByGenre : existing.trendingRankByGenre,
    trendingPointsByGenre: Object.keys(imported.trendingPointsByGenre || {}).length ? imported.trendingPointsByGenre : existing.trendingPointsByGenre,

    // Beatport identity (logo / slug / beatportId) — prefer imported (fresh
    // scrape) when present, fall back to existing. This ensures that once a
    // label has been scraped once and has imageUrl, it keeps it even if a
    // later partial import doesn't include the field.
    beatportId: (imported.beatportId != null ? imported.beatportId : existing.beatportId) ?? null,
    slug: imported.slug?.trim() || existing.slug || "",
    imageUrl: imported.imageUrl?.trim() || existing.imageUrl || "",

    // Ranking history — idempotent: only update prev when rank actually changed
    prevRankByGenre: newPrevRankByGenre,
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
  beatportId: null,
  slug: "",
  imageUrl: "",
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
  status: "unknown" as LabelStatus,
  genre: "",
  prevRankByGenre: {},
};

/**
 * Repair corrupted label data.
 * Detects and fixes: same email appearing on too many labels (likely corruption).
 *
 * Also normalizes legacy "open" status on seed labels to "unknown" when
 * the user has never interacted with them. See fix 2026-06-25: previously
 * every seed label defaulted to "open", making the dashboard show a
 * misleading "1976 accettano demo" number. We can't tell from the data
 * alone which labels the user manually set to "open" vs which inherited
 * the old default — the migration in persist config handles that
 * distinction. Here we just coerce invalid statuses to "unknown".
 */
function repairLabelData(labels: Label[]): Label[] {
  // First pass: filter out corrupted labels (no name, or not an object).
  // These cause "Cannot read properties of undefined (reading 'toLowerCase')"
  // crashes in useMemo filters downstream when cloud merge produces
  // half-formed label objects. Better to drop them silently than crash the UI.
  let safeLabels = labels.filter(l => l && typeof l === "object" && typeof l.name === "string" && l.name.trim() !== "");
  if (safeLabels.length !== labels.length) {
    console.warn(
      `[LabelPulse Repair] Filtered out ${labels.length - safeLabels.length} corrupted label(s) (missing/empty name) out of ${labels.length}.`
    );
  }

  // Normalize status: coerce invalid/legacy values to "unknown".
  // Valid values: "open", "closed", "unknown". Anything else → "unknown".
  // This handles old localStorage data that might still have "" or null.
  for (const l of safeLabels) {
    if (l.status !== "open" && l.status !== "closed" && l.status !== "unknown") {
      l.status = "unknown";
    }
  }

  const emailLabelCount = new Map<string, number>();
  for (const l of safeLabels) {
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
    return safeLabels;
  }

  const emailOwner = new Map<string, string>();
  for (const email of corruptedEmails) {
    for (const l of safeLabels) {
      if (l.emails?.some(e => e.toLowerCase().trim() === email)) {
        const domain = email.split("@")[1]?.split(".")[0]?.toLowerCase();
        if (domain && l.name.toLowerCase().includes(domain)) {
          emailOwner.set(email, l.id);
          break;
        }
      }
    }
    if (!emailOwner.has(email)) {
      for (const l of safeLabels) {
        if (l.emails?.some(e => e.toLowerCase().trim() === email)) {
          emailOwner.set(email, l.id);
          break;
        }
      }
    }
  }

  return safeLabels.map(l => {
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
      selectedLabelId: null as string | null,
      navigationReturnTo: null as { kind: "label"; labelId: string; labelName?: string } | null,
      activeTab: "dashboard" as const,
      locale: "it" as Locale,
      userProfile: { artistName: "", scLink: "", bio: "", email: "", photoUrl: "", links: [], cyaniteApiToken: "", supabaseUrl: "", supabaseAnonKey: "", notifications: { master: false, followUp: true, rankings: true, weeklyRecap: true } } as UserProfile,
      gmailAuth: { isConnected: false, email: "", accessToken: "", expiresAt: 0 } as GmailAuth,
      releases: [] as Release[],
      savedPitches: [] as SavedPitch[],
      sentCampaigns: [] as SentCampaign[],
      lastReplyScanAt: null,
      newRepliesCount: 0,
      rankingsUpdatedAt: null as string | null,
      lastSavedAt: null as string | null,
      hasRehydrated: false as boolean,
      hasCloudSynced: false as boolean,
      rankingSnapshots: [] as RankingSnapshot[],

      addLabel: (label) => {
        const newId = genId();
        const newLabel = {
          ...label,
          id: newId,
          createdAt: new Date().toISOString(),
          isCustom: true,
          genre: label.genre || "",
          contactInfo: label.contactInfo || "",
          status: (label.status === "open" || label.status === "closed" || label.status === "unknown") ? label.status : "unknown",
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
        };
        set((state) => ({
          labels: [...state.labels, newLabel],
          lastSavedAt: new Date().toISOString(),
        }));
        syncToCloud();
        // 🔒 FASE C.4: dual write — custom label goes to new dedicated table
        apiUpsertLabelData({
          label_id: newId,
          emails: newLabel.emails,
          notes: newLabel.notes,
          status: newLabel.status,
          website: newLabel.website,
          demo_link: newLabel.demoLink,
          social_link: newLabel.socialLink,
          soundcloud_link: newLabel.soundcloudLink,
          contact_info: newLabel.contactInfo,
          is_custom: true,
          custom_name: newLabel.name,
          custom_genre: newLabel.genre,
        }).catch(() => {/* silent */});
        // Track first label added (only once per user — checked client-side via flag)
        if (typeof window !== "undefined") {
          const firstLabelKey = "lp_first_label_tracked";
          if (!localStorage.getItem(firstLabelKey)) {
            localStorage.setItem(firstLabelKey, new Date().toISOString());
            void import("./analytics").then(({ trackEvent }) => {
              trackEvent("first_label_added", { label_name: label.name, genre: label.genre });
            });
          }
        }
      },

      updateLabel: (id, updates) => {
        set((state) => ({
          labels: state.labels.map((l) =>
            l.id === id ? { ...l, ...updates } : l
          ),
          lastSavedAt: new Date().toISOString(),
        }));
        syncToCloud();
        // 🔒 FASE C.4: dual write — push personal data to new dedicated table
        const updated = useAppStore.getState().labels.find((l) => l.id === id);
        if (updated) {
          apiUpsertLabelData({
            label_id: id,
            emails: updated.emails,
            notes: updated.notes,
            status: updated.status,
            website: updated.website,
            demo_link: updated.demoLink,
            social_link: updated.socialLink,
            soundcloud_link: updated.soundcloudLink,
            beatport_link: updated.beatportLink,
            contact_info: updated.contactInfo,
            is_custom: updated.isCustom || false,
            custom_name: updated.isCustom ? updated.name : undefined,
            custom_genre: updated.isCustom ? updated.genre : undefined,
          }).catch(() => {/* silent */});
        }
      },

      // 🔒 FEATURE: toggle preferito (1 click per ritrovare la label)
      toggleFavoriteLabel: (id) => {
        const current = get().labels.find((l) => l.id === id);
        const newFav = !current?.isFavorite;
        set((state) => ({
          labels: state.labels.map((l) =>
            l.id === id ? { ...l, isFavorite: newFav } : l
          ),
          lastSavedAt: new Date().toISOString(),
        }));
        // Cloud sync (upsert su label_personal_data) — con logging visibile
        apiUpsertLabelData({
          label_id: id,
          is_favorite: newFav,
          emails: current?.emails || [],
          notes: current?.notes || "",
          status: current?.status || "unknown",
          website: current?.website || "",
          demo_link: current?.demoLink || "",
          social_link: current?.socialLink || "",
          soundcloud_link: current?.soundcloudLink || "",
          contact_info: current?.contactInfo || "",
          is_custom: current?.isCustom || false,
        }).then((ok) => {
          if (ok) {
            console.log(`[favorites] ✅ Sync cloud: label ${id} → is_favorite=${newFav}`);
          } else {
            console.error(`[favorites] ❌ Sync cloud FALLITA: label ${id} → is_favorite=${newFav}`);
          }
        }).catch((err) => {
          console.error(`[favorites] ❌ Errore sync cloud label ${id}:`, err);
        });
      },

      deleteLabel: (id) => {
        set((state) => ({
          labels: state.labels.filter((l) => l.id !== id),
          lastSavedAt: new Date().toISOString(),
        }));
        syncToCloud();
        // 🔒 FASE C.4: dual write — delete from new dedicated table
        apiDeleteLabelData(id).catch(() => {/* silent */});
      },

      addDemo: (demo) => {
        const id = genId();
        const newDemo = { ...demo, id, createdAt: new Date().toISOString() };
        set((state) => ({
          demos: [...state.demos, newDemo],
          lastSavedAt: new Date().toISOString(),
        }));
        syncToCloud();
        // 🔒 FASE C.3: dual write — also push to new dedicated table
        apiCreateDemo({
          id: newDemo.id,
          label_id: newDemo.labelId,
          track_name: newDemo.trackName,
          artist_name: newDemo.artistName,
          link: newDemo.link,
          status: newDemo.status,
          sent_date: newDemo.sentDate,
          pitch_text: newDemo.pitchText,
          pitch_subject: newDemo.pitchSubject,
          pitch_tracks: newDemo.pitchTracks,
          notes: newDemo.notes,
          parent_release_id: newDemo.parentReleaseId,
        }).catch(() => {/* silent — logged in api-client */});
        // Track first demo added (only once per user)
        if (typeof window !== "undefined") {
          const firstDemoKey = "lp_first_demo_tracked";
          if (!localStorage.getItem(firstDemoKey)) {
            localStorage.setItem(firstDemoKey, new Date().toISOString());
            void import("./analytics").then(({ trackEvent }) => {
              trackEvent("first_demo_added", { track_name: demo.trackName, label_id: demo.labelId });
            });
          }
        }
        return id;
      },

      updateDemo: (id, updates) => {
        set((state) => ({
          demos: state.demos.map((d) =>
            d.id === id ? { ...d, ...updates } : d
          ),
          lastSavedAt: new Date().toISOString(),
        }));
        syncToCloud();
        // 🔒 FASE C.3: dual write — also push update to new dedicated table
        const updated = useAppStore.getState().demos.find((d) => d.id === id);
        if (updated) {
          apiUpdateDemo(id, {
            label_id: updated.labelId,
            track_name: updated.trackName,
            artist_name: updated.artistName,
            link: updated.link,
            status: updated.status,
            sent_date: updated.sentDate,
            pitch_text: updated.pitchText,
            pitch_subject: updated.pitchSubject,
            pitch_tracks: updated.pitchTracks,
            notes: updated.notes,
            parent_release_id: updated.parentReleaseId,
          }).catch(() => {/* silent */});
        }
      },

      deleteDemo: (id) => {
        set((state) => ({
          demos: state.demos.filter((d) => d.id !== id),
          lastSavedAt: new Date().toISOString(),
        }));
        syncToCloud();
        // 🔒 FASE C.3: dual write — also delete from new dedicated table
        apiDeleteDemo(id).catch(() => {/* silent */});
      },

      addRelease: (release) => {
        const id = genId();
        const now = new Date().toISOString();
        const newRelease = { ...release, id, createdAt: now };
        set((state) => ({
          releases: [
            ...state.releases,
            newRelease,
          ],
          lastSavedAt: now,
        }));
        syncToCloud();
        // Scrittura speculare nel cloud per le release
        apiCreateRelease({
          id: newRelease.id,
          type: newRelease.type,
          title: newRelease.title,
          artists: newRelease.artists,
          track_ids: newRelease.trackIds,
          genre: newRelease.genre,
          notes: newRelease.notes,
          ep_soundcloud_url: newRelease.epSoundCloudUrl,
        }).catch(() => {/* silente */});
        return id;
      },
      updateRelease: (id, updates) => {
        set((state) => ({
          releases: state.releases.map((r) =>
            r.id === id ? { ...r, ...updates } : r
          ),
          lastSavedAt: new Date().toISOString(),
        }));
        syncToCloud();
        // Scrittura speculare nel cloud per l'aggiornamento della release
        const updated = useAppStore.getState().releases.find((r) => r.id === id);
        if (updated) {
          apiUpdateRelease(id, {
            type: updated.type,
            title: updated.title,
            artists: updated.artists,
            track_ids: updated.trackIds,
            genre: updated.genre,
            notes: updated.notes,
            ep_soundcloud_url: updated.epSoundCloudUrl,
          }).catch(() => {/* silente */});
        }
      },
      deleteRelease: (id) => {
        // Scollega tutti i demo legati a questa release, poi rimuovi la release stessa
        set((state) => ({
          releases: state.releases.filter((r) => r.id !== id),
          demos: state.demos.map((d) =>
            d.parentReleaseId === id ? { ...d, parentReleaseId: null } : d
          ),
          lastSavedAt: new Date().toISOString(),
        }));
        syncToCloud();
        // Scrittura speculare nel cloud per la cancellazione
        apiDeleteRelease(id).catch(() => {/* silente */});
      },

      // ==================== SAVED PITCHES (Bozze) ====================
      addSavedPitch: (pitch) => {
        const id = genId();
        const now = new Date().toISOString();
        const newPitch = { ...pitch, id, createdAt: now, updatedAt: now };
        set((state) => ({
          savedPitches: [...state.savedPitches, newPitch],
          lastSavedAt: now,
        }));
        syncToCloud();
        // 🔒 FASE C.5: dual write — also push to pitch_campaigns table
        apiCreatePitch({
          id: newPitch.id,
          label_id: newPitch.labelId,
          label_name: newPitch.labelName,
          demo_id: newPitch.demoId,
          subject: newPitch.subject,
          body: newPitch.body,
          pitch_tracks: newPitch.pitchTracks,
          ep_link_mode: newPitch.epLinkMode,
          ep_soundcloud_url: newPitch.epSoundCloudUrl,
          status: "draft",
        }).catch(() => {/* silent */});
        return id;
      },
      updateSavedPitch: (id, updates) => {
        set((state) => ({
          savedPitches: state.savedPitches.map((p) =>
            p.id === id ? { ...p, ...updates, updatedAt: new Date().toISOString() } : p
          ),
          lastSavedAt: new Date().toISOString(),
        }));
        syncToCloud();
        // 🔒 FASE C.5: dual write — update pitch_campaigns table
        const updated = useAppStore.getState().savedPitches.find((p) => p.id === id);
        if (updated) {
          apiUpdatePitch(id, {
            label_id: updated.labelId,
            label_name: updated.labelName,
            demo_id: updated.demoId,
            subject: updated.subject,
            body: updated.body,
            pitch_tracks: updated.pitchTracks,
            ep_link_mode: updated.epLinkMode,
            ep_soundcloud_url: updated.epSoundCloudUrl,
          }).catch(() => {/* silent */});
        }
      },
      deleteSavedPitch: (id) => {
        set((state) => ({
          savedPitches: state.savedPitches.filter((p) => p.id !== id),
          lastSavedAt: new Date().toISOString(),
        }));
        syncToCloud();
        // 🔒 FASE C.5: dual write — delete from pitch_campaigns
        apiDeletePitch(id).catch(() => {/* silent */});
      },

      // ==================== SENT CAMPAIGNS (Inviati) ====================
      addSentCampaign: (campaign) => {
        const id = genId();
        const now = new Date().toISOString();
        const newCampaign = { ...campaign, id, sentAt: now };
        set((state) => ({
          sentCampaigns: [newCampaign, ...state.sentCampaigns],
          lastSavedAt: now,
        }));
        syncToCloud();
        // 🔒 FASE C.5: dual write — also push to pitch_campaigns with status=sent
        apiCreatePitch({
          id: newCampaign.id,
          label_id: newCampaign.labelId,
          label_name: newCampaign.labelName,
          demo_id: newCampaign.demoId,
          subject: newCampaign.subject,
          body: newCampaign.body,
          pitch_tracks: newCampaign.pitchTracks,
          ep_link_mode: newCampaign.epLinkMode,
          ep_soundcloud_url: newCampaign.epSoundCloudUrl,
          status: "sent",
          sent_at: now,
          sent_method: newCampaign.sentMethod,
        }).catch(() => {/* silent */});
        return id;
      },
      deleteSentCampaign: (id) => {
        set((state) => ({
          sentCampaigns: state.sentCampaigns.filter((c) => c.id !== id),
          lastSavedAt: new Date().toISOString(),
        }));
        syncToCloud();
        // 🔒 FASE C.5: dual write — delete from pitch_campaigns
        apiDeletePitch(id).catch(() => {/* silent */});
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

      // 🔒 Task B: Aggiungi risposta event-driven al demo
      addDemoResponse: (demoId, response) => {
        const respId = `resp_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
        const newResponse: DemoResponse = { ...response, id: respId };
        set((state) => ({
          demos: state.demos.map((d) => {
            if (d.id !== demoId) return d;
            const responses = [...(d.responses || []), newResponse];
            // 🔒 Calcola il nuovo status automaticamente
            const computedStatus = getDemoStatus({ ...d, responses });
            return { ...d, responses, status: computedStatus };
          }),
          lastSavedAt: new Date().toISOString(),
        }));
        syncToCloud();
      },

      // 🔒 Task B: Rimuovi una risposta dallo storico
      removeDemoResponse: (demoId, responseId) => {
        set((state) => ({
          demos: state.demos.map((d) => {
            if (d.id !== demoId) return d;
            const responses = (d.responses || []).filter((r) => r.id !== responseId);
            const computedStatus = getDemoStatus({ ...d, responses });
            return { ...d, responses, status: computedStatus };
          }),
          lastSavedAt: new Date().toISOString(),
        }));
        syncToCloud();
      },

      setActiveTab: (tab) => set({ activeTab: tab }),

      setSelectedArtistId: (id) => set({ selectedArtistId: id }),

      setSelectedLabelId: (id) => set({ selectedLabelId: id }),
      setNavigationReturnTo: (target) => set({ navigationReturnTo: target }),

      setArtists: (artists) => {
        set({ artists });
        // Persist to IndexedDB (fire-and-forget; non-blocking)
        if (typeof window !== "undefined") {
          saveArtistsToIDB(artists).catch((e) =>
            console.warn("[LabelPulse] Failed to persist artists to IndexedDB:", e)
          );
          // ⚠️ Also write to sidecar backup (labelpulse-artists-backup) for
          // emergency recovery. Best-effort — fails silently if quota exceeded.
          writeArtistsSidecar(artists);
          // ⚠️ Also push to cloud (separate row "<email>_artists") for cross-device sync
          import("./supabase").then(({ saveArtistsToCloud }) => {
            saveArtistsToCloud(artists).catch((e) =>
              console.warn("[LabelPulse] Failed to sync artists to cloud:", e)
            );
          }).catch(() => {});
        }
      },
      setLocale: (locale) => { set({ locale }); syncToCloud(); },
      setUserProfile: (profile) => {
        set((state) => ({ userProfile: { ...state.userProfile, ...profile }, lastSavedAt: new Date().toISOString() }));
        // ⚠️ Mark that the user just edited their profile locally. This
        // tells applyRemoteData (in supabase.ts) to preserve local profile
        // fields for the next 5 seconds, even if a realtime cloud update
        // arrives with a stale photoUrl/artistName/etc. Fixes the
        // "photo reverts to old one on iPhone" bug.
        try { markLocalProfileEdit(); } catch {}
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
        // 🔒 FASE C.7: dual write — also push to user_profiles table
        const current = useAppStore.getState().userProfile;
        if (current) {
          apiUpsertProfile({
            artist_name: current.artistName,
            bio: current.bio,
            photo_url: current.photoUrl,
            sc_link: current.scLink,
            links: current.links,
            cyanite_api_token: current.cyaniteApiToken,
            locale: useAppStore.getState().locale,
          }).catch(() => {/* silent */});
        }
      },

      getGenres: () => labelData.genres,

      setGmailAuth: (auth) => { set({ gmailAuth: auth }); syncToCloud(); },
      clearGmailAuth: () => { set({ gmailAuth: { isConnected: false, email: "", accessToken: "", expiresAt: 0 }, lastReplyScanAt: null, newRepliesCount: 0 }); syncToCloud(); },

      scanGmailReplies: async () => {
        const state = get();
        const { gmailAuth, demos, labels } = state;

        // Default empty result
        const emptyResult = {
          scanned: 0,
          newReplies: 0,
          errors: 0,
          details: [] as Array<{
            demoId: string;
            trackName: string;
            category: "ack" | "info" | "positive" | "rejected" | "none";
            from: string;
            date: string;
          }>,
        };

        if (!gmailAuth.isConnected || !gmailAuth.accessToken) {
          return emptyResult;
        }

        // Ensure token is still valid (best-effort refresh)
        let accessToken = gmailAuth.accessToken;
        try {
          // Lazy import to avoid SSR issues
          const { ensureValidToken } = await import("./gmail");
          const refreshed = await ensureValidToken(gmailAuth);
          if (refreshed) {
            accessToken = refreshed.accessToken;
            // Persist refreshed token
            set({ gmailAuth: refreshed });
          } else if (gmailAuth.expiresAt <= Date.now()) {
            // Token expired and silent refresh failed
            return { ...emptyResult, errors: 1 };
          }
        } catch (e) {
          console.warn("[scanGmailReplies] Token refresh failed:", e);
        }

        // Filter demos that are eligible for scanning:
        //   - status is sent, reviewing, accepted, or rejected (not ready)
        //   - has a sentDate
        //   - has at least one label email OR an original subject (search key)
        const eligibleDemos = demos.filter((d) => {
          if (d.status === "ready") return false;
          if (!d.sentDate) return false;
          // Skip demos that already have a positive/rejected reply —
          // we don't want to overwrite a confirmed outcome
          if (d.replyStatus === "positive" || d.replyStatus === "rejected") {
            // BUT allow re-scan if reply is older than 24h and demo status is
            // still "reviewing" (label might have updated their stance)
            if (d.status !== "reviewing") return false;
            if (d.replyDate) {
              const replyAge = Date.now() - new Date(d.replyDate).getTime();
              if (replyAge < 24 * 60 * 60 * 1000) return false;
            }
          }
          return true;
        });

        if (eligibleDemos.length === 0) {
          set({ lastReplyScanAt: new Date().toISOString(), newRepliesCount: 0 });
          return emptyResult;
        }

        // Build scan inputs
        const scanInputs = eligibleDemos.map((d) => {
          const label = labels.find((l) => l.id === d.labelId);
          const labelEmails = label?.emails?.filter((e) => e && e.includes("@")) || [];
          // Try to extract original subject from pitch text (first line often
          // contains "Subject: ..." in our generated pitches, or use the
          // track name as a fallback search key)
          const originalSubject = d.pitchText
            ? (d.pitchText.match(/^Subject:\s*(.+)$/m)?.[1] || undefined)
            : undefined;

          return {
            demoId: d.id,
            labelEmails,
            sentDate: d.sentDate!,
            originalSubject: originalSubject || `Demo: ${d.trackName}`,
            sinceDate: state.lastReplyScanAt || undefined,
          };
        });

        // Run scan
        const { scanRepliesForDemos } = await import("./gmail");
        const { classifyReply } = await import("./reply-classifier");

        const results = await scanRepliesForDemos(accessToken, scanInputs);

        // Process results
        const details: Array<{
          demoId: string;
          trackName: string;
          category: "ack" | "info" | "positive" | "rejected" | "none";
          from: string;
          date: string;
        }> = [];
        let newReplies = 0;
        let errors = 0;

        for (const result of results) {
          if (result.error) {
            errors++;
            continue;
          }
          if (!result.found || !result.latestReply) continue;

          const demo = eligibleDemos.find((d) => d.id === result.demoId);
          if (!demo) continue;

          const reply = result.latestReply;
          const classification = classifyReply(reply.subject, reply.bodyText);

          // Only count as "new" if the reply date is newer than what we have,
          // OR we didn't have a reply before
          const previousReplyDate = demo.replyDate
            ? new Date(demo.replyDate).getTime()
            : 0;
          const thisReplyDate = new Date(reply.date).getTime();

          if (thisReplyDate <= previousReplyDate && demo.replyStatus !== "none" && demo.replyStatus !== undefined) {
            // Already saw this reply or a newer one — skip
            continue;
          }

          // Update the demo with the classified reply
          const updates: Partial<Demo> = {
            replyStatus: classification.category,
            replyText: reply.bodyText.slice(0, 4000), // cap to keep localStorage manageable
            replyDate: reply.date,
            replySender: reply.from,
            // Save Gmail thread + message IDs so the user can reply in-thread
            gmailThreadId: reply.threadId,
            gmailReplyMessageId: reply.messageId,
          };

          // Auto-advance status based on classification:
          //  - positive → reviewing (label expressed interest, user should follow up)
          //  - rejected → rejected (label said no, close the loop)
          //  - ack / info / none → leave status as-is
          if (classification.category === "positive" && demo.status === "sent") {
            updates.status = "reviewing";
          } else if (classification.category === "rejected") {
            updates.status = "rejected";
          }

          // Update follow-up due date — 28 days from reply date if info/positive
          if (classification.category === "info" || classification.category === "positive") {
            const followUpDate = new Date(reply.date);
            followUpDate.setDate(followUpDate.getDate() + 28);
            updates.followUpDueDate = followUpDate.toISOString();
          }

          // NLP Track-Matching & Track-by-Track status initialization
          let matchedTrackNames: string[] = [];
          if ((classification.category === "positive" || classification.category === "info") && Array.isArray(demo.pitchTracks) && demo.pitchTracks.length >= 2) {
            const emailContent = `${reply.subject} ${reply.bodyText}`.toLowerCase();
            matchedTrackNames = demo.pitchTracks
              .filter((track) => {
                const name = track.trackName.toLowerCase().trim();
                if (name.length < 3) return false;
                return emailContent.includes(name);
              })
              .map((track) => track.trackName);

            if (matchedTrackNames.length > 0) {
              updates.nlpMatchedTracks = matchedTrackNames;
              updates.pitchTracks = demo.pitchTracks.map((track) => {
                if (matchedTrackNames.includes(track.trackName)) {
                  return { ...track, status: "reviewing" as const };
                }
                return { ...track, status: track.status || "awaiting" as const };
              });
            } else {
              // Se non troviamo match specifici ma l'email è positiva, impostiamo tutte a reviewing se non già impostato
              updates.pitchTracks = demo.pitchTracks.map((track) => ({
                ...track,
                status: track.status || "reviewing" as const
              }));
            }
          } else if (Array.isArray(demo.pitchTracks) && demo.pitchTracks.length >= 2) {
            // Se la risposta è negativa (rejected), aggiorna tutte le tracce a rejected
            if (classification.category === "rejected") {
              updates.pitchTracks = demo.pitchTracks.map((track) => ({
                ...track,
                status: "rejected" as const
              }));
            }
          }

          // Segnala che c'è una nuova risposta da leggere per visualizzare l'effetto "Pulse"
          updates.gmailUnreadResponse = true;

          get().updateDemo(result.demoId, updates);

          details.push({
            demoId: result.demoId,
            trackName: demo.trackName,
            category: classification.category,
            from: reply.from,
            date: reply.date,
          });
          newReplies++;
        }

        const now = new Date().toISOString();
        set({ lastReplyScanAt: now, newRepliesCount: newReplies });

        return {
          scanned: eligibleDemos.length,
          newReplies,
          errors,
          details,
        };
      },

      setRankingsUpdatedAt: (date) => {
        set({ rankingsUpdatedAt: date });
        syncToCloud();
        // 🔒 FASE D FIX: pusha le classifiche direttamente al cloud (no localStorage)
        pushRankingsToCloud();
      },

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
        // 🔒 FASE D FIX: pusha le classifiche direttamente al cloud (no localStorage)
        pushRankingsToCloud();
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
            releases: state.releases,
            savedPitches: state.savedPitches,
            sentCampaigns: state.sentCampaigns,
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
              // ⚠️ CRITICAL FIX (bug 2026-06-23):
              // Default isCustom to FALSE (not true). The previous default
              // (`imported.isCustom ?? true`) caused every freshly-imported
              // Beatport label that was NEW to the user's local state to be
              // marked isCustom=true — even though it came straight from the
              // Beatport scraper via RankingsWizard, which never sets
              // isCustom. This produced hundreds of ghost "custom" labels
              // with no user data attached (notes/emails/links all empty),
              // bloating the personal cloud row.
              //
              // The correct default for labels arriving via importData()
              // is FALSE (Beatport-sourced). True custom labels (added
              // manually via "Add label" UI) explicitly set isCustom=true
              // before calling their own add path, so they're unaffected.
              isCustom: imported.isCustom ?? false,
              genres: imported.genres || [],
              rankByGenre: imported.rankByGenre || {},
              pointsByGenre: imported.pointsByGenre || {},
              trending: imported.trending || false,
              trendingRankByGenre: imported.trendingRankByGenre || {},
              trendingPointsByGenre: imported.trendingPointsByGenre || {},
              // Beatport identity — capture on first import (used for logos)
              beatportId: imported.beatportId ?? null,
              slug: imported.slug || "",
              imageUrl: imported.imageUrl || "",
              emails: imported.emails || [],
              website: imported.website || "",
              demoLink: imported.demoLink || "",
              socialLink: imported.socialLink || "",
              soundcloudLink: imported.soundcloudLink || "",
              contactInfo: imported.contactInfo || "",
              notes: imported.notes || "",
              status: (imported.status === "open" || imported.status === "closed" || imported.status === "unknown") ? imported.status : "unknown",
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
            // ⚠️ Also write sidecar backup for emergency recovery
            writeArtistsSidecar(mergedArtists);
            // ⚠️ Also push artists to cloud (separate row "<email>_artists")
            // so the user can access them on other devices. Non-blocking.
            import("./supabase").then(({ saveArtistsToCloud }) => {
              saveArtistsToCloud(mergedArtists!).catch((e) =>
                console.warn("[LabelPulse Import] Failed to sync artists to cloud:", e)
              );
            }).catch(() => {});
          }

          return true;
        } catch {
          return false;
        }
      },
    }),
    {
      name: PRIMARY_KEY,
      version: 19,  // 🔒 FASE D: bump 18→19 per rimuovere labels dal localStorage (causava QuotaExceededError)
      storage: createJSONStorage(() => idbStorage), // 🔒 Task 3: IndexedDB invece di localStorage
      migrate: (persisted: any, version: number) => {
        // 🔒 FASE D FIX v19: rimuovi labels dal persisted state (occupavano 4MB+ inutilmente)
        if (version < 19 && persisted && persisted.labels) {
          console.log("[LabelPulse] Migrating v18→v19: removing labels from localStorage (was causing QuotaExceededError)");
          delete persisted.labels;
        }
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
        if (version < 12) {
          // Gmail reply tracker fields
          if (persisted.lastReplyScanAt === undefined) {
            persisted.lastReplyScanAt = null;
          }
          if (persisted.newRepliesCount === undefined) {
            persisted.newRepliesCount = 0;
          }
          // Ensure all demos have reply fields initialized
          if (Array.isArray(persisted.demos)) {
            persisted.demos = persisted.demos.map((d: any) => ({
              ...d,
              replyStatus: d.replyStatus ?? "none",
              replyText: d.replyText ?? "",
              replyDate: d.replyDate ?? null,
              replySender: d.replySender ?? "",
              followUpDueDate: d.followUpDueDate ?? null,
              gmailThreadId: d.gmailThreadId ?? undefined,
              gmailReplyMessageId: d.gmailReplyMessageId ?? undefined,
              materialSentDate: d.materialSentDate ?? null,
              materialSentLinks: Array.isArray(d.materialSentLinks) ? d.materialSentLinks : [],
            }));
          }
        }
        if (version < 13) {
          // Releases (EP/single grouping) + Demo.artists / parentReleaseId
          if (!Array.isArray(persisted.releases)) {
            persisted.releases = [];
          }
          // Backfill artists[] from legacy artistName on existing demos
          if (Array.isArray(persisted.demos)) {
            persisted.demos = persisted.demos.map((d: any) => ({
              ...d,
              artists: Array.isArray(d.artists) && d.artists.length > 0
                ? d.artists
                : (d.artistName ? [d.artistName] : []),
              parentReleaseId: d.parentReleaseId ?? null,
            }));
          }
        }
        if (version < 14) {
          // Web Push notification preferences (defaults: master OFF, all categories ON)
          if (persisted.userProfile && !persisted.userProfile.notifications) {
            persisted.userProfile.notifications = {
              master: false,
              followUp: true,
              rankings: true,
              weeklyRecap: true,
            };
          }
        }
        if (version < 15) {
          // Label Beatport identity (logo / slug / beatportId) — added for the
          // "logos on label cards" feature. Existing persisted labels don't
          // have these fields; backfill with empty defaults so the UI can
          // fall back to the initials avatar.
          if (Array.isArray(persisted.labels)) {
            persisted.labels = persisted.labels.map((l: any) => ({
              ...l,
              beatportId: l.beatportId ?? null,
              slug: l.slug ?? "",
              imageUrl: l.imageUrl ?? "",
            }));
          }
        }
        if (version < 16) {
          // Label status default: previously every seed label defaulted to
          // "open", which made the dashboard show a misleading "1976 accettano
          // demo" number. Beatport doesn't expose demo-submission policy, so
          // we can't claim a label is "open" without user confirmation.
          //
          // Migration: for every label that has NO user-edited fields
          // (no emails, no notes, no links, no manual status change), reset
          // status from "open" to "unknown". Labels the user has interacted
          // with are left alone — if the user set status to "open" or "closed"
          // explicitly, we trust that. The heuristic is: if a label has any
          // personal data, the user has touched it and we keep its status.
          // Otherwise, it's a seed label that the user never confirmed →
          // "unknown".
          if (Array.isArray(persisted.labels)) {
            persisted.labels = persisted.labels.map((l: any) => {
              if (!l || typeof l !== "object") return l;
              // Only touch labels that are currently "open" — leave "closed"
              // alone (the user explicitly closed them).
              if (l.status !== "open") return l;

              const hasNotes = typeof l.notes === "string" && l.notes.trim() !== "";
              const hasEmails = Array.isArray(l.emails) ? l.emails.length > 0 : (!!l.emails && String(l.emails).trim() !== "");
              const hasWebsite = typeof l.website === "string" && l.website.trim() !== "";
              const hasDemoLink = typeof l.demoLink === "string" && l.demoLink.trim() !== "";
              const hasSocialLink = typeof l.socialLink === "string" && l.socialLink.trim() !== "";
              const hasSoundcloudLink = typeof l.soundcloudLink === "string" && l.soundcloudLink.trim() !== "";
              const hasCustomLinks = Array.isArray(l.customLinks) ? l.customLinks.length > 0 : false;
              const hasUserEdits = hasNotes || hasEmails || hasWebsite || hasDemoLink ||
                hasSocialLink || hasSoundcloudLink || hasCustomLinks;

              // If the user has never touched this label, it inherited the
              // old "open" default — reset to "unknown".
              if (!hasUserEdits) {
                return { ...l, status: "unknown" };
              }
              // Otherwise keep "open" — the user has interacted with it,
              // so the status is more likely a real user choice.
              return l;
            });
          }
        }
        if (version < 17) {
          // Release.epSoundCloudUrl — optional single SoundCloud URL for an EP
          // (album/private set). Existing releases don't have this field;
          // backfill with "" so the field exists on every Release. Pitches
          // that include a whole EP check this field: if non-empty, they use
          // it as the single EP link; otherwise they fall back to listing
          // each track's individual SC link.
          if (Array.isArray(persisted.releases)) {
            persisted.releases = persisted.releases.map((r: any) => {
              if (!r || typeof r !== "object") return r;
              return {
                ...r,
                epSoundCloudUrl:
                  typeof r.epSoundCloudUrl === "string" ? r.epSoundCloudUrl : "",
              };
            });
          }
        }
        if (version < 18) {
          // Demo.pitchTracks — structured multi-track pitch info (trackName
          // + artistName + scLink per track). Existing demos don't have it;
          // backfill with empty array so the field always exists. The demo
          // detail dialog will fall back to parsing pitchText for demos that
          // actually contain a multi-track pitch but lack the structured data.
          if (Array.isArray(persisted.demos)) {
            persisted.demos = persisted.demos.map((d: any) => {
              if (!d || typeof d !== "object") return d;
              return {
                ...d,
                pitchTracks: Array.isArray(d.pitchTracks) ? d.pitchTracks : [],
              };
            });
          }
        }
        return persisted;
      },
      partialize: (state) => ({
        // 🔒 FASE D FIX: NON salvare più labels nel localStorage — occupava 4MB+ e causava QuotaExceededError
        // Le labels vengono dal cloud (riga global) + seed (labels-data.json) ad ogni boot
        // labels: state.labels,  ← RIMOSSO
        demos: state.demos,
        releases: state.releases,
        savedPitches: state.savedPitches,
        sentCampaigns: state.sentCampaigns,
        activeTab: state.activeTab,
        locale: state.locale,
        userProfile: state.userProfile,
        gmailAuth: state.gmailAuth,
        lastReplyScanAt: state.lastReplyScanAt,
        newRepliesCount: state.newRepliesCount,
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
          // 🔒 DEDUPLICAZIONE FORZATA al boot — pulisce IndexedDB avvelenato
          if (Array.isArray(state.labels) && state.labels.length > 0) {
            const before = state.labels.length;
            const deduped = Array.from(
              new Map(state.labels.map((l: any) => [l.id, l])).values()
            );
            if (deduped.length < before) {
              console.warn(`[LabelPulse Storage] ⚠️ Deduplication: ${before} → ${deduped.length} labels (rimossi ${before - deduped.length} duplicati)`);
              state.labels = deduped;
            }
          }

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
/**
 * 🔒 Task B: Calcola lo stato del demo dall'array di risposte (event-driven).
 *
 * Logica:
 * - Se esiste almeno una risposta 'accepted' → "accepted"
 * - Se esiste almeno una risposta 'rejected' → "rejected"
 * - Se esiste almeno una risposta 'feedback' → "reviewing"
 * - Se esiste almeno una risposta 'pending' → "reviewing"
 * - Se non ci sono risposte ma il demo ha una sentDate → "sent"
 * - Altrimenti → "ready"
 *
 * Migration automatica: se responses è undefined/vuoto ma il demo ha
 * uno status legacy (sent, reviewing, accepted, rejected), viene creato
 * automaticamente il primo record nell'array responses.
 */
export function getDemoStatus(demo: Pick<Demo, "status" | "sentDate" | "responses">): DemoStatus {
  const responses = demo.responses || [];

  // Se ci sono risposte, calcola dal più recente
  if (responses.length > 0) {
    // Ordina per data descendente (più recente prima)
    const sorted = [...responses].sort(
      (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
    );
    const latest = sorted[0];
    if (latest.type === "accepted") return "accepted";
    if (latest.type === "rejected") return "rejected";
    if (latest.type === "feedback" || latest.type === "pending") return "reviewing";
  }

  // Migration: se non ci sono responses ma c'è uno status legacy
  if (responses.length === 0 && demo.status) {
    if (demo.status === "accepted" || demo.status === "rejected" || demo.status === "reviewing") {
      return demo.status; // Mantieni lo status legacy finché non vengono aggiunte responses
    }
  }

  // Nessuna risposta → basato su sentDate
  if (demo.sentDate) return "sent";
  return "ready";
}

/**
 * 🔒 Task B: Migra il campo status legacy in array responses.
 * Chiamata quando si apre il dettaglio di un demo che ha status ma non responses.
 * Ritorna l'array responses da salvare.
 */
export function migrateStatusToResponses(demo: Demo): DemoResponse[] {
  if (demo.responses && demo.responses.length > 0) return demo.responses;
  if (!demo.status || demo.status === "ready" || demo.status === "sent") return [];

  const typeMap: Record<string, DemoResponseType> = {
    reviewing: "feedback",
    accepted: "accepted",
    rejected: "rejected",
  };

  const type = typeMap[demo.status];
  if (!type) return [];

  return [{
    id: `resp_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    date: demo.sentDate || new Date().toISOString(),
    type,
    note: "Migrato dallo stato precedente",
  }];
}

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
/**
 * 🔒 FASE D FIX: Disable old app_state sync to prevent statement timeout.
 *
 * Il vecchio sistema app_state salva un blob JSONB enorme (con 2000+ labels).
 * Supabase free tier ha statement timeout di 8s → POST fallisce con 500.
 *
 * Ora che abbiamo le nuove tabelle dedicate (demo_submissions, etc.),
 * il vecchio sync non serve più. Lo disabilitiamo per:
 * 1. Evitare i timeout 500
 * 2. Ridurre il carico su Supabase
 * 3. Preparare la rimozione definitiva del vecchio sistema
 *
 * Le nuove tabelle vengono ancora scritte dal dual write nelle azioni
 * (addDemo, updateLabel, etc.) — quello non viene toccato.
 *
 * 🔒 BUG FIX (classifiche): saveGlobalRowIfAdmin() permette ancora all'admin
 * di pushare le classifiche aggiornate al cloud (riga 'global').
 */
export const OLD_APP_STATE_SYNC_DISABLED = true;
const DISABLE_OLD_APP_STATE_SYNC = OLD_APP_STATE_SYNC_DISABLED;

/**
 * 🔒 FASE D FIX: Permette all'admin di salvare SOLO la riga globale (classifiche).
 * Non salva la riga personale (causa timeout + ormai nelle nuove tabelle).
 */
export async function saveGlobalRowIfAdmin(): Promise<boolean> {
  if (!isSupabaseConfigured()) return false;
  if (isApplyingRemoteUpdate()) return false;

  // Verifica se l'utente corrente è admin
  try {
    const { isCurrentUserAdmin } = await import("./supabase");
    if (!isCurrentUserAdmin()) {
      return false;
    }
  } catch {
    return false;
  }

  try {
    const { saveGlobalRowOnly } = await import("./supabase");
    const state = useAppStore.getState();
    const ok = await saveGlobalRowOnly({
      labels: state.labels,
      rankingSnapshots: state.rankingSnapshots,
      rankingsUpdatedAt: state.rankingsUpdatedAt,
    });
    return ok;
  } catch (err) {
    console.error("[LabelPulse Cloud] saveGlobalRowIfAdmin failed:", err);
    return false;
  }
}

export function syncToCloud(): void {
  if (!isSupabaseConfigured()) return;
  // Skip if we're applying a remote update (avoids feedback loop)
  if (isApplyingRemoteUpdate()) return;
  // 🔒 FASE D: skip old app_state sync — causes statement timeout
  if (DISABLE_OLD_APP_STATE_SYNC) return;

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
    // 🔒 FASE B FIX: include ALL personal data — previously savedPitches and
    // sentCampaigns were MISSING, causing pitch drafts and sent campaigns to
    // never reach the cloud (only stayed in localStorage).
    const dataToSync = {
      labels: state.labels,
      demos: state.demos,
      releases: state.releases,
      savedPitches: state.savedPitches,
      sentCampaigns: state.sentCampaigns,
      activeTab: state.activeTab,
      locale: state.locale,
      userProfile: state.userProfile,
      gmailAuth: state.gmailAuth,
      lastReplyScanAt: state.lastReplyScanAt,
      newRepliesCount: state.newRepliesCount,
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
  // 🔒 FASE D: skip old app_state sync — causes statement timeout
  if (DISABLE_OLD_APP_STATE_SYNC) return;

  if (_cloudSyncTimer) {
    clearTimeout(_cloudSyncTimer);
    _cloudSyncTimer = null;
  }

  const state = useAppStore.getState();
  const lastSavedAt = new Date().toISOString();
  useAppStore.setState({ lastSavedAt });
  // 🔒 FASE B FIX: include ALL personal data — same as syncToCloud above
  const dataToSync = {
    labels: state.labels,
    demos: state.demos,
    releases: state.releases,
    savedPitches: state.savedPitches,
    sentCampaigns: state.sentCampaigns,
    activeTab: state.activeTab,
    locale: state.locale,
    userProfile: state.userProfile,
    gmailAuth: state.gmailAuth,
    lastReplyScanAt: state.lastReplyScanAt,
    newRepliesCount: state.newRepliesCount,
    rankingsUpdatedAt: state.rankingsUpdatedAt,
    lastSavedAt,
    rankingSnapshots: state.rankingSnapshots,
  };
  await saveStateToCloud(dataToSync);
}

// ==================== QUOTA EXCEEDED — IMMEDIATE CLOUD SYNC ====================
// 🔒 FASE A FIX: When localStorage is full and we can't save locally, immediately
// push to cloud so the user doesn't lose data. The state is still in memory (Zustand
// store), we just need to bypass the 3-second debounce and save NOW.
//
// 🔒 EMERGENCY FIX (iPhone crash): limitiamo il numero di tentativi per evitare
// loop infiniti che mandano in crash il browser (specialmente su iPhone con poca RAM).
let _quotaExceededAttempts = 0;
const MAX_QUOTA_EXCEEDED_ATTEMPTS = 5;

if (typeof window !== "undefined") {
  window.addEventListener("labelpulse:storage-quota-exceeded", () => {
    _quotaExceededAttempts++;
    if (_quotaExceededAttempts > MAX_QUOTA_EXCEEDED_ATTEMPTS) {
      console.error("[LabelPulse Storage] Quota exceeded loop detected — EMERGENCY CLEAR + STOP to prevent crash.");
      // 🔒 EMERGENCY: svuota localStorage per fermare il loop e prevenire crash
      try {
        emergencyClearLocalStorage();
      } catch (err) {
        console.error("[LabelPulse Storage] Emergency clear failed:", err);
      }
      return;
    }
    console.warn(`[LabelPulse Storage] Quota exceeded — forcing cloud sync (attempt ${_quotaExceededAttempts}/${MAX_QUOTA_EXCEEDED_ATTEMPTS})`);
    // forceCloudSync is defined above and in scope via hoisting
    forceCloudSync().catch((err) => {
      console.error("[LabelPulse Storage] Emergency cloud sync failed:", err);
    });
  });
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

  // 🔒 FASE D: skip old app_state load — causes statement timeout
  // Le nuove tabelle dedicate vengono caricate da loadFromNewTables()
  if (DISABLE_OLD_APP_STATE_SYNC) {
    console.log("[LabelPulse Cloud] Old app_state sync disabled (FASE D) — loading only global rankings");
    useAppStore.setState({ hasCloudSynced: true });

    // 🔒 FASE D FIX: carica SOLO la riga globale (classifiche + artisti)
    // NON la riga personale (che ora è nelle nuove tabelle dedicate)
    try {
      const { loadGlobalRowOnly } = await import("./supabase");
      const globalData = await loadGlobalRowOnly();
      if (globalData) {
        console.log("[LabelPulse Cloud] Global rankings loaded:", {
          labels: globalData.labels?.length || 0,
          snaps: globalData.rankingSnapshots?.length || 0,
          updatedAt: globalData.rankingsUpdatedAt,
        });
        // 🔒 FIX: UPSERT conservativo — mantieni tutte le label locali,
        // aggiorna quelle esistenti con i dati cloud, aggiungi le nuove.
        // Non droppare MAI una label acquisita, anche se esce dalla classifica.
        const globalLabels = globalData.labels || [];
        const localById = new Map(currentState.labels.map((l: any) => [l.id, l]));

        // Step 1: Aggiorna le label cloud preservando i campi personali dal locale
        const updatedFromCloud = globalLabels.map((cl: any) => {
          const localLabel = localById.get(cl.id);
          if (localLabel) {
            return {
              ...cl, // TUTTI i campi Beatport dal cloud (REPLACE)
              emails: localLabel.emails || [],
              notes: localLabel.notes || "",
              status: localLabel.status || "unknown",
              website: localLabel.website || "",
              demoLink: localLabel.demoLink || "",
              socialLink: localLabel.socialLink || "",
              soundcloudLink: localLabel.soundcloudLink || "",
              beatportLink: localLabel.beatportLink || "",
              contactInfo: localLabel.contactInfo || "",
              customLinks: localLabel.customLinks || [],
              isCustom: localLabel.isCustom || false,
              isFavorite: localLabel.isFavorite || false,
            };
          }
          return cl;
        });

        // Step 2: Aggiungi le label locali che NON sono nel cloud (preservazione storico)
        const cloudIds = new Set(globalLabels.map((l: any) => l.id));
        const localOnlyLabels = currentState.labels.filter(
          (l: any) => !cloudIds.has(l.id)
        );

        // Step 3: Combina + deduplica per ID (cloud wins su conflitti)
        const combined = [...updatedFromCloud, ...localOnlyLabels];
        const dedupedLabels = Array.from(
          new Map(combined.map((l: any) => [l.id, l])).values()
        );

        useAppStore.setState({
          labels: dedupedLabels,
          rankingSnapshots: globalData.rankingSnapshots || [],
          rankingsUpdatedAt: globalData.rankingsUpdatedAt || null,
        });
        console.log("[LabelPulse Cloud] UPSERT+DEDUP: cloud=" + globalLabels.length + " + local_only=" + localOnlyLabels.length + " → total=" + dedupedLabels.length);
      }
    } catch (err) {
      console.warn("[LabelPulse Cloud] Global row load failed:", err);
    }

    // 🔒 FIX: imposta lo status del cloud a "synced" così l'icona smette di girare
    try {
      const { setStatus } = await import("./supabase");
      setStatus("synced");
    } catch (err) {
      console.warn("[LabelPulse Cloud] Failed to set status to synced:", err);
    }
    // Setup realtime subscription for future updates from other devices
    setupRealtimeSubscriptionSafe();
    return;
  }

  try {
    const cloudData = await loadStateFromCloud();
    if (!cloudData) {
      // Nessun dato nel cloud.
      // Prima di decidere se caricare il locale, proviamo a ripristinare il
      // profilo e gli snapshot dal sidecar di emergenza. Questo protegge gli
      // utenti che hanno perso il main store ma hanno ancora il backup locale.
      const profileRestored = restoreProfileFromSidecar();
      const snapsRestored = restoreSnapshotsFromSidecar();
      if (profileRestored || snapsRestored > 0) {
        console.info(
          `[LabelPulse Cloud] Restored from sidecar before initial sync: profile=${profileRestored ? "yes" : "no"}, snaps=${snapsRestored}`
        );
      }

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

    // ⚠️ CRITICAL FIX (data-loss bug 2026-06-22, post-login "no charts" v2):
    // PREVIOUSLY: only merged when cloud brought data the local didn't have
    // AT THE COUNT LEVEL (e.g., cloudBringsNewLabels = cloudHasLabels && !localHasLabels).
    // This was BRITTLE: if local had 1192 seed labels (with EMPTY rankByGenre)
    // and cloud had 100 labels (with POPULATED rankByGenre), localHasLabels=true,
    // cloudBringsNewLabels=false → NO MERGE → user sees "no charts" because
    // none of their labels have rankByGenre populated.
    //
    // FIX: ALWAYS run the content-aware merge if cloud has any data at all.
    // The mergeCloudData function is designed to be safe — it unions arrays
    // by id and per-genre merges Beatport data fields (local wins on conflict,
    // cloud's data preserved for genres local doesn't have). So running it
    // unconditionally is the correct behavior: it can only ADD data, never
    // remove it.
    //
    // The only time we SKIP the merge is when cloud has literally nothing
    // useful to contribute (no profile, no labels, no snapshots, no demos,
    // and not newer by timestamp) — in that case local stays as-is.
    const cloudBringsNewProfile = cloudProfileHasData && !localProfileHasData;
    const cloudHasAnyContent = cloudHasLabels || cloudHasSnapshots || cloudHasDemos || cloudProfileHasData;
    const cloudIsNewerByTimestamp = cloudSavedAt > localSavedAt;
    const shouldMergeFromCloud =
      cloudBringsNewProfile ||
      cloudHasAnyContent ||
      cloudIsNewerByTimestamp;

    if (shouldMergeFromCloud) {
      // I dati cloud sono più recenti O hanno contenuti che il locale non ha — mergia
      console.log(
        `[LabelPulse Cloud] Merging from cloud. Reasons: ` +
        `cloudBringsNewProfile=${cloudBringsNewProfile}, ` +
        `cloudHasAnyContent=${cloudHasAnyContent}, ` +
        `cloudIsNewerByTimestamp=${cloudIsNewerByTimestamp} ` +
        `(cloud: ${cloud.lastSavedAt}, local: ${localState.lastSavedAt}). ` +
        `cloud: labels=${cloud.labels?.length || 0}, snaps=${cloud.rankingSnapshots?.length || 0}, demos=${cloud.demos?.length || 0}. ` +
        `local: labels=${localState.labels?.length || 0}, snaps=${localState.rankingSnapshots?.length || 0}, demos=${localState.demos?.length || 0}.`
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
          "[LabelPulse Cloud] CLOUD DATA LOSS DETECTED — cloud has empty arrays where local has data. Still running merge (safe: mergeCloudData unions by id, never replaces), but local data will dominate. Will also push merged result back to cloud."
        );
        // Note: we no longer skip the merge. The merge function is content-aware
        // (unions by id, local wins on conflict), so it's safe to run even when
        // cloud has empty arrays. We then push the merged result (which has
        // local's data) back to cloud to repopulate it.
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

      // ⚠️ CRITICAL FIX (post-login "no profile / no charts" bug 2026-06-22):
      // Immediately re-restore profile and snapshots from sidecar backups.
      // The cloud merge above should preserve local data (mergeProfiles keeps
      // non-empty local fields, mergeSnapshots unions by id), but in edge
      // cases (cloud row partially corrupt, schema drift, an older app
      // version that wrote a bad row) the merged result can still end up
      // missing the profile or snapshots that the user definitely had.
      // The sidecar backups (labelpulse-profile-backup, labelpulse-snapshots-backup)
      // are the user's safety net — splice them back in immediately if the
      // live store is now empty but the sidecar has data. This runs on the
      // next tick so setState has committed first.
      setTimeout(() => {
        try {
          const profileRestored = restoreProfileFromSidecar();
          const snapsRestored = restoreSnapshotsFromSidecar();
          if (profileRestored || snapsRestored > 0) {
            console.info(
              `[LabelPulse Cloud] Post-merge sidecar restore: profile=${profileRestored ? "OK" : "niente"}, snaps=${snapsRestored} recuperati.`
            );
          }
        } catch (e) {
          console.warn("[LabelPulse Cloud] Post-merge sidecar restore failed:", e);
        }
      }, 0);
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
 * 🔒 FASE C.6 — Load data from new dedicated tables
 *
 * Called after loadFromCloud() to fetch data from the new tables:
 * demo_submissions, label_personal_data, pitch_campaigns, user_profiles.
 *
 * Strategy: merge with existing state (don't overwrite if local has more recent).
 * If new tables have data that local doesn't, use new tables (they're the source of truth).
 *
 * This is what makes cross-device work: PC lavoro scrive su /api/demos,
 * PC casa fa login → loadFromNewTables() → fetch /api/demos → vede i demo.
 */
export async function loadFromNewTables(): Promise<void> {
  if (typeof window === "undefined") return;

  try {
    // Carica tutti i dati in parallelo dal cloud (incluse le release)
    const [demosRes, labelsRes, pitchesRes, profileRes, releasesRes] = await Promise.all([
      fetch("/api/demos").catch(() => null),
      fetch("/api/label-data").catch(() => null),
      fetch("/api/pitches").catch(() => null),
      fetch("/api/profile").catch(() => null),
      fetch("/api/releases").catch(() => null),
    ]);

    const state = useAppStore.getState();

    // 1. Demos — Il server è la fonte assoluta di verità.
    // Sovrascriviamo lo stato locale con i dati del server.
    if (demosRes?.ok) {
      const data = await demosRes.json();
      const apiDemos = data.demos || [];
      console.log(`[FASE C.6] Loaded ${apiDemos.length} demos from new table`);
      
      const mappedDemos = apiDemos.map((ad: any) => ({
        id: ad.id,
        labelId: ad.label_id,
        trackName: ad.track_name,
        artistName: ad.artist_name || "",
        link: ad.link || "",
        status: ad.status || "ready",
        sentDate: ad.sent_date,
        pitchText: ad.pitch_text,
        pitchSubject: ad.pitch_subject,
        pitchTracks: ad.pitch_tracks || [],
        notes: ad.notes,
        parentReleaseId: ad.parent_release_id,
        createdAt: ad.created_at,
      }));
      useAppStore.setState({ demos: mappedDemos });
    }

    // 2. Label personal data — Il server è la fonte assoluta di verità per i dati personali.
    // Prima, resettiamo tutti i campi personali delle label esistenti ai valori di default.
    if (labelsRes?.ok) {
      const data = await labelsRes.json();
      const apiLabels = data.labels || [];
      console.log(`[FASE C.6] Loaded ${apiLabels.length} label personal data from new table`);
      
      // Filtriamo via le vecchie label custom (le ricostruiremo dall'API se sono ancora attive)
      const cleanSeedLabels = state.labels
        .filter((l: any) => !l.isCustom)
        .map((l: any) => ({
          ...l,
          emails: [],
          notes: "",
          status: "unknown",
          website: "",
          demoLink: "",
          socialLink: "",
          soundcloudLink: "",
          contactInfo: "",
        }));

      const labelMap = new Map(cleanSeedLabels.map((l: any) => [l.id, l]));
      const customLabels: any[] = [];

      for (const al of apiLabels) {
        if (al.is_custom) {
          customLabels.push({
            id: al.label_id,
            name: al.custom_name || "Unknown",
            genre: al.custom_genre || "",
            status: al.status || "unknown",
            emails: al.emails || [],
            notes: al.notes || "",
            website: al.website || "",
            demoLink: al.demo_link || "",
            socialLink: al.social_link || "",
            soundcloudLink: al.soundcloud_link || "",
            contactInfo: al.contact_info || "",
            isCustom: true,
            submissionType: "email",
            createdAt: al.created_at,
            genres: [],
            rankByGenre: {},
            pointsByGenre: {},
            trending: false,
            trendingRankByGenre: {},
            trendingPointsByGenre: {},
          });
        } else {
          // Applica i dati personali alla label seed corrispondente
          const existing = labelMap.get(al.label_id);
          if (existing) {
            if (al.emails) existing.emails = al.emails;
            if (al.notes) existing.notes = al.notes;
            if (al.status) existing.status = al.status;
            if (al.website) existing.website = al.website;
            if (al.demo_link) existing.demoLink = al.demo_link;
            if (al.social_link) existing.socialLink = al.social_link;
            if (al.soundcloud_link) existing.soundcloudLink = al.soundcloud_link;
            if (al.contact_info) existing.contactInfo = al.contact_info;
            if (al.is_favorite !== undefined) existing.isFavorite = al.is_favorite;
          }
        }
      }

      useAppStore.setState({
        labels: [...Array.from(labelMap.values()), ...customLabels],
      });
    }

    // 3. Pitches — Il server è la fonte assoluta di verità per bozze e campagne inviate.
    if (pitchesRes?.ok) {
      const data = await pitchesRes.json();
      const apiPitches = data.pitches || [];
      console.log(`[FASE C.6] Loaded ${apiPitches.length} pitches from new table`);
      
      const drafts: any[] = [];
      const sent: any[] = [];
      for (const p of apiPitches) {
        const mapped = {
          id: p.id,
          labelId: p.label_id,
          labelName: p.label_name,
          demoId: p.demo_id,
          subject: p.subject,
          body: p.body,
          pitchTracks: p.pitch_tracks || [],
          epLinkMode: p.ep_link_mode,
          epSoundCloudUrl: p.ep_soundcloud_url,
          createdAt: p.created_at,
          updatedAt: p.updated_at,
          sentAt: p.sent_at,
          sentMethod: p.sent_method,
        };
        if (p.status === "sent") {
          sent.push(mapped);
        } else {
          drafts.push(mapped);
        }
      }
      useAppStore.setState({
        savedPitches: drafts,
        sentCampaigns: sent,
      });
    }

    // 4. User profile — Sincronizza il profilo utente
    if (profileRes?.ok) {
      const data = await profileRes.json();
      const p = data.profile;
      if (p) {
        console.log("[FASE C.6] Loaded user profile from new table");
        const current = state.userProfile;
        const apiHasData = !!p.artist_name || !!p.bio || !!p.photo_url || !!p.sc_link;
        if (apiHasData) {
          useAppStore.setState({
            userProfile: {
              ...current,
              artistName: p.artist_name || current.artistName,
              bio: p.bio || current.bio,
              photoUrl: p.photo_url || current.photoUrl,
              scLink: p.sc_link || current.scLink,
              links: p.links || [],
              cyaniteApiToken: p.cyanite_api_token || current.cyaniteApiToken,
            },
          });
        }
      }
    }

    // 5. Releases — Il server è la fonte assoluta di verità per le release (EP)
    if (releasesRes?.ok) {
      const data = await releasesRes.json();
      const apiReleases = data.releases || [];
      console.log(`[FASE C.6] Loaded ${apiReleases.length} releases from new table`);
      
      const mappedReleases = apiReleases.map((ar: any) => ({
        id: ar.id,
        type: ar.type || "ep",
        title: ar.title,
        artists: ar.artists || [],
        trackIds: ar.track_ids || [],
        genre: ar.genre || "",
        notes: ar.notes || "",
        createdAt: ar.created_at,
        epSoundCloudUrl: ar.ep_soundcloud_url || "",
      }));
      useAppStore.setState({ releases: mappedReleases });
    }

    console.log("[FASE C.6] loadFromNewTables completed successfully");
  } catch (err) {
    console.error("[FASE C.6] loadFromNewTables failed:", err);
  }
}

/**
 * 🔒 EMERGENCY FIX (iPhone crash): svuota localStorage se pieno
 * Chiamato quando il loop di QuotaExceededError supera la soglia.
 * Mantiene SOLO i dati essenziali (auth + cookie consent), cancella tutto il resto.
 */
export function emergencyClearLocalStorage(): void {
  if (typeof window === "undefined") return;
  console.warn("[LabelPulse] EMERGENCY: clearing localStorage to prevent crash");

  // Mantieni solo auth + cookie consent
  const keep = new Set([
    "next-auth.session-token",
    "next-auth.callback-url",
    "next-auth.csrf-token",
    "labelpulse-cookie-consent",
    "labelpulse-auth",
    "labelpulse-storage-owner",
  ]);

  const keysToKeep: string[] = [];
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key && keep.has(key)) {
      keysToKeep.push(key);
    }
  }

  // Salva i dati da tenere
  const savedData: Record<string, string> = {};
  for (const key of keysToKeep) {
    savedData[key] = localStorage.getItem(key) || "";
  }

  // Pulisci tutto
  localStorage.clear();

  // Ripristina i dati essenziali
  for (const [key, value] of Object.entries(savedData)) {
    try {
      localStorage.setItem(key, value);
    } catch {}
  }

  console.log("[LabelPulse] EMERGENCY: localStorage cleared, kept", keysToKeep.length, "essential keys");
}

/**
 * 🔒 FASE C.7 — Load user profile from new table
 * (integrated into loadFromNewTables above, but also callable standalone)
 */
export async function loadProfileFromNewTable(): Promise<void> {
  if (typeof window === "undefined") return;
  try {
    const res = await fetch("/api/profile");
    if (!res.ok) return;
    const data = await res.json();
    const p = data.profile;
    if (!p) return;

    const current = useAppStore.getState().userProfile;
    // Only update if API has data that local doesn't (avoid overwriting local edits)
    const apiHasData = !!p.artist_name || !!p.bio || !!p.photo_url || !!p.sc_link;
    if (!apiHasData) return;

    useAppStore.setState({
      userProfile: {
        ...current,
        artistName: p.artist_name || current.artistName,
        bio: p.bio || current.bio,
        photoUrl: p.photo_url || current.photoUrl,
        scLink: p.sc_link || current.scLink,
        links: p.links || current.links,
        cyaniteApiToken: p.cyanite_api_token || current.cyaniteApiToken,
      },
    });
    console.log("[FASE C.7] Profile loaded from new table");
  } catch (err) {
    console.error("[FASE C.7] loadProfileFromNewTable failed:", err);
  }
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

  // ⚠️ CRITICAL FIX (data-loss bug 2026-06-22):
  // Previously this function REPLACED local arrays with cloud arrays. That
  // meant: if the cloud had older snapshots/demos/labels (but a newer
  // lastSavedAt — e.g., because another device had just synced), the local
  // device's newer data was silently overwritten. This caused the user to
  // lose today's rankings when they logged in on mobile and then refreshed PC.
  //
  // FIX: do a UNION BY ID for snapshots, demos, and labels. For each ID
  // present in both, merge field-by-field (for labels, preserve user edits
  // like emails/notes; for demos, prefer the version with the newest
  // createdAt; for snapshots, prefer the version with the newest timestamp).

  // ---------- LABELS ----------
  // Union by id (and by name as fallback). For labels present in both,
  // merge field-by-field: cloud provides the canonical seed fields, local
  // user-edited fields (emails, notes, demoLink, socialLink, status,
  // tier, etc.) are preserved if non-empty.
  const cloudLabels = Array.isArray(cloudData.labels) ? cloudData.labels : [];
  const localLabels = Array.isArray(localState.labels) ? localState.labels : [];
  const labelUserEditFields: (keyof Label)[] = [
    "emails", "notes", "website", "demoLink", "socialLink",
    "soundcloudLink", "status", "tier", "instagramLink", "facebookLink",
    "bandcampLink", "beatstatsLink",
    // Beatport identity — preserve from local if non-empty (so logos
    // scraped on device A propagate to device B via the merge)
    "imageUrl", "slug",
  ];
  const labelsById = new Map<string, Label>();
  const labelsByName = new Map<string, Label>();
  // Add cloud labels first
  for (const cl of cloudLabels) {
    if (!cl || typeof cl !== "object") continue;
    const label: Label = { ...LABEL_DEFAULTS, ...cl };
    labelsById.set(label.id, label);
    const nm = label.name?.toLowerCase().trim();
    if (nm) labelsByName.set(nm, label);
  }
  // Merge local labels: if exists in cloud by id or name, merge user-edit
  // fields from local (non-empty wins). Otherwise add as new.
  //
  // ⚠️ CRITICAL FIX (data-loss bug 2026-06-22, post-login "no charts"):
  // The previous merge ONLY preserved user-edit fields (emails, notes, etc.)
  // from local. It did NOT preserve Beatport data fields (rankByGenre,
  // pointsByGenre, genres, trending, etc.). So if cloud had labels with
  // EMPTY rankByGenre (e.g., a stale cloud row from before the user's
  // latest scrape, or seed labels from a fresh cloud), the merge silently
  // took cloud's empty values and DROPPED local's real scraped data.
  // Result: user logged in and saw "no charts" even though their local
  // data was intact.
  //
  // FIX: also merge Beatport data fields, using:
  //   - For object fields (rankByGenre, pointsByGenre, etc.): UNION by
  //     genre key, local wins on conflict. Cloud's data is preserved for
  //     genres local doesn't have.
  //   - For array field (genres): union (dedupe).
  //   - For boolean (trending): OR — true wins.
  // This way: if local has House:1 and cloud has Techno:3, merged has
  // both. If local has House:2 and cloud has House:1, local wins (local
  // is the user's most recent scrape on this device).
  const beatportObjectFields = [
    "rankByGenre",
    "pointsByGenre",
    "trendingRankByGenre",
    "trendingPointsByGenre",
    "prevRankByGenre",
  ] as const;
  for (const ll of localLabels) {
    if (!ll || typeof ll !== "object") continue;
    const nm = ll.name?.toLowerCase().trim();
    const existing = labelsById.get(ll.id) || (nm ? labelsByName.get(nm) : undefined);
    if (existing) {
      // Merge user-edit fields from local into the existing entry
      for (const f of labelUserEditFields) {
        const lv = (ll as any)[f];
        if (Array.isArray(lv) ? lv.length > 0 : (lv && String(lv).trim() !== "")) {
          (existing as any)[f] = lv;
        }
      }
      // Merge Beatport data fields from local (union by genre, local wins)
      for (const f of beatportObjectFields) {
        const lv = (ll as any)[f];
        if (lv && typeof lv === "object" && !Array.isArray(lv)) {
          const cv = (existing as any)[f];
          const baseObj = (cv && typeof cv === "object" && !Array.isArray(cv)) ? cv : {};
          // Start with cloud's values, then override with local's (local wins)
          (existing as any)[f] = { ...baseObj, ...lv };
        }
      }
      // genres (array): union
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
      // trending (boolean): true wins
      if (ll.trending === true) {
        existing.trending = true;
      }
    } else {
      const label: Label = { ...LABEL_DEFAULTS, ...ll };
      labelsById.set(label.id, label);
      if (nm) labelsByName.set(nm, label);
    }
  }
  // Always ensure seed labels are present
  const cloudIds = new Set(cloudLabels.map((l: any) => l.id));
  const cloudNames = new Set(
    cloudLabels.map((l: any) => l.name?.toLowerCase().trim()).filter(Boolean)
  );
  const seedLabels = buildLabelsFromData();
  for (const seed of seedLabels) {
    if (!cloudIds.has(seed.id) && !cloudNames.has(seed.name.toLowerCase().trim())
        && !labelsById.has(seed.id)) {
      labelsById.set(seed.id, seed);
    }
  }
  merged.labels = repairLabelData(Array.from(labelsById.values()));

  // ---------- DEMOS ----------
  // Union by id. If a demo id exists in both, keep the version with the
  // newest createdAt (or updatedAt if present).
  const cloudDemos = Array.isArray(cloudData.demos) ? cloudData.demos : [];
  const localDemos = Array.isArray(localState.demos) ? localState.demos : [];
  const demosById = new Map<string, Demo>();
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
      // Prefer the one with the newest createdAt (or notes/link updates)
      const exTs = new Date(existing.createdAt || 0).getTime();
      const loTs = new Date(d.createdAt || 0).getTime();
      if (loTs > exTs) {
        demosById.set(d.id, d);
      } else if (loTs === exTs) {
        // Same createdAt — prefer the one with non-empty pitchText or notes
        if ((d.notes && d.notes.trim()) || (d.pitchText && d.pitchText.trim())) {
          demosById.set(d.id, d);
        }
      }
    }
  }
  merged.demos = Array.from(demosById.values());

  // ---------- RELEASES ----------
  // Union by id. If a release id exists in both, prefer the one with the
  // newest createdAt (or the one with more trackIds if equal).
  const cloudReleases = Array.isArray(cloudData.releases) ? cloudData.releases : [];
  const localReleases = Array.isArray(localState.releases) ? localState.releases : [];
  const releasesById = new Map<string, Release>();
  for (const r of cloudReleases) {
    if (!r || typeof r !== "object" || !r.id) continue;
    releasesById.set(r.id, r);
  }
  for (const r of localReleases) {
    if (!r || typeof r !== "object" || !r.id) continue;
    const existing = releasesById.get(r.id);
    if (!existing) {
      releasesById.set(r.id, r);
    } else {
      const exTs = new Date(existing.createdAt || 0).getTime();
      const loTs = new Date(r.createdAt || 0).getTime();
      if (loTs > exTs || (loTs === exTs && (r.trackIds?.length || 0) > (existing.trackIds?.length || 0))) {
        releasesById.set(r.id, r);
      }
    }
  }
  merged.releases = Array.from(releasesById.values());

  // ---------- SAVED PITCHES (Bozze) ----------
  // Union by id. If a savedPitch id exists in both, prefer the one with the
  // newest updatedAt (since the user may have edited the draft on either device).
  const cloudSavedPitches = Array.isArray(cloudData.savedPitches) ? cloudData.savedPitches : [];
  const localSavedPitches = Array.isArray(localState.savedPitches) ? localState.savedPitches : [];
  const savedPitchesById = new Map<string, SavedPitch>();
  for (const p of cloudSavedPitches) {
    if (!p || typeof p !== "object" || !p.id) continue;
    savedPitchesById.set(p.id, p);
  }
  for (const p of localSavedPitches) {
    if (!p || typeof p !== "object" || !p.id) continue;
    const existing = savedPitchesById.get(p.id);
    if (!existing) {
      savedPitchesById.set(p.id, p);
    } else {
      const exTs = new Date(existing.updatedAt || existing.createdAt || 0).getTime();
      const loTs = new Date(p.updatedAt || p.createdAt || 0).getTime();
      if (loTs >= exTs) {
        savedPitchesById.set(p.id, p);
      }
    }
  }
  merged.savedPitches = Array.from(savedPitchesById.values());

  // ---------- SENT CAMPAIGNS (Inviati) ----------
  // Union by id. Sent campaigns are immutable (we never edit them after
  // creation), so conflicts should be rare — but if both devices have the
  // same id (rare race condition), prefer the one with the newest sentAt.
  const cloudSentCampaigns = Array.isArray(cloudData.sentCampaigns) ? cloudData.sentCampaigns : [];
  const localSentCampaigns = Array.isArray(localState.sentCampaigns) ? localState.sentCampaigns : [];
  const sentCampaignsById = new Map<string, SentCampaign>();
  for (const c of cloudSentCampaigns) {
    if (!c || typeof c !== "object" || !c.id) continue;
    sentCampaignsById.set(c.id, c);
  }
  for (const c of localSentCampaigns) {
    if (!c || typeof c !== "object" || !c.id) continue;
    const existing = sentCampaignsById.get(c.id);
    if (!existing) {
      sentCampaignsById.set(c.id, c);
    } else {
      const exTs = new Date(existing.sentAt || 0).getTime();
      const loTs = new Date(c.sentAt || 0).getTime();
      if (loTs > exTs) {
        sentCampaignsById.set(c.id, c);
      }
    }
  }
  // Sort newest-first by sentAt
  merged.sentCampaigns = Array.from(sentCampaignsById.values()).sort(
    (a, b) => new Date(b.sentAt || 0).getTime() - new Date(a.sentAt || 0).getTime()
  );

  // ---------- RANKING SNAPSHOTS ----------
  // Union by id (and by timestamp|source as fallback). mergeSnapshots
  // already exists and handles this correctly, plus sorts by timestamp.
  const cloudSnaps = Array.isArray(cloudData.rankingSnapshots) ? cloudData.rankingSnapshots : [];
  const localSnaps = Array.isArray(localState.rankingSnapshots) ? localState.rankingSnapshots : [];
  merged.rankingSnapshots = mergeSnapshots(localSnaps, cloudSnaps);

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
  merged.lastReplyScanAt = cloudData.lastReplyScanAt ?? localState.lastReplyScanAt;
  merged.newRepliesCount = cloudData.newRepliesCount ?? localState.newRepliesCount ?? 0;
  merged.rankingsUpdatedAt = cloudData.rankingsUpdatedAt ?? localState.rankingsUpdatedAt;
  merged.lastSavedAt = cloudData.lastSavedAt ?? localState.lastSavedAt;

  return merged;
}

// ===================================================================
// ARTIST BOOT LOADER — UNIVERSAL CLOUD SYNC
// Called once on app boot (after Zustand rehydration) to load artists
// from IndexedDB into the in-memory store. Non-blocking — UI renders
// immediately with artists:[] and populates when IDB returns.
//
// ⚠️ UNIVERSAL SYNC STRATEGY (post "Burundi complaint" 2026-06-23):
// The user must be able to login from ANY device (their phone, their
// PC, Mickey Mouse's phone, Donald Duck's PC in Burundi) and see all
// their data. The cloud is the master source; the device is a viewer.
//
// Algorithm:
//   1. Load artists from IndexedDB (local cache, fast)
//   2. ALWAYS fetch artists from cloud (in parallel if IDB had data)
//   3. Three-way decision:
//      a. IDB empty + cloud has artists → download cloud → save to IDB
//      b. IDB has artists + cloud empty → push IDB → cloud
//      c. Both have artists → MERGE (union by id, most-recent wins),
//         save merged to BOTH IDB and cloud
//   4. Always also persist to ARTISTS_SIDECAR_KEY for emergency recovery
//
// This runs in the background and never blocks UI. Even if cloud takes
// 5 seconds to respond, the user sees IDB data immediately (if any).
// ===================================================================
export async function loadArtistsOnBoot(): Promise<void> {
  if (typeof window === "undefined") return;
  try {
    const idbArtists = await loadArtistsFromIDB();

    // Show IDB data immediately (if any) so UI isn't empty while cloud loads
    if (idbArtists.length > 0) {
      useAppStore.setState({ artists: idbArtists });
      console.info(`[LabelPulse] Loaded ${idbArtists.length} artists from IndexedDB`);
    } else {
      console.info("[LabelPulse] IndexedDB has 0 artists — trying cloud...");
    }

    // Try sidecar backup first (faster than cloud, survives offline)
    const sidecarArtists = readArtistsSidecar();
    if (idbArtists.length === 0 && sidecarArtists.length > 0) {
      console.info(`[LabelPulse] Sidecar has ${sidecarArtists.length} artists — restoring immediately while cloud loads.`);
      useAppStore.setState({ artists: sidecarArtists });
      saveArtistsToIDB(sidecarArtists).catch(() => {});
    }

    // If Supabase not configured, we're done (offline-only mode)
    if (!isSupabaseConfigured()) {
      console.info("[LabelPulse] Supabase not configured — skipping cloud artists sync.");
      return;
    }

    // Lazy-import the cloud sync functions
    const { loadArtistsFromCloud, saveArtistsToCloud, mergeArtistsArrays }
      = await import("./supabase");

    const cloudArtists = await loadArtistsFromCloud();
    const currentLocal = useAppStore.getState().artists || idbArtists;

    // ⚠️ CLOUD FIRST: if the cloud load fails, do not assume the cloud is empty.
    // Treat a failed cloud fetch as a transient failure and keep local data only.
    // This prevents accidental overwrites of real cloud data when Supabase is
    // temporarily unavailable or returns a timeout.
    if (cloudArtists === null) {
      console.warn("[LabelPulse] Cloud artists load failed — keeping local data and skipping cloud sync for now.");
      return;
    }

    if (cloudArtists.length === 0 && currentLocal.length === 0) {
      console.info("[LabelPulse] No artists in cloud or local. User has not imported a scrape yet.");
      return;
    }

    // Case A: cloud has artists, local doesn't → DOWNLOAD
    if (cloudArtists.length > 0 && currentLocal.length === 0) {
      console.info(`[LabelPulse] ⬇️  Cloud has ${cloudArtists.length} artists, local has 0. DOWNLOADING from cloud → IDB.`);
      useAppStore.setState({ artists: cloudArtists });
      await saveArtistsToIDB(cloudArtists);
      writeArtistsSidecar(cloudArtists);
      return;
    }

    // Case B: local has artists, cloud doesn't → NO PUSH (REGOLA ZERO)
    // 🔒 RACE CONDITION FIX: Non pushiamo MAI i dati locali al cloud automaticamente.
    // Il cloud vuoto significa che l'admin non ha fatto scrape, non che dobbiamo
    // riempirlo con dati locali potenzialmente stale.
    if (currentLocal.length > 0 && cloudArtists.length === 0) {
      console.info(`[LabelPulse] Local has ${currentLocal.length} artists, cloud has 0. Keeping local (NO auto-push to cloud).`);
      writeArtistsSidecar(currentLocal);
      return;
    }

    // Case C: both have artists → CLOUD WINS (REGOLA ZERO)
    // 🔒 RACE CONDITION FIX: Niente merge, niente push al cloud.
    // Il cloud è l'unica verità. Se cloud e locale differiscono,
    // il cloud vince. Il locale viene solo aggiornato in IDB.
    if (currentLocal.length > 0 && cloudArtists.length > 0) {
      if (cloudArtists.length !== currentLocal.length) {
        console.info(
          `[LabelPulse] ⬇️  Cloud has ${cloudArtists.length} artists, local has ${currentLocal.length}. ` +
          `Cloud wins — updating local (NO push to cloud).`
        );
        useAppStore.setState({ artists: cloudArtists });
        await saveArtistsToIDB(cloudArtists);
        writeArtistsSidecar(cloudArtists);
      } else {
        // Same count — check if content differs
        const sameContent = cloudArtists.every((c: any, i: number) => {
          const l = currentLocal[i];
          return l && JSON.stringify(c) === JSON.stringify(l);
        });
        if (!sameContent) {
          console.info(
            `[LabelPulse] ⬇️  Same count but different content. Cloud wins — updating local (NO push to cloud).`
          );
          useAppStore.setState({ artists: cloudArtists });
          await saveArtistsToIDB(cloudArtists);
          writeArtistsSidecar(cloudArtists);
        } else {
          console.info(
            `[LabelPulse] ✅  Artists in sync: local=${currentLocal.length}, cloud=${cloudArtists.length}. No update needed.`
          );
        }
      }
      return;
    }
  } catch (e) {
    console.warn("[LabelPulse] Failed to load artists on boot:", e);
  }
}

/**
 * 🔒 FASE D FIX — Pusha le classifiche direttamente al cloud
 *
 * Chiamata quando l'admin fa scrape/import Beatport.
 * Invia le label con rank + snapshots all'API /api/admin/push-rankings
 * che salva direttamente nella riga 'global' di app_state.
 *
 * NON passa dal localStorage. Funziona da qualsiasi dispositivo.
 */
async function pushRankingsToCloud(): Promise<void> {
  if (typeof window === "undefined") return;

  try {
    const state = useAppStore.getState();
    const labelsWithRank = state.labels.filter(
      (l: any) => l.rankByGenre && Object.keys(l.rankByGenre).length > 0
    );

    if (labelsWithRank.length === 0) {
      console.log("[push-rankings] No labels with rank to push");
      return;
    }

    console.log(`[push-rankings] Pushing ${labelsWithRank.length} labels + ${state.rankingSnapshots.length} snapshots to cloud...`);

    const res = await fetch("/api/admin/push-rankings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        labels: labelsWithRank,
        rankingSnapshots: state.rankingSnapshots,
        rankingsUpdatedAt: state.rankingsUpdatedAt || new Date().toISOString(),
      }),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      console.error("[push-rankings] Failed:", res.status, err);
      return;
    }

    const data = await res.json();
    console.log("[push-rankings] ✅ Pushed to cloud:", data);
  } catch (err) {
    console.error("[push-rankings] Error:", err);
  }
}

// 🔒 ADMIN DEBUG: esponi useAppStore su window per permettere push manuale
// delle classifiche dal vivo (le label non sono più in localStorage dopo v19)
if (typeof window !== "undefined") {
  (window as any).useAppStore = useAppStore;
  (window as any).pushRankingsToCloud = pushRankingsToCloud;
}
