/**
 * Test anti-regressione — Cross-account data isolation
 *
 * Fix protetto: commit f54bff8 "fix(critical): multi-user data isolation —
 * wipe localStorage on user switch"
 *
 * Cosa testiamo:
 *   - getStorageOwner / setStorageOwner roundtrip
 *   - verifyStorageOwner(email) ritorna true quando il proprietario è diverso
 *     (e in quel caso pulisce tutti i dati locali)
 *   - verifyStorageOwner ritorna false quando stesso utente → no clear
 *   - verifyStorageOwner ritorna false per primo login → solo setOwner
 *   - verifyStorageOwner(email=null) → no-op (non tocca i dati)
 *   - clearAllLocalData() rimuove TUTTE le chiavi localStorage conosciute
 *
 * Se questo test fallisce in futuro → qualcuno ha rotto l'isolamento
 * multi-utente. RIPRISTINARE immediatamente il fix f54bff8.
 */
import { describe, it, expect, beforeEach } from "vitest";

// Keys MUST match src/lib/store.ts (kept in sync manually — if store
// renames a key, update both here and in store.ts).
const PRIMARY_KEY = "labelpulse-storage";
const BACKUP_KEY = "labelpulse-storage-backup";
const SNAPSHOTS_BACKUP_KEY = "labelpulse-snapshots-backup";
const PROFILE_BACKUP_KEY = "labelpulse-profile-backup";
const OWNER_KEY = "labelpulse-storage-owner";
const ARTISTS_SIDECAR_KEY = "labelpulse-artists-backup";

// We need to import the actual functions under test. They read localStorage
// directly (no DI), so we let jsdom provide a real localStorage.
import {
  getStorageOwner,
  setStorageOwner,
  verifyStorageOwner,
  clearAllLocalData,
  useAppStore,
} from "@/lib/store";

function safeJsonParse(str: string | null): any | null {
  if (!str) return null;
  try {
    return JSON.parse(str);
  } catch {
    return null;
  }
}

describe("Cross-account data isolation (fix f54bff8)", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  describe("getStorageOwner / setStorageOwner", () => {
    it("returns null when no owner is set (fresh device)", () => {
      expect(getStorageOwner()).toBeNull();
    });

    it("roundtrips a single email correctly", () => {
      setStorageOwner("userA@example.com");
      expect(getStorageOwner()).toBe("userA@example.com");
    });

    it("overwrites the previous owner when called twice", () => {
      setStorageOwner("userA@example.com");
      setStorageOwner("userB@example.com");
      expect(getStorageOwner()).toBe("userB@example.com");
    });

    it("clears the owner when email is null", () => {
      setStorageOwner("userA@example.com");
      setStorageOwner(null);
      expect(getStorageOwner()).toBeNull();
    });
  });

  describe("verifyStorageOwner — same user (no clear)", () => {
    it("returns false and does NOT clear when owner matches email", () => {
      setStorageOwner("userA@example.com");
      localStorage.setItem(PRIMARY_KEY, JSON.stringify({ demos: ["A"] }));
      localStorage.setItem(PROFILE_BACKUP_KEY, "profile-A");

      const wasCleared = verifyStorageOwner("userA@example.com");

      expect(wasCleared).toBe(false);
      expect(localStorage.getItem(PRIMARY_KEY)).not.toBeNull();
      expect(localStorage.getItem(PROFILE_BACKUP_KEY)).toBe("profile-A");
    });
  });

  describe("verifyStorageOwner — different user (CRITICAL — must clear)", () => {
    it("returns true AND wipes ALL known USER-DATA localStorage keys when owner differs", () => {
      setStorageOwner("userA@example.com");
      localStorage.setItem(PRIMARY_KEY, JSON.stringify({ demos: ["A-secret"] }));
      localStorage.setItem(BACKUP_KEY, "backup-A");
      localStorage.setItem(SNAPSHOTS_BACKUP_KEY, "snap-A");
      localStorage.setItem(PROFILE_BACKUP_KEY, "profile-A");
      localStorage.setItem(ARTISTS_SIDECAR_KEY, "artists-A");

      // User B logs in on the same device
      const wasCleared = verifyStorageOwner("userB@example.com");

      expect(wasCleared).toBe(true);

      // CRITICAL — every known USER-DATA key must be gone so user B can't
      // see user A's data.
      // NOTE (2026-06-26 login-blocked-after-logout fix): after clear,
      // the store re-seeds itself (writes fresh seed labels to PRIMARY_KEY).
      // We only assert that the OLD user data (the "A-secret" demos blob)
      // is gone — PRIMARY_KEY may be repopulated with seed defaults.
      const primaryAfter = localStorage.getItem(PRIMARY_KEY);
      const parsed = primaryAfter ? safeJsonParse(primaryAfter) : null;
      const demosAfter = parsed?.state?.demos ?? parsed?.demos;
      expect(demosAfter ?? []).toEqual([]); // user A's "A-secret" is gone

      expect(localStorage.getItem(BACKUP_KEY)).toBeNull();
      expect(localStorage.getItem(SNAPSHOTS_BACKUP_KEY)).toBeNull();
      expect(localStorage.getItem(PROFILE_BACKUP_KEY)).toBeNull();
      expect(localStorage.getItem(ARTISTS_SIDECAR_KEY)).toBeNull();

      // Owner key must be updated to the new user
      expect(getStorageOwner()).toBe("userB@example.com");
    });
  });

  describe("verifyStorageOwner — first login (no previous owner)", () => {
    it("returns false (no clear) and claims ownership for the new user", () => {
      localStorage.setItem(PRIMARY_KEY, "seed-data");

      const wasCleared = verifyStorageOwner("newuser@example.com");

      expect(wasCleared).toBe(false);
      expect(localStorage.getItem(PRIMARY_KEY)).toBe("seed-data");
      expect(getStorageOwner()).toBe("newuser@example.com");
    });
  });

  describe("verifyStorageOwner — null email (unauthenticated)", () => {
    it("does NOT touch data when email is null", () => {
      setStorageOwner("userA@example.com");
      localStorage.setItem(PRIMARY_KEY, "data-A");

      const wasCleared = verifyStorageOwner(null);

      expect(wasCleared).toBe(false);
      expect(localStorage.getItem(PRIMARY_KEY)).toBe("data-A");
      expect(getStorageOwner()).toBe("userA@example.com");
    });
  });

  describe("clearAllLocalData — explicit wipe", () => {
    it("removes every known USER-DATA localStorage key (PRIMARY_KEY may be re-seeded)", () => {
      localStorage.setItem(PRIMARY_KEY, "user-data-A");
      localStorage.setItem(BACKUP_KEY, "backup");
      localStorage.setItem(SNAPSHOTS_BACKUP_KEY, "snap");
      localStorage.setItem(PROFILE_BACKUP_KEY, "profile");
      localStorage.setItem(OWNER_KEY, "user@example.com");
      localStorage.setItem(ARTISTS_SIDECAR_KEY, "artists");

      clearAllLocalData();

      // After clear (2026-06-26 fix), the store immediately re-seeds itself
      // and writes fresh seed labels to PRIMARY_KEY. This is correct
      // behavior — the OLD user data ("user-data-A") must be gone.
      const primaryAfter = localStorage.getItem(PRIMARY_KEY);
      expect(primaryAfter).not.toBe("user-data-A");

      expect(localStorage.getItem(BACKUP_KEY)).toBeNull();
      expect(localStorage.getItem(SNAPSHOTS_BACKUP_KEY)).toBeNull();
      expect(localStorage.getItem(PROFILE_BACKUP_KEY)).toBeNull();
      expect(localStorage.getItem(OWNER_KEY)).toBeNull();
      expect(localStorage.getItem(ARTISTS_SIDECAR_KEY)).toBeNull();
    });

    it("does not throw if localStorage is already empty", () => {
      expect(() => clearAllLocalData()).not.toThrow();
    });

    it("does NOT remove UNRELATED keys (e.g. theme, language prefs)", () => {
      localStorage.setItem("labelpulse-theme", "dark");
      localStorage.setItem("other-app-data", "keep me");

      clearAllLocalData();

      expect(localStorage.getItem("labelpulse-theme")).toBe("dark");
      expect(localStorage.getItem("other-app-data")).toBe("keep me");
    });
  });

  // ⚠️ Anti-regression: login-blocked-after-logout bug (2026-06-26)
  // After clearAllLocalData(), hasRehydrated MUST stay true. Resetting it
  // to false locks the user out of the app — page.tsx shows the loading
  // spinner forever because onRehydrateStorage only fires once at the
  // initial app mount, so nothing would ever flip it back to true.
  describe("clearAllLocalData — hasRehydrated invariant (login-blocked-after-logout)", () => {
    it("keeps hasRehydrated=true after clear (CRITICAL — never reset to false)", () => {
      // Simulate the post-rehydration state
      useAppStore.setState({ hasRehydrated: true });
      expect(useAppStore.getState().hasRehydrated).toBe(true);

      clearAllLocalData();

      // MUST still be true — if this fails, someone reintroduced the bug
      // where logout locks the user out with an infinite "Loading LabelPulse..." spinner.
      expect(useAppStore.getState().hasRehydrated).toBe(true);
    });
  });
});
