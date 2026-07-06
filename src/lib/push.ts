/**
 * Web Push server-side utilities for LabelPulse.
 *
 * Uses Supabase (same env vars as the rest of the app) to store per-user
 * push subscription endpoints, and the `web-push` library to send
 * notifications through the W3C Push API.
 *
 * VAPID keys are generated once and stored in env vars:
 *   - NEXT_PUBLIC_VAPID_PUBLIC_KEY (also used client-side for subscribe())
 *   - VAPID_PRIVATE_KEY            (server-only)
 *   - VAPID_SUBJECT                (mailto: or https: URL)
 *
 * Schema: see supabase-schema-push.sql
 *
 * 🔒 FIX 500: Tutte le funzioni che scrivono/leggono push_subscriptions
 * usano getAdminClient() (service_role o JWT Supabase) invece della
 * anon key. La tabella ha RLS ENABLE ma senza policy INSERT/UPDATE/DELETE,
 * quindi l'anon key viene bloccata → HTTP 500. Il service_role bypassa RLS.
 * L'autenticazione utente è verificata a livello di API route prima di
 * chiamare queste funzioni.
 */

import webpush from "web-push";
import { getAdminClient } from "@/lib/supabase-admin";
import type { SupabaseClient } from "@supabase/supabase-js";

export interface PushSubscriptionRow {
  id: number;
  user_email: string;
  endpoint: string;
  p256dh: string;
  auth_key: string;
  prefs_follow_up: boolean;
  prefs_rankings: boolean;
  prefs_weekly_recap: boolean;
  created_at: string;
  last_seen_at: string;
}

export interface NotificationPrefs {
  followUp: boolean;
  rankings: boolean;
  weeklyRecap: boolean;
}

let _configured = false;
function ensureConfigured() {
  if (_configured) return;
  if (
    !process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ||
    !process.env.VAPID_PRIVATE_KEY ||
    !process.env.VAPID_SUBJECT
  ) {
    throw new Error(
      "VAPID env vars missing. Set NEXT_PUBLIC_VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT."
    );
  }
  webpush.setVapidDetails(
    process.env.VAPID_SUBJECT,
    process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY,
    process.env.VAPID_PRIVATE_KEY
  );
  _configured = true;
}

/**
 * 🔒 FIX 500: Ottiene un client Supabase autenticato (service_role o JWT).
 * Le API route verificano già l'auth NextAuth PRIMA di chiamare queste
 * funzioni, quindi qui usiamo il service_role per bypassare RLS.
 *
 * Se l'utente non è autenticato, ritorna null → il chiamante deve gestire.
 */
async function getAuthedSupabase(): Promise<{ supabase: SupabaseClient; email: string }> {
  const { supabase, email } = await getAdminClient();
  if (!supabase || !email) {
    throw new Error("Not authenticated — no Supabase client available");
  }
  return { supabase, email };
}

/**
 * Save (or update) a push subscription for a user.
 * Idempotent — if the endpoint already exists, just refresh last_seen_at
 * and update prefs.
 *
 * 🔒 FIX 500: usa getAdminClient() (service_role) invece di anon key.
 */
export async function saveSubscription(
  userEmail: string,
  subscription: { endpoint: string; keys: { p256dh: string; auth: string } },
  prefs: NotificationPrefs
): Promise<void> {
  const { supabase } = await getAuthedSupabase();
  const email = userEmail.trim().toLowerCase();
  const { error } = await supabase.from("push_subscriptions").upsert(
    {
      user_email: email,
      endpoint: subscription.endpoint,
      p256dh: subscription.keys.p256dh,
      auth_key: subscription.keys.auth,
      prefs_follow_up: prefs.followUp,
      prefs_rankings: prefs.rankings,
      prefs_weekly_recap: prefs.weeklyRecap,
      last_seen_at: new Date().toISOString(),
    },
    { onConflict: "endpoint" }
  );
  if (error) {
    console.error("[push] saveSubscription error:", error);
    throw new Error(`Failed to save subscription: ${error.message}`);
  }
}

/**
 * Remove a push subscription (called on unsubscribe or 410 Gone).
 *
 * 🔒 FIX 500: usa getAdminClient() (service_role) invece di anon key.
 */
export async function removeSubscription(endpoint: string): Promise<void> {
  const { supabase } = await getAuthedSupabase();
  const { error } = await supabase
    .from("push_subscriptions")
    .delete()
    .eq("endpoint", endpoint);
  if (error) {
    console.error("[push] removeSubscription error:", error);
  }
}

/**
 * Update the per-user prefs for ALL subscriptions of that user.
 * Called when the user toggles a notification category in the Profile page.
 *
 * 🔒 FIX 500: usa getAdminClient() (service_role) invece di anon key.
 */
export async function updatePrefsForUser(
  userEmail: string,
  prefs: NotificationPrefs
): Promise<void> {
  const { supabase } = await getAuthedSupabase();
  const email = userEmail.trim().toLowerCase();
  const { error } = await supabase
    .from("push_subscriptions")
    .update({
      prefs_follow_up: prefs.followUp,
      prefs_rankings: prefs.rankings,
      prefs_weekly_recap: prefs.weeklyRecap,
      last_seen_at: new Date().toISOString(),
    })
    .eq("user_email", email);
  if (error) {
    console.error("[push] updatePrefsForUser error:", error);
    throw new Error(`Failed to update prefs: ${error.message}`);
  }
}

/**
 * Get all subscriptions for a user (across their devices).
 *
 * 🔒 FIX 500: usa getAdminClient() (service_role) invece di anon key.
 */
export async function getSubscriptionsForUser(
  userEmail: string
): Promise<PushSubscriptionRow[]> {
  const { supabase } = await getAuthedSupabase();
  const email = userEmail.trim().toLowerCase();
  const { data, error } = await supabase
    .from("push_subscriptions")
    .select("*")
    .eq("user_email", email);
  if (error) {
    console.error("[push] getSubscriptionsForUser error:", error);
    return [];
  }
  return (data || []) as unknown as PushSubscriptionRow[];
}

/**
 * Get ALL subscriptions across ALL users. Used by the admin trigger when
 * rankings are updated (everyone opted in gets a push).
 *
 * NOTA: questa funzione è usata solo dal cron admin (rankings-updated).
 * Per evitare di richiedere l'auth utente, usa direttamente il service_role.
 */
export async function getAllSubscriptions(): Promise<PushSubscriptionRow[]> {
  // Per il cron admin, usiamo il service_role direttamente (non c'è session utente)
  const { createClient } = await import("@supabase/supabase-js");
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    console.error("[push] getAllSubscriptions: missing service_role env vars");
    return [];
  }
  const supabase = createClient(url, key, { auth: { persistSession: false } });
  const { data, error } = await supabase
    .from("push_subscriptions")
    .select("*");
  if (error) {
    console.error("[push] getAllSubscriptions error:", error);
    return [];
  }
  return (data || []) as unknown as PushSubscriptionRow[];
}

/**
 * Send a push notification to a single subscription row.
 * Returns true on success, false if the endpoint is gone (should be removed).
 */
export async function sendPushToSubscription(
  row: PushSubscriptionRow,
  payload: { title: string; body: string; url?: string; tag?: string; icon?: string }
): Promise<{ ok: boolean; gone: boolean }> {
  try {
    ensureConfigured();
    await webpush.sendNotification(
      {
        endpoint: row.endpoint,
        keys: { p256dh: row.p256dh, auth: row.auth_key },
      },
      JSON.stringify(payload)
    );
    return { ok: true, gone: false };
  } catch (err: any) {
    if (err?.statusCode === 404 || err?.statusCode === 410) {
      // Subscription no longer valid — caller should delete it
      return { ok: false, gone: true };
    }
    console.error("[push] sendPushToSubscription error:", err?.statusCode, err?.message);
    return { ok: false, gone: false };
  }
}

/**
 * Send a push to a single user (all their devices).
 * Filters by the requested notification category.
 */
export async function sendPushToUser(
  userEmail: string,
  category: "followUp" | "rankings" | "weeklyRecap",
  payload: { title: string; body: string; url?: string; tag?: string }
): Promise<{ sent: number; gone: number }> {
  const subs = await getSubscriptionsForUser(userEmail);
  let sent = 0;
  let gone = 0;
  for (const sub of subs) {
    const prefEnabled =
      category === "followUp"
        ? sub.prefs_follow_up
        : category === "rankings"
        ? sub.prefs_rankings
        : sub.prefs_weekly_recap;
    if (!prefEnabled) continue;
    const r = await sendPushToSubscription(sub, payload);
    if (r.ok) sent++;
    else if (r.gone) {
      gone++;
      await removeSubscription(sub.endpoint);
    }
  }
  return { sent, gone };
}

/**
 * Send a push to ALL users who opted in to a given category.
 * Used by the admin "rankings updated" trigger.
 */
export async function sendPushToAllOptedIn(
  category: "followUp" | "rankings" | "weeklyRecap",
  payload: { title: string; body: string; url?: string; tag?: string }
): Promise<{ sent: number; gone: number }> {
  const subs = await getAllSubscriptions();
  let sent = 0;
  let gone = 0;
  for (const sub of subs) {
    const prefEnabled =
      category === "followUp"
        ? sub.prefs_follow_up
        : category === "rankings"
        ? sub.prefs_rankings
        : sub.prefs_weekly_recap;
    if (!prefEnabled) continue;
    const r = await sendPushToSubscription(sub, payload);
    if (r.ok) sent++;
    else if (r.gone) {
      gone++;
      await removeSubscription(sub.endpoint);
    }
  }
  return { sent, gone };
}
