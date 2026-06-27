# 🐛 BUG REGISTRY — LabelPulse

> **SCOPO**: Memoria permanente dei bug già risolti, indicizzata per SINTOMO
> (quello che vede l'utente) → CAUSA → FIX (commit + file).
>
> **COME USARLO**: Prima di investigare un bug, cerca in questo file con
> Ctrl-F la parola chiave del sintomo. Se trovi un match, il fix è già stato
> fatto — verifica che sia ancora in produzione e non sia regredito.
>
> **MANUTENZIONE**: Ogni volta che si risolve un bug, AGGIUNGERE UNA RIGA
> in cima alla sezione corrispondente. Non cancellare mai entry esistenti.

---

## 🔥 CRITICI — Perdita dati / Sicurezza

### 🔒 Security Audit: 5 CRITICAL fixes (C-1 through C-5)
- **Sintomo**: 5 vulnerabilità critiche identificate nel security audit (docs/security-audit.md)
- **Causa**: Endpoint API senza auth check + RLS Supabase USING (true) che permette accesso totale ai dati di tutti gli utenti
- **Fix**: 5 fix concatenati:
  1. **C-3**: Aggiunto `getServerSession(authOptions)` + email mismatch check a 4 push endpoints (subscribe, unsubscribe, update-prefs, test) — chi non è autenticato riceve 401, chi manda email diversa dalla sessione riceve 403
  2. **C-5**: Aggiunto auth check + email mismatch check a `/api/account/withdrawal` POST — impedisce richieste recesso false per email altrui
  3. **C-4**: Aggiunto auth check + email mismatch check a `/api/beta-feedback` POST — impedisce spam illimitato di feedback fake
  4. **C-1**: Rimosso `USING (true) WITH CHECK (true)` su `app_state` — rimpiazzato con policy separate per operazione (SELECT/INSERT/UPDATE/DELETE). SELECT ancora `USING (true)` per compatibilità client-side, ma INSERT/UPDATE/DELETE hanno check `id IS NOT NULL AND id != ''`. TODO: migrazione a Supabase Auth in FASE 2 per scoping per email.
  5. **C-2**: Rimosso `USING (true) WITH CHECK (true)` su `beta_access_codes` — INSERT/UPDATE/DELETE bloccati per anon (`WITH CHECK (false)`), solo service_role può operare. Aggiornati endpoint `beta-verify` e `generate-beta-code` per usare `SUPABASE_SERVICE_ROLE_KEY` invece di anon key.
- **File**: `src/app/api/push/subscribe/route.ts`, `src/app/api/push/unsubscribe/route.ts`, `src/app/api/push/update-prefs/route.ts`, `src/app/api/push/test/route.ts`, `src/app/api/account/withdrawal/route.ts`, `src/app/api/beta-feedback/route.ts`, `src/app/api/auth/beta-verify/route.ts`, `src/app/api/admin/generate-beta-code/route.ts`, `supabase-schema.sql`, `supabase-schema-beta-codes.sql`
- **⚠️ AZIONE MANUALE RICHIESTA**: Le nuove RLS su `beta_access_codes` e `app_state` devono essere applicate sul database Supabase eseguendo il SQL aggiornato nel SQL Editor. Vedi sezione "Post-deploy" sotto.

### 🔒 Security Audit: H-8 + M-3 fixes (debug endpoints + NextAuth debug)
- **Sintomo**: Debug endpoints accessibili senza auth + NextAuth debug:true in production
- **Causa**: Endpoints diagnostici (auth-debug, cloud-debug, /debug) senza auth check; NextAuth `debug: true` attivo in production → leak di dati sensibili nei log server
- **Fix**:
  - H-8: Aggiunto `getServerSession(authOptions)` a `/api/auth-debug` e `/api/cloud-debug` (401 se non autenticato). Aggiunto `useSession()` check alla pagina `/debug` (mostra "Login richiesto" se non autenticato).
  - M-3: Cambiato `debug: true` in `debug: process.env.NODE_ENV === "development"` in auth-options.ts. Debug logging ora attivo solo in dev.
- **File**: `src/app/api/auth-debug/route.ts`, `src/app/api/cloud-debug/route.ts`, `src/app/debug/page.tsx`, `src/lib/auth-options.ts`

### Account diversi vedono i dati l'uno dell'altro (cross-account contamination)
- **Sintomo**: L'utente A fa login sul telefono dell'utente B → vede i dati di A mischiati con i dati di B
- **Causa**: 4 bug concatenati — RLS Supabase "Allow ALL TO EVERYONE", getCloudRowId() restituiva row "default" condivisa, PRIMARY_KEY globale non per-user, mergeCloudData faceva UNION-by-id senza mai ripulire
- **Fix**: commit `f54bff8` (2026-06-25) — 5 strati di difesa:
  1. RLS Supabase rafforzata (rimossa row "default")
  2. `hardResetForUserSwitch()` in store.ts prima di loadFromCloud
  3. use-auth.ts resetta su cambio email + logout
  4. Disabilitato auto-upload del local su cloud fresco
  5. Persist version 15→16 con migrazione che pulisce sidecar
- **File**: `src/lib/supabase.ts`, `src/lib/store.ts`, `src/lib/use-auth.ts`, `src/components/cloud-recovery.tsx`, `supabase-schema.sql`

### Foto profilo torna vecchia su iPhone dopo upload (Lutenzo)
- **Sintomo**: Su iPhone (PWA), dopo aver caricato una nuova foto profilo, l'immagine appare brevemente poi torna la vecchia. Riaprendo l'app torna sempre la vecchia. Segnalato da Lutenzo (e in seguito da Frank fonico con stessa sintomatologia).
- **Causa**: Race condition tra `setUserProfile` (locale, in `store.ts`) e `applyRemoteData` (realtime cloud update, in `supabase.ts`). Quando l'utente carica una foto:
  1. `setUserProfile` aggiorna lo store locale con la nuova `photoUrl` (data URL JPEG 256×256)
  2. `markLocalProfileEdit()` registra il timestamp dell'edit locale
  3. `forceCloudSync()` (immediata, non debounced) pusha il nuovo profilo al cloud
  4. MA nel frattempo (entro 1-5 secondi) può arrivare un realtime update da Supabase con il VECCHIO `photoUrl` (perché il push non è ancora stato propagato a tutti i subscriber realtime)
  5. Senza protezione, `mergeProfiles` potrebbe pickare il `photoUrl` cloud (vecchio) se quello locale è momentaneamente undefined durante un ciclo setState
  - **NON era un problema di cache HTTP iOS** — il `photoUrl` è un data URL (base64 inline), non passa per la cache HTTP del browser.
- **Fix multi-strato** (commit `52a2254` 2026-06-25 + hardening 2026-06-25):
  1. **Grace-period 10s** (`LOCAL_PROFILE_EDIT_GRACE_MS`): nei 10 secondi dopo un edit locale, `applyRemoteData` preserva incondizionatamente tutti i campi del profilo locale. Solo i campi VUOTI localmente vengono riempiti dal cloud. (Originale: 5s, bumped a 10s dopo report di recidive su connessioni lente.)
  2. **Last-write-wins su `photoUrl` in `mergeProfiles`**: se entrambi i lati hanno un `photoUrl` non-vuoto e diverso, vince quello con data URL più lungo (heuristica: upload più recente = meno recompressione = più dettaglio = più byte). Funziona come second-layer oltre il grace-period.
  3. **`forceCloudSync()` immediata in `setUserProfile`**: non aspetta il debounce di 3s, ma pusha subito. Se l'utente chiude la finestra entro 3s, il cloud ha comunque il nuovo profilo.
  4. **Logging strutturato** in `applyRemoteData` durante il grace-period: logga field-by-field diff tra locale e cloud per debug futuro.
- **File toccati**: `src/lib/supabase.ts` (grace-period, logging, `markLocalProfileEdit`/`isLocalProfileEditRecent`), `src/lib/store.ts` (`mergeProfiles` con last-write-wins su `photoUrl`, `setUserProfile` con `forceCloudSync` immediata), `src/components/producer-profile.tsx` (handler `handlePhotoFileUpload` che chiama `setUserProfile`).
- **Anti-regressione test**: nessun test automatico ancora (richiede mock realtime Supabase channels). Verificare manualmente caricando una foto e controllando in console che appaia il log "Realtime update within grace period" con i diff corretti.

### Dati utente (email, note, link) spariscono dopo reload
- **Sintomo**: Si modificano email/notes/link di una label, si ricarica la pagina, tutto perso
- **Causa**: Race condition in Zustand persist rehydration — seed data sovrascriveva i dati utente prima che rehydration finisse
- **Fix**: persist v9+ con flag `_rehydrated` che blocca setItem finché non finisce, merge semplice che NON tocca mai dati utente persistiti, backup debounced (60s) non mirrorato
- **Stato**: Storico, risolto a v2.1.1. Persist ora a v18.
- **File**: `src/lib/store.ts`

### Profilo perso dopo re-login
- **Sintomo**: Dopo logout + login, il profilo utente è vuoto
- **Causa**: 3 bug — cloud merge non preservava profile, loadFromCloud sovrascriveva locale vuoto, saveFromLocal non caricava profile
- **Fix**: commit `9880184` (persist aware merge) + `76a7a13` (content-aware merge)
- **File**: `src/lib/store.ts`

---

## 📧 EMAIL / Gmail

### Gmail invia spazzatura — "(nessun oggetto)" + header MIME nel body
- **Sintomo**: Click su "Invia direttamente da Gmail" → arriva email con subject "(nessun oggetto)", body contiene `Content-Type: text/plain...` ecc.
- **Causa**: Array di header MIME aveva elementi stringa vuota → creavano righe vuote → terminavano header section troppo presto
- **Fix**: commit `03f4d17` (2026-06-25) — costruisci array solo con righe non vuote, join con `\r\n`, poi `\r\n\r\n` + body
- **File**: `src/lib/gmail.ts` (`sendEmail`, `sendReplyInThread`)

### Pitch inviato è quello sbagliato (single-track invece di multi-track EP)
- **Sintomo**: Preview mostra multi-track, ma l'email inviata ha un solo link
- **Causa**: `effectivePitchSubject`/`effectivePitchBody` ignoravano `demo.pitchText` e rigeneravano con `trackName="Demo"` + `link`
- **Fix**: commit `03f4d17` — priorità a `demo.pitchText` quando esiste
- **File**: `src/components/demo-tracker.tsx`

### Dettaglio demo mostra un solo link SoundCloud per pitch multi-traccia
- **Sintomo**: Demo EP con 3 tracce → dialog mostra solo 1 link SC
- **Causa**: UI leggeva `demo.link` invece di `demo.pitchTracks[]`
- **Fix**: commit `19d0fc8` (2026-06-25) — `displayTracks` memo con fallback chain a 4 livelli, UI render multi-traccia
- **File**: `src/components/demo-tracker.tsx`, `src/lib/pitch-utils.ts`, `src/lib/store.ts` (campo `pitchTracks`)

### iOS/PWA popup Gmail fallisce senza messaggio chiaro
- **Sintomo**: Su iPhone PWA, click "Invia da Gmail" → fallisce silenziosamente
- **Fix**: commit `cbe50ba` — messaggi di errore strutturati per iOS/PWA
- **File**: `src/lib/gmail.ts`

---

## 🎵 NAVIGAZIONE / UX

### Classifiche → label → perdi la classifica di partenza
- **Sintomo**: Clicchi Classifiche → scegli genere → clicchi label → si apre scheda MA la classifica sottostante sparisce, vai su Label Finder
- **Causa**: `handleOpenLabel` chiamava `setActiveTab("labels")` → unmountava RankingsPage → stato (genere, scroll) perso
- **Fix**: commit `084bc37` (2026-06-25) — RankingsPage + LabelFinder sempre montati con CSS `hidden`, handleOpenLabel non cambia tab, dialog Radix portal si sovrappone
- **File**: `src/app/page.tsx`, `src/components/rankings-page.tsx`

### Nomi label invisibili su mobile nella tabella classifiche
- **Sintomo**: Su mobile, tabella classifiche → nomi label non si vedono
- **Fix**: commit `059d2d8` — layout mobile table
- **File**: `src/components/rankings-page.tsx`

### "NUOVA" mostrato per label già presenti (stable incumbents)
- **Sintomo**: Label che erano #1 da sempre mostrate come "NUOVA"
- **Causa**: prevRankByGenre veniva clobbered con rank identico
- **Fix**: commit `70ec2e0` — mostra "—" invece di "NUOVA" per stable
- **File**: `src/components/rankings-page.tsx`

### "no history" alert mentre cloud sync sta caricando
- **Sintomo**: Appena aperta app → "no ranking history" anche se c'è
- **Causa**: Alert mostrato durante caricamento cloud sync
- **Fix**: commit `f9781a8`
- **File**: `src/components/rankings-page.tsx`

### "Salva" ambiguo (Salva vs Scarica Backup vs Salva modifiche)
- **Sintomo**: 3 pulsanti "Salva" diversi, l'utente non sa quale fa cosa
- **Fix**: commit `61652dc` — etichette disambiguate
- **File**: `src/components/label-finder.tsx`, `src/components/data-backup.tsx`

### "Accedi" invisibile su mobile
- **Sintomo**: Su mobile, bottone "Accedi" non visibile
- **Fix**: commit `b78dfee` — bottone sempre visibile, utility in hamburger menu
- **File**: `src/app/page.tsx`

### Onboarding mostrato anche se profilo già compilato
- **Fix**: commit `06a4fb6` — skip welcome modal se profilo ha già dati
- **File**: `src/components/welcome-onboarding.tsx`

### Link SoundCloud Privato precompilato col link del profilo
- **Sintomo**: Campo "Link SC Privato" nel pitch form precompilato con il link del profilo utente — non deve
- **Fix**: commit `e2539bc` (2026-06-24)
- **File**: `src/components/pitch-generator.tsx`, `src/components/label-finder.tsx`

---

## 💥 CRASH / Stabilità

### App crasha completamente (white screen)
- **Sintomo**: App bianca, nessun errore visibile
- **Fix**: commit `044669f` — ErrorBoundary + guard defensive
- **File**: `src/components/error-boundary.tsx`, vari componenti

### Crash su mobile aprendo scheda label con URL lunghi
- **Sintomo**: Su mobile, apri dettaglio label con URL lungo → crash
- **Causa**: URL lunghi causavano render thrashing
- **Fix**: commit `34ecb67` — auto-shorten URL in display + throttle
- **File**: `src/components/label-finder.tsx`

### Crash su label con dati corrotti (toLowerCase su null)
- **Sintomo**: Crash random navigando label
- **Causa**: `toLowerCase()` su label.name/label.email nulli
- **Fix**: commit `e322699` — guard toLowerCase + throttle backup quota
- **File**: `src/lib/store.ts`, vari

### Dialog "Aggiungi Demo" crasha
- **Fix**: commit `795f613` + `73ce79a` (4 fix UX)
- **File**: `src/components/demo-tracker.tsx`

### Definizione duplicata di handleAnalyzeFile
- **Sintomo**: Errore compile/runtime — funzione definita 2 volte
- **Fix**: commit `c3eb4bd` + `d7ffb50`
- **File**: `src/components/demo-tracker.tsx`

---

## ☁️ CLOUD / SYNC

### Post-login "no charts" — dati Beatport spariti
- **Sintomo**: Dopo login, rankings vuote
- **Causa**: Cloud merge non preservava i campi Beatport (rankByGenre, pointsByGenre, etc.)
- **Fix**: commit `50e74f1` — preserve Beatport data fields in cloud merge
- **File**: `src/lib/store.ts`

### Sync cloud perdeva dati tra dispositivi
- **Sintomo**: Modifiche fatte su PC non apparivano sul telefono
- **Causa**: Cloud merge sovrascriveva invece di unire
- **Fix**: commit `0b0eed0` — union by id in cloud merge
- **File**: `src/lib/store.ts`

### Cloud sync sovrascriveva cloud con local vuoto
- **Sintomo**: Login su device nuovo → cloud azzerato
- **Fix**: commit `76a7a13` — content-aware merge, never overwrite cloud with empty local
- **File**: `src/lib/store.ts`

### Login Vercel rotto (force-static su [...nextauth])
- **Sintomo**: Login Google non funziona su Vercel
- **Causa**: `export const dynamic = "force-static"` su route nextauth — la rendeva 404 statica
- **Fix**: commit `7942562` — rimosso force-static da [...nextauth]
- **File**: `src/app/api/auth/[...nextauth]/route.ts`
- **⚠️ LEZIONE**: NON aggiungere MAI `force-static` a [...nextauth]. Per build statiche, usare `scripts/build-static.sh` che muove `src/app/api/` fuori durante il build.

### Cloud merge non includere imageUrl/slug/beatportId
- **Sintomo**: Loghi label non apparivano dopo sync
- **Fix**: commit `6915afc`
- **File**: `src/lib/store.ts`

### Auto-upload su cloud non funzionava (sync artisti)
- **Fix**: commit `feecbf5` — sempre mergiare cloud+locale + sync artisti
- **File**: `src/lib/store.ts`

---

## 🔊 AUDIO

### Seek bar audio non funziona (Infinity duration)
- **Sintomo**: La seek bar del player audio non si muove
- **Causa**: `duration` tornava `Infinity` per stream senza metadata
- **Fix**: commit `5d2e62a` — seekable.end() + drag + keyboard
- **File**: `src/components/demo-tracker.tsx`, `src/components/label-finder.tsx`

### Audio analysis sempre "Sconosciuta" + 100% Energy/Dance
- **Sintomo**: Audio analysis dà key "Sconosciuta" e Energy/Danceability sempre 100%
- **Causa**: essentia.js WASM non si caricava mai
- **Fix**: commit `1711925` — load WASM properly
- **File**: `src/lib/audio-analysis.ts`, `src/components/demo-tracker.tsx`

---

## 🔔 NOTIFICHE PUSH

### UI push non sincronizzata con subscription reale
- **Sintomo**: Toggle "notifiche attive" ON ma notifiche non arrivano
- **Causa**: UI basata su stato locale, non su subscription effettiva
- **Fix**: commit `281f24b` — use PushSubscription as source of truth
- **File**: `src/components/notification-settings.tsx`

---

## 📦 PWA / Service Worker

### Banner "Aggiorna" non funzionante
- **Sintomo**: Click su "Aggiorna" per nuova versione → non fa nulla
- **Fix**: commit `ec2454f` — refactor SWUpdater + sw v6
- **File**: `src/components/sw-updater.tsx`, `public/sw.js`

---

## 🏷️ LABELS / DATI

### Label seed mostrava "1976 accettano demo" falsamente
- **Sintomo**: Label seed (400 labels) mostravano "accettano demo" anche se non lo sappiamo
- **Causa**: Campo `status` defaultato a "open" per tutte le seed
- **Fix**: commit `addbee3` (2026-06-24) — introdotto stato "unknown"
- **File**: `src/lib/labels-data.json`, `src/lib/store.ts`, `src/components/label-finder.tsx`

### Loghi label mancanti su scraper v2/v3
- **Fix**: commit `499b72f` — explicit logo acquisition in scraper prompts
- **File**: `scripts/beatport-scraper-v2.js`, `public/scraper-v3.js`

### Import non passava artists[] e tracks[]
- **Fix**: commit `296ad06`
- **File**: `src/lib/store.ts`

### Import defaultava isCustom=true per label Beatport
- **Fix**: commit `5ffe975`
- **File**: `src/lib/store.ts`

---

## 🎤 PITCH / CAMPAIGN

### (vedi sopra: Link SC Privato precompilato, Pitch inviato sbagliato)

### EP single-link vs multi-link mode
- **Feature**: commit `76d3b12` — EP mode con link unico SC o link separati per traccia
- **File**: `src/components/pitch-generator.tsx`, `src/lib/pitch-utils.ts`, `src/lib/store.ts`

### Bozze/Inviati sub-tabs + save-as-draft
- **Feature**: commit `8fc7630`
- **File**: `src/components/pitch-generator.tsx`, `src/lib/store.ts`

### Demo picker + EP multi-select in label detail
- **Feature**: commit `aa7b0fe`
- **File**: `src/components/label-finder.tsx`

---

## 🚀 DEPLOY

### Deploy Vercel falliva con API body errato
- **Fix**: commit `a7364c3` — use tested Vercel API body + poll by deployment ID
- **File**: `scripts/deploy.sh`

### Build statico fallisce su route API
- **Sintomo**: `NEXT_EXPORT=true next build` → errore "force-static not configured on /api/..."
- **Causa**: Next.js 16 richiede `force-static` su ogni route per `output: export`, MA metterlo su [...nextauth] rompe il login Vercel
- **Fix**: usare `scripts/build-static.sh` che muove `src/app/api/` fuori durante il build, poi ripristina
- **File**: `scripts/build-static.sh`
- **⚠️ LEZIONE**: NON patchare le route API con `force-static`. Usare sempre `build-static.sh`.

---

## 📝 WORKFLOW — Come aggiornare questo file

Quando si risolve un bug:

1. **Durante il fix**: appunti su sintomo osservato dall'utente, causa tecnica, file toccati
2. **Dopo il commit**: aggiungere una entry in cima alla sezione appropriata con formato:
   ```
   ### Titolo sintomo (lingua utente)
   - **Sintomo**: cosa vede l'utente
   - **Causa**: perché succedeva
   - **Fix**: commit `abc1234` (data) — breve descrizione
   - **File**: `path/file.tsx`
   ```
3. **Commit**: includere BUG_REGISTRY.md nello stesso commit del fix

Quando si indaga un nuovo bug:

1. **PRIMA cosa**: `grep -i "parola_chiave_sintomo" /home/z/my-project/BUG_REGISTRY.md`
2. Se match → verificare che il fix sia ancora in produzione (git log, codebase)
3. Se regression → investigare perché il fix è stato rimosso/rotto
4. Se no match → procedere con indagine normale, poi aggiungere entry

---

## 🛡️ PROTOCOLLO ANTI-REGRESSIONE (OBBLIGATORIO)

> **SCOPO**: Evitare che un fix fatto oggi venga rotto domani da un'altra
> sessione che tocca gli stessi file. Questo protocollo è **obbligatorio**
> per ogni fix che l'agente fa d'ora in poi.

### Prima di iniziare a fixare (VERIFICA PRE-FIX)

1. `grep -i "<parola_chiave_sintomo>" BUG_REGISTRY.md` — il bug è già stato risolto?
2. Se sì → il fix è ancora nel codice? (`git log --oneline -- <file>` + leggi il file)
3. Se il fix è presente ma il bug si ripresenta → **regressione**. Prima di fixare di nuovo:
   - `git log --oneline -- <file>` per trovare commit recenti che lo hanno toccato
   - `git diff <commit_fix>..HEAD -- <file>` per vedere cosa è cambiato dopo il fix
   - Identifica ESATTAMENTE quale commit/numero di riga ha rotto il fix
   - Il nuovo fix deve proteggere da quel tipo specifico di regressione, non solo ripristinare

### Prima di committare (VERIFICA POST-FIX) — OBBLIGATORIA

Per ogni file `F` modificato in questo commit:

1. `grep -B 2 -A 4 "<path di F>" BUG_REGISTRY.md` — trova tutte le entry passate che toccano `F`
2. Per ogni entry trovata:
   - Apri il file `F` e verifica che il fix passato sia **ancora presente** nel codice
   - Se NON è presente → **STOP, non committare**. La tua modifica ha rimosso un fix passato.
   - Ripristina il fix passato dal suo commit originale prima di committare il tuo
3. Solo quando tutti i fix passati sui file toccati sono verificati → commit

### Esempio concreto

Sto fixando un bug in `src/lib/gmail.ts`:

```bash
# 1. Prima del fix — il bug è già noto?
grep -i "gmail\|email\|mime" BUG_REGISTRY.md
# → trovo "Gmail invia spazzatura", commit 03f4d17

# 2. Il fix è ancora in produzione?
git log --oneline -- src/lib/gmail.ts
# → vedo 03f4d17 in cima, ok

# 3. Faccio il mio nuovo fix in gmail.ts
# ... edit ...

# 4. PRIMA di commit — verifico che il fix 03f4d17 sia ancora lì
grep -n "non-empty\|filter.*line\|\\\\r\\\\n\\\\r\\\\n" src/lib/gmail.ts
# → trovo ancora la logica di costruzione header sicura, ok

# 5. Ora posso committare
```

### Cosa fare se scopro una regressione

1. **NON limitarmi a ripristinare il vecchio fix** — verrebbe rimosso di nuovo dalla prossima sessione
2. **Capire perché è stato rimosso**: conflitto con un'altra feature? Refactoring? Bug fixing parallelo?
3. **Aggiungere protezione extra**:
   - Se il fix era una guard `if (x) return` → aggiungere anche un test runtime che lanci errore se manca
   - Se il fix era in una funzione pura → estrarla in un file separato che nessuno toccherà
   - Se il fix era in un componente UI → aggiungere commento `// ⚠️ CRITICAL FIX — see BUG_REGISTRY.md "sintomo" — do not remove`
4. **Documentare la regressione** in BUG_REGISTRY.md sotto la entry esistente, con data e causa

### Impegno dell'agente

Ogni volta che l'agente (io) fa un fix, dice esplicitamente all'utente:
> "Verifica anti-regressione: ho controllato N fix passati sui file che ho toccato.
> Tutti presenti: ✅. Nuova entry aggiunta a BUG_REGISTRY.md."

Se non può dirlo → non ha seguito il protocollo → chiedere all'utente di pretenderlo.
