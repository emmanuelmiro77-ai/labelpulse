import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { sendPushToUser } from "@/lib/push";

/**
 * POST /api/cron/follow-up-reminders
 *
 * Vercel Cron daily (9:00 UTC = 11:00 CEST).
 *
 * For each user that has at least one push subscription, read their
 * personal row from app_state, parse the demos[] array, and find demos
 * that:
 *   - status === "sent" (not yet signed/rejected)
 *   - sentDate is between 7 and 30 days ago
 *   - replyStatus is "none" (no reply received yet)
 *   - we haven't already reminded them about THIS demo (tracked via a
 *     separate `followUpNotifiedAt` ISO string on the demo object —
 *     set client-side after the push goes out, OR by this cron using a
 *     simple heuristic: only notify once per demo, mark by adding the
 *     demo id to a `notifiedFollowUps: string[]` array on the user's
 *     personal row).
 *
 * To keep the implementation simple and avoid mutating user data from
 * the server, we use a different heuristic:
 *   - Only send the push if sentDate is between 7 and 8 days ago
 *     (i.e. exactly the 7-day mark, ±24h). This means each demo gets
 *     exactly ONE reminder, on day 7. Missed it? No spam.
 *
 * Auth: Bearer CRON_SECRET (set in Vercel env).
 */

interface Demo {
  id: string;
  trackName?: string;
  labelId?: string;
  status?: string;
  sentDate?: string | null;
  replyStatus?: string;
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

    // 1. Get ALL users who have at least one push subscription with
    //    prefs_follow_up = true. We only care about them.
    const { data: subsData, error: subsError } = await supabase
      .from("push_subscriptions")
      .select("user_email")
      .eq("prefs_follow_up", true);
    if (subsError) {
      console.error("[cron/follow-up] subs query error:", subsError);
      return NextResponse.json({ error: "subs_query_failed" }, { status: 500 });
    }
    const userEmails = Array.from(
      new Set((subsData || []).map((r: any) => r.user_email as string))
    ).filter(Boolean);

    if (userEmails.length === 0) {
      return NextResponse.json({ ok: true, sent: 0, scanned: 0 });
    }

    // 2. For each user, read their personal app_state row
    const now = Date.now();
    const SEVEN_DAYS = 7 * 24 * 60 * 60 * 1000;
    const EIGHT_DAYS = 8 * 24 * 60 * 60 * 1000;

    let totalSent = 0;
    let totalScanned = 0;

    for (const email of userEmails) {
      const { data: row, error: rowErr } = await supabase
        .from("app_state")
        .select("data")
        .eq("id", email)
        .maybeSingle();
      if (rowErr || !row?.data) continue;

      // data is the JSON blob: { labels, demos, userProfile, ... }
      const blob =
        typeof row.data === "string" ? JSON.parse(row.data) : row.data;
      const demos: Demo[] = Array.isArray(blob?.demos) ? blob.demos : [];
      totalScanned++;

      // Find demos eligible for follow-up reminder (sent 7-8 days ago, no reply)
      const dueDemos = demos.filter((d) => {
        if (!d.sentDate) return false;
        if (d.status !== "sent") return false;
        if (d.replyStatus && d.replyStatus !== "none") return false;
        const sent = new Date(d.sentDate).getTime();
        if (isNaN(sent)) return false;
        const age = now - sent;
        return age >= SEVEN_DAYS && age < EIGHT_DAYS;
      });

      if (dueDemos.length === 0) continue;

      // Build the push payload
      const demo = dueDemos[0];
      const labelName = blob?.labels?.find(
        (l: any) => l.id === demo.labelId
      )?.name;
      const more = dueDemos.length > 1 ? ` (+${dueDemos.length - 1} altri)` : "";
      const trackName = demo.trackName || "un tuo demo";

      const result = await sendPushToUser(email, "followUp", {
        title: "LabelPulse — Follow-up reminder 🔔",
        body: `Hai inviato "${trackName}" a ${
          labelName || "una label"
        } 7 giorni fa${more}. È il momento di mandare un follow-up.`,
        url: "/?tab=demos",
        tag: `follow-up-${demo.id}`,
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
    console.error("[cron/follow-up]", err);
    return NextResponse.json(
      { error: err?.message || "internal_error" },
      { status: 500 }
    );
  }
}
