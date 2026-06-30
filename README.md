# LabelPulse - Development and Deployment

## Obiettivo
LabelPulse è una app SaaS in sviluppo:
- `Next.js` frontend
- `Supabase` per dati utente e sincronizzazione
- `Vercel` per deploy e produzione
- `GitHub` per versionamento, commit e bug tracking

Il flusso deve essere ripetibile su qualsiasi macchina: codici, bugfix, deploy e dati utente devono restare tracciati.

## Comandi principali

### Avviare l'app in sviluppo
Usa il vero server `next dev`:
```bash
cd /workspaces/labelpulse
npm run dev -- --port 3001
```

Poi apri nel browser il link del port forwarding fornito da Codespaces, oppure:
```bash
http://localhost:3001
```

> Se stai lavorando in GitHub Codespaces remoto, `localhost` è l'ambiente remoto: usa il link del pannello Ports.

### Avviare il server statico legacy
Questa è un'opzione di fallback, non il flusso principale:
```bash
cd /workspaces/labelpulse
npm run dev:static
```

### Build di produzione
```bash
cd /workspaces/labelpulse
npm run build
```

### Build statica
```bash
cd /workspaces/labelpulse
npm run build:static
```

## Variabili d'ambiente locali
Crea un file `.env.local` nella root del progetto con almeno queste variabili:

```env
NEXT_PUBLIC_SUPABASE_URL=https://<project-ref>.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=<anon-public-key>
SUPABASE_SERVICE_ROLE_KEY=<service-role-key>
```

Per l'autenticazione Google/NextAuth locale (login) aggiungi anche:

```env
GOOGLE_CLIENT_ID=<google-oauth-client-id>
GOOGLE_CLIENT_SECRET=<google-oauth-client-secret>
NEXTAUTH_SECRET=<random-secret-string>
NEXTAUTH_URL=http://localhost:3001
```

### Nota sul login
Se non imposti `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` e `NEXTAUTH_SECRET`, il login fallirà con errori di NextAuth.

Per il test locale:
- usa Google OAuth se vuoi login con Google
- oppure usa il login Beta Code se hai codici generati sul progetto

## Workflow consigliato

1. Lavora in locale con `npm run dev -- --port 3001`
2. Fai modifiche, test e verifica
3. Commit con messaggio chiaro
4. Aggiorna `BUG_REGISTRY.md` e `worklog.md` per ogni fix
5. Pusha su `main`
6. Vercel ridistribuisce il sito live

## Url di riferimento
- Produzione/beta: `https://my-project-ivory-nine.vercel.app`
- Locale: usa il port forwarding di Codespaces o `http://localhost:3001`

## Note importanti
- Questo repository richiede `Supabase` configurato per i dati utente
- Il login locale richiede variabili aggiuntive di NextAuth
- Tutti i bug fix devono essere tracciati con commit + `BUG_REGISTRY.md` + `worklog.md`
