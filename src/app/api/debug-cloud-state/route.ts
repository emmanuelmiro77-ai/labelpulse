import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

/**
 * GET /api/debug-cloud-state?email=emmanuel.miro77@gmail.com
 *
 * Diagnostic endpoint to check what's actually stored in the cloud for a
 * given user. Protected by BETA_ADMIN_TOKEN so only the admin can use it.
 *
 * Returns:
 *   - whether a row exists for this email
 *   - the row's updated_at timestamp
 *   - the userProfile field (so we can see if it's empty or has data)
 *   - counts of labels, demos, rankingSnapshots
 */
export async function GET(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  const token = authHeader?.replace("Bearer ", "");
  if (!token || token !== process.env.BETA_ADMIN_TOKEN) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const email = searchParams.get("email")?.trim().toLowerCase();
  if (!email) {
    return NextResponse.json(
      { error: "Missing ?email= parameter" },
      { status: 400 }
    );
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey =
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!supabaseUrl || !supabaseKey) {
    return NextResponse.json(
      { error: "Server not configured" },
      { status: 503 }
    );
  }

  const supabase = createClient(supabaseUrl, supabaseKey);

  // Check the specific user's row
  const { data, error } = await supabase
    .from("app_state")
    .select("id, data, updated_at")
    .eq("id", email)
    .single();

  if (error) {
    if (error.code === "PGRST116") {
      return NextResponse.json({
        email,
        exists: false,
        message: "No cloud row found for this email. The user has never synced.",
      });
    }
    return NextResponse.json({ error: error.message, details: error }, { status: 500 });
  }

  // Also check the "default" row (legacy)
  const { data: defaultRow } = await supabase
    .from("app_state")
    .select("id, data, updated_at")
    .eq("id", "default")
    .single();

  const cloudData = (data?.data as any) || {};

  return NextResponse.json({
    email,
    exists: true,
    updated_at: data?.updated_at,
    cloudSummary: {
      hasUserProfile: !!cloudData.userProfile,
      userProfileArtistName: cloudData.userProfile?.artistName || "(empty)",
      userProfileBio: cloudData.userProfile?.bio ? "(has bio)" : "(empty)",
      userProfileLinksCount: Array.isArray(cloudData.userProfile?.links)
        ? cloudData.userProfile.links.length
        : 0,
      labelsCount: Array.isArray(cloudData.labels) ? cloudData.labels.length : 0,
      demosCount: Array.isArray(cloudData.demos) ? cloudData.demos.length : 0,
      rankingSnapshotsCount: Array.isArray(cloudData.rankingSnapshots)
        ? cloudData.rankingSnapshots.length
        : 0,
      lastSavedAt: cloudData.lastSavedAt || null,
    },
    userProfile: cloudData.userProfile || null,
    defaultRowExists: !!defaultRow,
    defaultRowUpdatedAt: defaultRow?.updated_at || null,
  });
}
