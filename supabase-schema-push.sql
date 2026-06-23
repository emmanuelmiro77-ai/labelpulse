-- =====================================================================
-- LabelPulse — Web Push subscriptions table
-- =====================================================================
-- Stores per-user push subscription endpoints. Each device/browser has
-- its own endpoint (Chrome desktop, Safari on iPhone home screen, etc.)
-- so a user can have multiple rows. Notifications are sent to ALL of them.
--
-- Run this in Supabase SQL Editor before deploying the push feature.
-- =====================================================================

CREATE TABLE IF NOT EXISTS push_subscriptions (
  id            BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_email    TEXT        NOT NULL,
  endpoint      TEXT        NOT NULL,
  p256dh        TEXT        NOT NULL,
  auth_key      TEXT        NOT NULL,
  -- Per-user notification preferences (mirrored from client store)
  -- so the server can decide which notifications to send without an
  -- extra round-trip. Updated by /api/push/subscribe on every change.
  prefs_follow_up    BOOLEAN NOT NULL DEFAULT TRUE,
  prefs_rankings      BOOLEAN NOT NULL DEFAULT TRUE,
  prefs_weekly_recap  BOOLEAN NOT NULL DEFAULT TRUE,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (endpoint)
);

-- Index for fast lookup by user (when sending notifications to a user)
CREATE INDEX IF NOT EXISTS idx_push_subs_user_email
  ON push_subscriptions (user_email);

-- Index for fast deduplication by endpoint
CREATE INDEX IF NOT EXISTS idx_push_subs_endpoint
  ON push_subscriptions (endpoint);

-- Row Level Security: users can only manage their OWN subscriptions
ALTER TABLE push_subscriptions ENABLE ROW LEVEL SECURITY;

-- Allow INSERT: anyone authenticated can insert their own subscription
-- (the API uses the service role key, so RLS doesn't actually apply to
-- server-side writes — this is mainly for defense-in-depth)
CREATE POLICY "Users can read own push subscriptions"
  ON push_subscriptions FOR SELECT
  USING (user_email = current_setting('app.current_email', true));

-- Enable Realtime (not strictly needed, but consistent with other tables)
ALTER TABLE push_subscriptions REPLICA IDENTITY FULL;
