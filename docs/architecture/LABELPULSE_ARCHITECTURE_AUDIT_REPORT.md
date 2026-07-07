# LABELPULSE ARCHITECTURE AUDIT REPORT

Analisi delle differenze tra l'architettura richiesta dalla specifica `LABELPULSE_SYSTEM_ARCHITECTURE_SPECIFICATION_v1.0` e l'architettura presente nel repository al momento dell'audit (commit `586f4be`).

**Repo analizzato:** `/home/z/my-project`
- `src/lib/store.ts` — 4517 righe
- `src/lib/supabase.ts` — 2054 righe
- `src/lib/outbox.ts` — 356 righe
- `src/lib/auto-backup.ts` — 191 righe
- `src/lib/api-client.ts` — 210 righe

---

## A) ARCHITETTURA RICHIESTA DALLA SPECIFICA

### A.1 Regola Zero
Ogni dato persistente ha **un solo proprietario, una sola tabella autorevole, un solo flusso di lettura, un solo flusso di scrittura**. Niente copie parallele, niente cache persistenti, niente fonti duplicate.

### A.2 Principio Cloud-First
- Flusso obbligatorio: `Browser → Supabase → PostgreSQL`
- Flusso vietato: `Browser → Storage locale → Supabase`
- L'app funziona **solo online**

### A.3 Storage Locale
**Vietati:**
- localStorage persistente
- IndexedDB persistente
- File JSON locali
- Cache persistenti
- Zustand persist o equivalenti

**Consentito:** solo stato React temporaneo per il rendering durante la sessione, come riflesso di dati appena letti/scritti su Supabase.

### A.4 Salvataggio Dati
Ogni modifica utente → scritta su Supabase immediatamente. Flusso: `UI → Service/Hook → Supabase → conferma → aggiorna UI`. Nessun dato importante può restare solo nel browser.

### A.5 Multi-Device
Ogni dispositivo deve mostrare sempre lo stesso stato. Una modifica su un device deve essere disponibile dopo login da qualsiasi altro device.

### A.6 Multi-Tenant
Isolamento rigoroso via **Supabase Auth + RLS**. Ogni utente vede solo i propri dati personali. Non via filtri lato client.

### A.7 Separazione Dati Globali / Personali
- **Globali** (classifiche Beatport, label ufficiali, artisti, statistiche, scraping): scrivibili solo admin, letti da tutti
- **Personali** (bio, link, social, demo, pitch, email, note, contatti label personalizzati, preferiti, promemoria): ogni utente ha i propri

### A.8 Architettura Software Obbligatoria
```
React UI → Custom Hooks/Business Services → Supabase Client → PostgreSQL + RLS
```
I componenti UI **non parlano direttamente con Supabase**.

### A.9 Data Ownership
Ogni tabella personale deve avere `user_id`. Ogni nuovo tipo di dato deve essere definito prima di creare la tabella.

### A.10 Altre richieste
- Audit log (utente, azione, tabella, record, timestamp)
- Migration documentate per ogni modifica schema
- Divieti assoluti: no storage locale persistente, no bypass RLS, no copie dati, no workaround permanenti

---

## B) ARCHITETTURA ATTUALE NEL CODICE

### B.1 Stato applicativo — Zustand persist su IndexedDB

**File:** `src/lib/store.ts` (4517 righe)

- `useAppStore = create<AppState>()(persist(...))` con `storage: createJSONStorage(() => idbStorage)` (riga 2676)
- `idbStorage` è un adapter custom che usa `idb-keyval` (IndexedDB) come backend
- `partialize` (riga 2921) persiste su IndexedDB: `demos, releases, savedPitches, sentCampaigns, activeTab, locale, userProfile, gmailAuth, lastReplyScanAt, newRepliesCount, rankingsUpdatedAt, lastSavedAt, rankingSnapshots`
- `PRIMARY_KEY = "labelpulse-storage"` (chiave IndexedDB)
- Versione persist: 19 (con migrazioni v1→v19)
- `merge` function custom che combina stato persistito + stato corrente

**Verdetto:** **violazione diretta** della Regola Zero e della sezione 3 della Costituzione. Zustand persist su IndexedDB è esattamente il pattern vietato.

### B.2 Sistema di auto-backup su IndexedDB

**File:** `src/lib/auto-backup.ts` (191 righe)

- `saveSnapshot(email, state)` — salva uno snapshot completo su IndexedDB keyed per email (`labelpulse-snapshot-<email>`)
- Debounce 2 secondi
- `flushSnapshot()` — salvataggio immediato su `beforeunload` e `visibilitychange`
- `loadSnapshot(email)` — ripristina stato da IndexedDB
- `restoreFromSnapshot(email)` — usato come fallback se il cloud sync fallisce
- Subscribe globale: ogni modifica a labels/demos/userProfile/etc. triggera `saveSnapshot`

**Verdetto:** **violazione diretta** della Regola Zero. Crea una **seconda fonte di verità** parallela al cloud. Lo snapshot è una copia persistente di dati che hanno già una tabella autorevole su Supabase.

### B.3 Outbox su IndexedDB

**File:** `src/lib/outbox.ts` (356 righe)

- Coda di scritture fallite verso le API route, persistente su IndexedDB (`labelpulse-outbox-v2`)
- `writeWithOutbox` — ogni scrittura passa da qui
- Retry automatico ogni 15s + su `online` + su `visibilitychange`
- `pauseOutboxFlush` / `resumeOutboxFlush` per gestire il boot

**Verdetto:** **violazione** della sezione 5 della Costituzione ("in caso di errore di rete: notificare l'utente, non salvare silenziosamente in locale per dopo") e della sezione 2.1 ("l'app non deve funzionare offline, non progettare sincronizzazione offline, merge, code, conflitti"). L'outbox è esattamente una coda di sincronizzazione offline.

### B.4 Multipla sorgente di verità per le label

**File:** `src/lib/store.ts` + `src/lib/supabase.ts`

Le label provengono da **3 fonti che si fondono**:
1. **Seed locale** — `labels-data.json` (~1192 label) caricato da `buildLabelsFromData()`
2. **Riga globale cloud** — `app_state` riga `id='global'` (classifiche Beatport)
3. **Tabelle dedicate cloud** — `label_personal_data` (contatti/note per-utente)

Il merge avviene in:
- `mergeGlobalAndPersonalCloud` (supabase.ts riga 574)
- `mergeGlobalWithPersonal` (supabase.ts riga 1500)
- `applyGlobalDataToStore` (supabase.ts riga 1529)
- `loadFromCloud` (store.ts riga 3417)
- `loadFromNewTables` (store.ts riga 3780)

**Verdetto:** **violazione della Regola Zero**. Le label hanno 3 fonti di verità che competono. I merge sono point of failure per race condition.

### B.5 Riga `app_state` come JSON blob + tabelle dedicate in parallelo

Tabelle che contengono dati utente:
- `app_state` (riga `id='global'` + riga `id='<email>'`) — JSON blob con labels, demos, releases, pitches, profile, snapshots, artists
- `demo_submissions` — tabelle dedicate (FASE C)
- `label_personal_data` — tabelle dedicate (FASE C)
- `pitch_campaigns` — tabelle dedicate (FASE C)
- `user_profiles` — tabelle dedicate (FASE C)
- `user_releases` — tabelle dedicate

**Verdetto:** **violazione della Regola Zero**. Gli stessi dati (demos, pitches, profile, releases) esistono **sia come JSON blob in `app_state`** che **come righe nelle tabelle dedicate**.

### B.6 RLS — policy permissive e bypassate

**File:** `supabase-schema.sql`

- `app_state`: policy `FOR SELECT USING (true)` (riga 78) — **chiunque con anon key può leggere tutte le righe di tutti gli utenti**
- Policy INSERT/UPDATE/DELETE su `app_state`: `WITH CHECK (id IS NOT NULL AND id != '')` — nessun controllo per-user
- `supabase-rls-disable-emergency.sql` (caricato nel repo): ha **disabilitato le policy granulari** sostituendole con `FOR ALL USING (true) WITH CHECK (true)` su tutte le 4 tabelle FASE C

**File:** `src/lib/supabase-admin.ts`

- `getAdminClient()` fa fallback su **service_role** (bypassa RLS) se il JWT Supabase è scaduto o mancante
- Se manca anche `SUPABASE_SERVICE_ROLE_KEY`, fa fallback su **anon key** (policy permissive permettono l'accesso)

**Verdetto:** **violazione della sezione 6 della Costituzione** (multi-tenant rigoroso via RLS).

### B.7 Componenti UI parlano direttamente con Supabase

I componenti UI non chiamano direttamente `supabase.from(...)` (verificato). Tuttavia, accedono allo store Zustand che fa da tramite — il che viola lo spirito della sezione 4 della Costituzione.

### B.8 Flusso di boot — race condition multi-sorgente

**File:** `src/lib/use-auth.ts` (riga 125)

```
Promise.race([
  Promise.all([loadFromCloud(), loadFromNewTables()]),
  timeout(15s)
])
```

- `loadFromCloud()` legge la riga globale da `app_state`
- `loadFromNewTables()` legge le 4 tabelle dedicate via API route
- Entrambi fanno `setState` concorrente
- Se il risultato è "vuoto" → fallback su `restoreFromSnapshot` (IndexedDB)

**Verdetto:** **violazione della sezione 5 della Costituzione**. Il boot attuale ha 3 sorgenti concorrenti (cloud riga globale, cloud tabelle dedicate, snapshot IndexedDB) che competono.

### B.9 Salvataggio — optimistic + outbox + debounce

- Ogni azione (`addDemo`, `addLabel`, `setUserProfile`, ecc.) fa `set()` ottimistico + `syncToCloud()` (debounced, disabilitato) + API route via `writeWithOutbox`
- `syncToCloud` è disabilitato (`DISABLE_OLD_APP_STATE_SYNC = true`) ma è ancora chiamato 25 volte
- `forceCloudSync` è ancora attivo e scrive su `app_state` (JSON blob legacy)

**Verdetto:** **violazione della sezione 2.4 della Costituzione** (scrittura immediata, attendere conferma, aggiornare UI solo con valore confermato). Il pattern attuale è ottimistico + outbox, non confermato.

---

## C) DIFFERENZE (A vs B)

| # | Specifica (A) | Codice attuale (B) | Gap |
|---|---------------|---------------------|-----|
| 1 | Zero storage locale persistente | Zustand persist su IndexedDB (`partialize` con 13 campi) | **Completo** |
| 2 | Nessuna copia parallela | Auto-backup snapshot su IndexedDB keyed per email | **Completo** |
| 3 | Nessuna coda offline | Outbox su IndexedDB con retry infinito | **Completo** |
| 4 | Una sola tabella per dato | `app_state` JSON blob + 4 tabelle dedicate FASE C con stessi dati | **Completo** |
| 5 | RLS rigoroso per-user | Policy `USING (true)` su app_state + `FOR ALL USING (true)` su FASE C + fallback service_role/anon | **Completo** |
| 6 | Componenti non parlano con Supabase | OK (passano da store/API route) | **Nessuno** |
| 7 | UI → Service → Supabase | UI → Zustand store → syncToCloud + apiClient → API route → getAdminClient → Supabase | **Parziale** |
| 8 | Scrittura immediata + conferma | Ottimistico + outbox + debounce | **Parziale** |
| 9 | Lettura sempre da Supabase all'apertura | Race condition 3-sorgente + fallback snapshot | **Completo** |
| 10 | Ogni tabella personale ha `user_id` | Tabelle FASE C usano `user_email` (TEXT), non `user_id` (UUID FK ad auth.users) | **Parziale** |
| 11 | Audit log | Assente | **Completo** |
| 12 | Migration documentate | File `.sql` sparsi, no migration framework | **Parziale** |
| 13 | Stato React temporaneo OK | Stato React c'è, ma è **fonte primaria** non riflesso | **Parziale** |
| 14 | No workaround permanenti | `DISABLE_OLD_APP_STATE_SYNC`, `OWNER_KEY`, `forceCloudSync` legacy, `pauseOutboxFlush`/`resumeOutboxFlush`, `_isApplyingRemoteUpdate` | **Completo** |
| 15 | Solo online | Outbox + auto-backup = logica offline | **Completo** |

---

## D) PROBLEMI ARCHITETTURALI

### D.1 (Critico) Violazione della Regola Zero — 3 fonti di verità per le label
Le label sono lette da: seed JSON locale, riga globale `app_state`, tabella `label_personal_data`. I 5 merge function competono. Causa radice dei bug "label che spariscono", "classifiche ferme", "icone sparite".

### D.2 (Critico) `app_state` JSON blob coesiste con tabelle dedicate
`app_state` riga personale contiene ancora `labels, demos, releases, savedPitches, sentCampaigns, userProfile, rankingSnapshots` come JSON blob. Le stesse entità esistono come righe in tabelle FASE C. Due rappresentazioni dello stesso dato.

### D.3 (Critico) RLS non isolata per-user
- `app_state SELECT USING (true)` → qualsiasi client anon può leggere tutte le righe
- `supabase-rls-disable-emergency.sql` ha sostituito le policy FASE C con `FOR ALL USING (true)` → nessun isolation
- `getAdminClient` fa fallback su service_role (bypass RLS) o anon key (policy permissive)

### D.4 (Alto) Zustand persist crea snapshot stale
`idbStorage` carica lo stato persistito al boot **prima** del cloud sync. Causa flash di dati stale e race condition.

### D.5 (Alto) Race condition nel boot
`Promise.all([loadFromCloud(), loadFromNewTables()])` esegue entrambi in parallelo. Entrambi fanno `setState({ labels: ... })`. Risultato non deterministico.

### D.6 (Alto) Outbox = logica offline mascherata
L'outbox salva scritture fallite per retry infinito. Pattern "sincronizzazione offline" vietato dalla Costituzione.

### D.7 (Alto) Auto-backup = seconda fonte di verità
`saveSnapshot` su IndexedDB crea una copia persistente di dati che hanno già una tabella su Supabase. `restoreFromSnapshot` può sovrascrivere dati cloud più recenti con snapshot locali stale.

### D.8 (Medio) Tabelle FASE C usano `user_email` non `user_id`
Le tabelle usano `user_email TEXT` come chiave, non `user_id UUID FK auth.users`. RLS basata su `auth.jwt() ->> 'email'` invece di `auth.uid()` — più fragile.

### D.9 (Medio) `syncToCloud` chiamato 25 volte ma disabilitato
Codice morto che confonde e nasconde il vero flusso di salvataggio.

### D.10 (Basso) Schema SQL senza migration framework
9 file `supabase-schema-*.sql` + `supabase-rls-disable-emergency.sql` applicati manualmente via SQL Editor. Nessun versioning.

### D.11 (Basso) Nessun audit log
Nessuna tabella `audit_log` come richiesto dalla specifica sezione 12.

---

## E) PRIORITÀ DEGLI INTERVENTI

### Priorità 1 — Eliminare le fonti di verità duplicate (bloccante)
- **E1** Eliminare `app_state` riga personale (`id='<email>'`). Mantenere solo riga globale.
- **E2** Eliminare `syncToCloud`/`forceCloudSync`/`saveStateToCloud`/`loadStateFromCloud` e tutte le 25 chiamate.
- **E3** Eliminare i merge multipli. Un solo flusso: cloud → state.

### Priorità 2 — Eliminare storage locale persistente (bloccante)
- **E4** Rimuovere `persist` middleware da Zustand.
- **E5** Eliminare `src/lib/auto-backup.ts`.
- **E6** Eliminare `src/lib/outbox.ts`.
- **E7** Eliminare `idbStorage` adapter, `artists-idb.ts`, tutti i sidecar.

### Priorità 3 — Rendere RLS realmente per-user (bloccante)
- **E8** Riscrivere RLS con `USING (user_id = auth.uid())`.
- **E9** Aggiungere colonna `user_id UUID REFERENCES auth.users(id)` a tutte le tabelle FASE C.
- **E10** Eliminare `SUPABASE_SERVICE_ROLE_KEY` dall'uso lato client.
- **E11** Eliminare `supabase-rls-disable-emergency.sql`.
- **E12** Riscrivere `getAdminClient` per usare SEMPRE il JWT utente.

### Priorità 4 — Riscrivere il flusso di boot (alto)
- **E13** Sostituire `Promise.all` con sequenza singola.
- **E14** Eliminare timeout di 15s + fallback snapshot.
- **E15** Eliminare `pauseOutboxFlush`/`resumeOutboxFlush`.

### Priorità 5 — Riscrivere il pattern di scrittura (alto)
- **E16** Sostituire pattern ottimistico + outbox con: `UI → API route → Supabase → conferma → setState`.
- **E17** Eliminare `markLocalProfileEdit` e tutti i workaround.

### Priorità 6 — Unificare l'accesso dati (medio)
- **E18** Creare un service/hook dedicato per ogni entità.
- **E19** Lo store Zustand viene popolato solo dai service/hook.

### Priorità 7 — Completamento specifica (basso)
- **E20** Aggiungere tabella `audit_log` con trigger.
- **E21** Introdurre migration framework.
- **E22** Documentare la Data Ownership Matrix nel repo.

---

## NOTA FINALE

Il repository attuale è **architetturalmente distante** dalla specifica v1.0. La distanza non è marginale: riguarda i pilastri fondamentali (storage, sync, RLS, data ownership). Le violazioni non sono incidenti isolati — sono **scelte architetturali** (Zustand persist, outbox, auto-backup, `app_state` JSON blob, RLS permissive) che hanno guidato lo sviluppo per settimane.
