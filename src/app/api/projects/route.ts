import { NextRequest, NextResponse } from "next/server";
import { getAdminClient } from "@/lib/supabase-admin";

/**
 * API /api/projects — CRUD per la tabella `projects` (Phase 1 Foundation)
 *
 * 🔒 Phase 1: entità ISOLATA. Nessun join con demo_submissions,
 * user_releases, promotion_targets, pitch_campaigns.
 *
 * Tutte le operazioni sono autenticate via NextAuth session.
 * Lo userId della sessione viene usato come partition key (RLS).
 * Impossibile leggere/scrivere project di un altro utente.
 *
 * GET    /api/projects              → lista tutti i project dell'utente (ordinati per created_at DESC)
 * POST   /api/projects              → crea un nuovo project (id generato client o server)
 * PATCH  /api/projects?id=<id>      → aggiorna un project esistente
 * DELETE /api/projects?id=<id>      → cancella un project
 */

// Colonne validi per la PATCH. Filtriamo esplicitamente per evitare che
// campi non previsti (id, user_id, created_at) vengano sovrascritti.
const PATCHABLE_COLUMNS = [
  "title",
  "artist",
  "status",
  "source_url",
] as const;

export async function GET() {
  const { supabase, email, userId } = await getAdminClient();
  if (!supabase || !email || !userId) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const { data, error } = await supabase
    .from("projects")
    .select("*")
    .eq("user_id", userId)
    .order("created_at", { ascending: false });

  if (error) {
    console.error("[/api/projects GET]", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ projects: data || [] });
}

export async function POST(req: NextRequest) {
  const { supabase, email, userId } = await getAdminClient();
  if (!supabase || !email || !userId) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  try {
    const body = await req.json();
    const { id, title, artist, status, source_url } = body || {};

    if (!title || typeof title !== "string" || title.trim() === "") {
      return NextResponse.json(
        { error: "Missing required field: title" },
        { status: 400 },
      );
    }

    const finalId =
      id && typeof id === "string" && id.trim() !== ""
        ? String(id)
        : `proj_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

    const { data, error } = await supabase
      .from("projects")
      .insert({
        id: finalId,
        user_id: userId,
        title: String(title).trim(),
        artist: typeof artist === "string" ? artist : "",
        status: typeof status === "string" && status ? status : "idea",
        source_url: typeof source_url === "string" && source_url ? source_url : null,
      })
      .select()
      .single();

    if (error) {
      console.error("[/api/projects POST]", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ project: data });
  } catch (err) {
    console.error("[/api/projects POST] exception:", err);
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

    // Filtra SOLO i campi validi della tabella projects.
    const updates: Record<string, unknown> = {};
    for (const key of PATCHABLE_COLUMNS) {
      if (rawUpdates[key] !== undefined) {
        updates[key] = rawUpdates[key];
      }
    }
    // Campi immutabili: mai sovrascrivibili via PATCH.
    delete updates.id;
    delete updates.user_id;
    delete updates.created_at;

    if (Object.keys(updates).length === 0) {
      return NextResponse.json(
        { error: "No valid fields to update" },
        { status: 400 },
      );
    }

    const { data, error } = await supabase
      .from("projects")
      .update(updates)
      .eq("id", id)
      .eq("user_id", userId)
      .select()
      .single();

    if (error) {
      console.error("[/api/projects PATCH]", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    if (!data) {
      return NextResponse.json(
        { error: "Project not found (or not owned by user)" },
        { status: 404 },
      );
    }

    return NextResponse.json({ project: data });
  } catch (err) {
    console.error("[/api/projects PATCH] exception:", err);
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
      .from("projects")
      .delete()
      .eq("id", id)
      .eq("user_id", userId)
      .select();

    if (error) {
      console.error("[/api/projects DELETE]", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, count: data?.length || 0 });
  } catch (err) {
    console.error("[/api/projects DELETE] exception:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
