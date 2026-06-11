"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";
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
    rankByGenre: l.rankByGenre || {},
    pointsByGenre: l.pointsByGenre || {},
    trending: l.trending || false,
    trendingRankByGenre: l.trendingRankByGenre || {},
    trendingPointsByGenre: l.trendingPointsByGenre || {},
    isCustom: false,
  }));
}

// ==================== NO SEED DEMOS ====================
// App starts with empty demos — user adds their own

// ==================== STORE ====================

interface UserProfile {
  artistName: string;
  scLink: string;
}

interface AppState {
  labels: Label[];
  demos: Demo[];
  activeTab: "dashboard" | "labels" | "demos" | "pitch";
  locale: Locale;
  userProfile: UserProfile;

  // Label actions
  addLabel: (label: Omit<Label, "id" | "createdAt">) => void;
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

  // Data backup
  exportData: () => string;
  importData: (jsonString: string) => boolean;
}

export const useAppStore = create<AppState>()(
  persist(
    (set, get) => ({
      labels: buildLabelsFromData(),
      demos: [] as Demo[],
      activeTab: "dashboard" as const,
      locale: "it" as Locale,
      userProfile: { artistName: "", scLink: "" } as UserProfile,

      addLabel: (label) =>
        set((state) => ({
          labels: [
            ...state.labels,
            {
              ...label,
              id: genId(),
              createdAt: new Date().toISOString(),
              isCustom: true,
              genres: label.genre ? [label.genre] : [],
              rankByGenre: {},
              pointsByGenre: {},
              trending: false,
              trendingRankByGenre: {},
              trendingPointsByGenre: {},
              website: label.website || "",
              demoLink: label.demoLink || "",
              socialLink: label.socialLink || "",
              soundcloudLink: label.soundcloudLink || "",
              emails: label.emails || [],
            },
          ],
        })),

      updateLabel: (id, updates) =>
        set((state) => ({
          labels: state.labels.map((l) =>
            l.id === id ? { ...l, ...updates } : l
          ),
        })),

      deleteLabel: (id) =>
        set((state) => ({
          labels: state.labels.filter((l) => l.id !== id),
        })),

      addDemo: (demo) =>
        set((state) => ({
          demos: [
            ...state.demos,
            { ...demo, id: genId(), createdAt: new Date().toISOString() },
          ],
        })),

      updateDemo: (id, updates) =>
        set((state) => ({
          demos: state.demos.map((d) =>
            d.id === id ? { ...d, ...updates } : d
          ),
        })),

      deleteDemo: (id) =>
        set((state) => ({
          demos: state.demos.filter((d) => d.id !== id),
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
          }));
        }
      },

      setActiveTab: (tab) => set({ activeTab: tab }),
      setLocale: (locale) => set({ locale }),
      setUserProfile: (profile) => set((state) => ({ userProfile: { ...state.userProfile, ...profile } })),

      getGenres: () => labelData.genres,

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
          
          const { labels, demos, userProfile, locale } = parsed.data;
          
          set({
            labels: labels || [],
            demos: demos || [],
            userProfile: userProfile || { artistName: "", scLink: "" },
            locale: locale || "it",
          });
          return true;
        } catch {
          return false;
        }
      },
    }),
    {
      name: "labelpulse-storage",
      version: 5,
      migrate: (persisted: any, version: number) => {
        if (version < 5) {
          // v5: add emails array, website, demoLink, socialLink + remove seed demos
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
        return persisted;
      },
      partialize: (state) => ({
        labels: state.labels,
        demos: state.demos,
        activeTab: state.activeTab,
        locale: state.locale,
        userProfile: state.userProfile,
      }),
      merge: (persistedState: any, currentState: any) => {
        // Deep merge: ensure all labels from currentState have defaults
        const merged = { ...currentState, ...persistedState };
        if (persistedState.labels) {
          merged.labels = persistedState.labels.map((l: any) => ({
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
            ...l,
          }));
        }
        return merged;
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
