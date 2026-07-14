import { NextRequest, NextResponse } from "next/server";
import { getAdminClient } from "@/lib/supabase-admin";

/**
 * API /api/promotion-targets — CRUD per promotion_targets
 *
 * GET    /api/promotion-targets?release_id=<id>  → lista target per release
 * POST   /api/promotion-targets                   → upsert (insert or update status)
 */

export async function GET(req: NextRequest) {
  const { supabase, email, userId } = await getAdminClient();
  if (!supabase || !email || !userId) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const releaseId = searchParams.get("release_id");

  if (!releaseId) {
    return NextResponse.json({ error: "release_id required" }, { status: 400 });
  }

  const { data, error } = await supabase
    .from("promotion_targets")
    .select("*")
    .eq("user_id", userId)
    .eq("release_id", releaseId);

  if (error) {
    console.error("[/api/promotion-targets GET] DB error:", error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ targets: data || [] });
}

export async function POST(req: NextRequest) {
  const { supabase, email, userId } = await getAdminClient();
  if (!supabase || !email || !userId) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  try {
    const body = await req.json();
    const { release_id, artist_id, artist_name, status, notes, id } = body || {};

    if (!release_id || !artist_id || !artist_name) {
      return NextResponse.json({ error: "release_id, artist_id, artist_name required" }, { status: 400 });
    }

    const { data, error } = await supabase
      .from("promotion_targets")
      .upsert(
        {
          id: id || `${release_id}_${artist_id}`,
          user_id: userId,
          release_id,
          artist_id,
          artist_name,
          status: status || "pending",
          notes: notes || null,
        },
        { onConflict: "user_id, release_id, artist_id" }
      )
      .select()
      .single();

    if (error) {
      console.error("[/api/promotion-targets POST] DB error:", error.message);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ target: data });
  } catch (err: any) {
    console.error("[/api/promotion-targets POST] exception:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
