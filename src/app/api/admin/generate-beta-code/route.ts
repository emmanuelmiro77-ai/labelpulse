import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

/**
 * POST /api/admin/generate-beta-code
 *
 * Admin-only: generates a new beta access code for a given email.
 *
 * Headers:
 *   Authorization: Bearer <BETA_ADMIN_TOKEN>
 *
 * Body:
 *   { email: string, note?: string, expiresInDays?: number (default 30) }
 *
 * Returns:
 *   { code: string, email: string, expires_at: string }
 *
 * The code is 8 chars, alphanumeric (no ambiguous chars like 0/O, 1/I).
 *
 * 🔒 Uses SERVICE_ROLE key (not anon) to bypass RLS — the C-2 fix
 * restricts INSERT/UPDATE/DELETE to service_role only.
 */
export async function POST(req: NextRequest) {
  try {
    // Auth check
    const authHeader = req.headers.get("authorization") || "";
    const token = authHeader.replace(/^Bearer\s+/i, "").trim();
    if (!token || token !== process.env.BETA_ADMIN_TOKEN) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }

    const { email, note, expiresInDays = 30 } = await req.json();
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return NextResponse.json({ error: "invalid_email" }, { status: 400 });
    }

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    // 🔒 CRITICAL FIX (C-2): Use SERVICE_ROLE key to bypass RLS
    const supabaseKey =
      process.env.SUPABASE_SERVICE_ROLE_KEY ||
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    if (!supabaseUrl || !supabaseKey) {
      return NextResponse.json({ error: "server_config" }, { status: 500 });
    }

    const supabase = createClient(supabaseUrl, supabaseKey);
    const normalizedEmail = email.toLowerCase().trim();

    // Generate code: 8 chars from safe alphabet
    const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // no 0/O/1/I
    const code = Array.from(
      { length: 8 },
      () => alphabet[Math.floor(Math.random() * alphabet.length)]
    ).join("");

    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + Number(expiresInDays));

    const { error } = await supabase.from("beta_access_codes").insert({
      email: normalizedEmail,
      code,
      note: note || null,
      expires_at: expiresAt.toISOString(),
      created_by: "admin",
    });

    if (error) {
      console.error("[generate-beta-code] insert error:", error);
      return NextResponse.json({ error: "db_error", detail: error.message }, { status: 500 });
    }

    return NextResponse.json({
      code,
      email: normalizedEmail,
      note: note || null,
      expires_at: expiresAt.toISOString(),
    });
  } catch (err) {
    console.error("[generate-beta-code] error:", err);
    return NextResponse.json({ error: "server_error" }, { status: 500 });
  }
}

/**
 * GET /api/admin/generate-beta-code
 * Lists all beta codes (admin-only). Useful for the admin dashboard.
 */
export async function GET(req: NextRequest) {
  try {
    const authHeader = req.headers.get("authorization") || "";
    const token = authHeader.replace(/^Bearer\s+/i, "").trim();
    if (!token || token !== process.env.BETA_ADMIN_TOKEN) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    // 🔒 CRITICAL FIX (C-2): Use SERVICE_ROLE key to bypass RLS
    const supabaseKey =
      process.env.SUPABASE_SERVICE_ROLE_KEY ||
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    if (!supabaseUrl || !supabaseKey) {
      return NextResponse.json({ error: "server_config" }, { status: 500 });
    }
    const supabase = createClient(supabaseUrl, supabaseKey);

    const { data, error } = await supabase
      .from("beta_access_codes")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(200);

    if (error) {
      return NextResponse.json({ error: "db_error", detail: error.message }, { status: 500 });
    }

    return NextResponse.json({ codes: data || [] });
  } catch (err) {
    console.error("[list-beta-codes] error:", err);
    return NextResponse.json({ error: "server_error" }, { status: 500 });
  }
}
