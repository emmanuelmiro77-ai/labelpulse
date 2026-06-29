import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth-options";

/**
 * API /api/admin/push-rankings
 *
 * 🔒 ADMIN-ONLY: pusha le classifiche Beatport aggiornate direttamente
 * nella riga 'global' di app_state. NON passa dal localStorage.
 *
 * Flusso corretto:
 * 1. Admin fa scrape Beatport da qualsiasi dispositivo
 * 2. Le label con rank vengono inviate qui (POST)
 * 3. Questa API salva direttamente nel cloud (riga global)
 * 4. Tutti gli utenti vedono le classifiche aggiornate al prossimo login/realtime
 *
 * Body:
 *   {
 *     labels: Label[],              // label con rankByGenre, pointsByGenre, etc.
 *     rankingSnapshots: Snapshot[], // storico classifiche
 *     rankingsUpdatedAt: string     // ISO timestamp
 *   }
 */

const ADMIN_EMAILS = new Set([
  "emmanuel.miro77@gmail.com",
]);

export async function POST(req: NextRequest) {
  // Auth check — solo admin
  const session = await getServerSession(authOptions as any);
  const email = session?.user?.email?.toLowerCase().trim();
  if (!email || !ADMIN_EMAILS.has(email)) {
    return NextResponse.json({ error: "unauthorized — admin only" }, { status: 401 });
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceKey) {
    return NextResponse.json({ error: "server_config" }, { status: 500 });
  }

  try {
    const body = await req.json();
    const { labels, rankingSnapshots, rankingsUpdatedAt } = body;

    if (!Array.isArray(labels)) {
      return NextResponse.json({ error: "labels must be an array" }, { status: 400 });
    }

    const supabase = createClient(supabaseUrl, serviceKey);

    // Costruisci il payload globale (solo campi Beatport, niente dati personali)
    const globalPayload = {
      labels: labels.map((l: any) => ({
        id: l.id,
        name: l.name,
        genres: l.genres || (l.genre ? [l.genre] : []),
        rankByGenre: l.rankByGenre || {},
        pointsByGenre: l.pointsByGenre || {},
        trending: l.trending || false,
        trendingRankByGenre: l.trendingRankByGenre || {},
        trendingPointsByGenre: l.trendingPointsByGenre || {},
        imageUrl: l.imageUrl || null,
        slug: l.slug || null,
        beatportId: l.beatportId || null,
        prevRankByGenre: l.prevRankByGenre || {},
      })),
      rankingSnapshots: Array.isArray(rankingSnapshots) ? rankingSnapshots : [],
      rankingsUpdatedAt: rankingsUpdatedAt || new Date().toISOString(),
      lastGlobalUpdate: new Date().toISOString(),
    };

    console.log(`[push-rankings] Admin ${email} pushing ${globalPayload.labels.length} labels, ${globalPayload.rankingSnapshots.length} snapshots`);

    // Upsert nella riga global
    const { error } = await supabase.from("app_state").upsert(
      {
        id: "global",
        data: globalPayload,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "id" }
    );

    if (error) {
      console.error("[push-rankings] Supabase error:", error.message);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    console.log("[push-rankings] ✅ Global rankings updated in cloud");

    return NextResponse.json({
      ok: true,
      labelsPushed: globalPayload.labels.length,
      snapshotsPushed: globalPayload.rankingSnapshots.length,
      updatedAt: globalPayload.rankingsUpdatedAt,
    });
  } catch (err: any) {
    console.error("[push-rankings] exception:", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

/**
 * GET /api/admin/push-rankings
 * Verifica lo stato delle classifiche nel cloud
 */
export async function GET() {
  const session = await getServerSession(authOptions as any);
  const email = session?.user?.email?.toLowerCase().trim();
  if (!email || !ADMIN_EMAILS.has(email)) {
    return NextResponse.json({ error: "unauthorized — admin only" }, { status: 401 });
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceKey) {
    return NextResponse.json({ error: "server_config" }, { status: 500 });
  }

  const supabase = createClient(supabaseUrl, serviceKey);
  const { data, error } = await supabase
    .from("app_state")
    .select("data, updated_at")
    .eq("id", "global")
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({
    cloudUpdatedAt: data?.updated_at,
    rankingsUpdatedAt: data?.data?.rankingsUpdatedAt,
    labelsCount: data?.data?.labels?.length || 0,
    labelsWithRank: (data?.data?.labels || []).filter((l: any) =>
      l.rankByGenre && Object.keys(l.rankByGenre).length > 0
    ).length,
    snapshotsCount: data?.data?.rankingSnapshots?.length || 0,
  });
}
