import { NextRequest, NextResponse } from "next/server";
import { getAdminClient } from "@/lib/supabase-admin";

/**
 * API /api/artist-custom — CRUD per artist_custom_data
 */

export async function GET() {
  const { supabase, email, userId } = await getAdminClient();
  if (!supabase || !email || !userId) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const { data, error } = await supabase
    .from("artist_custom_data")
    .select("*")
    .eq("user_id", userId)
    .order("created_at", { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ artists: data || [] });
}

export async function POST(req: NextRequest) {
  const { supabase, email, userId } = await getAdminClient();
  if (!supabase || !email || !userId) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  try {
    const body = await req.json();
    const { id, artist_name, beatport_artist_id, beatport_url, image_url,
            instagram_url, spotify_url, soundcloud_url, website_url,
            email: contactEmail, notes } = body || {};

    if (!artist_name) {
      return NextResponse.json({ error: "artist_name required" }, { status: 400 });
    }

    const finalId = id || `custom_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

    const { data, error } = await supabase
      .from("artist_custom_data")
      .upsert({
        id: finalId,
        user_id: userId,
        artist_name,
        beatport_artist_id: beatport_artist_id || null,
        beatport_url: beatport_url || null,
        image_url: image_url || null,
        instagram_url: instagram_url || null,
        spotify_url: spotify_url || null,
        soundcloud_url: soundcloud_url || null,
        website_url: website_url || null,
        email: contactEmail || null,
        notes: notes || null,
      })
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    return NextResponse.json({ artist: data });
  } catch (err: any) {
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
    return NextResponse.json({ error: "id required" }, { status: 400 });
  }

  const { error } = await supabase
    .from("artist_custom_data")
    .delete()
    .eq("id", id)
    .eq("user_id", userId);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
