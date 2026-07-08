import { NextRequest, NextResponse } from "next/server";
import { getAdminClient } from "@/lib/supabase-admin";

/**
 * API /api/profile — CRUD per la tabella user_profiles
 *
 * 🔒 FASE C: autenticate via NextAuth. Una riga per user_id (PK).
 *
 * GET    /api/profile           → profilo dell'utente autenticato
 * POST   /api/profile           → upsert (insert or update)
 * DELETE /api/profile           → cancella il profilo
 */

export async function GET() {
  const { supabase, email, userId, useRls } = await getAdminClient();
  if (!supabase || !email || !userId) {
    console.error("[/api/profile GET] Auth failed — no supabase client or email. Check SUPABASE_SERVICE_ROLE_KEY on Vercel.");
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  console.log(`[/api/profile GET] email=${email} useRls=${useRls}`);

  const { data, error } = await supabase
    .from("user_profiles")
    .select("*")
    .eq("user_id", userId)
    .maybeSingle();

  if (error) {
    console.error("[/api/profile GET] DB error:", error.message, "(code=" + error.code + ")");
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ profile: data });
}

export async function POST(req: NextRequest) {
  const { supabase, email, userId } = await getAdminClient();
  if (!supabase || !email || !userId) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  try {
    const body = await req.json();
    const {
      artist_name, bio, photo_url, sc_link, links, cyanite_api_token, locale,
    } = body || {};

    const { data, error } = await supabase
      .from("user_profiles")
      .upsert(
        {
          user_id: userId,
          artist_name: artist_name || null,
          bio: bio || null,
          photo_url: photo_url || null,
          sc_link: sc_link || null,
          links: links || [],
          cyanite_api_token: cyanite_api_token || null,
          locale: locale || "it",
        },
        { onConflict: "user_id" }
      )
      .select()
      .single();

    if (error) {
      console.error("[/api/profile POST]", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ profile: data });
  } catch (err: any) {
    console.error("[/api/profile POST] exception:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function DELETE() {
  const { supabase, email, userId } = await getAdminClient();
  if (!supabase || !email || !userId) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const { error } = await supabase
    .from("user_profiles")
    .delete()
    .eq("user_id", userId);

  if (error) {
    console.error("[/api/profile DELETE]", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
