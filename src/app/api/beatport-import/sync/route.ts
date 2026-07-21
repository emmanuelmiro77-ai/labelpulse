import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth-options";
import { runBeatportSync, type SyncReport } from "@/services/beatport-import/sync-engine";

/**
 * API /api/beatport-import/sync
 *
 * BP-004 — Beatport Sync Engine
 *
 * Isolated endpoint that accepts a scraper JSON (or a file upload) and
 * runs the full sync pipeline: Labels → Artists → Tracks.
 *
 * ADMIN-ONLY: only the admin email can trigger this.
 *
 * POST body:
 *   { "scraperJson": { ... } }   — inline JSON
 *   OR
 *   multipart/form-data with field "file" — file upload
 *
 * Query params:
 *   ?dryRun=true — run the full pipeline without pushing to cloud
 *
 * Response:
 *   {
 *     ok: boolean,
 *     report: SyncReport
 *   }
 */

const ADMIN_EMAILS = new Set([
  "emmanuel.miro77@gmail.com",
]);

export async function POST(req: NextRequest) {
  // Auth check — admin only
  const session = await getServerSession(authOptions as any);
  const email = session?.user?.email?.toLowerCase().trim();
  if (!email || !ADMIN_EMAILS.has(email)) {
    return NextResponse.json({ error: "unauthorized — admin only" }, { status: 401 });
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceKey) {
    return NextResponse.json({ error: "server_config — missing Supabase env vars" }, { status: 500 });
  }

  const dryRun = new URL(req.url).searchParams.get("dryRun") === "true";

  try {
    let scraperJson: any = null;

    const contentType = req.headers.get("content-type") || "";

    if (contentType.includes("multipart/form-data")) {
      const formData = await req.formData();
      const file = formData.get("file") as File | null;
      if (!file) {
        return NextResponse.json({ error: "No file provided" }, { status: 400 });
      }
      const text = await file.text();
      scraperJson = JSON.parse(text);
    } else {
      const body = await req.json();
      scraperJson = body?.scraperJson || body;
    }

    if (!scraperJson || typeof scraperJson !== "object") {
      return NextResponse.json({ error: "Invalid scraper JSON" }, { status: 400 });
    }

    // Run the full sync pipeline
    const report: SyncReport = await runBeatportSync(scraperJson, supabaseUrl, serviceKey, { dryRun });

    return NextResponse.json({ ok: report.success, report });
  } catch (err: any) {
    console.error("[/api/beatport-import/sync] error:", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

/**
 * GET /api/beatport-import/sync
 *
 * Returns service status info.
 */
export async function GET() {
  const session = await getServerSession(authOptions as any);
  const email = session?.user?.email?.toLowerCase().trim();
  if (!email || !ADMIN_EMAILS.has(email)) {
    return NextResponse.json({ error: "unauthorized — admin only" }, { status: 401 });
  }

  return NextResponse.json({
    service: "beatport-import/sync",
    status: "ready",
    description: "POST a scraper JSON (inline or file upload) to run the full sync pipeline (Labels → Artists → Tracks). Use ?dryRun=true to preview without cloud writes.",
    pipeline: ["labels", "artists", "tracks"],
  });
}
