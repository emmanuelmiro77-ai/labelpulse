-- ========================================
-- FEATURE: Label Preferite (Favorites)
-- ========================================
-- Aggiunge la colonna is_favorite alla tabella label_personal_data
-- Esegue su Supabase SQL Editor
-- ========================================

ALTER TABLE label_personal_data 
ADD COLUMN IF NOT EXISTS is_favorite BOOLEAN DEFAULT FALSE;

-- Index per query veloci sui preferiti per utente
CREATE INDEX IF NOT EXISTS idx_label_personal_data_favorite 
ON label_personal_data (user_email, is_favorite) 
WHERE is_favorite = TRUE;
