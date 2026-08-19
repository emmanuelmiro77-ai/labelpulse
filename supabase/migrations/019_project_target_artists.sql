-- =====================================================================
-- WP-009 — project_target_artists
-- =====================================================================
-- Relazione molti-a-molti tra Project e Artist.
--
-- Una riga per (user_id, project_id, artist_id). Rappresenta gli artisti
-- "target" che l'utente ha selezionato per un dato Project — DJ o
-- producer a cui intende sottoporre promo / DM per quel project.
--
-- 🔒 Vincoli (WP-009):
-- - NON modifica il Lifecycle Engine, Label Finder, Artist Explorer.
-- - NON modifica la UI (nessun pulsante "Add" collegato in questo task).
-- - Struttura minimale: (id, project_id, artist_id, created_at) + user_id
--   per RLS. Nessun campo di stato (introdotto in task successivi).
--
-- Pattern speculare a 018_project_target_labels.sql (WP-006).
--
-- Nessuna FK verso `projects` o altre tabelle: evitiamo accoppiamento
-- stretto. Gli Artist vivono in IndexedDB lato client + Beatport scraper;
-- non c'è tabella `artists` dedicata a cui collegarsi.
--
-- UNIQUE(user_id, project_id, artist_id): impedisce di aggiungere lo
-- stesso artista due volte allo stesso project.
-- =====================================================================

-- Defensive: ensure the updated_at trigger function exists (idempotent,
-- già definita in 016_projects.sql ma ridichiarata qui per self-sufficiency).
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TABLE IF NOT EXISTS project_target_artists (
  id TEXT PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  project_id TEXT NOT NULL,
  artist_id TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, project_id, artist_id)
);

CREATE INDEX IF NOT EXISTS idx_project_target_artists_user_project
  ON project_target_artists (user_id, project_id);

CREATE INDEX IF NOT EXISTS idx_project_target_artists_user_artist
  ON project_target_artists (user_id, artist_id);

ALTER TABLE project_target_artists ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "project_target_artists_select_own" ON project_target_artists;
CREATE POLICY "project_target_artists_select_own" ON project_target_artists
  FOR SELECT USING (user_id = auth.uid());

DROP POLICY IF EXISTS "project_target_artists_insert_own" ON project_target_artists;
CREATE POLICY "project_target_artists_insert_own" ON project_target_artists
  FOR INSERT WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "project_target_artists_update_own" ON project_target_artists;
CREATE POLICY "project_target_artists_update_own" ON project_target_artists
  FOR UPDATE USING (user_id = auth.uid());

DROP POLICY IF EXISTS "project_target_artists_delete_own" ON project_target_artists;
CREATE POLICY "project_target_artists_delete_own" ON project_target_artists
  FOR DELETE USING (user_id = auth.uid());
