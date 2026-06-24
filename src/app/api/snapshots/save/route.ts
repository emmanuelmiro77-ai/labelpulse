import { NextRequest, NextResponse } from "next/server";
import { saveSnapshot, SnapshotInput } from "@/lib/snapshots";

/**
 * POST /api/snapshots/save
 *
 * Receives a full Beatport snapshot from the browser scraper (or admin
 * import) and:
 *   1. Creates (or replaces) a row in beatport_snapshots
 *   2. Loads the previous snapshot's positions
 *   3. Inserts all tracks into beatport_chart_history with diff fields
 *      (prev_position, position_change, is_new_entry, weeks_in_chart)
 *   4. Returns a summary diff (top climbers, droppers, new entries)
 *
 * Body:
 *   SnapshotInput — see src/lib/snapshots.ts
 *
 * NOTE: same-day scrapes REPLACE the existing snapshot (idempotent).
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const input = body as SnapshotInput;

    // Basic validation
    if (!input || !Array.isArray(input.tracks)) {
      return NextResponse.json(
        { error: "invalid_input", message: "tracks[] is required" },
        { status: 400 }
      );
    }
    if (input.tracks.length === 0) {
      return NextResponse.json(
        { error: "empty_snapshot", message: "tracks[] must not be empty" },
        { status: 400 }
      );
    }
    if (!input.snapshotDate) {
      input.snapshotDate = new Date().toISOString().split("T")[0];
    }
    if (!input.source) {
      input.source = "browser-scrape";
    }

    // Optional: cap payload size (3500 tracks × ~5 positions each = ~17.5k rows max)
    // Vercel has a 4.5MB body limit on free tier — we should be well under
    if (input.tracks.length > 10000) {
      return NextResponse.json(
        {
          error: "too_many_tracks",
          message: `Track count ${input.tracks.length} exceeds limit of 10000`,
        },
        { status: 413 }
      );
    }

    console.log(
      `[snapshots/save] Received snapshot: date=${input.snapshotDate} source=${input.source} tracks=${input.tracks.length} genres=${input.totalGenres} labels=${input.totalLabels} artists=${input.totalArtists}`
    );

    const result = await saveSnapshot(input);

    console.log(
      `[snapshots/save] Saved snapshot #${result.snapshotId}: new=${result.newEntries} climbers=${result.climbers} droppers=${result.droppers} stable=${result.stable}`
    );

    return NextResponse.json({ ok: true, diff: result });
  } catch (err: any) {
    console.error("[/api/snapshots/save]", err);
    return NextResponse.json(
      { error: err?.message || "internal_error" },
      { status: 500 }
    );
  }
}
