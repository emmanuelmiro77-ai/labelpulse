import { NextRequest, NextResponse } from "next/server";
import { getAdminClient } from "@/lib/supabase-admin";

/**
 * API /api/pitches — CRUD per la tabella pitch_campaigns
 *
 * 🔒 FASE C: autenticate via NextAuth.
 * status = 'draft' (bozze) | 'sent' (inviate)
 *
 * GET    /api/pitches                  → lista tutti i pitch (draft + sent)
 * GET    /api/pitches?status=draft     → solo bozze
 * GET    /api/pitches?status=sent      → solo inviate
 * POST   /api/pitches                  → crea nuovo pitch
 * PATCH  /api/pitches?id=<id>          → aggiorna (es. segna come sent)
 * DELETE /api/pitches?id=<id>          → cancella
 */

export async function GET(req: NextRequest) {
  const { supabase, email } = await getAdminClient();
  if (!supabase || !email) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const status = searchParams.get("status");

  let query = supabase
    .from("pitch_campaigns")
    .select("*")
    .eq("user_email", email)
    .order("created_at", { ascending: false });

  if (status === "draft" || status === "sent") {
    query = query.eq("status", status);
  }

  const { data, error } = await query;

  if (error) {
    console.error("[/api/pitches GET]", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ pitches: data || [] });
}

export async function POST(req: NextRequest) {
  const { supabase, email } = await getAdminClient();
  if (!supabase || !email) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  try {
    const body = await req.json();
    const {
      id, label_id, label_name, demo_id, subject, body: pitchBody,
      pitch_tracks, ep_link_mode, ep_soundcloud_url, status, sent_at, sent_method,
    } = body || {};

    if (!id) {
      return NextResponse.json({ error: "Missing id" }, { status: 400 });
    }

    const { data, error } = await supabase
      .from("pitch_campaigns")
      .insert({
        id: String(id),
        user_email: email,
        label_id: label_id || null,
        label_name: label_name || null,
        demo_id: demo_id || null,
        subject: subject || null,
        body: pitchBody || null,
        pitch_tracks: pitch_tracks || null,
        ep_link_mode: ep_link_mode || null,
        ep_soundcloud_url: ep_soundcloud_url || null,
        status: status || "draft",
        sent_at: sent_at || null,
        sent_method: sent_method || null,
      })
      .select()
      .single();

    if (error) {
      console.error("[/api/pitches POST]", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ pitch: data });
  } catch (err: any) {
    console.error("[/api/pitches POST] exception:", err);
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
    delete updates.id;
    delete updates.user_email;
    delete updates.created_at;

    const { data, error } = await supabase
      .from("pitch_campaigns")
      .update(updates)
      .eq("id", id)
      .eq("user_email", email)
      .select()
      .single();

    if (error) {
      console.error("[/api/pitches PATCH]", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    if (!data) {
      return NextResponse.json({ error: "Pitch not found" }, { status: 404 });
    }

    return NextResponse.json({ pitch: data });
  } catch (err: any) {
    console.error("[/api/pitches PATCH] exception:", err);
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
    .from("pitch_campaigns")
    .delete()
    .eq("id", id)
    .eq("user_email", email);

  if (error) {
    console.error("[/api/pitches DELETE]", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
