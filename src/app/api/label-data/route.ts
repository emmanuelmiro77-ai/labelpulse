import { NextRequest, NextResponse } from "next/server";
import { getAdminClient } from "@/lib/supabase-admin";

/**
 * API /api/label-data — CRUD per la tabella label_personal_data
 *
 * 🔒 FASE C: tutte le operazioni autenticate via NextAuth.
 * Una riga per (user_id, label_id). Se l'utente non ha personalizzato
 * una label, non c'è riga.
 *
 * GET    /api/label-data                  → lista tutte le label personalizzate
 * GET    /api/label-data?label_id=<id>    → singola label personalizzata
 * POST   /api/label-data                  → upsert (insert or update)
 * PATCH  /api/label-data?label_id=<id>    → aggiorna (partial)
 * DELETE /api/label-data?label_id=<id>    → cancella
 */

export async function GET(req: NextRequest) {
  const { supabase, email, userId, useRls } = await getAdminClient();
  if (!supabase || !email || !userId) {
    console.error("[/api/label-data GET] Auth failed — no supabase client or email. Check SUPABASE_SERVICE_ROLE_KEY on Vercel.");
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const labelId = searchParams.get("label_id");

  if (labelId) {
    const { data, error } = await supabase
      .from("label_personal_data")
      .select("*")
      .eq("user_id", userId)
      .eq("label_id", labelId)
      .maybeSingle();

    if (error) {
      console.error("[/api/label-data GET single] DB error:", error.message, "(code=" + error.code + ")");
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    return NextResponse.json({ label_data: data });
  }

  const { data, error } = await supabase
    .from("label_personal_data")
    .select("*")
    .eq("user_id", userId);

  if (error) {
    console.error("[/api/label-data GET all] DB error:", error.message, "(code=" + error.code + ")");
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  console.log(`[/api/label-data GET all] email=${email} useRls=${useRls} returned=${data?.length || 0} rows`);
  return NextResponse.json({ labels: data || [] });
}

export async function POST(req: NextRequest) {
  const { supabase, email, userId } = await getAdminClient();
  if (!supabase || !email || !userId) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  try {
    const body = await req.json();
    const localUpdatedAt = body?.local_updated_at;
    const {
      label_id, emails, notes, status, website, demo_link,
      social_link, soundcloud_link, beatport_link, contact_info,
      custom_links, is_custom, custom_name, custom_genre, is_favorite,
    } = body || {};

    // [DEBUG custom_name] Point 4: POST /api/label-data — received payload
    console.log("[DEBUG custom_name] 4. POST /api/label-data received", {
      label_id,
      custom_name_received: custom_name,
      is_custom_received: is_custom,
      fullBody: body,
    });

    if (!label_id) {
      return NextResponse.json({ error: "Missing label_id" }, { status: 400 });
    }

    // 🔒 RACE CONDITION FIX: Pre-flight timestamp check
    if (localUpdatedAt) {
      const { data: existing } = await supabase
        .from("label_personal_data")
        .select("updated_at")
        .eq("user_id", userId)
        .eq("label_id", String(label_id))
        .maybeSingle();
      
      if (existing?.updated_at) {
        const cloudTime = new Date(existing.updated_at).getTime();
        const localTime = new Date(localUpdatedAt).getTime();
        if (cloudTime > localTime) {
          console.warn(`[/api/label-data POST] 409 Conflict — cloud > local for label ${label_id}`);
          return NextResponse.json({
            error: "conflict",
            message: "Cloud has newer data — local write rejected",
            cloud_updated_at: existing.updated_at,
          }, { status: 409 });
        }
      }
    }

    // Build the upsert payload
    const upsertPayload = {
      user_id: userId,
      label_id: String(label_id),
      emails: emails || [],
      notes: notes || null,
      status: status || "unknown",
      website: website || null,
      demo_link: demo_link || null,
      social_link: social_link || null,
      soundcloud_link: soundcloud_link || null,
      beatport_link: beatport_link || null,
      contact_info: contact_info || null,
      custom_links: custom_links || [],
      is_custom: is_custom || false,
      custom_name: custom_name || null,
      custom_genre: custom_genre || null,
      is_favorite: is_favorite ?? false,
    };

    // [DEBUG custom_name] Point 4b: payload sent to Supabase
    console.log("[DEBUG custom_name] 4b. POST /api/label-data supabase payload", {
      label_id,
      custom_name_in_upsert: upsertPayload.custom_name,
      is_custom_in_upsert: upsertPayload.is_custom,
      fullUpsertPayload: upsertPayload,
    });

    // Upsert: insert or update on conflict (user_id, label_id)
    const { data, error } = await supabase
      .from("label_personal_data")
      .upsert(upsertPayload, { onConflict: "user_id,label_id" })
      .select()
      .single();

    // [DEBUG custom_name] Point 4c: Supabase response
    console.log("[DEBUG custom_name] 4c. POST /api/label-data supabase response", {
      label_id,
      custom_name_in_response: data?.custom_name,
      is_custom_in_response: data?.is_custom,
      error: error?.message,
      fullResponse: data,
    });

    if (error) {
      console.error("[/api/label-data POST]", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ label_data: data });
  } catch (err: any) {
    console.error("[/api/label-data POST] exception:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  const { supabase, email, userId } = await getAdminClient();
  if (!supabase || !email || !userId) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const labelId = searchParams.get("label_id");
  if (!labelId) {
    return NextResponse.json({ error: "Missing label_id" }, { status: 400 });
  }

  try {
    const updates = await req.json();
    delete updates.id;
    delete updates.user_id;
    delete updates.label_id;
    delete updates.created_at;

    const { data, error } = await supabase
      .from("label_personal_data")
      .update(updates)
      .eq("user_id", userId)
      .eq("label_id", labelId)
      .select()
      .single();

    if (error) {
      console.error("[/api/label-data PATCH]", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    if (!data) {
      return NextResponse.json({ error: "Label data not found" }, { status: 404 });
    }

    return NextResponse.json({ label_data: data });
  } catch (err: any) {
    console.error("[/api/label-data PATCH] exception:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  const { supabase, email, userId } = await getAdminClient();
  if (!supabase || !email || !userId) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const labelId = searchParams.get("label_id");
  if (!labelId) {
    return NextResponse.json({ error: "Missing label_id" }, { status: 400 });
  }

  const { error } = await supabase
    .from("label_personal_data")
    .delete()
    .eq("user_id", userId)
    .eq("label_id", labelId);

  if (error) {
    console.error("[/api/label-data DELETE]", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
