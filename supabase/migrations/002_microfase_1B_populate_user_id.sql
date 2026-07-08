-- =====================================================================
-- MICRO-FASE 1B — Popolamento user_id da auth.users
-- =====================================================================
-- Prerequisiti:
--   - Micro-Fase 1A eseguita (colonna user_id esistente)
--
-- Obiettivo:
--   Popolare user_id in tutte le 5 tabelle FASE C con il join
--   user_email → auth.users.email.
--
-- Sicurezza:
--   - Nessun dato viene perso
--   - Nessuna policy RLS viene modificata
--   - Idempotente: solo righe con user_id IS NULL vengono aggiornate
-- =====================================================================

UPDATE demo_submissions
SET user_id = au.id
FROM auth.users au
WHERE LOWER(TRIM(demo_submissions.user_email)) = LOWER(TRIM(au.email))
  AND demo_submissions.user_id IS NULL;

UPDATE label_personal_data
SET user_id = au.id
FROM auth.users au
WHERE LOWER(TRIM(label_personal_data.user_email)) = LOWER(TRIM(au.email))
  AND label_personal_data.user_id IS NULL;

UPDATE pitch_campaigns
SET user_id = au.id
FROM auth.users au
WHERE LOWER(TRIM(pitch_campaigns.user_email)) = LOWER(TRIM(au.email))
  AND pitch_campaigns.user_id IS NULL;

UPDATE user_profiles
SET user_id = au.id
FROM auth.users au
WHERE LOWER(TRIM(user_profiles.user_email)) = LOWER(TRIM(au.email))
  AND user_profiles.user_id IS NULL;

UPDATE user_releases
SET user_id = au.id
FROM auth.users au
WHERE LOWER(TRIM(user_releases.user_email)) = LOWER(TRIM(au.email))
  AND user_releases.user_id IS NULL;
