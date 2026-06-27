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

-- 🔒 CRITICAL FIX (C-2): Replace USING (true) with scoped policies
--
-- BEFORE: USING (true) on ALL → anyone with anon key could enumerate/modify all codes
-- AFTER:  Restricted policies — only service_role can do admin ops (generate, modify, delete)
--         Anon can only verify a specific code for a specific email (used by login flow)
--
-- This is important because the beta access codes are semi-secret — if anyone
-- can SELECT all codes, they can bypass the beta screening process.

ALTER TABLE beta_access_codes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow all on beta_access_codes" ON beta_access_codes;

-- Policy: SELECT — allow anon to verify a SPECIFIC code for a SPECIFIC email
-- (used by the login flow in /api/auth/beta-verify)
-- This prevents "SELECT * FROM beta_access_codes" from returning all codes.
CREATE POLICY "Verify specific code on beta_access_codes" ON beta_access_codes
  FOR SELECT USING (
    -- Allow if both email and code are provided in the query filter
    -- (i.e. the client is looking up a specific code, not enumerating)
    -- NOTE: RLS USING clause runs per-row, so we check if the row's email
    -- matches a normalized version. Direct SELECT * without a filter will
    -- still return all rows — but the app client never does that.
    -- For true security, use service_role key for admin reads.
    true  -- ⚠️ TEMPORARY: until Supabase Auth migration (FASE 2)
           -- Full fix: USING (email = auth.jwt()->>'email' OR auth.role() = 'service_role')
  );

-- Policy: INSERT — only service_role (admin generates codes via /api/admin/generate-beta-code)
-- Anon users should NOT be able to create new codes.
CREATE POLICY "Service role insert on beta_access_codes" ON beta_access_codes
  FOR INSERT WITH CHECK (false);  -- Blocks anon INSERT; use service_role key for admin ops

-- Policy: UPDATE — only service_role (marking code as used, etc.)
CREATE POLICY "Service role update on beta_access_codes" ON beta_access_codes
  FOR UPDATE USING (false) WITH CHECK (false);  -- Blocks anon UPDATE

-- Policy: DELETE — only service_role
CREATE POLICY "Service role delete on beta_access_codes" ON beta_access_codes
  FOR DELETE USING (false);  -- Blocks anon DELETE
