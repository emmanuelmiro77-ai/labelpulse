# LABELPULSE MIGRATION SAFETY REPORT

Documento di analisi del rischio di perdita dati per il `LABELPULSE_REFACTORING_PLAN_v1.0`.

**Principio fondamentale:** nessun dato utente può essere perso durante il refactoring. Se una fase presenta anche un minimo rischio, deve essere evidenziata chiaramente.

---

## 0. INVENTARIO DATI PRE-MIGRAZIONE

### 0.1 Dati su Supabase (cloud, fonte di verità attuale)

| Tabella | Chiave | Contenuto | Volume stimato |
|---------|--------|-----------|----------------|
| `app_state` riga `id='global'` | id | Classifiche Beatport, label globali, artisti, snapshots | ~2.37 MB (1821 labels, 18 snapshots) |
| `app_state` riga `id='<email>'` | id | Blob JSON: labels personalizzate, demos, releases, savedPitches, sentCampaigns, userProfile, gmailAuth, rankingSnapshots, artists | ~2.60 MB per utente (2123 labels, 311 custom) |
| `demo_submissions` | user_email + id | Demo utente (6 righe per utente attivo) | Basso |
| `label_personal_data` | user_email + label_id | Contatti/note/link per-label (671 righe per utente attivo) | Medio |
| `pitch_campaigns` | user_email + id | Pitch bozze + inviate | Basso (0 per utente attivo) |
| `user_profiles` | user_email (PK) | Profilo utente (artist_name, bio, photo, sc_link, links) | 1 riga per utente |
| `user_releases` | user_email + id | EP/release utente | Basso (0 per utente attivo) |
| `push_subscriptions` | user_email + endpoint | Notifiche push per device | 1+ righe per utente |
| `beta_feedback` | — | Feedback beta tester | Basso |
| `beta_access_codes` | — | Codici accesso beta | Basso |
| `beatport_snapshots`, `beatport_chart_history`, `followed_artists` | — | Dati scraping globali | Medio |

### 0.2 Dati su localStorage (browser, da eliminare)

| Chiave | Contenuto | Tipo |
|--------|-----------|------|
| `labelpulse-storage` | Mirror Zustand persist (demos, releases, pitches, profile, gmailAuth, snapshots) | Dato utente duplicato |
| `labelpulse-storage-backup` | Backup primario | Dato utente duplicato |
| `labelpulse-snapshots-backup` | Sidecar rankingSnapshots | Dato utente duplicato |
| `labelpulse-profile-backup` | Sidecar userProfile | Dato utente duplicato |
| `labelpulse-artists-backup` | Sidecar artists (max 200) | Dato globale duplicato |
| `labelpulse-storage-owner` | Email owner per multi-user isolation | Config |
| `labelpulse-outbox-v2` | Coda scritture fallite | Dato utente temporaneo |
| `labelpulse-snapshot-<email>` | Auto-backup snapshot completo | Dato utente duplicato |
| `labelpulse-onboarded-v2:<email>` | Flag onboarding | Config |
| `labelpulse-cookie-consent` | Preferenza cookie | Config |
| `beta_admin_token` | Token auth admin | Auth |

### 0.3 Dati su IndexedDB (browser, da eliminare)

| Database | Contenuto | Tipo |
|----------|-----------|------|
| `keyval-store` (idb-keyval) | Mirror Zustand persist + snapshot auto-backup + outbox v2 | Dato utente duplicato |
| `labelpulse-artists` | ~3400 artisti / ~9MB | Dato globale duplicato |
| `auto-save` | File JSON auto-save locale | Dato utente duplicato |

### 0.4 Dati su auth.users (Supabase Auth)

| Fonte | Contenuto |
|-------|-----------|
| `auth.users` | Utenti registrati via Google (emmanuel.miro77@gmail.com + beta tester) |

**Critico:** `auth.users.id` (UUID) è la chiave che verrà usata come `user_id` nelle tabelle migrate. Ogni `user_email` nelle tabelle FASE C deve avere un corrispondente `auth.users.email`.

---

## 1. ANALISI PER FASE

Per ogni fase del piano di refactoring:
- **Dati toccati** — cosa viene letto/scritto/eliminato
- **Rischio perdita** — nessuno / basso / medio / alto / critico
- **Prevenzione** — come si evita la perdita
- **Rollback** — come ripristinare se qualcosa va male
- **Verifica** — come confermare che nessun dato è perso

---

## FASE 0 — SNAPSHOT PRE-MIGRAZIONE

### Dati toccati
Nessuno. Fase di sola lettura e backup.

### Rischio perdita dati
**Nessuno** (la fase stessa è la prevenzione).

### Prevenzione
Questa fase CREA il backup di rollback per tutte le fasi successive. Comprende:
1. Export JSON da LabelPulse (`Scarica backup JSON`) — contiene labels, demos, userProfile, rankingSnapshots
2. Export `app_state` da Supabase SQL Editor (CSV/JSON) — riga globale + righe personali
3. Export tabelle FASE C da Supabase (CSV/JSON per ognuna)
4. Tag git `pre-refactor-v1.0`

### Rollback
N/A (la fase è il rollback).

### Verifica
- Il file JSON di backup esiste e contiene conteggi coerenti (labels > 1000, demos > 0, userProfile con email)
- Il tag git esiste: `git tag | grep pre-refactor-v1.0`
- 6 export Supabase esistono (app_state + 5 tabelle FASE C)
- Aprire il JSON di backup e verificare che `data.demos[0]` abbia `id`, `labelId`, `trackName` non vuoti

**Esito:** ☐ Verificato

---

## FASE 1 — MIGRAZIONE SCHEMA DATABASE (user_id + RLS)

### Dati toccati
- **Letto:** tutte le righe di `demo_submissions, label_personal_data, pitch_campaigns, user_profiles, user_releases` (per popolare `user_id`)
- **Letto:** `auth.users` (per il join `user_email → id`)
- **Scritto:** nuova colonna `user_id` su 5 tabelle, nuovi indici, nuove policy RLS
- **Non eliminato:** nulla in questa fase

### Rischio perdita dati
**Medio** — il rischio non è perdita diretta, ma righe orfane (email non più in `auth.users`).

### Prevenzione
1. **Colonna nullable** — `user_id` viene aggiunta come `UUID` nullable (nessun `NOT NULL` iniziale). Le righe esistenti non vengono rifiutate.
2. **Popolamento conservativo** — il join `user_email → auth.users.email` viene fatto per tutte le righe. Le righe senza match vengono **messe in una tabella `_orphans`** (creata appositamente), non eliminate.
3. **Solo dopo popolamento** si aggiunge `NOT NULL` (se tutte le righe hanno `user_id`) o si lascia nullable con vincolo CHECK che accetta NULL solo per righe orfane documentate.
4. **Indici paralleli** — i nuovi indici su `user_id` vengono creati prima di rimuovere i vecchi indici su `user_email`.
5. **Policy RLS** — le nuove policy con `auth.uid()` vengono aggiunte PRIMA di rimuovere le vecchie. C'è una finestra di transizione dove entrambe le policy coesistono.

### Rischio specifico — righe orfane
Se un utente ha dati in `demo_submissions` con `user_email = 'old@email.com'` ma quell'email non esiste più in `auth.users` (utente cancellato, email cambiata), la riga non può ricevere `user_id`. Queste righe:
- Vengono copiate in `_orphans` (stessa struttura + colonna `original_table`, `original_email`)
- Restano nella tabella originale con `user_id = NULL`
- Vengono segnalate per revisione manuale
- **Non vengono eliminate**

### Rollback
```sql
-- Rimuovere nuove policy
DROP POLICY IF EXISTS "...new..." ON demo_submissions; -- (e altre 4 tabelle)
-- Ripristinare vecchie policy (dal backup Fase 0)
-- (vedi export SQL della Fase 0)
-- Rimuovere colonna user_id
ALTER TABLE demo_submissions DROP COLUMN user_id; -- (e altre 4 tabelle)
-- Eliminare tabella _orphans
DROP TABLE _orphans;
```
Il tag git `pre-refactor-v1.0` permette di tornare al codice pre-Fase 1.

### Verifica
1. Contare righe totali prima e dopo:
   ```sql
   SELECT 'demo_submissions' as t, COUNT(*) FROM demo_submissions
   UNION ALL SELECT 'label_personal_data', COUNT(*) FROM label_personal_data
   UNION ALL SELECT 'pitch_campaigns', COUNT(*) FROM pitch_campaigns
   UNION ALL SELECT 'user_profiles', COUNT(*) FROM user_profiles
   UNION ALL SELECT 'user_releases', COUNT(*) FROM user_releases;
   ```
   I conteggi devono essere **identici** a quelli pre-migrazione (dal backup Fase 0).
2. Contare righe orfane:
   ```sql
   SELECT COUNT(*) FROM _orphans;
   ```
   Documentare il numero. Ogni riga orfana deve essere revisionata (non è perdita, è dato non attribuibile).
3. Verificare `user_id` popolato:
   ```sql
   SELECT COUNT(*) FROM demo_submissions WHERE user_id IS NOT NULL;
   ```
   Deve essere uguale al totale meno gli orfani.
4. Verificare RLS attiva con `set role anon` — deve restituire 0 righe (anon non vede nulla senza JWT).

**Esito:** ☐ Verificato

---

## FASE 2 — ELIMINAZIONE app_state PERSONALE + SYNC LEGACY

### Dati toccati
- **Letto:** `app_state` riga globale (`id='global'`) — resta
- **Bloccato in scrittura:** `app_state` riga personale (`id='<email>'`) — RLS la rende inaccessibile in scrittura
- **Eliminato (codice):** funzioni `saveStateToCloud`, `loadStateFromCloud`, `syncToCloud`, `forceCloudSync` — ma i dati nel DB non vengono eliminati
- **Non eliminato:** la riga `app_state id='<email>'` resta fisicamente nel DB (per rollback)

### Rischio perdita dati
**Alto** — se `loadFromNewTables` non carica tutti i dati che erano nella riga personale, quei dati diventano inaccessibili (anche se non eliminati fisicamente).

### Prevenzione
1. **Prima di eliminare il codice**, verificare che `loadFromNewTables` carichi TUTTI i tipi di dato che erano nella riga personale:
   - demos → `demo_submissions` ✓
   - label personal data → `label_personal_data` ✓
   - pitches → `pitch_campaigns` ✓
   - profile → `user_profiles` ✓
   - releases → `user_releases` ✓
   - rankingSnapshots → riga globale `app_state id='global'` ✓
   - gmailAuth → **verificare** se ha una tabella dedicata o se deve essere gestito diversamente
   - artists → tabella globale o dedicata (verificare)
2. **Confronto dati** — prima di rimuovere `loadStateFromCloud`, eseguire un test:
   - Login → carica stato via `loadStateFromCloud` (vecchio flusso) → salva snapshot A
   - Logout → login → carica stato via `loadFromNewTables` (nuovo flusso) → salva snapshot B
   - Confrontare A vs B: `demos.length`, `labels.filter(l => l.emails.length > 0).length`, `userProfile.artistName`, `rankingSnapshots.length`
   - Se i conteggi differiscono, **fermarsi** e investigare
3. **La riga `app_state id='<email>'` non viene eliminata** in questa fase. Resta come backup dormiente. Verrà eliminata solo in Fase 7 (dopo verifica completa).

### Rischio specifico — gmailAuth e dati non tabellati
Se `gmailAuth` (token Gmail OAuth) viveva solo nella riga `app_state` personale e non ha una tabella dedicata, eliminare `loadStateFromCloud` perde l'accesso Gmail dell'utente. **Da verificare prima della fase.**

### Rollback
- Codice: `git revert` del commit Fase 2
- Database: la riga `app_state id='<email>'` è ancora presente (non eliminata), ripristinando il codice si riattiva la lettura

### Verifica
1. Login → verificare che tutti i dati siano presenti (demo, label personalizzate, profilo, pitch, release, classifiche)
2. Confronto numerico:
   - `demos.length` deve essere uguale a quanto visto prima della Fase 2
   - `labels.filter(l => l.emails.length > 0 || l.notes !== '').length` deve essere uguale
   - `userProfile.artistName` deve essere uguale
3. Supabase Dashboard → `SELECT updated_at FROM app_state WHERE id='<email>';` — il timestamp **non** si aggiorna dopo modifiche utente (la riga è dormiente)
4. Modificare un demo → verificare che compaia in `demo_submissions` (non in `app_state`)

**Esito:** ☐ Verificato

---

## FASE 3 — ELIMINAZIONE OUTBOX + AUTO-BACKUP

### Dati toccati
- **Eliminato (codice):** `src/lib/outbox.ts`, `src/lib/auto-backup.ts`
- **Eliminato (IndexedDB):** `labelpulse-outbox-v2` (coda scritture fallite), `labelpulse-snapshot-<email>` (snapshot auto-backup)
- **Non eliminato:** nessun dato su Supabase

### Rischio perdita dati
**Alto** — due rischi distinti:

**Rischio 3A: scritture pendenti in outbox**
Se l'outbox contiene scritture non ancora sincronizzate al cloud (rete assente al momento della scrittura), eliminare l'outbox le perde definitivamente.

**Rischio 3B: snapshot auto-backup con dati non sincronizzati**
Se l'auto-backup ha snapshot più recenti del cloud (modifica fatta offline, poi app chiusa prima del sync), eliminare l'auto-backup le perde.

### Prevenzione
1. **Prima di eliminare l'outbox** — flush forzato:
   - Aprire LabelPulse su OGNI device connesso
   - Verificare "In coda verso cloud" = 0 nella diagnostica
   - Se > 0: aspettare che la coda si svuoti (rete attiva, retry automatico ogni 15s)
   - Solo quando tutti i device mostrano 0, procedere con la Fase 3
2. **Prima di eliminare l'auto-backup** — verifica coerenza:
   - Per ogni utente, confrontare l'ultimo snapshot auto-backup con il cloud
   - Se lo snapshot ha dati più recenti del cloud, sincronizzarli manualmente prima di procedere
3. **Backup IndexedDB** — prima di eliminare, esportare il contenuto di `labelpulse-outbox-v2` e `labelpulse-snapshot-<email>` su file JSON (DevTools → Application → IndexedDB → export)
4. **Eliminazione graduale** — il codice smette di SCRIVERE su outbox/auto-backup prima di eliminare i dati esistenti. I dati residui vengono letti finché non sono vuoti, poi eliminati.

### Rischio specifico — device offline prolungato
Se un beta tester ha usato l'app offline per giorni e ha accumulato modifiche nell'outbox, quelle modifiche sono a rischio. **Comunicazione necessaria ai beta tester:** "prima della data X, aprite l'app con rete attiva e aspettate che la coda sia vuota".

### Rollback
- Codice: `git revert` del commit Fase 3
- IndexedDB: ripristinare dall'export JSON fatto in Prevenzione punto 3 (import manuale)
- Supabase: nessun dato toccato, nessun ripristino necessario

### Verifica
1. `grep -r "outbox\|auto-backup\|saveSnapshot\|flushSnapshot\|writeWithOutbox" src/` → 0 risultati
2. DevTools → Application → IndexedDB → nessun `labelpulse-outbox-v2`, nessun `labelpulse-snapshot-*`
3. Login → modifica un demo con rete attiva → il demo è in `demo_submissions` (verificare su Supabase Dashboard)
4. Simulare offline (DevTools → Network → Offline) → modificare un demo → **errore esplicito** → il demo NON è in stato locale → riattivare rete → il demo NON è in Supabase (modifica non salvata, come richiesto dalla specifica)
5. Verificare che il numero di demo/label/pitch su Supabase sia **uguale** a prima della Fase 3

**Esito:** ☐ Verificato

---

## FASE 4 — ELIMINAZIONE ZUSTAND PERSIST + IDB STORAGE

### Dati toccati
- **Eliminato (codice):** `persist` middleware, `idbStorage`, `robustStorage`, tutti i sidecar helper
- **Eliminato (codice):** `src/lib/artists-idb.ts`
- **Eliminato (IndexedDB):** `keyval-store` (mirror Zustand), `labelpulse-artists` (~9MB artisti)
- **Eliminato (localStorage):** `labelpulse-storage`, `labelpulse-storage-backup`, `labelpulse-snapshots-backup`, `labelpulse-profile-backup`, `labelpulse-artists-backup`, `labelpulse-storage-owner`
- **Non eliminato:** dati su Supabase

### Rischio perdita dati
**Alto** — due rischi:

**Rischio 4A: artists su IndexedDB non sincronizzati**
Gli artisti (~3400, ~9MB) vivono su IndexedDB e in `app_state` riga `<email>_artists`. Se non sono sincronizzati al cloud, eliminarli da IndexedDB li perde.

**Rischio 4B: flag di config/auth in localStorage**
`labelpulse-onboarded-v2:<email>`, `labelpulse-cookie-consent`, `beta_admin_token` sono in localStorage. Eliminarli potrebbe resettare onboarding/preferenze.

### Prevenzione
1. **Prima di eliminare gli artists IndexedDB**:
   - Verificare che `saveArtistsToCloud` abbia sincronizzato tutti gli artisti alla riga `app_state id='<email>_artists'` (o tabella dedicata)
   - Confrontare: `loadArtistsFromIDB().length` vs count su Supabase
   - Se differiscono, sincronizzare prima
   - **Se non esiste una tabella dedicata per gli artists** (solo riga app_state), valutare se creare `user_artists` tabella FASE C prima di questa fase
2. **Flag di config/auth** — decisione da prendere:
   - **Opzione conservativa (consigliata):** mantenere `labelpulse-onboarded-v2:<email>`, `labelpulse-cookie-consent`, `beta_admin_token`, `next-auth.session-token` in localStorage. Non sono dati utente, sono flag di config/auth. La specifica vieta "localStorage persistente" per dati utente, non per flag di config.
   - **Opzione rigorosa:** migrare anche i flag a una tabella `user_preferences` su Supabase. Più costoso, ma totalmente conforme.
3. **Backup localStorage** — prima di eliminare, esportare tutti i `labelpulse-*` keys su file JSON (DevTools → Application → Local Storage → export)
4. **Verifica post-eliminazione** — dopo aver rimosso il persist, fare login e verificare che TUTTI i dati siano caricati dal cloud (non da cache locale)

### Rischio specifico — perdita artists se non sincronizzati
Se gli artists non sono mai stati sincronizzati al cloud (es. utente ha fatto scrape ma `saveArtistsToCloud` ha fallito), sono **solo su IndexedDB**. Eliminare IndexedDB = perdere 3400 artisti. **Verifica obbligatoria prima della fase.**

### Rollback
- Codice: `git revert` del commit Fase 4
- localStorage/IndexedDB: ripristinare dall'export JSON fatto in Prevenzione punto 3
- Supabase: nessun dato toccato

### Verifica
1. `grep -r "persist\|createJSONStorage\|idb-keyval\|idbStorage" src/ | grep -v "__tests__\|//"` → 0 risultati
2. DevTools → Application → IndexedDB → solo database non-LabelPulse (o vuoto)
3. DevTools → Application → Local Storage → solo flag di config/auth (se opzione conservativa)
4. Login → tutti i dati presenti (demo, label, profile, pitch, release, classifiche, artists)
5. **Verifica artists:** il numero di artists visibili nell'Artist Explorer deve essere uguale a prima della Fase 4
6. Refresh pagina → loading visibile → poi dati dal cloud (non flash di dati locali)
7. Logout → login con altro utente → nessun dato del precedente utente

**Esito:** ☐ Verificato

---

## FASE 5 — BOOT FLOW SEQUENZIALE + TIMEOUT RIMOSSO

### Dati toccati
- **Nessun dato eliminato** — solo refactor del flusso di boot
- **Letto:** riga globale `app_state` + tabelle FASE C (sequenziale, non parallelo)

### Rischio perdita dati
**Basso** — la fase modifica solo il codice di boot, non i dati. Ma c'è un rischio indiretto.

### Rischio specifico — dati non caricati se il fetch fallisce
Se il cloud sync fallisce (Supabase down, rete assente), senza timeout e senza fallback snapshot, l'utente vede errore. Ma **nessun dato viene perso** — è solo temporaneamente inaccessibile. Al prossimo login riuscito, i dati tornano visibili.

### Prevenzione
1. La UI di errore deve avere un pulsante "Riprova" che ri-esegue il boot
2. La UI di loading deve mostrare progress ("Caricamento classifiche... Caricamento demo...") per evitare che l'utente pensi che l'app sia bloccata
3. **Non ci sono scritture durante il boot** — solo letture. Nessun rischio di sovrascrittura.

### Rollback
- Codice: `git revert` del commit Fase 5
- Database: nessuna modifica

### Verifica
1. Login → loading → dati presenti
2. Simulare Supabase down (block request) → login → errore esplicito → nessun dato stale
3. Riattivare Supabase → "Riprova" → dati presenti
4. Modifica su device A → login su device B → device B mostra la modifica
5. Il numero di demo/label/pitch/profile deve essere uguale a prima della Fase 5

**Esito:** ☐ Verificato

---

## FASE 6 — RLS LATO API ROUTE (ELIMINAZIONE SERVICE_ROLE)

### Dati toccati
- **Non eliminato:** nessun dato
- **Modificato (codice):** `getAdminClient` usa solo JWT utente, nessun fallback service_role
- **Letto:** `auth.users` per validazione JWT

### Rischio perdita dati
**Basso per perdita diretta, medio per accesso negato**

### Rischio specifico — JWT scaduto non refreshato
Se il JWT Supabase scade (1 ora) e non viene refreshato, tutte le API route rispondono 401. L'utente non può leggere/scrivere. Ma **nessun dato viene perso** — è temporaneamente inaccessibile.

### Rischio specifico — sessioni NextAuth vecchie
Utenti loggati prima della Fase 6 potrebbero non avere `supabaseAccessToken` nella sessione. Per questi utenti, tutte le API route rispondono 401 finché non fanno re-login.

### Prevenzione
1. **Implementare refresh token flow PRIMA della Fase 6** — il refresh token è già in sessione NextAuth (da `auth-options.ts` riga 161), va solo usato per refreshare l'access token scaduto
2. **Comunicazione beta tester** — prima del deploy della Fase 6, comunicare che dovranno fare re-login
3. **Graceful degradation** — se il JWT manca, l'API route risponde 401 con messaggio chiaro "Sessione scaduta, rifai login", non un 500 generico
4. **I cron job e le route admin continuano a usare service_role** — sono legittimi (admin-side, non user-side)

### Rollback
- Codice: `git revert` del commit Fase 6
- Database: nessuna modifica
- Sessioni: gli utenti potrebbero dover fare re-login anche dopo il rollback (perché il codice vecchio potrebbe non riconoscere la sessione nuova)

### Verifica
1. Login → attendere > 1 ora → fare una modifica → deve funzionare (JWT refreshato)
2. Verificare che nessuna route utente (non admin/cron) usi `SUPABASE_SERVICE_ROLE_KEY`:
   ```bash
   grep -r "SUPABASE_SERVICE_ROLE_KEY" src/ | grep -v "admin\|cron"
   ```
   → 0 risultati
3. Tentare di leggere dati altrui via API diretta → 401/403 (RLS blocca)
4. Il numero di demo/label/pitch/profile deve essere uguale a prima della Fase 6
5. Supabase Dashboard → Logs → Auth → ogni richiesta ha un JWT utente

**Esito:** ☐ Verificato

---

## FASE 7 — UNIFICAZIONE ACCESSO DATI + CLEANUP FINALE

### Dati toccati
- **Eliminato (codice):** endpoint diagnostici temporanei (`/api/debug-profile`, `/api/debug-rankings`, `/api/debug-cloud-state`, `/api/auth-debug`, `/api/cloud-debug`)
- **Eliminato (codice):** `src/lib/db.ts` se Prisma inutilizzato, `prisma/` se inutilizzato
- **Eliminato (database):** `app_state` righe personali `id='<email>'` (ora dormienti dalla Fase 2) — **solo dopo verifica completa**
- **Creato (database):** tabella `audit_log` + trigger

### Rischio perdita dati
**Alto** — l'eliminazione delle righe `app_state id='<email>'` è l'unica eliminazione di dati del piano. Deve essere fatto solo dopo verifica assoluta.

### Prevenzione
1. **Prima di eliminare le righe `app_state id='<email>'`**:
   - Verificare che TUTTI i dati siano stati migrati alle tabelle FASE C:
     ```sql
     -- Per ogni utente, confrontare
     SELECT 
       (SELECT COUNT(*) FROM demo_submissions WHERE user_email = '<email>') as demos_fase_c,
       (SELECT (data->'demos')::jsonb->>'length'::int FROM app_state WHERE id = '<email>') as demos_app_state,
       ...
     ```
   - I conteggi devono essere identici per ogni tipo di dato
2. **Backup finale delle righe `app_state id='<email>'`** prima dell'eliminazione:
   ```sql
   SELECT * FROM app_state WHERE id != 'global' INTO 'backup_app_state_personal_<date>';
   ```
3. **Eliminazione graduale** — non eliminare tutte le righe in una volta. Eliminare una riga per utente, verificare che l'utente non perda dati, poi procedere con la successiva
4. **Conservare il backup `backup_app_state_personal_<date>` per 30 giorni** prima di eliminarlo definitivamente

### Rischio specifico — dati in `app_state` non presenti nelle tabelle FASE C
Se alcuni dati (es. `gmailAuth`, `artists`, `rankingSnapshots` personali) erano nella riga `app_state` ma non hanno una tabella FASE C dedicata, eliminarli = perderli. **Verifica obbligatoria prima dell'eliminazione.**

### Rollback
- Codice: `git revert` del commit Fase 7
- Database: ripristinare da `backup_app_state_personal_<date>`:
   ```sql
   INSERT INTO app_state SELECT * FROM backup_app_state_personal_<date>;
   ```

### Verifica
1. Per ogni utente attivo, confrontare i conteggi pre e post:
   - demos: `demo_submissions` count uguale a `app_state.data.demos.length`
   - label personal data: `label_personal_data` count uguale a `app_state.data.labels.filter(l => l.emails || l.notes || l.isCustom).length`
   - pitches: `pitch_campaigns` count uguale a `app_state.data.savedPitches.length + sentCampaigns.length`
   - profile: `user_profiles` row esiste con stessi dati di `app_state.data.userProfile`
   - releases: `user_releases` count uguale a `app_state.data.releases.length`
2. `audit_log` popolata dopo modifiche di test
3. `grep -r "useAppStore\." src/components/` → 0 risultati (componenti usano hook dedicati)
4. Endpoint diagnostici eliminati: `curl /api/debug-profile` → 404
5. Test cross-device completo: modifica su device A → login su device B → dato identico

**Esito:** ☐ Verificato

---

## 2. TABELLA FINALE — MAPPATURA DATI

| Tabella attuale | Tabella finale | Dati migrati | Dati eliminati | Motivo eliminazione |
|-----------------|----------------|--------------|----------------|---------------------|
| `app_state` riga `id='global'` | `app_state` riga `id='global'` (invariata) | Nessuno (resta dov'è) | Nessuno | — |
| `app_state` riga `id='<email>'` | (eliminata in Fase 7) | demos → `demo_submissions`; labels personalizzate → `label_personal_data`; pitches → `pitch_campaigns`; profile → `user_profiles`; releases → `user_releases`; rankingSnapshots → riga globale | Riga JSON blob personale (dopo verifica migrazione completa) | Doppia fonte di verità eliminata — i dati vivono nelle tabelle dedicate |
| `demo_submissions` | `demo_submissions` (con `user_id` aggiunto) | `user_id` popolato da join con `auth.users` | Nessuno | — |
| `label_personal_data` | `label_personal_data` (con `user_id`) | `user_id` popolato | Nessuno | — |
| `pitch_campaigns` | `pitch_campaigns` (con `user_id`) | `user_id` popolato | Nessuno | — |
| `user_profiles` | `user_profiles` (con `user_id`) | `user_id` popolato | Nessuno | — |
| `user_releases` | `user_releases` (con `user_id`) | `user_id` popolato | Nessuno | — |
| `push_subscriptions` | `push_subscriptions` (invariata) | Nessuno | Nessuno | — |
| `beta_feedback` | `beta_feedback` (invariata) | Nessuno | Nessuno | — |
| `beta_access_codes` | `beta_access_codes` (invariata) | Nessuno | Nessuno | — |
| `beatport_snapshots` | `beatport_snapshots` (invariata) | Nessuno | Nessuno | — |
| `beatport_chart_history` | `beatport_chart_history` (invariata) | Nessuno | Nessuno | — |
| `followed_artists` | `followed_artists` (invariata) | Nessuno | Nessuno | — |
| (nessuna) | `audit_log` (nuova, Fase 7) | Nuova tabella | Nessuno | Conformità specifica sezione 12 |
| `_orphans` (nuova, temporanea) | (eliminata dopo revisione manuale) | Righe con `user_email` non più in `auth.users` | Righe orfane dopo revisione | Dati non attribuibili a utente esistente |
| localStorage `labelpulse-storage` | (eliminata) | Dati erano duplicati di Supabase | Mirror Zustand persist | Doppia fonte di verità eliminata |
| localStorage `labelpulse-storage-backup` | (eliminata) | Dati erano duplicati | Backup localStorage | Doppia fonte di verità eliminata |
| localStorage `labelpulse-snapshots-backup` | (eliminata) | rankingSnapshots sono in riga globale | Sidecar snapshots | Doppia fonte di verità eliminata |
| localStorage `labelpulse-profile-backup` | (eliminata) | Profile è in `user_profiles` | Sidecar profile | Doppia fonte di verità eliminata |
| localStorage `labelpulse-artists-backup` | (eliminata) | Artists sono in cloud (verificare tabella) | Sidecar artists | Doppia fonte di verità eliminata |
| localStorage `labelpulse-outbox-v2` | (eliminata) | Scritture sincronizzate prima della Fase 3 | Coda scritture (dopo sync) | Logica offline eliminata |
| localStorage `labelpulse-snapshot-<email>` | (eliminata) | Dati erano duplicati di Supabase | Auto-backup snapshot | Doppia fonte di verità eliminata |
| localStorage `labelpulse-storage-owner` | (eliminata) | Config multi-user | Flag owner | RLS garantisce isolamento |
| localStorage `labelpulse-onboarded-v2:<email>` | (mantenuta, vedere Fase 4) | N/A | Nessuno (se opzione conservativa) | Flag config, non dato utente |
| localStorage `labelpulse-cookie-consent` | (mantenuta) | N/A | Nessuno | Preferenza, non dato utente |
| localStorage `beta_admin_token` | (mantenuta) | N/A | Nessuno | Auth, non dato utente |
| IndexedDB `keyval-store` | (eliminata) | Dati erano duplicati di Supabase | Mirror Zustand persist | Doppia fonte di verità eliminata |
| IndexedDB `labelpulse-artists` | (eliminata) | Artists sincronizzati al cloud prima della Fase 4 | Cache artists locale | Doppia fonte di verità eliminata |
| IndexedDB `auto-save` | (eliminata) | N/A | File auto-save locale | Funzionalità auto-save eliminata (verificare con utente) |
| `auth.users` | `auth.users` (invariata) | Nessuno | Nessuno | — |

---

## 3. RISCHI TRASVERSALI DI PERDITA DATI

Rischi che attraversano più fasi:

### RT1 (critico) — Artists non sincronizzati al cloud
Gli artists (~3400, ~9MB) vivono su IndexedDB + riga `app_state id='<email>_artists'`. Se non sono sincronizzati, la Fase 4 (eliminazione IndexedDB) li perde.
- **Fasi interessate:** Fase 4
- **Prevenzione:** prima della Fase 4, verificare che `loadArtistsFromIDB().length` === count su Supabase. Se diverso, sincronizzare. Se non esiste una tabella dedicata, crearla prima.
- **Verifica:** il numero di artists nell'Artist Explorer deve essere invariato dopo la Fase 4.

### RT2 (alto) — Outbox con scritture pendenti
Se un beta tester ha modifiche nell'outbox non sincronizzate, la Fase 3 le perde.
- **Fasi interessate:** Fase 3
- **Prevenzione:** comunicazione ai beta tester + verifica "In coda verso cloud" = 0 su tutti i device prima della Fase 3.
- **Verifica:** dopo la Fase 3, il numero di demo/label/pitch su Supabase è invariato.

### RT3 (alto) — gmailAuth non tabellato
Se `gmailAuth` (token Gmail OAuth) viveva solo nella riga `app_state` personale, eliminare la riga in Fase 7 perde l'accesso Gmail.
- **Fasi interessate:** Fase 2 (codice), Fase 7 (dati)
- **Prevenzione:** prima della Fase 2, verificare se `gmailAuth` ha una tabella dedicata. Se no, crearla o migrare il token a `user_profiles`.
- **Verifica:** dopo la Fase 2, l'utente può ancora inviare email Gmail se era connesso.

### RT4 (medio) — Riga `app_state id='<email>'` eliminata prematuramente
Se la Fase 7 elimina le righe personali prima che tutti i dati siano verificati come migrati, si perde l'ultimo backup.
- **Fasi interessate:** Fase 7
- **Prevenzione:** eliminazione graduale (un utente alla volta), backup su `backup_app_state_personal_<date>`, conservazione 30 giorni.
- **Verifica:** per ogni utente, conteggi FASE C === conteggi app_state prima dell'eliminazione.

### RT5 (medio) — Righe orfane (user_email non in auth.users)
Righe con email non più valide non ricevono `user_id`. Vanno in `_orphans`.
- **Fasi interessate:** Fase 1
- **Prevenzione:** tabella `_orphans`, nessuna eliminazione, revisione manuale.
- **Verifica:** `SELECT COUNT(*) FROM _orphans` documentato, ogni riga revisionata.

---

## 4. PROTOCOLLO DI ROLLBACK GLOBALE

Se il refactor fallisce a qualsiasi fase e si decide di tornare all'architettura pre-refactor:

### 4.1 Codice
```bash
git checkout pre-refactor-v1.0
# oppure
git revert <commit-fase-N>..<HEAD>
```

### 4.2 Database
- **Fase 1 fallita:** ripristinare vecchie policy RLS dal backup, rimuovere colonna `user_id`, eliminare `_orphans`
- **Fase 7 fallita:** ripristinare righe `app_state id='<email>'` da `backup_app_state_personal_<date>`
- **Altre fasi:** nessuna modifica al database, solo `git revert`

### 4.3 localStorage / IndexedDB
- Ripristinare dall'export JSON fatto nella Fase 0 (se ancora necessario)
- Dopo il rollback, l'utente potrebbe dover fare re-login (sessioni mutate)

### 4.4 Comunicazione beta tester
Se il rollback avviene dopo la Fase 6 (JWT), comunicare ai beta tester di fare re-login.

---

## 5. CHECKLIST FINALE — NESSUN DATO PERSO

Il refactor è completato senza perdita dati solo se TUTTE queste condizioni sono vere:

1. ☐ Backup Fase 0 esiste (JSON + export Supabase + tag git)
2. ☐ Fase 1: conteggi tabelle FASE C invariati, `_orphans` documentato
3. ☐ Fase 2: tutti i dati utente accessibili dalle tabelle FASE C, riga `app_state` personale dormiente
4. ☐ Fase 3: outbox vuoto su tutti i device prima dell'eliminazione, nessuna scrittura pendente persa
5. ☐ Fase 4: artists sincronizzati al cloud prima dell'eliminazione IndexedDB, numero artists invariato
6. ☐ Fase 5: nessun dato toccato (solo refactor boot)
7. ☐ Fase 6: JWT refreshato, nessun dato perso (solo accesso temporaneo negato)
8. ☐ Fase 7: righe `app_state` personali eliminate SOLO dopo verifica conteggi identici, backup conservato 30 giorni
9. ☐ Test cross-device: modifica su device A → login su device B → dato identico (per ogni tipo di dato)
10. ☐ Test multi-user: utente B non vede dati di utente A
11. ☐ Audit log popolato per ogni modifica
12. ☐ Nessun `grep` di `localStorage\|IndexedDB\|outbox\|auto-backup` in codice utente (esclusi flag config/auth)

Se anche una sola condizione non è verificata, il refactor NON è completato e si deve investigare.

---

**Fine del Safety Report.**

Nessuna modifica al codice è stata effettuata. Questo documento è complementare al `LABELPULSE_REFACTORING_PLAN_v1.0.md` e deve essere consultato prima di ogni fase.
