# LABELPULSE MIGRATION SAFETY REPORT

Documento di analisi del rischio di perdita dati per il `LABELPULSE_REFACTORING_PLAN_v1.0`.

**Principio fondamentale:** nessun dato utente può essere perso durante il refactoring. Se una fase presenta anche un minimo rischio, deve essere evidenziata chiaramente.

**Allineamento:** questo report copre tutte le fasi del Refactoring Plan: Fase 0 (backup database), Fase 0.5 (security hardening), Fasi 1-7 (migrazione architetturale). È allineato al tag git `labelpulse-pre-refactor-v1` (baseline pre-refactoring).

---

## 0. INVENTARIO DATI PRE-MIGRAZIONE

### 0.1 Dati su Supabase (cloud, fonte di verità attuale)

| Tabella | Chiave | Contenuto | Volume stimato | RLS |
|---------|--------|-----------|----------------|-----|
| `app_state` riga `id='global'` | id | Classifiche Beatport, label globali, artisti, snapshots | ~2.37 MB | ENABLE, `USING(true)` |
| `app_state` riga `id='<email>'` | id | Blob JSON: labels personalizzate, demos, releases, savedPitches, sentCampaigns, userProfile, gmailAuth, rankingSnapshots, artists | ~2.60 MB per utente | ENABLE, `USING(true)` |
| `app_state` riga `id='default'` | id | Backward compatibility single-user | ~0 | ENABLE, `USING(true)` |
| `demo_submissions` | user_email + id | Demo utente (6 righe per utente attivo) | Basso | ENABLE, emergency fix `USING(true)` |
| `label_personal_data` | user_email + label_id | Contatti/note/link per-label (671 righe per utente attivo) | Medio | ENABLE, emergency fix |
| `pitch_campaigns` | user_email + id | Pitch bozze + inviate | Basso | ENABLE, emergency fix |
| `user_profiles` | user_email (PK) | Profilo utente | 1 riga per utente | ENABLE, emergency fix |
| `user_releases` | user_email + id | EP/release utente | Basso | ENABLE, jwt email |
| `push_subscriptions` | user_email + endpoint | Notifiche push per device | 1+ righe per utente | ENABLE, partial |
| `beta_feedback` | id | Feedback beta tester | Basso | ENABLE, INSERT anon |
| `beta_access_codes` | id | Codici accesso beta | Basso | ENABLE, scoped |
| `beatport_snapshots` | id | Snapshot sessioni scraping | Medio | DISABLE |
| `beatport_chart_history` | id | Storico posizioni tracce | Medio | DISABLE |
| `followed_artists` | id | Tracking user → artist (orfana) | 0 righe | DISABLE |
| `agent_memory` | id | Memoria AI bug fix | Basso | ENABLE, `USING(true)` |
| `v_beta_tester_status` | view | View admin | N/A | Eredita |
| `auth.users` | UUID id | Utenti registrati Google OAuth | Basso | N/A (auth schema) |

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
| `labelpulse-onboarded-v2:<email>` | Flag onboarding | Config (mantenuto) |
| `labelpulse-cookie-consent` | Preferenza cookie | Config (mantenuto) |
| `beta_admin_token` | Token auth admin | Auth (mantenuto) |

### 0.3 Dati su IndexedDB (browser, da eliminare)

| Database | Contenuto | Tipo |
|----------|-----------|------|
| `keyval-store` (idb-keyval) | Mirror Zustand persist + snapshot auto-backup + outbox v2 | Dato utente duplicato |
| `labelpulse-artists` | ~3400 artisti / ~9MB | Dato globale duplicato |
| `auto-save` | File JSON auto-save locale | Dato utente duplicato |

### 0.4 Dati su auth.users (Supabase Auth)

| Fonte | Contenuto |
|-------|-----------|
| `auth.users` | Utenti registrati via Google (UUID id, email). È la chiave che verrà usata come `user_id` nelle tabelle migrate. |

**Critico:** ogni `user_email` nelle tabelle FASE C deve avere un corrispondente `auth.users.email` per la migrazione `user_id`.

### 0.5 Tag Git baseline

| Tag | Commit | Scopo |
|-----|--------|-------|
| `labelpulse-pre-refactor-v1` | `dc04b1e` | Baseline pre-refactoring, punto di rollback codice |

---

## 1. ANALISI PER FASE

Per ogni fase del piano di refactoring:
- **Dati toccati** — cosa viene letto/scritto/eliminato
- **Rischio perdita** — nessuno / basso / medio / alto / critico
- **Prevenzione** — come si evita la perdita
- **Rollback** — come ripristinare se qualcosa va male
- **Verifica** — come confermare che nessun dato è perso

---

## FASE 0 — BACKUP DEL DATABASE

### Dati toccati
- **Letto:** tutte le tabelle dello schema `public` + `auth.users` (se accessibile)
- **Scritto:** file di backup in `docs/architecture/backups/` (database-full-backup, schema, rls-policies, functions, row-counts)
- **Non eliminato:** nulla

### Rischio perdita dati
**Nessuno** (la fase stessa è la prevenzione).

### Prevenzione
Questa fase CREA il backup di rollback per tutte le fasi successive. Comprende:
1. Backup completo database (dump SQL)
2. Esportazione schema DDL
3. Esportazione policy RLS
4. Esportazione funzioni SQL + trigger
5. Verifica ripristinabilità + conteggi righe
6. Commit Git della documentazione

### Rollback
N/A (la fase è il rollback).

### Verifica
1. File `database-full-backup-<date>.sql` esiste e non è vuoto
2. File `schema-<date>.sql` contiene `CREATE TABLE` per tutte le tabelle `public.*`
3. File `rls-policies-<date>.sql` contiene tutte le policy
4. File `functions-<date>.sql` esiste
5. File `row-counts-<date>.json` contiene conteggi per tutte le tabelle
6. Verifica ripristinabilità eseguita e documentata
7. `.gitignore` contiene `docs/architecture/backups/`
8. Commit Git contiene solo documentazione
9. Tag `labelpulse-pre-refactor-v1` esiste

**Esito:** ☐ Verificato

---

## FASE 0.5 — SECURITY HARDENING

### Dati toccati
- **Modificato (codice):** `src/lib/snapshots.ts`, route `/api/snapshots/*` → `/api/admin/snapshots/*`, `rankings-wizard.tsx`
- **Modificato (database):** policy RLS su `followed_artists`, `beatport_snapshots`, `beatport_chart_history` (RLS abilitata + policy read-only)
- **Non modificato (database):** `agent_memory`, `beta_feedback` (solo verifica, nessuna modifica esecutiva)
- **Non eliminato:** nessun dato

### Rischio perdita dati
**Basso** — la fase modifica policy RLS e codice route, non dati.

### Rischio specifico — scritture snapshot interrotte
Se 0.5.4 (spostamento route + service_role) non è completato prima di 0.5.5 (abilitazione RLS su beatport_snapshots), l'import classifiche fallisce perché la route usa ancora anon key e RLS blocca la scrittura.

### Prevenzione
1. **Ordine obbligatorio** — 0.5.4 prima di 0.5.5
2. **Test funzionale** dopo 0.5.4: login admin → import classifiche → deve funzionare con service_role
3. **Verifica `beta_feedback`** (0.5.3) prima di qualsiasi protezione: verificare se `supabaseKey` è service_role o anon. Se anon, NON applicare RLS in questa fase.
4. **`agent_memory`** (0.5.2): solo verifica, nessuna modifica. Gli script admin usano service_role (bypassa RLS), quindi anche se la tabella resta permissive, gli script continuano a funzionare.

### Rollback
- Codice: `git revert` del commit Fase 0.5
- Database: ripristinare vecchie policy RLS dal backup Fase 0 (file `rls-policies-<date>.sql`)
- Le tabelle `beatport_snapshots`, `beatport_chart_history`, `followed_artists` non perdono dati (solo policy cambiano)

### Verifica
1. Security Advisor: warning `rls_disabled_in_public` risolto per `beatport_snapshots`, `beatport_chart_history`, `followed_artists`
2. Test admin: import classifiche funziona (service_role)
3. Test utente non-admin: POST `/api/admin/snapshots/save` → 401/403
4. Documento verifica compilato per `agent_memory` (0.5.2)
5. Documento verifica compilato per `beta_feedback` (0.5.3)
6. Warning residui documentati (su `app_state`, tabelle FASE C, `agent_memory`, `beta_feedback`)

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

### Rischio specifico — righe orfane
Se un utente ha dati in `demo_submissions` con `user_email = 'old@email.com'` ma quell'email non esiste più in `auth.users` (utente cancellato, email cambiata), la riga non può ricevere `user_id`. Queste righe:
- Vengono copiate in `_orphans` (stessa struttura + colonna `original_table`, `original_email`)
- Restano nella tabella originale con `user_id = NULL`
- Vengono segnalate per revisione manuale
- **Non vengono eliminate**

### Prevenzione
1. **Colonna nullable** — `user_id` viene aggiunta come `UUID` nullable (nessun `NOT NULL` iniziale)
2. **Popolamento conservativo** — il join `user_email → auth.users.email` per tutte le righe. Righe senza match → `_orphans`
3. **Solo dopo popolamento** si aggiunge `NOT NULL` (se tutte le righe hanno `user_id`)
4. **Indici paralleli** — nuovi indici su `user_id` creati prima di rimuovere i vecchi su `user_email`
5. **Policy RLS** — nuove policy con `auth.uid()` aggiunte PRIMA di rimuovere le vecchie

### Rollback
```sql
-- Rimuovere nuove policy
DROP POLICY IF EXISTS "...new..." ON demo_submissions; -- (e altre 4 tabelle)
-- Ripristinare vecchie policy dal backup Fase 0
-- (vedi file rls-policies-<date>.sql)
-- Rimuovere colonna user_id
ALTER TABLE demo_submissions DROP COLUMN user_id; -- (e altre 4 tabelle)
-- Eliminare tabella _orphans
DROP TABLE _orphans;
```
Tag git `labelpulse-pre-refactor-v1` permette di tornare al codice pre-refactoring.

### Verifica
1. Contare righe totali prima e dopo — devono essere identiche ai conteggi del backup Fase 0
2. Contare righe orfane: `SELECT COUNT(*) FROM _orphans;` — documentare il numero
3. Verificare `user_id` popolato: `SELECT COUNT(*) FROM demo_submissions WHERE user_id IS NOT NULL;` — deve essere uguale al totale meno orfani
4. Verificare RLS con `set role anon` — deve restituire 0 righe (anon non vede nulla senza JWT)

**Esito:** ☐ Verificato

---

## FASE 2 — ELIMINAZIONE app_state PERSONALE + SYNC LEGACY

### Dati toccati
- **Letto:** `app_state` riga globale (`id='global'`) — resta
- **Bloccato in scrittura:** `app_state` riga personale (`id='<email>'`) — RLS la rende inaccessibile in scrittura
- **Eliminato (codice):** funzioni `saveStateToCloud`, `loadStateFromCloud`, `syncToCloud`, `forceCloudSync` — ma i dati nel DB non vengono eliminati
- **Non eliminato:** la riga `app_state id='<email>'` resta fisicamente nel DB (per rollback)

### Rischio perdita dati
**Alto** — se `loadFromNewTables` non carica tutti i dati che erano nella riga personale, quei dati diventano inaccessibili (anche se non eliminati).

### Rischio specifico — gmailAuth e dati non tabellati
Se `gmailAuth` (token Gmail OAuth) viveva solo nella riga `app_state` personale e non ha una tabella dedicata, eliminare `loadStateFromCloud` perde l'accesso Gmail dell'utente. **Da verificare prima della fase.**

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

### Rollback
- Codice: `git revert` del commit Fase 2
- Database: la riga `app_state id='<email>'` è ancora presente (non eliminata), ripristinando il codice si riattiva la lettura

### Verifica
1. Login → verificare che tutti i dati siano presenti (demo, label personalizzate, profilo, pitch, release, classifiche)
2. Confronto numerico con backup Fase 0:
   - `demos.length` uguale a prima
   - `labels.filter(l => l.emails.length > 0 || l.notes !== '').length` uguale
   - `userProfile.artistName` uguale
3. Supabase Dashboard → `SELECT updated_at FROM app_state WHERE id='<email>';` — il timestamp **non** si aggiorna dopo modifiche utente (riga dormiente)
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
2. **Flag di config/auth** — decisione presa (allineata a Final Architecture sezione 9.5):
   - **Mantenere in localStorage:** `labelpulse-onboarded-v2:<email>`, `labelpulse-cookie-consent`, `beta_admin_token`, `next-auth.session-token`
   - Non sono dati utente, sono flag di config/auth. La specifica vieta "localStorage persistente" per dati utente, non per flag di config.
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
3. DevTools → Application → Local Storage → solo flag di config/auth (mantenuti)
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
- **Eliminato (database):** `app_state` riga `id='default'` (legacy single-user)
- **Eliminato (database):** `followed_artists` (tabella orfana, mai usata)
- **Creato (database):** tabella `audit_log` + trigger
- **Creato (codice):** business service per dominio (`src/services/<dominio>-service.ts`) + hook dedicati (`src/hooks/use-<dominio>.ts`)

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

### Rischio specifico — `followed_artists` eliminazione
La tabella `followed_artists` è orfana (mai usata nel codice). L'eliminazione è sicura — nessun dato utente viene perso. Ma verificare prima con:
```sql
SELECT COUNT(*) FROM followed_artists;
```
Se il count è > 0, documentare le righe prima di eliminare.

### Rollback
- Codice: `git revert` del commit Fase 7
- Database: ripristinare da `backup_app_state_personal_<date>`:
   ```sql
   INSERT INTO app_state SELECT * FROM backup_app_state_personal_<date>;
   ```
- Per `followed_artists`: ripristinare dal backup Fase 0 (database-full-backup)

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
6. Verifica `followed_artists` eliminata: `SELECT EXISTS (SELECT FROM pg_tables WHERE tablename = 'followed_artists');` → false

**Esito:** ☐ Verificato

---

## 2. TABELLA FINALE — MAPPATURA DATI

| Tabella attuale | Tabella finale | Dati migrati | Dati eliminati | Motivo eliminazione |
|-----------------|----------------|--------------|----------------|---------------------|
| `app_state` riga `id='global'` | `app_state` riga `id='global'` (invariata) | Nessuno (resta dov'è) | Nessuno | — |
| `app_state` riga `id='<email>'` | (eliminata in Fase 7) | demos → `demo_submissions`; labels personalizzate → `label_personal_data`; pitches → `pitch_campaigns`; profile → `user_profiles`; releases → `user_releases`; rankingSnapshots → riga globale | Riga JSON blob personale (dopo verifica migrazione completa) | Doppia fonte di verità eliminata — i dati vivono nelle tabelle dedicate |
| `app_state` riga `id='default'` | (eliminata in Fase 7) | N/A | Riga legacy single-user | Backward compatibility non più necessaria |
| `demo_submissions` | `demo_submissions` (con `user_id` aggiunto in Fase 1) | `user_id` popolato da join con `auth.users` | Nessuno | — |
| `label_personal_data` | `label_personal_data` (con `user_id`) | `user_id` popolato | Nessuno | — |
| `pitch_campaigns` | `pitch_campaigns` (con `user_id`) | `user_id` popolato | Nessuno | — |
| `user_profiles` | `user_profiles` (con `user_id`) | `user_id` popolato | Nessuno | — |
| `user_releases` | `user_releases` (con `user_id`) | `user_id` popolato | Nessuno | — |
| `push_subscriptions` | `push_subscriptions` (invariata) | Nessuno | Nessuno | — |
| `beta_feedback` | `beta_feedback` (invariata) | Nessuno | Nessuno | — |
| `beta_access_codes` | `beta_access_codes` (invariata) | Nessuno | Nessuno | — |
| `beatport_snapshots` | `beatport_snapshots` (invariata, RLS abilitata in Fase 0.5) | Nessuno | Nessuno | — |
| `beatport_chart_history` | `beatport_chart_history` (invariata, RLS abilitata in Fase 0.5) | Nessuno | Nessuno | — |
| `followed_artists` | (eliminata in Fase 7) | N/A | Tabella orfana (0 righe verificate) | Tabella mai usata nel codice, orfana |
| `agent_memory` | `agent_memory` (invariata) | Nessuno | Nessuno | — |
| `v_beta_tester_status` | `v_beta_tester_status` (invariata) | Nessuno | Nessuno | — |
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
| localStorage `labelpulse-onboarded-v2:<email>` | (mantenuta) | N/A | Nessuno | Flag config, non dato utente |
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

### RT6 (medio) — Followed_artists con righe inattese
La tabella `followed_artists` è orfana nel codice ma potrebbe contenere righe se qualcuno l'ha popolata manualmente.
- **Fasi interessate:** Fase 7
- **Prevenzione:** verificare `SELECT COUNT(*) FROM followed_artists` prima dell'eliminazione. Se > 0, documentare le righe in un backup prima di eliminare.
- **Verifica:** backup delle righe esiste se count > 0.

---

## 4. PROTOCOLLO DI ROLLBACK GLOBALE

Se il refactor fallisce a qualsiasi fase e si decide di tornare all'architettura pre-refactor:

### 4.1 Codice
```bash
git checkout labelpulse-pre-refactor-v1
# oppure
git revert <commit-fase-N>..<HEAD>
```

### 4.2 Database
- **Fase 0 fallita:** N/A (la fase è il backup)
- **Fase 0.5 fallita:** ripristinare vecchie policy RLS dal backup Fase 0 (file `rls-policies-<date>.sql`)
- **Fase 1 fallita:** ripristinare vecchie policy RLS, rimuovere colonna `user_id`, eliminare `_orphans`
- **Fase 7 fallita:** ripristinare righe `app_state id='<email>'` da `backup_app_state_personal_<date>`, ripristinare `followed_artists` dal backup Fase 0
- **Altre fasi:** nessuna modifica al database, solo `git revert`

### 4.3 localStorage / IndexedDB
- Ripristinare dall'export JSON fatto nella Fase 0 (se ancora necessario)
- Dopo il rollback, l'utente potrebbe dover fare re-login (sessioni mutate)

### 4.4 Comunicazione beta tester
Se il rollback avviene dopo la Fase 6 (JWT), comunicare ai beta tester di fare re-login.

---

## 5. CHECKLIST FINALE — NESSUN DATO PERSO

Il refactor è completato senza perdita dati solo se TUTTE queste condizioni sono vere:

1. ☐ Backup Fase 0 esiste (dump database + schema + policy + funzioni + conteggi)
2. ☐ Tag git `labelpulse-pre-refactor-v1` esiste
3. ☐ Fase 0.5: warning Security Advisor risolti per tabelle snapshot, `agent_memory` e `beta_feedback` verificati
4. ☐ Fase 1: conteggi tabelle FASE C invariati, `_orphans` documentato
5. ☐ Fase 2: tutti i dati utente accessibili dalle tabelle FASE C, riga `app_state` personale dormiente
6. ☐ Fase 3: outbox vuoto su tutti i device prima dell'eliminazione, nessuna scrittura pendente persa
7. ☐ Fase 4: artists sincronizzati al cloud prima dell'eliminazione IndexedDB, numero artists invariato
8. ☐ Fase 5: nessun dato toccato (solo refactor boot)
9. ☐ Fase 6: JWT refreshato, nessun dato perso (solo accesso temporaneo negato)
10. ☐ Fase 7: righe `app_state` personali eliminate SOLO dopo verifica conteggi identici, backup conservato 30 giorni
11. ☐ Fase 7: `followed_artists` eliminata solo dopo verifica count = 0 o backup delle righe
12. ☐ Test cross-device: modifica su device A → login su device B → dato identico (per ogni tipo di dato)
13. ☐ Test multi-user: utente B non vede dati di utente A
14. ☐ Audit log popolato per ogni modifica
15. ☐ Nessun `grep` di `localStorage\|IndexedDB\|outbox\|auto-backup` in codice utente (esclusi flag config/auth)

Se anche una sola condizione non è verificata, il refactor NON è completato e si deve investigare.

---

**Fine del Safety Report.**

Nessuna modifica al codice è stata effettuata. Questo documento è complementare al `LABELPULSE_REFACTORING_PLAN_v1.0.md` e deve essere consultato prima di ogni fase.
