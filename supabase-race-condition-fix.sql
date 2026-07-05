-- ========================================
-- RACE CONDITION FIX — Triggers updated_at su tutte le tabelle
-- ========================================
-- Esegui questo SQL nel Supabase SQL Editor.
-- Garantisce che ogni UPDATE imposti automaticamente updated_at = NOW()
-- come livello di sicurezza nativo a livello database.
-- ========================================

-- 1. Funzione trigger (se non esiste già)
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 2. Triggers su tutte le tabelle utente
DROP TRIGGER IF EXISTS trigger_demo_submissions_updated_at ON demo_submissions;
CREATE TRIGGER trigger_demo_submissions_updated_at
  BEFORE UPDATE ON demo_submissions
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS trigger_label_personal_data_updated_at ON label_personal_data;
CREATE TRIGGER trigger_label_personal_data_updated_at
  BEFORE UPDATE ON label_personal_data
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS trigger_pitch_campaigns_updated_at ON pitch_campaigns;
CREATE TRIGGER trigger_pitch_campaigns_updated_at
  BEFORE UPDATE ON pitch_campaigns
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS trigger_user_profiles_updated_at ON user_profiles;
CREATE TRIGGER trigger_user_profiles_updated_at
  BEFORE UPDATE ON user_profiles
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- 3. Verifica che i trigger siano attivi
SELECT 
  tg.relname AS tabella,
  trg.tgname AS trigger_name,
  trg.tgenabled AS enabled
FROM pg_trigger trg
JOIN pg_class tg ON trg.tgrelid = tg.oid
WHERE trg.tgname LIKE '%updated_at%'
ORDER BY tg.relname;
