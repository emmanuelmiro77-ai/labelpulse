-- =====================================================================
-- Phase 2 — projects: add `goal` and `progress` columns
-- =====================================================================
-- Estende la tabella `projects` (creata in 016_projects.sql) con due
-- nuove colonne:
--
--   goal      TEXT NOT NULL DEFAULT ''
--             Obiettivo strategico del Project. Stringa libera: il
--             client dovrebbe usare uno dei valori di PROJECT_GOALS
--             (es. "Find a label") ma il DB non lo impone.
--
--   progress  INTEGER NOT NULL DEFAULT 0
             -- CHECK (progress >= 0 AND progress <= 100)
--             Avanzamento percettuale 0-100. Phase 2: statico (default 0).
--             Fasi successive: collegato a eventi reali.
--
-- Idempotente: ADD COLUMN IF NOT EXISTS. Le righe esistenti (Phase 1)
-- ricevono goal='' e progress=0 — la UI li tratta come "non impostato".
--
-- Nessuna altra modifica allo schema. Nessuna FK verso altre tabelle.
-- =====================================================================

ALTER TABLE projects
  ADD COLUMN IF NOT EXISTS goal TEXT NOT NULL DEFAULT '';

ALTER TABLE projects
  ADD COLUMN IF NOT EXISTS progress INTEGER NOT NULL DEFAULT 0;

-- CHECK constraint per garantire 0-100 anche se un client malfunzionante
-- invia valori fuori range. ADD constraint IF NOT EXISTS non esiste in
-- Postgres < 16, quindi usiamo il pattern DROP + ADD (idempotente).
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'projects_progress_range'
  ) THEN
    ALTER TABLE projects
      ADD CONSTRAINT projects_progress_range
      CHECK (progress >= 0 AND progress <= 100);
  END IF;
END$$;
