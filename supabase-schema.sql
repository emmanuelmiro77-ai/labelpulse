-- ========================================
-- LabelPulse - Database Schema
-- ========================================
-- Esegui questo SQL nel SQL Editor di Supabase
-- (Dashboard → SQL Editor → New query → Incolla ed esegui)
-- ========================================

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
-- Per un'app single-user è la soluzione ideale.

CREATE TABLE IF NOT EXISTS app_state (
  id TEXT PRIMARY KEY DEFAULT 'default',
  data JSONB NOT NULL DEFAULT '{}',
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Disabilita RLS per accesso diretto con anon key (app single-user)
ALTER TABLE app_state ENABLE ROW LEVEL SECURITY;

-- Rimuovi eventuali policy pre-esistenti create dal wizard di Supabase
-- (che richiederebbero auth.uid() e bloccherebbero l'accesso con anon key)
DROP POLICY IF EXISTS "Allow all operations on app_state" ON app_state;

-- Policy: permetti tutte le operazioni con la anon key
CREATE POLICY "Allow all operations on app_state" ON app_state
  FOR ALL USING (true) WITH CHECK (true);

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

