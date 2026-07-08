-- =====================================================================
-- MICRO-FASE 1A — Aggiunta colonna user_id (nullable)
-- =====================================================================
-- Aggiunge user_id UUID REFERENCES auth.users(id) alle 5 tabelle FASE C.
-- La colonna è nullable: tutte le righe esistenti avranno user_id = NULL.
-- Nessuna policy RLS viene modificata.
-- Idempotente: IF NOT EXISTS.
-- =====================================================================

ALTER TABLE demo_submissions ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id);
ALTER TABLE label_personal_data ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id);
ALTER TABLE pitch_campaigns ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id);
ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id);
ALTER TABLE user_releases ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id);
