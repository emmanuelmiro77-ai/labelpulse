-- ========================================
-- LabelPulse - Feedback Reply Migration
-- ========================================
-- Esegui questo SQL nel SQL Editor di Supabase per aggiungere il supporto
-- alle risposte dell'admin sui feedback beta.
--
-- Aggiunge 3 colonne alla tabella beta_feedback esistente:
--   - admin_reply         : testo della risposta dell'admin (NULL se non risposto)
--   - admin_replied_at    : timestamp della risposta
--   - admin_reply_seen_at : timestamp in cui l'utente ha visto la risposta
--
-- Tutte le policy RESTANO le stesse: la tabella resta accessibile in INSERT
-- per anon (perché gli utenti inviino feedback) e in SELECT/UPDATE solo via
-- SERVICE_ROLE_KEY. La lettura delle proprie risposte avviene tramite
-- /api/beta-feedback/my-replies (server-side, usa session email + service role).
-- ========================================

-- 1. Aggiungi le colonne (IF NOT EXISTS per idempotenza)
ALTER TABLE beta_feedback
  ADD COLUMN IF NOT EXISTS admin_reply TEXT;

ALTER TABLE beta_feedback
  ADD COLUMN IF NOT EXISTS admin_replied_at TIMESTAMPTZ;

ALTER TABLE beta_feedback
  ADD COLUMN IF NOT EXISTS admin_reply_seen_at TIMESTAMPTZ;

-- 2. Indice per velocizzare la query "dammi i feedback di questo utente che hanno una risposta"
CREATE INDEX IF NOT EXISTS idx_beta_feedback_email_with_reply
  ON beta_feedback (email)
  WHERE admin_reply IS NOT NULL;

-- 3. Verifica
DO $$
BEGIN
  RAISE NOTICE 'Migrazione completata. Colonne aggiunte: admin_reply, admin_replied_at, admin_reply_seen_at';
END
$$;
