import { NextRequest, NextResponse } from "next/server";
import { getAdminClient } from "@/lib/supabase-admin";

/**
 * API /api/profile — CRUD per la tabella user_profiles
 *
 * 🔒 FASE C: autenticate via NextAuth. Una riga per user_email (PK).
 *
 * GET    /api/profile           → profilo dell'utente autenticato
 * POST   /api/profile           → upsert (insert or update)
 * DELETE /api/profile           → cancella il profilo
 */

export async function GET() {
  const { supabase, email } = await getAdminClient();
  if (!supabase || !email) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const { data, error } = await supabase
    .from("user_profiles")
    .select("*")
    .eq("user_email", email)
    .maybeSingle();

  if (error) {
    console.error("[/api/profile GET]", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ profile: data });
}

export async function POST(req: NextRequest) {
  const { supabase, email } = await getAdminClient();
  if (!supabase || !email) {
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
          user_email: email,
          artist_name: artist_name || null,
          bio: bio || null,
          photo_url: photo_url || null,
          sc_link: sc_link || null,
          links: links || [],
          cyanite_api_token: cyanite_api_token || null,
          locale: locale || "it",
        },
        { onConflict: "user_email" }
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
  const { supabase, email } = await getAdminClient();
  if (!supabase || !email) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const { error } = await supabase
    .from("user_profiles")
    .delete()
    .eq("user_email", email);

  if (error) {
    console.error("[/api/profile DELETE]", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
