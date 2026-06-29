/**
 * 🔒 FASE D — Migrazione dati da app_state alle nuove tabelle
 *
 * Script one-time che legge i dati dal vecchio blob JSONB su app_state
 * e li inserisce nelle nuove tabelle dedicate:
 * - demo_submissions
 * - label_personal_data
 * - pitch_campaigns
 * - user_profiles
 *
 * Sicurezza:
 * - Usa SUPABASE_SERVICE_ROLE_KEY (bypassa RLS per la migrazione)
 * - Controlla se esiste già una riga con stesso id (no duplicati)
 * - Logga progress per ogni utente migrato
 * - Non cancella i dati da app_state (li lascia per safety)
 *
 * Usage:
 *   Esegui questo script in Node.js:
 *   node scripts/migrate-appstate-to-new-tables.js
 *
 *   Oppure via API: GET /api/admin/migrate-appstate (admin-only)
 */

const { createClient } = require("@supabase/supabase-js");

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  console.error("❌ Missing env vars: NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

async function migrateUserAppState(userEmail, userData) {
  const results = {
    email: userEmail,
    demos: 0,
    labels: 0,
    pitches: 0,
    profile: 0,
    errors: [],
  };

  // 1. Migrate demos
  if (Array.isArray(userData.demos)) {
    for (const demo of userData.demos) {
      if (!demo.id || !demo.trackName) {
        results.errors.push(`Skipping demo without id/trackName: ${JSON.stringify(demo).slice(0, 100)}`);
        continue;
      }
      try {
        // Check if already exists
        const { data: existing } = await supabase
          .from("demo_submissions")
          .select("id")
          .eq("id", demo.id)
          .maybeSingle();

        if (existing) {
          // Skip — already migrated
          continue;
        }

        const { error } = await supabase.from("demo_submissions").insert({
          id: String(demo.id),
          user_email: userEmail,
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
          results.errors.push(`Demo ${demo.id}: ${error.message}`);
        } else {
          results.demos++;
        }
      } catch (err) {
        results.errors.push(`Demo ${demo.id}: ${err.message}`);
      }
    }
  }

  // 2. Migrate label personal data
  if (Array.isArray(userData.labels)) {
    for (const label of userData.labels) {
      // Only migrate labels with personal data OR custom labels
      const hasPersonalData =
        (label.emails && label.emails.length > 0) ||
        (label.notes && label.notes.trim()) ||
        (label.website && label.website.trim()) ||
        (label.demoLink && label.demoLink.trim()) ||
        (label.socialLink && label.socialLink.trim()) ||
        (label.soundcloudLink && label.soundcloudLink.trim()) ||
        (label.contactInfo && label.contactInfo.trim()) ||
        label.isCustom;

      if (!hasPersonalData) continue;

      if (!label.id) {
        results.errors.push(`Skipping label without id: ${label.name || "unnamed"}`);
        continue;
      }

      try {
        const { error } = await supabase.from("label_personal_data").upsert({
          user_email: userEmail,
          label_id: String(label.id),
          emails: label.emails || [],
          notes: label.notes || null,
          status: label.status || "unknown",
          website: label.website || null,
          demo_link: label.demoLink || null,
          social_link: label.socialLink || null,
          soundcloud_link: label.soundcloudLink || null,
          beatport_link: label.beatportLink || null,
          contact_info: label.contactInfo || null,
          custom_links: label.customLinks || [],
          is_custom: label.isCustom || false,
          custom_name: label.isCustom ? label.name : null,
          custom_genre: label.isCustom ? label.genre : null,
        }, { onConflict: "user_email,label_id" });

        if (error) {
          results.errors.push(`Label ${label.id}: ${error.message}`);
        } else {
          results.labels++;
        }
      } catch (err) {
        results.errors.push(`Label ${label.id}: ${err.message}`);
      }
    }
  }

  // 3. Migrate savedPitches + sentCampaigns → pitch_campaigns
  if (Array.isArray(userData.savedPitches)) {
    for (const pitch of userData.savedPitches) {
      if (!pitch.id) continue;
      try {
        const { data: existing } = await supabase
          .from("pitch_campaigns")
          .select("id")
          .eq("id", pitch.id)
          .maybeSingle();
        if (existing) continue;

        const { error } = await supabase.from("pitch_campaigns").insert({
          id: String(pitch.id),
          user_email: userEmail,
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
          results.errors.push(`Pitch ${pitch.id}: ${error.message}`);
        } else {
          results.pitches++;
        }
      } catch (err) {
        results.errors.push(`Pitch ${pitch.id}: ${err.message}`);
      }
    }
  }

  if (Array.isArray(userData.sentCampaigns)) {
    for (const campaign of userData.sentCampaigns) {
      if (!campaign.id) continue;
      try {
        const { data: existing } = await supabase
          .from("pitch_campaigns")
          .select("id")
          .eq("id", campaign.id)
          .maybeSingle();
        if (existing) continue;

        const { error } = await supabase.from("pitch_campaigns").insert({
          id: String(campaign.id),
          user_email: userEmail,
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
          results.errors.push(`Campaign ${campaign.id}: ${error.message}`);
        } else {
          results.pitches++;
        }
      } catch (err) {
        results.errors.push(`Campaign ${campaign.id}: ${err.message}`);
      }
    }
  }

  // 4. Migrate userProfile
  if (userData.userProfile && typeof userData.userProfile === "object") {
    const profile = userData.userProfile;
    const hasProfileData =
      !!profile.artistName ||
      !!profile.bio ||
      !!profile.photoUrl ||
      !!profile.scLink ||
      (Array.isArray(profile.links) && profile.links.length > 0);

    if (hasProfileData) {
      try {
        const { error } = await supabase.from("user_profiles").upsert({
          user_email: userEmail,
          artist_name: profile.artistName || null,
          bio: profile.bio || null,
          photo_url: profile.photoUrl || null,
          sc_link: profile.scLink || null,
          links: profile.links || [],
          cyanite_api_token: profile.cyaniteApiToken || null,
          locale: userData.locale || "it",
        }, { onConflict: "user_email" });

        if (error) {
          results.errors.push(`Profile: ${error.message}`);
        } else {
          results.profile = 1;
        }
      } catch (err) {
        results.errors.push(`Profile: ${err.message}`);
      }
    }
  }

  return results;
}

async function main() {
  console.log("🚀 Starting migration from app_state to new tables...\n");

  // Fetch all rows from app_state that have user data (not 'global' or 'default')
  const { data: appStateRows, error: fetchError } = await supabase
    .from("app_state")
    .select("id, data")
    .not("id", "in", '("global","default","global_artists")');

  if (fetchError) {
    console.error("❌ Failed to fetch app_state rows:", fetchError.message);
    process.exit(1);
  }

  console.log(`📊 Found ${appStateRows.length} user rows in app_state\n`);

  let totalMigrated = { demos: 0, labels: 0, pitches: 0, profile: 0 };
  let totalErrors = [];

  for (const row of appStateRows) {
    const email = row.id.replace("_artists", ""); // skip _artists rows
    if (email.endsWith("_artists")) continue;

    console.log(`\n👤 Migrating user: ${email}`);
    const userData = row.data || {};

    const result = await migrateUserAppState(email, userData);
    console.log(`   ✅ Demos: ${result.demos}, Labels: ${result.labels}, Pitches: ${result.pitches}, Profile: ${result.profile}`);
    if (result.errors.length > 0) {
      console.log(`   ⚠️  Errors: ${result.errors.length}`);
      result.errors.forEach(e => console.log(`      - ${e}`));
      totalErrors.push(...result.errors.map(e => `[${email}] ${e}`));
    }

    totalMigrated.demos += result.demos;
    totalMigrated.labels += result.labels;
    totalMigrated.pitches += result.pitches;
    totalMigrated.profile += result.profile;
  }

  console.log("\n" + "=".repeat(60));
  console.log("📋 MIGRATION SUMMARY");
  console.log("=".repeat(60));
  console.log(`Total users processed: ${appStateRows.length}`);
  console.log(`Total demos migrated: ${totalMigrated.demos}`);
  console.log(`Total labels migrated: ${totalMigrated.labels}`);
  console.log(`Total pitches migrated: ${totalMigrated.pitches}`);
  console.log(`Total profiles migrated: ${totalMigrated.profile}`);
  console.log(`Total errors: ${totalErrors.length}`);
  if (totalErrors.length > 0) {
    console.log("\nErrors:");
    totalErrors.forEach(e => console.log(`  - ${e}`));
  }
  console.log("\n✅ Migration completed!");
  console.log("\n⚠️  Note: Old data in app_state was NOT deleted (safety).");
  console.log("   You can manually delete it after verifying the migration.");
}

main().catch(err => {
  console.error("💥 Migration failed:", err);
  process.exit(1);
});
