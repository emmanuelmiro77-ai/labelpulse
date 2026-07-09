-- =====================================================================
-- MICRO-FASE 5 — user_profiles: PK migration user_email → user_id
-- =====================================================================
-- Obiettivo: completare il passaggio della tabella user_profiles da
-- user_email (PK legacy) a user_id (PK definitiva secondo architettura
-- cloud-first FASE D).
--
-- Prerequisiti (verificati da pre-flight checks qui sotto):
--   - Micro-Fase 1A eseguita (colonna user_id esistente)
--   - Micro-Fase 1B/4 eseguite (user_id popolato via JOIN con auth.users)
--   - Nessuna riga con user_id IS NULL
--   - Nessun user_id duplicato
--
-- Idempotente: ogni ALTER è protetto da IF EXISTS / IF NOT EXISTS.
-- Re-run sicuro.
--
-- DOWN migration: inclusa come blocco commentato in fondo al file.
-- =====================================================================


-- ==================== PRE-FLIGHT CHECKS ====================
-- Fail fast: NESSUNA modifica strutturale viene applicata se questi
-- check falliscono. L'intera migration abortisce con errore esplicito.

DO $$
DECLARE
  _null_count INTEGER;
  _dup_count INTEGER;
BEGIN
  -- Check 1: nessuna riga con user_id IS NULL
  SELECT COUNT(*) INTO _null_count
  FROM user_profiles
  WHERE user_id IS NULL;

  IF _null_count > 0 THEN
    RAISE EXCEPTION 'BLOCKED: user_profiles ha % riga/he con user_id IS NULL. Eseguire prima 008_microfase_4_populate_user_id.sql.',
      _null_count
      USING ERRCODE = 'check_violation',
            HINT = 'Popolare user_id via JOIN con auth.users.email prima di applicare questa migration.';
  END IF;

  -- Check 2: nessun user_id duplicato
  SELECT COUNT(*) INTO _dup_count
  FROM (
    SELECT user_id
    FROM user_profiles
    WHERE user_id IS NOT NULL
    GROUP BY user_id
    HAVING COUNT(*) > 1
  ) d;

  IF _dup_count > 0 THEN
    RAISE EXCEPTION 'BLOCKED: user_profiles ha % valore/i di user_id duplicato/i. Risolvere i duplicati prima di applicare questa migration.',
      _dup_count
      USING ERRCODE = 'check_violation',
            HINT = 'Verificare auth.users con email duplicate o modifiche manuali a user_profiles.';
  END IF;
END $$;


-- ==================== UP MIGRATION ====================

-- ---------------------------------------------------------------------
-- Step 1: user_id → NOT NULL
-- ---------------------------------------------------------------------
-- Pre-flight garantisce nessun NULL. SET NOT NULL è sicuro.
-- L'FK verso auth.users(id) (creato in 001_microfase_1A riga 13) resta
-- invariato: un FK non richiede che la colonna sia nullable.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'user_profiles'
      AND column_name = 'user_id'
      AND is_nullable = 'YES'
  ) THEN
    ALTER TABLE user_profiles ALTER COLUMN user_id SET NOT NULL;
  END IF;
END $$;


-- ---------------------------------------------------------------------
-- Step 2: DROP PRIMARY KEY su user_email
-- ---------------------------------------------------------------------
-- Il constraint PK è stato creato implicitamente da
--   `user_email TEXT PRIMARY KEY` (supabase-schema-fase-c.sql riga 143)
-- PostgreSQL lo nomina automaticamente `user_profiles_pkey`.
-- Il DROP rimuove anche l'indice univoco implicito su user_email.
-- Nessun FK punta a user_profiles.user_email (verificato: ricerca
--   REFERENCES user_profiles → 0 match in tutto il codebase).
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'user_profiles'::regclass
      AND contype = 'p'
  ) THEN
    ALTER TABLE user_profiles DROP CONSTRAINT user_profiles_pkey;
  END IF;
END $$;


-- ---------------------------------------------------------------------
-- Step 3: ADD PRIMARY KEY su user_id
-- ---------------------------------------------------------------------
-- Crea il nuovo constraint PK `user_profiles_pkey` su user_id.
-- PostgreSQL crea automaticamente un indice univoco implicito.
-- Pre-flight ha già escluso NULL e duplicati → ADD PK non può fallire
-- per violazione del vincolo.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'user_profiles'::regclass
      AND contype = 'p'
  ) THEN
    ALTER TABLE user_profiles ADD CONSTRAINT user_profiles_pkey PRIMARY KEY (user_id);
  END IF;
END $$;


-- ---------------------------------------------------------------------
-- Nota su user_email:
-- ---------------------------------------------------------------------
-- La colonna user_email NON viene droppata. Resta come colonna nullable
-- senza vincoli, per:
--   1. Backward compatibility (eventuale codice legacy che la legge)
--   2. Audit trail (email originale associata al profilo)
--   3. Debugging
-- Nessun indice viene creato su user_email perché:
--   - Le policy RLS (migration 006) usano user_id = auth.uid()
--   - Le API routes usano .eq("user_id", userId)
--   - Nessun codice attivo fa query per user_email
-- Una migration futura potrà droppare user_email quando sarà certo
-- che nessun codice la referencea.


-- ---------------------------------------------------------------------
-- Nota su FK e integrità referenziale:
-- ---------------------------------------------------------------------
-- L'FK `user_profiles.user_id REFERENCES auth.users(id)` (creato in
-- 001_microfase_1A riga 13) NON viene toccato da questa migration.
-- Il cambiamento di PK non altera l'FK, che continua a garantire che
-- ogni user_id in user_profiles esista in auth.users.id.
-- Nessun'altra tabella ha FK verso user_profiles (verificato).


-- ==================== DOWN MIGRATION (ROLLBACK) ====================
-- Supabase non ha un meccanismo automatico di DOWN migration.
-- Per fare rollback, copiare il blocco SQL qui sotto nel Supabase
-- SQL Editor ed eseguirlo manualmente.
--
-- Il rollback:
--   1. Rimuove la PK su user_id
--   2. Ripristina la PK su user_email
--   3. Rende user_id di nuovo nullable
--
-- Prerequisiti per il rollback:
--   - user_email non deve avere duplicati (lo aveva come PK prima, quindi OK)
--   - user_email non deve avere NULL (era NOT NULL come PK, quindi OK)
--
-- Il rollback NON elimina la colonna user_id (resta per future
-- popolazioni). Rimuove solo i vincoli aggiunti da questa migration.

/*
DO $$
BEGIN
  -- 1. DROP PK su user_id
  IF EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'user_profiles'::regclass
      AND contype = 'p'
  ) THEN
    ALTER TABLE user_profiles DROP CONSTRAINT user_profiles_pkey;
  END IF;

  -- 2. ADD PK su user_email (ripristino stato pre-migration)
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'user_profiles'::regclass
      AND contype = 'p'
  ) THEN
    ALTER TABLE user_profiles ADD CONSTRAINT user_profiles_pkey PRIMARY KEY (user_email);
  END IF;

  -- 3. Rendi user_id nullable (ripristino stato pre-migration)
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'user_profiles'
      AND column_name = 'user_id'
      AND is_nullable = 'NO'
  ) THEN
    ALTER TABLE user_profiles ALTER COLUMN user_id DROP NOT NULL;
  END IF;
END $$;
*/
