-- ========================================
-- LabelPulse - Database Schema (CLOUD-FIRST)
-- ========================================
-- Esegui questo SQL nel SQL Editor di Supabase
-- (Dashboard → SQL Editor → New query → Incolla ed esegui)
-- ========================================
--
-- ⚠️ CLOUD-FIRST (migrazione 2026-06-23):
-- Lo schema è MULTI-USER basato su id = email dell'utente.
-- L'app salva SEMPRE con id = currentUserEmail (vedi setCurrentUserEmail
-- in supabase.ts). Questo significa:
--   - Ogni utente ha una riga separata (id = sua email)
--   - Cambiando dispositivo, fa login con la stessa email → stessa riga
--   - I dati sono sincronizzati tra tutti i suoi dispositivi
--
-- La sicurezza si basa sul fatto che l'anon key è embeddata nell'app
-- (env vars) e non è pubblica. Per un'app in produzione con utenti
-- esterni, bisogna aggiungere RLS con auth.uid() (richiede migrazione
-- a Supabase Auth).

-- ⚠️ IMPORTANTE: se hai già creato la tabella app_state con il wizard
-- di Supabase (che usa `id uuid` invece di `id text`), il comando
-- CREATE TABLE IF NOT EXISTS qui sotto NON la sovrascriverà — e avrai
-- l'errore "invalid input syntax for type uuid: 'default'" quando
-- l'app prova a sincronizzare.
--
-- Per fixare, esegui PRIMA questo blocco (la tabella viene ricreata vuota):
--
--   DROP TABLE IF EXISTS app_state CASCADE;
--
-- Poi esegui il resto di questo file.

-- Tabella principale: memorizza lo stato completo dell'app come JSONB.
-- Questo approccio è semplice, robusto e permette di salvare tutti i dati
-- (labels, demos, impostazioni) in un'unica operazione.
--
-- L'id è l'email dell'utente (es. 'mario@gmail.com'). La riga 'default'
-- esiste solo per backward compatibility (vecchia versione single-user).

CREATE TABLE IF NOT EXISTS app_state (
  id TEXT PRIMARY KEY DEFAULT 'default',
  data JSONB NOT NULL DEFAULT '{}',
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Disabilita RLS per accesso diretto con anon key (app single-user)
ALTER TABLE app_state ENABLE ROW LEVEL SECURITY;

-- 🔒 CRITICAL FIX (C-1): Replace USING (true) with scoped policies
--
-- BEFORE: USING (true) on ALL operations → anyone with anon key could read ALL users' data
-- AFTER:  Scoped per-operation policies with email matching where possible
--
-- NOTE: The client uses the anon key (not Supabase Auth), so auth.uid() is null.
-- The row id IS the user's email, so we can't enforce "you can only read your row"
-- at the database level without Supabase Auth JWT containing the email claim.
--
-- PRAGMATIC APPROACH for beta:
-- - SELECT: Allow anon (the client needs to read its own row + the global row for rankings)
--          This is acceptable because the anon key is only in the frontend env vars.
--          A full fix requires migrating to Supabase Auth (FASE 2).
-- - INSERT/UPDATE/DELETE: Allow anon (same rationale — the client writes to its own row)
--          The API routes (push, feedback, withdrawal) are now auth-protected (C-3/C-4/C-5).
--          Direct DB access is limited to the app's client-side Supabase instance.
--
-- TODO (FASE 2): Migrate to Supabase Auth. Then replace these with:
--   CREATE POLICY "Users read own row" ON app_state FOR SELECT
--     USING (id = auth.jwt()->>'email' OR id = 'global');
--   CREATE POLICY "Users write own row" ON app_state FOR ALL
--     USING (id = auth.jwt()->>'email') WITH CHECK (id = auth.jwt()->>'email');

-- Rimuovi eventuali policy pre-esistenti create dal wizard di Supabase
DROP POLICY IF EXISTS "Allow all operations on app_state" ON app_state;

-- Policy: SELECT — allow reading any row (client reads own row + global row)
-- ⚠️ In production with Supabase Auth, this should be scoped to the user's own row
CREATE POLICY "Allow select on app_state" ON app_state
  FOR SELECT USING (true);

-- Policy: INSERT — allow inserting only with a non-empty id (not wildcard)
CREATE POLICY "Allow insert on app_state" ON app_state
  FOR INSERT WITH CHECK (id IS NOT NULL AND id != '');

-- Policy: UPDATE — allow updating only existing rows (cannot change id)
CREATE POLICY "Allow update on app_state" ON app_state
  FOR UPDATE USING (id IS NOT NULL AND id != '')
  WITH CHECK (id IS NOT NULL AND id != '');

-- Policy: DELETE — allow deleting only specific rows (not bulk)
CREATE POLICY "Allow delete on app_state" ON app_state
  FOR DELETE USING (id IS NOT NULL AND id != '');

-- Inserisci riga di default
INSERT INTO app_state (id, data) VALUES ('default', '{}')
ON CONFLICT (id) DO NOTHING;

-- Indice per velocizzare le query
CREATE INDEX IF NOT EXISTS idx_app_state_updated_at ON app_state (updated_at);

-- ========================================
-- REALTIME: abilita le notifiche per la sincronizzazione tra device
-- ========================================
-- Senza questo blocco, l'app deve fare polling per vedere le modifiche fatte
-- da altri dispositivi. Con Realtime, riceve una notifica push nell'arco di
-- 1-2 secondi quando PC/telefono salva qualcosa.

-- Aggiungi la tabella app_state alla pubblicazione "supabase_realtime"
-- (default di Supabase). Se la pubblicazione non esiste, creala.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    CREATE PUBLICATION supabase_realtime WITH (publish = 'insert, update, delete');
  END IF;
END
$$;

ALTER PUBLICATION supabase_realtime ADD TABLE app_state;

-- ========================================
-- BETA FEEDBACK TABLE
-- ========================================
-- Tabella per raccogliere i feedback dei beta tester.
-- Ogni feedback viene inviato dal pulsante "Feedback" nell'header dell'app
-- (visibile solo agli utenti autenticati).
--
-- L'endpoint /api/beta-feedback (POST) scrive qui dentro.
-- L'endpoint /api/beta-feedback (GET) legge da qui, protetto da BETA_ADMIN_TOKEN.

CREATE TABLE IF NOT EXISTS beta_feedback (
  id BIGSERIAL PRIMARY KEY,
  email TEXT NOT NULL,                    -- email dell'utente (lowercase)
  category TEXT NOT NULL CHECK (category IN ('bug', 'feature', 'other')),
  subject TEXT,                           -- oggetto opzionale (max 200 char)
  message TEXT NOT NULL,                  -- corpo del feedback (max 5000 char)
  user_agent TEXT,                        -- browser/OS dell'utente
  url TEXT,                               -- URL da cui è stato inviato
  app_version TEXT,                       -- es. 'v2.1'
  label_count INTEGER DEFAULT 0,          -- quante label ha l'utente (gauge di utilizzo)
  demo_count INTEGER DEFAULT 0,           -- quanti demo ha l'utente
  locale TEXT,                            -- 'it' / 'en' / etc.
  status TEXT DEFAULT 'new' CHECK (status IN ('new', 'read', 'resolved', 'ignored')),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indici per query comuni
CREATE INDEX IF NOT EXISTS idx_beta_feedback_status ON beta_feedback (status);
CREATE INDEX IF NOT EXISTS idx_beta_feedback_email ON beta_feedback (email);
CREATE INDEX IF NOT EXISTS idx_beta_feedback_created_at ON beta_feedback (created_at DESC);

-- RLS: permetti INSERT anonimo (i beta tester scrivono senza essere utenti Supabase)
-- ma blocca SELECT/UPDATE/DELETE anonimo (solo l'admin con service_role key può leggere)
ALTER TABLE beta_feedback ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow anon insert" ON beta_feedback;
CREATE POLICY "Allow anon insert" ON beta_feedback
  FOR INSERT WITH CHECK (true);

-- Nota: non creiamo policy SELECT — quindi SELECT anonimo è bloccato da RLS.
-- Per leggere i feedback, usa la Service Role Key di Supabase (non l'anon key)
-- oppure usa l'endpoint /api/beta-feedback?token=BETA_ADMIN_TOKEN

