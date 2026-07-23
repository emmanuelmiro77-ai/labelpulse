-- =====================================================================
-- Completamento migrazione user_id per label_personal_data
-- =====================================================================
-- L'applicazione usa esclusivamente user_id per tutte le operazioni CRUD
-- su label_personal_data. La migrazione da user_email a user_id è stata
-- iniziata (001: aggiunta colonna, 002: popolamento) ma mai completata:
--
--   1. user_email è ancora NOT NULL → l'upsert senza user_email fallisce
--   2. NON esiste UNIQUE(user_id, label_id) → ON CONFLICT fallisce
--
-- Questa migrazione completa la transizione in modo minimale:
--   - Rende user_email nullable (non viene più usata dall'app)
--   - Aggiunge UNIQUE(user_id, label_id) per abilitare l'upsert
--
-- NON elimina user_email (vincolo: non modificare la struttura esistente).
-- NON modifica RLS, policy, o trigger esistenti.
-- Idempotente: usa IF NOT EXISTS / DO $$ per sicurezza.
-- =====================================================================

-- Step 1: Rendi user_email nullable
ALTER TABLE label_personal_data ALTER COLUMN user_email DROP NOT NULL;

-- Step 2: Aggiungi UNIQUE constraint su (user_id, label_id)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'label_personal_data'::regclass
      AND contype = 'u'
      AND conname = 'label_personal_data_user_id_label_id_key'
  ) THEN
    ALTER TABLE label_personal_data
      ADD CONSTRAINT label_personal_data_user_id_label_id_key UNIQUE (user_id, label_id);
  END IF;
END $$;
