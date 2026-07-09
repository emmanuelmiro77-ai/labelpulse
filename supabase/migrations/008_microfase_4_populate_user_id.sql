-- =====================================================================
-- MICRO-FASE 4 — Popolamento user_id in tutte le tabelle FASE C
-- =====================================================================
-- Eseguire nel Supabase SQL Editor.
--
-- Prerequisiti:
--   - Micro-Fase 1A eseguita (colonna user_id esistente)
--   - Le tabelle FASE C hanno la colonna user_email popolata
--
-- Obiettivo:
--   Popolare user_id con il join user_email → auth.users.email.
--   Aggiorna solo righe con user_id IS NULL.
--   Non modifica altri campi. Non elimina user_email.
--
-- Idempotente: ri-eseguibile senza effetti collaterali.
-- =====================================================================

UPDATE user_profiles
SET user_id = au.id
FROM auth.users au
WHERE user_profiles.user_id IS NULL
  AND user_profiles.user_email = au.email;

UPDATE demo_submissions
SET user_id = au.id
FROM auth.users au
WHERE demo_submissions.user_id IS NULL
  AND demo_submissions.user_email = au.email;

UPDATE pitch_campaigns
SET user_id = au.id
FROM auth.users au
WHERE pitch_campaigns.user_id IS NULL
  AND pitch_campaigns.user_email = au.email;

UPDATE user_releases
SET user_id = au.id
FROM auth.users au
WHERE user_releases.user_id IS NULL
  AND user_releases.user_email = au.email;

UPDATE label_personal_data
SET user_id = au.id
FROM auth.users au
WHERE label_personal_data.user_id IS NULL
  AND label_personal_data.user_email = au.email;
