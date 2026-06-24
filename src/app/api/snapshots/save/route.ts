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
 * CORS is allowed from beatport.com so the browser scraper can POST
 * directly without a separate uploader step.
 */

const ALLOWED_ORIGINS = [
  "https://www.beatport.com",
  "https://beatport.com",
  "http://localhost:3000",
];

function corsHeaders(origin: string | null): Record<string, string> {
  const headers: Record<string, string> = {
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  };
  if (origin && ALLOWED_ORIGINS.includes(origin)) {
    headers["Access-Control-Allow-Origin"] = origin;
    headers["Access-Control-Allow-Credentials"] = "false";
  }
  return headers;
}

function jsonWithCors(
  body: unknown,
  status: number,
  origin: string | null
): NextResponse {
  return NextResponse.json(body, {
    status,
    headers: corsHeaders(origin),
  });
}

export async function OPTIONS(req: NextRequest) {
  const origin = req.headers.get("origin");
  return new NextResponse(null, {
    status: 204,
    headers: corsHeaders(origin),
  });
}

export async function POST(req: NextRequest) {
  const origin = req.headers.get("origin");
  try {
    const body = await req.json();
    const input = body as SnapshotInput;

    // Basic validation
    if (!input || !Array.isArray(input.tracks)) {
      return jsonWithCors(
        { error: "invalid_input", message: "tracks[] is required" },
        400,
        origin
      );
    }
    if (input.tracks.length === 0) {
      return jsonWithCors(
        { error: "empty_snapshot", message: "tracks[] must not be empty" },
        400,
        origin
      );
    }
    if (!input.snapshotDate) {
      input.snapshotDate = new Date().toISOString().split("T")[0];
    }
    if (!input.source) {
      input.source = "browser-scrape";
    }

    // Cap payload size (3500 tracks × ~5 positions each = ~17.5k rows max)
    if (input.tracks.length > 10000) {
      return jsonWithCors(
        {
          error: "too_many_tracks",
          message: `Track count ${input.tracks.length} exceeds limit of 10000`,
        },
        413,
        origin
      );
    }

    console.log(
      `[snapshots/save] Received snapshot: date=${input.snapshotDate} source=${input.source} tracks=${input.tracks.length} genres=${input.totalGenres} labels=${input.totalLabels} artists=${input.totalArtists}`
    );

    const result = await saveSnapshot(input);

    console.log(
      `[snapshots/save] Saved snapshot #${result.snapshotId}: new=${result.newEntries} climbers=${result.climbers} droppers=${result.droppers} stable=${result.stable}`
    );

    return jsonWithCors({ ok: true, diff: result }, 200, origin);
  } catch (err: any) {
    console.error("[/api/snapshots/save]", err);
    return jsonWithCors(
      { error: err?.message || "internal_error" },
      500,
      origin
    );
  }
}
