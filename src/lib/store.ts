"use client";

import { create } from "zustand";
import { persist, createJSONStorage, StateStorage } from "zustand/middleware";
import type { Locale } from "./i18n";
import labelData from "./labels-data.json";

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
  // Real Beatport data
  genres: string[];
  rankByGenre: Record<string, number>;
  pointsByGenre: Record<string, number>;
  trending: boolean;
  trendingRankByGenre: Record<string, number>;
  trendingPointsByGenre: Record<string, number>;
  isCustom?: boolean; // user-added label
}

export interface Demo {
  id: string;
  trackName: string;
  labelId: string;
  status: DemoStatus;
  sentDate: string | null;
  link: string;
  notes: string;
  createdAt: string;
  pitchText: string;
  artistName: string;
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

    // CRITICAL: Mark rehydrated BEFORE returning — Zustand will call setItem with
    // merged data immediately after this getItem returns, and we MUST allow that write.
    // This ensures seed data (initial state) writes are blocked, but merged data writes pass.
    _rehydrated = true;

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

    if (!primaryOk) {
      console.error("[LabelPulse Storage] Primary write failed!");
    }
  },

  removeItem: (name: string): void => {
    safeLocalStorageRemove(PRIMARY_KEY);
    safeLocalStorageRemove(BACKUP_KEY);
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
}

// ==================== NO SEED DEMOS ====================

// ==================== STORE ====================

interface UserProfile {
  artistName: string;
  scLink: string;
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
  activeTab: "dashboard" | "labels" | "demos" | "pitch";
  locale: Locale;
  userProfile: UserProfile;
  gmailAuth: GmailAuth;
  rankingsUpdatedAt: string | null;
  lastSavedAt: string | null;
  hasRehydrated: boolean;

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
  setActiveTab: (tab: "dashboard" | "labels" | "demos" | "pitch") => void;

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

  // Data backup
  exportData: () => string;
  importData: (jsonString: string) => boolean;
}

/**
 * Merge helper: preserves ALL user-editable fields from existing label
 * when imported label has empty/default values for those fields.
 */
function mergePreservingUserData(existing: Label, imported: Label): Partial<Label> {
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
  emails: [],
  notes: "",
  contactInfo: "",
  submissionType: "email" as SubmissionType,
  status: "open" as LabelStatus,
  genre: "",
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
      activeTab: "dashboard" as const,
      locale: "it" as Locale,
      userProfile: { artistName: "", scLink: "" } as UserProfile,
      gmailAuth: { isConnected: false, email: "", accessToken: "", expiresAt: 0 } as GmailAuth,
      rankingsUpdatedAt: null as string | null,
      lastSavedAt: null as string | null,
      hasRehydrated: false as boolean,

      addLabel: (label) =>
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
        })),

      updateLabel: (id, updates) =>
        set((state) => ({
          labels: state.labels.map((l) =>
            l.id === id ? { ...l, ...updates } : l
          ),
          lastSavedAt: new Date().toISOString(),
        })),

      deleteLabel: (id) =>
        set((state) => ({
          labels: state.labels.filter((l) => l.id !== id),
          lastSavedAt: new Date().toISOString(),
        })),

      addDemo: (demo) =>
        set((state) => ({
          demos: [
            ...state.demos,
            { ...demo, id: genId(), createdAt: new Date().toISOString() },
          ],
          lastSavedAt: new Date().toISOString(),
        })),

      updateDemo: (id, updates) =>
        set((state) => ({
          demos: state.demos.map((d) =>
            d.id === id ? { ...d, ...updates } : d
          ),
          lastSavedAt: new Date().toISOString(),
        })),

      deleteDemo: (id) =>
        set((state) => ({
          demos: state.demos.filter((d) => d.id !== id),
          lastSavedAt: new Date().toISOString(),
        })),

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
        }
      },

      setActiveTab: (tab) => set({ activeTab: tab }),
      setLocale: (locale) => set({ locale }),
      setUserProfile: (profile) => set((state) => ({ userProfile: { ...state.userProfile, ...profile }, lastSavedAt: new Date().toISOString() })),

      getGenres: () => labelData.genres,

      setGmailAuth: (auth) => set({ gmailAuth: auth }),
      clearGmailAuth: () => set({ gmailAuth: { isConnected: false, email: "", accessToken: "", expiresAt: 0 } }),

      setRankingsUpdatedAt: (date) => set({ rankingsUpdatedAt: date }),

      exportData: () => {
        const state = get();
        const exportObj = {
          version: 1,
          app: "labelpulse",
          exportedAt: new Date().toISOString(),
          data: {
            labels: state.labels,
            demos: state.demos,
            userProfile: state.userProfile,
            locale: state.locale,
          }
        };
        return JSON.stringify(exportObj, null, 2);
      },

      importData: (jsonString: string) => {
        try {
          const parsed = JSON.parse(jsonString);
          if (parsed.app !== "labelpulse" || !parsed.data) return false;
          
          const { labels: importedLabels = [], demos: importedDemos = [], userProfile, locale: importedLocale } = parsed.data;
          const currentLabels = get().labels;
          const currentDemos = get().demos;

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
          
          set({
            labels: mergedLabels,
            demos: mergedDemos,
            userProfile: userProfile || get().userProfile,
            locale: importedLocale || get().locale,
            ...(isRankingsImport || hasGenresAndLabels ? { rankingsUpdatedAt: new Date().toISOString() } : {}),
            lastSavedAt: new Date().toISOString(),
          });
          return true;
        } catch {
          return false;
        }
      },
    }),
    {
      name: PRIMARY_KEY,
      version: 9,
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
            persisted.userProfile = { artistName: "", scLink: "" };
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
