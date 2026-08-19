import { NextRequest, NextResponse } from "next/server";
import { getAdminClient } from "@/lib/supabase-admin";

/**
 * API /api/project-target-artists — CRUD per la tabella `project_target_artists`
 *
 * 🔒 WP-009: relazione Project ↔ Artist. Entità ISOLATA in questo task:
 * nessun collegamento automatico con Lifecycle Engine o UI.
 *
 * Tutte le operazioni sono autenticate via NextAuth session.
 * Lo userId della sessione viene usato come partition key (RLS).
 * Impossibile leggere/scrivere target artist di un altro utente.
 *
 * GET    /api/project-target-artists?project_id=<id>  → lista target artist per project
 * POST   /api/project-target-artists                  → crea una nuova target artist
 * PATCH  /api/project-target-artists?id=<id>          → aggiorna una target artist esistente
 * DELETE /api/project-target-artists?id=<id>          → cancella una target artist
 */

// Colonne mutabili via PATCH. Filtriamo esplicitamente per evitare
// sovrascritture di campi immutabili (id, user_id, project_id, created_at).
const PATCHABLE_COLUMNS = ["artist_id"] as const;

export async function GET(req: NextRequest) {
  const { supabase, email, userId } = await getAdminClient();
  if (!supabase || !email || !userId) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const projectId = searchParams.get("project_id");

  if (!projectId) {
    return NextResponse.json(
      { error: "project_id required" },
      { status: 400 },
    );
  }

  const { data, error } = await supabase
    .from("project_target_artists")
    .select("*")
    .eq("user_id", userId)
    .eq("project_id", projectId)
    .order("created_at", { ascending: true });

  if (error) {
    console.error("[/api/project-target-artists GET]", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ targetArtists: data || [] });
}

export async function POST(req: NextRequest) {
  const { supabase, email, userId } = await getAdminClient();
  if (!supabase || !email || !userId) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  try {
    const body = await req.json();
    const { id, project_id, artist_id } = body || {};

    if (
      !project_id ||
      typeof project_id !== "string" ||
      project_id.trim() === ""
    ) {
      return NextResponse.json(
        { error: "Missing required field: project_id" },
        { status: 400 },
      );
    }
    if (!artist_id || typeof artist_id !== "string" || artist_id.trim() === "") {
      return NextResponse.json(
        { error: "Missing required field: artist_id" },
        { status: 400 },
      );
    }

    const finalId =
      id && typeof id === "string" && id.trim() !== ""
        ? String(id)
        : `pta_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

    const { data, error } = await supabase
      .from("project_target_artists")
      .insert({
        id: finalId,
        user_id: userId,
        project_id: String(project_id).trim(),
        artist_id: String(artist_id).trim(),
      })
      .select()
      .single();

    if (error) {
      console.error("[/api/project-target-artists POST]", error);
      // 23505 = unique_violation: la (user_id, project_id, artist_id) esiste già
      if (error.code === "23505") {
        return NextResponse.json(
          {
            error: "Target artist already exists for this project",
            code: error.code,
          },
          { status: 409 },
        );
      }
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ targetArtist: data });
  } catch (err) {
    console.error("[/api/project-target-artists POST] exception:", err);
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
    const rawUpdates = await req.json();

    // Filtra SOLO i campi mutabili.
    const updates: Record<string, unknown> = {};
    for (const key of PATCHABLE_COLUMNS) {
      if (rawUpdates[key] !== undefined) {
        updates[key] = rawUpdates[key];
      }
    }
    // Campi immutabili: mai sovrascrivibili via PATCH.
    delete updates.id;
    delete updates.user_id;
    delete updates.project_id;
    delete updates.created_at;

    if (Object.keys(updates).length === 0) {
      return NextResponse.json(
        { error: "No valid fields to update" },
        { status: 400 },
      );
    }

    // Sanitizza artist_id se presente.
    if ("artist_id" in updates && typeof updates.artist_id === "string") {
      updates.artist_id = updates.artist_id.trim();
    }

    const { data, error } = await supabase
      .from("project_target_artists")
      .update(updates)
      .eq("id", id)
      .eq("user_id", userId)
      .select()
      .single();

    if (error) {
      console.error("[/api/project-target-artists PATCH]", error);
      if (error.code === "23505") {
        return NextResponse.json(
          {
            error: "Target artist already exists for this project",
            code: error.code,
          },
          { status: 409 },
        );
      }
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    if (!data) {
      return NextResponse.json(
        { error: "Target artist not found (or not owned by user)" },
        { status: 404 },
      );
    }

    return NextResponse.json({ targetArtist: data });
  } catch (err) {
    console.error("[/api/project-target-artists PATCH] exception:", err);
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
      .from("project_target_artists")
      .delete()
      .eq("id", id)
      .eq("user_id", userId)
      .select();

    if (error) {
      console.error("[/api/project-target-artists DELETE]", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, count: data?.length || 0 });
  } catch (err) {
    console.error("[/api/project-target-artists DELETE] exception:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
