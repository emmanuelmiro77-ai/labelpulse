-- =====================================================================
-- MICRO-FASE 1B — Abilitazione RLS per-user con auth.uid()
-- =====================================================================
-- Sostituisce tutte le policy esistenti con policy basate su
-- user_id = auth.uid() su 5 tabelle FASE C.
--
-- Prerequisiti:
--   - Micro-Fase 1A eseguita (colonna user_id esistente)
--   - Micro-Fase 1B popolamento eseguito (user_id popolato)
--
-- Sicurezza:
--   - Idempotente: DROP IF EXISTS + CREATE (ri-eseguibile)
--   - Nessun USING(true), nessun WITH CHECK(true)
--   - Nessun fallback anon/service_role
--   - Solo auth.uid() = user_id
-- =====================================================================

-- =====================================================================
-- 1. DEMO_SUBMISSIONS
-- =====================================================================
ALTER TABLE demo_submissions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can CRUD own demos" ON demo_submissions;
DROP POLICY IF EXISTS "Users can read own demos" ON demo_submissions;
DROP POLICY IF EXISTS "Users can write own demos" ON demo_submissions;
DROP POLICY IF EXISTS "Users can insert own demos" ON demo_submissions;
DROP POLICY IF EXISTS "Users can update own demos" ON demo_submissions;
DROP POLICY IF EXISTS "Users can delete own demos" ON demo_submissions;
DROP POLICY IF EXISTS "demo_submissions_all_access" ON demo_submissions;

CREATE POLICY "demo_submissions_select_own" ON demo_submissions
  FOR SELECT USING (user_id = auth.uid());

CREATE POLICY "demo_submissions_insert_own" ON demo_submissions
  FOR INSERT WITH CHECK (user_id = auth.uid());

CREATE POLICY "demo_submissions_update_own" ON demo_submissions
  FOR UPDATE USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

CREATE POLICY "demo_submissions_delete_own" ON demo_submissions
  FOR DELETE USING (user_id = auth.uid());

-- =====================================================================
-- 2. LABEL_PERSONAL_DATA
-- =====================================================================
ALTER TABLE label_personal_data ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can CRUD own label data" ON label_personal_data;
DROP POLICY IF EXISTS "Users can read own label data" ON label_personal_data;
DROP POLICY IF EXISTS "Users can write own label data" ON label_personal_data;
DROP POLICY IF EXISTS "Users can insert own label data" ON label_personal_data;
DROP POLICY IF EXISTS "Users can update own label data" ON label_personal_data;
DROP POLICY IF EXISTS "Users can delete own label data" ON label_personal_data;
DROP POLICY IF EXISTS "label_personal_data_all_access" ON label_personal_data;

CREATE POLICY "label_personal_data_select_own" ON label_personal_data
  FOR SELECT USING (user_id = auth.uid());

CREATE POLICY "label_personal_data_insert_own" ON label_personal_data
  FOR INSERT WITH CHECK (user_id = auth.uid());

CREATE POLICY "label_personal_data_update_own" ON label_personal_data
  FOR UPDATE USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

CREATE POLICY "label_personal_data_delete_own" ON label_personal_data
  FOR DELETE USING (user_id = auth.uid());

-- =====================================================================
-- 3. PITCH_CAMPAIGNS
-- =====================================================================
ALTER TABLE pitch_campaigns ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can CRUD own pitches" ON pitch_campaigns;
DROP POLICY IF EXISTS "Users can read own pitches" ON pitch_campaigns;
DROP POLICY IF EXISTS "Users can write own pitches" ON pitch_campaigns;
DROP POLICY IF EXISTS "Users can insert own pitches" ON pitch_campaigns;
DROP POLICY IF EXISTS "Users can update own pitches" ON pitch_campaigns;
DROP POLICY IF EXISTS "Users can delete own pitches" ON pitch_campaigns;
DROP POLICY IF EXISTS "pitch_campaigns_all_access" ON pitch_campaigns;

CREATE POLICY "pitch_campaigns_select_own" ON pitch_campaigns
  FOR SELECT USING (user_id = auth.uid());

CREATE POLICY "pitch_campaigns_insert_own" ON pitch_campaigns
  FOR INSERT WITH CHECK (user_id = auth.uid());

CREATE POLICY "pitch_campaigns_update_own" ON pitch_campaigns
  FOR UPDATE USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

CREATE POLICY "pitch_campaigns_delete_own" ON pitch_campaigns
  FOR DELETE USING (user_id = auth.uid());

-- =====================================================================
-- 4. USER_PROFILES
-- =====================================================================
ALTER TABLE user_profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can CRUD own profile" ON user_profiles;
DROP POLICY IF EXISTS "Users can read own profile" ON user_profiles;
DROP POLICY IF EXISTS "Users can write own profile" ON user_profiles;
DROP POLICY IF EXISTS "Users can insert own profile" ON user_profiles;
DROP POLICY IF EXISTS "Users can update own profile" ON user_profiles;
DROP POLICY IF EXISTS "Users can delete own profile" ON user_profiles;
DROP POLICY IF EXISTS "user_profiles_all_access" ON user_profiles;

CREATE POLICY "user_profiles_select_own" ON user_profiles
  FOR SELECT USING (user_id = auth.uid());

CREATE POLICY "user_profiles_insert_own" ON user_profiles
  FOR INSERT WITH CHECK (user_id = auth.uid());

CREATE POLICY "user_profiles_update_own" ON user_profiles
  FOR UPDATE USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

CREATE POLICY "user_profiles_delete_own" ON user_profiles
  FOR DELETE USING (user_id = auth.uid());

-- =====================================================================
-- 5. USER_RELEASES
-- =====================================================================
ALTER TABLE user_releases ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can CRUD own releases" ON user_releases;
DROP POLICY IF EXISTS "Users can read own releases" ON user_releases;
DROP POLICY IF EXISTS "Users can write own releases" ON user_releases;
DROP POLICY IF EXISTS "Users can insert own releases" ON user_releases;
DROP POLICY IF EXISTS "Users can update own releases" ON user_releases;
DROP POLICY IF EXISTS "Users can delete own releases" ON user_releases;
DROP POLICY IF EXISTS "user_releases_all_access" ON user_releases;

CREATE POLICY "user_releases_select_own" ON user_releases
  FOR SELECT USING (user_id = auth.uid());

CREATE POLICY "user_releases_insert_own" ON user_releases
  FOR INSERT WITH CHECK (user_id = auth.uid());

CREATE POLICY "user_releases_update_own" ON user_releases
  FOR UPDATE USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

CREATE POLICY "user_releases_delete_own" ON user_releases
  FOR DELETE USING (user_id = auth.uid());
