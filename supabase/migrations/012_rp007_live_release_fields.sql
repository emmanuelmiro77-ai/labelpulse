-- =====================================================================
-- RP-007 / RP-007A — Live Release fields (label, beatport_url, promo_link, spotify_url)
-- =====================================================================
-- Aggiunge 4 colonne opzionali a user_releases per supportare
-- la creazione manuale di Release Live da promuovere.
-- Idempotente: ADD COLUMN IF NOT EXISTS.
-- =====================================================================

ALTER TABLE user_releases ADD COLUMN IF NOT EXISTS label TEXT;
ALTER TABLE user_releases ADD COLUMN IF NOT EXISTS beatport_url TEXT;
ALTER TABLE user_releases ADD COLUMN IF NOT EXISTS promo_link TEXT;
ALTER TABLE user_releases ADD COLUMN IF NOT EXISTS spotify_url TEXT;
