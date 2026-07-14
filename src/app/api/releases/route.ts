import { NextRequest, NextResponse } from "next/server";
import { getAdminClient } from "@/lib/supabase-admin";

/**
 * API /api/releases — CRUD per la tabella user_releases
 *
 * GET    /api/releases              → lista tutte le release dell'utente
 * POST   /api/releases              → crea una nuova release
 * PATCH  /api/releases?id=<id>      → aggiorna una release esistente
 * DELETE /api/releases?id=<id>      → cancella una release
 */

export async function GET() {
  const { supabase, email, userId } = await getAdminClient();
  if (!supabase || !email || !userId) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const { data, error } = await supabase
    .from("user_releases")
    .select("*")
    .eq("user_id", userId)
    .order("created_at", { ascending: false });

  if (error) {
    console.error("[/api/releases GET]", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ releases: data || [] });
}

export async function POST(req: NextRequest) {
  const { supabase, email, userId } = await getAdminClient();
  if (!supabase || !email || !userId) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  try {
    const body = await req.json();
    const { id, type, title, artists, track_ids, genre, notes, ep_soundcloud_url, label, beatport_url, promo_link, spotify_url } = body || {};

    const finalId = id || `release_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    if (!title) {
      return NextResponse.json({ error: "Missing required field: title" }, { status: 400 });
    }

    const { data, error } = await supabase
      .from("user_releases")
      .insert({
        id: String(finalId),
        user_id: userId,
        type: type || "ep",
        title: String(title),
        artists: Array.isArray(artists) ? artists : [],
        track_ids: Array.isArray(track_ids) ? track_ids : [],
        genre: genre || null,
        notes: notes || null,
        ep_soundcloud_url: ep_soundcloud_url || null,
        label: label || null,
        beatport_url: beatport_url || null,
        promo_link: promo_link || null,
        spotify_url: spotify_url || null,
      })
      .select()
      .single();

    if (error) {
      console.error("[/api/releases POST]", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ release: data });
  } catch (err) {
    console.error("[/api/releases POST] exception:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  const { supabase, email, userId } = await getAdminClient();
  if (!supabase || !email || !userId) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const id = searchParams.get("id");
  if (!id) {
    return NextResponse.json({ error: "Missing id" }, { status: 400 });
  }

  try {
    const updates = await req.json();
    delete updates.id;
    delete updates.user_id;
    delete updates.created_at;

    const { data, error } = await supabase
      .from("user_releases")
      .update(updates)
      .eq("id", id)
      .eq("user_id", userId)
      .select()
      .single();

    if (error) {
      console.error("[/api/releases PATCH]", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    if (!data) {
      return NextResponse.json({ error: "Release not found" }, { status: 404 });
    }

    return NextResponse.json({ release: data });
  } catch (err) {
    console.error("[/api/releases PATCH] exception:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  const { supabase, email, userId } = await getAdminClient();
  if (!supabase || !email || !userId) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const id = searchParams.get("id");
  if (!id) {
    return NextResponse.json({ error: "Missing id" }, { status: 400 });
  }

  try {
    const { data, error } = await supabase
      .from("user_releases")
      .delete()
      .eq("id", id)
      .eq("user_id", userId)
      .select();

    if (error) {
      console.error("[/api/releases DELETE]", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, count: data?.length || 0 });
  } catch (err) {
    console.error("[/api/releases DELETE] exception:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
