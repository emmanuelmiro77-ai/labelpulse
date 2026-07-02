# LabelPulse - Local Development

## Comandi principali

### Avvia l'app in sviluppo
Questa è la modalità corretta per sviluppare localmente:
```bash
cd /workspaces/labelpulse
npm run dev -- --port 3001
```
Poi apri:
```bash
http://localhost:3001
```

### Avvia il server statico (solo fallback)
Usalo solo se vuoi testare il server statico:
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

## Supabase
Assicurati che `.env.local` contenga:
```env
NEXT_PUBLIC_SUPABASE_URL=https://<project-ref>.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=<anon-public-key>
SUPABASE_SERVICE_ROLE_KEY=<service-role-key>
```

## Note
- Vercel deploy automatico dal branch `main` su `https://my-project-ivory-nine.vercel.app`
- `npm run dev` avvia il vero Next.js dev server
- `npm run dev:static` avvia il server statico legacy basato su `server.mjs`
