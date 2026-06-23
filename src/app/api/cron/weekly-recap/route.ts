import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { sendPushToUser } from "@/lib/push";

/**
 * POST /api/cron/weekly-recap
 *
 * Vercel Cron weekly (Monday 09:00 Rome time = 07:00 or 08:00 UTC
 * depending on DST; we schedule at 07:00 UTC to be safe for both CET
 * and CEST).
 *
 * For each user with prefs_weekly_recap = true, reads their personal
 * app_state row and builds a recap of the last 7 days:
 *   - Demos sent in the last 7 days
 *   - Replies received in the last 7 days
 *   - Pitches generated (heuristic: demos with createdAt in last 7 days
 *     and pitchText non-empty)
 *
 * Auth: Bearer CRON_SECRET (set in Vercel env).
 */

interface Demo {
  id: string;
  trackName?: string;
  status?: string;
  sentDate?: string | null;
  createdAt?: string;
  pitchText?: string;
  replyStatus?: string;
  replyDate?: string | null;
}

export async function POST(req: NextRequest) {
  try {
    const authHeader = req.headers.get("authorization") || "";
    const token = authHeader.replace(/^Bearer\s+/i, "").trim();
    if (!token || token !== process.env.CRON_SECRET) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    if (!supabaseUrl || !supabaseAnonKey) {
      return NextResponse.json({ error: "server_config" }, { status: 500 });
    }
    const supabase = createClient(supabaseUrl, supabaseAnonKey, {
      auth: { persistSession: false },
    });

    const { data: subsData, error: subsError } = await supabase
      .from("push_subscriptions")
      .select("user_email")
      .eq("prefs_weekly_recap", true);
    if (subsError) {
      console.error("[cron/recap] subs query error:", subsError);
      return NextResponse.json({ error: "subs_query_failed" }, { status: 500 });
    }
    const userEmails = Array.from(
      new Set((subsData || []).map((r: any) => r.user_email as string))
    ).filter(Boolean);

    if (userEmails.length === 0) {
      return NextResponse.json({ ok: true, sent: 0, scanned: 0 });
    }

    const now = Date.now();
    const SEVEN_DAYS = 7 * 24 * 60 * 60 * 1000;
    let totalSent = 0;
    let totalScanned = 0;

    for (const email of userEmails) {
      const { data: row, error: rowErr } = await supabase
        .from("app_state")
        .select("data")
        .eq("id", email)
        .maybeSingle();
      if (rowErr || !row?.data) continue;

      const blob =
        typeof row.data === "string" ? JSON.parse(row.data) : row.data;
      const demos: Demo[] = Array.isArray(blob?.demos) ? blob.demos : [];
      totalScanned++;

      const recent = demos.filter((d) => {
        const ts = d.createdAt || d.sentDate;
        if (!ts) return false;
        const t = new Date(ts).getTime();
        return !isNaN(t) && now - t < SEVEN_DAYS;
      });

      const sent = recent.filter((d) => d.status === "sent").length;
      const replies = recent.filter(
        (d) => d.replyStatus && d.replyStatus !== "none"
      ).length;
      const pitches = recent.filter((d) => d.pitchText && d.pitchText.length > 0).length;

      // Don't send if user did nothing this week — silent push would annoy
      if (sent === 0 && replies === 0 && pitches === 0) continue;

      const parts: string[] = [];
      if (sent > 0) parts.push(`${sent} demo inviati`);
      if (replies > 0) parts.push(`${replies} risposte ricevute`);
      if (pitches > 0) parts.push(`${pitches} pitch generati`);

      const body = `Settimana scorsa: ${parts.join(", ")}. Continua così! 🔥`;

      const result = await sendPushToUser(email, "weeklyRecap", {
        title: "LabelPulse — Recap settimanale 📬",
        body,
        url: "/?tab=demos",
        tag: "weekly-recap",
      });

      totalSent += result.sent;
    }

    return NextResponse.json({
      ok: true,
      sent: totalSent,
      scanned: totalScanned,
      users: userEmails.length,
    });
  } catch (err: any) {
    console.error("[cron/recap]", err);
    return NextResponse.json(
      { error: err?.message || "internal_error" },
      { status: 500 }
    );
  }
}
