-- =====================================================================
-- MICRO-FASE 4 — Verifica popolamento user_id
-- =====================================================================
-- Solo query SELECT. Nessuna modifica al database.
-- Eseguire nel Supabase SQL Editor dopo 008_microfase_4.
-- =====================================================================

-- V1: Conta righe totali vs righe con user_id popolato
SELECT 'user_profiles' as t, COUNT(*) as total, COUNT(user_id) as with_user_id
FROM user_profiles
UNION ALL
SELECT 'demo_submissions', COUNT(*), COUNT(user_id) FROM demo_submissions
UNION ALL
SELECT 'pitch_campaigns', COUNT(*), COUNT(user_id) FROM pitch_campaigns
UNION ALL
SELECT 'user_releases', COUNT(*), COUNT(user_id) FROM user_releases
UNION ALL
SELECT 'label_personal_data', COUNT(*), COUNT(user_id) FROM label_personal_data
ORDER BY t;

-- V2: Conta righe ancora con user_id NULL
SELECT 'user_profiles' as t, COUNT(*) as null_count
FROM user_profiles WHERE user_id IS NULL
UNION ALL
SELECT 'demo_submissions', COUNT(*) FROM demo_submissions WHERE user_id IS NULL
UNION ALL
SELECT 'pitch_campaigns', COUNT(*) FROM pitch_campaigns WHERE user_id IS NULL
UNION ALL
SELECT 'user_releases', COUNT(*) FROM user_releases WHERE user_id IS NULL
UNION ALL
SELECT 'label_personal_data', COUNT(*) FROM label_personal_data WHERE user_id IS NULL
ORDER BY t;

-- V3: Verifica corrispondenza user_id ↔ user_email
SELECT 'user_profiles' as t, COUNT(*) as mismatches
FROM user_profiles up
JOIN auth.users au ON up.user_id = au.id
WHERE up.user_email != au.email
UNION ALL
SELECT 'demo_submissions', COUNT(*)
FROM demo_submissions ds
JOIN auth.users au ON ds.user_id = au.id
WHERE ds.user_email != au.email
UNION ALL
SELECT 'pitch_campaigns', COUNT(*)
FROM pitch_campaigns pc
JOIN auth.users au ON pc.user_id = au.id
WHERE pc.user_email != au.email
UNION ALL
SELECT 'user_releases', COUNT(*)
FROM user_releases ur
JOIN auth.users au ON ur.user_id = au.id
WHERE ur.user_email != au.email
UNION ALL
SELECT 'label_personal_data', COUNT(*)
FROM label_personal_data lpd
JOIN auth.users au ON lpd.user_id = au.id
WHERE lpd.user_email != au.email
ORDER BY t;
