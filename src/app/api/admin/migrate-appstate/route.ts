import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

/**
 * API /api/admin/migrate-appstate
 *
 * 🔒 ADMIN-ONLY: migrazione one-time da app_state (vecchio blob JSONB)
 * alle nuove tabelle dedicate (demo_submissions, label_personal_data,
 * pitch_campaigns, user_profiles).
 *
 * Usa SUPABASE_SERVICE_ROLE_KEY per bypassare RLS durante la migrazione.
 *
 * Usage:
 *   GET /api/admin/migrate-appstate
 *   Headers: Authorization: Bearer <BETA_ADMIN_TOKEN>
 */

export async function GET(req: NextRequest) {
  // Auth check
  const authHeader = req.headers.get("authorization") || "";
  const token = authHeader.replace(/^Bearer\s+/i, "").trim();

  // 🔍 DEBUG: log per capire perché il token non matcha
  console.log("[migrate-appstate] DEBUG:", {
    hasAuthHeader: !!authHeader,
    tokenLength: token.length,
    tokenPreview: token.substring(0, 10) + "...",
    envTokenExists: !!process.env.BETA_ADMIN_TOKEN,
    envTokenLength: process.env.BETA_ADMIN_TOKEN?.length || 0,
    envTokenPreview: process.env.BETA_ADMIN_TOKEN?.substring(0, 10) + "...",
    match: token === process.env.BETA_ADMIN_TOKEN,
  });

  if (!token || token !== process.env.BETA_ADMIN_TOKEN) {
    return NextResponse.json({
      error: "unauthorized",
      debug: {
        tokenReceived: token.substring(0, 5) + "...",
        envTokenSet: !!process.env.BETA_ADMIN_TOKEN,
        hint: !process.env.BETA_ADMIN_TOKEN
          ? "BETA_ADMIN_TOKEN env var is NOT set on Vercel. Add it in Project Settings → Environment Variables, then redeploy."
          : "Token mismatch. Check for whitespace or encoding issues.",
      }
    }, { status: 401 });
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceKey) {
    return NextResponse.json({ error: "server_config" }, { status: 500 });
  }

  const supabase = createClient(supabaseUrl, serviceKey);

  const summary = {
    usersProcessed: 0,
    demos: 0,
    labels: 0,
    pitches: 0,
    profiles: 0,
    errors: [] as string[],
  };

  try {
    // Fetch all user rows from app_state (skip global, default, _artists rows)
    const { data: appStateRows, error: fetchError } = await supabase
      .from("app_state")
      .select("id, data")
      .not("id", "in", '("global","default","global_artists")');

    if (fetchError) {
      return NextResponse.json({ error: fetchError.message }, { status: 500 });
    }

    for (const row of appStateRows || []) {
      const email = row.id;
      if (email.endsWith("_artists")) continue;

      summary.usersProcessed++;
      const userData = row.data || {};

      // 1. Demos
      if (Array.isArray(userData.demos)) {
        for (const demo of userData.demos) {
          if (!demo.id || !demo.trackName) continue;
          const { data: existing } = await supabase
            .from("demo_submissions")
            .select("id")
            .eq("id", demo.id)
            .maybeSingle();
          if (existing) continue;

          const { error } = await supabase.from("demo_submissions").insert({
            id: String(demo.id),
            user_email: email,
            label_id: demo.labelId ? String(demo.labelId) : "no_target",
            label_name: demo.labelName || null,
            track_name: String(demo.trackName),
            artist_name: demo.artistName || null,
            link: demo.link || null,
            status: demo.status || "ready",
            sent_date: demo.sentDate || null,
            pitch_text: demo.pitchText || null,
            pitch_subject: demo.pitchSubject || null,
            pitch_tracks: demo.pitchTracks || null,
            notes: demo.notes || null,
            parent_release_id: demo.parentReleaseId || null,
            created_at: demo.createdAt || new Date().toISOString(),
          });
          if (error) {
            summary.errors.push(`[${email}] demo ${demo.id}: ${error.message}`);
          } else {
            summary.demos++;
          }
        }
      }

      // 2. Labels
      if (Array.isArray(userData.labels)) {
        for (const label of userData.labels) {
          const hasPersonalData =
            (label.emails?.length > 0) ||
            (label.notes?.trim()) ||
            (label.website?.trim()) ||
            (label.demoLink?.trim()) ||
            (label.socialLink?.trim()) ||
            (label.soundcloudLink?.trim()) ||
            (label.contactInfo?.trim()) ||
            label.isCustom;
          if (!hasPersonalData || !label.id) continue;

          const { error } = await supabase.from("label_personal_data").upsert({
            user_email: email,
            label_id: String(label.id),
            emails: label.emails || [],
            notes: label.notes || null,
            status: label.status || "unknown",
            website: label.website || null,
            demo_link: label.demoLink || null,
            social_link: label.socialLink || null,
            soundcloud_link: label.soundcloudLink || null,
            contact_info: label.contactInfo || null,
            is_custom: label.isCustom || false,
            custom_name: label.isCustom ? label.name : null,
            custom_genre: label.isCustom ? label.genre : null,
          }, { onConflict: "user_email,label_id" });
          if (error) {
            summary.errors.push(`[${email}] label ${label.id}: ${error.message}`);
          } else {
            summary.labels++;
          }
        }
      }

      // 3. Pitches
      if (Array.isArray(userData.savedPitches)) {
        for (const pitch of userData.savedPitches) {
          if (!pitch.id) continue;
          const { data: existing } = await supabase
            .from("pitch_campaigns")
            .select("id")
            .eq("id", pitch.id)
            .maybeSingle();
          if (existing) continue;

          const { error } = await supabase.from("pitch_campaigns").insert({
            id: String(pitch.id),
            user_email: email,
            label_id: pitch.labelId || null,
            label_name: pitch.labelName || null,
            demo_id: pitch.demoId || null,
            subject: pitch.subject || null,
            body: pitch.body || null,
            pitch_tracks: pitch.pitchTracks || null,
            ep_link_mode: pitch.epLinkMode || null,
            ep_soundcloud_url: pitch.epSoundCloudUrl || null,
            status: "draft",
          });
          if (error) {
            summary.errors.push(`[${email}] pitch ${pitch.id}: ${error.message}`);
          } else {
            summary.pitches++;
          }
        }
      }

      if (Array.isArray(userData.sentCampaigns)) {
        for (const campaign of userData.sentCampaigns) {
          if (!campaign.id) continue;
          const { data: existing } = await supabase
            .from("pitch_campaigns")
            .select("id")
            .eq("id", campaign.id)
            .maybeSingle();
          if (existing) continue;

          const { error } = await supabase.from("pitch_campaigns").insert({
            id: String(campaign.id),
            user_email: email,
            label_id: campaign.labelId || null,
            label_name: campaign.labelName || null,
            demo_id: campaign.demoId || null,
            subject: campaign.subject || null,
            body: campaign.body || null,
            pitch_tracks: campaign.pitchTracks || null,
            ep_link_mode: campaign.epLinkMode || null,
            ep_soundcloud_url: campaign.epSoundCloudUrl || null,
            status: "sent",
            sent_at: campaign.sentAt || new Date().toISOString(),
            sent_method: campaign.sentMethod || null,
          });
          if (error) {
            summary.errors.push(`[${email}] campaign ${campaign.id}: ${error.message}`);
          } else {
            summary.pitches++;
          }
        }
      }

      // 4. Profile
      if (userData.userProfile) {
        const profile = userData.userProfile;
        const hasProfileData =
          !!profile.artistName ||
          !!profile.bio ||
          !!profile.photoUrl ||
          !!profile.scLink ||
          (Array.isArray(profile.links) && profile.links.length > 0);
        if (hasProfileData) {
          const { error } = await supabase.from("user_profiles").upsert({
            user_email: email,
            artist_name: profile.artistName || null,
            bio: profile.bio || null,
            photo_url: profile.photoUrl || null,
            sc_link: profile.scLink || null,
            links: profile.links || [],
            cyanite_api_token: profile.cyaniteApiToken || null,
            locale: userData.locale || "it",
          }, { onConflict: "user_email" });
          if (error) {
            summary.errors.push(`[${email}] profile: ${error.message}`);
          } else {
            summary.profiles++;
          }
        }
      }
    }

    return NextResponse.json({
      ok: true,
      summary,
      message: "Migration completed. Old data in app_state was NOT deleted (safety).",
    });
  } catch (err: any) {
    console.error("[migrate-appstate] error:", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
