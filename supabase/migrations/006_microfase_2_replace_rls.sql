-- =====================================================================
-- MICRO-FASE 2 — Sostituzione policy RLS con auth.uid() = user_id
-- =====================================================================
-- Elimina le policy legacy e crea nuove policy per-user basate
-- esclusivamente su user_id = auth.uid().
--
-- Una policy separata per SELECT, INSERT, UPDATE, DELETE per ogni tabella.
--
-- Prerequisiti:
--   - Micro-Fase 1A eseguita (colonna user_id esistente)
--   - Micro-Fase 1B popolamento eseguito (user_id popolato)
--   - Audit RLS completato (policy legacy censite)
--
-- Non modifica: FORCE RLS, GRANT, altre tabelle.
-- Idempotente: DROP IF EXISTS + CREATE.
-- =====================================================================

-- =====================================================================
-- 1. DEMO_SUBMISSIONS
-- =====================================================================
DROP POLICY IF EXISTS "demo_submissions_all_access" ON demo_submissions;
DROP POLICY IF EXISTS "Users can CRUD own demos" ON demo_submissions;
DROP POLICY IF EXISTS "demo_submissions_select_own" ON demo_submissions;
DROP POLICY IF EXISTS "demo_submissions_insert_own" ON demo_submissions;
DROP POLICY IF EXISTS "demo_submissions_update_own" ON demo_submissions;
DROP POLICY IF EXISTS "demo_submissions_delete_own" ON demo_submissions;

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
DROP POLICY IF EXISTS "label_personal_data_all_access" ON label_personal_data;
DROP POLICY IF EXISTS "Users can CRUD own label data" ON label_personal_data;
DROP POLICY IF EXISTS "label_personal_data_select_own" ON label_personal_data;
DROP POLICY IF EXISTS "label_personal_data_insert_own" ON label_personal_data;
DROP POLICY IF EXISTS "label_personal_data_update_own" ON label_personal_data;
DROP POLICY IF EXISTS "label_personal_data_delete_own" ON label_personal_data;

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
DROP POLICY IF EXISTS "pitch_campaigns_all_access" ON pitch_campaigns;
DROP POLICY IF EXISTS "Users can CRUD own pitches" ON pitch_campaigns;
DROP POLICY IF EXISTS "pitch_campaigns_select_own" ON pitch_campaigns;
DROP POLICY IF EXISTS "pitch_campaigns_insert_own" ON pitch_campaigns;
DROP POLICY IF EXISTS "pitch_campaigns_update_own" ON pitch_campaigns;
DROP POLICY IF EXISTS "pitch_campaigns_delete_own" ON pitch_campaigns;

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
DROP POLICY IF EXISTS "user_profiles_all_access" ON user_profiles;
DROP POLICY IF EXISTS "Users can CRUD own profile" ON user_profiles;
DROP POLICY IF EXISTS "user_profiles_select_own" ON user_profiles;
DROP POLICY IF EXISTS "user_profiles_insert_own" ON user_profiles;
DROP POLICY IF EXISTS "user_profiles_update_own" ON user_profiles;
DROP POLICY IF EXISTS "user_profiles_delete_own" ON user_profiles;

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
DROP POLICY IF EXISTS "Users can CRUD own releases" ON user_releases;
DROP POLICY IF EXISTS "user_releases_all_access" ON user_releases;
DROP POLICY IF EXISTS "user_releases_select_own" ON user_releases;
DROP POLICY IF EXISTS "user_releases_insert_own" ON user_releases;
DROP POLICY IF EXISTS "user_releases_update_own" ON user_releases;
DROP POLICY IF EXISTS "user_releases_delete_own" ON user_releases;

CREATE POLICY "user_releases_select_own" ON user_releases
  FOR SELECT USING (user_id = auth.uid());

CREATE POLICY "user_releases_insert_own" ON user_releases
  FOR INSERT WITH CHECK (user_id = auth.uid());

CREATE POLICY "user_releases_update_own" ON user_releases
  FOR UPDATE USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

CREATE POLICY "user_releases_delete_own" ON user_releases
  FOR DELETE USING (user_id = auth.uid());
