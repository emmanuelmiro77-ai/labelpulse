# 🚀 BOOT — Istruzioni per l'agente AI

> **⚠️ AGENTE: LEGGI QUESTO FILE PER PRIMO ALL'INIZIO DI OGNI SESSIONE.**
>
> Se stai leggendo questo file, significa che l'utente ti ha appena detto
> qualcosa come "leggi BOOT.md" oppure hai ricevuto un summary che lo menziona.
>
> Segui i passi sotto nell'ordine indicato. NON saltare passi. NON indagare
> bug prima di aver completato il boot completo.

## ⚡ BOOT SEQUENCE (OBBLIGATORIA)

### Passo 1 — Esegui lo script di boot

```bash
bash /home/z/my-project/scripts/agent-boot.sh
```

Lo script stampa:
- Stato del progetto (versione, branch, commit)
- Ultimi 15 commit
- Quale file di memoria esiste e dove
- Ultimi 10 Task ID nel worklog
- Tutti i bug critici risolti (titoli)
- File modificati negli ultimi 7 giorni (regressioni potenziali)
- Stato del deploy locale
- Commit non pushati

### Passo 2 — Leggi la documentazione permanente

Dopo lo script, leggi IN ORDINE:

1. **`/home/z/my-project/AGENT_CONTEXT.md`** — overview del progetto, architettura, regole critiche
2. **`/home/z/my-project/BUG_REGISTRY.md`** — tutti i bug risolti, indicizzati per sintomo
3. **Tail di `/home/z/my-project/worklog.md`** (ultime 200 righe) — attività recente

### Passo 3 — Verifica lo stato corrente

```bash
# Verifica che GitHub sia allineato
cd /home/z/my-project && git status

# Verifica che il server locale sia attivo
curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/
```

Se ci sono commit non pushati → segnalarlo all'utente e chiedere se pushare.
Se il server non risponde → proporre di avviarlo con `bash run-server.sh`.

---

## 🐛 QUANDO L'UTENTE SEGNALA UN BUG

### Step 1 — Cerca nel registry PRIMA di indagare

```bash
grep -i "<parola_chiave_sintomo>" /home/z/my-project/BUG_REGISTRY.md
```

**Esempi**:
- L'utente dice "le demo si mischiano tra account" → `grep -i "account\|mischian" BUG_REGISTRY.md`
- L'utente dice "gmail invia spazzatura" → `grep -i "gmail\|spazzatura" BUG_REGISTRY.md`
- L'utente dice "classifica sparisce" → `grep -i "classifica\|sparisc" BUG_REGISTRY.md`

### Step 2 — Se trovi un match

1. Apri BUG_REGISTRY.md e leggi la entry completa
2. Verifica che il fix sia ancora nel codice:
   ```bash
   git log --oneline -- <file citato nella entry>
   grep -n "<snippet del fix>" <file citato>
   ```
3. Se il fix è presente ma il bug si ripresenta → **regressione**:
   - `git log --oneline -- <file>` per vedere commit recenti sul file
   - `git diff <commit_fix>..HEAD -- <file>` per vedere cosa è cambiato dopo
   - Identifica il commit che ha rotto il fix
4. Se il fix NON è presente → è stato rimosso:
   - `git show <commit_fix> -- <file>` per vedere com'era
   - Ripristina + aggiungi protezione extra (vedi protocollo in BUG_REGISTRY.md)

### Step 3 — Se NON trovi match

Procedi con l'indagine normale. **Dopo aver risolto**, aggiungi una entry in BUG_REGISTRY.md:
- Sintomo (lingua dell'utente)
- Causa
- Fix (commit hash + descrizione)
- File toccati

---

## 🛡️ PRIMA DI COMMITTARE OGNI FIX (OBBLIGATORIO)

Per ogni file `F` che hai modificato in questo commit:

```bash
# Trova tutti i fix passati che toccano il file
grep -B 2 -A 4 "<path di F>" /home/z/my-project/BUG_REGISTRY.md
```

Per ogni entry trovata:
1. Apri il file `F`
2. Verifica che il fix passato sia **ancora presente** nel codice
3. Se NON è presente → **STOP, non committare**
4. Ripristina il fix passato dal suo commit originale

Solo quando tutti i fix passati sui file toccati sono verificati → commit.

Dopo il commit, conferma esplicitamente all'utente:
> "✅ Verifica anti-regressione: ho controllato N fix passati sui file che ho toccato. Tutti presenti. Nuova entry aggiunta a BUG_REGISTRY.md."

---

## 📦 DOPO AVER RISOLTO UN BUG

1. **Commit** il codice fixato con messaggio `fix(scope): descrizione`
2. **Aggiungi entry** in BUG_REGISTRY.md nello stesso commit
3. **Aggiungi entry** in worklog.md (Task ID + Work Log + Stage Summary)
4. **Push** su GitHub: `git push origin main`
5. **Rebuild** se serve per il server locale: `bash scripts/build-static.sh`
6. **Conferma** all'utente: cosa hai fixato, dove, e che la verifica anti-regressione è stata fatta

---

## 🆕 QUANDO AGGIUNGI UNA FEATURE

Stesso flusso dei bug, ma:
- Commit message: `feat(scope): descrizione`
- Aggiungi entry in `worklog.md` con dettagli implementativi
- Non serve entry in BUG_REGISTRY.md (è per i bug, non per le feature)

---

## 📂 STRUTTURA DELLA MEMORIA

| File | Dove | Permanente? | Scopo |
|------|------|------------|-------|
| `BOOT.md` | GitHub + filesystem | ✅ Sì | Questo file — istruzioni per il boot |
| `AGENT_CONTEXT.md` | GitHub + filesystem | ✅ Sì | Overview progetto + architettura + regole |
| `BUG_REGISTRY.md` | GitHub + filesystem | ✅ Sì | Bug risolti per sintomo → causa → fix |
| `worklog.md` | GitHub + filesystem | ✅ Sì | Log cronologico append-only di ogni task |
| `VERSIONS.md` | GitHub + filesystem | ✅ Sì | Release version history |
| `scripts/agent-boot.sh` | GitHub + filesystem | ✅ Sì | Script che stampa lo stato della memoria |
| `scripts/seed-agent-memory.py` | GitHub + filesystem | ✅ Sì | Rigenera il seed SQL da BUG_REGISTRY.md |
| `scripts/log-agent-memory.sh` | GitHub + filesystem | ✅ Sì | Logga un singolo nuovo bug → SQL + BUG_REGISTRY entry |
| **Supabase `agent_memory`** | Cloud (Supabase) | ✅ Sì | Backup cloud query-able. **41 entry già popolate** il 2026-06-25 |
| Git history | GitHub | ✅ Sì | Commit messages con convenzione `fix(scope):` / `feat(scope):` |

**Tutti questi file sono su GitHub** → permanenti → accessibili da qualsiasi sessione futura.
**La tabella Supabase è il mirror cloud query-able** → basta un `SELECT` per ritrovare qualsiasi bug passato.

---

## ❓ DOMANDE FREQUENTI DELL'UTENTE

**"Perché in una nuova chat non ti ricordi i bug già risolti?"**
Perché la memoria conversazionale tra sessioni è solo un summary lossy.
Per questo esiste questo file — dì all'inizio della chat "leggi BOOT.md"
oppure "esegui scripts/agent-boot.sh" e io saprò tutto.

**"Come faccio a sapere che hai fatto il boot?"**
Ti dico esplicitamente: "✅ Boot completato: letti AGENT_CONTEXT.md,
BUG_REGISTRY.md (N entry), worklog tail. Ultimo commit: <hash>. Pronto."

Se non ti dico questo → chiedimi "hai fatto il boot?".

**"I fix possono comunque rompersi?"**
Sì, se una sessione futura modifica lo stesso file e non rispetta il protocollo
anti-regressione. Per questo è OBBLIGATORIO che io, prima di ogni commit,
verifichi che i fix passati sui file che sto toccando siano ancora presenti.

Se vuoi una garanzia al 100%, possiamo aggiungere test automatici
(Vitest/Playwright) — ma richiede qualche ora di setup. Chiedi se lo vuoi.

---

## 📊 STATO CORRENTE DEL PROGETTO (aggiornato 2026-06-29)

### Architettura dati — DUE sistemi in parallelo (transizione)

```
SISTEMA VECCHIO (deprecato, in fase di rimozione):
  localStorage (5MB) ↔ app_state (blob JSONB su Supabase)
  ⚠️ Problemi: QuotaExceededError, no cross-device, no RLS vera

SISTEMA NUOVO (FASE C+D, operativo):
  API routes (NextAuth + JWT Supabase) ↔ 4 tabelle dedicate con RLS
  ✅ demo_submissions, label_personal_data, pitch_campaigns, user_profiles
  ✅ RLS: USING (user_email = auth.jwt()->>'email') — isolamento 100%
  ✅ Realtime live per cross-device updates (1-2 secondi)
```

**Strategia dual write**: ogni operazione su store.ts scrive su ENTRAMBI i sistemi.
Quando la migrazione sarà completa, rimuoveremo il vecchio sistema.

### Fasi completate

| Fase | Cosa | Commit |
|------|------|--------|
| FASE 0 | Foundation (9 task) | `0eb9933` |
| FASE 1 | Beta Infra (5 task) | `0eb9933` |
| Security audit | 5 CRITICAL + H-8 + M-3 fixati | `244e0cf`, `dcc091d` |
| FASE A | Fix QuotaExceededError | `f2853e0` |
| FASE B | Fix savedPitches sync | `e85b14e` |
| FASE C | 4 tabelle dedicate + dual write + cross-device | `f719c03` → `88da254` |
| FASE D | Supabase Auth + RLS vera + realtime live | `446221e` → `65b61ad` |
| Migrazione | Script one-time app_state → nuove tabelle | `fb983ef` |

### Test superati (verificati)

- ✅ **Isolamento utenti**: GET /api/demos senza login → 401 Unauthorized, 0 demo
- ✅ **Bridge NextAuth→Supabase**: supabaseAccessToken presente nella sessione
- ✅ **Cross-device**: demo creato su PC lavoro → visibile su PC casa (stesso login)
- ✅ **QuotaExceededError recovery**: auto-cleanup sidecar + forceCloudSync

### Cosa NON toccare MAI (regole critiche)

1. ⚠️ Non rimuovere `--webpack` dal build script (Turbopack non genera source maps)
2. ⚠️ Non rimuovere `buildCommand` da `vercel.json`
3. ⚠️ Non riattivare filtro `QuotaExceededError` in bugsnag.ts (lo stiamo tracciando)
4. ⚠️ Non rimuovere il dual write da store.ts finché la migrazione non è completa
5. ⚠️ Non cancellare i dati da `app_state` finché non verifichiamo che le nuove tabelle hanno tutto

### File chiave da conoscere

- `src/lib/store.ts` — Zustand store con dual write (vecchio + nuovo sistema)
- `src/lib/supabase-admin.ts` — getAdminClient() con strategia JWT+fallback
- `src/lib/api-client.ts` — helper per chiamate alle nuove API routes
- `src/lib/auth-options.ts` — NextAuth con bridge a Supabase Auth
- `src/hooks/use-realtime-sync.ts` — realtime live per le 4 tabelle
- `src/app/api/demos/route.ts` — CRUD demo_submissions
- `src/app/api/label-data/route.ts` — CRUD label_personal_data
- `src/app/api/pitches/route.ts` — CRUD pitch_campaigns
- `src/app/api/profile/route.ts` — CRUD user_profiles
- `src/app/api/admin/migrate-appstate/route.ts` — migrazione one-time
- `supabase-schema-fase-c.sql` — schema 4 nuove tabelle con RLS

### TODO prossimi

1. **Eseguire migrazione dati**: `GET /api/admin/migrate-appstate` con BETA_ADMIN_TOKEN
2. **Verificare dati migrati** su Supabase Table Editor
3. **FASE 2 — Closed Beta**: recruitment 5-10 tester
4. **Setup PostHog**: manca API key su Vercel (NEXT_PUBLIC_POSTHOG_KEY)
5. **(Futuro) FASE E**: rimuovere vecchio sistema app_state per dati utente

---

## 🎯 PROMPT DA DARE ALL'AGENTE ALL'INIZIO DI UNA NUOVA CHAT

Copia-incolla questo testo all'inizio di una nuova chat:

```
Leggi il file /home/z/my-project/BOOT.md e seguilo.
Poi esegui scripts/agent-boot.sh per il boot completo della memoria.
Dimmi quando sei pronto e riassumi cosa sai.
```

Questo garantisce che l'agente abbia accesso a tutta la memoria permanente
su GitHub prima di iniziare qualsiasi lavoro.
