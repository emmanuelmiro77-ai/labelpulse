import { NextRequest, NextResponse } from "next/server";
import { getAdminClient } from "@/lib/supabase-admin";

/**
 * API /api/demos — CRUD per la tabella demo_submissions
 *
 * 🔒 FASE C: tutte le operazioni sono autenticate via NextAuth session.
 * L'email della sessione viene usata come partition key.
 * Impossibile leggere/scrivere demo di un altro utente.
 *
 * GET    /api/demos              → lista tutti i demo dell'utente
 * POST   /api/demos              → crea un nuovo demo (id generato client)
 * PATCH  /api/demos?id=<id>      → aggiorna un demo esistente
 * DELETE /api/demos?id=<id>      → cancella un demo
 */

export async function GET() {
  const { supabase, email } = await getAdminClient();
  if (!supabase || !email) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const { data, error } = await supabase
    .from("demo_submissions")
    .select("*")
    .eq("user_email", email)
    .order("created_at", { ascending: false });

  if (error) {
    console.error("[/api/demos GET]", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ demos: data || [] });
}

export async function POST(req: NextRequest) {
  const { supabase, email } = await getAdminClient();
  if (!supabase || !email) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  try {
    const body = await req.json();
    const {
      id, label_id, label_name, track_name, artist_name, link,
      status, sent_date, pitch_text, pitch_subject, pitch_tracks,
      notes, parent_release_id,
    } = body || {};

    if (!id || !label_id || !track_name) {
      return NextResponse.json(
        { error: "Missing required fields: id, label_id, track_name" },
        { status: 400 }
      );
    }

    const { data, error } = await supabase
      .from("demo_submissions")
      .insert({
        id: String(id),
        user_email: email,
        label_id: String(label_id),
        label_name: label_name || null,
        track_name: String(track_name),
        artist_name: artist_name || null,
        link: link || null,
        status: status || "ready",
        sent_date: sent_date || null,
        pitch_text: pitch_text || null,
        pitch_subject: pitch_subject || null,
        pitch_tracks: pitch_tracks || null,
        notes: notes || null,
        parent_release_id: parent_release_id || null,
      })
      .select()
      .single();

    if (error) {
      console.error("[/api/demos POST]", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ demo: data });
  } catch (err: any) {
    console.error("[/api/demos POST] exception:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  const { supabase, email } = await getAdminClient();
  if (!supabase || !email) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const id = searchParams.get("id");
  if (!id) {
    return NextResponse.json({ error: "Missing id" }, { status: 400 });
  }

  try {
    const updates = await req.json();
    // Remove fields that should never be updated via PATCH
    delete updates.id;
    delete updates.user_email;
    delete updates.created_at;

    const { data, error } = await supabase
      .from("demo_submissions")
      .update(updates)
      .eq("id", id)
      .eq("user_email", email)
      .select()
      .single();

    if (error) {
      console.error("[/api/demos PATCH]", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    if (!data) {
      return NextResponse.json({ error: "Demo not found (or not owned by user)" }, { status: 404 });
    }

    return NextResponse.json({ demo: data });
  } catch (err: any) {
    console.error("[/api/demos PATCH] exception:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  const { supabase, email } = await getAdminClient();
  if (!supabase || !email) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const id = searchParams.get("id");
  if (!id) {
    return NextResponse.json({ error: "Missing id" }, { status: 400 });
  }

  const { error } = await supabase
    .from("demo_submissions")
    .delete()
    .eq("id", id)
    .eq("user_email", email);

  if (error) {
    console.error("[/api/demos DELETE]", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
