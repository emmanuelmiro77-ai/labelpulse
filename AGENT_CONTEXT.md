# LabelPulse - AI Agent Context File

> **PURPOSE**: This file allows any AI agent to resume work on this project in a new chat session.
> When starting a new chat, tell the agent: *"Read BOOT.md and follow it"*
>
> **⚠️ MANDATORY ON SESSION START**:
> 1. Read `BOOT.md` first (instructions for boot sequence)
> 2. Run `bash scripts/agent-boot.sh` (prints memory state summary)
> 3. Read this file (AGENT_CONTEXT.md) completely
> 4. Read `BUG_REGISTRY.md` completely — indexed by user-visible symptom
> 5. Read `worklog.md` tail (last 200 lines) for recent activity
> 6. ONLY THEN start investigating any reported bug — first grep BUG_REGISTRY.md for the symptom

**Last updated**: 2026-06-27

## Project Overview

**LabelPulse** is a PWA (Progressive Web App) for DJs and music producers to manage demo submissions to electronic music labels. It tracks labels, their Beatport rankings, demo submissions, and generates pitch emails.

- **Live URL**: https://labelpulse.vercel.app
- **Tech Stack**: Next.js 16.2.9 (Turbopack in dev, **webpack in production** per source maps complete), React, TypeScript, Zustand 5.x, Tailwind CSS 4, shadcn/ui, Supabase, Prisma (unused — was for earlier schema)
- **Deployment**: Vercel (auto-deploy via GitHub push to `main` branch, build command `npm run build` che forza `next build --webpack`)
- **Repo**: https://github.com/emmanuelmiro77-ai/labelpulse
- **Data Storage**: **Cloud-first via Supabase** — client-side localStorage (Zustand persist v18) as cache + Supabase table `user_data` for cloud sync. Multi-user isolation enforced (see `BUG_REGISTRY.md` → "cross-account contamination")
- **Local dev server**: `node server.mjs` on port 3000 (serves `/out/` static export)
- **Languages**: 6 locales (IT, EN, ES, DE, FR, PT) — primary UI language is Italian
- **Version**: 2.3.0

## Architecture

### State Management
- **`src/lib/store.ts`** — CRITICAL FILE. Zustand store with `persist` middleware.
  - Persist version **18** (migration chain v5→...→v18)
  - PRIMARY_KEY = `"labelpulse-storage"` (global, but cloud rows are per-user-email)
  - `partialize` controls which fields are persisted
  - `merge` function combines persisted state with current state on rehydration
  - `hardResetForUserSwitch()` — wipes ALL user data on login/logout (defends against cross-account contamination)
  - `buildLabelsFromData()` creates seed labels from `labels-data.json` with empty user fields
  - Cloud sync: `loadFromCloud()`, `forceCloudSync()`, `saveStateToCloud()` — all keyed by user email
  - `selectedLabelId` + `setSelectedLabelId()` — cross-tab navigation signal
  - `navigationReturnTo` — for Artist Explorer → Label Finder back-navigation

### Key Components
- **`src/app/page.tsx`** — Main page, tab navigation. **RankingsPage + LabelFinder are ALWAYS mounted** (one visible, one hidden via CSS `hidden`) so label detail dialog can overlay on Rankings page without losing chart state.
- **`src/components/label-finder.tsx`** (2500+ lines) — Label search/filter/detail (Dialog rendered via Radix portal), inline pitch form, EP multi-track support
- **`src/components/rankings-page.tsx`** (1280+ lines) — Beatport rankings chart, genre filter, movement filter, Spotlight risers
- **`src/components/demo-tracker.tsx`** — Demo submission tracking, multi-track SC links, DemoDetailDialog
- **`src/components/pitch-generator.tsx`** — Campaign Hub with Bozze/Inviati sub-tabs, EP modes, save-as-draft
- **`src/components/dashboard.tsx`** — Stats overview
- **`src/components/artist-explorer.tsx`** — Scraped artist data explorer
- **`src/components/data-backup.tsx`** — Export/Import with RankingsWizard
- **`src/components/rankings-wizard.tsx`** — 4-step guide for Beatport chart data import
- **`src/components/gmail-settings.tsx`** — Gmail OAuth integration (GIS popup flow)
- **`src/components/auto-save.tsx`** — File System Access API auto-save to local file
- **`src/components/sw-updater.tsx`** — Service worker update notifications (sw v6)
- **`src/components/cloud-sync-button.tsx`** — Manual cloud sync trigger
- **`src/components/cloud-recovery.tsx`** — Cloud diagnostics + "Pulizia completa account" (wipeCurrentUserCloudRow)
- **`src/components/welcome-onboarding.tsx`** — First-login onboarding (skipped if profile already has data)
- **`src/components/notification-settings.tsx`** — Web Push notifications (3 categories, per-user toggles)
- **`src/components/feedback-inbox.tsx`** — Beta feedback inbox with admin replies
- **`src/components/producer-profile.tsx`** — User profile (artistName, scLink, bio, photo — iOS photo cache busted)

### Key Lib Files
- **`src/lib/store.ts`** — Zustand store (CRITICAL — see above)
- **`src/lib/supabase.ts`** — Supabase client, `getCloudRowId()` returns null if no email (no more "default" row)
- **`src/lib/use-auth.ts`** — NextAuth bridge: hard reset on email change, loadFromCloud after reset, hard reset on logout
- **`src/lib/auth-options.ts`** — NextAuth config (Google provider)
- **`src/lib/gmail.ts`** — Gmail API helpers (sendEmail, sendReplyInThread with proper RFC 2822 MIME)
- **`src/lib/pitch-utils.ts`** — `generatePitchBody()`, `parseMultiTrackFromPitchText()`, `PitchTrackEntry` type
- **`src/lib/labels-data.json`** — Seed: ~1192 labels with Beatport rankings across 35 genres, status "unknown" by default
- **`src/lib/i18n.ts`** — All 6 locale translations (~200+ keys per locale)
- **`src/lib/push.ts`** — Web Push helpers (saveSubscription, removeSubscription, sendPushToUser)

### Label Data Structure (key fields)
```typescript
interface Label {
  id: string; name: string; genre: string;
  // USER-EDITABLE (these must NEVER be lost):
  emails: string[]; notes: string; website: string;
  demoLink: string; socialLink: string; soundcloudLink: string;
  contactInfo: string; status: "open"|"closed"|"unknown";
  // BEATPORT DATA (from rankings import):
  genres: string[]; rankByGenre: Record<string,number>;
  pointsByGenre: Record<string,number>; trending: boolean;
  trendingRankByGenre: Record<string,number>; trendingPointsByGenre: Record<string,number>;
  imageUrl?: string; slug?: string; beatportId?: string;
  isCustom?: boolean;
}

interface Demo {
  id: string; labelId: string; trackName: string; artistName: string;
  link: string; status: DemoStatus; sentDate?: string;
  pitchText?: string;        // full generated pitch text
  pitchSubject?: string;
  pitchTracks?: PitchTrackEntry[];  // multi-track EP entries
  // ... see store.ts for full interface
}

interface Release {
  // ... includes epSoundCloudUrl?: string
}
```

## Key Flows

### Cloud Sync (CRITICAL — multi-user isolation)
1. User logs in via Google (NextAuth) → `useAuthEffect` in `page.tsx` fires
2. `use-auth.ts` detects email change → calls `hardResetForUserSwitch()` BEFORE loadFromCloud
3. `hardResetForUserSwitch()` wipes: labels→seed, demos→[], releases→[], artists→[], userProfile→empty, gmailAuth→disconnected, rankingSnapshots→[], sidecar backups
4. `loadFromCloud()` fetches user's row from Supabase `user_data` table (keyed by email)
5. State is hydrated from cloud — local localStorage is now just a cache
6. On logout: `hardResetForUserSwitch()` + `setCurrentUserEmail(null)` so pending saves are skipped

### Rankings → Label Detail (overlay navigation)
1. User in RankingsPage clicks a label name
2. `handleOpenLabel(label)` sets `selectedLabelId` in store (does NOT switch tabs)
3. Always-mounted LabelFinder (hidden via CSS) sees `selectedLabelId` change in its useEffect
4. LabelFinder calls `openDetail(label)` → `<Dialog>` renders via Radix portal on top of RankingsPage
5. User closes dialog → still on RankingsPage with genre/scroll/sort state intact

### Pitch Workflow
- Single track: trackName + artistName + scLink → generatePitchBody()
- EP multi-track: pitchTracks[] (trackName, artistName, scLink per entry) + epLinkMode ("single"|"separate")
- EP single-link: one combined SC link (epSoundCloudUrl)
- Pitch form in: label-finder.tsx (inline) + pitch-generator.tsx (Campaign Hub)
- Send: copy to clipboard OR "Invia da Gmail" (uses gmail.ts sendEmail)

### Beatport Rankings Update
1. Admin runs `scripts/beatport-scraper-v2.js` or `public/scraper-v3.js` in Beatport DevTools
2. Scraper JSON uploaded to Supabase via `/api/snapshots/save`
3. Realtime pushes update to all clients → `rankingSnapshots` in store updates
4. RankingsPage re-renders with new data

### Gmail Integration
- Uses Google Identity Services (GIS) popup flow
- Client ID in `src/lib/gmail.ts`
- OAuth scope: `https://mail.google.com/` (full Gmail access for sending)
- Sends via Gmail API `users.messages.send` with RFC 2822 MIME (base64url encoded)
- **MIME format**: headers array (non-empty lines only) joined with `\r\n`, then `\r\n\r\n` + body

## Deployment

### Vercel (production)
- Auto-deploys from `main` branch push
- Native Next.js (NOT static export) — API routes work normally
- Env vars needed: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `NEXTAUTH_SECRET`, `BETA_ADMIN_TOKEN`, `SUPABASE_SERVICE_ROLE_KEY`, `NEXT_PUBLIC_APP_URL`

### Local static (port 3000)
- `bash scripts/build-static.sh` — builds static export (moves `src/app/api/` out during build, then restores)
- `node server.mjs` serves `/out/` on port 3000
- Or `bash run-server.sh` for auto-restart loop with `bunx serve`

```bash
# Standard git workflow:
cd /home/z/my-project
git add -A
git commit -m "fix(scope): description"
git push origin main
# Vercel auto-deploys

# Local static rebuild:
bash scripts/build-static.sh
# server.mjs auto-serves /out/
```

## Critical Rules (LESSONS LEARNED)

1. **NEVER add `export const dynamic = "force-static"` to `/api/auth/[...nextauth]/route.ts`** — breaks Vercel login. For static builds, use `scripts/build-static.sh` which moves the whole `src/app/api/` dir out temporarily.

2. **NEVER use `setActiveTab()` when the user should stay on the same page** — instead use a cross-component signal like `selectedLabelId` and let the target component open a Dialog (Radix portal renders to document.body, independent of mount point).

3. **`hardResetForUserSwitch()` MUST run BEFORE `loadFromCloud()`** on any email change — otherwise old user's data merges with new user's data via UNION-by-id and contaminates forever.

4. **Cloud merge must be content-aware** — never overwrite cloud with empty local, never union blindly (contaminated data never cleans up).

5. **When building static export, API routes need to be excluded** — `scripts/build-static.sh` handles this. Don't try to add `force-static` to each route (breaks Vercel).

6. **MIME emails: never leave empty header lines** — they terminate the header section early and leak headers into body.

7. **iOS PWA photo cache** — must bust cache with query param after upload, otherwise old photo shows.

8. **Zustand persist version** — currently v18. Bump only when changing persisted shape. Add migration function.

9. **User's primary language is Italian** — always respond in Italian. UI labels are in `src/lib/i18n.ts`.

10. **All files MUST live under `/home/z/my-project/`** — never write to /tmp, ~, or system dirs.

## Memory System (how to find past work)

| Artifact | Path | Purpose |
|----------|------|---------|
| **BOOT.md** | `/home/z/my-project/BOOT.md` | Istruzioni per il boot. **PRIMO FILE DA LEGGERE** in ogni sessione. |
| **scripts/agent-boot.sh** | `/home/z/my-project/scripts/agent-boot.sh` | Script che stampa stato completo della memoria. Eseguire all'inizio di ogni sessione. |
| **BUG_REGISTRY.md** | `/home/z/my-project/BUG_REGISTRY.md` | Searchable by symptom → cause → fix → file. **READ FIRST** when investigating any bug. |
| **AGENT_CONTEXT.md** | `/home/z/my-project/AGENT_CONTEXT.md` | This file. Project overview + architecture + rules. |
| **worklog.md** | `/home/z/my-project/worklog.md` | Chronological append-only log of every task. Read tail for recent activity. |
| **VERSIONS.md** | `/home/z/my-project/VERSIONS.md` | Release version history. |
| **Supabase `agent_memory` table** | Cloud (Supabase project) | Backup cloud query-able di BUG_REGISTRY. **POPOLATA** il 2026-06-25 con 41 entry (10 critical + 11 high + 16 medium + 4 feature). Vedi `supabase-schema-agent-memory.sql` (schema) + `scripts/seed-agent-memory.py` (rigenera seed) + `scripts/log-agent-memory.sh` (logga singolo bug). |
| **Git history** | `git log --oneline` | Commit messages with `fix(scope):` convention. |
| **Codebase** | `src/` | Source of truth. Always verify fixes are still in code. |

### Memoria permanente — flusso

1. **All'inizio di ogni sessione**: l'utente dice "leggi BOOT.md" → io leggo BOOT.md → eseguo `scripts/agent-boot.sh` → leggo AGENT_CONTEXT.md + BUG_REGISTRY.md + worklog tail → sono pronto
2. **Durante il lavoro**: quando fixo un bug o aggiungo feature, aggiungo entry in BUG_REGISTRY.md + worklog.md nello stesso commit
3. **Prima di committare**: eseguo la verifica anti-regressione (vedi protocollo in BUG_REGISTRY.md)
4. **Dopo il commit**: push su GitHub → memoria permanente ✅
5. **Backup cloud (ATTIVO)**: dopo ogni bug fix critico/high, logga anche nella tabella Supabase `agent_memory` usando `bash scripts/log-agent-memory.sh --type bug_fix --severity ... --title ... --description ...` → genera SQL pronto da incollare nel Supabase SQL Editor + aggiunge entry in BUG_REGISTRY.md. Tabella già popolata con 41 entry storiche (commit `80f786b`).

---

## BETA LAUNCH STRATEGY (aggiunto 2026-06-26)

### 📋 ROADMAP UFFICIALE — `/home/z/my-project/BETA_ROADMAP.md`
Documento permanente su GitHub che traccia la sequenza di lavoro dalla fase amatoriale
alla fase SaaS commerciale profittevole. Contiene:
- **6 fasi numerate** (Foundation → Beta Infra → Closed Beta → Iteration → GA Prep → GA Launch)
- **Unit economics**: costi per fase, break-even a 50 utenti, proiezioni anno 1 (€4.800-6.800 netto)
- **Criteri GO/NO-GO** espliciti per passare da una fase alla successiva
- **Stato avanzamento** aggiornato dopo ogni task completato

🟡 **Stato attuale**: FASE 0 — Foundation in corso (40%). Punto 0.2 (Bugsnag) ✅, Punto 0.3 (PostHog) ✅ codice pronto, Punto 0.4 (Discord) ✅ guida + bot pronti. Prossimo: Punto 0.5 (NDA + screening form).

### ⚠️ TODO CRITICO UTENTE (entro 14 giorni dal 2026-06-26)
- **Bugsnag Trial 14 giorni**: verificare in Settings → Billing che dopo il trial si auto-downgradi a Free (€0). Se auto-converte a paid ($80+/mese), creare nuovo progetto Free + cambiare API key in Vercel env vars (`NEXT_PUBLIC_BUGSNAG_API_KEY` + `BUGSNAG_API_KEY`).

### Documenti di riferimento
- **PDF strategico integrato**: `/home/z/my-project/download/labelpulse-beta-strategy.pdf` (~18 pagine, 35KB)
- **Report beta testing dettagliato**: `/home/z/my-project/research-output/report-beta-testing.md` (383 righe)
- **Report licensing/anti-piracy dettagliato**: `/home/z/my-project/research-output/licensing-security-report.md` (541 righe)
- **Report pricing competitor**: `/home/z/my-project/research-output/pricing-models-report.md`

### Stack raccomandato (completo)
- **Auth**: NextAuth + Supabase Auth (già presente)
- **Billing**: Lemon Squeezy (MoR, 5% + 50¢, VAT EU automatico) → migrazione a Stripe Billing sopra $5K MRR
- **License check**: API route `/api/license/verify` + Supabase `subscriptions` table + RLS
- **Device binding**: 3 device Pro / 10 device Label, FingerprintJS open-source solo per audit log
- **Error tracking**: ✅ Bugsnag installato e operativo (free tier, 7.5K errori/mese + 7.5K perf spans/mese). Vedere `src/lib/bugsnag.ts` + `src/components/bugsnag-error-boundary.tsx`. Pagina test: `/debug`.
- **Analytics + Feature Flag + Session Replay**: ✅ PostHog installato (codice completo) — manca solo API key in Vercel env vars. Vedere `src/components/posthog-provider.tsx` + `src/lib/analytics.ts`.
- **Community**: ✅ Discord server setup guidato (guida: `docs/discord-setup-guide.md`, bot: `scripts/discord-bot/`). Bot personalizzato con welcome DM, auto-role, auto-reactions, slash commands /status /welcome /assign-beta.
- **Feature request board**: Canny free (fino a 100 MAU)
- **Legale**: iubenda Pro €29/mese (privacy + cookie + terms GDPR)
- **Costo totale**: ~$127/mese per 50 utenti paganti

### Metriche di graduation (beta → GA)
- Activation rate ≥ 35% (signup → primo pitch entro 7gg)
- TTV < 30 min
- D1 retention ≥ 30%, D7 retention ≥ 15%
- NPS ≥ 30
- Bug rate critici < 1/100 tester-attivi
- CSAT ≥ 80%

### Pricing raccomandato (strategia C → A)
- **Fase 1 (beta, primi 500 signup)**: Beta free 6 mesi + Lifetime Early Adopter €149
- **Fase 2 (GA)**: Freemium (Free 5 demo/mese) + Pro €12/mese + Studio €29/mese
- **Revenue projection anno 1**: €74.500 una tantum (500 EA) + ~€35K MRR cumulato = ~€110K total

### Roadmap sintesi
- **Sett. 1**: Setup tecnico (Sentry + PostHog + Discord + Canny + iubenda + Supabase subscriptions)
- **Sett. 2**: Recruitment (BetaList $129 + 20 DM Reddit/Discord + screening questionnaire)
- **Sett. 3-4**: Closed beta 15-25 tester selezionati
- **Sett. 5-8**: Iterazione + validazione metriche → decisione GO/NO-GO per GA
- **Sett. 9-12**: GA + monetizzazione + public launch (Product Hunt, BetaList featured)

### Cosa NON fare (verificato da casi reali)
- ❌ Obfuscation JS client-side (crackable in ore — Output Arcade craccato da team FLARE)
- ❌ Anti-debugging devtools (bypassato con "Search in folders")
- ❌ HWID hard binding (GDPR issues, false positività)
- ❌ EULA classica per SaaS (serve SaaS Agreement)
- ❌ Client-side license check only (bypassabile modificando JS bundle)
- ❌ UserTesting ($40K/anno — out of scale)
- ❌ Centercode ($2K-$10K/anno — overkill sotto 50 tester)
- ❌ Chargebee in beta ($599/mese dopo $50K MRR-free)

### Cosa FUNZIONA davvero
- ✅ Spostare logica critica server-side (API routes Next.js)
- ✅ Licensing server-checked (JWT firmato server, refresh ogni 24h)
- ✅ Account-bound features (dati label/ranking accessibili solo via RLS Supabase)
- ✅ Watermarking per identificare leak (hash user_id in bundle)
- ✅ Rate limiting API routes (Upstash Redis)
- ✅ Lemon Squeezy come MoR (gestisce VAT EU automaticamente)

## BUGSNAG — Setup definitivo (completato 2026-06-27)

### File chiave
- `src/lib/bugsnag.ts` — init con plugin React + BugsnagPerformance, filtri noise, redactedKeys GDPR, `window.Bugsnag` exposure
- `src/components/bugsnag-error-boundary.tsx` — ErrorBoundary client con Fallback UI dark theme
- `src/app/layout.tsx` — App wrappata con `<BugsnagErrorBoundary>` dentro `<PostHogProvider>`
- `src/app/debug/page.tsx` — Pagina test (5 bottoni: handled, unhandled handler, breadcrumb, metadata, render error)
- `scripts/bugsnag-upload-sourcemaps.mjs` — Upload source maps a Bugsnag ad ogni build (con wildcard `*/_next/static/`)
- `scripts/test-bugsnag-init.mjs` — Smoke test runtime
- `next.config.ts` — `productionBrowserSourceMaps: true` + env vars exposure (`VERCEL_GIT_COMMIT_SHA` → `NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA`)
- `vercel.json` — `buildCommand: "npm run build"` (forza Vercel a usare npm invece di `next build` diretto, così il postbuild hook gira)
- `package.json` — `build: "next build --webpack && node scripts/bugsnag-upload-sourcemaps.mjs"` (**webpack obbligatorio**, Turbopack non genera source maps complete)

### Env vars Vercel (già configurate)
- `NEXT_PUBLIC_BUGSNAG_API_KEY` = `1fa4d8a88468f9c892f1c59e9305cd2c`
- `BUGSNAG_API_KEY` = `1fa4d8a88468f9c892f1c59e9305cd2c` (stessa, single-project setup)

### Limiti free tier (verificati 2026-06-26)
- 7.500 errori/mese → sufficiente per ~75-100 beta tester attivi
- 7.500 performance spans/mese
- 1 user seat
- 7 giorni retention → check dashboard weekly
- No Slack/Discord alerts (upgrade $23/mese per quello)

### Verifica post-deploy
1. Apri `https://[vercel-domain]/debug`
2. Status deve dire "✅ Active"
3. Clicca "Trigger handled error"
4. Bugsnag Inbox → deve apparire entro 30 secondi con stack trace leggibile (es. `src/app/debug/page.tsx:51`)

### Cosa NON toccare
- ⚠️ Non rimuovere `--webpack` dal build script — Turbopack non genera source maps complete in Next.js 16
- ⚠️ Non rimuovere `buildCommand` da `vercel.json` — altrimenti Vercel bypassa il postbuild
- ⚠️ Non riattivare filtro `QuotaExceededError` in bugsnag.ts onError — stiamo tracciando quel bug reale

## Version History
- **v1**: Initial app with labels, demos, pitch
- **v2.0**: Gmail integration, PWA support, auto-save
- **v2.1**: Rankings import, smart merge, robust storage
- **v2.1.x**: Data persistence bug fix (persist v9+)
- **v2.2.0**: Web Push notifications, follow-up reminders, weekly recap
- **v2.3.0**: Multi-user isolation, cloud-first safety gate, EP pitch multi-track, label logos, scraper v3
- **v2.4.0** (current): Bugsnag integration completa (error tracking + performance + source maps + ErrorBoundary + /debug page)
