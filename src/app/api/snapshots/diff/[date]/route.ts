import { NextRequest, NextResponse } from "next/server";
import { getSnapshotDiff } from "@/lib/snapshots";

/**
 * GET /api/snapshots/diff/[date]
 *
 * Returns the diff summary for the snapshot on the given date.
 * Use "latest" as the date to get the most recent snapshot's diff.
 *
 * Example: /api/snapshots/diff/2026-06-24
 *          /api/snapshots/diff/latest
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ date: string }> }
) {
  try {
    const { date } = await params;
    if (!date) {
      return NextResponse.json(
        { error: "missing_date", message: "Date is required" },
        { status: 400 }
      );
    }

    // Handle "latest" alias
    let snapshotDate = date;
    if (date === "latest") {
      const { getLatestSnapshot } = await import("@/lib/snapshots");
      const latest = await getLatestSnapshot();
      if (!latest) {
        return NextResponse.json({ ok: false, diff: null });
      }
      snapshotDate = latest.snapshotDate;
    }

    const diff = await getSnapshotDiff(snapshotDate);
    if (!diff) {
      return NextResponse.json(
        {
          ok: false,
          error: "snapshot_not_found",
          message: `No snapshot found for date ${snapshotDate}`,
        },
        { status: 404 }
      );
    }

    return NextResponse.json({ ok: true, diff });
  } catch (err: any) {
    console.error("[/api/snapshots/diff]", err);
    return NextResponse.json(
      { error: err?.message || "internal_error" },
      { status: 500 }
    );
  }
}
