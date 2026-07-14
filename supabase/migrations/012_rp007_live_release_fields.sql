-- =====================================================================
-- RP-007 — Live Release fields (label, beatport_url, promo_link)
-- =====================================================================
-- Aggiunge 3 colonne opzionali a user_releases per supportare
-- la creazione manuale di Release Live da promuovere.
-- Idempotente: ADD COLUMN IF NOT EXISTS.
-- =====================================================================

ALTER TABLE user_releases ADD COLUMN IF NOT EXISTS label TEXT;
ALTER TABLE user_releases ADD COLUMN IF NOT EXISTS beatport_url TEXT;
ALTER TABLE user_releases ADD COLUMN IF NOT EXISTS promo_link TEXT;
