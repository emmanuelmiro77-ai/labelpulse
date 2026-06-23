import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

/**
 * POST /api/auth/beta-verify
 * Body: { email: string, code: string }
 *
 * Verifies a beta access code against the `beta_access_codes` Supabase table.
 * Called internally by NextAuth CredentialsProvider.
 *
 * Returns: { valid: boolean, displayName?: string }
 *
 * On success, marks the code as used (used_at = NOW()).
 * A code can be used only ONCE.
 */
export async function POST(req: NextRequest) {
  try {
    const { email, code } = await req.json();
    if (!email || !code) {
      return NextResponse.json({ valid: false, error: "missing_fields" }, { status: 400 });
    }

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    if (!supabaseUrl || !supabaseAnonKey) {
      console.error("[beta-verify] Supabase env vars not set");
      return NextResponse.json({ valid: false, error: "server_config" }, { status: 500 });
    }

    const supabase = createClient(supabaseUrl, supabaseAnonKey);

    const normalizedEmail = String(email).toLowerCase().trim();
    const normalizedCode = String(code).toUpperCase().trim();

    // Look up the code
    const { data, error } = await supabase
      .from("beta_access_codes")
      .select("id, email, code, used_at, expires_at, note")
      .eq("email", normalizedEmail)
      .eq("code", normalizedCode)
      .is("used_at", null)
      .gt("expires_at", new Date().toISOString())
      .maybeSingle();

    if (error) {
      console.error("[beta-verify] Supabase error:", error);
      return NextResponse.json({ valid: false, error: "db_error" }, { status: 500 });
    }

    if (!data) {
      // Maybe code exists but already used or expired — give a clearer error
      const { data: existing } = await supabase
        .from("beta_access_codes")
        .select("id, used_at, expires_at")
        .eq("email", normalizedEmail)
        .eq("code", normalizedCode)
        .maybeSingle();
      if (existing?.used_at) {
        return NextResponse.json({ valid: false, error: "already_used" });
      }
      if (existing && new Date(existing.expires_at) < new Date()) {
        return NextResponse.json({ valid: false, error: "expired" });
      }
      return NextResponse.json({ valid: false, error: "not_found" });
    }

    // Mark as used
    const { error: updateErr } = await supabase
      .from("beta_access_codes")
      .update({ used_at: new Date().toISOString() })
      .eq("id", data.id);
    if (updateErr) {
      console.error("[beta-verify] Failed to mark used:", updateErr);
      // Continue anyway — code is valid, login should succeed
    }

    return NextResponse.json({
      valid: true,
      displayName: data.note || normalizedEmail.split("@")[0],
    });
  } catch (err) {
    console.error("[beta-verify] error:", err);
    return NextResponse.json({ valid: false, error: "server_error" }, { status: 500 });
  }
}
