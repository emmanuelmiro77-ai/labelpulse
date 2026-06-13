-- ========================================
-- LabelPulse - Database Schema
-- ========================================
-- Esegui questo SQL nel SQL Editor di Supabase
-- (Dashboard → SQL Editor → New query → Incolla ed esegui)
-- ========================================

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

-- Policy: permetti tutte le operazioni con la anon key
CREATE POLICY "Allow all operations on app_state" ON app_state
  FOR ALL USING (true) WITH CHECK (true);

-- Inserisci riga di default
INSERT INTO app_state (id, data) VALUES ('default', '{}')
ON CONFLICT (id) DO NOTHING;

-- Indice per velocizzare le query
CREATE INDEX IF NOT EXISTS idx_app_state_updated_at ON app_state (updated_at);
