-- =====================================================================
-- RP-005 — Promotion Targets (stato promozione per target di release)
-- =====================================================================
-- Permette al Producer di tracciare lo stato di promozione di ogni
-- target artista per una specifica release.
--
-- Una riga per (user_id, release_id, artist_id).
-- Stato operativo: pending → dm_sent → waiting → replied → supported
-- =====================================================================

CREATE TABLE IF NOT EXISTS promotion_targets (
  id TEXT PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id),
  release_id TEXT NOT NULL,
  artist_id TEXT NOT NULL,
  artist_name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, release_id, artist_id)
);

CREATE INDEX IF NOT EXISTS idx_promotion_targets_user_release
  ON promotion_targets (user_id, release_id);

ALTER TABLE promotion_targets ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "promotion_targets_select_own" ON promotion_targets;
CREATE POLICY "promotion_targets_select_own" ON promotion_targets
  FOR SELECT USING (user_id = auth.uid());

DROP POLICY IF EXISTS "promotion_targets_insert_own" ON promotion_targets;
CREATE POLICY "promotion_targets_insert_own" ON promotion_targets
  FOR INSERT WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "promotion_targets_update_own" ON promotion_targets;
CREATE POLICY "promotion_targets_update_own" ON promotion_targets
  FOR UPDATE USING (user_id = auth.uid());

DROP POLICY IF EXISTS "promotion_targets_delete_own" ON promotion_targets;
CREATE POLICY "promotion_targets_delete_own" ON promotion_targets
  FOR DELETE USING (user_id = auth.uid());

DROP TRIGGER IF EXISTS trigger_promotion_targets_updated_at ON promotion_targets;
CREATE TRIGGER trigger_promotion_targets_updated_at
  BEFORE UPDATE ON promotion_targets
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
