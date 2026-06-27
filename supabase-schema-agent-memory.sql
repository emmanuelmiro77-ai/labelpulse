-- ============================================================================
-- agent_memory — Tabella cloud per memoria permanente dell'agente AI
-- ============================================================================
--
-- SCOPO: Avere un backup cloud (oltre a GitHub) della memoria dell'agente.
--        Ogni volta che l'agente risolve un bug o aggiunge una feature,
--        inserisce una riga qui. Query-able per data, tipo, file toccato.
--
-- COME INSTALLARE (3 minuti):
--   1. Vai su https://supabase.com/dashboard
--   2. Apri il tuo progetto LabelPulse
--   3. Clicca "SQL Editor" nella sidebar sinistra
--   4. Clicca "New query"
--   5. Incolla tutto questo file e clicca "Run" (ctrl+enter)
--   6. Se vedi "Success. No rows returned" → fatto ✅
--
-- ============================================================================

-- Tabella per log eventi dell'agente
CREATE TABLE IF NOT EXISTS agent_memory (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  event_type TEXT NOT NULL CHECK (
    event_type IN ('bug_fix', 'feature', 'regression', 'decision', 'note', 'milestone')
  ),
  -- Sintomo visibile all'utente (per bug_fix) o nome feature (per feature)
  title TEXT NOT NULL,
  -- Descrizione: cosa è stato fatto, perché, come
  description TEXT,
  -- Commit hash (es. "abc1234")
  commit_hash TEXT,
  -- File toccati (array, es. ["src/lib/gmail.ts", "src/lib/store.ts"])
  files_affected TEXT[] DEFAULT '{}',
  -- Sintomo chiave per ricerca (es. "gmail mime header leak")
  search_keywords TEXT[] DEFAULT '{}',
  -- Severity: critical / high / medium / low
  severity TEXT DEFAULT 'medium' CHECK (
    severity IN ('critical', 'high', 'medium', 'low')
  ),
  -- Metadati aggiuntivi in JSON
  metadata JSONB DEFAULT '{}'
);

-- Indici per query veloci
CREATE INDEX IF NOT EXISTS idx_agent_memory_created_at ON agent_memory (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_agent_memory_event_type ON agent_memory (event_type);
CREATE INDEX IF NOT EXISTS idx_agent_memory_severity ON agent_memory (severity);
CREATE INDEX IF NOT EXISTS idx_agent_memory_search_keywords ON agent_memory USING GIN (search_keywords);
CREATE INDEX IF NOT EXISTS idx_agent_memory_files_affected ON agent_memory USING GIN (files_affected);

-- RLS: permetti select/insert anonimi (l'anon key è embeddata nell'app)
-- In produzione si dovrebbe restringere, ma per ora così va bene
ALTER TABLE agent_memory ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow anon select on agent_memory" ON agent_memory;
CREATE POLICY "Allow anon select on agent_memory"
  ON agent_memory FOR SELECT
  TO anon, authenticated
  USING (true);

DROP POLICY IF EXISTS "Allow anon insert on agent_memory" ON agent_memory;
CREATE POLICY "Allow anon insert on agent_memory"
  ON agent_memory FOR INSERT
  TO anon, authenticated
  WITH CHECK (true);

-- Commento di documentazione
COMMENT ON TABLE agent_memory IS
  'Memoria permanente cloud dell''agente AI per LabelPulse. Ogni bug fix, feature, decisione viene loggato qui. Backup cloud di BUG_REGISTRY.md (su GitHub).';

-- ============================================================================
-- VERIFICA INSTALLAZIONE
-- ============================================================================
-- Dopo aver eseguito il blocco sopra, esegui questa query per verificare:
--
--   SELECT count(*) FROM agent_memory;
--
-- Dovrebbe restituire 0 (tabella vuota, pronta per essere popolata).
-- ============================================================================

-- ============================================================================
-- ESEMPI DI QUERY UTILI
-- ============================================================================
--
-- Ultimi 10 eventi:
--   SELECT created_at, event_type, title, severity
--   FROM agent_memory
--   ORDER BY created_at DESC
--   LIMIT 10;
--
-- Tutti i bug_fix critici:
--   SELECT title, description, commit_hash, files_affected
--   FROM agent_memory
--   WHERE event_type = 'bug_fix' AND severity = 'critical'
--   ORDER BY created_at DESC;
--
-- Eventi che toccano un certo file:
--   SELECT title, event_type, created_at
--   FROM agent_memory
--   WHERE 'src/lib/store.ts' = ANY(files_affected)
--   ORDER BY created_at DESC;
--
-- Cerca per keyword:
--   SELECT title, description
--   FROM agent_memory
--   WHERE search_keywords && ARRAY['gmail', 'mime']
--   ORDER BY created_at DESC;
--
-- ============================================================================
