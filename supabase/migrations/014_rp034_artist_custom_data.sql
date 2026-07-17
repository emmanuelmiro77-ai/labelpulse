-- =====================================================================
-- RP-034 — artist_custom_data (artisti creati manualmente dall'utente)
-- =====================================================================

CREATE TABLE IF NOT EXISTS artist_custom_data (
  id TEXT PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id),
  artist_name TEXT NOT NULL,
  beatport_artist_id BIGINT,
  beatport_url TEXT,
  image_url TEXT,
  instagram_url TEXT,
  spotify_url TEXT,
  soundcloud_url TEXT,
  website_url TEXT,
  email TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_artist_custom_data_user
  ON artist_custom_data (user_id);

ALTER TABLE artist_custom_data ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "artist_custom_data_select_own" ON artist_custom_data;
CREATE POLICY "artist_custom_data_select_own" ON artist_custom_data
  FOR SELECT USING (user_id = auth.uid());

DROP POLICY IF EXISTS "artist_custom_data_insert_own" ON artist_custom_data;
CREATE POLICY "artist_custom_data_insert_own" ON artist_custom_data
  FOR INSERT WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "artist_custom_data_update_own" ON artist_custom_data;
CREATE POLICY "artist_custom_data_update_own" ON artist_custom_data
  FOR UPDATE USING (user_id = auth.uid());

DROP POLICY IF EXISTS "artist_custom_data_delete_own" ON artist_custom_data;
CREATE POLICY "artist_custom_data_delete_own" ON artist_custom_data
  FOR DELETE USING (user_id = auth.uid());

DROP TRIGGER IF EXISTS trigger_artist_custom_data_updated_at ON artist_custom_data;
CREATE TRIGGER trigger_artist_custom_data_updated_at
  BEFORE UPDATE ON artist_custom_data
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
