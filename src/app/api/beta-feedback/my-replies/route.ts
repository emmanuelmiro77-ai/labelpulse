import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth-options";
import { createClient } from "@supabase/supabase-js";

/**
 * GET /api/beta-feedback/my-replies
 *
 * Returns the current user's feedbacks that have an admin reply.
 * Requires a NextAuth session (the email comes from session.user.email).
 *
 * Query params:
 *   - includeSeen: if "true", also returns replies the user has already seen
 *     (default: only unseen replies, so the badge count matches what's returned)
 *   - markSeen: if "true", sets admin_reply_seen_at = NOW() for all returned rows
 *
 * The user only sees their OWN feedback (filtered by email). They never see
 * other users' feedback, and they never see feedback that doesn't have a reply.
 *
 * Uses SERVICE_ROLE_KEY server-side (RLS bypass) — the user has no direct
 * table access. The auth check is the NextAuth session itself.
 */
export async function GET(req: NextRequest) {
  try {
    const session = await getServerSession({ ...authOptions } as any) as any;
    const email = session?.user?.email?.toLowerCase().trim();
    if (!email) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseKey =
      process.env.SUPABASE_SERVICE_ROLE_KEY ||
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    if (!supabaseUrl || !supabaseKey) {
      return NextResponse.json(
        { error: "Server not configured" },
        { status: 503 }
      );
    }

    const supabase = createClient(supabaseUrl, supabaseKey);

    const { searchParams } = new URL(req.url);
    const includeSeen = searchParams.get("includeSeen") === "true";
    const markSeen = searchParams.get("markSeen") === "true";

    let query = supabase
      .from("beta_feedback")
      .select(
        "id, category, subject, message, status, created_at, admin_reply, admin_replied_at, admin_reply_seen_at"
      )
      .eq("email", email)
      .not("admin_reply", "is", null)
      .order("admin_replied_at", { ascending: false, nullsFirst: false })
      .limit(50);

    if (!includeSeen) {
      query = query.is("admin_reply_seen_at", null);
    }

    const { data, error } = await query;
    if (error) {
      console.error("[my-replies] Supabase query failed:", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // Mark as seen if requested
    if (markSeen && data && data.length > 0) {
      const now = new Date().toISOString();
      const idsToMark = data
        .filter((row: any) => !row.admin_reply_seen_at)
        .map((row: any) => row.id);

      if (idsToMark.length > 0) {
        await supabase
          .from("beta_feedback")
          .update({ admin_reply_seen_at: now })
          .in("id", idsToMark);
        // Reflect in the returned data
        data.forEach((row: any) => {
          if (!row.admin_reply_seen_at) row.admin_reply_seen_at = now;
        });
      }
    }

    return NextResponse.json({
      items: data || [],
      unseenCount: (data || []).filter((r: any) => !r.admin_reply_seen_at).length,
    });
  } catch (err) {
    console.error("[my-replies] Unhandled error:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
