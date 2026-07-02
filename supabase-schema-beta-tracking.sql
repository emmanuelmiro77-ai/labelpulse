-- ========================================
-- BETA TESTER TRACKING VIEW
-- ========================================
-- View che unisce beta_access_codes con app_state per tracciare
-- lo stato di ogni beta tester: invito, primo accesso, attività.
--
-- Esegui questo SQL nel Supabase SQL Editor dopo aver creato
-- le tabelle beta_access_codes e app_state.
--
-- Usage: SELECT * FROM v_beta_tester_status ORDER BY created_at DESC;
-- ========================================

CREATE OR REPLACE VIEW v_beta_tester_status AS
SELECT
  bac.id AS code_id,
  bac.email,
  bac.code,
  bac.note,
  bac.discord_user_id,
  bac.created_at AS invited_at,
  bac.expires_at,
  bac.used_at AS first_login_at,
  bac.created_by,
  -- Check if user has data in app_state (means they've used the app)
  CASE WHEN app.id IS NOT NULL THEN true ELSE false END AS has_app_data,
  -- Last update timestamp from app_state (proxy for last activity)
  app.updated_at AS last_activity_at,
  -- Compute status
  CASE
    WHEN bac.used_at IS NULL AND bac.expires_at < NOW() THEN 'expired'
    WHEN bac.used_at IS NULL THEN 'invited_not_joined'
    WHEN app.id IS NOT NULL THEN 'active'
    ELSE 'joined_no_data'
  END AS tester_status
FROM beta_access_codes bac
LEFT JOIN app_state app ON bac.email = app.id
ORDER BY bac.created_at DESC;

-- Grant access to the view (service_role can always see it)
-- Anon users should NOT access this view (it contains emails + activity data)
-- So we do NOT add a policy — only service_role key can query it.
