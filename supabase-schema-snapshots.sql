-- =====================================================================
-- LabelPulse — Beatport snapshots + chart history + followed artists
-- =====================================================================
-- Designed for Option C (hybrid browser scrape + server-side diff/cron)
-- Run this in Supabase SQL Editor before deploying the snapshot feature.
-- =====================================================================

-- 1) Snapshot metadata: 1 row per scrape session
CREATE TABLE IF NOT EXISTS beatport_snapshots (
  id            BIGSERIAL PRIMARY KEY,
  snapshot_date DATE NOT NULL,
  source        TEXT NOT NULL DEFAULT 'browser-scrape',
  total_genres  INT NOT NULL DEFAULT 0,
  total_labels  INT NOT NULL DEFAULT 0,
  total_artists INT NOT NULL DEFAULT 0,
  total_tracks  INT NOT NULL DEFAULT 0,
  incomplete_genres TEXT[] DEFAULT '{}',
  notes         TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (snapshot_date)
);

-- 2) Chart history: 1 row per (snapshot, track, genre)
CREATE TABLE IF NOT EXISTS beatport_chart_history (
  id              BIGSERIAL PRIMARY KEY,
  snapshot_id     BIGINT NOT NULL REFERENCES beatport_snapshots(id) ON DELETE CASCADE,
  snapshot_date   DATE NOT NULL,
  genre           TEXT NOT NULL,
  track_id        TEXT,
  track_name      TEXT,
  mix_name        TEXT,
  position        INT NOT NULL,
  points          INT NOT NULL DEFAULT 0,
  bpm             INT,
  key_camelot     TEXT,
  release_date    TEXT,
  cover_art       TEXT,
  sample_url      TEXT,
  artist_ids      TEXT[] DEFAULT '{}',
  artist_names    TEXT[] DEFAULT '{}',
  label_id        TEXT,
  label_name      TEXT,
  prev_position   INT,
  position_change INT,
  is_new_entry    BOOLEAN DEFAULT FALSE,
  is_reentry      BOOLEAN DEFAULT FALSE,
  weeks_in_chart  INT DEFAULT 1,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_chart_history_snapshot
  ON beatport_chart_history (snapshot_id);
CREATE INDEX IF NOT EXISTS idx_chart_history_genre_date
  ON beatport_chart_history (genre, snapshot_date);
CREATE INDEX IF NOT EXISTS idx_chart_history_track
  ON beatport_chart_history (track_id, snapshot_date);
CREATE INDEX IF NOT EXISTS idx_chart_history_artists
  ON beatport_chart_history USING GIN (artist_ids);
CREATE INDEX IF NOT EXISTS idx_chart_history_label
  ON beatport_chart_history (label_id, snapshot_date);

-- 3) Followed artists: which producers a user wants to track
CREATE TABLE IF NOT EXISTS followed_artists (
  id                  BIGSERIAL PRIMARY KEY,
  user_email          TEXT NOT NULL,
  artist_id           TEXT NOT NULL,
  artist_name         TEXT NOT NULL,
  notify_on_top10     BOOLEAN NOT NULL DEFAULT TRUE,
  notify_on_rising    BOOLEAN NOT NULL DEFAULT TRUE,
  notify_on_new_entry BOOLEAN NOT NULL DEFAULT TRUE,
  notify_on_drop      BOOLEAN NOT NULL DEFAULT FALSE,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_email, artist_id)
);

CREATE INDEX IF NOT EXISTS idx_followed_artists_user
  ON followed_artists (user_email);
CREATE INDEX IF NOT EXISTS idx_followed_artists_artist
  ON followed_artists (artist_id);

-- 4) Disable RLS — server uses anon key (validated at API layer)
ALTER TABLE beatport_snapshots DISABLE ROW LEVEL SECURITY;
ALTER TABLE beatport_chart_history DISABLE ROW LEVEL SECURITY;
ALTER TABLE followed_artists DISABLE ROW LEVEL SECURITY;
