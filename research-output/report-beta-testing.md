# Ricerca Beta Testing — LabelPulse
**Task ID:** research-1-beta-testing · **Data:** 2026 · **Agente:** general-purpose

> Contesto: LabelPulse è una SaaS (Next.js 16 + Supabase) per producer musicali: demo submission, label tracking, pitch generation, ranking Beatport. Esiste già un sistema di beta feedback (`beta_feedback`), notifiche Web Push, onboarding modal, admin token. L'obiettivo è trasformare l'app da "giochino personale" a beta test reale con tester esterni.

---

## 1. Reclutamento beta tester

### 1.1 Piattaforme dedicate (con dati reali 2025-2026)

| Piattaforma | URL | Costo (USD) | Target | Requisito ingresso | Pro / Contro |
|---|---|---|---|---|---|
| **BetaList** | https://betalist.com | Free submission (coda), oppure ~$129–$299 per "featured" (in primo piano). CPC reale ~$1.50–$2.99 per signup | Early-adopter tech, founder, indie hacker | Aver qualcosa di "nuovo" — startup pre-lancio o in beta | **Pro:** audience calda, 100–200 signup per featured. **Contro:** scarsa qualità music-specific, molto rumore SaaS B2B |
| **BetaTesting** (già Erli Bird) | https://betatesting.com | $50–$500 per sessione, pannelli reclutati inclusi | Consumer + B2B, 400.000+ tester in 200+ paesi | Creare progetto, definire screening | **Pro:** reclutamento chiavi in mano, supporto NDA. **Contro:** costoso per progetto bootstrap |
| **Erli Bird** | https://erlibird.com (ora integrato in BetaTesting) | Test pagati $10–$15 per feedback | Tester retribuiti | Iscrizione come tester o come azienda | **Pro:** tester incentivati. **Contro:** feedback "mercificato", non rappresentativo di utenza organica |
| **BetaFamily** | https://betafamily.com | Free per progetti base; piano Pro ~€49/mese | App mobile, iOS/Android | Submit app, attendere review | **Pro:** focus mobile. **Contro:** poco SaaS web, scarsi music-makers |
| **UserTesting** | https://www.usertesting.com | **~$40.000/anno** per SMB, $147.000+ enterprise. No piano mensile consumer | Enterprise UX research | Contratto annuale | **Pro:** panel enorme, sessioni video moderatissime. **Contro:** totalmente fuori scala per un progetto bootstrap — sconsigliato |
| **UserCrowd** | https://www.usercrowd.com | Gratis per chi testa; payout $10 minimo PayPal | Tester retribuiti B2B | Iscrizione come tester | **Pro:** zero costo di reclutamento. **Contro:** non è un canale diretto per trovare beta tester per la tua app |
| **Centercode** | https://www.centercode.com | **~$2.000–$4.000/anno** (G2 2026) fino a ~$10.000/yr per plan enterprise | SaaS/B2B strutturati | Setup progetto, onboarding tester | **Pro:** gestione NDA, feedback strutturato, scoring tester. **Contro:** overkill sotto i 50 tester |

**Raccomandazione per LabelPulse:** parti da **BetaList (featured $129)** + **BetaFamily (free)** + repost in community musicali. Evita UserTesting (out-of-scale) e Centercode (troppo enterprise finché i tester sono <50).

### 1.2 Strategie alternative — community musicali

**Subreddit (high-signal, free, serve value-first):**
- **r/WeAreTheMusicMakers** — https://reddit.com/r/WeAreTheMusicMakers — community storica (oltre 55.000 membri attivi segnalati). Discord ufficiale: https://discord.com/invite/wearethemusicmakers (~12.600 membri).
- **r/edmproduction** — https://reddit.com/r/edmproduction — subreddit di riferimento per producer EDM.
- **r/musicproduction** — https://reddit.com/r/musicproduction — generale.
- **r/produceTech** (esiste come tag/prod-tech discussion) — verificare attuale redditività.
- Regola d'oro: NON postare "test my app". Posta: "I built a tool to track Beatport rankings + label submission. Looking for 5 honest testers — DM if you send demos to labels weekly." Offre reciprocità.

**Discord community:**
- **Splice Discord** (discord.gg/splice) — community grande, recentemente ha aggiunto canale "Diamonds" per music-maker under-represented (fonte: Musically.com, giugno 2023).
- **Output** (output.com) — community product-focused; acceso via loro forum/Discord.
- **Audius** (audius.co) — piattaforma web3 music, ha Discord attivo con producer indipendenti.
- Server di piccoli artisti (es. Bishu su Twitch/Discord) — spesso più accessibili del server ufficiale Splice.

**Forum classici:**
- **Gearspace** (già Gearslutz) — https://gearspace.com — forum #1 pro audio. Sezione "Music Computers" + "Electronic Music Instruments and Electronic Music Production" sono ideali per announce.
- **KVR Audio** — https://www.kvraudio.com/forum — storico per plugin/VST ma attivo anche su produzione in genere.

**Facebook group:**
- "Electronic Music Producers" (group `emproducers`) — discussioni attive su demo submission, label outreach.
- "The Producer Group" — `theproducergroup`.
- "Bedroom Producers" — `bedroom.producers1`.
- Wavepoint Detroit, Nasty Boxes — community più di nicchia.

> ⚠️ Sui FB group postare "test my SaaS" viene spesso bloccato. Meglio: pubblicare un caso d'uso reale ("Last month I sent 14 demos using a tracker I built, here's what I learned…") e in commenti menzionare la beta.

### 1.3 Struttura del beta program

**Tier consigliati (modello Closed → Open → Early Access → GA):**
1. **Closed Beta privata** — 10–25 tester selezionati manualmente, durata 4–6 settimane. NDA opzionale. Goal: scoprire bug bloccanti e validare value proposition.
2. **Open Beta** — 50–200 tester via BetaList + community. Durata 4–8 settimane. Goal: stress test, funnel metrics, NPS.
3. **Early Access pubblico** — chiunque può iscriversi con email (waitlist gamificata tipo Superhuman). Goal: generare demand e social proof.

**Numero ottimale tester (benchmark):**
- **5–10 tester** trovano ~80% dei bug UX maggiori (legge di Nielsen, ancora valida nel 2026 secondo Centercode guide).
- **25–50 tester** sono il sweet spot per SaaS bootstrap: feedback sufficiente senza overload.
- **>100 tester** richiedono tool strutturati (Centercode, Canny) e persona dedicata alla triage.

**Durata:** 4–8 settimane totali. Oltre 8 settimane → tester fatigue, login crolla.

**Incentivi (in ordine di efficacia per creator/producer):**
- **Free lifetime license** del piano Pro (costo marginale zero per te, valore percepito alto).
- **Access diretto al founder** (1 chiamata 30min, feedback ascoltato).
- **Swag fisico** (t-shirt/adesivi) — funziona ma costoso internazionalmente.
- **Public credit** come "Beta Tester" in changelog/about.
- **Early access perpetuo** a nuove feature (testers = insiders).

### 1.4 Template email/DM outreach

```
Oggetto: Ti va di stress-testare un tool per label tracking? (beta chiusa, 15 posti)

Ciao [Nome],

ho visto il tuo post su r/edmproduction sui problemi a tenere traccia delle demo
inviate alle label — è esattamente il problema che sto cercando di risolvere con
LabelPulse.

In sintesi: tiene traccia di ogni demo inviata, genera pitch personalizzati per
ogni label, e ti mostra i ranking Beatport aggiornati per capire dove puntare.

Sto per aprire una closed beta con 15 producer. 30 minuti di setup, accesso
gratuito a vita al piano Pro in cambio di feedback onesto.

Se ti va: https://labelpulse.app/beta — altrimenti zero pressione, grazie del
tempo che hai dedicato a leggere.

— [Tuo nome], founder
```

### 1.5 Screening questionnaire — chi accettare e chi rifiutare

**Criteri di ACCETTO (da includere):**
- Invia almeno 2 demo al mese a label (valida il need reale).
- Produce electronic/EDM/house/techno (target principale per Beatport rankings).
- Ha già un catalogo Beats/SoundCloud (significa che è attivo, non curioso).
- Disposto a 30 min onboarding + 1 check-in ogni 2 settimane.

**Criteri di RIFIUTO (gentilmente):**
- "Mi piacerebbe imparare a produrre musica" → non è producer, è aspirante.
- Produttore hip-hop/country puro fuori target (almeno per la v1).
- Account appena creati su Reddit/Discord (sospetto bot/spam).
- Chi chiede subito "è gratis?" come prima domanda → bassa intenzione di feedback.
- Agenzie/manager (target diverso, serve product-market fit separata).

---

## 2. Onboarding e gestione beta tester

### 2.1 Strumenti per gestire il beta program

| Tool | URL | Costo | Best for |
|---|---|---|---|
| **Centercode** | https://www.centercode.com | $2.000–$10.000/anno | Programma strutturato con NDA, recruitment, scoring tester |
| **Canny** | https://canny.io | Free fino a 100 MAU; piano Growth $99/mese; Scale $399/mese | Feature request board, road map pubblica — ottimo da linkare in onboarding |
| **UserVoice** | https://www.uservoice.com | **~$1.333/mese ($16.000/anno)** minimo — enterprise | Fuori scala per bootstrap, sconsigliato |
| **Discord private channel** | https://discord.com | Free (Nitro opzionale) | Comunicazione realtime, voice, condivisione screen — **consigliato per LabelPulse** |
| **Gamma / Notion** | https://gamma.app · https://notion.so | Free tier sufficiente | Documentazione beta, onboarding kit, changelog |

**Setup consigliato per LabelPulse:** Discord server privato + canale `#beta-announcements` + `#bug-reports` + `#feature-requests` + `#general`. Accoppiato a Canny (free) per road map pubblica.

### 2.2 Primo contatto — sequenza

**Email welcome (entro 24h da accettazione):**
1. Welcome + ringraziamento personale.
2. Link onboarding (URL univoco o codice invito Discord).
3. **NDA** (se closed beta — template gratuito su https://www.wonder.legal/us/modele/beta-tester-non-disclosure-agreement o https://www.rocketlawyer.com → "Beta Tester NDA"). Per SaaS music tool senza algoritmi sensibili, NDA è **opzionale** ma raccomandato se condividi feature non ancora rilasciate.
4. Credenziali / link magic-login (LabelPulse già usa Google Identity + NextAuth).
5. 3 compiti chiari per la prima settimana: "1. Crea profilo 2. Aggiungi 1 label 3. Inserisci 1 demo".
6. Calendario check-in (Mingzhi Cameron tip: biweekly, vedi §2.4).

**Kit onboarding (gia esistente in LabelPulse come `welcome-onboarding.tsx`):**
- Già implementato: blocco privacy, blocco "cosa puoi/non puoi fare", blocco feedback.
- **Da aggiungere:** video 90s Loom che mostra il flusso demo→pitch→invio.

### 2.3 Raccogliere feedback strutturato

**Bug report template (incollare in Discord `#bug-reports` o nel widget in-app):**
```
**Bug title:**
**Severity:** 🔴 Blocker / 🟠 Major / 🟡 Minor
**Steps to reproduce:**
  1.
  2.
  3.
**Expected:**
**Actual:**
**Browser/OS:**
**Screenshot/Screen record:** (drag here)
```

**Feature request template:**
```
**Problem:** (cosa non riesci a fare)
**Current workaround:** (come fai oggi)
**Proposed solution:** (cosa vorresti)
**How important (1-5):**
```

**NPS survey** — mandare dopo 2 settimane di uso:
- "On a scale of 0-10, how likely are you to recommend LabelPulse to another producer?"
- Follow-up: "What's the main reason for your score?"
- Calcolo: %Promoters (9-10) − %Detractors (0-6). Benchmark SaaS B2C: NPS >30 = buono, >50 = eccellente.

**CSAT micro-survey** — dopo ogni azione chiave (es. dopo aver inviato il primo pitch): "How was this experience? 😊 😐 😞"

**Session recording**: vedi §3.3.

### 2.4 Cadenza check-in

- **Settimanale** per primi 14 giorni (alta probabilità di drop-off).
- **Biweekly** da giorno 15 in poi (regola Centercode + Canny blog).
- **Wrap-up survey** a fine beta (giorno 30/45).

Format check-in: email breve con 3 domande (max 60s per rispondere):
1. Cosa ha funzionato questa settimana?
2. Cosa ti ha bloccato?
3. Una feature che vorresti?

### 2.5 Misurare engagement tester

Definizione operativa di **"tester attivo"** per LabelPulse:
- ≥1 login nei ultimi 7 giorni **E** ≥1 azione chiave (demo added, pitch generated, feedback inviato).

**"Tester dormiente"** = nessun login negli ultimi 14 giorni.

Trigger automatici (implementabili via cron in Vercel — vedi `weekly-recap` esistente):
- Dormiente da 14gg → email "tutto ok? serve aiuto?"
- Dormiente da 21gg → esclude dal "active beta" count, ma mantiene nei recap.

### 2.6 Quando passare da beta a GA — criteri oggettivi

Secondo Centercode "Beta Testing 101" e LaunchDarkly "Beta Testing Programs":

| Metrica | Soglia minima per GA |
|---|---|
| **Bug rate critici** (P0/P1) per 100 tester-attivi | <1 |
| **NPS** | ≥30 |
| **Activation rate** (% tester che completano primo demo+pitch entro 7gg) | ≥40% |
| **D7 retention** | ≥25% (media app consumer 17.6%, SaaS B2C meglio) |
| **Feedback risposta wrap-up survey** | ≥50% dei tester attivi |

Se 4 su 5 sono verdi → puoi passare a GA. Se NPS <10 o P0 bug >2 → non passare.

---

## 3. Strumenti tecnici per beta testing

### 3.1 Feature flag — rollout graduale

LabelPulse è Next.js 16 → **Vercel Flags SDK** è la scelta nativa più semplice.

| Tool | URL | Costo | Note |
|---|---|---|---|
| **Vercel Flags SDK** | https://flags-sdk.dev · https://vercel.com/blog/flags-as-code-in-next-js | **Free** (libreria open-source), integrazione con GrowthBook/PostHog via adapter | Nativo Next.js, code-first, override via Vercel Toolbar. Best per bootstrap. |
| **PostHog Feature Flags** | https://posthog.com | **1M richieste/mese free**, poi $0.0001/request (~$100/mese per 1M oltre il free) | Combo con analytics + session replay. **Consigliato per LabelPulse** (1 strumento al posto di 3). |
| **LaunchDarkly** | https://launchdarkly.com | Free fino a 30K MAU; piani paid partono ~$15/utente/mese → diventa caro sopra 100K MAU | Industry standard ma **overkill per bootstrap** |
| **GrowthBook** | https://www.growthbook.io | Open-source self-hosted **free**; cloud free fino a 3 seat | Per-team per-seat pricing, ottima opzione self-host |
| **Statsig** | https://www.statsig.com | Free con 2M eventi/mese + feature flag illimitati | Generoso free tier |
| **ConfigCat** | https://configcat.com | Free fino a 10K richieste/mese; poi ~$99/mese | Lightweight, semplicissimo |

**Raccomandazione LabelPulse:** **PostHog** (flag + analytics + replay in un solo SDK). Risparmia 2 librerie.

### 3.2 Analytics per SaaS beta

| Tool | URL | Costo | Cosa tracciare |
|---|---|---|---|
| **PostHog** | https://posthog.com/pricing | **1M eventi/mese + 5K replay + 1M flag requests free**; poi $0.00005/event | Tutto: funnels, retention, flags, replay |
| **Mixpanel** | https://mixpanel.com | Free fino a 20M eventi/mese; poi ~$20+/mese | Funnels e retention deep |
| **Amplitude** | https://amplitude.com | Free fino a 50K MAU; Growth plan custom | Retention 2 anni (vs Mixpanel 12 mesi) |
| **Plausible** | https://plausible.io | **Self-host free**; cloud da **$9/mese** per 10K pageview (alcuni piani $2.50/mese per 5K eventi) | Solo pageview/privacy-friendly, niente funnel per-user |

**Cosa tracciare in LabelPulse** (evento → azione):
1. `user_signed_up` (Gmail login completato)
2. `onboarding_completed` (WelcomeOnboarding chiuso)
3. `profile_created` (primo salvataggio producer-profile)
4. `first_label_added`
5. `first_demo_added`
6. `first_pitch_generated`
7. `demo_sent` (se trackable)
8. `feedback_submitted` (beta-feedback-button)
9. `push_enabled` (master toggle ON)
10. `weekly_recap_received` (push notification delivered)

Funnel chiave: `signed_up → onboarding_completed → first_label_added → first_pitch_generated → demo_sent`.

### 3.3 Session replay (GDPR-compliant)

| Tool | URL | Costo | GDPR |
|---|---|---|---|
| **PostHog Session Replay** | https://posthog.com | **5K replay/mese free**; poi ~$0.005/recording (~$5 per 1.000) | Sì, EU hosting disponibile |
| **LogRocket** | https://logrocket.com | Free 1K sessioni/mese; **Team $99/mese**, Professional $250/mese | Sì |
| **FullStory** | https://www.fullstory.com | Custom pricing (enterprise), ~$250+/mese entry | Sì |
| **OpenReplay** | https://openreplay.com | **Self-host free**; cloud da $100/mese | Sì (open-source) |

**Per LabelPulse:** PostHog Session Replay (hai già PostHog per analytics/flag, zero librerie aggiuntive). Configurare mascheramento di campi email/SoundCloud URL nelle impostazioni replay (GDPR).

### 3.4 Error tracking

LabelPulse **NON** ha Sentry configurato (verificato dal worklog — esiste un error boundary React aggiunto in Task #X, ma no error tracking server-side).

| Tool | URL | Costo | Note |
|---|---|---|---|
| **Sentry** | https://sentry.io/pricing | **Free 5.000 errori/mese + 50 replay + unlimited progetti/users**; Team ~$26/mese | Industry standard. SDK Next.js ufficiale. **Consigliato.** |
| **Rollbar** | https://rollbar.com | Free 5.000 eventi/mese; Essentials $100/mese (500K errori) | Alternativa valida, più costosa sopra soglia |
| **Bugsnag** | https://www.bugsnag.com | Free fino a 7.500 eventi/mese, 1 utente | Buono ma limitato a 1 seat nel free |

**Azione concreta:** installare `@sentry/nextjs`, configurare `sentry.{client,server,edge}.config.ts`, settare SENTRY_DSN in Vercel env vars. Tempo stimato: 2 ore.

### 3.5 In-app feedback widget

LabelPulse **ha già** un `beta-feedback-button.tsx` (verificato in worklog Task #17). È sufficiente per la beta. Se si vuole potenziare:

| Tool | URL | Costo | Quando usarlo |
|---|---|---|---|
| **Sentry User Feedback** | https://docs.sentry.io/platforms/javascript/user-feedback/ | Incluso nel piano Sentry | Auto-attached su errori — aggiungi se integri Sentry |
| **Hotjar** (ora Contentsquare) | https://hotjar.com | Free plan; Business da $32/mese | Heatmap + survey — utile per capire dove i tester cliccano |
| **Usersnap** | https://usersnap.com | Da **$69/mese** | Screenshot annotati — overkill sotto 100 tester |

**Raccomandazione:** Mantenere `beta-feedback-button.tsx` esistente + integrazione Sentry user feedback (gratis se già hai Sentry).

---

## 4. Metriche da tracciare in beta

### 4.1 Metriche core con benchmark SaaS 2026

Secondo Userpilot 2024 Activation Benchmark Report (62 SaaS B2B) e fonti 2026:

| Metrica | Definizione | Benchmark SaaS | Target LabelPulse |
|---|---|---|---|
| **Activation rate** | % nuovi signup che completano "aha moment" entro 7gg | 37.5% medio B2B SaaS | ≥35% (producer tool, più motivato) |
| **Time-to-value (TTV)** | Tempo medio signup → primo pitch generato | <24h top quartile | <30 min |
| **D1 retention** | % utenti che tornano il giorno dopo signup | ~22-30% (consumer app) | ≥30% |
| **D7 retention** | % utenti che tornano a 7gg | 17.6% (consumer media); top 25% = 7% del cohort iniziale (Amplitude "7% rule") | ≥15% |
| **D30 retention** | % utenti attivi a 30gg | 11.6% fintech benchmark | ≥10% |
| **NPS** | likelihood to recommend 0-10 | >30 buono, >50 ottimo | ≥30 per GA |
| **CSAT** | satisfaction post-azione | ≥80% | ≥80% |
| **Bug report per utente attivo** | bugs / tester attivi / settimana | <0.5 | <0.5 |

### 4.2 Funnel onboarding LabelPulse

```
Gmail login → WelcomeOnboarding dismiss → profile_created (step 1)
            → first_label_added (step 2)
            → first_demo_added (step 3)
            → first_pitch_generated (step 4)
            → demo_sent (step 5 — momento "aha")
```

**Drop-off critici da monitorare:**
- Step 1→2 (drop tipico 30-50%): se >60% drop → problema UX nell'onboarding.
- Step 4→5 (drop tipico 20-40%): se >50% → il pitch non è abbastanza buono da spingere all'invio.

### 4.3 NPS, CSAT, bug report per utente attivo

Vedi §2.3 per template NPS. Per bug report per utente attivo:
- **<0.5/settimana** = sano, prodotto stabile.
- **0.5–1.5** = bug freq, da risolvere prima di GA.
- **>1.5** = prodotto non ready per GA, interrompi open beta.

### 4.4 Tester attivo vs dormiente

Vedi definizione in §2.5. Dashboard consigliata (in admin page):

```
Total testers:        42
Active (7gg):         28  (67%)  🟢
Active (14gg):        35  (83%)  🟢
Dormient (14-21gg):   4   (10%)  🟡
Lost (>21gg):         3   (7%)   🔴
```

---

## 5. Esempi concreti (case study reali)

- **Notion (2022-2023)**: waitlist AI aperta novembre 2022, target interno 200K → 1M signup in 5 settimane. Modello "staggered access": davano accesso a 50K utenti/settimana per controllare il carico.
- **Superhuman**: 180.000-person waitlist per email client $30/mese. Approccio "concierge onboarding" — ogni nuovo utente avuto 30min call 1:1 col team.
- **Linear**: partita con waitlist di 10.000 persone su MVP. Passata a $400M valuation con strategy "founder-led beta, bug triage in public GitHub".
- **Splice (giugno 2023)**: ha aggiunto canale Discord "Diamonds" per under-represented music-makers — esempio di beta/community management attivo.

---

## 6. Roadmap concreta per LabelPulse (prossimi 30gg)

**Settimana 1 — Setup tecnico:**
1. Installa Sentry (`@sentry/nextjs`), 2h.
2. Installa PostHog SDK, traccia i 10 eventi elencati in §3.2, abilita session replay + feature flags. 4h.
3. Configura `discord.gg/yourserver` con canali `#beta-announcements`, `#bug-reports`, `#feature-requests`, `#general`. 1h.
4. Crea board Canny (free) per feature requests. 30min.

**Settimana 2 — Recruitment:**
1. Posta su BetaList (submit free o featured $129).
2. Posta su r/WeAreTheMusicMakers + r/edmproduction (forma "value-first", vedi §1.2).
3. Contatta 20 producer via DM con template §1.4.
4. Apri screening questionnaire (Google Form/Tally) con 5 domande chiave.

**Settimana 3-4 — Closed beta:**
1. Invita 15-25 tester selezionati.
2. Email welcome (template §2.2) + invito Discord.
3. Traccia funnel, bug rate, NPS dopo 14gg.
4. Check-in settimanale email.

**Settimana 5-6 — Decisione:**
1. Valida 5 metriche di §2.6.
2. Se 4/5 verdi → apri open beta (50-200 tester via BetaList featured + FB group).
3. Se <4/5 → itera, posticipa GA.

---

## 7. Cose NON trovate / da approfondire

- **Strumenti specifici per music-SaaS beta**: non trovato alcun tool dedicato. LabelPulse dovrà adattare prassi SaaS general-purpose.
- **r/produceTech**: nome verificato su Wikipedia/Reddit — non risulta essere subreddit principale. Usare invece r/edmproduction + r/WeAreTheMusicMakers.
- **Costo esatto BetaList featured 2026**: fonti indicano range $129-$299; verificare su https://betalist.com/submit al momento del submit.
- **UserVoice costo attualizzato 2026**: confermato $1.333/mese su Productlift.dev, ma UserVoice non pubblica prezzo ufficiale.
- **Conversion rate atteso Discord music community → beta signup**: non trovato benchmark pubblico. Da misurare in prima persona.
