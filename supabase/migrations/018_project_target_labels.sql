-- =====================================================================
-- WP-006 — project_target_labels
-- =====================================================================
-- Relazione molti-a-molti tra Project e Label.
--
-- Una riga per (user_id, project_id, label_id). Rappresenta le label
-- "target" che l'utente ha selezionato per un dato Project — label a
-- cui intende sottoporre demo / pitch per quel project specifico.
--
-- 🔒 Vincoli (WP-006):
-- - NON modifica il Lifecycle Engine, Label Finder, Artist Explorer.
-- - NON modifica la UI (nessun pulsante "Add" collegato in questo task).
-- - Struttura minimale: (id, project_id, label_id, created_at) + user_id
--   per RLS. Nessun campo di stato (introdotto in task successivi).
--
-- Nessuna FK verso `projects` o altre tabelle: evitiamo accoppiamento
-- stretto. Le Label vivono in app_state (riga global) + label_personal_data;
-- non c'è tabella `labels` dedicata a cui collegarsi.
--
-- UNIQUE(user_id, project_id, label_id): impedisce di aggiungere la
-- stessa label due volte allo stesso project. È il constraint naturale
-- per questa relazione.
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

CREATE TABLE IF NOT EXISTS project_target_labels (
  id TEXT PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  project_id TEXT NOT NULL,
  label_id TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, project_id, label_id)
);

CREATE INDEX IF NOT EXISTS idx_project_target_labels_user_project
  ON project_target_labels (user_id, project_id);

CREATE INDEX IF NOT EXISTS idx_project_target_labels_user_label
  ON project_target_labels (user_id, label_id);

ALTER TABLE project_target_labels ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "project_target_labels_select_own" ON project_target_labels;
CREATE POLICY "project_target_labels_select_own" ON project_target_labels
  FOR SELECT USING (user_id = auth.uid());

DROP POLICY IF EXISTS "project_target_labels_insert_own" ON project_target_labels;
CREATE POLICY "project_target_labels_insert_own" ON project_target_labels
  FOR INSERT WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "project_target_labels_update_own" ON project_target_labels;
CREATE POLICY "project_target_labels_update_own" ON project_target_labels
  FOR UPDATE USING (user_id = auth.uid());

DROP POLICY IF EXISTS "project_target_labels_delete_own" ON project_target_labels;
CREATE POLICY "project_target_labels_delete_own" ON project_target_labels
  FOR DELETE USING (user_id = auth.uid());
