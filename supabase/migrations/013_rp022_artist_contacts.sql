-- =====================================================================
-- RP-022 / RP-023 — DJ Contacts (CRM per artisti)
-- =====================================================================
-- Una riga per (user_id, artist_id). Salva contatti verificati
-- dall'utente, note, ultimo DM generato e data ultimo contatto.
-- Riutilizzabile in tutte le promozioni future.
-- =====================================================================

CREATE TABLE IF NOT EXISTS artist_contacts (
  id TEXT PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id),
  artist_id TEXT NOT NULL,
  artist_name TEXT NOT NULL,
  instagram TEXT,
  beatport TEXT,
  website TEXT,
  soundcloud TEXT,
  spotify TEXT,
  resident_advisor TEXT,
  booking_email TEXT,
  management_email TEXT,
  contact_email TEXT,
  notes TEXT,
  last_dm TEXT,
  last_contact_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, artist_id)
);

CREATE INDEX IF NOT EXISTS idx_artist_contacts_user
  ON artist_contacts (user_id);

ALTER TABLE artist_contacts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "artist_contacts_select_own" ON artist_contacts;
CREATE POLICY "artist_contacts_select_own" ON artist_contacts
  FOR SELECT USING (user_id = auth.uid());

DROP POLICY IF EXISTS "artist_contacts_insert_own" ON artist_contacts;
CREATE POLICY "artist_contacts_insert_own" ON artist_contacts
  FOR INSERT WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "artist_contacts_update_own" ON artist_contacts;
CREATE POLICY "artist_contacts_update_own" ON artist_contacts
  FOR UPDATE USING (user_id = auth.uid());

DROP POLICY IF EXISTS "artist_contacts_delete_own" ON artist_contacts;
CREATE POLICY "artist_contacts_delete_own" ON artist_contacts
  FOR DELETE USING (user_id = auth.uid());

DROP TRIGGER IF EXISTS trigger_artist_contacts_updated_at ON artist_contacts;
CREATE TRIGGER trigger_artist_contacts_updated_at
  BEFORE UPDATE ON artist_contacts
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- RP-023: aggiungi colonne se la tabella esiste già da RP-022
ALTER TABLE artist_contacts ADD COLUMN IF NOT EXISTS last_dm TEXT;
ALTER TABLE artist_contacts ADD COLUMN IF NOT EXISTS last_contact_at TIMESTAMPTZ;
