-- ============================================================================
-- SEED agent_memory — 4 nuovi fix v2.4.0
-- ============================================================================
-- Generato manualmente per il rilascio v2.4.0 (2026-06-25)
-- Aggiunge 4 nuove entry alla tabella agent_memory per il backup cloud
-- dei fix più recenti.
--
-- COME USARLO:
--   1. Apri Supabase Dashboard → SQL Editor → New query
--   2. Incolla tutto questo file
--   3. Click Run (Ctrl+Enter)
--   4. Se vedi 'Success. No rows returned' → fatto
--
-- Per verificare:
--   SELECT count(*) FROM agent_memory;  -- deve essere 41 + 4 = 45
-- ============================================================================

-- Entry 1: Artists sidecar leak (CRITICAL — caught by test suite)
INSERT INTO agent_memory (event_type, title, description, commit_hash, files_affected, search_keywords, severity, metadata) VALUES (
  'bug_fix',
  'Artists sidecar localStorage leak in clearAllLocalData (cross-account)',
  'Sintomo: dopo che user A fa logout e user B fa login sullo stesso dispositivo, user B vedeva gli artisti salvati di user A. | Causa: clearAllLocalData (in store.ts) rimuoveva PRIMARY_KEY, BACKUP_KEY, SNAPSHOTS_BACKUP_KEY, PROFILE_BACKUP_KEY, OWNER_KEY, e chiamava clearArtistsIDB() — ma clearArtistsIDB pulisce solo IndexedDB, non il mirror localStorage labelpulse-artists-backup (ARTISTS_SIDECAR_KEY). Quel sidecar restava intatto e al prossimo reload veniva ripristinato nello store. | Fix: aggiunto localStorage.removeItem("labelpulse-artists-backup") in clearAllLocalData (src/lib/store.ts:466-473). | Catturato da: src/lib/__tests__/store.isolation.test.ts test "returns true AND wipes ALL known localStorage keys when owner differs" — falliva sul sidecar artisti.',
  'af3453e',
  '{"src/lib/store.ts","src/lib/__tests__/store.isolation.test.ts"}'::TEXT[],
  '{"artisti,sidecar,leak,cross,account,clearAllLocalData,isolamento,multi,utente"}'::TEXT[],
  'critical',
  '{"logged_at": "2026-06-25T23:50:00+00:00", "logged_by": "v2.4.0-release", "source": "manual"}'::JSONB
);

-- Entry 2: Vitest anti-regression suite (FEATURE)
INSERT INTO agent_memory (event_type, title, description, commit_hash, files_affected, search_keywords, severity, metadata) VALUES (
  'feature',
  'Vitest anti-regression suite (33 tests covering 3 critical fixes)',
  'Setup completo di Vitest + jsdom + @testing-library/react per garantire che i 3 fix più critici non vengano mai rotti da future modifiche. 33 test totali in 1.79s: | 1. store.isolation.test.ts (11 test) — verifyStorageOwner/clearAllLocalData/getStorageOwner/setStorageOwner. HA CATTURATO UN BUG REALE (artists sidecar leak). | 2. gmail.mime.test.ts (14 test) — RFC 2822 structure, single header/body separator, no empty lines in headers, RFC 2047 Subject encoding, empty cc does NOT insert empty Cc header (the original bug). | 3. rankings-page.overlay.test.tsx (8 test) — ClickableLabelName + source-code static analysis (handleOpenLabel must NOT call setActiveTab, page.tsx must render both RankingsPage + LabelFinder always-mounted). | Run: bun run test | Config: vitest.config.ts + vitest.setup.ts | Scripts added: test, test:watch, test:ci.',
  'af3453e',
  '{"vitest.config.ts","vitest.setup.ts","src/lib/__tests__/store.isolation.test.ts","src/lib/__tests__/gmail.mime.test.ts","src/components/__tests__/rankings-page.overlay.test.tsx","package.json"}'::TEXT[],
  '{"test,vitest,anti,regressione,critical,fix,suite,jsdom,rtl,testing"}'::TEXT[],
  'medium',
  '{"logged_at": "2026-06-25T23:50:00+00:00", "logged_by": "v2.4.0-release", "source": "manual"}'::JSONB
);

-- Entry 3: Pitch Hub Pronta per invio sub-tab (FEATURE)
INSERT INTO agent_memory (event_type, title, description, commit_hash, files_affected, search_keywords, severity, metadata) VALUES (
  'feature',
  'Pitch Hub Pronta per invio sub-tab + 3-mode workflow selector',
  'Aggiunta 4° sub-tab "Pronta per invio" tra Bozze e Inviati nel Pitch Generator. Le pitch ready erano prima mischiate nelle Bozze con solo un badge colorato — ora hanno una tab dedicata con badge purple. | Estratto sub-component PitchListCard (status-filtered) per non duplicare 100 righe tra drafts e ready. | Aggiunte i18n keys pitch.tab.ready + pitch.readyEmpty + pitch.readyEmptyDesc in 6 lingue (it/en/es/fr/de/pt). | Inoltre: aggiunto selettore "Tipo di pitch" all inizio del composer con 3 modalità (Singola demo / EP multi-traccia / Manuale). La modalità Manuale nasconde il demo picker e fa compilare tutto a mano. Resume flow inferisce la modalità dallo stato della saved pitch.',
  'af3453e',
  '{"src/components/pitch-generator.tsx","src/lib/i18n.ts"}'::TEXT[],
  '{"pitch,pronta,invio,sub,tab,ready,workflow,selettore,single,ep,manual"}'::TEXT[],
  'medium',
  '{"logged_at": "2026-06-25T23:50:00+00:00", "logged_by": "v2.4.0-release", "source": "manual"}'::JSONB
);

-- Entry 4: In-app email sender via Resend (FEATURE)
INSERT INTO agent_memory (event_type, title, description, commit_hash, files_affected, search_keywords, severity, metadata) VALUES (
  'feature',
  'In-app email sender via Resend (alternative to Gmail API)',
  'Aggiunta via di invio email alternativa a Gmail API per utenti che non hanno (o non vogliono) connettere Gmail. Usa Resend (https://resend.com) come provider server-side. | Nuova API route /api/email/send (POST + GET). Auth via NextAuth session. Valida formato email. Ritorna 503 se RESEND_API_KEY non configurata (graceful — app funziona comunque con Gmail). | Nuovo client lib src/lib/email.ts con sendEmailInApp() + isInAppEmailConfigured() (cached health check). | Aggiunto bottone "Invia dall app" in demo-tracker dialog — mostrato solo quando inAppEmailAvailable && hasEmails && !gmailAuth.isConnected (fallback per utenti senza Gmail collegato). | Env vars richieste: RESEND_API_KEY + EMAIL_FROM (documentate in .env.local.example). | NOTA: l utente non ha ancora configurato RESEND_API_KEY — il bottone non apparirà finché non lo farà in Vercel dashboard.',
  'af3453e',
  '{"src/app/api/email/send/route.ts","src/lib/email.ts","src/components/demo-tracker.tsx",".env.local.example"}'::TEXT[],
  '{"email,in-app,resend,send,alternative,gmail,fallback,invio,dall,app"}'::TEXT[],
  'medium',
  '{"logged_at": "2026-06-25T23:50:00+00:00", "logged_by": "v2.4.0-release", "source": "manual"}'::JSONB
);

-- Entry 5: Avatar Lutenzo hardening (BUG_FIX + REGRESSION PREVENTION)
INSERT INTO agent_memory (event_type, title, description, commit_hash, files_affected, search_keywords, severity, metadata) VALUES (
  'bug_fix',
  'Avatar Lutenzo iPhone persistenza — hardening multi-strato (grace-period 10s + last-write-wins)',
  'Sintomo: Su iPhone (PWA), dopo aver caricato una nuova foto profilo, l immagine appare brevemente poi torna la vecchia. Segnalato da Lutenzo e in seguito da Frank fonico con stessa sintomatologia. | Fix originario (commit 52a2254): grace-period 5s in applyRemoteData che preserva i campi del profilo locale dai realtime cloud updates. | Hardening v2.4.0 (commit af3453e): | 1. Bumped grace-period da 5s a 10s (5s era troppo stretto su connessioni lente dove il cloud sync impiega più tempo a propagare il push). | 2. Aggiunto last-write-wins su photoUrl in mergeProfiles: se entrambi i lati hanno photoUrl non-vuoto e diverso, vince quello con data URL più lungo (>20% più lungo = upload più recente con più dettaglio e meno recompressione). Second layer che funziona OLTRE il grace-period. | 3. Aggiunto logging strutturato in applyRemoteData durante il grace-period: logga field-by-field diff tra locale e cloud (truncated per long fields come photoUrl). | 4. Corretta entry BUG_REGISTRY.md: causa era erroneamente descritta come "Cache iOS HTTP" (in realtà race condition realtime), data era 2026-06-24 (in realtà 2026-06-25), file era solo producer-profile.tsx (in realtà supabase.ts + store.ts + producer-profile.tsx).',
  'af3453e',
  '{"src/lib/supabase.ts","src/lib/store.ts","BUG_REGISTRY.md"}'::TEXT[],
  '{"avatar,foto,profilo,lutenzo,iphone,pwa,torna,vecchia,grace,period,last,write,wins,photoUrl,mergeProfiles,realtime,race"}'::TEXT[],
  'high',
  '{"logged_at": "2026-06-25T23:50:00+00:00", "logged_by": "v2.4.0-release", "source": "manual"}'::JSONB
);

-- ============================================================================
-- Verifica
-- ============================================================================
-- SELECT event_type, severity, count(*) FROM agent_memory GROUP BY event_type, severity ORDER BY event_type, severity;
-- Dovrebbe ora mostrare:
--   bug_fix    critical  11  (10 + 1 nuovo = artists sidecar leak)
--   bug_fix    high      12  (11 + 1 nuovo = avatar Lutenzo hardening)
--   bug_fix    medium    16
--   feature    medium     8  (4 + 3 nuovi = vitest suite + pitch ready + in-app email + workflow selector [conta come 1 con la pitch ready])
-- TOTALE: 47 (41 + 6 = 47 — nota: pitch ready e workflow selector sono in 1 entry sola)
