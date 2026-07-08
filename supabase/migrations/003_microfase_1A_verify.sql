-- =====================================================================
-- MICRO-FASE 1A — Verifica post-esecuzione
-- =====================================================================
-- Solo query SELECT. Nessuna modifica al database.
-- Eseguire nel Supabase SQL Editor dopo aver eseguito 001_microfase_1A.
-- =====================================================================

-- V1: Verifica che la colonna user_id esista su tutte le 5 tabelle
SELECT table_name, column_name, data_type, is_nullable
FROM information_schema.columns
WHERE column_name = 'user_id'
  AND table_schema = 'public'
  AND table_name IN ('demo_submissions', 'label_personal_data', 'pitch_campaigns', 'user_profiles', 'user_releases')
ORDER BY table_name;

-- V2: Verifica che tutte le righe abbiano user_id = NULL (colonna appena aggiunta)
SELECT 'demo_submissions' as t, COUNT(*) as total, COUNT(user_id) as with_user_id
FROM demo_submissions
UNION ALL
SELECT 'label_personal_data', COUNT(*), COUNT(user_id) FROM label_personal_data
UNION ALL
SELECT 'pitch_campaigns', COUNT(*), COUNT(user_id) FROM pitch_campaigns
UNION ALL
SELECT 'user_profiles', COUNT(*), COUNT(user_id) FROM user_profiles
UNION ALL
SELECT 'user_releases', COUNT(*), COUNT(user_id) FROM user_releases
ORDER BY t;

-- V3: Verifica che nessun dato sia stato perso (confrontare con backup)
SELECT 'demo_submissions' as t, COUNT(*) as row_count
FROM demo_submissions
UNION ALL
SELECT 'label_personal_data', COUNT(*) FROM label_personal_data
UNION ALL
SELECT 'pitch_campaigns', COUNT(*) FROM pitch_campaigns
UNION ALL
SELECT 'user_profiles', COUNT(*) FROM user_profiles
UNION ALL
SELECT 'user_releases', COUNT(*) FROM user_releases
ORDER BY t;
