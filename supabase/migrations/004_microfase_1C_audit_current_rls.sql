-- =====================================================================
-- MICRO-FASE 1C — Audit stato RLS attuale sulle tabelle FASE C
-- =====================================================================
-- Solo query SELECT. Nessuna modifica al database.
-- Eseguire nel Supabase SQL Editor.
-- =====================================================================

-- V1: Stato RLS (abilitata/disabilitata) per ogni tabella FASE C
SELECT
  tablename,
  rowsecurity AS rls_enabled
FROM pg_tables
WHERE schemaname = 'public'
  AND tablename IN ('demo_submissions', 'label_personal_data', 'pitch_campaigns', 'user_profiles', 'user_releases')
ORDER BY tablename;

-- V2: Elenco completo delle policy esistenti sulle tabelle FASE C
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
