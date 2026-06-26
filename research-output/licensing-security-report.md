# Report: Licensing + Anti-Piracy per LabelPulse
**Task ID:** research-2-licensing-security  
**Data:** 2026-06-26  
**Obiettivo:** garantire che LabelPulse non sia copiabile/bypassabile dai beta tester, sia pronto per abbonamento mensile/annuale, segua convenzioni SaaS standard (Splice, LANDR, DistroKid, Beatport, Soundcloud), e sia legalmente conforme EU/Italia.

---

## 1. Modello di licensing SaaS standard

### 1.1 Confronto piattaforme di billing

| Piattaforma | Modello | Costo | Merchant of Record | VAT EU gestita | Note per LabelPulse |
|---|---|---|---|---|---|
| **Stripe Billing** | Payment processor | 2.9% + $0.30 per transazione + 0.5% per subscription billing | ❌ No | Solo con Stripe Tax (0.5% extra) | Più economico, ma devi gestire VAT/MOSS/e-invoice IT da solo |
| **Paddle** | Merchant of Record | 5% + 50¢ per transazione, no mensilità | ✅ Sì | ✅ Automatizzata in 200+ paesi | Ottimo per SaaS globali, assorbe parte chargeback |
| **Lemon Squeezy** | Merchant of Record | 5% + 50¢ flat per transazione, no mensilità | ✅ Sì | ✅ Automatizzata | Più semplice di Paddle, pass-through chargeback |
| **Chargebee** | Subscription management (usa Stripe/Paddle come backend) | Piano free fino a $50k MRR, poi $599+/mese + fee | ❌ No ( integra processor) | Solo tramite integrazione | Overkill per fase beta, utile dopo product-market fit |

Fonti reali:
- Lemon Squeezy pricing ufficiale: https://www.lemonsqueezy.com/pricing — "5% + 50¢ per transaction"
- Stripe Billing pricing: https://stripe.com/billing/pricing — 0.5% subscription fee on top of card fees
- Confronto 2026 Paddle/LS/Stripe: https://f3fundit.com/stripe-vs-paddle-vs-lemon-squeezy-micro-saas-2026
- Chargebee vs Stripe Billing: https://unibee.dev/blog/chargebee-vs-stripe-billing-the-ultimate-2025-comparison

**Raccomandazione per LabelPulse:** **Lemon Squeezy** in fase beta + early commercial (5% + 50¢, MoR, VAT EU automatizzata → per vendite a utenti IT è il default migliore). Migrazione a **Stripe Billing + Stripe Tax** quando il MRR supera ~$5k/mese (a quel punto il differential di costo 5% vs 2.9%+0.5% diventa significativo, e Stripe ha migliore UX per abbonamenti annuali con proration).

### 1.2 Subscription states — gestione nel codice

Stripe espone `subscription.status` con questi valori ufficiali (https://docs.stripe.com/billing/subscriptions/overview):
- `incomplete` — appena creata, attesa pagamento
- `incomplete_expired` — scaduta prima del pagamento
- `trialing` — in prova gratuita (Stripe traccia trial revenue separato)
- `active` — pagata e valida
- `past_due` — rinnovo fallito, in retry (entro 4 tentativi con Smart Retries)
- `canceled` — terminata
- `unpaid` — retry esauriti, accesso revocato

**Pattern raccomandato per LabelPulse:**
1. **Webhook Stripe/LS** (`/api/webhooks/billing`) → aggiorna colonna `subscriptions` in Supabase: `status`, `current_period_end`, `cancel_at_period_end`
2. **Middleware Next.js** legge `subscriptions.status` dal DB ad ogni richiesta autenticata; se `active`/`trialing`/`past_due` → accesso OK; se `canceled`/`unpaid`/`incomplete_expired` → redirect a `/billing`
3. **Grace period `past_due`**: 7 giorni di tolleranza (configurabile in Stripe Billing → "Grace period"). Evita lockout per carte temporaneamente bloccate.

Fonte: https://docs.stripe.com/billing/subscriptions/webhooks — "Handle subscription events including payment failures, status changes, trial endings"

### 1.3 Device limit per licenza — best practice SaaS music tool

Casi reali:
- **LANDR**: 1 account, accessibilità da qualsiasi device via web (no device lock). Limita invece per feature tier (samples downloads/mese, mastering credits)  
  → https://www.landr.com/pricing
- **Splice desktop app**: 1 device attivo per plugin rent-to-own; l'attivazione richiede il client Splice aperto in background (license check server-side ogni N giorni)  
  → https://support.splice.com/en/articles/8652687-about-rent-to-own
- **Output Arcade**: 2 device attivi simultanei, offline grace 14 giorni, poi forced re-login
- **DistroKid**: nessun device limit, ma l'account è personale (T&C vietano condivisione)
- **Soundcloud Pro**: nessun device limit (web-first)

**Best practice per LabelPulse (SaaS music label tool, web-first PWA):**
- **3 dispositivi attivi simultanei** per account (desktop + 2 mobile, tipico per producer che lavora in studio + in mobilità)
- **No HWID hard binding** in fase beta (è una PWA installabile, non un plugin VST — la HWID è fragile su browser)
- **Offline grace period: 7 giorni** (Lemon Squeezy/Stripe webhook scade → app continua a funzionare offline 7gg, poi blocca con messaggio "Riconnetti per verificare la tua subscription")
- **Server-side check al login + ogni 24h** durante l'uso

### 1.4 Offline grace period — implementazione

Pattern standard (usato da LANDR/Output Arcade):
1. Ad ogni login riuscito, server firma un JWT con `exp = now + 7 days` contenente `sub: user_id, plan: pro, devices: 3`
2. Client salva il JWT in IndexedDB (più persistente di localStorage, sopravvive a clear browsing data parziale)
3. Ad ogni apertura app: se online → chiama `/api/license/verify` → refresh JWT; se offline → valida JWT localmente con chiave pubblica embedded
4. JWT scaduto + offline → overlay "Connessione richiesta" con countdown al grace period

---

## 2. Protezione codice Next.js + Supabase

### 2.1 Repo privato vs pubblico

LabelPulse è attualmente **pubblico su GitHub**. Implicazioni:

| Aspetto | Pubblico | Privato |
|---|---|---|
| Pricing/secret leaking | Solo secret in env vars (sicuro se ben fatto) | Idem |
| Algoritmi/euristica (es. ranking Beatport) | Esposti → competitor possono copiare | Nascosti |
| RLS SQL schema | Visibile → attaccanti vedono policy da bypassare | Nascosto (security through obscurity, non vera protezione) |
| Contributi esterni | Possibili PR | No |
| Trust/trasparenza | Alto (open-core model) | Basso |

**Raccomandazione:** spostare il repo LabelPulse su **privato** quando si avvicina il lancio commerciale. Tenere pubblico un repo separato `labelpulse-docs` o `labelpulse-sdk` per trasparenza. La value di LabelPulse sta nella **label database + euristica ranking**, non nel codice UI.

### 2.2 Nascondere logica sensibile lato server

Next.js 16 App Router dà già strumenti gratuiti:
- **API routes serverless** (`app/api/*/route.ts`): codice mai inviato al browser, eseguito solo su Vercel/Node server
- **Server Components** (`'use server'`): rendering server-side, HTML finale inviato al client (no JS logica)
- **Server Actions**: funzioni callable dal client ma eseguite solo server-side
- **Edge Middleware**: route protection prima del render

Per LabelPulse, spostare qui:
- Tutta la logica di scoring/ranking labels (attualmente in `src/lib/label-scorer.ts` se client-side)
- Beatport/Soundcloud API calls con chiavi
- Generazione JWT di licenza
- Query Supabase con `service_role` key (mai nel client bundle)

### 2.3 Code obfuscation JS — quanto è efficace realmente?

Risposta breve: **poco**. Fonte: https://www.eresussec.com/en/blog/javascript-obfuscation-reverse-engineering-deobfuscation — dimostra che `javascript-obfuscator`, `obfuscator.io`, `JScrambler` e schemi custom sono tutti reversibili in ore/giorni con strumenti automatici (webcrack, de4js, synchrony).

Citazione reddit r/Frontend: *"Even without source maps you can set breakpoints in the production bundle and pretty easily figure out what it maps to"* — https://www.reddit.com/r/Frontend/comments/1fs7kos

Strumenti disponibili:
- **javascript-obfuscator** (npm) — free, control-flow flattening, string array rotation
- **terser** — minifier standard, NON è obfuscation
- **webpack-obfuscator** — wrapper per javascript-obfuscator
- **JScrambler** — commerciale (€150+/mese), obfuscation + anti-debug + anti-tamper

**Verdetto per LabelPulse:** NON investire in obfuscation client-side. È **crackable in ore**. Spendere energie su:
1. Spostare logica critica server-side (efficacia: alta, costo: medio)
2. RLS Supabase + service_role (efficacia: alta, costo: basso)
3. JWT signed license check (efficacia: alta, costo: basso)

### 2.4 Source maps disabilitate in production

Next.js le disabilita di default in production build (https://nextjs.org/docs/app/api-reference/config/next-config-js/productionBrowserSourceMaps): *"During production builds, they are disabled to prevent you leaking your source"*.

Per inviarle solo a Sentry/Datadog (per stack trace debugging) senza esporle public:
- Configurare `sentry-webpack-plugin` con `deleteCompilerSources: true` + upload a Sentry
- Non servire `.map` files da `/static/`

**Azione per LabelPulse:** verificare `next.config.ts` non abbia `productionBrowserSourceMaps: true`. Inviarle a Sentry via CI step (già fatto? verificare).

### 2.5 Watermarking per-user build

Tecnica: ogni beta tester riceve una build con marker unico (es. commento in JS, carattere Unicode invisibile in stringhe, ordine specifico di import). Se la build leak-a su GitHub/warez, si risale all'origine.

Strumenti reali:
- **Forensic watermarking** (Synamedia ContentArmor, castlabs) — per video/audio, costoso enterprise
- Per JS SaaS: watermarking custom in build step — es. inserire `__LP_UID_12345__` in una variabile globale, o ordine di chiavi oggetto codificato

**Per LabelPulse:** implementazione custom leggera:
1. Build script Vercel legge header `x-lp-tester-id` (per beta builds)
2. Inietta un identificatore unico in una costante (es. `const __BUILD_ID = "uuid-tester-123"`)
3. Se build leak-a, grep del file per `__BUILD_ID` rivela il tester

Complessità: bassa (mezzo giorno di lavoro). Efficacia: media (si rimuove con grep+sostituzione, ma scoraggia la maggior parte dei leak). Costo: $0.

### 2.6 Client-side checks vs server-side checks

Regola d'oro (da https://dev.to/codepo8/cracking-a-developer-tools-killer-script-2lpl): *"The real answer to anti-debugging isn't client-side JS gymnastics — it's server-side obfuscation and certificate pinning."*

| Check | Dove | Efficacia |
|---|---|---|
| Auth user loggato | Server (cookie httpOnly NextAuth) | Alta |
| Subscription attiva | Server (Supabase query) | Alta |
| Device count ≤ 3 | Server (audit log table) | Alta |
| License JWT valido | Server (verifica firma) | Alta |
| Feature flag tier | Server (PostHog) | Alta |
| "Hide button if not pro" | Client | Bassa (cosmetica, comunque bloccata server-side) |

Pattern corretto: il client **nasconde** UI per UX; il server **impedisce** l'azione. Mai viceversa.

### 2.7 Anti-debugging techniques (devtools detection, anti-F12)

Tecniche esistenti:
- `debugger;` statement in loop — rallenta DevTools aperto
- Detection `window.console` override
- Timing attack: `Date.now()` prima/dopo `console.log` (DevTools aperto rallenta)
- Detection resize window (DevTools docked)

**Problema:** tutte queste sono facilmente bypassabili (https://www.reddit.com/r/browsers/comments/rpvlpn — basta "Search in folders" per `debugger` e rimuovere). Peggio, rompono UX per sviluppatori legittimi (anche te).

**Raccomandazione LabelPulse:** NON usare anti-debugging. Innesca solo false positività e non ferma attaccanti determinati.

### 2.8 Service worker PWA — limitare installazione solo a utenti autorizzati

Constraint reale: **il Service Worker si registra su qualunque visita** (https://web.dev/learn/pwa/service-workers — "Service worker installation happens silently, without requiring user permission"). Non puoi impedire tecnicamente l'installazione di una PWA.

Tuttavia puoi fare:
1. **SW fa fetch auth-check al boot** → se utente non autenticato, redirect a /login (l'app offline non funziona comunque senza JWT)
2. **Cache strategy**: SW cache-only per assets statici, **network-first per API routes** (se offline e JWT scaduto → blocco)
3. **No precaching delle route private** prima del login (evita leak di HTML con dati sensibili nella cache SW)
4. **Logged-out state**: SW serve solo shell vuota + login page

Per LabelPulse, il SW attuale (v4 citato nel worklog) va rafforzato:
- Aggiungere check JWT in `fetch` handler
- Se `Authorization` header manca o JWT scaduto → fetch diretta (no cache) → server risponde 401 → redirect
- Mai cachare risposte `/api/*` con status 200 che contengano dati utente

---

## 3. Supabase RLS + multi-tenant isolation (consolidamento)

### 3.1 RLS policy patterns per subscription tier

Pattern raccomandato (fonte: https://makerkit.dev/blog/tutorials/supabase-rls-best-practices — MakerKit, 100+ deploy production):

```sql
-- Tabella subscriptions
CREATE TABLE public.subscriptions (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  status TEXT NOT NULL CHECK (status IN ('trialing','active','past_due','canceled','unpaid')),
  plan TEXT NOT NULL CHECK (plan IN ('free','pro','label')),
  current_period_end TIMESTAMPTZ,
  cancel_at_period_end BOOLEAN DEFAULT FALSE,
  device_count INT DEFAULT 0,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- RLS: utente vede solo la propria subscription
ALTER TABLE public.subscriptions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "user_reads_own_subscription" ON public.subscriptions
  FOR SELECT USING (auth.uid() = user_id);
-- Nessuna INSERT/UPDATE da client: solo service_role (API server) scrive

-- Helper function: is_subscribed()
CREATE OR REPLACE FUNCTION public.is_subscribed(uid UUID)
RETURNS BOOLEAN LANGUAGE sql SECURITY DEFINER AS $$
  SELECT EXISTS(
    SELECT 1 FROM public.subscriptions
    WHERE user_id = uid
      AND status IN ('trialing','active','past_due')
      AND (current_period_end IS NULL OR current_period_end > NOW())
  );
$$;

-- RLS su app_state (dati LabelPulse utente)
CREATE POLICY "user_rw_own_data_if_subscribed" ON public.app_state
  FOR ALL USING (
    auth.uid() = user_id AND public.is_subscribed(auth.uid())
  );
```

### 3.2 Blocco accesso se subscription scaduta — trigger

Pattern: trigger dopo ogni login che blocca se subscription expired. In realtà Supabase Auth non permette "deny login" via trigger facilmente; meglio pattern middleware:

**Approccio raccomandato:**
1. NextAuth `signIn` callback → chiama Supabase RPC `is_subscribed(user_id)` → se false → deny + redirect a `/renew`
2. + Middleware Next.js su tutte le route private → stesso check ad ogni navigazione
3. + API routes → check all'inizio di ogni handler

### 3.3 Audit log table

```sql
CREATE TABLE public.audit_log (
  id BIGSERIAL PRIMARY KEY,
  user_id UUID,
  event TEXT NOT NULL, -- 'login','license_check','device_add','data_export'
  ip INET,
  user_agent TEXT,
  device_fingerprint TEXT,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW()
);
-- RLS: utente vede solo i propri log; service_role vede tutto
```

Usato per: identificare account sharing (device fingerprint ripetuti su IP diversi), tracciare leak di dati (export bulk anomali), debugging.

### 3.4 Rate limiting per API routes

**Upstash Redis** + `@upstash/ratelimit` è lo standard de-facto per Next.js (https://upstash.com/blog/nextjs-ratelimiting):

```typescript
import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";

const ratelimit = new Ratelimit({
  redis: Redis.fromEnv(),
  limiter: Ratelimit.slidingWindow(30, "1 m"), // 30 req/min per user
  analytics: true,
});

export async function POST(req: Request) {
  const session = await getServerSession();
  const { success } = await ratelimit.limit(session.user.email);
  if (!success) return new Response("Too many requests", { status: 429 });
  // ... handler
}
```

Costo Upstash: free tier 10k comandi/giorno, piano paid $0.20 per 100k comandi. Sufficiente per beta.

**Alternative:** Vercel KV (basato su Upstash sotto), `lru-cache` in-memory (non funziona con serverless multi-istanza).

---

## 4. Anti-piracy specifico SaaS creator tool

### 4.1 Casi reali di SaaS music tool craccati

Ricerca su Reddit (r/Piracy, r/CrackedPluginsXI, r/musicproduction):

- **Output Arcade**: craccato dal team **FLARE** (fonte: https://www.reddit.com/r/Piracy/comments/ltpgf1 — "Arcade was cracked by team FLARE and they posted the expansion as an offline download"). La crack fornisce solo i plugin player, NON la libreria online (che resta server-side). → **Esempio perfetto: la parte server-side resta intatta, solo il client viene bypassato**.
- **Splice**: mai craccato veramente (rent-to-own plugin come Serum richiedono attivazione server-side). Esistevano vecchi crack del client Splice per scaricare sample senza subscription, ma bloccati rapidamente.
- **LANDR**: mai craccato (mastering è 100% server-side, il client è solo uploader).
- **Plugin VST in generale**: quasi tutti craccati (Serum, FabFilter, Native Instruments). Pattern: crackano l'attivazione license check, non il DSP. → conferma che **client-side licensing NON funziona**.

### 4.2 Cosa NON funziona

❌ **Obfuscation JS client-side** — crackable in ore (fonte sopra)  
❌ **Anti-debugging devtools detection** — bypassato da "search in folders"  
❌ **License check solo client-side** — patch via `if(true) return valid`  
❌ **HWID hard binding in PWA** — fragile, genera false positività (cambio browser, refresh, incognito)  
❌ **Repo pubblico con algoritmi sensibili** — copiabile in 1 click  

### 4.3 Cosa FUNZIONA davvero

✅ **Spostare logica critica server-side** — esempio LANDR: mastering su server, client è solo UI  
✅ **Dati protetti via RLS Supabase** — se non hai subscription, non vedi la label database  
✅ **License check server-signed JWT** — client valida con chiave pubblica, server firma con chiave privata  
✅ **Webhook billing → DB subscription table → RLS gate** — triade indissociabile  
✅ **Account-bound features** — es. export label list richiede POST server-side che verifica subscription  

Per LabelPulse, la value sta in **label database + ranking euristica + Beatport data**, non nel codice. Se queste restano dietro RLS + API routes server-side, la "crack" del client non dà accesso a nulla di valore.

### 4.4 HWID binding (FingerprintJS, clientjs)

Tool:
- **FingerprintJS** (open-source, free, https://github.com/fingerprintjs/fingerprintjs) — accuratezza ~60-70% (fonte: https://blog.castle.io/9-device-fingerprinting-solutions-for-developers)
- **Fingerprint (commercial, ex-FingerprintJS Pro)** — 99.5% accuracy, pricing da $200/mese (https://docs.fingerprint.com/docs/introduction)
- **ClientJS** — libreria lighter, accuratezza simile all'open-source

**Pro HWID:**
- Identifica account sharing (stesso device, account diversi)
- Prevenzione fraud multiplo

**Contro HWID:**
- False positività (cambio browser, update OS, incognito)
- GDPR: fingerprinting è considerato dato personale in EU (va disclosure in cookie policy)
- Non sostituisce auth: è complementare, non primario

**Raccomandazione LabelPulse:** usare FingerprintJS open-source solo per **audit log** (rilevamento account sharing, non per gating). Mai bloccare login basandosi solo su fingerprint. Costo: $0.

---

## 5. Aspetti legali (Italia/EU)

### 5.1 Termini di servizio SaaS

Tool:
- **TermsFeed** (https://www.termsfeed.com) — generator free + paid ($29/document custom)
- **iubenda** (https://www.iubenda.com) — generator IT/EN, piano free per privacy policy, $9-49/mese per Terms & Conditions + cookie
- **Termly** (https://termly.io) — generator US/EU, free tier limitato, $10-45/mese

Per LabelPulse IT-first: **iubenda** (italiano, GDPR native, integrato con cookie solution). Costo: piano Pro ~€29/mese copre privacy + terms + cookie + consent records.

### 5.2 Privacy policy GDPR-compliant

Obbligatorio se beta tester EU (Regolamento UE 2016/679, art. 13-14). Elementi minimi:
- Titolare del trattamento (LabelPulse / tuo nome + email)
- Finalità del trattamento (erogazione servizio, analytics, billing)
- Base giuridica (contratto, consenso, legittimo interesse)
- Categorie di dati (email, dati uso, IP, device fingerprint se usato)
- Destinatari (Supabase, Vercel, Lemon Squeezy/Stripe, PostHog)
- Periodo conservazione
- Diritti utente (accesso, rettifica, cancellazione, portabilità, opposizione)
- DPO o punto contatto

Tool: **iubenda Privacy Policy Generator** genera documento auto-aggiornante. Costo: €9/mese piano singolo.

### 5.3 NDA per beta tester closed beta

Template free:
- **Rocket Lawyer** (https://www.rocketlawyer.com/business-and-contracts/intellectual-property/confidentiality-agreements/document/non-disclosure-agreement---beta-tester) — IT/EN, free compile
- **Wonder.Legal** (https://www.wonder.legal) — NDA beta tester free
- **Business-in-a-Box** (https://www.business-in-a-box.com/template/non-disclosure-agreement-beta-tester-D798) — Word/PDF free

Elementi chiave: definizione "Confidential Information", durata (2-5 anni post-termination), divieto reverse engineering, divieto condivisione screenshot/registrazioni, penalità in caso di breach.

Per LabelPulse closed beta: far accettare NDA al primo login via checkbox + email inviata come prova. Costo: $0 (template + DocuSign free tier 3 docs/mese).

### 5.4 EULA vs SaaS Agreement

Differenza chiave (fonte: https://www.law365.co/blog/what-is-the-difference-between-a-eula-and-a-saas-agreement):
- **EULA**: licenza per usare software installato localmente (es. plugin VST, app desktop)
- **SaaS Agreement**: accesso a servizio cloud, non si installa nulla

LabelPulse essendo PWA web-first non installato come binario → **SaaS Agreement / Terms of Service**, NON EULA. EULA serve solo se in futuro distribuisci plugin desktop/mobile native.

### 5.5 Cookie consent

Obbligatorio in EU (Direttiva ePrivacy + GDPR). Italia ha linee guida specifiche (Garante Privacy, https://www.iubenda.com/en/help/31246-italy-new-cookie-rules):
- Banner prima di installare cookie non tecnici
- No pre-ticked boxes
- Rifiuto facile quanto accettazione
- Cookie analytics (anche PostHog, GA4) richiedono consenso
- Cookie tecnici (sessione, preferenza lingua) non richiedono consenso

**Tool:** Iubenda CookieYes, Osano. Costo iubenda Cookie Solution: incluso piano Pro €29/mese.

### 5.6 Diritto di recesso 14 giorni EU

Fonte: https://www.dirittodellinformatica.it/consumatori/consumatori-focus/la-fornitura-di-servizi-o-contenuti-digitali-ed-il-diritto-di-recesso-del-consumatore-alla-luce-delle-disposizioni-normative-previste-dal-codice-del-consumo.html + https://stripe.com/it/resources/more/right-of-withdrawal-online-purchases-italy

**Regola EU (DLgs 206/2005 Codice del Consumo, art. 52-64):**
- Consumatore ha 14 giorni per recedere da contratto a distanza, senza motivazione
- Per **servizi digitali** (SaaS): se l'utente richiede esecuzione immediata e acconsente esplicitamente a perdere il diritto di recesso → il diritto decade (art. 59 lett. i)
- Dal **19 giugno 2026** (fonte: https://www.dday.it/redazione/57764) — EU obbliga un **pulsante di recesso elettronico** su tutti i contratti online consumer

**Come gestirlo per LabelPulse:**
1. Checkout Lemon Squeezy/Stripe: checkbox esplicito *"Acconsento a iniziare il servizio immediatamente e rinuncio al diritto di recesso di 14 giorni"*
2. Implementare pulsante di recesso in dashboard utente entro 14gg (per sicurezza: comunque allow refund entro 14gg se l'utente non ha usato substantivamente l'app — migliore UX)
3. Per subscription annuale: refund pro-rata entro 14gg è comunque prassi standard SaaS (DistroKid, Soundcloud Pro lo fanno)

Fonte withdrawal button June 2026: https://www.potomaclaw.com/news-EUs-New-Withdrawal-Button-Requirement-June-2026-Deadline-Approaching

---

## 6. Stack consigliato per LabelPulse

Basato su tutta la ricerca, raccomandazione concreta:

### 6.1 Auth
- **NextAuth v5 (Auth.js)** + **Supabase Auth adapter** (già presente nel progetto, non toccare)
- Session JWT httpOnly cookie, 7 giorni expiry
- Provider: Email magic link (default), Google OAuth (producer), GitHub (per team label)

### 6.2 Billing
- **Fase beta (ora → 50 utenti paganti): Lemon Squeezy** (5% + 50¢, MoR, VAT EU gestita, setup 1 giorno)
- **Fase scale (> $5k MRR): migrazione a Stripe Billing + Stripe Tax** (risparmio ~1.6% per transazione sopra soglia)
- Piani: Free (read-only demo), Pro €19/mese (producer singolo, 3 device), Label €99/mese (label team, 10 device, multi-user)

### 6.3 License check
- Tabella Supabase `subscriptions` con RLS (vedi 3.1)
- API route `POST /api/license/verify` → firma JWT con `SUPABASE_SERVICE_ROLE_KEY` (server-only), payload `{sub, plan, devices, exp}`
- Middleware Next.js verifica JWT ad ogni richiesta route private
- Client chiama verify ogni 24h (refresh JWT) + ad ogni login

### 6.4 Device binding
- **3 dispositivi simultanei** per piano Pro, 10 per Label
- Tabella `user_devices` con `(user_id, fingerprint, last_seen, name)`
- API `POST /api/devices/claim` → se count > limite, ritorna 409 Conflict + lista dispositivi da revocare
- Fingerprint via FingerprintJS open-source (solo per audit, non gating)
- Fallback email magic link se fingerprint cambia (es. nuovo browser) → utente conferma via email

### 6.5 In-app messaging + feature flag
- **PostHog** (free fino a 1M eventi/mese, https://posthog.com)
- Feature flag per gating tier (es. `pro_features`, `label_features`)
- Analytics funnel (signup → trial → paid → retained)
- Session replay per debugging UX (opt-in GDPR)

### 6.6 Code protection
- Repo GitHub: **privato** (azione immediata, $0/mese se organization free tier)
- Logica ranking/scoring → API routes server-side
- Supabase `service_role` key → solo API routes, MAI nel client bundle
- Source maps → disabilitate in production browser, inviate a Sentry via CI
- Obfuscation: **no** (inefficace)
- Watermarking per-user: **sì** per beta builds (custom script Vercel)

### 6.7 Rate limiting
- Upstash Redis free tier + `@upstash/ratelimit`
- 30 req/min per utente su API mutate
- 100 req/min per utente su API read
- 5 req/min su `/api/auth/login` (brute force protection)

### 6.8 Legal
- iubenda Pro €29/mese: Privacy Policy + Terms & Conditions + Cookie Solution + Consent Records
- NDA beta tester: template Rocket Lawyer free + acceptance checkbox al primo login
- Checkout checkbox rinuncia recesso 14gg (art. 59 lett. i Codice Consumo)
- Pulsante recesso elettronico (obbligo EU dal 19 giugno 2026) → implementare entro Q2 2026

### 6.9 Costo totale mensile stimato (fase 50 utenti paganti)
- Vercel Pro: $20
- Supabase Pro: $25
- Upstash Redis: $0 (free tier)
- PostHog: $0 (free tier)
- iubenda Pro: €29 (~$32)
- Lemon Squeezy: 5% + 50¢ × 50 = ~$50 (su €19×50 = $950)
- Sentry: $0 (free tier)
- **Totale: ~$127/mese + fees billing**

---

## 7. Roadmap azioni concrete (priority order)

| # | Azione | Sforzo | Efficacia |
|---|---|---|---|
| 1 | Spostare repo GitHub LabelPulse su privato | 5 min | Alta |
| 2 | Verificare `next.config.ts`: `productionBrowserSourceMaps: false` | 5 min | Alta |
| 3 | Aggiungere tabella `subscriptions` + `audit_log` + RLS policy | 1 giorno | Alta |
| 4 | Implementare API route `/api/license/verify` con JWT sign | 1 giorno | Alta |
| 5 | Aggiungere Middleware Next.js per route protection | mezza giornata | Alta |
| 6 | Integrare Lemon Squeezy webhook → update `subscriptions` | 1 giorno | Alta |
| 7 | Aggiungere FingerprintJS open-source + audit log device | mezza giornata | Media |
| 8 | Setup iubenda (privacy + terms + cookie) | mezza giornata | Alta (legale) |
| 9 | NDA checkbox + template beta tester | mezza giornata | Alta (legale) |
| 10 | Implementare offline grace period 7gg con IndexedDB JWT | 1 giorno | Media |
| 11 | Setup PostHog + feature flag per tier gating | mezza giornata | Media |
| 12 | Setup Upstash rate limiting su API routes | mezza giornata | Media |
| 13 | Build script watermark per-user per beta | mezza giornata | Bassa (deterrente) |
| 14 | Pulsante recesso elettronico (entro giugno 2026) | 1 giorno | Alta (legale EU) |

Tempo totale stimato: 7-9 giorni di sviluppo full-time per implementazione completa anti-piracy + licensing + legal.

---

## 8. Cosa NON fare (anti-pattern identificati nella ricerca)

1. ❌ Obfuscation JS client-side (javascript-obfuscator, JScrambler) — crackable in ore, dà falsa sicurezza
2. ❌ Anti-debugging devtools detection — bypassato, rompe UX sviluppatori
3. ❌ HWID hard binding come gate primario — false positività, GDPR issues
4. ❌ Repo pubblico con algoritmi di ranking/euristica — copiabile in 1 click
5. ❌ License check solo client-side — patch `if(true) return valid` e via
6. ❌ EULA per SaaS web-first — sbagliato legalmente, serve SaaS Agreement
7. ❌ Cookie banner senza rifiuto facile — viola GDPR + linee guida Garante IT
8. ❌ Vendere senza checkbox rinuncia recesso 14gg — illegale in EU per servizi digitali
9. ❌ Credere che minification = protection — è solo compression, reversibile in 1 secondo
10. ❌ Usare Chargebee in fase beta — overkill, costa $599/mese quando superi $50k MRR

---

## Conclusioni

LabelPulse è un SaaS web-first PWA dove la **value sta nei dati** (label database, ranking Beatport/Soundcloud), **non nel codice**. Questo è un vantaggio competitivo enorme per l'anti-piracy: spostando tutta la logica di scoring/ranking dietro API routes server-side + RLS Supabase, anche se un beta tester copiasse 100% del codice client, avrebbe in mano una shell vuota senza dati.

Stack finale raccomandato: **NextAuth + Supabase Auth (esistente) + Lemon Squeezy (billing MoR) + PostHog (feature flag) + Upstash Redis (rate limit) + iubenda (legale)**. Costo mensile fase 50 utenti: ~$127. Implementazione completa: 7-9 giorni.

Nessuna soluzione "exotic" (no obfuscation, no anti-debugging, no HWID hard lock, no blockchain licensing). Tutto standard SaaS enterprise-grade, replicabile, manutenibile.

---

## Fonti principali

- Stripe Billing docs: https://docs.stripe.com/billing/subscriptions/overview
- Stripe webhooks: https://docs.stripe.com/billing/subscriptions/webhooks
- Lemon Squeezy pricing: https://www.lemonsqueezy.com/pricing
- Stripe vs Paddle vs Lemon Squeezy 2026: https://f3fundit.com/stripe-vs-paddle-vs-lemon-squeezy-micro-saas-2026
- Supabase RLS best practices (MakerKit): https://makerkit.dev/blog/tutorials/supabase-rls-best-practices
- Upstash rate limit Next.js: https://upstash.com/blog/nextjs-ratelimiting
- Next.js productionBrowserSourceMaps: https://nextjs.org/docs/app/api-reference/config/next-config-js/productionBrowserSourceMaps
- Anti-debugging JS (Eresus Security): https://www.eresussec.com/en/blog/javascript-obfuscation-reverse-engineering-deobfuscation
- Cracking DevTools killer (Mozilla): https://dev.to/codepo8/cracking-a-developer-tools-killer-script-2lpl
- FingerprintJS docs: https://docs.fingerprint.com/docs/introduction
- 9 device fingerprinting solutions: https://blog.castle.io/9-device-fingerprinting-solutions-for-developers
- iubenda Italy cookie rules: https://www.iubenda.com/en/help/31246-italy-new-cookie-rules
- Codice Consumo + servizi digitali: https://www.dirittodellinformatica.it/consumatori/consumatori-focus/la-fornitura-di-servizi-o-contenuti-digitali-ed-il-diritto-di-recesso-del-consumatore-alla-luce-delle-disposizioni-normative-previste-dal-codice-del-consumo.html
- EU withdrawal button June 2026: https://www.potomaclaw.com/news-EUs-New-Withdrawal-Button-Requirement-June-2026-Deadline-Approaching
- Stripe IT diritto recesso: https://stripe.com/it/resources/more/right-of-withdrawal-online-purchases-italy
- LANDR pricing: https://www.landr.com/pricing
- Splice rent-to-own: https://support.splice.com/en/articles/8652687-about-rent-to-own
- Output Arcade crack (Reddit): https://www.reddit.com/r/Piracy/comments/ltpgf1
- Beta tester NDA template (Rocket Lawyer): https://www.rocketlawyer.com/business-and-contracts/intellectual-property/confidentiality-agreements/document/non-disclosure-agreement---beta-tester
- PostHog feature flags SaaS gating: https://lewiskori.com/blog/smarter-apps-with-post-hog-feature-flags-and-analytics
