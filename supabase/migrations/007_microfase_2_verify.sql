-- =====================================================================
-- MICRO-FASE 2 — Verifica post-esecuzione nuove policy RLS
-- =====================================================================
-- Solo query SELECT. Nessuna modifica al database.
-- Eseguire nel Supabase SQL Editor dopo aver eseguito 006_microfase_2.
-- =====================================================================

-- V1: Verifica presenza delle 20 nuove policy (4 per tabella × 5 tabelle)
SELECT
  tablename,
  policyname,
  cmd,
  qual AS using_clause,
  with_check AS with_check_clause
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename IN ('demo_submissions', 'label_personal_data', 'pitch_campaigns', 'user_profiles', 'user_releases')
ORDER BY tablename, cmd;

-- V2: Verifica assenza delle vecchie policy legacy
SELECT
  tablename,
  policyname
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename IN ('demo_submissions', 'label_personal_data', 'pitch_campaigns', 'user_profiles', 'user_releases')
  AND policyname IN (
    'demo_submissions_all_access',
    'Users can CRUD own demos',
    'label_personal_data_all_access',
    'Users can CRUD own label data',
    'pitch_campaigns_all_access',
    'Users can CRUD own pitches',
    'user_profiles_all_access',
    'Users can CRUD own profile',
    'Users can CRUD own releases',
    'user_releases_all_access'
  )
ORDER BY tablename, policyname;

-- V3: Verifica assenza di USING(true) o WITH CHECK(true)
SELECT
  tablename,
  policyname,
  cmd,
  qual AS using_clause,
  with_check AS with_check_clause
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename IN ('demo_submissions', 'label_personal_data', 'pitch_campaigns', 'user_profiles', 'user_releases')
  AND (
    qual = 'true'
    OR with_check = 'true'
  )
ORDER BY tablename, policyname;

-- V4: Verifica assenza di auth.jwt()->>'email' in qualsiasi clausola
SELECT
  tablename,
  policyname,
  cmd,
  qual AS using_clause,
  with_check AS with_check_clause
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename IN ('demo_submissions', 'label_personal_data', 'pitch_campaigns', 'user_profiles', 'user_releases')
  AND (
    qual LIKE '%auth.jwt()%'
    OR with_check LIKE '%auth.jwt()%'
  )
ORDER BY tablename, policyname;

-- V5: Conteggio totale policy per tabella (atteso: 4 per ogni tabella)
SELECT
  tablename,
  COUNT(*) AS policy_count
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename IN ('demo_submissions', 'label_personal_data', 'pitch_campaigns', 'user_profiles', 'user_releases')
GROUP BY tablename
ORDER BY tablename;
