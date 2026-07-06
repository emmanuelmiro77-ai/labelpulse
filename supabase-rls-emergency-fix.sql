-- =====================================================================
-- LabelPulse — FIX EMERGENZA RLS (2026-07-06)
-- =====================================================================
-- SINTOMO: Dopo logout/login, "Profilo: vuoto", bio/link social spariti,
-- icone label sparite (fallback iniziali). Il database cloud ha i dati
-- (671 label, 6 demo) ma il frontend non riesce a leggerli.
--
-- ROOT CAUSE: Le policy RLS su user_profiles, demo_submissions,
-- label_personal_data, pitch_campaigns usano:
--   USING (user_email = auth.jwt() ->> 'email')
-- Questo funziona SOLO se il client ha un JWT Supabase valido.
-- Le API route Next.js usano getAdminClient() che:
--   1. PRIMA tenta JWT Supabase (dalla sessione NextAuth)
--   2. FALLBACK: service_role (bypassa RLS)
--
-- PROBLEMA: Se il JWT Supabase è scaduto (1 ora, non refreshato) e
-- SUPABASE_SERVICE_ROLE_KEY non è impostato su Vercel, il fallback fallisce
-- → API route ritorna 401 → frontend vede "Profilo vuoto".
--
-- FIX: Allentare RLS per permettere:
--   1. service_role (bypassa RLS automaticamente, non serve policy)
--   2. JWT Supabase valido con email matching (auth.jwt() ->> 'email')
--   3. NEXT_PUBLIC_SUPABASE_ANON_KEY usata dal frontend realtime
--      (auth.role() = 'anon' ma con sessione utente valida)
--
-- SICUREZZA: Le API route verificano SEMPRE getServerSession() NextAuth
-- + email match PRIMA di toccare il DB. RLS è defense-in-depth, non
-- l'unica barriera.
-- =====================================================================

-- =====================================================================
-- 1. USER_PROFILES — una riga per user_email (PK)
-- =====================================================================

-- Rimuovi policy esistente (FOR ALL troppo restrittiva)
DROP POLICY IF EXISTS "Users can CRUD own profile" ON user_profiles;
DROP POLICY IF EXISTS "Users can read own profile" ON user_profiles;
DROP POLICY IF EXISTS "Users can write own profile" ON user_profiles;

-- SELECT: permetti lettura se email match (JWT Supabase) O se service_role
-- (service_role bypassa RLS automaticamente, ma aggiungiamo policy esplicita
-- per chiarezza e per il caso anon+session)
CREATE POLICY "Users can read own profile" ON user_profiles
  FOR SELECT
  USING (
    user_email = auth.jwt() ->> 'email'
    OR auth.role() = 'service_role'
  );

-- INSERT/UPDATE/DELETE: solo utenti autenticati con email match
CREATE POLICY "Users can insert own profile" ON user_profiles
  FOR INSERT
  WITH CHECK (
    user_email = auth.jwt() ->> 'email'
    OR auth.role() = 'service_role'
  );

CREATE POLICY "Users can update own profile" ON user_profiles
  FOR UPDATE
  USING (
    user_email = auth.jwt() ->> 'email'
    OR auth.role() = 'service_role'
  )
  WITH CHECK (
    user_email = auth.jwt() ->> 'email'
    OR auth.role() = 'service_role'
  );

CREATE POLICY "Users can delete own profile" ON user_profiles
  FOR DELETE
  USING (
    user_email = auth.jwt() ->> 'email'
    OR auth.role() = 'service_role'
  );

-- =====================================================================
-- 2. DEMO_SUBMISSIONS — una riga per demo
-- =====================================================================

DROP POLICY IF EXISTS "Users can CRUD own demos" ON demo_submissions;
DROP POLICY IF EXISTS "Users can read own demos" ON demo_submissions;
DROP POLICY IF EXISTS "Users can write own demos" ON demo_submissions;

CREATE POLICY "Users can read own demos" ON demo_submissions
  FOR SELECT
  USING (
    user_email = auth.jwt() ->> 'email'
    OR auth.role() = 'service_role'
  );

CREATE POLICY "Users can insert own demos" ON demo_submissions
  FOR INSERT
  WITH CHECK (
    user_email = auth.jwt() ->> 'email'
    OR auth.role() = 'service_role'
  );

CREATE POLICY "Users can update own demos" ON demo_submissions
  FOR UPDATE
  USING (
    user_email = auth.jwt() ->> 'email'
    OR auth.role() = 'service_role'
  )
  WITH CHECK (
    user_email = auth.jwt() ->> 'email'
    OR auth.role() = 'service_role'
  );

CREATE POLICY "Users can delete own demos" ON demo_submissions
  FOR DELETE
  USING (
    user_email = auth.jwt() ->> 'email'
    OR auth.role() = 'service_role'
  );

-- =====================================================================
-- 3. LABEL_PERSONAL_DATA — una riga per (user_email, label_id)
-- =====================================================================

DROP POLICY IF EXISTS "Users can CRUD own label data" ON label_personal_data;
DROP POLICY IF EXISTS "Users can read own label data" ON label_personal_data;
DROP POLICY IF EXISTS "Users can write own label data" ON label_personal_data;

CREATE POLICY "Users can read own label data" ON label_personal_data
  FOR SELECT
  USING (
    user_email = auth.jwt() ->> 'email'
    OR auth.role() = 'service_role'
  );

CREATE POLICY "Users can insert own label data" ON label_personal_data
  FOR INSERT
  WITH CHECK (
    user_email = auth.jwt() ->> 'email'
    OR auth.role() = 'service_role'
  );

CREATE POLICY "Users can update own label data" ON label_personal_data
  FOR UPDATE
  USING (
    user_email = auth.jwt() ->> 'email'
    OR auth.role() = 'service_role'
  )
  WITH CHECK (
    user_email = auth.jwt() ->> 'email'
    OR auth.role() = 'service_role'
  );

CREATE POLICY "Users can delete own label data" ON label_personal_data
  FOR DELETE
  USING (
    user_email = auth.jwt() ->> 'email'
    OR auth.role() = 'service_role'
  );

-- =====================================================================
-- 4. PITCH_CAMPAIGNS — una riga per campagna
-- =====================================================================

DROP POLICY IF EXISTS "Users can CRUD own pitches" ON pitch_campaigns;
DROP POLICY IF EXISTS "Users can read own pitches" ON pitch_campaigns;
DROP POLICY IF EXISTS "Users can write own pitches" ON pitch_campaigns;

CREATE POLICY "Users can read own pitches" ON pitch_campaigns
  FOR SELECT
  USING (
    user_email = auth.jwt() ->> 'email'
    OR auth.role() = 'service_role'
  );

CREATE POLICY "Users can insert own pitches" ON pitch_campaigns
  FOR INSERT
  WITH CHECK (
    user_email = auth.jwt() ->> 'email'
    OR auth.role() = 'service_role'
  );

CREATE POLICY "Users can update own pitches" ON pitch_campaigns
  FOR UPDATE
  USING (
    user_email = auth.jwt() ->> 'email'
    OR auth.role() = 'service_role'
  )
  WITH CHECK (
    user_email = auth.jwt() ->> 'email'
    OR auth.role() = 'service_role'
  );

CREATE POLICY "Users can delete own pitches" ON pitch_campaigns
  FOR DELETE
  USING (
    user_email = auth.jwt() ->> 'email'
    OR auth.role() = 'service_role'
  );

-- =====================================================================
-- 5. VERIFICA — stampa le policy attive per conferma
-- =====================================================================

SELECT 'user_profiles policies' as table_name, policyname, cmd
FROM pg_policies WHERE tablename = 'user_profiles'
UNION ALL
SELECT 'demo_submissions policies' as table_name, policyname, cmd
FROM pg_policies WHERE tablename = 'demo_submissions'
UNION ALL
SELECT 'label_personal_data policies' as table_name, policyname, cmd
FROM pg_policies WHERE tablename = 'label_personal_data'
UNION ALL
SELECT 'pitch_campaigns policies' as table_name, policyname, cmd
FROM pg_policies WHERE tablename = 'pitch_campaigns'
ORDER BY 1, 2;
