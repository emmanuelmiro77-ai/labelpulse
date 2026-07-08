# LABELPULSE REFACTORING PLAN v1.0

Documento operativo di migrazione dall'architettura attuale alla specifica `LABELPULSE_SYSTEM_ARCHITECTURE_SPECIFICATION_v1.0` (e `LABELPULSE_COSTITUZIONE.md`).

Questo piano è **vincolante**. Prima di ogni modifica futura al codice, il piano deve essere seguito fase per fase. Nessuna fase può essere saltata. Nessuna fase può essere iniziata senza aver completato il punto di verifica della fase precedente.

---

## 0. REGOLE OPERATIVE DEL PIANO

1. **Ordine vincolante** — le fasi vanno eseguite nell'ordine indicato. Le dipendenze tra fasi sono esplicite.
2. **Verifica obbligatoria** — dopo ogni fase, il punto di verifica deve essere superato prima di procedere. La verifica è binaria (pass/fail), non "buona parte funziona".
3. **No codice in questo documento** — il piano descrive cosa fare, non come. Il codice sarà scritto solo dopo approvazione esplicita della singola fase.
4. **Backup del dato reale** — la Fase 0 produce un backup completo del database Supabase (dump + schema + policy RLS + funzioni + conteggi righe). È l'unica rollback possibile per i dati.
5. **Una fase = un commit** — ogni fase produce un commit atomico con messaggio `refactor(faseN): descrizione`. Nessuna fase può essere spezzata in più commit.
6. **No workaround** — se una fase rivela un blocco imprevisto, l'esecuzione si ferma, si documenta il blocco, si decide. Non si introducono patch temporanee.
7. **Rollback** — se il punto di verifica di una fase fallisce, si fa `git revert` del commit della fase e si riflette prima di riprovare. Non si accumulano fix sopra a una fase fallita.
8. **Lead Developer / Project Owner / Architect** — l'esecutore del piano è il Lead Developer. Il Project Owner autorizza l'inizio di ogni fase. Il Software Architect (ChatGPT) svolge review tecnica. Nessuna fase può iniziare senza autorizzazione esplicita del Project Owner.

---

## 1. STRUTTURA DELLE FASI

Il piano è diviso in **9 fasi** (0, 0.5, 1, 2, 3, 4, 5, 5.5, 6, 7). Ogni fase ha:
- **Obiettivo** — cosa si raggiunge
- **Dipendenze** — quali fasi devono essere già completate
- **Modifiche database** — cosa cambia su Supabase
- **File modificati** — quali file del repo vengono toccati
- **Rischi** — cosa può rompersi
- **Punto di verifica** — test binario per confermare il completamento

---

## FASE 0 — BACKUP DEL DATABASE (bloccante)

**Obiettivo:** creare un backup completo e verificato del database Supabase prima di qualsiasi modifica. Questa fase è esclusivamente dedicata al backup — nessuna modifica al codice, nessuna modifica allo schema, nessuna modifica alle RLS.

**Dipendenze:** nessuna.

**Modifiche database:** nessuna.

**Modifiche al codice:** nessuna.

**File modificati:** solo documentazione (istruzioni backup + report verifica).

**Azioni:**

0.1. **Backup completo del database Supabase**
- Eseguire un dump completo del database (tutte le tabelle, tutti i dati, tutte le righe).
- Salvare il file in `docs/architecture/backups/` con nome `database-full-backup-<YYYY-MM-DD>.sql` (o `.tar.gz` se compresso).
- Il backup deve includere:
  - Tutte le tabelle dello schema `public`
  - Tutti i dati (righe) di ogni tabella
  - La tabella `auth.users` (se accessibile via Dashboard)
  - La tabella `app_state` (riga globale + righe personali)
  - Le tabelle FASE C (`demo_submissions`, `label_personal_data`, `pitch_campaigns`, `user_profiles`, `user_releases`)
  - Le tabelle snapshot (`beatport_snapshots`, `beatport_chart_history`, `followed_artists`)
  - Le tabelle accessorie (`push_subscriptions`, `beta_feedback`, `beta_access_codes`, `agent_memory`)
- Metodo: Supabase Dashboard → Database → Backups → "Create backup", oppure `pg_dump` se disponibile, oppure script Python con service_role via API REST.

0.2. **Esportazione dello schema SQL (DDL)**
- Eseguire l'esportazione della sola struttura del database (CREATE TABLE, indici, vincoli, foreign keys).
- Salvare il file in `docs/architecture/backups/schema-<YYYY-MM-DD>.sql`.
- Metodo preferito: `pg_dump --schema-only --no-owner --no-privileges -U postgres -h <host> -p <port> -d <dbname> > schema-<date>.sql` (se pg_dump disponibile).
- Metodo alternativo (Supabase Dashboard): Database → Tables → selezionare ogni tabella → "Export DDL" (se disponibile nella versione Dashboard).
- ⚠️ **NOTA**: la query `SELECT 'CREATE TABLE ' || schemaname || '.' || tablename || ' (...);' FROM pg_tables` produce solo placeholder testuali, NON il DDL reale. Non usarla per il backup. L'export schema è per documentazione; il ripristino reale usa il dump completo del punto 0.1.

0.3. **Esportazione delle policy RLS**
- Eseguire l'esportazione di tutte le policy RLS attive.
- Salvare il file in `docs/architecture/backups/rls-policies-<YYYY-MM-DD>.sql`.
- Query SQL da eseguire nel SQL Editor:
  ```sql
  -- Esporta tutte le policy RLS
  SELECT 
    schemaname,
    tablename,
    policyname,
    permissive,
    roles,
    cmd,
    qual,
    with_check
  FROM pg_policies
  WHERE schemaname = 'public'
  ORDER BY tablename, cmd;
  ```
- Salvare anche lo stato RLS (abilitata/disabilitata) per ogni tabella:
  ```sql
  -- Stato RLS per tabella
  SELECT 
    schemaname,
    tablename,
    rowsecurity as rls_enabled
  FROM pg_tables
  WHERE schemaname = 'public'
  ORDER BY tablename;
  ```

0.4. **Esportazione delle funzioni SQL**
- Eseguire l'esportazione di tutte le funzioni SQL personalizzate (se presenti).
- Salvare il file in `docs/architecture/backups/functions-<YYYY-MM-DD>.sql`.
- Query SQL da eseguire nel SQL Editor:
  ```sql
  -- Esporta tutte le funzioni dello schema public
  SELECT 
    routine_name,
    routine_type,
    data_type as return_type,
    routine_definition
  FROM information_schema.routines
  WHERE routine_schema = 'public'
  ORDER BY routine_name;
  ```
- Esportare anche i trigger (se presenti):
  ```sql
  -- Esporta tutti i trigger
  SELECT
    event_object_table as table_name,
    trigger_name,
    action_timing,
    event_manipulation,
    action_statement
  FROM information_schema.triggers
  WHERE trigger_schema = 'public'
  ORDER BY event_object_table, trigger_name;
  ```

0.5. **Verifica che il backup sia ripristinabile**
- Verificare che il backup completo (0.1) possa essere ripristinato in un database di test (o verificare l'integrità del file).
- Metodo di verifica:
  - Se `pg_dump` è stato usato: eseguire `pg_restore --list <backup-file>` per verificare che il file sia leggibile.
  - Se export SQL: aprire il file e verificare che contenga istruzioni `CREATE TABLE` e `INSERT` valide.
  - Se backup Dashboard: verificare che il file non sia vuoto e che la dimensione sia coerente (almeno qualche MB).
- Verificare i conteggi delle righe:
  ```sql
  -- Conteggi di verifica (da confrontare con il backup)
  SELECT 'app_state' as t, COUNT(*) FROM app_state
  UNION ALL SELECT 'demo_submissions', COUNT(*) FROM demo_submissions
  UNION ALL SELECT 'label_personal_data', COUNT(*) FROM label_personal_data
  UNION ALL SELECT 'pitch_campaigns', COUNT(*) FROM pitch_campaigns
  UNION ALL SELECT 'user_profiles', COUNT(*) FROM user_profiles
  UNION ALL SELECT 'user_releases', COUNT(*) FROM user_releases
  UNION ALL SELECT 'beatport_snapshots', COUNT(*) FROM beatport_snapshots
  UNION ALL SELECT 'beatport_chart_history', COUNT(*) FROM beatport_chart_history
  UNION ALL SELECT 'followed_artists', COUNT(*) FROM followed_artists
  UNION ALL SELECT 'push_subscriptions', COUNT(*) FROM push_subscriptions
  UNION ALL SELECT 'beta_feedback', COUNT(*) FROM beta_feedback
  UNION ALL SELECT 'beta_access_codes', COUNT(*) FROM beta_access_codes
  UNION ALL SELECT 'agent_memory', COUNT(*) FROM agent_memory
  ORDER BY t;
  ```
- Salvare i conteggi in `docs/architecture/backups/row-counts-<YYYY-MM-DD>.json` per confronto post-migrazione.

0.6. **Commit Git della documentazione aggiornata**
- Aggiornare questo documento (LABELPULSE_REFACTORING_PLAN_v1.0.md) con la Fase 0 trasformata come sopra.
- Aggiornare LABELPULSE_MIGRATION_SAFETY_REPORT.md se necessario (riferimenti alla Fase 0).
- Commit dei soli file di documentazione (nessun codice, nessun backup nel commit — i backup sono in `docs/architecture/backups/` che deve essere nel `.gitignore` per evitare di committare dati sensibili).
- Messaggio commit: `docs(fase0): backup database — istruzioni e verifica`

**Divieti espliciti:**
- ❌ Nessuna modifica al codice dell'applicazione (`src/**`)
- ❌ Nessuna modifica allo schema del database (nessun `ALTER TABLE`, `CREATE TABLE`, `DROP`)
- ❌ Nessuna modifica alle RLS (nessun `CREATE POLICY`, `DROP POLICY`, `ALTER TABLE ... ENABLE/DISABLE ROW LEVEL SECURITY`)
- ❌ Nessuna modifica alle funzioni SQL
- ❌ Nessun commit dei file di backup nel repo (vanno in `.gitignore`)

**Rischi:**
- Se il backup non viene eseguito correttamente e una fase successiva corrompe i dati, non c'è ripristino possibile.
- Se il backup è incompleto (es. manca `auth.users`), il ripristino potrebbe non ricostruire correttamente le relazioni `user_id`.
- Se i conteggi di verifica non vengono salvati, non c'è baseline per confrontare l'integrità post-migrazione.

**Punto di verifica:**
1. Il file `docs/architecture/backups/database-full-backup-<YYYY-MM-DD>.sql` esiste e non è vuoto.
2. Il file `docs/architecture/backups/schema-<YYYY-MM-DD>.sql` esiste e contiene istruzioni `CREATE TABLE` per tutte le tabelle `public.*`.
3. Il file `docs/architecture/backups/rls-policies-<YYYY-MM-DD>.sql` esiste e contiene tutte le policy RLS attive.
4. Il file `docs/architecture/backups/functions-<YYYY-MM-DD>.sql` esiste (può essere vuoto se non ci sono funzioni personalizzate).
5. Il file `docs/architecture/backups/row-counts-<YYYY-MM-DD>.json` esiste e contiene i conteggi di tutte le tabelle.
6. La verifica di ripristinabilità (0.5) è stata eseguita e documentata.
7. Il file `.gitignore` contiene `docs/architecture/backups/` (i backup non vengono committati).
8. Il commit Git contiene solo file di documentazione (verificare con `git show --stat`).
9. Il tag `labelpulse-pre-refactor-v1` esiste (creato nella fase di preparazione repo).

**Stato:** ☐ Da completare

---

## FASE 0.5 — SECURITY HARDENING

**Obiettivo:** risolvere i warning del Supabase Security Advisor che possono essere corretti senza modificare l'architettura. Queste correzioni sono **indipendenti** dal refactoring strutturale e riducono la superficie di attacco prima di iniziare le fasi migratorie.

**Dipendenze:** FASE 0 completata (backup disponibile come rollback).

**Modifiche database (ordine obbligatorio):**

0.5.1. **Protezione `followed_artists`** (warning `rls_disabled_in_public`):
- Abilitare RLS (attualmente DISABLED).
- Policy `FOR SELECT USING (true)` — tutti possono leggere.
- Policy `FOR INSERT/UPDATE/DELETE USING (false)` — nessun accesso client in scrittura.
- Giustificazione: tabella orfana, non referenziata da codice applicativo. Zero impatto funzionale.

0.5.2. **Verifica funzionale e classificazione `agent_memory`** (warning `sensitive_columns_exposed`):
- **NON eseguire modifiche esecutive in questa fase.** La tabella sarà protetta solo dopo la verifica.
- Verificare e documentare:
  - Chi la utilizza (componenti UI, API route, script esterni).
  - Quali componenti dell'app la utilizzano.
  - Quali API route la utilizzano.
  - Se viene letta.
  - Se viene scritta.
  - Se è admin-only.
  - Se può essere protetta con RLS senza rompere funzionalità.
- Esito della verifica (da compilare):
  - [ ] Componenti UI: ____
  - [ ] API route: ____
  - [ ] Letta da: ____
  - [ ] Scritta da: ____
  - [ ] Admin-only: ____
  - [ ] Può essere protetta senza rompere funzionalità: ____
- Solo se la verifica conferma che può essere protetta senza impatto funzionale, entrerà in una futura fase di Security Hardening esecutivo.

0.5.3. **Verifica funzionale e classificazione `beta_feedback`** (warning `sensitive_columns_exposed`):
- **NON eseguire modifiche esecutive in questa fase.** La tabella sarà protetta solo dopo la verifica.
- Verificare e documentare:
  - Chi la utilizza (componenti UI, API route, script esterni).
  - Quali componenti dell'app la utilizzano.
  - Quali API route la utilizzano.
  - Se viene letta.
  - Se viene scritta.
  - Se è admin-only o se è usata anche dagli utenti.
  - Se può essere protetta con RLS senza rompere funzionalità (in particolare, verificare se `supabaseKey` in `src/app/api/beta-feedback/route.ts` riga 230 è `SUPABASE_SERVICE_ROLE_KEY` o `NEXT_PUBLIC_SUPABASE_ANON_KEY`).
- Esito della verifica (da compilare):
  - [ ] Componenti UI: ____
  - [ ] API route: ____
  - [ ] Letta da: ____
  - [ ] Scritta da: ____
  - [ ] Admin-only o anche utenti: ____
  - [ ] Tipo di chiave usata dalla route (service_role / anon): ____
  - [ ] Può essere protetta senza rompere funzionalità: ____
- Solo se la verifica conferma che può essere protetta senza impatto funzionale, entrerà in una futura fase di Security Hardening esecutivo.

0.5.4. **Protezione route amministrative snapshot Beatport** (warning indiretto: route senza auth):
- Le route `/api/snapshots/save`, `/api/snapshots/latest`, `/api/snapshots/diff/[date]` non hanno auth check e usano anon key.
- Modificare `src/lib/snapshots.ts` funzione `getServerSupabase()` (riga 72) per usare `SUPABASE_SERVICE_ROLE_KEY` invece di `NEXT_PUBLIC_SUPABASE_ANON_KEY`.
- Aggiungere auth check `getServerSession` + `ADMIN_EMAILS` in:
  - `/api/snapshots/save/route.ts` (POST) — solo admin può importare snapshot.
  - `/api/snapshots/latest/route.ts` (GET) — **resta pubblico**: restituisce solo metadati (data, count tracce, count generi), nessun dato sensibile.
  - `/api/snapshots/diff/[date]/route.ts` (GET) — **resta pubblico**: restituisce solo diff aggregati (climbers, droppers, new entries), nessun dato sensibile.
- Spostare la route `save` sotto `/api/admin/snapshots/save` (coerente con `LABELPULSE_FINAL_ARCHITECTURE.md` sezione 5.4: admin-only usa service_role).
- Le route `latest` e `diff` restano sotto `/api/snapshots/*` (pubbliche, sola lettura metadati).
- Giustificazione: le snapshot sono dati globali scritti solo dall'admin. L'anon key non deve poter scrivere. La lettura di metadati è pubblica.

⚠️ **ATTENZIONE — Impatto scraper Beatport (verifica obbligatoria prima della fase):**
- Lo scraper Beatport nel browser fa POST diretta a `/api/snapshots/save` con CORS `ALLOWED_ORIGINS = ['https://www.beatport.com', ...]`.
- Se la route `save` si sposta sotto `/api/admin/snapshots/save` con auth check `getServerSession`, lo scraper NON ha sessione NextAuth → 401 → lo scraper smette di funzionare.
- **Verifica obbligatoria prima della fase:** analizzare `src/app/api/snapshots/save/route.ts` righe 23-39 (CORS config) e `src/components/rankings-wizard.tsx` riga 666 (fetch call). Determinare:
  1. Lo scraper è uno script browser separato (bookmarklet/extension) o è `rankings-wizard.tsx` dentro l'app?
  2. Se è separato: come ottiene la sessione? Serve un token condiviso (es. header `X-Scraper-Token`) invece di `getServerSession`.
  3. Se è `rankings-wizard.tsx`: l'utente è già loggato come admin, `getServerSession` funziona.
- **Decisione da documentare prima della fase:** come gestire l'auth dello scraper. Opzioni:
  - A) Lo scraper include la sessione NextAuth (se è parte dell'app)
  - B) Lo scraper usa un token condiviso `X-Scraper-Token` validato server-side
  - C) La route `save` resta sotto `/api/snapshots/save` ma con auth tramite token instead of session
- Non procedere con 0.5.4 finché questa decisione non è documentata.

0.5.5. **Protezione `beatport_snapshots` e `beatport_chart_history`** (warning `rls_disabled_in_public`):
- Abilitare RLS (attualmente DISABLED).
- Policy `FOR SELECT USING (true)` — tutti possono leggere.
- Policy `FOR INSERT/UPDATE/DELETE USING (false)` — nessun accesso client in scrittura.
- Giustificazione: dopo 0.5.4, le route usano service_role (bypassa RLS), quindi l'INSERT admin continua a funzionare. Gli utenti non possono scrivere.

0.5.6. **Verifica finale Security Advisor**:
- Eseguire il Security Advisor da Supabase Dashboard → Security → Advisor.
- Verificare che i warning `rls_disabled_in_public` e `sensitive_columns_exposed` siano risolti per le tabelle trattate in questa fase.
- I warning residui su `app_state` e tabelle FASE C saranno risolti nella Fase 1 (richiedono modifica architetturale).
- Documentare i warning residui e la fase in cui saranno risolti.

**File modificati (modifiche esecutive — solo elementi già verificati e indipendenti dal refactoring):**
- `supabase-schema-snapshots.sql` (RLS abilitata + policy per `beatport_snapshots`, `beatport_chart_history`, `followed_artists`)
- Nuovo file: `supabase-migration-000-security-hardening.sql` (script consolidato per SQL Editor — contiene SOLO le policy per `followed_artists`, `beatport_snapshots`, `beatport_chart_history`)
- `src/lib/snapshots.ts` (`getServerSupabase` → service_role)
- `src/app/api/snapshots/save/route.ts` (auth check admin + spostamento sotto `/api/admin/snapshots/`)
- `src/app/api/snapshots/latest/route.ts` (verifica auth o mantenimento pubblico)
- `src/app/api/snapshots/diff/[date]/route.ts` (verifica auth o mantenimento pubblico)
- Eventualmente: `src/app/api/admin/snapshots/save/route.ts` (nuova posizione)
- Eventualmente: `src/app/api/admin/snapshots/latest/route.ts`
- Eventualmente: `src/app/api/admin/snapshots/diff/[date]/route.ts`
- `src/components/rankings-wizard.tsx` (aggiornamento URL fetch da `/api/snapshots/save` a `/api/admin/snapshots/save`)

**File NON modificati in questa fase (solo verificati in 0.5.2 e 0.5.3):**
- `supabase-schema-agent-memory.sql` — nessuna modifica esecutiva, solo verifica
- `src/app/api/beta-feedback/route.ts` — nessuna modifica esecutiva, solo verifica
- `supabase-schema.sql` (policy `beta_feedback`) — nessuna modifica esecutiva, solo verifica

**Rischi:**
- **R1 (medio):** se 0.5.4 non sposta correttamente le route sotto `/api/admin/`, il frontend (`rankings-wizard.tsx` riga 666) chiama ancora `/api/snapshots/save` e ottiene 404. Mitigazione: aggiornare l'URL in `rankings-wizard.tsx` nello stesso commit.
- **R2 (basso):** se 0.5.5 abilita RLS su `beatport_snapshots` prima che 0.5.4 sia completato, l'import snapshot fallisce. Mitigazione: ordine obbligatorio (0.5.4 prima di 0.5.5).
- **R3 (basso):** le verifiche 0.5.2 e 0.5.3 potrebbero rivelare che le tabelle non possono essere protette senza rompere funzionalità. In quel caso, la protezione viene rinviata a una fase successiva o al refactoring architetturale. Non è un rischio di questa fase, ma un output della verifica.

**Punto di verifica:**

*Modifiche esecutive:*
1. Supabase Dashboard → Security → Advisor → verificare che i warning `rls_disabled_in_public` per `beatport_snapshots`, `beatport_chart_history`, `followed_artists` siano risolti.
2. Eseguire da SQL Editor:
   ```sql
   SELECT tablename, rowsecurity, policyname, qual
   FROM pg_tables t
   LEFT JOIN pg_policies p ON p.tablename = t.tablename
   WHERE t.tablename IN ('beatport_snapshots', 'beatport_chart_history', 'followed_artists')
   ORDER BY t.tablename, p.cmd;
   ```
   Verificare: RLS abilitata per tutte e 3, policy `USING (true)` SELECT + `USING (false)` INSERT/UPDATE/DELETE.
3. Test funzionale: login come admin → import classifiche via `rankings-wizard` → deve funzionare (usa service_role tramite la nuova route `/api/admin/snapshots/save`).
4. Test funzionale: login come utente non-admin → tentare POST `/api/admin/snapshots/save` → deve restituire 401/403.

*Verifiche non esecutive (0.5.2 e 0.5.3):*
5. Documento di verifica compilato per `agent_memory` con tutti i campi (componenti, route, lettura, scrittura, admin-only, proteggibilità).
6. Documento di verifica compilato per `beta_feedback` con tutti i campi (componenti, route, lettura, scrittura, admin-only/utenti, tipo di chiave, proteggibilità).
7. Decisione documentata per ciascuna delle due tabelle: "protezione possibile in fase successiva" oppure "rinvio al refactoring architetturale".

*Verifica finale:*
8. Supabase Dashboard → Security → Advisor → documentare i warning residui:
   - `sensitive_columns_exposed` per `agent_memory` — risolto? (solo se la verifica 0.5.2 ha portato a una protezione esecutiva, altrimenti rimane e sarà risolto in fase successiva)
   - `sensitive_columns_exposed` per `beta_feedback` — risolto? (solo se la verifica 0.5.3 ha portato a una protezione esecutiva, altrimenti rimane e sarà risolto in fase successiva)
   - `sensitive_columns_exposed` per `app_state` — sarà risolto nella Fase 1.
   - Warning su tabelle FASE C (se emergency fix applicato) — saranno risolti nella Fase 1.

**Stato:** ☐ Da completare

---

## FASE 1 — MIGRAZIONE SCHEMA DATABASE (user_id + RLS)

**Obiettivo:** portare lo schema Supabase alla conformità con la specifica: ogni tabella personale usa `user_id UUID REFERENCES auth.users(id)` e RLS basata su `auth.uid()`.

**Dipendenze:** FASE 0.5 completata e verificata.

**Modifiche database (ordine obbligatorio):**

1.1. Aggiungere colonna `user_id UUID REFERENCES auth.users(id)` a:
- `demo_submissions`
- `label_personal_data`
- `pitch_campaigns`
- `user_profiles`
- `user_releases`

1.2. Popolare `user_id` per ogni riga esistente:
- Join con `auth.users` su `user_email = auth.users.email`
- Le righe senza match (email non più valide) vengono segnalate in una tabella `_orphans` per revisione manuale, non eliminate.

1.3. Aggiungere indice su `user_id` per ogni tabella (sostituisce l'indice su `user_email`).

1.4. Riscrivere RLS su tutte le 5 tabelle FASE C:
- Rimuovere tutte le policy esistenti (incluse quelle `FOR ALL USING (true)` dell'emergency fix).
- Creare policy `FOR SELECT/INSERT/UPDATE/DELETE USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid())`.

1.5. Riscrivere RLS su `app_state`:
- La riga `id='global'` resta leggibile da tutti (`FOR SELECT USING (id = 'global')`).
- Le righe personali `id='<email>'` diventano **obsolete** (verranno rimosse nella Fase 2). In questa fase vengono solo bloccate in scrittura, MA restano leggibili temporaneamente per non rompere `loadStateFromCloud` (eliminato solo in Fase 2).
- Policy temporanea Fase 1: `FOR SELECT USING (id = 'global' OR id = auth.jwt() ->> 'email')` + `FOR INSERT/UPDATE/DELETE USING (false)` (nessuno può scrivere righe personali, ma la lettura della propria riga resta permessa finché la Fase 2 elimina `loadStateFromCloud`).
- **Policy finale Fase 2** (dopo eliminazione `loadStateFromCloud`): `FOR SELECT USING (id = 'global')` + `FOR INSERT/UPDATE/DELETE USING (false)` (lettura personale bloccata definitivamente).
- ⚠️ **NOTA**: questa policy temporanea evita il problema identificato nella review tecnica: bloccare la lettura personale in Fase 1 romperebbe l'accesso a `gmailAuth`, `artists`, `rankingSnapshots` personali che vivono ancora nel JSON blob e sono letti da `loadStateFromCloud` (non ancora eliminato).

1.6. Verificare che `SUPABASE_SERVICE_ROLE_KEY` sia configurata su Vercel (necessaria per le API route in transizione).

**File modificati:**
- `supabase-schema-fase-c.sql` (aggiornato con `user_id` e nuove policy)
- `supabase-schema.sql` (policy `app_state` aggiornata)
- `supabase-rls-disable-emergency.sql` (eliminato dal repo)
- Nuovo file: `supabase-migration-001-add-user-id.sql`
- Nuovo file: `supabase-migration-002-rls-per-user.sql`

**Rischi:**
- **R1 (alto):** la popolazione di `user_id` può fallire se ci sono righe con `user_email` non corrispondente ad alcun utente in `auth.users`. Mitigazione: tabella `_orphans` per revisione, nessuna riga eliminata.
- **R2 (alto):** le nuove RLS possono bloccare le API route esistenti che usano service_role (bypass) — ma se un'API route usa anon key o JWT scaduto, le scritture smettono di funzionare. Mitigazione: in questa fase, `getAdminClient` continua a usare service_role come fallback; il cambiamento effettivo avviene in Fase 5.
- **R3 (medio):** la rimozione delle policy `USING (true)` su `app_state` può bloccare la lettura della riga personale da parte del frontend (che usa anon key). Mitigazione: la Fase 2 eliminerà la dipendenza dalla riga personale; in transizione, il frontend legge dalla riga globale (già permessa).
- **R4 (basso):** gli indici su `user_id` richiedono tempo su tabelle grandi. Mitigazione: eseguire in finestra di basso traffico.

**Punto di verifica:**
- Eseguire da Supabase SQL Editor:
  ```sql
  SELECT COUNT(*) FROM demo_submissions WHERE user_id IS NULL;
  SELECT COUNT(*) FROM label_personal_data WHERE user_id IS NULL;
  SELECT COUNT(*) FROM pitch_campaigns WHERE user_id IS NULL;
  SELECT COUNT(*) FROM user_profiles WHERE user_id IS NULL;
  SELECT COUNT(*) FROM user_releases WHERE user_id IS NULL;
  ```
  Tutte devono restituire `0` (o righe orfane documentate in `_orphans`).
- Eseguire da Supabase SQL Editor:
  ```sql
  SELECT policyname, cmd, qual FROM pg_policies
  WHERE tablename IN ('demo_submissions','label_personal_data','pitch_campaigns','user_profiles','user_releases')
  ORDER BY tablename, cmd;
  ```
  Devono esistere 4 policy per tabella (SELECT/INSERT/UPDATE/DELETE) con `qual` contenente `user_id = auth.uid()`.
- Eseguire da Supabase SQL Editor con `set role anon`:
  ```sql
  SELECT * FROM demo_submissions LIMIT 1;
  ```
  Deve restituire 0 righe (anon non ha accesso senza JWT).

**Stato:** ☐ Da completare

---

## FASE 2 — ELIMINAZIONE app_state PERSONALE + SYNC LEGACY

**Obiettivo:** rimuovere la doppia fonte di verità. I dati utente vivono solo nelle tabelle FASE C. La riga `app_state id='global'` resta solo per classifiche.

**Dipendenze:** FASE 1 completata e verificata.

**Modifiche database:**
2.1. Nessuna modifica allo schema. La riga personale `app_state id='<email>'` resta fisicamente presente (per rollback) ma diventa inaccessibile via RLS (già bloccata in 1.5).

**File modificati:**
- `src/lib/supabase.ts`
  - Eliminare `saveStateToCloud`, `loadStateFromCloud` (funzioni che leggono/scrivono la riga personale)
  - Eliminare `mergeGlobalAndPersonalCloud`, `mergeGlobalAndPersonalLabel`
  - Semplificare `loadGlobalRowOnly` — resta solo la lettura della riga globale
  - Eliminare `saveGlobalRowOnly` se sostituita da `/api/admin/push-rankings`
- `src/lib/store.ts`
  - Eliminare `syncToCloud` e tutte le 25 chiamate
  - Eliminare `forceCloudSync` e tutte le chiamate
  - Eliminare `DISABLE_OLD_APP_STATE_SYNC` e `OLD_APP_STATE_SYNC_DISABLED`
  - Eliminare `loadFromCloud` (sostituita da `loadFromNewTables` che diventa l'unico flusso di lettura)
  - Eliminare i merge multipli che coinvolgevano la riga personale
- `src/lib/use-auth.ts`
  - Sostituire `Promise.all([loadFromCloud(), loadFromNewTables()])` con sola chiamata a `loadFromNewTables` + lettura riga globale per classifiche
- `src/components/producer-profile.tsx` (e tutti i componenti che chiamano `forceCloudSync` direttamente)
  - Sostituire le chiamate a `forceCloudSync` con chiamate alle API route specifiche (`/api/profile`, `/api/demos`, ecc.)
  - ⚠️ Questi componenti sono parte integrante della Fase 2, non modifiche collaterali — senza questa migrazione, perdono la funzionalità di salvataggio
- Aggiornare la policy `app_state` alla **policy finale Fase 2** (vedi punto 1.5): `FOR SELECT USING (id = 'global')` + `FOR INSERT/UPDATE/DELETE USING (false)` (lettura personale bloccata definitivamente, ora che `loadStateFromCloud` è eliminato)

**Rischi:**
- **R1 (alto):** se `loadFromNewTables` non copre tutti i dati che erano nella riga personale, si perdono dati. Mitigazione: prima di eliminare `loadStateFromCloud`, verificare che `loadFromNewTables` carichi: demos, label personal data, pitches, profile, releases, **e le classifiche dalla riga globale**. Se manca qualcosa, aggiungerlo a `loadFromNewTables`.
- **R2 (medio):** i componenti che chiamano `forceCloudSync` direttamente (es. `producer-profile.tsx` per il salvataggio foto) smettono di funzionare. Mitigazione: ogni chiamante di `forceCloudSync` deve essere migrato alla API route specifica (`/api/profile`, `/api/demos`, ecc.).
- **R3 (medio):** il realtime su `app_state` personale (se presente) smette di ricevere update. Mitigazione: il realtime personale era già disabilitato; il realtime globale resta attivo.

**Punto di verifica:**
- Login → i dati (demo, label personalizzate, profilo, pitch, release, classifiche) sono tutti presenti.
- Logout → login → stessi dati.
- Console browser: nessun log `[LabelPulse Cloud] Old app_state sync` (funzione rimossa).
- Console browser: nessun errore `loadStateFromCloud is not defined` o `syncToCloud is not defined`.
- Supabase Dashboard: `SELECT updated_at FROM app_state WHERE id='<email>';` — il timestamp non si aggiorna più dopo modifiche utente (la riga è diventata read-only).

**Stato:** ☐ Da completare

---

## FASE 3 — ELIMINAZIONE OUTBOX + AUTO-BACKUP

**Obiettivo:** rimuovere la logica offline e la seconda fonte di verità su IndexedDB. Le scritture vanno dirette alle API route; se falliscono, errore esplicito.

**Dipendenze:** FASE 2 completata e verificata.

**Modifiche database:** nessuna.

**File modificati:**
- `src/lib/outbox.ts` — **eliminato** (intero file)
- `src/lib/auto-backup.ts` — **eliminato** (intero file)
- `src/lib/api-client.ts`
  - `writeWithOutbox` viene sostituita da `writeDirect` — fetch diretta, nessuna coda, errore propagato al chiamante
  - Tutte le funzioni `apiCreateDemo`, `apiUpdateDemo`, `apiUpsertProfile`, ecc. chiamano `writeDirect`
- `src/lib/store.ts`
  - Eliminare `setAutoBackupEmail`, `restoreFromSnapshot`, il subscribe globale a `saveSnapshot`
  - Eliminare `flushSnapshot` su `beforeunload`/`visibilitychange`
  - Eliminare `pauseOutboxFlush`/`resumeOutboxFlush` dalle azioni
  - Le azioni `addDemo`, `addLabel`, `setUserProfile`, ecc. diventano **async**: chiamano la API route, attendono conferma, poi fanno `set()` con il dato confermato. Se la chiamata fallisce, nessun `set()` e l'errore viene mostrato.
- `src/lib/use-auth.ts`
  - Eliminare `startOutboxAutoFlush`, `pauseOutboxFlush`, `resumeOutboxFlush`, `onCloudConflict`
  - Il boot diventa: `loadFromNewTables()` → `setState` → done. Nessun fallback snapshot.
- `src/components/backup-indicator.tsx` — **eliminato** (l'indicatore backup non ha più senso)
- `src/components/cloud-recovery.tsx`
  - Eliminare i riferimenti a outbox, sidecar restore, `restoreFromSnapshot`
  - Il pulsante "Invia N modifiche in sospeso" scompare (non c'è più coda)
- `src/components/producer-profile.tsx` e tutti i componenti che facevano salvataggio ottimistico
  - Sostituire pattern: `set() → apiWrite()` con `apiWrite() → set()`

**Rischi:**
- **R1 (critico):** ogni scrittura che fallisce per rete viene ora mostrata come errore all'utente. Se la rete è instabile, l'UX peggiora sensibilmente. Mitigazione: la specifica esige questo comportamento ("se la scrittura fallisce, mostra errore esplicito, non salvare silenziosamente"). Non è un regression, è il comportamento corretto.
- **R2 (alto):** il passaggio da `set()` sincrono a `set()` async richiede refactor di tutti i componenti che facevano `addDemo(...)` e poi leggevano subito lo stato. Mitigazione: ogni chiamante deve diventare `await addDemo(...)` o gestire il loading state.
- **R3 (medio):** la chiusura dell'app durante una scrittura in corso perde la modifica. Mitigazione: comportamento atteso dalla specifica (solo online, nessuna coda).
- **R4 (medio):** `cloud-recovery.tsx` perde funzionalità diagnostiche (sidecar restore). Mitigazione: le funzionalità erano workaround; la diagnostica cloud resta.

**Punto di verifica:**
- `grep -r "outbox\|auto-backup\|saveSnapshot\|flushSnapshot\|writeWithOutbox" src/` → 0 risultati.
- Login → modifica un demo → se la rete è attiva, il demo appare modificato; se si simula offline (DevTools → Network → Offline), la modifica **non viene salvata** e compare un errore esplicito.
- Chiudi l'app → riapri → lo stato è quello del cloud, non ci sono "snapshot locali" che sovrascrivono.
- Console browser: nessun log `[AutoBackup]` o `[outbox]`.

**Stato:** ☐ Da completare

---

## FASE 4 — ELIMINAZIONE ZUSTAND PERSIST + IDB STORAGE

**Obiettivo:** rimuovere il middleware `persist` da Zustand e tutta la persistenza locale. Zustand resta temporaneamente in-memory (solo per questa fase), ma verrà eliminato completamente nella Fase 7. Nessuna persistenza locale.

**Dipendenze:** FASE 3 completata e verificata.

**Modifiche database:** nessuna.

**File modificati:**
- `src/lib/store.ts`
  - Rimuovere `persist` middleware: `create<AppState>()(...)` senza `persist(...)`
  - Eliminare `createJSONStorage`, `idbStorage`, `robustStorage`
  - Eliminare `partialize`, `merge`, `onRehydrateStorage`, `migrate` (tutta la configurazione persist)
  - Eliminare `PRIMARY_KEY`, `BACKUP_KEY`, `SNAPSHOTS_BACKUP_KEY`, `PROFILE_BACKUP_KEY`, `OWNER_KEY`, `ARTISTS_SIDECAR_KEY`
  - Eliminare `getStorageOwner`, `setStorageOwner`, `verifyStorageOwner`, `clearAllLocalData` (o semplificarle drasticamente — non c'è più nulla da pulire)
  - Eliminare `forceBackupNow`, `readSnapshotsSidecar`, `restoreSnapshotsFromSidecar`, `readProfileSidecar`, `restoreProfileFromSidecar`, `writeArtistsSidecar`, `readArtistsSidecar`, `restoreArtistsFromSidecar`
  - Eliminare `emergencyClearLocalStorage`
  - Lo store Zustand (in-memory, senza persist) viene popolato **solo** dal flusso di boot (Fase 5) e dalle azioni async (Fase 3). Sarà eliminato completamente nella Fase 7.
- `src/lib/artists-idb.ts` — **eliminato** (intero file)
- `src/lib/supabase.ts`
  - `saveArtistsToCloud`/`loadArtistsFromCloud` — verificare se servono ancora o se gli artisti vanno in una tabella dedicata (valutare in fase di esecuzione)
- `package.json`
  - Rimuovere `idb-keyval` dalle dipendenze (se non più usato altrove)
- `src/components/cloud-recovery.tsx`
  - Eliminare tutti i riferimenti a sidecar localStorage (diagnostica semplificata)
- `src/components/welcome-onboarding.tsx`
  - Il flag `labelpulse-onboarded-v2:<email>` resta in localStorage (è un flag UI, non un dato utente) — decisione allineata a `LABELPULSE_FINAL_ARCHITECTURE.md` sezione 9.5
- `src/components/cookie-consent.tsx`, `src/components/posthog-provider.tsx`
  - Il flag cookie consent resta in localStorage (preferenza, non dato utente) — decisione allineata a `LABELPULSE_FINAL_ARCHITECTURE.md` sezione 9.5

**Decisione sui flag config/auth (allineata a Final Architecture 9.5):**
- **Mantenere in localStorage:** `labelpulse-onboarded-v2:<email>`, `labelpulse-cookie-consent`, `beta_admin_token`, `next-auth.session-token`
- Non sono dati utente, sono flag di config/auth. La specifica vieta "localStorage persistente" per dati utente, non per flag di config.

**Rischi:**
- **R1 (critico):** senza persist, ogni refresh della pagina perde lo stato se il cloud sync non ha completato. Mitigazione: il boot (Fase 5) deve completare prima del render. La UI mostra loading finché il cloud non risponde.
- **R2 (alto):** `verifyStorageOwner` era il guardiano del multi-user isolation. Senza localStorage, l'isolamento è garantito solo da RLS (corretto per la specifica). Mitigazione: la Fase 1 ha già reso RLS per-user rigorosa.
- **R3 (medio):** gli artisti su IndexedDB (~9MB) vengono persi. Mitigazione: devono essere migrati a una tabella Supabase prima di questa fase, oppure accettati come perdita (verificare con l'utente).

**Punto di verifica:**
- `grep -r "persist\|createJSONStorage\|idb-keyval\|idbStorage\|localStorage\.setItem.*labelpulse" src/` → 0 risultati (esclusi flag di config/auth documentati).
- DevTools → Application → IndexedDB → nessun database `labelpulse-*` presente dopo login.
- DevTools → Application → Local Storage → solo flag di config/auth (`cookie-consent`, `onboarded`, `beta_admin_token`, `next-auth.*`), nessun `labelpulse-storage`, `labelpulse-snapshot-*`, `labelpulse-outbox-*`, `labelpulse-*-backup`.
- Refresh pagina → lo stato si ricarica dal cloud (loading visibile), non da IndexedDB.
- Logout → login con altro utente sullo stesso device → nessun dato del precedente utente visibile.

**Stato:** ☐ Da completare

---

## FASE 5 — BOOT FLOW SEQUENZIALE + TIMEOUT RIMOSSO

**Obiettivo:** il flusso di boot diventa sequenziale, singolo, deterministico. Nessun timeout, nessun fallback.

**Dipendenze:** FASE 4 completata e verificata.

**Modifiche database:** nessuna.

**File modificati:**
- `src/lib/use-auth.ts`
  - Il `useEffect` di boot diventa:
    1. `setCurrentUserEmail(email)`
    2. `await loadGlobalRankings()` — fetch riga globale `app_state id='global'` per classifiche
    3. `await loadFromNewTables()` — fetch tabelle dedicate (demos, label, pitches, profile, releases)
    4. `setState({ hasRehydrated: true, hasCloudSynced: true })`
  - Eliminare `Promise.race` con timeout 15s
  - Eliminare `restoreFromSnapshot` fallback
  - Se il fetch fallisce: `setState({ hasRehydrated: true, hasCloudSynced: false, cloudError: err.message })` e la UI mostra errore esplicito (non dati stale)
- `src/lib/store.ts`
  - `loadFromNewTables` diventa la **unica** funzione di lettura. Restituisce lo stato completo.
  - Eliminare ogni `setState` concorrente durante il boot
- `src/app/page.tsx`
  - La UI di loading mostra "Caricamento dal cloud..." finché `hasCloudSynced` non è true
  - Se `cloudError` è presente, mostra schermata di errore con pulsante "Riprova"

**Rischi:**
- **R1 (alto):** se Supabase è down, l'app è inutilizzabile. Mitigazione: questo è il comportamento richiesto dalla specifica ("solo online").
- **R2 (medio):** il tempo di boot aumenta (fetch sequenziali invece che paralleli). Mitigazione: i fetch sequenziali sono 2 (globale + tabelle dedicate), non necessariamente più lenti dei precedenti 3 concorrenti con race condition.
- **R3 (medio):** la rimozione del timeout significa che un Supabase lento (cold start) blocca l'utente a lungo. Mitigazione: mostrare progress feedback ("Caricamento classifiche... Caricamento demo...").

**Punto di verifica:**
- Login → la UI mostra loading → poi i dati appaiono. Non ci sono "flash" di dati stale.
- Simulare Supabase down (DevTools → block request a `*.supabase.co`) → login → la UI mostra errore esplicito, non dati locali.
- Console browser: log sequenziali `[boot] fetch global rankings → fetch user data → done`, non log concorrenti.
- Modifica su device A → login su device B → device B mostra la modifica (non dati stale).

**Stato:** ☐ Da completare

---

## FASE 5.5 — JWT REFRESH TOKEN FLOW

**Obiettivo:** implementare il refresh del JWT Supabase scaduto usando il refresh token salvato nella sessione NextAuth. Questa fase è prerequisito per la Fase 6 (eliminazione service_role): senza refresh, ogni sessione > 1 ora si bloccherebbe con 401 su tutte le API route.

**Dipendenze:** FASE 5 completata e verificata.

**Modifiche database:** nessuna.

**File modificati:**
- `src/lib/auth-options.ts`
  - Nel callback `jwt({ token, account, user })`, quando `account` è undefined (sessione esistente, non nuovo login):
    - Leggere `token.supabaseExpiresAt`
    - Se scaduto (o in scadenza entro 60s):
      - Usare `token.supabaseRefreshToken` per chiamare `supabase.auth.refreshSession({ refresh_token: token.supabaseRefreshToken })`
      - Se successo: aggiornare `token.supabaseAccessToken`, `token.supabaseRefreshToken`, `token.supabaseExpiresAt`
      - Se fallito: loggare warning, lasciare il token scaduto (l'API route risponderà 401 e l'utente rifà login)
- `src/lib/supabase-admin.ts`
  - Aggiungere funzione `refreshSupabaseToken(session)`: se il JWT è scaduto, usa il refresh token per ottenerne uno nuovo prima di creare il client Supabase
  - `getAdminClient` chiama `refreshSupabaseToken` prima di creare il client

**Rischi:**
- **R1 (alto):** se `refreshSession` fallisce (refresh token scaduto o invalidato), l'utente viene sloggato. Mitigazione: questo è il comportamento corretto — il refresh token ha una scadenza (settimane), se scade l'utente rifà login.
- **R2 (medio):** race condition tra multiple API route concorrenti che tentano il refresh simultaneamente. Mitigazione: usare un lock in-memory (module-level variable) per serializzare i refresh.
- **R3 (basso):** il refresh token rotato (Supabase potrebbe ritornare un nuovo refresh token ad ogni refresh). Mitigazione: aggiornare sempre `token.supabaseRefreshToken` con il valore ritornato.

**Punto di verifica:**
1. Login → attendere > 1 ora (o modificare `token.supabaseExpiresAt` per simulare scadenza) → fare una modifica (es. aggiungere un demo) → deve funzionare senza re-login
2. Console browser: nessun errore 401 dopo scadenza JWT
3. Supabase Dashboard → Logs → Auth → verificare che `refreshSession` venga chiamato periodicamente
4. Test fallimento: invalidare manualmente il refresh token su Supabase → la prossima modifica deve fallire con 401 esplicito → l'utente rifà login → funziona

**Stato:** ☐ Da completare

---

## FASE 6 — RLS LATO API ROUTE (ELIMINAZIONE SERVICE_ROLE)

**Obiettivo:** le API route usano il JWT Supabase dell'utente (RLS attiva a livello database). `service_role` viene eliminato dal lato client. `getAdminClient` non fa più fallback.

**Dipendenze:** FASE 5.5 completata e verificata (JWT refresh token flow implementato).

**Modifiche database:**
6.1. Verificare che tutte le tabelle FASE C abbiano RLS con `user_id = auth.uid()` (da Fase 1).
6.2. Verificare che il bridge NextAuth → Supabase Auth (`signInWithIdToken` in `auth-options.ts`) produca un JWT valido per ogni utente.

**File modificati:**
- `src/lib/supabase-admin.ts`
  - `getAdminClient` diventa: usa SEMPRE il JWT Supabase dalla sessione NextAuth. Nessun fallback service_role. Nessun fallback anon key.
  - Se il JWT manca o è scaduto → ritorna `{ supabase: null, email: null }` e l'API route risponde 401.
  - Il JWT Supabase **deve essere refreshato** se scaduto: implementare refresh token flow (il refresh token è già salvato nella sessione NextAuth da `auth-options.ts`).
- `src/app/api/profile/route.ts`, `src/app/api/demos/route.ts`, `src/app/api/label-data/route.ts`, `src/app/api/pitches/route.ts`, `src/app/api/releases/route.ts`
  - Tutte le route usano `getAdminClient()` con JWT. Le query non hanno più bisogno di `.eq("user_id", ...)` esplicito (RLS lo fa a livello database).
  - Le route admin-only (`/api/admin/push-rankings`) continuano a usare service_role (è l'unico caso legittimo: scrive sulla riga globale).
- `src/lib/push.ts`
  - `getAuthedSupabase` usa `getAdminClient` con JWT (non più service_role diretto)
  - `getAllSubscriptions` (usata dal cron admin) può usare service_role — verificare
- Verificare che `SUPABASE_SERVICE_ROLE_KEY` sia rimossa dalle env vars lato client (è già server-only, ma verificare che nessun codice client la legga)

**Rischi:**
- **R1 (critico):** se il JWT Supabase non viene refreshato e scade (1 ora), tutte le API route iniziano a rispondere 401. Mitigazione: implementare refresh token flow prima di questa fase. Testare con sessioni > 1 ora.
- **R2 (alto):** gli utenti con sessione NextAuth vecchia (pre-FASE D) non hanno `supabaseAccessToken` nella sessione. Mitigazione: forzare re-login di tutti gli utenti (comunicazione necessaria).
- **R3 (medio):** il bridge `signInWithIdToken` per beta-code users (non Google) potrebbe non produrre un JWT valido. Mitigazione: verificare il flusso beta-code in `auth-options.ts`; se non produce JWT, quegli utenti non possono usare l'app finché non migrano a Google login.
- **R4 (basso):** i cron job (`/api/cron/follow-up-reminders`, `/api/cron/weekly-recap`) non hanno sessione utente. Devono usare service_role. Mitigazione: i cron sono admin-side, service_role è legittimo.

**Punto di verifica:**
- `grep -r "SUPABASE_SERVICE_ROLE_KEY" src/` → risultati solo in `/api/admin/*` e `/api/cron/*` (admin/cron legittimi).
- Login → attendere > 1 ora → fare una modifica → deve funzionare (JWT refreshato).
- Login con beta-code (se supportato) → deve funzionare (JWT valido).
- Supabase Dashboard → Logs → Auth → verificare che ogni richiesta API abbia un JWT utente associato.
- Tentativo di leggere dati altrui via API diretta → 401/403 (RLS blocca).

**Stato:** ☐ Da completare

---

## FASE 7 — UNIFICAZIONE ACCESSO DATI + CLEANUP FINALE

**Obiettivo:** introdurre hook dedicati per entità, eliminare codice morto, completare la specifica (audit log, migration framework).

**Dipendenze:** FASE 6 completata e verificata.

**Modifiche database:**
7.1. Creare tabella `audit_log`:
```sql
CREATE TABLE audit_log (
  id BIGSERIAL PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id),
  action TEXT NOT NULL,  -- 'insert' | 'update' | 'delete'
  table_name TEXT NOT NULL,
  record_id TEXT,
  details JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE audit_log ENABLE ROW LEVEL SECURITY;
-- Admin can read all, users can read own
```
7.2. Aggiungere trigger PostgreSQL su `demo_submissions, label_personal_data, pitch_campaigns, user_profiles, user_releases` per popolare `audit_log`.
7.3. Verificare ed eliminare `followed_artists`:
- Eseguire `SELECT COUNT(*) FROM followed_artists;`
- Se count > 0: esportare le righe in `docs/architecture/backups/followed_artists-<date>.sql` prima di procedere
- Se count = 0: procedere direttamente
- Eseguire `DROP TABLE followed_artists;`
- Giustificazione: tabella orfana, mai referenziata nel codice applicativo (verificato in `DATABASE_CURRENT_STATE.md` sezione 2.10)
7.4. Eliminare righe legacy `app_state id='default'` (single-user backward compat):
- `DELETE FROM app_state WHERE id = 'default';`

**File modificati:**
- `src/services/profile-service.ts` (nuovo) — business service per profilo: `profileService.list()`, `profileService.upsert()`, `profileService.delete()`
- `src/services/labels-service.ts` (nuovo) — business service per label: `labelsService.list()`, `labelsService.upsert()`, `labelsService.delete()`
- `src/services/demos-service.ts` (nuovo) — business service per demo
- `src/services/pitches-service.ts` (nuovo) — business service per pitch
- `src/services/releases-service.ts` (nuovo) — business service per release
- `src/services/rankings-service.ts` (nuovo) — business service per classifiche (lettura globale)
- `src/hooks/use-profile.ts` (nuovo) — hook `useProfile()` che usa `profileService`
- `src/hooks/use-labels.ts` (nuovo) — hook `useLabels()` che usa `labelsService`
- `src/hooks/use-demo-library.ts` (nuovo) — hook `useDemoLibrary()` che usa `demosService` (nome allineato a `LABELPULSE_FINAL_ARCHITECTURE.md` sezione 6.2)
- `src/hooks/use-pitch-manager.ts` (nuovo) — hook `usePitchManager()` che usa `pitchesService`
- `src/hooks/use-releases.ts` (nuovo) — hook `useReleases()` che usa `releasesService`
- `src/hooks/use-rankings.ts` (nuovo) — hook `useRankings()` che usa `rankingsService`
- `src/components/*.tsx` — tutti i componenti migrano da `useAppStore` diretto agli hook dedicati
- `src/lib/store.ts` — **ELIMINATO COMPLETAMENTE** (Zustand rimosso, non più mantenuto in-memory). Lo stato vive negli hook dedicati con `useState` locale. (Allineato a `LABELPULSE_FINAL_ARCHITECTURE.md` sezione 8.2: "Zustand viene rimosso. Non sostituito da un altro store globale, ma da hook dedicati per dominio funzionale, ognuno con il proprio stato locale in useState.")
- `src/lib/api-client.ts` — **eliminato** (sostituito dai business service per dominio)
- Eliminare codice morto: `src/app/api/debug-profile/`, `src/app/api/debug-rankings/`, `src/app/api/debug-cloud-state/`, `src/app/api/auth-debug/`, `src/app/api/cloud-debug/` (endpoint diagnostici temporanei)
- `src/lib/db.ts` — verificare se Prisma è ancora usato (era per schema precedente); se inutilizzato, eliminare
- `prisma/` — verificare se ancora necessario; se inutilizzato, eliminare
- `package.json` — rimuovere `zustand`, `idb-keyval` dalle dipendenze (se non più usati)

**Rischi:**
- **R1 (alto):** la migrazione dei componenti a hook dedicati è il refactor più grande (tutti i componenti toccati). Mitigazione: farlo componente per componente, con verifica dopo ognuno.
- **R2 (medio):** i trigger audit log aggiungono overhead a ogni scrittura. Mitigazione: verificare performance su tabelle grandi.
- **R3 (basso):** eliminazione endpoint diagnostici riduce capacità di debug. Mitigazione: verranno reintrodotti se necessario, ma non devono restare in produzione.

**Punto di verifica:**
- `grep -r "useAppStore\." src/components/` → 0 risultati (i componenti non usano lo store direttamente).
- `grep -r "useDemos\|useLabels\|useProfile\|usePitches\|useRankings" src/components/` → risultati in tutti i componenti che mostrano quei dati.
- Supabase Dashboard → `SELECT * FROM audit_log ORDER BY created_at DESC LIMIT 20;` →记录 recenti di modifiche utente.
- Flusso completo: login → modifica demo → verifica `audit_log` → logout → login su altro device → demo modificato visibile.

**Stato:** ☐ Da completare

---

## 2. MATRICE DI DIPENDENZE

```
FASE 0 (backup database pre-migrazione)
  ↓
FASE 0.5 (security hardening — RLS indipendenti)
  ↓
FASE 1 (schema: user_id + RLS)
  ↓
FASE 2 (elimina app_state personale + sync legacy)
  ↓
FASE 3 (elimina outbox + auto-backup)
  ↓
FASE 4 (elimina Zustand persist + IDB)
  ↓
FASE 5 (boot sequenziale)
  ↓
FASE 5.5 (JWT refresh token flow)
  ↓
FASE 6 (RLS lato API route, no service_role)
  ↓
FASE 7 (unificazione access + cleanup + eliminazione Zustand)
```

Nessuna fase può essere parallelizzata. Ogni fase dipende dal punto di verifica della precedente.

---

## 3. RISCHI TRASVERSALI

Questi rischi non appartengono a una singola fase, ma attraversano l'intero refactor:

- **RT1 (critico): perdita dati durante migrazione** — se una fase intermedia lascia l'app in uno stato dove i dati vengono scritti in un posto ma letti da un altro, si perdono modifiche. Mitigazione: ogni fase ha un punto di verifica che include "modifica → logout → login → dato presente".
- **RT2 (alto): utenti beta con sessioni vecchie** — gli utenti loggati prima della Fase 6 potrebbero non avere JWT Supabase valido. Mitigazione: comunicare ai beta tester di fare re-login dopo il deploy della Fase 6.
- **RT3 (alto): downtime durante migration database** — le migration SQL (Fase 1) richiedono tempo su tabelle grandi. Mitigazione: eseguire in finestra di basso traffico, comunicare downtime.
- **RT4 (medio): regressioni in funzionalità non testate** — il refactor tocca flussi centrali. Mitigazione: dopo ogni fase, testare i flussi principali (login, add demo, edit label, edit profile, import classifiche, push classifiche admin).
- **RT5 (medio): conflitto con sviluppi paralleli** — se durante il refactor vengono fatte altre modifiche al codice, le fasi possono confliggere. Mitigazione: il refactor deve avvenire in branch dedicato, nessun altro sviluppo in parallelo.

---

## 4. CRITERI DI COMPLETAMENTO DEL PIANO

Il piano è completato solo se **tutte** queste condizioni sono vere:

1. Tutte le 9 fasi (0, 0.5, 1, 2, 3, 4, 5, 5.5, 6, 7) hanno stato "completato" con punto di verifica superato.
2. `grep -r "localStorage\|IndexedDB\|idb-keyval\|persist\|outbox\|auto-backup\|saveSnapshot\|zustand\|useAppStore" src/ | grep -v "__tests__\|//\|/\*"` → 0 risultati (esclusi flag di config/auth documentati).
3. `grep -r "SUPABASE_SERVICE_ROLE_KEY" src/ | grep -v "admin\|cron"` → 0 risultati.
4. `grep -r "app_state" src/lib/supabase.ts | grep -v "global\|//"` → 0 risultati (nessun riferimento alla riga personale).
5. Supabase Dashboard → tutte le tabelle FASE C hanno colonna `user_id` popolata, RLS con `auth.uid()`, policy per SELECT/INSERT/UPDATE/DELETE.
6. Test cross-device: modifica su device A → login su device B → dato identico. Ripetuto per: demo, label personal data, profilo, pitch, release, preferiti.
7. Test offline: disconnettere rete → tentare modifica → errore esplicito → nessun dato salvato localmente.
8. Test multi-user: login utente A → logout → login utente B sullo stesso device → B non vede dati di A.
9. Audit log popolato per ogni modifica.
10. Endpoint diagnostici temporanei eliminati.
11. `followed_artists` eliminata (verificare `SELECT EXISTS (SELECT FROM pg_tables WHERE tablename = 'followed_artists');` → false).
12. Zustand eliminato completamente (`grep -r "zustand" src/ package.json | grep -v node_modules` → 0 risultati).
13. Business service per dominio creati (`src/services/*-service.ts` esistono per: profile, labels, demos, pitches, releases, rankings).
14. Hook per dominio creati (`src/hooks/use-*.ts` esistono per: profile, labels, demo-library, pitch-manager, releases, rankings).

---

## 5. NOTE OPERATIVE

- **Branch dedicato:** tutto il refactor avviene su branch `refactor/cloud-first-v1`. Il `main` resta stabile finché il piano non è completato.
- **Tag baseline:** `labelpulse-pre-refactor-v1` punta all'ultimo commit di `main` prima del refactoring (punto di rollback).
- **Comunicazione beta tester:** prima della Fase 6, comunicare ai beta tester che dovranno fare re-login.
- **Finestra di manutenzione:** le fasi che modificano il database (1, 7) vanno eseguite in finestra di basso traffico.
- **Rollback:** se una fase fallisce e il rollback è necessario, si fa `git revert` del commit della fase + ripristino del backup database (dalla Fase 0). Non si accumulano fix.
- **Protocollo di esecuzione:** il Lead Developer attende l'autorizzazione esplicita del Project Owner prima di iniziare ogni fase. Dopo ogni fase, il Lead Developer si ferma e attende l'approvazione prima di procedere alla fase successiva. Nessuna fase può iniziare automaticamente.

---

**Fine del piano.**

Questo documento è vincolante. Prima di ogni modifica futura al codice, il piano deve essere seguito fase per fase. Nessuna fase può essere saltata. Nessuna modifica al codice al di fuori del piano è ammessa durante il refactor.
