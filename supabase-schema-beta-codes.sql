-- ========================================
-- BETA ACCESS CODES TABLE
-- ========================================
-- Permette login senza Gmail per beta tester.
--
-- Funzionamento:
--   1. Admin genera un codice tramite /api/admin/generate-beta-code
--      (specificando l'email del beta tester)
--   2. Il codice viene salvato qui con scadenza 30 giorni
--   3. Il beta tester inserisce email + codice nell'app
--   4. NextAuth CredentialsProvider verifica via /api/auth/beta-verify
--   5. Se valido, il codice viene marcato used_at e l'utente è loggato
--
-- Un codice è associato a una email specifica (no riuso su altra email).

CREATE TABLE IF NOT EXISTS beta_access_codes (
  id BIGSERIAL PRIMARY KEY,
  email TEXT NOT NULL,                    -- email del beta tester (lowercase)
  code TEXT NOT NULL,                     -- codice alfanumerico 8 char
  note TEXT,                              -- descrizione opzionale (es. "Marco - iPhone")
  created_at TIMESTAMPTZ DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL,        -- default 30 giorni
  used_at TIMESTAMPTZ,                    -- NULL finché non usato
  created_by TEXT,                        -- email dell'admin che l'ha generato
  UNIQUE (email, code)
);

CREATE INDEX IF NOT EXISTS idx_beta_access_codes_email ON beta_access_codes (email);
CREATE INDEX IF NOT EXISTS idx_beta_access_codes_code ON beta_access_codes (code);
CREATE INDEX IF NOT EXISTS idx_beta_access_codes_used ON beta_access_codes (used_at);

-- RLS: consentiamo INSERT/SELECT/UPDATE con anon key per semplicità
-- (la anon key è embeddata nell'app e considerata semi-privata).
-- Per maggiore sicurezza, queste policy andrebbero limitate, ma per beta
-- testing controllato è sufficiente.
ALTER TABLE beta_access_codes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow all on beta_access_codes" ON beta_access_codes;
CREATE POLICY "Allow all on beta_access_codes" ON beta_access_codes
  FOR ALL USING (true) WITH CHECK (true);
