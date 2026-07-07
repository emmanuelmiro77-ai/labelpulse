import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth-options";

/**
 * ENDPOINT DIAGNOSTICO — /api/debug-rankings
 *
 * Mostra lo stato della riga globale (classifiche) nel cloud.
 * 🔒 ADMIN-ONLY.
 */

const ADMIN_EMAILS = new Set(["emmanuel.miro77@gmail.com"]);

export async function GET() {
  const session = await getServerSession(authOptions as any);
  const email = session?.user?.email?.toLowerCase().trim();
  if (!email || !ADMIN_EMAILS.has(email)) {
    return NextResponse.json({ error: "unauthorized — admin only" }, { status: 401 });
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl) {
    return NextResponse.json({ error: "NEXT_PUBLIC_SUPABASE_URL missing" }, { status: 500 });
  }

  const key = serviceKey || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!key) {
    return NextResponse.json({ error: "No Supabase key configured" }, { status: 500 });
  }

  const debug: any = {
    timestamp: new Date().toISOString(),
    email,
    hasServiceRoleKey: !!serviceKey,
    usingServiceRole: !!serviceKey,
  };

  try {
    const supabase = createClient(supabaseUrl, key);

    const { data: globalRow, error: globalError } = await supabase
      .from("app_state")
      .select("data, updated_at")
      .eq("id", "global")
      .maybeSingle();

    if (globalError) {
      debug.globalError = globalError.message;
    } else {
      const globalData = globalRow?.data || {};
      const labels = globalData.labels || [];
      const labelsWithRank = labels.filter((l: any) =>
        l.rankByGenre && Object.keys(l.rankByGenre).length > 0
      );

      debug.global = {
        updatedAt: globalRow?.updated_at,
        rankingsUpdatedAt: globalData.rankingsUpdatedAt,
        lastGlobalUpdate: globalData.lastGlobalUpdate,
        labelsCount: labels.length,
        labelsWithRank: labelsWithRank.length,
        snapshotsCount: globalData.rankingSnapshots?.length || 0,
        sampleLabels: labelsWithRank.slice(0, 5).map((l: any) => ({
          name: l.name,
          genre: l.genres?.[0] || l.genre,
          rankByGenre: l.rankByGenre,
          pointsByGenre: l.pointsByGenre,
          imageUrl: l.imageUrl ? "present" : "missing",
        })),
      };
    }

    const { data: personalRow, error: personalError } = await supabase
      .from("app_state")
      .select("data, updated_at")
      .eq("id", email)
      .maybeSingle();

    if (personalError) {
      debug.personalError = personalError.message;
    } else {
      const personalData = personalRow?.data || {};
      const personalLabels = personalData.labels || [];
      const personalLabelsWithRank = personalLabels.filter((l: any) =>
        l.rankByGenre && Object.keys(l.rankByGenre).length > 0
      );

      debug.personal = {
        updatedAt: personalRow?.updated_at,
        labelsCount: personalLabels.length,
        labelsWithRank: personalLabelsWithRank.length,
        snapshotsCount: personalData.rankingSnapshots?.length || 0,
      };
    }

    return NextResponse.json(debug, { headers: { "Cache-Control": "no-store" } });
  } catch (err: any) {
    debug.exception = err.message;
    return NextResponse.json(debug, { status: 500, headers: { "Cache-Control": "no-store" } });
  }
}
