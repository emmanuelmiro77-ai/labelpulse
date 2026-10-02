/**
 * Persistence Safety Tests
 * =====================================================================
 * Verifies that no data loading operation can destroy previously saved data.
 *
 * Tests cover the 8 mandatory scenarios:
 * 1. Save contact → refresh → contact identical
 * 2. Save contact → logout → login → contact identical
 * 3. Save contact → Beatport import → contact identical
 * 4. Import chart A → import chart B → A remains recoverable
 * 5. Failed import → no previous data cancelled
 * 6. Empty API response → no previously saved data cancelled
 * 7. Two concurrent loads → no data lost
 * 8. Different device/browser → data from DB identical
 *
 * These tests validate the safe-load utility functions and the
 * non-destructive merge logic in the store.
 * =====================================================================
 */

import { describe, it, expect } from "vitest";
import {
  unionById,
  mergeRankingSnapshots,
  upsertLabelPersonalData,
} from "@/lib/safe-load";

// ---- Test fixtures ----

const makeLabel = (overrides: Partial<Record<string, any>> = {}) => ({
  id: "label_1",
  name: "Test Label",
  emails: ["test@example.com"],
  notes: "My notes",
  status: "open",
  website: "https://example.com",
  demoLink: "",
  socialLink: "",
  soundcloudLink: "",
  beatportLink: "",
  contactInfo: "contact@test.com",
  customLinks: [],
  isCustom: false,
  isFavorite: false,
  ...overrides,
});

const makeApiRow = (overrides: Partial<Record<string, any>> = {}) => ({
  label_id: "label_1",
  emails: ["test@example.com"],
  notes: "My notes",
  status: "open",
  website: "https://example.com",
  demo_link: "",
  social_link: "",
  soundcloud_link: "",
  contact_info: "contact@test.com",
  ...overrides,
});

// ==================== TEST 1 ====================
// Save contact → refresh → contact identical

describe("TEST 1: Save contact → refresh → contact identical", () => {
  it("preserves label personal data through a simulated refresh", () => {
    const localLabel = makeLabel({ emails: ["new@example.com"], notes: "Updated notes" });
    const apiRow = makeApiRow({ emails: ["new@example.com"], notes: "Updated notes" });

    const result = upsertLabelPersonalData([localLabel], [apiRow]);

    expect(result[0].emails).toEqual(["new@example.com"]);
    expect(result[0].notes).toBe("Updated notes");
    expect(result[0].status).toBe("open");
  });
});

// ==================== TEST 2 ====================
// Save contact → logout → login → contact identical
// (Simulated: local data survives when cloud returns same data)

describe("TEST 2: Save contact → logout → login → contact identical", () => {
  it("preserves personal data when reloading from cloud after logout/login", () => {
    const localLabel = makeLabel({
      emails: ["saved@example.com"],
      notes: "Saved during session",
      status: "closed",
    });
    // After login, API returns the same data that was saved
    const apiRow = makeApiRow({
      emails: ["saved@example.com"],
      notes: "Saved during session",
      status: "closed",
    });

    const result = upsertLabelPersonalData([localLabel], [apiRow]);

    expect(result[0].emails).toEqual(["saved@example.com"]);
    expect(result[0].notes).toBe("Saved during session");
    expect(result[0].status).toBe("closed");
  });
});

// ==================== TEST 3 ====================
// Save contact → Beatport import → contact identical
// (Beatport import updates rankByGenre etc., NOT personal fields)

describe("TEST 3: Save contact → Beatport import → contact identical", () => {
  it("Beatport import does not overwrite personal data", () => {
    const localLabel = makeLabel({
      emails: ["my@email.com"],
      notes: "My label notes",
      rankByGenre: { Techno: 5 },
    });
    // Beatport import provides rank data but NO personal data
    const apiRows: any[] = []; // No personal data from API

    const result = upsertLabelPersonalData([localLabel], apiRows);

    expect(result[0].emails).toEqual(["my@email.com"]);
    expect(result[0].notes).toBe("My label notes");
    expect(result[0].rankByGenre).toEqual({ Techno: 5 });
  });
});

// ==================== TEST 4 ====================
// Import chart A → import chart B → A remains recoverable

describe("TEST 4: Import chart A → import chart B → A remains recoverable", () => {
  it("merging snapshots from two imports preserves both", () => {
    const snapshotA = [
      { id: "snap_1", timestamp: "2026-01-01T00:00:00Z", source: "import_a" },
    ];
    const snapshotB = [
      { id: "snap_2", timestamp: "2026-02-01T00:00:00Z", source: "import_b" },
    ];

    // First import: merge A into empty
    const afterFirstImport = mergeRankingSnapshots([], snapshotA);
    expect(afterFirstImport).toHaveLength(1);
    expect(afterFirstImport[0].id).toBe("snap_1");

    // Second import: merge B into state that already has A
    const afterSecondImport = mergeRankingSnapshots(afterFirstImport, snapshotB);
    expect(afterSecondImport).toHaveLength(2);
    expect(afterSecondImport[0].id).toBe("snap_1"); // A is still there
    expect(afterSecondImport[1].id).toBe("snap_2"); // B is added
  });
});

// ==================== TEST 5 ====================
// Failed import → no previous data cancelled

describe("TEST 5: Failed import → no previous data cancelled", () => {
  it("empty cloud response does not destroy local snapshots", () => {
    const localSnapshots = [
      { id: "snap_1", timestamp: "2026-01-01T00:00:00Z", source: "local" },
      { id: "snap_2", timestamp: "2026-02-01T00:00:00Z", source: "local" },
    ];
    // Cloud returns empty (failed import / empty global row)
    const cloudSnapshots: any[] = [];

    const result = mergeRankingSnapshots(localSnapshots, cloudSnapshots);

    expect(result).toHaveLength(2);
    expect(result[0].id).toBe("snap_1");
    expect(result[1].id).toBe("snap_2");
  });

  it("failed API response does not destroy local label personal data", () => {
    const localLabel = makeLabel({
      emails: ["important@email.com"],
      notes: "Critical note",
    });
    // API returns empty array (failed / no data)
    const apiRows: any[] = [];

    const result = upsertLabelPersonalData([localLabel], apiRows);

    expect(result[0].emails).toEqual(["important@email.com"]);
    expect(result[0].notes).toBe("Critical note");
  });
});

// ==================== TEST 6 ====================
// Empty API response → no previously saved data cancelled

describe("TEST 6: Empty API response → no previously saved data cancelled", () => {
  it("empty demos array from API does not destroy local demos", () => {
    const localDemos = [
      { id: "demo_1", trackName: "Track A", status: "ready" },
      { id: "demo_2", trackName: "Track B", status: "sent" },
    ];
    const cloudDemos: any[] = []; // API returned empty

    const result = unionById(localDemos, cloudDemos);

    expect(result).toHaveLength(2);
    expect(result[0].id).toBe("demo_1");
    expect(result[1].id).toBe("demo_2");
  });

  it("empty label data from API preserves local label emails", () => {
    const localLabel = makeLabel({ emails: ["preserved@email.com"] });
    const apiRows: any[] = []; // API returned no personal data

    const result = upsertLabelPersonalData([localLabel], apiRows);

    expect(result[0].emails).toEqual(["preserved@email.com"]);
  });

  it("empty snapshots from cloud preserves local snapshots", () => {
    const localSnaps = [
      { id: "snap_local_1", timestamp: "2026-01-01T00:00:00Z", source: "local" },
    ];
    const cloudSnaps: any[] = [];

    const result = mergeRankingSnapshots(localSnaps, cloudSnaps);

    expect(result).toHaveLength(1);
    expect(result[0].id).toBe("snap_local_1");
  });
});

// ==================== TEST 7 ====================
// Two concurrent loads → no data lost

describe("TEST 7: Two concurrent loads → no data lost", () => {
  it("unionById is commutative — order does not matter for survival", () => {
    const setA = [
      { id: "item_1", name: "A" },
      { id: "item_2", name: "B" },
    ];
    const setB = [
      { id: "item_2", name: "B-updated" },
      { id: "item_3", name: "C" },
    ];

    // Simulate two loads: A first, then B
    const resultAB = unionById(setA, setB);
    // Then B first, then A
    const resultBA = unionById(setB, setA);

    // Both results contain all 3 items
    expect(resultAB).toHaveLength(3);
    expect(resultBA).toHaveLength(3);

    // item_1 (only in A) survives in both
    expect(resultAB.find((i) => i.id === "item_1")).toBeDefined();
    expect(resultBA.find((i) => i.id === "item_1")).toBeDefined();

    // item_3 (only in B) survives in both
    expect(resultAB.find((i) => i.id === "item_3")).toBeDefined();
    expect(resultBA.find((i) => i.id === "item_3")).toBeDefined();
  });

  it("upsertLabelPersonalData does not reset fields when API returns partial data", () => {
    const localLabel = makeLabel({
      emails: ["local@email.com"],
      notes: "Local note",
      website: "https://local.com",
    });
    // API returns only emails (partial update — notes/website are missing)
    const apiRow = makeApiRow({
      emails: ["updated@email.com"],
      notes: undefined as any,
      website: undefined as any,
    });

    const result = upsertLabelPersonalData([localLabel], [apiRow]);

    // Emails are updated from API
    expect(result[0].emails).toEqual(["updated@email.com"]);
    // Notes and website are PRESERVED from local (not reset to default)
    expect(result[0].notes).toBe("Local note");
    expect(result[0].website).toBe("https://local.com");
  });
});

// ==================== TEST 8 ====================
// Different device/browser → data from DB identical
// (Simulated: cloud data applied to empty local state)

describe("TEST 8: Different device → data from DB identical", () => {
  it("label personal data from cloud applied to empty local state", () => {
    // New device: local has no personal data (just seed labels)
    const seedLabel = makeLabel({
      emails: [],
      notes: "",
      status: "unknown",
      website: "",
    });
    // Cloud has the saved data
    const apiRow = makeApiRow({
      emails: ["saved@cloud.com"],
      notes: "Cloud note",
      status: "open",
      website: "https://cloud.com",
    });

    const result = upsertLabelPersonalData([seedLabel], [apiRow]);

    expect(result[0].emails).toEqual(["saved@cloud.com"]);
    expect(result[0].notes).toBe("Cloud note");
    expect(result[0].status).toBe("open");
    expect(result[0].website).toBe("https://cloud.com");
  });

  it("snapshots from cloud applied to empty local state", () => {
    const localSnaps: any[] = [];
    const cloudSnaps = [
      { id: "snap_cloud_1", timestamp: "2026-01-01T00:00:00Z", source: "cloud" },
      { id: "snap_cloud_2", timestamp: "2026-02-01T00:00:00Z", source: "cloud" },
    ];

    const result = mergeRankingSnapshots(localSnaps, cloudSnaps);

    expect(result).toHaveLength(2);
    expect(result[0].id).toBe("snap_cloud_1");
    expect(result[1].id).toBe("snap_cloud_2");
  });

  it("demos from cloud applied to empty local state", () => {
    const localDemos: any[] = [];
    const cloudDemos = [
      { id: "demo_cloud_1", trackName: "Cloud Track" },
    ];

    const result = unionById(localDemos, cloudDemos);

    expect(result).toHaveLength(1);
    expect(result[0].id).toBe("demo_cloud_1");
    expect(result[0].trackName).toBe("Cloud Track");
  });
});
