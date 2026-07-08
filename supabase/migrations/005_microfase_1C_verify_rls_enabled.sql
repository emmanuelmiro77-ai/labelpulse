-- =====================================================================
-- MICRO-FASE 1C — Verifica stato RLS e FORCERLS sulle tabelle FASE C
-- =====================================================================
-- Solo query SELECT. Nessuna modifica al database.
-- Eseguire nel Supabase SQL Editor.
-- =====================================================================

-- V1: Stato RLS + FORCERLS per ogni tabella FASE C
SELECT
  relname AS tablename,
  relrowsecurity AS rls_enabled,
  relforcerowsecurity AS force_rls_enabled,
  relowner::regrole AS table_owner
FROM pg_class
WHERE relnamespace = (SELECT oid FROM pg_namespace WHERE nspname = 'public')
  AND relkind = 'r'
  AND relname IN ('demo_submissions', 'label_personal_data', 'pitch_campaigns', 'user_profiles', 'user_releases')
ORDER BY relname;

-- V2: Privilegi espliciti concessi sulle tabelle FASE C
SELECT
  grantee,
  table_name,
  privilege_type
FROM information_schema.role_table_grants
WHERE table_schema = 'public'
  AND table_name IN ('demo_submissions', 'label_personal_data', 'pitch_campaigns', 'user_profiles', 'user_releases')
ORDER BY table_name, grantee, privilege_type;
