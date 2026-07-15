import { NextRequest, NextResponse } from "next/server";
import { getAdminClient } from "@/lib/supabase-admin";

/**
 * API /api/artist-contacts — CRUD per DJ contacts (CRM)
 *
 * GET    /api/artist-contacts?artist_id=<id>  → contatti per artista
 * POST   /api/artist-contacts                   → upsert (insert or update)
 */

export async function GET(req: NextRequest) {
  const { supabase, email, userId } = await getAdminClient();
  if (!supabase || !email || !userId) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const artistId = searchParams.get("artist_id");

  if (!artistId) {
    // Return all contacts for this user
    const { data, error } = await supabase
      .from("artist_contacts")
      .select("*")
      .eq("user_id", userId)
      .order("updated_at", { ascending: false });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    return NextResponse.json({ contacts: data || [] });
  }

  const { data, error } = await supabase
    .from("artist_contacts")
    .select("*")
    .eq("user_id", userId)
    .eq("artist_id", artistId)
    .maybeSingle();

  console.log(`[DEBUG /api/artist-contacts GET] ${new Date().toISOString()}`, {
    userId, artistId,
    hasData: !!data, error: error?.message,
  });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ contact: data || null });
}

export async function POST(req: NextRequest) {
  const { supabase, email, userId } = await getAdminClient();
  if (!supabase || !email || !userId) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  try {
    const body = await req.json();
    const { artist_id, artist_name, instagram, beatport, website, soundcloud, spotify,
            resident_advisor, booking_email, management_email, contact_email, notes,
            last_dm, last_contact_at, id } = body || {};

    console.log(`[DEBUG /api/artist-contacts POST] ${new Date().toISOString()}`, {
      userId, artist_id, artist_name,
      hasInstagram: !!instagram, hasBeatport: !!beatport, hasNotes: !!notes,
      body,
    });

    if (!artist_id || !artist_name) {
      console.log(`[DEBUG /api/artist-contacts POST] MISSING artist_id or artist_name`);
      return NextResponse.json({ error: "artist_id and artist_name required" }, { status: 400 });
    }

    const upsertData = {
      id: id || `contact_${artist_id}`,
      user_id: userId,
      artist_id,
      artist_name,
      instagram: instagram || null,
      beatport: beatport || null,
      website: website || null,
      soundcloud: soundcloud || null,
      spotify: spotify || null,
      resident_advisor: resident_advisor || null,
      booking_email: booking_email || null,
      management_email: management_email || null,
      contact_email: contact_email || null,
      notes: notes || null,
      last_dm: last_dm || null,
      last_contact_at: last_contact_at || null,
    };

    console.log(`[DEBUG /api/artist-contacts POST] upsertData`, upsertData);

    const { data, error } = await supabase
      .from("artist_contacts")
      .upsert(upsertData, { onConflict: "user_id, artist_id" })
      .select()
      .single();

    if (error) {
      console.error(`[DEBUG /api/artist-contacts POST] SUPABASE ERROR`, {
        message: error.message,
        code: error.code,
        details: error.details,
        hint: error.hint,
      });
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    console.log(`[DEBUG /api/artist-contacts POST] SUPABASE SUCCESS`, {
      dataId: data?.id, dataArtistId: data?.artist_id,
    });
    return NextResponse.json({ contact: data });
  } catch (err: any) {
    console.error(`[DEBUG /api/artist-contacts POST] EXCEPTION`, err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
