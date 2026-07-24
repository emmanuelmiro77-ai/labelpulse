-- =====================================================================
-- Phase 1 — projects (Foundation)
-- =====================================================================
-- Nuova entità "Project", isolata da demo_submissions, user_releases,
-- promotion_targets, pitch_campaigns.
--
-- Una riga per (user_id, id). Tutte le righe sono private per utente
-- (RLS su user_id = auth.uid()).
--
-- Campi minimici voluti da Phase 1:
--   id          TEXT PRIMARY KEY        (generato client, es. "proj_...")
--   user_id     UUID NOT NULL           (auth.users.id, per RLS)
--   title       TEXT NOT NULL
--   artist      TEXT NOT NULL DEFAULT ''
--   status      TEXT NOT NULL DEFAULT 'idea'
--   source_url  TEXT
--   created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
--   updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
--
-- Nessuna foreign key verso altre tabelle: il Project è un'entità
-- standalone in questa fase. Le relazioni verranno aggiunte in fasi
-- successive con migration dedicate.
-- =====================================================================

-- Defensive: ensure the updated_at trigger function exists. Idempotent —
-- other migrations (011, 013, 014) reference the same function but do
-- not define it; we redefine it here with CREATE OR REPLACE so this
-- migration is self-sufficient on a fresh database.
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TABLE IF NOT EXISTS projects (
  id TEXT PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  artist TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'idea',
  source_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_projects_user
  ON projects (user_id);

CREATE INDEX IF NOT EXISTS idx_projects_user_created_at
  ON projects (user_id, created_at DESC);

ALTER TABLE projects ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "projects_select_own" ON projects;
CREATE POLICY "projects_select_own" ON projects
  FOR SELECT USING (user_id = auth.uid());

DROP POLICY IF EXISTS "projects_insert_own" ON projects;
CREATE POLICY "projects_insert_own" ON projects
  FOR INSERT WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "projects_update_own" ON projects;
CREATE POLICY "projects_update_own" ON projects
  FOR UPDATE USING (user_id = auth.uid());

DROP POLICY IF EXISTS "projects_delete_own" ON projects;
CREATE POLICY "projects_delete_own" ON projects
  FOR DELETE USING (user_id = auth.uid());

DROP TRIGGER IF EXISTS trigger_projects_updated_at ON projects;
CREATE TRIGGER trigger_projects_updated_at
  BEFORE UPDATE ON projects
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
