-- ========================================
-- FASE C — Nuove tabelle dedicate con RLS per-user
-- ========================================
-- Obiettivo: ogni tipo di dato utente ha la sua tabella, isolata per email.
-- Questo risolve il problema cross-device: cambi PC/telefono → stessi dati.
--
-- Strategia auth: NextAuth (Google) fornisce l'email via session JWT.
-- Le API routes Next.js usano getServerSession() + SUPABASE_SERVICE_ROLE_KEY
-- per operare sulla riga dell'utente autenticato.
--
-- Le RLS sono una "second layer" di difesa: se qualcuno riuscisse a chiamare
-- direttamente Supabase con l'anon key, vedrebbe solo righe dove
-- user_email corrisponde a un claim JWT (che con anon key è NULL → vedi solo
-- righe con user_email IS NULL, che non esistono mai).
-- ========================================

-- ========================================
-- 1. DEMO SUBMISSIONS
-- ========================================
-- Sostituisce il campo demos[] nel blob app_state.
-- Ogni demo è una riga isolata per user_email.

CREATE TABLE IF NOT EXISTS demo_submissions (
  id TEXT PRIMARY KEY,                    -- UUID generato client-side (genId())
  user_email TEXT NOT NULL,               -- partition key (lowercase)
  label_id TEXT NOT NULL,                 -- FK alla label (non enforced perché labels è in app_state)
  label_name TEXT,                        -- snapshot del nome label al momento della creazione
  track_name TEXT NOT NULL,
  artist_name TEXT,
  link TEXT,                              -- SoundCloud link principale
  status TEXT NOT NULL DEFAULT 'ready',   -- ready | sent | reviewing | accepted | rejected
  sent_date TIMESTAMPTZ,
  pitch_text TEXT,                        -- full generated pitch body
  pitch_subject TEXT,
  pitch_tracks JSONB,                     -- array of {trackName, artistName, scLink} for EP multi-track
  notes TEXT,
  parent_release_id TEXT,                 -- opzionale, per demo legati a una release
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_demo_submissions_user_email ON demo_submissions (user_email);
CREATE INDEX IF NOT EXISTS idx_demo_submissions_label_id ON demo_submissions (user_email, label_id);
CREATE INDEX IF NOT EXISTS idx_demo_submissions_status ON demo_submissions (user_email, status);
CREATE INDEX IF NOT EXISTS idx_demo_submissions_created_at ON demo_submissions (user_email, created_at DESC);

ALTER TABLE demo_submissions ENABLE ROW LEVEL SECURITY;

-- RLS: solo l'utente autenticato (via JWT Supabase Auth) vede le proprie righe.
-- Con anon key (no Supabase Auth), il claim email è NULL → vedi 0 righe.
-- Le API routes usano service_role key (bypassa RLS) dopo aver verificato la sessione NextAuth.
DROP POLICY IF EXISTS "Users can CRUD own demos" ON demo_submissions;
CREATE POLICY "Users can CRUD own demos" ON demo_submissions
  FOR ALL
  USING (user_email = auth.jwt() ->> 'email')
  WITH CHECK (user_email = auth.jwt() ->> 'email');

-- ========================================
-- 2. LABEL PERSONAL DATA
-- ========================================
-- Sostituisce i campi emails/notes/status/demoLink/etc. delle label nel blob app_state.
-- Una riga per (user_email, label_id). Se l'utente non ha personalizzato una label,
-- non c'è riga (la label esiste solo nel seed/global).

CREATE TABLE IF NOT EXISTS label_personal_data (
  id BIGSERIAL PRIMARY KEY,
  user_email TEXT NOT NULL,
  label_id TEXT NOT NULL,
  emails TEXT[] DEFAULT '{}',
  notes TEXT,
  status TEXT DEFAULT 'unknown',          -- open | closed | unknown
  website TEXT,
  demo_link TEXT,
  social_link TEXT,
  soundcloud_link TEXT,
  beatport_link TEXT,
  contact_info TEXT,
  custom_links JSONB DEFAULT '[]',        -- [{type, value}]
  -- Per label custom (non Beatport) salviamo tutto qui
  is_custom BOOLEAN DEFAULT FALSE,
  custom_name TEXT,
  custom_genre TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_email, label_id)
);

CREATE INDEX IF NOT EXISTS idx_label_personal_data_user_email ON label_personal_data (user_email);
CREATE INDEX IF NOT EXISTS idx_label_personal_data_label_id ON label_personal_data (user_email, label_id);
CREATE INDEX IF NOT EXISTS idx_label_personal_data_is_custom ON label_personal_data (user_email, is_custom);

ALTER TABLE label_personal_data ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can CRUD own label data" ON label_personal_data;
CREATE POLICY "Users can CRUD own label data" ON label_personal_data
  FOR ALL
  USING (user_email = auth.jwt() ->> 'email')
  WITH CHECK (user_email = auth.jwt() ->> 'email');

-- ========================================
-- 3. PITCH CAMPAIGNS
-- ========================================
-- Sostituisce savedPitches[] (bozze) e sentCampaigns[] (inviate) nel blob.
-- status distingue le due categorie.

CREATE TABLE IF NOT EXISTS pitch_campaigns (
  id TEXT PRIMARY KEY,                    -- UUID generato client-side
  user_email TEXT NOT NULL,
  label_id TEXT,
  label_name TEXT,
  demo_id TEXT,                           -- opzionale: demo collegato
  subject TEXT,
  body TEXT,
  pitch_tracks JSONB,                     -- per EP multi-track
  ep_link_mode TEXT,                      -- single | separate
  ep_soundcloud_url TEXT,
  status TEXT NOT NULL DEFAULT 'draft',   -- draft | sent
  sent_at TIMESTAMPTZ,
  sent_method TEXT,                       -- clipboard | gmail | inapp
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_pitch_campaigns_user_email ON pitch_campaigns (user_email);
CREATE INDEX IF NOT EXISTS idx_pitch_campaigns_status ON pitch_campaigns (user_email, status);
CREATE INDEX IF NOT EXISTS idx_pitch_campaigns_created_at ON pitch_campaigns (user_email, created_at DESC);

ALTER TABLE pitch_campaigns ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can CRUD own pitches" ON pitch_campaigns;
CREATE POLICY "Users can CRUD own pitches" ON pitch_campaigns
  FOR ALL
  USING (user_email = auth.jwt() ->> 'email')
  WITH CHECK (user_email = auth.jwt() ->> 'email');

-- ========================================
-- 4. USER PROFILES
-- ========================================
-- Sostituisce userProfile nel blob app_state.
-- Una riga per user_email.

CREATE TABLE IF NOT EXISTS user_profiles (
  user_email TEXT PRIMARY KEY,
  artist_name TEXT,
  bio TEXT,
  photo_url TEXT,                         -- data URL (base64 JPEG 256x256) o URL esterno
  sc_link TEXT,                           -- SoundCloud link privato
  links JSONB DEFAULT '[]',               -- [{type, value}]
  cyanite_api_token TEXT,                 -- BYOK (encrypted in future)
  locale TEXT DEFAULT 'it',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE user_profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can CRUD own profile" ON user_profiles;
CREATE POLICY "Users can CRUD own profile" ON user_profiles
  FOR ALL
  USING (user_email = auth.jwt() ->> 'email')
  WITH CHECK (user_email = auth.jwt() ->> 'email');

-- ========================================
-- 5. REALTIME — abilita per tutte le tabelle
-- ========================================
-- Permette al client di sottoscrivere cambiamenti in tempo reale
-- (cross-device: PC casa vede subito le modifiche fatte su PC lavoro)

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    CREATE PUBLICATION supabase_realtime WITH (publish = 'insert, update, delete');
  END IF;
END
$$;

ALTER PUBLICATION supabase_realtime ADD TABLE demo_submissions;
ALTER PUBLICATION supabase_realtime ADD TABLE label_personal_data;
ALTER PUBLICATION supabase_realtime ADD TABLE pitch_campaigns;
ALTER PUBLICATION supabase_realtime ADD TABLE user_profiles;

-- ========================================
-- 6. UPDATED_AT TRIGGER
-- ========================================
-- Aggiorna automaticamente updated_at ad ogni modifica

CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_demo_submissions_updated_at ON demo_submissions;
CREATE TRIGGER trigger_demo_submissions_updated_at
  BEFORE UPDATE ON demo_submissions
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS trigger_label_personal_data_updated_at ON label_personal_data;
CREATE TRIGGER trigger_label_personal_data_updated_at
  BEFORE UPDATE ON label_personal_data
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS trigger_pitch_campaigns_updated_at ON pitch_campaigns;
CREATE TRIGGER trigger_pitch_campaigns_updated_at
  BEFORE UPDATE ON pitch_campaigns
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS trigger_user_profiles_updated_at ON user_profiles;
CREATE TRIGGER trigger_user_profiles_updated_at
  BEFORE UPDATE ON user_profiles
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
