import { NextResponse } from "next/server";
import { getLatestSnapshot } from "@/lib/snapshots";

/**
 * GET /api/snapshots/latest
 *
 * Returns metadata for the most recent Beatport snapshot. Used by the
 * admin UI to show "last scraped: 2026-06-24, 3400 tracks, 34 genres".
 */
export async function GET() {
  try {
    const latest = await getLatestSnapshot();
    if (!latest) {
      return NextResponse.json({ ok: false, snapshot: null });
    }
    return NextResponse.json({ ok: true, snapshot: latest });
  } catch (err: any) {
    console.error("[/api/snapshots/latest]", err);
    return NextResponse.json(
      { error: err?.message || "internal_error" },
      { status: 500 }
    );
  }
}
