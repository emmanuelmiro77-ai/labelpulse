-- =====================================================================
-- MICRO-FASE 5 — user_profiles: UNIQUE constraint su user_id
-- =====================================================================
-- Obiettivo SINGOLO: aggiungere un vincolo UNIQUE su user_profiles.user_id
-- per risolvere l'errore PostgreSQL:
--   "there is no unique or exclusion constraint matching the ON CONFLICT
--    specification"
-- che si verifica quando il codice applicativo esegue:
--   supabase.from('user_profiles').upsert(..., { onConflict: 'user_id' })
--
-- SCOPO DELLA MIGRATION:
--   - Aggiungere ESCLUSIVAMENTE il vincolo UNIQUE su user_id
--   - NON modifica la Primary Key esistente (user_email resta PK)
--   - NON elimina user_email
--   - NON rende user_id Primary Key
--   - NON modifica altri vincoli (niente NOT NULL, niente FK changes)
--   - NON modifica policy RLS
--   - NON modifica trigger
--
-- Idempotente: ogni operazione è protetta da IF NOT EXISTS / IF EXISTS.
-- Re-run sicuro.
--
-- DOWN migration: inclusa come blocco commentato in fondo al file.
-- =====================================================================


-- ==================== PRE-FLIGHT CHECKS ====================
-- Fail fast: NESSUNA modifica strutturale viene applicata se questi
-- check falliscono. L'intera migration abortisce con errore esplicito
-- e il database resta intatto.

DO $$
DECLARE
  _null_count INTEGER;
  _dup_count INTEGER;
BEGIN
  -- Check 1: nessuna riga con user_id IS NULL
  -- Necessario perché UNIQUE constraint in PostgreSQL permette multipli
  -- NULL di default, ma il pattern ON CONFLICT (user_id) non matcha
  -- NULL → creerebbe righe spuri. Verifichiamo che tutti i dati
  -- esistenti abbiano user_id popolato PRIMA di aggiungere il vincolo.
  SELECT COUNT(*) INTO _null_count
  FROM user_profiles
  WHERE user_id IS NULL;

  IF _null_count > 0 THEN
    RAISE EXCEPTION 'BLOCKED: user_profiles ha % riga/he con user_id IS NULL. Impossibile aggiungere UNIQUE constraint.',
      _null_count
      USING ERRCODE = 'check_violation',
            HINT = 'Eseguire prima 008_microfase_4_populate_user_id.sql per popolare user_id via JOIN con auth.users.email.';
  END IF;

  -- Check 2: nessun user_id duplicato
  -- Necessario perché ADD CONSTRAINT UNIQUE fallirebbe se esistessero
  -- duplicati (PostgreSQL restituirebbe errore 23505 unique_violation).
  -- Verifichiamo prima per dare un messaggio chiaro.
  SELECT COUNT(*) INTO _dup_count
  FROM (
    SELECT user_id
    FROM user_profiles
    WHERE user_id IS NOT NULL
    GROUP BY user_id
    HAVING COUNT(*) > 1
  ) d;

  IF _dup_count > 0 THEN
    RAISE EXCEPTION 'BLOCKED: user_profiles ha % valore/i di user_id duplicato/i. Impossibile aggiungere UNIQUE constraint.',
      _dup_count
      USING ERRCODE = 'check_violation',
            HINT = 'Risolvere i duplicati manualmente prima di applicare questa migration. Verificare auth.users con email duplicate o modifiche manuali a user_profiles.';
  END IF;
END $$;


-- ==================== UP MIGRATION ====================

-- ---------------------------------------------------------------------
-- Step 1 (unico): ADD UNIQUE constraint su user_id
-- ---------------------------------------------------------------------
-- Nome constraint: user_profiles_user_id_key
--   (convenzione PostgreSQL: <table>_<column>_key per UNIQUE constraints)
--
-- Postgres crea automaticamente un UNIQUE INDEX implicito per sostenere
-- il constraint. Questo permette a ON CONFLICT (user_id) di funzionare.
--
-- NON modifica:
--   - La PK esistente user_profiles_pkey su user_email ( resta attiva )
--   - La colonna user_email (resta NOT NULL perché è PK)
--   - La colonna user_id (resta nullable come da migration 001)
--   - L'FK user_id → auth.users(id) (creato in 001)
--   - Le policy RLS (già basate su user_id = auth.uid())
--   - Il trigger updated_at
--
-- Nota su NULL: PostgreSQL UNIQUE permette multipli NULL di default.
-- Il pre-flight check 1 garantisce che NESSUNA riga esistente abbia
-- user_id IS NULL. Nuove INSERT con user_id = NULL sarebbero tecnicamente
-- permesse dal vincolo, ma il codice applicativo non le genera mai
-- (la route /api/profile ritorna 401 se userId è null, vedi
-- src/lib/supabase-admin.ts riga 31 + src/app/api/profile/route.ts
-- riga 39-41).
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'user_profiles'::regclass
      AND contype = 'u'
      AND conname = 'user_profiles_user_id_key'
  ) THEN
    ALTER TABLE user_profiles
      ADD CONSTRAINT user_profiles_user_id_key UNIQUE (user_id);
  END IF;
END $$;


-- ==================== DOWN MIGRATION (ROLLBACK) ====================
-- Supabase non ha un meccanismo automatico di DOWN migration.
-- Per fare rollback, copiare il blocco SQL qui sotto nel Supabase
-- SQL Editor ed eseguirlo manualmente.
--
-- Il rollback:
--   1. Rimuove ESCLUSIVAMENTE il vincolo UNIQUE su user_id
--   2. NON modifica la PK (user_email resta PK)
--   3. NON elimina user_email
--   4. NON modifica altri vincoli
--
-- Dopo il rollback, ON CONFLICT (user_id) tornerebbe a fallire con
-- errore 42P10. Il rollback è pensato solo per emergenze.

/*
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'user_profiles'::regclass
      AND contype = 'u'
      AND conname = 'user_profiles_user_id_key'
  ) THEN
    ALTER TABLE user_profiles DROP CONSTRAINT user_profiles_user_id_key;
  END IF;
END $$;
*/
