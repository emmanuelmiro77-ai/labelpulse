/**
 * Regression test — Realtime global REPLACE of rankingSnapshots data loss
 *
 * Bug (pre-fix): `applyGlobalDataToStore()` in src/lib/supabase.ts was called
 * by the realtime GLOBAL channel handler whenever the admin pushed new
 * rankings. It REPLACED the local `rankingSnapshots` array with whatever
 * came from the cloud row, with no merge.
 *
 * This silently destroyed local snapshots that hadn't been pushed to the
 * cloud yet — e.g. when a user imported a Beatport JSON on Device B
 * (creating `S_local`), and a concurrent admin push from Device A
 * (whose `rankingSnapshots` did NOT include `S_local`) arrived via realtime
 * before `pushRankingsToCloud()` finished.
 *
 * After the fix, `applyGlobalDataToStore` uses `mergeSnapshots` (UNION by id,
 * dedup by `timestamp|source`), mirroring:
 *   - loadFromCloud() initial path (which already merged)
 *   - applyRemoteData() personal realtime path (which already merged)
 *
 * The fix is minimal and aligned with existing patterns in the codebase.
 */
import { describe, it, expect, beforeEach } from "vitest";
import { useAppStore } from "@/lib/store";
import { applyGlobalDataToStore } from "@/lib/supabase";

describe("applyGlobalDataToStore — rankingSnapshots merge (regression 2026-10-02)", () => {
  beforeEach(() => {
    // Reset the store to a clean state before each test
    useAppStore.setState({
      labels: [],
      rankingSnapshots: [],
      rankingsUpdatedAt: null,
    });
  });

  it("preserves local-only snapshots when cloud does not include them", async () => {
    // Setup: the user has imported a snapshot locally that has NOT been
    // pushed to the cloud yet. The store has just this one snapshot.
    const localSnapshot = {
      id: "snap_local_only",
      timestamp: "2026-10-01T12:00:00Z",
      source: "import_a",
      genres: {},
    };
    useAppStore.setState({
      labels: [],
      rankingSnapshots: [localSnapshot],
      rankingsUpdatedAt: null,
    });

    // Simulate a realtime GLOBAL update from another admin device that
    // does NOT know about localSnapshot (it only has its own snapshot).
    const cloudSnapshot = {
      id: "snap_cloud_only",
      timestamp: "2026-10-02T12:00:00Z",
      source: "admin_push",
      genres: {},
    };
    const globalData = {
      labels: [],
      rankingSnapshots: [cloudSnapshot],
      rankingsUpdatedAt: "2026-10-02T12:00:00Z",
    };

    await applyGlobalDataToStore(globalData);

    const result = useAppStore.getState().rankingSnapshots;

    // CRITICAL: BOTH snapshots must survive — local-only must NOT be wiped
    expect(result).toHaveLength(2);
    expect(result.find((s: any) => s.id === "snap_local_only")).toBeDefined();
    expect(result.find((s: any) => s.id === "snap_cloud_only")).toBeDefined();
  });

  it("does not duplicate snapshots that exist in both local and cloud", async () => {
    // The same snapshot (by id) exists in both — must appear only once.
    const sharedSnapshot = {
      id: "snap_shared",
      timestamp: "2026-10-01T12:00:00Z",
      source: "import_a",
      genres: {},
    };
    useAppStore.setState({
      labels: [],
      rankingSnapshots: [sharedSnapshot],
    });

    const globalData = {
      labels: [],
      rankingSnapshots: [sharedSnapshot],
      rankingsUpdatedAt: "2026-10-02T12:00:00Z",
    };

    await applyGlobalDataToStore(globalData);

    const result = useAppStore.getState().rankingSnapshots;
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe("snap_shared");
  });

  it("dedupes by timestamp|source when id is missing", async () => {
    // Some old snapshots may not have an id. They should dedupe by
    // timestamp+source to avoid double entries.
    const snapNoId = {
      timestamp: "2026-10-01T12:00:00Z",
      source: "import_a",
      genres: {},
    };
    useAppStore.setState({
      labels: [],
      rankingSnapshots: [snapNoId],
    });

    const globalData = {
      labels: [],
      rankingSnapshots: [snapNoId], // same key
      rankingsUpdatedAt: "2026-10-02T12:00:00Z",
    };

    await applyGlobalDataToStore(globalData);

    const result = useAppStore.getState().rankingSnapshots;
    expect(result).toHaveLength(1);
  });

  it("still applies cloud snapshots when local has none", async () => {
    // Fresh device: no local snapshots. Cloud has 2 snapshots.
    useAppStore.setState({
      labels: [],
      rankingSnapshots: [],
    });

    const cloudSnaps = [
      { id: "snap_1", timestamp: "2026-10-01T00:00:00Z", source: "import", genres: {} },
      { id: "snap_2", timestamp: "2026-10-02T00:00:00Z", source: "import", genres: {} },
    ];
    const globalData = {
      labels: [],
      rankingSnapshots: cloudSnaps,
      rankingsUpdatedAt: "2026-10-02T00:00:00Z",
    };

    await applyGlobalDataToStore(globalData);

    const result = useAppStore.getState().rankingSnapshots;
    expect(result).toHaveLength(2);
    expect(result[0].id).toBe("snap_1");
    expect(result[1].id).toBe("snap_2");
  });

  it("preserves local snapshots when cloud returns empty rankingSnapshots", async () => {
    // Edge case: admin pushes labels WITHOUT touching snapshots
    // (rankingSnapshots field absent in the cloud payload).
    // Local snapshots must survive.
    const localSnap = {
      id: "snap_local",
      timestamp: "2026-10-01T12:00:00Z",
      source: "import",
      genres: {},
    };
    useAppStore.setState({
      labels: [],
      rankingSnapshots: [localSnap],
    });

    // globalData.rankingSnapshots is missing entirely (e.g., admin pushed
    // a labels-only update)
    const globalData = {
      labels: [],
      rankingsUpdatedAt: "2026-10-02T12:00:00Z",
    };

    await applyGlobalDataToStore(globalData);

    const result = useAppStore.getState().rankingSnapshots;
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe("snap_local");
  });

  it("merges when local has more snapshots than cloud", async () => {
    // Local has 3 snapshots (S1, S2, S3 — say from a long history of imports).
    // Cloud has only S1 (e.g., because cloud was reset, or another admin
    // pushed a partial state). All 3 must survive.
    const S1 = { id: "s1", timestamp: "2026-09-01T00:00:00Z", source: "imp", genres: {} };
    const S2 = { id: "s2", timestamp: "2026-09-15T00:00:00Z", source: "imp", genres: {} };
    const S3 = { id: "s3", timestamp: "2026-10-01T00:00:00Z", source: "imp", genres: {} };

    useAppStore.setState({
      labels: [],
      rankingSnapshots: [S1, S2, S3],
    });

    const globalData = {
      labels: [],
      rankingSnapshots: [S1], // only S1 in cloud
      rankingsUpdatedAt: "2026-10-02T12:00:00Z",
    };

    await applyGlobalDataToStore(globalData);

    const result = useAppStore.getState().rankingSnapshots;
    expect(result).toHaveLength(3);
    expect(result.find((s: any) => s.id === "s1")).toBeDefined();
    expect(result.find((s: any) => s.id === "s2")).toBeDefined();
    expect(result.find((s: any) => s.id === "s3")).toBeDefined();
  });
});
