import { NextResponse } from "next/server";
import { getAdminClient } from "@/lib/supabase-admin";

/**
 * GET /api/sync-status
 *
 * Diagnostica VERA dello stato cloud dell'utente, basata sulle 5 tabelle
 * dedicate che sono l'unica fonte di verità (demo_submissions,
 * label_personal_data, pitch_campaigns, user_profiles, user_releases).
 *
 * Sostituisce le vecchie funzioni getMainCloudSyncInfo/getArtistsCloudSyncInfo
 * in src/lib/supabase.ts, che leggevano la riga personale di `app_state`:
 * quella riga non viene più scritta da FASE D in poi (OLD_APP_STATE_SYNC_DISABLED),
 * quindi mostrava sempre zero anche quando i dati veri erano al sicuro nelle
 * nuove tabelle — generando falsi allarmi.
 */
export async function GET() {
  const { supabase, email } = await getAdminClient();
  if (!supabase || !email) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const [demos, labelData, pitches, profile, releases] = await Promise.all([
    supabase.from("demo_submissions").select("id, updated_at", { count: "exact" }).eq("user_email", email),
    supabase.from("label_personal_data").select("label_id, updated_at", { count: "exact" }).eq("user_email", email),
    supabase.from("pitch_campaigns").select("id, status, updated_at", { count: "exact" }).eq("user_email", email),
    supabase.from("user_profiles").select("artist_name, bio, photo_url, sc_link, updated_at").eq("user_email", email).maybeSingle(),
    supabase.from("user_releases").select("id, updated_at", { count: "exact" }).eq("user_email", email),
  ]);

  const latestUpdatedAt = [
    ...(demos.data || []),
    ...(labelData.data || []),
    ...(pitches.data || []),
    ...(releases.data || []),
    ...(profile.data ? [profile.data] : []),
  ]
    .map((r: any) => r.updated_at)
    .filter(Boolean)
    .sort()
    .pop() || null;

  const profileHasData =
    !!profile.data?.artist_name || !!profile.data?.bio ||
    !!profile.data?.photo_url || !!profile.data?.sc_link;

  return NextResponse.json({
    email,
    demos: demos.count ?? (demos.data || []).length,
    labelPersonalData: labelData.count ?? (labelData.data || []).length,
    pitchDrafts: (pitches.data || []).filter((p: any) => p.status !== "sent").length,
    pitchSent: (pitches.data || []).filter((p: any) => p.status === "sent").length,
    releases: releases.count ?? (releases.data || []).length,
    profileHasData,
    lastUpdatedAt: latestUpdatedAt,
    errors: [demos.error, labelData.error, pitches.error, profile.error, releases.error]
      .filter(Boolean)
      .map((e: any) => e.message),
  });
}
