# LABELPULSE FINAL ARCHITECTURE

Architettura definitiva di LabelPulse dopo il completamento del refactoring pianificato in `LABELPULSE_REFACTORING_PLAN_v1.0.md`.

Questo documento non descrive lo stato attuale (analizzato in `LABELPULSE_SYSTEM_ARCHITECTURE_SPECIFICATION_v1.0` audit). Descrive lo stato **target** verso cui migrare. Ogni scelta è motivata in relazione alla `LABELPULSE_COSTITUZIONE.md`.

---

## 1. ARCHITETTURA COMPLETA FINALE

### 1.1 Principi fondanti

L'architettura finale si regge su quattro principi non negoziabili, derivati direttamente dalla Costituzione:

1. **Single Source of Truth** — ogni dato persistente ha un solo proprietario (Supabase PostgreSQL), una sola tabella, un solo flusso di lettura, un solo flusso di scrittura.
2. **Cloud-only** — il browser è un visualizzatore. Non memorizza dati utente in modo persistente. L'app funziona solo online.
3. **RLS come barriera di sicurezza** — l'isolamento multi-tenant è garantito a livello database da Row Level Security, non da filtri lato applicazione.
4. **Accesso dati unificato** — un solo layer di accesso dati per entità. I componenti UI non parlano mai direttamente con Supabase.

### 1.2 Stack tecnologico finale

| Layer | Tecnologia | Ruolo |
|-------|------------|-------|
| Frontend | Next.js 16 (App Router) + React + TypeScript | Rendering UI, routing |
| Autenticazione | Supabase Auth (Google OAuth) + NextAuth come bridge sessione | Identità utente |
| State management (sessione) | React Context + hook dedicati | Stato in memoria per la sessione corrente |
| Accesso dati | Custom hook per entità (`useDemos`, `useLabels`, ecc.) | Singolo punto di lettura/scrittura per tabella |
| Backend | Next.js API Routes (serverless) | Endpoint REST per operazioni che richiedono service_role admin |
| Database | Supabase PostgreSQL | Unica fonte di verità |
| Sicurezza | Row Level Security per-user | Isolamento multi-tenant a livello database |
| Realtime | Supabase Realtime (opzionale, solo lettura globale) | Aggiornamento classifiche live |

### 1.3 Componenti rimossi dall'architettura attuale

I seguenti componenti, presenti nell'architettura attuale, **non esistono** nell'architettura finale:

- Zustand `persist` middleware (nessuna persistenza locale)
- `idbStorage` adapter (nessun IndexedDB per dati utente)
- `robustStorage` custom StateStorage (nessun backup localStorage)
- `auto-backup.ts` (nessuno snapshot locale)
- `outbox.ts` (nessuna coda offline)
- `app_state` riga personale `id='<email>'` (nessun JSON blob utente)
- `syncToCloud` / `forceCloudSync` / `saveStateToCloud` (nessun sync legacy)
- `mergeGlobalAndPersonalCloud` / `mergeGlobalWithPersonal` (nessun merge multi-sorgente)
- `verifyStorageOwner` / `OWNER_KEY` (isolamento garantito da RLS)
- `getAdminClient` con fallback service_role/anon (solo JWT utente)
- `pauseOutboxFlush` / `resumeOutboxFlush` (nessuna coda da pausare)
- Sidecar backup (`SNAPSHOTS_BACKUP_KEY`, `PROFILE_BACKUP_KEY`, `ARTISTS_SIDECAR_KEY`)
- `emergencyClearLocalStorage` (nessun localStorage da svuotare)
- `markLocalProfileEdit` (nessuna logica "preserva locale per N secondi")

---

## 2. FLUSSO DATI

### 2.1 Flusso di lettura (apertura app)

```
1. Utente apre l'app
   ↓
2. NextAuth verifica sessione (cookie httpOnly)
   ↓ sessione valida?
   ├─ NO → redirect a /auth (login Google)
   └─ SI → continua
   ↓
3. Supabase Auth valida JWT (refresh se scaduto)
   ↓
4. Hook `useAppData()` (singolo hook di boot) esegue:
   ├─ fetch classifiche globali (app_state id='global', sola lettura)
   ├─ fetch user_profiles (WHERE user_id = auth.uid())
   ├─ fetch demo_submissions (WHERE user_id = auth.uid())
   ├─ fetch label_personal_data (WHERE user_id = auth.uid())
   ├─ fetch pitch_campaigns (WHERE user_id = auth.uid())
   └─ fetch user_releases (WHERE user_id = auth.uid())
   ↓
5. Popolamento AppStateContext (in memoria, sessione corrente)
   ↓
6. Render UI con dati dal cloud
   ↓
7. Pronto per interazione
```

**Caratteristiche del flusso:**
- **Sequenziale, non parallelo** — i fetch possono essere in parallelo tra loro, ma il render avviene solo dopo che TUTTI sono completati.
- **Nessun timeout** — se Supabase non risponde, l'utente vede loading indefinito con pulsante "Riprova".
- **Nessun fallback locale** — se il fetch fallisce, errore esplicito. Nessun dato stale da IndexedDB.
- **Singolo `setState`** — i dati vengono caricati tutti in una volta nello stato, non incrementalemente.

### 2.2 Flusso di scrittura (modifica utente)

```
1. Utente modifica un campo (es. aggiunge un demo)
   ↓
2. Componente UI chiama hook dedicato: `const { createDemo } = useDemos(); await createDemo(demo);`
   ↓
3. Hook esegue fetch POST /api/demos
   ├─ UI mostra stato "salvataggio..." (loading locale)
   └─ Stato NON ancora aggiornato (no optimistic)
   ↓
4. API route valida sessione NextAuth + JWT Supabase
   ↓
5. API route esegue query Supabase con JWT utente (RLS attiva)
   ↓
6. Supabase verifica RLS (user_id = auth.uid())
   ↓ RLS passa?
   ├─ NO → 403, errore esplicito all'utente
   └─ SI → scrittura su PostgreSQL
   ↓
7. Supabase ritorna riga confermata
   ↓
8. API route ritorna 200 + dato confermato
   ↓
9. Hook aggiorna AppStateContext SOLO con il dato confermato
   ↓
10. UI mostra dato aggiornato + "salvato" feedback
    ↓
11. (Opzionale) Supabase Realtime broadcasta a altri device
```

**Caratteristiche del flusso:**
- **Non ottimistico** — l'UI non si aggiorna finché il cloud non conferma.
- **Nessuna coda** — se la rete fallisce, errore esplicito. La modifica non viene salvata "per dopo".
- **RLS obbligatoria** — ogni scrittura passa per RLS, anche se l'API route ha già verificato la sessione. Defense in depth.
- **Audit log** — trigger PostgreSQL popola `audit_log` per ogni INSERT/UPDATE/DELETE.

### 2.3 Flusso multi-device

```
Device A: modifica demo → POST /api/demos → Supabase (RLS) → audit_log
                                                                    ↓
Device B: login → fetch demo_submissions (WHERE user_id = auth.uid())
                     ↓
                     vede il demo modificato da Device A
```

Non c'è sync attiva tra device. Ogni device legge dal cloud all'apertura. Realtime (opzionale) può aggiornare device B se è già aperto, ma non è obbligatorio.

---

## 3. GESTIONE AUTENTICAZIONE

### 3.1 Stack auth

- **Supabase Auth** — provider primario di identità (Google OAuth)
- **NextAuth** — bridge per la sessione browser (cookie httpOnly), non come fonte di verità

### 3.2 Flusso di login

```
1. Utente clicca "Accedi con Google"
   ↓
2. NextAuth reindirizza a Google OAuth
   ↓
3. Google ritorna id_token + access_token
   ↓
4. NextAuth callback (`auth-options.ts`):
   ├─ Crea sessione NextAuth (cookie httpOnly)
   └─ scambia id_token con Supabase via signInWithIdToken
      ↓
      Supabase ritorna: access_token (JWT, 1h) + refresh_token
      ↓
      NextAuth salva entrambi nella sessione (server-side, httpOnly)
   ↓
5. Redirect a / (app)
   ↓
6. useAppData() boot: legge JWT da sessione, fetcha dati
```

### 3.3 Gestione scadenza JWT

Il JWT Supabase scade dopo 1 ora. Nell'architettura finale:

```
API route riceve richiesta
  ↓
getSupabaseClient(session):
  ├─ legge access_token dalla sessione NextAuth
  ├─ verifica scadenza (decode JWT, check exp)
  ├─ se scaduto:
  │   ├─ legge refresh_token dalla sessione
  │   ├─ chiama supabase.auth.refreshSession({ refresh_token })
  │   ├─ se successo: nuovo access_token, aggiorna sessione NextAuth
  │   └─ se fallito: ritorna 401 "Sessione scaduta, rifai login"
  └─ se valido: usa access_token come Authorization header
  ↓
Query Supabase con RLS attiva
```

**Non c'è fallback service_role per le route utente.** Solo `/api/admin/*` e `/api/cron/*` usano service_role (legittimo: admin-side).

### 3.4 Multi-tenant

L'isolamento è garantito a livello database da RLS:

```sql
-- Esempio: demo_submissions
CREATE POLICY "users_select_own" ON demo_submissions
  FOR SELECT USING (user_id = auth.uid());

CREATE POLICY "users_insert_own" ON demo_submissions
  FOR INSERT WITH CHECK (user_id = auth.uid());

CREATE POLICY "users_update_own" ON demo_submissions
  FOR UPDATE USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "users_delete_own" ON demo_submissions
  FOR DELETE USING (user_id = auth.uid());
```

Anche se un'API route avesse un bug (es. dimentica `.eq("user_id", ...)`), RLS blocca la lettura/scrittura di dati altrui. La sicurezza non dipende dall'applicazione.

### 3.5 Logout

```
1. Utente clicca "Logout"
   ↓
2. NextAuth signOut() → elimina cookie sessione
   ↓
3. Supabase auth.signOut() → invalida JWT lato server
   ↓
4. AppStateContext reset (stato in memoria azzerato)
   ↓
5. Redirect a /auth
```

Niente da pulire in localStorage/IndexedDB (non c'è nulla da pulire).

---

## 4. GESTIONE LETTURA DATI

### 4.1 Pattern unificato

Ogni entità ha un hook dedicato che è l'**unico** punto di lettura:

```typescript
// Esempio: useDemos
function useDemos() {
  const { demos, setDemos } = useAppState();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/demos');
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setDemos(data.demos);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [setDemos]);

  return { demos, loading, error, refresh };
}
```

### 4.2 Boot iniziale

Un hook `useAppData()` (chiamato una sola volta in `layout.tsx`) orchestra il caricamento iniziale:

```typescript
function useAppData() {
  const { data: session, status } = useSession();
  const [bootState, setBootState] = useState<'loading' | 'ready' | 'error'>('loading');
  const [bootError, setBootError] = useState<string | null>(null);

  useEffect(() => {
    if (status !== 'authenticated') return;

    (async () => {
      try {
        const [rankings, profile, demos, labels, pitches, releases] = await Promise.all([
          fetch('/api/rankings').then(r => r.json()),
          fetch('/api/profile').then(r => r.json()),
          fetch('/api/demos').then(r => r.json()),
          fetch('/api/label-data').then(r => r.json()),
          fetch('/api/pitches').then(r => r.json()),
          fetch('/api/releases').then(r => r.json()),
        ]);

        // Singolo setState con tutti i dati
        useAppState.getState().setAll({
          labels: mergeGlobalAndPersonal(rankings.labels, labels.labels),
          demos: demos.demos,
          userProfile: profile.profile,
          savedPitches: pitches.pitches.filter(p => p.status === 'draft'),
          sentCampaigns: pitches.pitches.filter(p => p.status === 'sent'),
          releases: releases.releases,
          rankingSnapshots: rankings.snapshots,
          rankingsUpdatedAt: rankings.updatedAt,
        });

        setBootState('ready');
      } catch (err) {
        setBootError(err.message);
        setBootState('error');
      }
    })();
  }, [status, session?.user?.email]);

  return { bootState, bootError };
}
```

### 4.3 Lettura classifiche globali

Le classifiche Beatport sono dati globali (sola lettura per gli utenti). Vengono lette dalla riga `app_state id='global'`:

```sql
-- API route /api/rankings GET
SELECT data, updated_at FROM app_state WHERE id = 'global';
```

Policy RLS: `FOR SELECT USING (id = 'global')` — tutti possono leggere la riga globale, nessuno può scriverla (eccetto admin via service_role).

### 4.4 Realtime (opzionale)

Per aggiornare le classifiche live quando l'admin pusha nuovi dati:

```typescript
// useRankingsRealtime()
useEffect(() => {
  const channel = supabase
    .channel('global-rankings')
    .on('postgres_changes',
      { event: 'UPDATE', schema: 'public', table: 'app_state', filter: 'id=eq.global' },
      (payload) => {
        // Aggiorna solo le classifiche, non tutto lo stato
        useAppState.getState().setLabels(payload.new.data.labels);
        useAppState.getState().setRankingSnapshots(payload.new.data.rankingSnapshots);
      }
    )
    .subscribe();

  return () => { supabase.removeChannel(channel); };
}, []);
```

Realtime è **solo per la riga globale**. Non ci sono subscription a tabelle personali (l'utente vede i propri cambiamenti immediatamente perché è lui a farli).

---

## 5. GESTIONE SCRITTURA DATI

### 5.1 Pattern unificato

Ogni entità ha un hook dedicato che è l'**unico** punto di scrittura:

```typescript
// Esempio: useDemos
function useDemos() {
  const { demos, setDemos } = useAppState();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const createDemo = useCallback(async (demo: NewDemo) => {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch('/api/demos', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(demo),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || `HTTP ${res.status}`);
      }
      const data = await res.json();
      // Aggiorna stato SOLO con dato confermato
      setDemos(prev => [...prev, data.demo]);
      return data.demo;
    } catch (err) {
      setError(err.message);
      throw err; // propaga al componente per feedback UI
    } finally {
      setSaving(false);
    }
  }, [setDemos]);

  return { demos, saving, error, createDemo, updateDemo, deleteDemo };
}
```

### 5.2 Caratteristiche del pattern

- **Non ottimistico** — `setDemos` viene chiamato solo dopo `res.ok`.
- **Stato `saving`** — l'UI mostra "salvataggio..." durante la richiesta.
- **Errore esplicito** — se la richiesta fallisce, `error` viene settato e propagato al componente.
- **Nessuna coda** — non c'è retry automatico. L'utente vede l'errore e può ritentare manualmente.
- **Dato confermato** — lo stato viene aggiornato con il dato ritornato dal cloud, non con quello inviato (il cloud potrebbe aver modificato timestamp, id, ecc.).

### 5.3 API Route pattern

```typescript
// /api/demos POST
export async function POST(req: NextRequest) {
  const supabase = await getSupabaseClient(); // JWT utente, RLS attiva
  if (!supabase) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

  const body = await req.json();
  const { trackName, labelId, link, ... } = body;

  // Validazione
  if (!trackName || !labelId) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
  }

  // Scrittura con RLS — user_id viene dal JWT, non dal body
  const { data, error } = await supabase
    .from('demo_submissions')
    .insert({
      id: genId(),
      user_id: (await supabase.auth.getUser()).data.user.id,
      track_name: trackName,
      label_id: labelId,
      link,
      ...
    })
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ demo: data });
}
```

### 5.4 Scrittura classifiche (admin-only)

Le classifiche sono dati globali. Solo l'admin può scriverle:

```typescript
// /api/admin/push-rankings POST
export async function POST(req: NextRequest) {
  // Verifica admin
  const session = await getServerSession(authOptions);
  if (!ADMIN_EMAILS.has(session.user.email)) {
    return NextResponse.json({ error: 'Admin only' }, { status: 403 });
  }

  // Service role — bypassa RLS per scrivere sulla riga globale
  const supabase = createClient(url, SERVICE_ROLE_KEY);
  const { error } = await supabase
    .from('app_state')
    .upsert({ id: 'global', data: globalPayload, updated_at: new Date().toISOString() });

  ...
}
```

L'uso di service_role è legittimo qui perché:
1. La rotta è admin-only (verifica sessione + email whitelist)
2. La scrittura è sulla riga globale, non su dati utente
3. RLS non può usare `auth.uid()` per la riga globale (non ha owner)

---

## 6. GESTIONE STATO FRONTEND

### 6.1 Stato in memoria per la sessione

Lo stato frontend è **solo in memoria**, non persistito. Vive in un React Context:

```typescript
// AppStateContext
interface AppState {
  // Dati utente (letti dal cloud al boot, modificati dalle azioni)
  demos: Demo[];
  labels: Label[];
  userProfile: UserProfile;
  savedPitches: SavedPitch[];
  sentCampaigns: SentCampaign[];
  releases: Release[];
  rankingSnapshots: RankingSnapshot[];
  rankingsUpdatedAt: string | null;
  locale: Locale;

  // Stato UI
  activeTab: Tab;
  selectedLabelId: string | null;
  selectedArtistId: string | null;

  // Stato boot
  bootState: 'loading' | 'ready' | 'error';
  bootError: string | null;
}

const AppStateContext = createContext<AppState>();
```

### 6.2 Ciclo di vita dello stato

```
Mount app
  ↓
bootState = 'loading'
  ↓
useAppData() fetcha tutto dal cloud
  ↓
setAll(data) → stato popolato
  ↓
bootState = 'ready'
  ↓
Utente interagisce (modifica, aggiunta, eliminazione)
  ↓
Hook dedicato esegue API route
  ↓
Stato aggiornato con dato confermato (solo se successo)
  ↓
Unmount app (chiusura tab, refresh, logout)
  ↓
Stato perso (non c'è persistenza)
  ↓
Prossima apertura: nuovo boot dal cloud
```

### 6.3 Refresh pagina

Al refresh (F5), lo stato in memoria viene perso. Il boot ricomincia:
1. NextAuth verifica cookie sessione (ancora valido)
2. `useAppData()` rifetcha tutto dal cloud
3. Stato ripopolato

L'utente vede loading per ~1-2 secondi, poi i dati. Non ci sono "flash" di dati stale perché non c'è persistenza locale.

### 6.4 Logout

```
Logout → NextAuth signOut → cookie eliminato → stato azzerato → redirect /auth
```

Niente da pulire in localStorage/IndexedDB. Il prossimo utente che fa login sullo stesso device parte da stato vuoto, popolato dal cloud.

---

## 7. MOTIVAZIONE TECNICA DI OGNI LAYER

### 7.1 Next.js API Routes

**Perché:** serviranno come layer server-side per:
- Validare la sessione NextAuth prima di toccare Supabase
- Eseguire operazioni che richiedono service_role (admin push classifiche, cron job)
- Aggregare dati da multiple tabelle in un singolo round-trip
- Nascondere la logica di business dal client

**Perché non chiamate Supabase dirette dal client:** la specifica (sezione 10) richiede che i componenti UI non parlino direttamente con Supabase. Le API route sono il layer intermedio.

### 7.2 Supabase Auth (con NextAuth bridge)

**Perché Supabase Auth:** è l'unico modo per avere JWT che RLS riconosce via `auth.uid()`. Senza Supabase Auth, RLS non può isolare per-user a livello database.

**Perché NextAuth bridge:** NextAuth gestisce la sessione browser (cookie httpOnly) meglio di Supabase Auth nativo (che usa localStorage, violando la Costituzione). Il bridge `signInWithIdToken` scambia il Google id_token con un JWT Supabase, salvato server-side nella sessione NextAuth.

### 7.3 Supabase PostgreSQL + RLS

**Perché PostgreSQL:** è il database relazionale di Supabase. Supporta RLS, trigger (per audit log), foreign keys (user_id → auth.users).

**Perché RLS:** è l'unico meccanismo che garantisce isolamento multi-tenant a livello database. Anche se l'applicazione ha un bug, RLS blocca l'accesso ai dati altrui. La Costituzione (sezione 6) esige RLS, non filtri lato client.

### 7.4 React Context (AppStateContext)

**Perché:** serve un modo per condividere lo stato tra componenti senza prop drilling. Context è il meccanismo nativo React.

**Perché non Redux/Zustand:** vedi sezione 8.

### 7.5 Custom hook per entità

**Perché:** la Costituzione (sezione 4) richiede "un solo layer di accesso dati per tabella". Gli hook dedicati (`useDemos`, `useLabels`, ecc.) sono quel layer. I componenti UI usano solo questi hook, non accedono mai direttamente a Supabase o allo store.

---

## 8. MOTIVAZIONE DEL RIMOZIONE DI ZUSTAND

### 8.1 Stato attuale: Zustand con persist

Nell'architettura attuale, Zustand è usato con il middleware `persist` per salvare lo stato su IndexedDB. Questo viola direttamente la Costituzione (sezione 3: "Vietati: localStorage persistente, IndexedDB persistente, Zustand persist").

### 8.2 Decisione: rimuovere Zustand

Nell'architettura finale, **Zustand viene rimosso**. Sostituito da React Context + hook dedicati.

### 8.3 Motivazione tecnica

1. **Tentazione della persistenza** — Zustand `persist` è così facile da usare che ogni sviluppatore futuro sarebbe tentato di riattivarlo "solo per un campo". Rimuovendo Zustand, si rimuove la tentazione. React Context non ha middleware persist nativi.

2. **API implicitamente ottimistica** — Zustand `set()` è sincrono e ottimistico. Nell'architettura finale, le scritture devono essere confermate dal cloud prima di aggiornare lo stato. Context + hook async rendono questo pattern naturale; con Zustand bisognerebbe combattere contro la API nativa.

3. **Single source of truth** — Zustand crea uno "store" che è una fonte di verità separata dal cloud. Anche senza persist, l'abitudine di leggere da `useAppStore(selector)` invece che da `useDemos()` disincentiva l'uso degli hook dedicati. Context è più "verboso" e spinge naturalmente verso hook dedicati.

4. **Complessità non necessaria** — Zustand eccelle per app con stato complesso e molti aggiornamenti concorrenti. LabelPulse ha stato semplice (liste di dati utente) aggiornato da azioni utente esplicite. Context è sufficiente.

5. **Conformità architetturale** — la Costituzione (sezione 4) descrive l'architettura come "React UI → Custom Hooks → Supabase Client → PostgreSQL". Zustand non compare. La sua presenza è debito tecnico.

### 8.4 Cosa si perde rimuovendo Zustand

- **Selector memoization** — Zustand ottimizza i re-render con selector. Con Context, serve `useMemo` o split context. Soluzione: split context per entità (DemoContext, LabelContext, ecc.) se le performance lo richiedono.
- **Middleware ecosystem** — Zustand ha middleware per devtools, logging, ecc. Con Context, si implementa manualmente o si usa React DevTools nativo.

### 8.5 Verifica: Context è sufficiente?

LabelPulse ha:
- ~6 entità dati (demos, labels, profile, pitches, releases, rankings)
- ~10 componenti principali che leggono questi dati
- Aggiornamenti espliciti (l'utente clicca, non realtime ad alta frequenza)

Context è sufficiente per questo carico. Se in futuro si aggiungono realtime ad alta frequenza (es. chat), si valuterà Zustand per quella specifica entità, ma senza persist.

---

## 9. MOTIVAZIONE DEL RIMOZIONE DI CONTEXT ESISTENTI

### 9.1 Stato attuale: AuthProvider + toast + altri Context

L'architettura attuale usa Context per:
- `AuthProvider` (NextAuth session)
- Toast notifications
- Theme (se presente)

### 9.2 Decisione: mantenere AuthProvider, aggiungere AppStateContext

- **AuthProvider (NextAuth)** — mantenuto. È il bridge sessione browser.
- **AppStateContext (nuovo)** — aggiunto. Contiene lo stato app in memoria (demos, labels, profile, ecc.).
- **Toast/Theme Context** — mantenuti se presenti (non sono dati utente, non violano la Costituzione).

### 9.3 Motivazione

- Context è il meccanismo React nativo per stato condiviso. Non ha persistenza (a differenza di Zustand persist).
- `AuthProvider` è richiesto da NextAuth, non possiamo rimuoverlo.
- `AppStateContext` è il sostituto di Zustand per lo stato app in memoria.

### 9.4 Struttura Context finale

```
AuthProvider (NextAuth)
  └─ AppStateContext (stato app in memoria)
       ├─ demos: Demo[]
       ├─ labels: Label[]
       ├─ userProfile: UserProfile
       ├─ savedPitches: SavedPitch[]
       ├─ sentCampaigns: SentCampaign[]
       ├─ releases: Release[]
       ├─ rankingSnapshots: RankingSnapshot[]
       ├─ activeTab, selectedLabelId, selectedArtistId (UI state)
       └─ bootState, bootError (boot status)
```

I componenti UI usano:
```typescript
const { demos } = useAppState(); // legge stato
const { createDemo } = useDemos(); // esegue azione
```

---

## 10. MOTIVAZIONE DELLA RIMOZIONE DI TUTTE LE CACHE

### 10.1 Stato attuale: multiple cache

L'architettura attuale ha:
- Zustand persist su IndexedDB (cache principale)
- localStorage backup (cache secondaria)
- Sidecar localStorage (cache terziaria per snapshots, profile, artists)
- Auto-backup IndexedDB (cache quaternaria)
- Outbox IndexedDB (cache scritture fallite)

### 10.2 Decisione: eliminare tutte le cache

Nell'architettura finale, **nessuna cache persistente** esiste lato client.

### 10.3 Motivazione

1. **Regola Zero violata** — ogni cache è una seconda fonte di verità. La Costituzione (sezione 0) vieta esplicitamente "copie parallele, cache persistenti o fonti duplicate di verità".

2. **Race condition inevitabili** — multiple cache che competono per la sincronizzazione generano race condition (il bug `currentState` non definito, il merge che sovrascrive, ecc.). Eliminando le cache, si eliminano le race condition.

3. **Dati stale** — le cache mostrano dati vecchi quando il cloud ha dati nuovi. L'utente vede "classifiche ferme al 2 luglio" perché la cache locale non si è aggiornata. Senza cache, l'utente vede sempre il dato cloud.

4. **QuotaExceededError** — localStorage ha 5MB di limite su iOS. Le cache sforano il limite e causano errori silenziosi. Senza cache, nessun errore di quota.

5. **Complessità** — ~2000 righe di codice in `store.ts` sono dedicate a gestire le cache (backup, recovery, merge, migration). Eliminandole, il codice diventa mantenibile.

### 10.4 Cache temporanea in memoria (consentita)

L'unica "cache" consentita è lo stato in memoria per la sessione corrente (AppStateContext). Non è persistente: scompare al refresh/logout. È un "riflesso temporaneo" del dato cloud, come richiede la Costituzione (sezione 3: "Stato React/hook in memoria durante la sessione è ammesso SOLO come riflesso temporaneo").

### 10.5 Cache HTTP (consentita)

Le risposte delle API route possono usare cache HTTP standard (`Cache-Control: no-store` per dati utente, `max-age` per dati globali statici). Questa è cache HTTP, non cache applicazione. Non viola la Costituzione perché:
- È gestita dal browser, non dall'app
- È invalidabile via `Cache-Control`
- Non crea una "fonte di verità" separata (è solo un'ottimizzazione di rete)

### 10.6 Trade-off accettati

Eliminando le cache:
- **Refresh più lento** — ogni refresh richiede fetch dal cloud (~1-2s). Accettabile per un'app online-only.
- **Offline = errore** — senza rete, l'app non funziona. Richiesto dalla Costituzione (sezione 2.1).
- **Più richieste rete** — ogni azione è una richiesta. Mitigato da fetch parallele al boot e cache HTTP per globali.

---

## 11. DIAGRAMMA COMPLETO FINALE

```
┌─────────────────────────────────────────────────────────────────────┐
│                           BROWSER (client)                          │
│                                                                     │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │  React UI (Next.js App Router)                              │   │
│  │  ┌───────────────────────────────────────────────────────┐  │   │
│  │  │  Componenti UI                                        │  │   │
│  │  │  (demo-tracker, label-finder, producer-profile, ...)  │  │   │
│  │  │  NON parlano direttamente con Supabase                │  │   │
│  │  └──────────────────────────┬────────────────────────────┘  │   │
│  │                              │ usano                          │   │
│  │                              ▼                                │   │
│  │  ┌───────────────────────────────────────────────────────┐  │   │
│  │  │  Custom Hook per entità                                │  │   │
│  │  │  useDemos()  useLabels()  useProfile()  usePitches()   │  │   │
│  │  │  useReleases()  useRankings()                          │  │   │
│  │  │  UNICO layer di accesso dati per tabella               │  │   │
│  │  └──────────────────────────┬────────────────────────────┘  │   │
│  │                              │ leggono/scrivono               │   │
│  │                              ▼                                │   │
│  │  ┌───────────────────────────────────────────────────────┐  │   │
│  │  │  AppStateContext (React Context, in memoria)           │  │   │
│  │  │  demos, labels, profile, pitches, releases, rankings   │  │   │
│  │  │  NESSUNA persistenza (scomparisce al refresh/logout)   │  │   │
│  │  └───────────────────────────────────────────────────────┘  │   │
│  └─────────────────────────────────────────────────────────────┘   │
│                              │                                      │
│                              │ fetch HTTP (JWT nell'header)         │
│                              ▼                                      │
└──────────────────────────────┬──────────────────────────────────────┘
                               │
                               ▼ HTTPS
┌─────────────────────────────────────────────────────────────────────┐
│                    VERCEL (serverless)                               │
│                                                                     │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │  Next.js API Routes                                         │   │
│  │  /api/demos  /api/label-data  /api/profile  /api/pitches    │   │
│  │  /api/releases  /api/rankings  /api/admin/push-rankings     │   │
│  │                                                             │   │
│  │  ┌─────────────────────────────────────────────────────┐   │   │
│  │  │  getSupabaseClient(session)                         │   │   │
│  │  │  - legge JWT da sessione NextAuth                   │   │   │
│  │  │  - refresha se scaduto (usa refresh_token)          │   │   │
│  │  │  - NESSUN fallback service_role (route utente)      │   │   │
│  │  │  - service_role SOLO per /api/admin/* e /api/cron/* │   │   │
│  │  └─────────────────────────────────────────────────────┘   │   │
│  └──────────────────────────────┬──────────────────────────────┘   │
│                                 │                                    │
│                                 │ Supabase JS client (JWT utente)    │
│                                 ▼                                    │
└─────────────────────────────────┬───────────────────────────────────┘
                                  │
                                  ▼
┌─────────────────────────────────────────────────────────────────────┐
│                    SUPABASE (cloud, unica fonte di verità)           │
│                                                                     │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │  Supabase Auth                                               │   │
│  │  - Google OAuth provider                                     │   │
│  │  - auth.users (UUID id, email)                               │   │
│  │  - JWT issue + refresh                                       │   │
│  └─────────────────────────────────────────────────────────────┘   │
│                                                                     │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │  PostgreSQL + RLS                                            │   │
│  │  ┌─────────────────────────────────────────────────────┐   │   │
│  │  │  Tabelle utente (con user_id UUID, RLS auth.uid())  │   │   │
│  │  │  - user_profiles (1 riga per utente)                │   │   │
│  │  │  - demo_submissions (N righe per utente)            │   │   │
│  │  │  - label_personal_data (N righe per utente)         │   │   │
│  │  │  - pitch_campaigns (N righe per utente)             │   │   │
│  │  │  - user_releases (N righe per utente)               │   │   │
│  │  │  - push_subscriptions (N righe per utente)          │   │   │
│  │  └─────────────────────────────────────────────────────┘   │   │
│  │  ┌─────────────────────────────────────────────────────┐   │   │
│  │  │  Tabelle globali (sola lettura per utenti)          │   │   │
│  │  │  - app_state id='global' (classifiche, snapshots)   │   │   │
│  │  │  - beatport_snapshots, beatport_chart_history       │   │   │
│  │  │  - followed_artists                                 │   │   │
│  │  └─────────────────────────────────────────────────────┘   │   │
│  │  ┌─────────────────────────────────────────────────────┐   │   │
│  │  │  Audit (trigger automatici)                         │   │   │
│  │  │  - audit_log (user_id, action, table, record, ts)   │   │   │
│  │  └─────────────────────────────────────────────────────┘   │   │
│  └─────────────────────────────────────────────────────────────┘   │
│                                                                     │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │  Realtime (opzionale, solo riga globale)                     │   │
│  │  - channel 'global-rankings'                                 │   │
│  │  - broadcast UPDATE su app_state id='global'                 │   │
│  └─────────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────┘
```

### 11.1 Flusso di lettura (rappresentazione)

```
[Browser] Componente UI
    │
    │ usa useDemos()
    ▼
[Browser] useDemos hook
    │
    │ legge da AppStateContext
    ▼
[Browser] AppStateContext (in memoria)
    │
    │ se boot non fatto: fetch /api/demos
    ▼
[Vercel] /api/demos GET
    │
    │ getSupabaseClient(session) → JWT utente
    ▼
[Supabase] SELECT * FROM demo_submissions WHERE user_id = auth.uid()
    │
    │ RLS verifica: user_id = auth.uid() ✓
    ▼
[Supabase] ritorna righe
    │
    ▼
[Vercel] 200 OK + { demos: [...] }
    │
    ▼
[Browser] setDemos(data) → AppStateContext aggiornato
    │
    ▼
[Browser] Componente UI re-render con dati
```

### 11.2 Flusso di scrittura (rappresentazione)

```
[Browser] Utente clicca "Salva demo"
    │
    ▼
[Browser] Componente UI chiama await createDemo(demo)
    │
    │ UI mostra "salvataggio..."
    │ stato NON ancora aggiornato
    ▼
[Browser] useDemos.createDemo()
    │
    │ fetch POST /api/demos
    ▼
[Vercel] /api/demos POST
    │
    │ getSupabaseClient(session) → JWT utente
    ▼
[Supabase] INSERT INTO demo_submissions (user_id, ...) VALUES (auth.uid(), ...)
    │
    │ RLS verifica: user_id = auth.uid() ✓
    │ Trigger: popola audit_log
    ▼
[Supabase] ritorna riga confermata
    │
    ▼
[Vercel] 200 OK + { demo: {...} }
    │
    ▼
[Browser] setDemos(prev => [...prev, demo]) → stato aggiornato
    │
    ▼
[Browser] UI re-render + "salvato" feedback
```

---

## 12. VERIFICA COERENZA CON LA COSTITUZIONE

| Sezione Costituzione | Architettura finale | Conforme? |
|----------------------|---------------------|-----------|
| 0. Regola Zero (single source of truth) | Solo Supabase, nessuna cache locale | ✓ |
| 2.1 Solo online | Nessuna logica offline, errore esplicito se offline | ✓ |
| 2.2 Cloud-first assoluto | Flusso: Browser → API route → Supabase | ✓ |
| 2.3 Zero persistenza locale | Stato solo in memoria (Context), no localStorage/IndexedDB | ✓ |
| 2.4 Scrittura immediata | Hook async, stato aggiornato solo dopo conferma cloud | ✓ |
| 2.5 Lettura sempre da Supabase | Boot fetcha tutto dal cloud, refresh = nuovo boot | ✓ |
| 2.6 Multi-tenant rigoroso | RLS con `user_id = auth.uid()` su ogni tabella | ✓ |
| 2.7 Separazione globali/personali | Tabelle globali (admin-only) vs tabelle utente (RLS) | ✓ |
| 2.8 Modifiche label per-utente | `label_personal_data` tabella dedicata, RLS per-user | ✓ |
| 3. Data Ownership Matrix | Ogni tabella ha `user_id`, owner chiaro | ✓ |
| 4. Architettura obbligatoria | UI → Hook → API route → Supabase (no store diretto) | ✓ |
| 5. Flusso operativo standard | Modifica → API route → conferma → stato; boot → fetch → render | ✓ |
| 6. Gestione errori | Errore esplicito, nessun silent catch, nessuna coda | ✓ |
| 9. Divieti assoluti | Nessun storage locale, nessun bypass RLS, nessuna copia | ✓ |
| 10. Criteri di successo | Cross-device, multi-user, RLS, cloud-only | ✓ |

---

## 13. RISCHI RESIDUI E MITIGAZIONI

### 13.1 Latenza di boot

**Rischio:** ogni apertura app richiede 6 fetch paralleli (~1-2s).
**Mitigazione:** fetch paralleli, loading UI, cache HTTP per globali.

### 13.2 Offline = app inutilizzabile

**Rischio:** senza rete, nessun dato visibile.
**Mitigazione:** richiesto dalla Costituzione. Errore esplicito con pulsante "Riprova".

### 13.3 JWT scaduto

**Rischio:** sessione > 1 ora, JWT scaduto, 401 su ogni richiesta.
**Mitigazione:** refresh token flow in `getSupabaseClient`. Se refresh fallisce, redirect a login.

### 13.4 Carico Supabase

**Rischio:** ogni azione utente = 1 richiesta Supabase. Con molti utenti, carico elevato.
**Mitigazione:** Supabase Pro plan supporta il carico. Monitorare con Supabase Dashboard.

### 13.5 Perdita dati se scrittura fallisce

**Rischio:** utente modifica, rete cade, modifica persa.
**Mitigazione:** richiesto dalla Costituzione. L'utente vede errore esplicito e può ritentare. Nessuna coda offline.

---

## 14. CONCLUSIONE

L'architettura finale è **coerente con la Costituzione** in tutti i 14 punti verificati. Le scelte chiave sono:

1. **Supabase come unica fonte di verità** — nessuna cache locale
2. **RLS come barriera di sicurezza** — `user_id = auth.uid()` su ogni tabella
3. **React Context + hook dedicati** — sostituisce Zustand, nessuna persistenza
4. **API route come layer intermedio** — UI non tocca Supabase direttamente
5. **JWT Supabase con refresh** — nessun fallback service_role per route utente
6. **Errore esplicito su fallimento** — nessuna coda, nessun silent catch

L'architettura è **più semplice** di quella attuale (~2000 righe di codice storage rimosse) e **più sicura** (RLS obbligatoria, nessun bypass). Il trade-off è l'impossibilità di funzionare offline, che è esplicitamente richiesto dalla Costituzione.

---

**Fine del documento.**

Questa è l'architettura target verso cui il `LABELPULSE_REFACTORING_PLAN_v1.0.md` migra. Nessuna modifica al codice è stata effettuata. Solo progettazione.
