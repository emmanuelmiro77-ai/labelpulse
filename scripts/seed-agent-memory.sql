-- ============================================================================
-- SEED agent_memory — Popolamento iniziale tabella
-- ============================================================================
-- Generato automaticamente da scripts/seed-agent-memory.py
-- Data generazione: 2026-06-25T22:51:10+00:00
-- Totale entry: 41
--
-- COME USARLO:
--   1. Apri Supabase Dashboard → SQL Editor → New query
--   2. Incolla tutto questo file
--   3. Click Run (Ctrl+Enter)
--   4. Se vedi 'Success. No rows returned' → fatto
--
-- Per verificare:
--   SELECT count(*) FROM agent_memory;  -- deve restituire il numero di entry
-- ============================================================================

-- Pulisci entry esistenti (seed idempotente — sicuro re-runnare)
DELETE FROM agent_memory WHERE event_type IN ('bug_fix', 'feature', 'regression');

-- Reset sequence per avere id puliti
SELECT setval('agent_memory_id_seq', 1, false);

-- ============================================================================
-- INSERT
-- ============================================================================

-- Entry 1: Account diversi vedono i dati l'uno dell'altro (cross-accoun
INSERT INTO agent_memory (event_type, title, description, commit_hash, files_affected, search_keywords, severity, metadata) VALUES ('bug_fix', 'Account diversi vedono i dati l''uno dell''altro (cross-account contamination)', 'Sintomo: L''utente A fa login sul telefono dell''utente B → vede i dati di A mischiati con i dati di B | Causa: 4 bug concatenati — RLS Supabase "Allow ALL TO EVERYONE", getCloudRowId() restituiva row "default" condivisa, PRIMARY_KEY globale non per-user, mergeCloudData faceva UNION-by-id senza mai ripulire | Fix: commit `f54bff8` (2026-06-25) — 5 strati di difesa:', 'f54bff8', '{src/lib/supabase.ts,src/lib/store.ts,src/lib/use-auth.ts,src/components/cloud-recovery.tsx,supabase-schema.sql}'::TEXT[], '{account,diversi,vedono,dati,uno,dell,altro,cross,contamination,utente}'::TEXT[], 'critical', '{"seeded_at": "2026-06-25T22:51:10+00:00", "source": "BUG_REGISTRY.md"}'::JSONB);

-- Entry 2: Foto profilo torna vecchia su iPhone dopo upload
INSERT INTO agent_memory (event_type, title, description, commit_hash, files_affected, search_keywords, severity, metadata) VALUES ('bug_fix', 'Foto profilo torna vecchia su iPhone dopo upload', 'Sintomo: Su iPhone (PWA), dopo aver caricato una nuova foto profilo, riaprendo l''app torna la vecchia | Causa: Cache iOS dell''URL immagine — non veniva invalidata | Fix: commit `52a2254` (2026-06-24)', '52a2254', '{src/components/producer-profile.tsx}'::TEXT[], '{foto,profilo,torna,vecchia,iphone,upload,pwa,aver,caricato,una}'::TEXT[], 'critical', '{"seeded_at": "2026-06-25T22:51:10+00:00", "source": "BUG_REGISTRY.md"}'::JSONB);

-- Entry 3: Dati utente (email, note, link) spariscono dopo reload
INSERT INTO agent_memory (event_type, title, description, commit_hash, files_affected, search_keywords, severity, metadata) VALUES ('bug_fix', 'Dati utente (email, note, link) spariscono dopo reload', 'Sintomo: Si modificano email/notes/link di una label, si ricarica la pagina, tutto perso | Causa: Race condition in Zustand persist rehydration — seed data sovrascriveva i dati utente prima che rehydration finisse | Fix: persist v9+ con flag `_rehydrated` che blocca setItem finché non finisce, merge semplice che NON tocca mai dati utente persistiti, backup debounced (60s) non mirrorato', '', '{src/lib/store.ts}'::TEXT[], '{dati,utente,email,note,link,spariscono,reload,modificano,notes,una}'::TEXT[], 'critical', '{"seeded_at": "2026-06-25T22:51:10+00:00", "source": "BUG_REGISTRY.md"}'::JSONB);

-- Entry 4: Profilo perso dopo re-login
INSERT INTO agent_memory (event_type, title, description, commit_hash, files_affected, search_keywords, severity, metadata) VALUES ('bug_fix', 'Profilo perso dopo re-login', 'Sintomo: Dopo logout + login, il profilo utente è vuoto | Causa: 3 bug — cloud merge non preservava profile, loadFromCloud sovrascriveva locale vuoto, saveFromLocal non caricava profile | Fix: commit `9880184` (persist aware merge) + `76a7a13` (content-aware merge)', '9880184', '{src/lib/store.ts}'::TEXT[], '{profilo,perso,login,logout,utente,vuoto}'::TEXT[], 'critical', '{"seeded_at": "2026-06-25T22:51:10+00:00", "source": "BUG_REGISTRY.md"}'::JSONB);

-- Entry 5: Gmail invia spazzatura — "(nessun oggetto)" + header MIME ne
INSERT INTO agent_memory (event_type, title, description, commit_hash, files_affected, search_keywords, severity, metadata) VALUES ('bug_fix', 'Gmail invia spazzatura — "(nessun oggetto)" + header MIME nel body', 'Sintomo: Click su "Invia direttamente da Gmail" → arriva email con subject "(nessun oggetto)", body contiene `Content-Type: text/plain...` ecc. | Causa: Array di header MIME aveva elementi stringa vuota → creavano righe vuote → terminavano header section troppo presto | Fix: commit `03f4d17` (2026-06-25) — costruisci array solo con righe non vuote, join con `\r\n`, poi `\r\n\r\n` + body', '03f4d17', '{src/lib/gmail.ts,sendEmail,sendReplyInThread}'::TEXT[], '{gmail,invia,spazzatura,nessun,oggetto,header,mime,nel,body,click}'::TEXT[], 'high', '{"seeded_at": "2026-06-25T22:51:10+00:00", "source": "BUG_REGISTRY.md"}'::JSONB);

-- Entry 6: Pitch inviato è quello sbagliato (single-track invece di mul
INSERT INTO agent_memory (event_type, title, description, commit_hash, files_affected, search_keywords, severity, metadata) VALUES ('bug_fix', 'Pitch inviato è quello sbagliato (single-track invece di multi-track EP)', 'Sintomo: Preview mostra multi-track, ma l''email inviata ha un solo link | Causa: `effectivePitchSubject`/`effectivePitchBody` ignoravano `demo.pitchText` e rigeneravano con `trackName="Demo"` + `link` | Fix: commit `03f4d17` — priorità a `demo.pitchText` quando esiste', '03f4d17', '{src/components/demo-tracker.tsx}'::TEXT[], '{pitch,inviato,quello,sbagliato,single,track,invece,multi,preview,mostra}'::TEXT[], 'high', '{"seeded_at": "2026-06-25T22:51:10+00:00", "source": "BUG_REGISTRY.md"}'::JSONB);

-- Entry 7: Dettaglio demo mostra un solo link SoundCloud per pitch mult
INSERT INTO agent_memory (event_type, title, description, commit_hash, files_affected, search_keywords, severity, metadata) VALUES ('bug_fix', 'Dettaglio demo mostra un solo link SoundCloud per pitch multi-traccia', 'Sintomo: Demo EP con 3 tracce → dialog mostra solo 1 link SC | Causa: UI leggeva `demo.link` invece di `demo.pitchTracks[]` | Fix: commit `19d0fc8` (2026-06-25) — `displayTracks` memo con fallback chain a 4 livelli, UI render multi-traccia', '19d0fc8', '{src/components/demo-tracker.tsx,src/lib/pitch-utils.ts,src/lib/store.ts,pitchTracks}'::TEXT[], '{dettaglio,demo,mostra,solo,link,soundcloud,pitch,multi,traccia,tracce}'::TEXT[], 'high', '{"seeded_at": "2026-06-25T22:51:10+00:00", "source": "BUG_REGISTRY.md"}'::JSONB);

-- Entry 8: iOS/PWA popup Gmail fallisce senza messaggio chiaro
INSERT INTO agent_memory (event_type, title, description, commit_hash, files_affected, search_keywords, severity, metadata) VALUES ('bug_fix', 'iOS/PWA popup Gmail fallisce senza messaggio chiaro', 'Sintomo: Su iPhone PWA, click "Invia da Gmail" → fallisce silenziosamente | Fix: commit `cbe50ba` — messaggi di errore strutturati per iOS/PWA', 'cbe50ba', '{src/lib/gmail.ts}'::TEXT[], '{ios,pwa,popup,gmail,fallisce,senza,messaggio,chiaro,iphone,click}'::TEXT[], 'high', '{"seeded_at": "2026-06-25T22:51:10+00:00", "source": "BUG_REGISTRY.md"}'::JSONB);

-- Entry 9: Classifiche → label → perdi la classifica di partenza
INSERT INTO agent_memory (event_type, title, description, commit_hash, files_affected, search_keywords, severity, metadata) VALUES ('bug_fix', 'Classifiche → label → perdi la classifica di partenza', 'Sintomo: Clicchi Classifiche → scegli genere → clicchi label → si apre scheda MA la classifica sottostante sparisce, vai su Label Finder | Causa: `handleOpenLabel` chiamava `setActiveTab("labels")` → unmountava RankingsPage → stato (genere, scroll) perso | Fix: commit `084bc37` (2026-06-25) — RankingsPage + LabelFinder sempre montati con CSS `hidden`, handleOpenLabel non cambia tab, dialog Radix portal si sovrappone', '084bc37', '{src/app/page.tsx,src/components/rankings-page.tsx}'::TEXT[], '{classifiche,label,perdi,classifica,partenza,clicchi,scegli,genere,apre,scheda}'::TEXT[], 'medium', '{"seeded_at": "2026-06-25T22:51:10+00:00", "source": "BUG_REGISTRY.md"}'::JSONB);

-- Entry 10: Nomi label invisibili su mobile nella tabella classifiche
INSERT INTO agent_memory (event_type, title, description, commit_hash, files_affected, search_keywords, severity, metadata) VALUES ('bug_fix', 'Nomi label invisibili su mobile nella tabella classifiche', 'Sintomo: Su mobile, tabella classifiche → nomi label non si vedono | Fix: commit `059d2d8` — layout mobile table', '059d2d8', '{src/components/rankings-page.tsx}'::TEXT[], '{nomi,label,invisibili,mobile,nella,tabella,classifiche,vedono}'::TEXT[], 'medium', '{"seeded_at": "2026-06-25T22:51:10+00:00", "source": "BUG_REGISTRY.md"}'::JSONB);

-- Entry 11: "NUOVA" mostrato per label già presenti (stable incumbents)
INSERT INTO agent_memory (event_type, title, description, commit_hash, files_affected, search_keywords, severity, metadata) VALUES ('bug_fix', '"NUOVA" mostrato per label già presenti (stable incumbents)', 'Sintomo: Label che erano #1 da sempre mostrate come "NUOVA" | Causa: prevRankByGenre veniva clobbered con rank identico | Fix: commit `70ec2e0` — mostra "—" invece di "NUOVA" per stable', '70ec2e0', '{src/components/rankings-page.tsx}'::TEXT[], '{nuova,mostrato,label,già,presenti,stable,incumbents,erano,sempre,mostrate}'::TEXT[], 'medium', '{"seeded_at": "2026-06-25T22:51:10+00:00", "source": "BUG_REGISTRY.md"}'::JSONB);

-- Entry 12: "no history" alert mentre cloud sync sta caricando
INSERT INTO agent_memory (event_type, title, description, commit_hash, files_affected, search_keywords, severity, metadata) VALUES ('bug_fix', '"no history" alert mentre cloud sync sta caricando', 'Sintomo: Appena aperta app → "no ranking history" anche se c''è | Causa: Alert mostrato durante caricamento cloud sync | Fix: commit `f9781a8`', 'f9781a8', '{src/components/rankings-page.tsx}'::TEXT[], '{history,alert,mentre,cloud,sync,sta,caricando,appena,aperta,app}'::TEXT[], 'medium', '{"seeded_at": "2026-06-25T22:51:10+00:00", "source": "BUG_REGISTRY.md"}'::JSONB);

-- Entry 13: "Salva" ambiguo (Salva vs Scarica Backup vs Salva modifiche)
INSERT INTO agent_memory (event_type, title, description, commit_hash, files_affected, search_keywords, severity, metadata) VALUES ('bug_fix', '"Salva" ambiguo (Salva vs Scarica Backup vs Salva modifiche)', 'Sintomo: 3 pulsanti "Salva" diversi, l''utente non sa quale fa cosa | Fix: commit `61652dc` — etichette disambiguate', '61652dc', '{src/components/label-finder.tsx,src/components/data-backup.tsx}'::TEXT[], '{salva,ambiguo,scarica,backup,modifiche,pulsanti,diversi,utente,quale,cosa}'::TEXT[], 'medium', '{"seeded_at": "2026-06-25T22:51:10+00:00", "source": "BUG_REGISTRY.md"}'::JSONB);

-- Entry 14: "Accedi" invisibile su mobile
INSERT INTO agent_memory (event_type, title, description, commit_hash, files_affected, search_keywords, severity, metadata) VALUES ('bug_fix', '"Accedi" invisibile su mobile', 'Sintomo: Su mobile, bottone "Accedi" non visibile | Fix: commit `b78dfee` — bottone sempre visibile, utility in hamburger menu', 'b78dfee', '{src/app/page.tsx}'::TEXT[], '{accedi,invisibile,mobile,bottone,visibile}'::TEXT[], 'medium', '{"seeded_at": "2026-06-25T22:51:10+00:00", "source": "BUG_REGISTRY.md"}'::JSONB);

-- Entry 15: Onboarding mostrato anche se profilo già compilato
INSERT INTO agent_memory (event_type, title, description, commit_hash, files_affected, search_keywords, severity, metadata) VALUES ('bug_fix', 'Onboarding mostrato anche se profilo già compilato', 'Fix: commit `06a4fb6` — skip welcome modal se profilo ha già dati', '06a4fb6', '{src/components/welcome-onboarding.tsx}'::TEXT[], '{onboarding,mostrato,profilo,già,compilato,none}'::TEXT[], 'medium', '{"seeded_at": "2026-06-25T22:51:10+00:00", "source": "BUG_REGISTRY.md"}'::JSONB);

-- Entry 16: Link SoundCloud Privato precompilato col link del profilo
INSERT INTO agent_memory (event_type, title, description, commit_hash, files_affected, search_keywords, severity, metadata) VALUES ('bug_fix', 'Link SoundCloud Privato precompilato col link del profilo', 'Sintomo: Campo "Link SC Privato" nel pitch form precompilato con il link del profilo utente — non deve | Fix: commit `e2539bc` (2026-06-24)', 'e2539bc', '{src/components/pitch-generator.tsx,src/components/label-finder.tsx}'::TEXT[], '{link,soundcloud,privato,precompilato,col,profilo,campo,nel,pitch,form}'::TEXT[], 'medium', '{"seeded_at": "2026-06-25T22:51:10+00:00", "source": "BUG_REGISTRY.md"}'::JSONB);

-- Entry 17: App crasha completamente (white screen)
INSERT INTO agent_memory (event_type, title, description, commit_hash, files_affected, search_keywords, severity, metadata) VALUES ('bug_fix', 'App crasha completamente (white screen)', 'Sintomo: App bianca, nessun errore visibile | Fix: commit `044669f` — ErrorBoundary + guard defensive', '044669f', '{src/components/error-boundary.tsx}'::TEXT[], '{app,crasha,completamente,white,screen,bianca,nessun,errore,visibile}'::TEXT[], 'high', '{"seeded_at": "2026-06-25T22:51:10+00:00", "source": "BUG_REGISTRY.md"}'::JSONB);

-- Entry 18: Crash su mobile aprendo scheda label con URL lunghi
INSERT INTO agent_memory (event_type, title, description, commit_hash, files_affected, search_keywords, severity, metadata) VALUES ('bug_fix', 'Crash su mobile aprendo scheda label con URL lunghi', 'Sintomo: Su mobile, apri dettaglio label con URL lungo → crash | Causa: URL lunghi causavano render thrashing | Fix: commit `34ecb67` — auto-shorten URL in display + throttle', '34ecb67', '{src/components/label-finder.tsx}'::TEXT[], '{crash,mobile,aprendo,scheda,label,url,lunghi,apri,dettaglio,lungo}'::TEXT[], 'high', '{"seeded_at": "2026-06-25T22:51:10+00:00", "source": "BUG_REGISTRY.md"}'::JSONB);

-- Entry 19: Crash su label con dati corrotti (toLowerCase su null)
INSERT INTO agent_memory (event_type, title, description, commit_hash, files_affected, search_keywords, severity, metadata) VALUES ('bug_fix', 'Crash su label con dati corrotti (toLowerCase su null)', 'Sintomo: Crash random navigando label | Causa: `toLowerCase()` su label.name/label.email nulli | Fix: commit `e322699` — guard toLowerCase + throttle backup quota', 'e322699', '{src/lib/store.ts}'::TEXT[], '{crash,label,dati,corrotti,tolowercase,null,random,navigando}'::TEXT[], 'high', '{"seeded_at": "2026-06-25T22:51:10+00:00", "source": "BUG_REGISTRY.md"}'::JSONB);

-- Entry 20: Dialog "Aggiungi Demo" crasha
INSERT INTO agent_memory (event_type, title, description, commit_hash, files_affected, search_keywords, severity, metadata) VALUES ('bug_fix', 'Dialog "Aggiungi Demo" crasha', 'Fix: commit `795f613` + `73ce79a` (4 fix UX)', '795f613', '{src/components/demo-tracker.tsx}'::TEXT[], '{dialog,aggiungi,demo,crasha,none}'::TEXT[], 'high', '{"seeded_at": "2026-06-25T22:51:10+00:00", "source": "BUG_REGISTRY.md"}'::JSONB);

-- Entry 21: Definizione duplicata di handleAnalyzeFile
INSERT INTO agent_memory (event_type, title, description, commit_hash, files_affected, search_keywords, severity, metadata) VALUES ('bug_fix', 'Definizione duplicata di handleAnalyzeFile', 'Sintomo: Errore compile/runtime — funzione definita 2 volte | Fix: commit `c3eb4bd` + `d7ffb50`', 'c3eb4bd', '{src/components/demo-tracker.tsx}'::TEXT[], '{definizione,duplicata,handleanalyzefile,errore,compile,runtime,funzione,definita,volte}'::TEXT[], 'high', '{"seeded_at": "2026-06-25T22:51:10+00:00", "source": "BUG_REGISTRY.md"}'::JSONB);

-- Entry 22: Post-login "no charts" — dati Beatport spariti
INSERT INTO agent_memory (event_type, title, description, commit_hash, files_affected, search_keywords, severity, metadata) VALUES ('bug_fix', 'Post-login "no charts" — dati Beatport spariti', 'Sintomo: Dopo login, rankings vuote | Causa: Cloud merge non preservava i campi Beatport (rankByGenre, pointsByGenre, etc.) | Fix: commit `50e74f1` — preserve Beatport data fields in cloud merge', '50e74f1', '{src/lib/store.ts}'::TEXT[], '{post,login,charts,dati,beatport,spariti,rankings,vuote}'::TEXT[], 'critical', '{"seeded_at": "2026-06-25T22:51:10+00:00", "source": "BUG_REGISTRY.md"}'::JSONB);

-- Entry 23: Sync cloud perdeva dati tra dispositivi
INSERT INTO agent_memory (event_type, title, description, commit_hash, files_affected, search_keywords, severity, metadata) VALUES ('bug_fix', 'Sync cloud perdeva dati tra dispositivi', 'Sintomo: Modifiche fatte su PC non apparivano sul telefono | Causa: Cloud merge sovrascriveva invece di unire | Fix: commit `0b0eed0` — union by id in cloud merge', '0b0eed0', '{src/lib/store.ts}'::TEXT[], '{sync,cloud,perdeva,dati,dispositivi,modifiche,fatte,apparivano,sul,telefono}'::TEXT[], 'critical', '{"seeded_at": "2026-06-25T22:51:10+00:00", "source": "BUG_REGISTRY.md"}'::JSONB);

-- Entry 24: Cloud sync sovrascriveva cloud con local vuoto
INSERT INTO agent_memory (event_type, title, description, commit_hash, files_affected, search_keywords, severity, metadata) VALUES ('bug_fix', 'Cloud sync sovrascriveva cloud con local vuoto', 'Sintomo: Login su device nuovo → cloud azzerato | Fix: commit `76a7a13` — content-aware merge, never overwrite cloud with empty local', '76a7a13', '{src/lib/store.ts}'::TEXT[], '{cloud,sync,sovrascriveva,local,vuoto,login,device,nuovo,azzerato}'::TEXT[], 'critical', '{"seeded_at": "2026-06-25T22:51:10+00:00", "source": "BUG_REGISTRY.md"}'::JSONB);

-- Entry 25: Login Vercel rotto (force-static su [...nextauth])
INSERT INTO agent_memory (event_type, title, description, commit_hash, files_affected, search_keywords, severity, metadata) VALUES ('bug_fix', 'Login Vercel rotto (force-static su [...nextauth])', 'Sintomo: Login Google non funziona su Vercel | Causa: `export const dynamic = "force-static"` su route nextauth — la rendeva 404 statica | Fix: commit `7942562` — rimosso force-static da [...nextauth]', '7942562', '{src/app/api/auth/[...nextauth]/route.ts}'::TEXT[], '{login,vercel,rotto,force,static,nextauth,google,funziona}'::TEXT[], 'critical', '{"seeded_at": "2026-06-25T22:51:10+00:00", "source": "BUG_REGISTRY.md"}'::JSONB);

-- Entry 26: Cloud merge non includere imageUrl/slug/beatportId
INSERT INTO agent_memory (event_type, title, description, commit_hash, files_affected, search_keywords, severity, metadata) VALUES ('bug_fix', 'Cloud merge non includere imageUrl/slug/beatportId', 'Sintomo: Loghi label non apparivano dopo sync | Fix: commit `6915afc`', '6915afc', '{src/lib/store.ts}'::TEXT[], '{cloud,merge,includere,imageurl,slug,beatportid,loghi,label,apparivano,sync}'::TEXT[], 'critical', '{"seeded_at": "2026-06-25T22:51:10+00:00", "source": "BUG_REGISTRY.md"}'::JSONB);

-- Entry 27: Auto-upload su cloud non funzionava (sync artisti)
INSERT INTO agent_memory (event_type, title, description, commit_hash, files_affected, search_keywords, severity, metadata) VALUES ('bug_fix', 'Auto-upload su cloud non funzionava (sync artisti)', 'Fix: commit `feecbf5` — sempre mergiare cloud+locale + sync artisti', 'feecbf5', '{src/lib/store.ts}'::TEXT[], '{auto,upload,cloud,funzionava,sync,artisti,none}'::TEXT[], 'critical', '{"seeded_at": "2026-06-25T22:51:10+00:00", "source": "BUG_REGISTRY.md"}'::JSONB);

-- Entry 28: Seek bar audio non funziona (Infinity duration)
INSERT INTO agent_memory (event_type, title, description, commit_hash, files_affected, search_keywords, severity, metadata) VALUES ('bug_fix', 'Seek bar audio non funziona (Infinity duration)', 'Sintomo: La seek bar del player audio non si muove | Causa: `duration` tornava `Infinity` per stream senza metadata | Fix: commit `5d2e62a` — seekable.end() + drag + keyboard', '5d2e62a', '{src/components/demo-tracker.tsx,src/components/label-finder.tsx}'::TEXT[], '{seek,bar,audio,funziona,infinity,duration,player,muove}'::TEXT[], 'medium', '{"seeded_at": "2026-06-25T22:51:10+00:00", "source": "BUG_REGISTRY.md"}'::JSONB);

-- Entry 29: Audio analysis sempre "Sconosciuta" + 100% Energy/Dance
INSERT INTO agent_memory (event_type, title, description, commit_hash, files_affected, search_keywords, severity, metadata) VALUES ('bug_fix', 'Audio analysis sempre "Sconosciuta" + 100% Energy/Dance', 'Sintomo: Audio analysis dà key "Sconosciuta" e Energy/Danceability sempre 100% | Causa: essentia.js WASM non si caricava mai | Fix: commit `1711925` — load WASM properly', '1711925', '{src/lib/audio-analysis.ts,src/components/demo-tracker.tsx}'::TEXT[], '{audio,analysis,sempre,sconosciuta,energy,dance,key,danceability}'::TEXT[], 'medium', '{"seeded_at": "2026-06-25T22:51:10+00:00", "source": "BUG_REGISTRY.md"}'::JSONB);

-- Entry 30: UI push non sincronizzata con subscription reale
INSERT INTO agent_memory (event_type, title, description, commit_hash, files_affected, search_keywords, severity, metadata) VALUES ('bug_fix', 'UI push non sincronizzata con subscription reale', 'Sintomo: Toggle "notifiche attive" ON ma notifiche non arrivano | Causa: UI basata su stato locale, non su subscription effettiva | Fix: commit `281f24b` — use PushSubscription as source of truth', '281f24b', '{src/components/notification-settings.tsx}'::TEXT[], '{push,sincronizzata,subscription,reale,toggle,notifiche,attive,arrivano}'::TEXT[], 'medium', '{"seeded_at": "2026-06-25T22:51:10+00:00", "source": "BUG_REGISTRY.md"}'::JSONB);

-- Entry 31: Banner "Aggiorna" non funzionante
INSERT INTO agent_memory (event_type, title, description, commit_hash, files_affected, search_keywords, severity, metadata) VALUES ('bug_fix', 'Banner "Aggiorna" non funzionante', 'Sintomo: Click su "Aggiorna" per nuova versione → non fa nulla | Fix: commit `ec2454f` — refactor SWUpdater + sw v6', 'ec2454f', '{src/components/sw-updater.tsx,public/sw.js}'::TEXT[], '{banner,aggiorna,funzionante,click,nuova,versione,nulla}'::TEXT[], 'medium', '{"seeded_at": "2026-06-25T22:51:10+00:00", "source": "BUG_REGISTRY.md"}'::JSONB);

-- Entry 32: Label seed mostrava "1976 accettano demo" falsamente
INSERT INTO agent_memory (event_type, title, description, commit_hash, files_affected, search_keywords, severity, metadata) VALUES ('bug_fix', 'Label seed mostrava "1976 accettano demo" falsamente', 'Sintomo: Label seed (400 labels) mostravano "accettano demo" anche se non lo sappiamo | Causa: Campo `status` defaultato a "open" per tutte le seed | Fix: commit `addbee3` (2026-06-24) — introdotto stato "unknown"', 'addbee3', '{src/lib/labels-data.json,src/lib/store.ts,src/components/label-finder.tsx}'::TEXT[], '{label,seed,mostrava,accettano,demo,falsamente,labels,mostravano,sappiamo}'::TEXT[], 'medium', '{"seeded_at": "2026-06-25T22:51:10+00:00", "source": "BUG_REGISTRY.md"}'::JSONB);

-- Entry 33: Loghi label mancanti su scraper v2/v3
INSERT INTO agent_memory (event_type, title, description, commit_hash, files_affected, search_keywords, severity, metadata) VALUES ('bug_fix', 'Loghi label mancanti su scraper v2/v3', 'Fix: commit `499b72f` — explicit logo acquisition in scraper prompts', '499b72f', '{scripts/beatport-scraper-v2.js,public/scraper-v3.js}'::TEXT[], '{loghi,label,mancanti,scraper,none}'::TEXT[], 'medium', '{"seeded_at": "2026-06-25T22:51:10+00:00", "source": "BUG_REGISTRY.md"}'::JSONB);

-- Entry 34: Import non passava artists[] e tracks[]
INSERT INTO agent_memory (event_type, title, description, commit_hash, files_affected, search_keywords, severity, metadata) VALUES ('bug_fix', 'Import non passava artists[] e tracks[]', 'Fix: commit `296ad06`', '296ad06', '{src/lib/store.ts}'::TEXT[], '{import,passava,artists,tracks,none}'::TEXT[], 'medium', '{"seeded_at": "2026-06-25T22:51:10+00:00", "source": "BUG_REGISTRY.md"}'::JSONB);

-- Entry 35: Import defaultava isCustom=true per label Beatport
INSERT INTO agent_memory (event_type, title, description, commit_hash, files_affected, search_keywords, severity, metadata) VALUES ('bug_fix', 'Import defaultava isCustom=true per label Beatport', 'Fix: commit `5ffe975`', '5ffe975', '{src/lib/store.ts}'::TEXT[], '{import,defaultava,iscustom,true,label,beatport,none}'::TEXT[], 'medium', '{"seeded_at": "2026-06-25T22:51:10+00:00", "source": "BUG_REGISTRY.md"}'::JSONB);

-- Entry 36: (vedi sopra: Link SC Privato precompilato, Pitch inviato sba
INSERT INTO agent_memory (event_type, title, description, commit_hash, files_affected, search_keywords, severity, metadata) VALUES ('feature', '(vedi sopra: Link SC Privato precompilato, Pitch inviato sbagliato)', '', '', '{}'::TEXT[], '{vedi,link,privato,precompilato,pitch,inviato,sbagliato,none}'::TEXT[], 'medium', '{"seeded_at": "2026-06-25T22:51:10+00:00", "source": "BUG_REGISTRY.md"}'::JSONB);

-- Entry 37: EP single-link vs multi-link mode
INSERT INTO agent_memory (event_type, title, description, commit_hash, files_affected, search_keywords, severity, metadata) VALUES ('feature', 'EP single-link vs multi-link mode', '', '', '{src/components/pitch-generator.tsx,src/lib/pitch-utils.ts,src/lib/store.ts}'::TEXT[], '{single,link,multi,mode,none}'::TEXT[], 'medium', '{"seeded_at": "2026-06-25T22:51:10+00:00", "source": "BUG_REGISTRY.md"}'::JSONB);

-- Entry 38: Bozze/Inviati sub-tabs + save-as-draft
INSERT INTO agent_memory (event_type, title, description, commit_hash, files_affected, search_keywords, severity, metadata) VALUES ('feature', 'Bozze/Inviati sub-tabs + save-as-draft', '', '', '{src/components/pitch-generator.tsx,src/lib/store.ts}'::TEXT[], '{bozze,inviati,sub,tabs,save,draft,none}'::TEXT[], 'medium', '{"seeded_at": "2026-06-25T22:51:10+00:00", "source": "BUG_REGISTRY.md"}'::JSONB);

-- Entry 39: Demo picker + EP multi-select in label detail
INSERT INTO agent_memory (event_type, title, description, commit_hash, files_affected, search_keywords, severity, metadata) VALUES ('feature', 'Demo picker + EP multi-select in label detail', '', '', '{src/components/label-finder.tsx}'::TEXT[], '{demo,picker,multi,select,label,detail,none}'::TEXT[], 'medium', '{"seeded_at": "2026-06-25T22:51:10+00:00", "source": "BUG_REGISTRY.md"}'::JSONB);

-- Entry 40: Deploy Vercel falliva con API body errato
INSERT INTO agent_memory (event_type, title, description, commit_hash, files_affected, search_keywords, severity, metadata) VALUES ('bug_fix', 'Deploy Vercel falliva con API body errato', 'Fix: commit `a7364c3` — use tested Vercel API body + poll by deployment ID', 'a7364c3', '{scripts/deploy.sh}'::TEXT[], '{deploy,vercel,falliva,api,body,errato,none}'::TEXT[], 'high', '{"seeded_at": "2026-06-25T22:51:10+00:00", "source": "BUG_REGISTRY.md"}'::JSONB);

-- Entry 41: Build statico fallisce su route API
INSERT INTO agent_memory (event_type, title, description, commit_hash, files_affected, search_keywords, severity, metadata) VALUES ('bug_fix', 'Build statico fallisce su route API', 'Sintomo: `NEXT_EXPORT=true next build` → errore "force-static not configured on /api/..." | Causa: Next.js 16 richiede `force-static` su ogni route per `output: export`, MA metterlo su [...nextauth] rompe il login Vercel | Fix: usare `scripts/build-static.sh` che muove `src/app/api/` fuori durante il build, poi ripristina', '', '{scripts/build-static.sh}'::TEXT[], '{build,statico,fallisce,route,api,next,export,true,errore,force}'::TEXT[], 'high', '{"seeded_at": "2026-06-25T22:51:10+00:00", "source": "BUG_REGISTRY.md"}'::JSONB);

-- ============================================================================
-- FINE SEED — 41 entry inserite
-- ============================================================================

-- Verifica:
SELECT event_type, severity, count(*) FROM agent_memory GROUP BY event_type, severity ORDER BY event_type, severity;
