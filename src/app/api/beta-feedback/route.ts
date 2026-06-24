import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

/**
 * POST /api/beta-feedback
 *
 * Receives beta tester feedback and stores it in Supabase `beta_feedback` table.
 *
 * Schema (auto-created via SQL the user runs once on Supabase):
 *   CREATE TABLE IF NOT EXISTS beta_feedback (
 *     id BIGSERIAL PRIMARY KEY,
 *     email TEXT NOT NULL,
 *     category TEXT NOT NULL CHECK (category IN ('bug', 'feature', 'other')),
 *     subject TEXT,
 *     message TEXT NOT NULL,
 *     user_agent TEXT,
 *     url TEXT,
 *     app_version TEXT,
 *     label_count INTEGER DEFAULT 0,
 *     demo_count INTEGER DEFAULT 0,
 *     locale TEXT,
 *     status TEXT DEFAULT 'new',  -- new | read | resolved | ignored
 *     created_at TIMESTAMPTZ DEFAULT NOW()
 *   );
 *
 * The endpoint uses the project-level Supabase credentials (env vars), NOT
 * the user's BYOK — because the feedback should be visible to the app owner
 * (you), not to the user themselves.
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const {
      email,
      category,
      subject,
      message,
      userAgent,
      url,
      appVersion,
      labelCount,
      demoCount,
      locale,
    } = body || {};

    // Validate required fields
    if (!email || typeof email !== "string") {
      return NextResponse.json(
        { error: "Missing email" },
        { status: 400 }
      );
    }
    if (!message || typeof message !== "string" || message.trim().length === 0) {
      return NextResponse.json(
        { error: "Missing message" },
        { status: 400 }
      );
    }
    if (!["bug", "feature", "other"].includes(category)) {
      return NextResponse.json(
        { error: "Invalid category" },
        { status: 400 }
      );
    }

    // Use project-level Supabase credentials (env vars)
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    if (!supabaseUrl || !supabaseKey) {
      console.error("[beta-feedback] Supabase env vars not configured");
      return NextResponse.json(
        { error: "Server not configured" },
        { status: 503 }
      );
    }

    const supabase = createClient(supabaseUrl, supabaseKey);

    const { error } = await supabase.from("beta_feedback").insert({
      email: email.toLowerCase().trim(),
      category,
      subject: subject?.slice(0, 200) || null,
      message: message.slice(0, 5000),
      user_agent: userAgent?.slice(0, 500) || null,
      url: url?.slice(0, 500) || null,
      app_version: appVersion || null,
      label_count: Number.isFinite(labelCount) ? labelCount : 0,
      demo_count: Number.isFinite(demoCount) ? demoCount : 0,
      locale: locale || null,
      status: "new",
    });

    if (error) {
      console.error("[beta-feedback] Supabase insert failed:", error);
      // If the table doesn't exist, the user needs to run the SQL.
      // We return a friendly error pointing them to the SQL.
      if (error.message.includes("relation") && error.message.includes("does not exist")) {
        return NextResponse.json(
          {
            error: "Table 'beta_feedback' does not exist. Run the SQL schema first.",
            sql: `CREATE TABLE IF NOT EXISTS beta_feedback (
  id BIGSERIAL PRIMARY KEY,
  email TEXT NOT NULL,
  category TEXT NOT NULL,
  subject TEXT,
  message TEXT NOT NULL,
  user_agent TEXT,
  url TEXT,
  app_version TEXT,
  label_count INTEGER DEFAULT 0,
  demo_count INTEGER DEFAULT 0,
  locale TEXT,
  status TEXT DEFAULT 'new',
  created_at TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE beta_feedback ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow anon insert" ON beta_feedback FOR INSERT WITH CHECK (true);`,
          },
          { status: 500 }
        );
      }
      // RLS blocking the insert
      if (error.message.includes("row-level security")) {
        return NextResponse.json(
          {
            error: "RLS is blocking inserts. Run this SQL on Supabase: CREATE POLICY \"Allow anon insert\" ON beta_feedback FOR INSERT WITH CHECK (true);",
            details: error.message,
          },
          { status: 500 }
        );
      }
      return NextResponse.json(
        { error: "Failed to save feedback", details: error.message },
        { status: 500 }
      );
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[beta-feedback] Unhandled error:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

/**
 * GET /api/beta-feedback
 *
 * Lists all feedback (for the app owner to review). Protected by a secret
 * token in the BETA_ADMIN_TOKEN env var.
 *
 * Uses the SERVICE_ROLE key (not anon) to bypass RLS — the table only allows
 * INSERT for anon (so users can submit feedback), but only the admin can read.
 *
 * Query params:
 *   - status: filter by status (new | read | resolved | ignored)
 *   - limit: max items (default 100)
 */
export async function GET(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  const token = authHeader?.replace("Bearer ", "");
  if (!token || token !== process.env.BETA_ADMIN_TOKEN) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  // Prefer SERVICE_ROLE_KEY to bypass RLS; fall back to anon if not set
  // (in which case GET will return empty because RLS blocks anon SELECT).
  const supabaseKey =
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!supabaseUrl || !supabaseKey) {
    return NextResponse.json(
      { error: "Server not configured" },
      { status: 503 }
    );
  }

  const { searchParams } = new URL(req.url);
  const status = searchParams.get("status");
  const limit = Math.min(Number(searchParams.get("limit")) || 100, 500);

  const supabase = createClient(supabaseUrl, supabaseKey);
  let query = supabase
    .from("beta_feedback")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(limit);

  if (status) query = query.eq("status", status);

  const { data, error } = await query;
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ items: data || [], feedback: data || [] });
}

/**
 * PATCH /api/beta-feedback?id=<id>
 * Body (any combination):
 *   - status: "new" | "read" | "resolved" | "ignored"
 *   - adminReply: string  — set or update the admin's reply. Empty string clears it.
 *
 * Updates a single feedback item. Admin-only (Bearer token = BETA_ADMIN_TOKEN).
 *
 * When `adminReply` is provided:
 *   - Sets admin_reply = body.adminReply (truncated to 5000 chars)
 *   - Sets admin_replied_at = NOW() (only if it wasn't already set, so we keep
 *     the first-reply timestamp on edits)
 *   - Resets admin_reply_seen_at = NULL so the user gets the "new reply" badge again
 *   - If status was "new" or "read", bumps it to "resolved" (admin replied = handled)
 */
export async function PATCH(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  const token = authHeader?.replace("Bearer ", "");
  if (!token || token !== process.env.BETA_ADMIN_TOKEN) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const id = searchParams.get("id");
  if (!id) {
    return NextResponse.json({ error: "Missing id" }, { status: 400 });
  }

  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  // Build the update payload based on what was sent
  const update: Record<string, any> = {};

  if (body?.status !== undefined) {
    const validStatuses = ["new", "read", "resolved", "ignored"];
    if (!validStatuses.includes(body.status)) {
      return NextResponse.json(
        { error: `Invalid status. Must be one of: ${validStatuses.join(", ")}` },
        { status: 400 }
      );
    }
    update.status = body.status;
  }

  if (body?.adminReply !== undefined) {
    const replyText = String(body.adminReply).slice(0, 5000);
    update.admin_reply = replyText || null;
    // Set replied_at only on first reply (NULL → NOW); keep original on edits
    // We use coalesce-style logic by reading current row first
    update.admin_reply_seen_at = null; // Reset seen flag so user sees the badge again
  }

  if (Object.keys(update).length === 0) {
    return NextResponse.json(
      { error: "Nothing to update. Send 'status' or 'adminReply'." },
      { status: 400 }
    );
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey =
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!supabaseUrl || !supabaseKey) {
    return NextResponse.json({ error: "Server not configured" }, { status: 503 });
  }

  const supabase = createClient(supabaseUrl, supabaseKey);

  // If adminReply is being set and this is the first reply, set replied_at = NOW()
  if (body?.adminReply !== undefined) {
    const { data: existing } = await supabase
      .from("beta_feedback")
      .select("admin_replied_at, status")
      .eq("id", Number(id))
      .maybeSingle();

    if (existing && !existing.admin_replied_at) {
      update.admin_replied_at = new Date().toISOString();
    }

    // If status not explicitly set and was "new" or "read", bump to "resolved"
    if (body?.status === undefined && existing && (existing.status === "new" || existing.status === "read")) {
      update.status = "resolved";
    }
  }

  const { error } = await supabase
    .from("beta_feedback")
    .update(update)
    .eq("id", Number(id));

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
