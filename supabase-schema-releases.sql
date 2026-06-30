-- ========================================
-- AGGIUNTA TABELLA RELEASES PER SYNC CLOUD COMPLETO
-- ========================================

CREATE TABLE IF NOT EXISTS user_releases (
  id TEXT PRIMARY KEY,                    -- UUID generato client-side (genId())
  user_email TEXT NOT NULL,               -- partition key (lowercase)
  type TEXT NOT NULL DEFAULT 'ep',        -- single | ep
  title TEXT NOT NULL,
  artists TEXT[] DEFAULT '{}',            -- array of artists
  track_ids TEXT[] DEFAULT '{}',          -- array of demo ids
  genre TEXT,
  notes TEXT,
  ep_soundcloud_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_user_releases_user_email ON user_releases (user_email);

ALTER TABLE user_releases ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can CRUD own releases" ON user_releases;
CREATE POLICY "Users can CRUD own releases" ON user_releases
  FOR ALL
  USING (user_email = auth.jwt() ->> 'email')
  WITH CHECK (user_email = auth.jwt() ->> 'email');

-- Abilita il realtime per la tabella user_releases
ALTER PUBLICATION supabase_realtime ADD TABLE user_releases;

-- Trigger updated_at
DROP TRIGGER IF EXISTS trigger_user_releases_updated_at ON user_releases;
CREATE TRIGGER trigger_user_releases_updated_at
  BEFORE UPDATE ON user_releases
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
