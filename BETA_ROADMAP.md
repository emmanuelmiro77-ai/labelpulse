# 📋 BETA_ROADMAP.md — Sequenza di Lavoro per Beta Test Professionale

> **SCOPO DEL DOCUMENTO**: Tracciare in modo permanente (su GitHub) la sequenza di lavoro
> per trasformare LabelPulse da progetto amatoriale a SaaS commerciale profittevole.
> Ogni fase ha costi calcolati, criteri di uscita misurabili e GO/NO-GO espliciti.
>
> **PRINCIPIO GUIDA**: Nessuna spesa senza ROI calcolato. Il beta è gratuito per i tester,
> ma ogni euro investito deve poter rientrare tramite abbonamenti reali entro 12 mesi.
>
> **Ultimo aggiornamento**: 2026-06-26
> **Stato**: FASE 0 — Punto 0.2 + 0.3 COMPLETATI ✅ → Prossimo: Punto 0.4 (Discord)

---

## 🎯 OBIETTIVO FINANZIARIO PRIMARIO

**Break-even mensile**: raggiungere abbonamenti attivi per coprire **costi infrastruttura + legali + tool** entro 12 mesi dal lancio GA.

**Profitto target anno 2**: €3.000-5.000/mese netto in tasca dopo tutte le spese.

**Regola d'oro**: ogni spesa durante la beta deve essere giustificata da:
1. Risparmio di tempo di sviluppo (>1h/mese per €10 spesi)
2. O Aumento diretto della conversione beta→pagante
3. O Riduzione del rischio legale/sicurezza (multe GDPR partono da €20M)

Spese che non soddisfano almeno UNO dei 3 criteri → DEFER al post-beta.

---

## 📊 UNIT ECONOMICS DI RIFERIMENTO

### Tier pricing target (GA, post-beta)

| Tier | Prezzo/mese | Limiti | Target conv. beta→pagante |
|------|-------------|--------|--------------------------|
| **Free** | €0 | 5 demo/mese, 25 label tracked, no Gmail API | 0% (fondo) |
| **Pro** | €12 | Demo illimitati, 200 label, Gmail API, 3 device | 60% dei beta tester |
| **Studio** | €29 | Multi-artist, unlimited, 10 device, API export, team | 10% dei beta tester |
| **Lifetime Early Adopter** | €149 una tantum | Tutte le feature Pro + future Pro per sempre | 30% dei beta tester (offerta esclusiva beta) |

### Costi unitari per utente attivo mensile (a regime, 50 utenti paganti)

| Voce | Costo/mese | Note |
|------|-----------|------|
| Vercel Pro | $20 fisso | $0,40 per utente a 50 utenti |
| Supabase Pro | $25 fisso | $0,50 per utente a 50 utenti |
| iubenda Pro | €29 fisso | €0,58 per utente a 50 utenti |
| Upstash Redis | $0 (free 10K comandi/giorno) | Sufficiente fino a ~500 utenti |
| PostHog | $0 (free 1M eventi/mese) | Sufficiente fino a ~1.000 utenti attivi |
| Sentry | $0 (free 5K errori/mese) | Sufficiente fino a ~200 utenti attivi |
| Lemon Squeezy fees | 5% + $0,50 per transazione | ~$1,10 per abbonamento Pro |
| Email (Resend) | $0 (free 3K/mese) | Sufficiente fino a ~100 utenti |
| **TOTALE fisso** | **~$45/mese + €29/mese** | **~€75/mese a 0 utenti** |
| **TOTALE variabile** | **~€1,50/utente** | Fees + quota infra |
| **Break-even a 50 utenti Pro** | **€600/mese ricavi − €150/mese costi = €450/mese lordo** | **Margine 75%** |

### Proiezione scenari ricavi (post-GA)

| Scenario | Utenti paganti | Mix | MRR | Costi/mese | Netto/mese | Anno 1 cumulato |
|----------|----------------|-----|-----|------------|------------|-----------------|
| **Pessimistico** | 20 (40% conv) | 17 Pro + 3 Studio | €291 | €105 | €186 | €2.232 |
| **Realistico** | 35 (70% conv) | 30 Pro + 5 Studio | €515 | €128 | €387 | €4.644 |
| **Ottimistico** | 50 (100% conv) | 45 Pro + 5 Studio | €685 | €150 | €535 | €6.420 |

**+ Lifetime EA conversion (extra)**: 30% × 50 beta tester × €149 = **€2.235 una tantum** al lancio GA.

**TOTALE ANNO 1 (scenario realistico)**: €4.644 + €2.235 = **~€6.879 lordo**.
Dopo imposte (~30% IT forfettario regime minimi) → **~€4.800 netto in tasca anno 1**.

> ⚠️ **Nota realistica**: questo NON è un business "diventare ricco" — è un side-business
> che a 50 utenti paganti produce ~€400/mese netti. Per superare €2K/mese netti servono
> 200+ utenti paganti (scenario anno 2-3 con marketing attivo).
> L'obiettivo del beta è VALIDARE il funnel, non generare revenue immediato.

---

## 🗺️ SEQUENZA FASI (con stato di avanzamento)

```
FASE 0  →  FASE 1  →  FASE 2  →  FASE 3  →  FASE 4  →  FASE 5
Foundation   Beta Infra   Closed Beta   Iteration   GA Prep    GA Launch
(2 sett)     (1 sett)      (4 sett)      (2 sett)    (2 sett)   (continua)
```

### Stato globale

| Fase | Stato | Inizio | Fine | Costi sostenuti | Costi previsti |
|------|-------|--------|------|-----------------|----------------|
| 0 — Foundation | 🟡 IN CORSO (65%) | 2026-06-26 | — | €0 | €0 |
| 1 — Beta Infra | ⬜ NON INIZIATA | — | — | — | €0 |
| 2 — Closed Beta | ⬜ NON INIZIATA | — | — | — | €129 (BetaList featured opzionale) |
| 3 — Iteration | ⬜ NON INIZIATA | — | — | — | €0 |
| 4 — GA Prep | ⬜ NON INIZIATA | — | — | — | €29 (iubenda Pro) + €10 (domain) |
| 5 — GA Launch | ⬜ NON INIZIATA | — | — | — | €129 (Product Hunt launch fee opzionale) |

**Totale spese previste fino a GA**: ~€297 (tutto opzionale tranne iubenda €29 + domain €10).
**Costo minimo obbligatorio per GA**: €39 (iubenda + domain).

---

## FASE 0 — FOUNDATION (Pre-Beta tecnico + legale)

**Durata stimata**: 2 settimane (10 giorni lavorativi)
**Costo**: €0 (tutto free tier)
**Obiettivo**: Apparire come prodotto professionale agli occhi dei primi 5-10 tester esterni, con sicurezza base blindata e strumenti di osservabilità attivi.

### Sequenza tasks FASE 0

#### 0.1 — Audit sicurezza + decisione repo pubblico/privato
**Stato**: ⬜ TODO
**Tempo**: 2h
**Output**:
- Verifica che ogni logica "value" (label DB, rankings, pitch templates) sia server-side o Supabase RLS
- Verifica che nessun API route esponga dati senza auth check
- Decisione documentata: repo GitHub pubblico (per trust) o privato (per anti-piracy)
- Lista di file/API che contengono "secret sauce" da proteggere
**Criterio GO**: Nessun API route critico senza auth. Lista di azioni di hardening scritta.

#### 0.2 — Installare Bugsnag (error tracking) — cambiato da Sentry
**Stato**: ✅ COMPLETATO (2026-06-26)
**Tempo**: 3h (refactor incluso)
**Costo**: €0 (free 7.500 errori/mese forever, 1 seat, 7-day retention)

**⚠️ Change log**: originariamente previsto Sentry, ma verificato il 2026-06-26 che Sentry
**non ha più free forever tier** (solo trial 14gg → $80+/mese). Switchato a Bugsnag che mantiene
free forever. Risparmio stimato: ~€960 nel primo anno vs Sentry paid.

**Output**:
- `@bugsnag/js` installato (pacchetto universal, auto-detect client/server)
- `src/lib/bugsnag.ts` creato — init condizionale con filtri noise personalizzati
- `next.config.ts` ripristinato allo stato originale (nessun wrapper richiesto)
- `src/lib/analytics.ts` aggiornato per usare Bugsnag con stessa API pubblica
  (identifyUser, clearUser, trackEvent, captureError, captureMessage, isFeatureEnabled)
- Filtri noise: ResizeObserver, ChunkLoadError, AbortError, QuotaExceededError,
  browser extensions, network errors (client-side), ECONNRESET/ETIMEDOUT (server-side)
- PII redaction attiva: password, token, authorization, cookie, secret, api_key,
  access_token, refresh_token, private_key, photoUrl
- Breadcrumbs automatici: error, log, navigation, request, user, manual, state
- `enabledReleaseStages: ['production']` → no inquinamento dashboard in dev
- `.env.local.example` aggiornato con BUGSNAG_API_KEY + NEXT_PUBLIC_BUGSNAG_API_KEY

**Limiti free tier** (da tenere a mente):
- 7 giorni retention → controllare dashboard almeno 1-2 volte/settimana
- 1 seat (solo tu sviluppatore) → ok per beta, da rivalutare in GA
- No Slack/Discord alerts → controllo manuale + PostHog events come segnali
- No email reports → export CSV manuale settimanale

**Criterio GO**: ✅ Code completo. Primo errore reale apparirà in dashboard appena l'utente
configura NEXT_PUBLIC_BUGSNAG_API_KEY in Vercel. Trigger upgrade a $23/mese: superare 6K
errori/mese, o necessità di retention >7gg, o secondo sviluppatore, o alerts Slack.

#### 0.3 — Installare PostHog (analytics + feature flags + session replay)
**Stato**: ✅ COMPLETATO (2026-06-26)
**Tempo**: 3h
**Costo**: €0 (free 1M eventi/mese)
**Output**:
- `posthog-js` + `posthog-node` installati
- `<PostHogProvider>` in `src/app/layout.tsx` (init condizionale, opt_out in dev)
- Modulo unificato `src/lib/analytics.ts` con API: identifyUser, clearUser, trackEvent, captureError, isFeatureEnabled
- 7 eventi chiave del funnel tracciati end-to-end:
  1. `signup_completed` (dopo login Google in use-auth.ts)
  2. `onboarding_started` (apertura WelcomeOnboarding)
  3. `profile_completed` (salvataggio artistName per prima volta)
  4. `first_label_added` (in store.ts, con flag localStorage once-per-user)
  5. `first_demo_added` (in store.ts, con flag once-per-user)
  6. `first_pitch_generated` (in pitch-generator.tsx, con flag once-per-user)
  7. `first_pitch_sent` (in 3 punti: clipboard, Gmail, in-app — con `method` property)
- Eventi bonus: `pitch_copied_to_clipboard`, `pitch_sent_via_gmail`, `pitch_sent_via_inapp`, `feedback_submitted`
- Session replay attivo (10% sample per beta — dentro free tier)
- Respect Do Not Track header (GDPR-friendly)
- Autocapture attivo (button clicks, form submits — per A/B testing)
**Criterio GO**: ✅ Code completo. Primo evento signup_completed apparirà in PostHog appena l'utente configura NEXT_PUBLIC_POSTHOG_KEY in Vercel e fa login.

**Eventi funnel da tracciare**:
1. `signup_completed` (Google OAuth o beta code login)
2. `onboarding_started` (WelcomeOnboarding aperto)
3. `profile_completed` (artistName + scLink + bio compilati)
4. `first_label_added` (prima label tracked)
5. `first_demo_added` (primo demo salvato)
6. `first_pitch_generated` (primo pitch generato)
7. `first_pitch_sent` (primo pitch inviato — copy OR Gmail OR in-app)

#### 0.4 — Setup Discord server privato
**Stato**: ✅ COMPLETATO (2026-06-27)
**Tempo**: 1h
**Costo**: €0
**Output**:
- Guida completa step-by-step: `docs/discord-setup-guide.md`
  - Struttura server: 6 categorie, 12 canali (WELCOME, ANNUNCI, COMMUNITY, FEEDBACK, SUPPORTO TECNICO, FOUNDER)
  - 4 ruoli: Founder, Beta Tester, Contributor, Newcomer (con permessi dettagliati per categoria)
  - Messaggi pre-scritti per #regole e #benvenuto (copy-paste ready)
  - Strategia invite link per 3 round di recruitment
- Bot Discord personalizzato (alternativa a MEE6, più flessibile e senza upsell): `scripts/discord-bot/`
  - Welcome DM automatico con NDA + screening form link (placeholder fino a Punto 0.5)
  - Auto-role Newcomer all'ingresso + /assign-beta per promozione manuale
  - Auto-reactions: 🐛✅ in #bug-reports, 💡👍 in #feature-requests
  - Comandi slash: /status, /welcome, /assign-beta
  - Fallback se DM bloccati (posta in #benvenuto)
  - Logging azioni moderazione in #mod-log
**Criterio GO**: Codice completo e documentato. L'utente deve: (1) creare il server seguendo la guida, (2) creare il bot su Discord Developer Portal, (3) configurare .env e avviare il bot.

#### 0.5 — Scrivere NDA + screening questionnaire
**Stato**: ✅ COMPLETATO (2026-06-27)
**Tempo**: 3h
**Costo**: €0
**Output**:
- `docs/NDA-beta-tester.md` — NDA completo con:
  * 10 sezioni: Definizioni, Obblighi, Durata (24 mesi + 36 per sicurezza), Proprietà Intellettuale, Feedback, Sicurezza, Risoluzione, Risarcimento, Clausole IT specifiche (GDPR, recesso, foro Milano), Disposizioni finali
  * Accettazione via checkbox nel form Tally.so
  * Clausola feedback → licenza libera a LabelPulse (necessaria per poter implementare suggerimenti)
  * Clausola anti-reverse engineering
  * Giurisdizione italiana + GDPR compliant
- `docs/screening-questionnaire.md` — Guida completa per setup form Tally.so:
  * 8 domande con tipi, label, opzioni, placeholder dettagliati
  * Pagina di conferma (Thank You) con CTA Discord
  * Impostazioni Tally raccomandate
  * Criteri di selezione (pesi per priorità)
  * Target prima ondata: 5-10 tester con mix dispositivo/genere
  * Flusso post-submission completo
**Criterio GO**: NDA in repo ✅. Form Tally: da pubblicare da parte dell'utente (creare account Tally → seguire guida → pubblicare).

#### 0.6 — Setup email professionale
**Stato**: ✅ COMPLETATO (2026-06-27)
**Tempo**: 30min
**Costo**: €0
**Output**:
- Verificato: dominio `labelpulse.app` NON è registrato (NXDOMAIN)
- Decisione: defer a FASE 4 la registrazione dominio + Cloudflare email routing
- Email temporanea per la beta: `labelpulse.beta@gmail.com`
- Aggiornato `.env.local.example` con `SUPPORT_EMAIL=labelpulse.beta@gmail.com`
- Aggiornate tutte le referenze email in docs/NDA-beta-tester.md
- L'utente deve creare l'account Gmail `labelpulse.beta@gmail.com` (se non già esistente)
- Nota: se l'account Gmail è già creato, il criterio GO è soddisfatto
**Criterio GO**: Account Gmail labelpulse.beta@gmail.com esistente e accessibile. Dominio professionale deferito a FASE 4.

#### 0.7 — Privacy + Terms + Cookie banner (base free)
**Stato**: ✅ COMPLETATO (2026-06-27)
**Tempo**: 3h
**Costo**: €0 (documenti custom + cookie banner custom, senza iubenda/Termly)
**Output**:
- `docs/privacy-policy.md` — Privacy Policy completa GDPR (13 sezioni)
- `docs/terms-of-service.md` — Termini di Servizio con clausole IT (15 sezioni)
- `src/components/cookie-consent.tsx` — Cookie banner con:
  * Accetta / Rifiuta / Preferenze dettagliate
  * Integrazione PostHog opt-in/out
  * Versioning per re-show su policy update
  * localStorage invece di cookie (privacy-friendly)
  * Dark theme coerente con l'app
- `src/app/legal/page.tsx` — Pagina /legal con 3 tab (Privacy, Termini, Cookie)
- Footer aggiornato: link Privacy + Termini + Cookie + versione corretta (v2.4)
- PostHog provider aggiornato: rispetta consenso cookie all'init
- Build verificato: SUCCESSO (tutte le route compilate, /legal presente)
**Criterio GO**: Footer contiene link a Privacy + Terms + Cookie. Banner appare al primo accesso. Pagina /legal accessibile.

#### 0.8 — Pulsante di recesso elettronico (OBBLIGATORIO da 19 giugno 2026)
**Stato**: ⬜ TODO
**Tempo**: 2h
**Costo**: €0
**Output**:
- Pagina `/account/withdrawal` con form semplice
- POST `/api/account/withdrawal` che invia email a `hello@labelpulse.app` + logga in Supabase
- Link in dashboard utente → "Diritto di recesso" 
- Documentazione in `docs/withdrawal-process.md`
- **IMPORTANTE**: obbligatorio per B2C EU dal 19 giugno 2026 (art. 59 lett. i Codice Consumo)
**Criterio GO**: Form inviato → email arriva → log in Supabase. Test end-to-end funziona.

#### 0.9 — Backup automatico Supabase
**Stato**: ⬜ TODO
**Tempo**: 30min
**Costo**: €0 (Supabase Pro ha daily backup automatico)
**Output**:
- Verificare che il piano Supabase sia Pro (€25/mese) — se sì, daily backup attivo
- Documentare in `docs/backup-strategy.md`: retention, restore procedure
- Aggiungere reminder calendario: test restore mensile
**Criterio GO**: Documento scritto, restore testato 1 volta.

### Costo totale FASE 0
- **Tempo**: ~17 ore di sviluppo (distribuite su 2 settimane)
- **Soldi**: €0 (tutto free tier)
- **Rischio principale**: Tempo — se salti task, sembrerà amatoriale ai tester

### Criterio GO FASE 0 → FASE 1
✅ Sentry attivo con almeno 1 errore reale registrato
✅ PostHog attivo con almeno 1 evento signup
✅ Discord server online con invite link
✅ NDA + screening form pubblici e funzionanti
✅ Privacy + Terms + Cookie banner in app
✅ Pulsante recesso implementato
✅ Audit sicurezza completato con lista hardening
✅ (Opzionale) Email professionale configurata

---

## FASE 1 — BETA INFRA (Setup tecnico per gestire tester)

**Durata**: 1 settimana
**Costo**: €0
**Obiettivo**: Avere pipeline completa: screening → NDA → invite Discord → beta code generation → onboarding → tracking

### Tasks FASE 1

#### 1.1 — Beta code generation flow (già esiste, da verificare)
- Verificare `/api/admin/generate-beta-code` funziona
- Verificare `/api/auth/beta-verify` funziona
- Verificare `src/app/admin/beta-testers/page.tsx` mostra lista codici
- Aggiungere: export CSV lista codici per archivio
- Aggiungere: campo `discord_user_id` alla tabella `beta_access_codes` per tracciare chi è chi su Discord

#### 1.2 — Onboarding flow migliorato
- WelcomeOnboarding deve contenere step "Join Discord" con link
- Step "Completa profilo" con `profile_completed` event
- Step "Aggiungi prima label" con `first_label_added` event
- Step "Salva primo demo" con `first_demo_added` event
- Step "Genera primo pitch" con `first_pitch_generated` event
- Step finale: "Sei pronto! Hai sbloccato Lifetime Early Adopter €149 invece di €239"

#### 1.3 — Feature flag per beta-only features
- In PostHog: creare flag `beta_features_enabled` (true per tutti i beta tester)
- Usare flag per feature sperimentali (es. nuovo scraper v3, artist explorer)
- Permessi di accesso controllati server-side via API route

#### 1.4 — Beta feedback flow
- Verificare `beta-feedback-button.tsx` + `feedback-inbox.tsx` funzionano
- Aggiungere categoria `bug` / `feature_request` / `praise` / `complaint`
- Bug report → auto-forward a Discord `#bug-reports` via webhook
- Feature request → auto-forward a Canny board (creare board free)

#### 1.5 — Tracking sheet esterno
- Google Sheets (free) con: nome tester, email, Discord ID, data invito, data primo accesso, ultimi 7 eventi PostHog, NPS score
- Sync manuale settimanale
- Alternativa: usare Supabase view `v_beta_tester_status` che unisce `beta_access_codes` + `user_data`

### Criterio GO FASE 1 → FASE 2
✅ Pipeline end-to-end funziona: screening → NDA → beta code → onboarding → primo pitch → evento in PostHog
✅ Discord bot forward automatico bug → canale
✅ Almeno 1 tester fittizio (tu stesso con email diversa) completato onboarding

---

## FASE 2 — CLOSED BETA (5-10 tester reali)

**Durata**: 4 settimane
**Costo**: €0 (tutto organico) o €129 (BetaList featured per accelerare recruitment)
**Obiettivo**: Validare funnel + raccogliere metriche + identificare bug critici

### Settimana 1 — Recruitment
- DM personali: 20 producer mirati
- Reddit post: r/edmproduction + r/WeAreTheMusicMakers (1 post per sub, formato value-first)
- Discord: 3 community music producer (Splice, Output, Audius) — post value-first
- Facebook: gruppo "Electronic Music Producers" — 1 post
- Forum: Gearspace + KVR (sezione software) — 1 post per forum
- Target: 30-50 application → screening → 10 tester selezionati

### Settimana 2-4 — Test attivo
- Giornaliero: monitoraggio Sentry + PostHog
- Settimanale: 1 call di check-in con 2-3 tester (15 min)
- Settimanale: digest post in Discord `#beta-announcements` con fix della settimana
- Settimanale: NPS survey via Tally (1 domanda, scale 0-10)
- Continuous: bug report via in-app button → Discord auto-forward

### Metriche da raccogliere
| Metrica | Target | Misurazione |
|---------|--------|-------------|
| Activation rate (signup → first pitch) | ≥ 35% | PostHog funnel |
| Time-to-value (signup → first pitch) | < 30 min | PostHog |
| D7 retention | ≥ 25% | PostHog |
| NPS | ≥ 30 | Tally survey |
| Bug rate critici | < 1/100 tester-attivi/giorno | Sentry + bug reports |
| CSAT onboarding | ≥ 80% | Post-feedback survey |

### Criterio GO FASE 2 → FASE 3
✅ Almeno 5 tester hanno completato onboarding
✅ Almeno 3 tester hanno inviato almeno 1 pitch reale
✅ Activation rate ≥ 25% (anche se sotto target, ok per iterare)
✅ NPS ≥ 20
✅ Nessun bug critico aperto da > 7 giorni
✅ Lista prioritizzata di feature richieste da tester (≥ 10 items)

---

## FASE 3 — ITERATION (Fix + feature basate su feedback)

**Durata**: 2 settimane
**Costo**: €0
**Obiettivo**: Risolvere top 5 bug + top 5 feature richieste + ottimizzare funnel dove lose tester

### Tasks FASE 3
- Triage bug per severità + frequenza
- Implementazione top 5 fix
- Implementazione top 5 feature (max 1 giorno ciascuna)
- A/B test su onboarding flow (PostHog experiments)
- Comunicazione tester: "Ecco cosa abbiamo cambiato grazie a voi" → Discord + email

### Criterio GO FASE 3 → FASE 4
✅ Top 5 bug risolti e deployati
✅ Top 5 feature implementate e deployate
✅ Re-test con 3 tester → conferma miglioramento
✅ Activation rate ≥ 30% (post-iteration)
✅ Decisione GO/NO-GO documentata per GA

---

## FASE 4 — GA PREP (Preparazione al lancio commerciale)

**Durata**: 2 settimane
**Costo**: €39 (iubenda Pro €29 + domain €10) + €0 se domain già esistente
**Obiettivo**: Setup billing + legale completo + pricing implementato + landing page commerciale

### Tasks FASE 4

#### 4.1 — Lemon Squeezy setup (MoR + VAT EU automatico)
- Creare account Lemon Squeezy (gratis, paghi solo fees su transazioni)
- Creare 3 prodotti: Pro €12/mese, Studio €29/mese, Lifetime EA €149
- Setup webhook → `/api/billing/webhook` che aggiorna tabella Supabase `subscriptions`
- Tabella `subscriptions` con campi: user_email, plan, status, current_period_end, ls_subscription_id
- Middleware Next.js: legge JWT firmato server (contiene plan + scadenza), redirect a `/upgrade` se scaduto

#### 4.2 — License check server-side
- `/api/license/verify` → ritorna plan + scadenza + device_limit
- JWT firmato con `SUPABASE_SERVICE_ROLE_KEY` (server only), refresh ogni 24h
- Client salva JWT in IndexedDB, offline grace 7 giorni
- Device binding: 3 device Pro, 10 device Studio (FingerprintJS open source solo per audit log)

#### 4.3 — iubenda Pro (€29/mese)
- Privacy Policy + Terms + Cookie + DPA complete
- Consent records automatici (GDPR compliance)
- Documenti sempre aggiornati a norma

#### 4.4 — Domain + email professionali (€10/anno)
- Registrare `labelpulse.app` (se non già fatto)
- Cloudflare DNS + email routing
- `hello@`, `support@`, `legal@`, `noreply@` → forwarding

#### 4.5 — Landing page commerciale
- Pagina `/` per visitatori non loggati: hero + features + pricing + testimonials (dai beta)
- Pagina `/pricing` con 3 tier + Lifetime EA
- Pagina `/changelog` con storia release
- Pagina `/beta-closing` con countdown: "Beta chiude il X, diventa Early Adopter ora"

#### 4.6 — Withdrawal flow completo (B2C + B2B)
- Pagina `/account/withdrawal` già fatta in FASE 0.8 → estendere con automazione:
  - Clicca "Recedi" → form conferma
  - Email automatica a utente con conferma entro 24h
  - Rimborso automatico via Lemon Squeezy API (se entro 14gg)
  - Cancellazione account + dati entro 30gg (GDPR art. 17)

### Criterio GO FASE 4 → FASE 5
✅ Lemon Squeezy test end-to-end con carta reale (tu stesso come customer)
✅ License check blocca feature Pro per free user
✅ Tutti i documenti legali pubblici e linkati in footer
✅ Landing page live con tracking PostHog
✅ Withdrawal testato end-to-end
✅ Backup Supabase testato (restore da backup di ieri)

---

## FASE 5 — GA LAUNCH (Lancio commerciale pubblico)

**Durata**: continua
**Costo iniziale**: €129 (Product Hunt launch fee) + €0 (il resto organico)
**Obiettivo**: Primi 10-20 paganti reali, break-even entro 6 mesi

### Tasks FASE 5

#### 5.1 — Product Hunt launch
- Preparazione: 2 settimane prima, trovare hunter con 5K+ followers
- Launch day: rispondere a tutti i commenti entro 1h
- Goal: top 5 del giorno → 200-500 signup

#### 5.2 — BetaList featured (opzionale, €129)
- Featured submission per massima visibilità
- Goal: 50-100 signup extra

#### 5.3 — Reddit "Show HN" + r/SideProject + r/SaaS
- Post "Lancio LabelPulse: come hoValidato il prodotto con 10 producer in 6 settimane"
- Goal: 100-300 signup

#### 5.4 — Comunicazione beta tester
- Email: "Beta sta chiudendo, ecco la tua offerta Lifetime EA €149 (anziché €239 dopo GA)"
- Goal: 30% conversione → 3-5 lifetime EA × €149 = €447-745 una tantum

#### 5.5 — Monitoraggio metriche GA
- MRR tracking (Lemon Squeezy dashboard)
- Churn rate (target < 5%/mese)
- CAC payback (target < 6 mesi)
- NPS post-acquisto (target ≥ 40)

### Criterio di SUCCESSO FASE 5 (12 mesi post-GA)
✅ 50+ utenti paganti attivi
✅ MRR ≥ €500/mese
✅ Churn < 5%/mese
✅ Break-even raggiunto
✅ **Profitto netto in tasca ≥ €2.000/mese**

---

## 🛡️ SICUREZZA — Task continuativi

Questi task sono trasversali a tutte le fasi. Vanno monitorati e aggiornati.

### Anti-piracy (priorità bassa in beta, alta in GA)
- ✅ Supabase RLS attivo per multi-user isolation (già fatto)
- ✅ Beta codes server-verified (già fatto)
- 🟡 Spostare logica "value" (label DB, rankings) dietro API routes server-side
- ⬜ Watermarking per-user: hash user_id invisibile nel bundle JS
- ❌ NON FARE: obfuscation JS client-side (crackable in ore)
- ❌ NON FARE: anti-debugging devtools (bypassabile)
- ❌ NON FARE: HWID hard binding (false positività + GDPR issues)

### GDPR compliance (obbligatorio pre-GA)
- ✅ Privacy Policy + Terms (FASE 0.7)
- ✅ Cookie banner (FASE 0.7)
- ✅ Pulsante recesso (FASE 0.8)
- ⬜ Data Processing Agreement (DPA) per utenti EU business
- ⬜ Right to access / right to erasure (GDPR art. 15, 17) — API `/api/account/export` + `/api/account/delete`
- ⬜ Log di consenso (iubenda Pro gestisce automaticamente)

### Backup & disaster recovery
- ✅ Supabase daily backup (piano Pro)
- ⬜ Test restore mensile (calendar reminder)
- ⬜ Documento `docs/disaster-recovery.md` con procedure

---

## 📈 METRICHE TRACCIATE — Dashboard di riferimento

### PostHog events (automa tracciati)
1. `signup_completed` (login Google o beta code)
2. `onboarding_started`
3. `profile_completed`
4. `first_label_added`
5. `first_demo_added`
6. `first_pitch_generated`
7. `first_pitch_sent`
8. `pitch_copied_to_clipboard`
9. `pitch_sent_via_gmail`
10. `pitch_sent_via_inapp`
11. `cloud_sync_triggered`
12. `feedback_submitted`
13. `upgrade_button_clicked` (post-GA)

### Sentry errors (automa tracciati)
- Tutti gli errori client-side (Next.js Error Boundary non li cattura tutti)
- Tutti gli errori server-side (API routes)
- Performance monitoring (page load, API latency)

### Supabase queries (manuali, via SQL Editor)
- `SELECT COUNT(*) FROM user_data` — totale utenti attivi
- `SELECT COUNT(*) FROM beta_access_codes WHERE used_at IS NOT NULL` — beta tester attivi
- `SELECT email, updated_at FROM user_data ORDER BY updated_at DESC LIMIT 20` — ultimi attivi

### Lemon Squeezy dashboard (post-GA)
- MRR, ARR
- Active subscriptions, churned subscriptions
- Revenue per product

---

## 🔗 DOCUMENTI COLLEGATI

- **Strategia completa**: `/home/z/my-project/download/labelpulse-beta-strategy.pdf` (PDF 18 pagine)
- **Report beta testing**: `/home/z/my-project/research-output/report-beta-testing.md`
- **Report licensing/sicurezza**: `/home/z/my-project/research-output/licensing-security-report.md`
- **Report pricing competitor**: `/home/z/my-project/research-output/pricing-models-report.md`
- **Agent context**: `/home/z/my-project/AGENT_CONTEXT.md`
- **Bug registry**: `/home/z/my-project/BUG_REGISTRY.md`

---

## 📝 CHANGELOG ROADMAP

### 2026-06-26 — Creazione documento
- Documento iniziale creato con 6 fasi numerate + unit economics + criteri GO/NO-GO
- FASE 0 Punto 1 (Sentry + PostHog) in corso di esecuzione
- Commit su GitHub per memoria permanente

### 2026-06-26 — Punti 0.2 + 0.3 completati ✅
- ✅ Punto 0.2 (error tracking): Bugsnag installato (originariamente previsto Sentry,
  switchato dopo verifica Sentry non ha più free forever)
- PostHog installato con provider + modulo analytics unificato (src/lib/analytics.ts)
- 7 eventi funnel chiave tracciati end-to-end (signup → first_pitch_sent)
- Build Next.js verifica: SUCCESSO (tutte le route compilate correttamente)
- Costo: €0 (tutto free tier — Bugsnag 7.5K errori/mese + PostHog 1M eventi/mese)
- Risparmio vs Sentry paid: ~€960/anno
- Prossimo passo: Punto 0.4 (Discord server) + Punto 0.5 (NDA + screening form)
- Setup utente richiesto: creare account Bugsnag + PostHog, mettere env vars in Vercel

### 2026-06-27 — Punto 0.4 completato ✅
- ✅ Punto 0.4 (Discord server): guida completa + bot personalizzato creati
- Sostituito MEE6 con bot custom (più flessibile, senza upsell premium)
- Guida step-by-step: docs/discord-setup-guide.md (6 categorie, 12 canali, 4 ruoli)
- Bot Discord: scripts/discord-bot/ (welcome DM, auto-role, auto-reactions, slash commands)
- Costo: €0 (Discord free, bot hosted locally o VPS gratuita)
- Prossimo passo: Punto 0.5 (NDA + screening form) → poi 0.6 (email), 0.7 (iubenda)
- Setup utente richiesto: creare server Discord seguendo guida, configurare bot

### 2026-06-27 — Punto 0.5 completato ✅
- ✅ Punto 0.5 (NDA + screening): documenti completi creati
- NDA in docs/NDA-beta-tester.md: 10 sezioni, giurisdizione italiana, GDPR, anti-reverse engineering
- Screening form guide in docs/screening-questionnaire.md: 8 domande + Thank You page + criteri selezione
- Costo: €0 (Tally.so free fino a 999 risposte/mese)
- Prossimo passo: Punto 0.6 (email professionale) → poi 0.7 (iubenda privacy+cookie)
- Setup utente richiesto: creare account Tally.so, pubblicare form seguendo guida

### 2026-06-27 — Punto 0.6 completato ✅
- ✅ Punto 0.6 (email): verificato dominio labelpulse.app NON registrato
- Email temporanea per beta: labelpulse.beta@gmail.com
- Dominio professionale deferito a FASE 4 (€10/anno)
- .env.local.example aggiornato con SUPPORT_EMAIL
- NDA aggiornato con email temporanea
- Costo: €0
- Prossimo passo: Punto 0.7 (iubenda privacy + cookie banner)
