-- =====================================================================
-- RP-007 / RP-007A / RP-008 — Live Release fields
-- =====================================================================
-- Aggiunge 6 colonne opzionali a user_releases per supportare
-- la creazione manuale di Release Live da promuovere + import da URL.
-- Idempotente: ADD COLUMN IF NOT EXISTS.
-- =====================================================================

ALTER TABLE user_releases ADD COLUMN IF NOT EXISTS label TEXT;
ALTER TABLE user_releases ADD COLUMN IF NOT EXISTS beatport_url TEXT;
ALTER TABLE user_releases ADD COLUMN IF NOT EXISTS promo_link TEXT;
ALTER TABLE user_releases ADD COLUMN IF NOT EXISTS spotify_url TEXT;
ALTER TABLE user_releases ADD COLUMN IF NOT EXISTS source_url TEXT;
ALTER TABLE user_releases ADD COLUMN IF NOT EXISTS status TEXT;
