import { NextRequest, NextResponse } from "next/server";
import { sendPushToAllOptedIn } from "@/lib/push";

/**
 * POST /api/push/rankings-updated
 *
 * Admin-only trigger: send a "rankings updated" push to every user who
 * opted in to the `rankings` notification category.
 *
 * Called by the RankingsWizard component right after a successful import
 * of new Beatport scrape data. Auth via Bearer BETA_ADMIN_TOKEN (same as
 * other admin endpoints) — also accepts CRON_SECRET for parity with cron
 * jobs in case we want to trigger from there.
 *
 * Body (optional):
 *   { summary?: string }  — e.g. "12 nuove label in top 100 Tech House"
 */
export async function POST(req: NextRequest) {
  try {
    const authHeader = req.headers.get("authorization") || "";
    const token = authHeader.replace(/^Bearer\s+/i, "").trim();
    const isAdmin = token && token === process.env.BETA_ADMIN_TOKEN;
    const isCron = token && token === process.env.CRON_SECRET;
    if (!isAdmin && !isCron) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }

    const body = await req.json().catch(() => ({}));
    const summary =
      typeof body?.summary === "string" && body.summary.trim()
        ? body.summary.trim()
        : "Nuove classifiche disponibili.";

    const result = await sendPushToAllOptedIn("rankings", {
      title: "LabelPulse — Classifiche aggiornate 📊",
      body: summary,
      url: "/?tab=rankings",
      tag: "rankings-updated",
    });

    return NextResponse.json({
      ok: true,
      sent: result.sent,
      gone: result.gone,
    });
  } catch (err: any) {
    console.error("[/api/push/rankings-updated]", err);
    return NextResponse.json(
      { error: err?.message || "internal_error" },
      { status: 500 }
    );
  }
}
