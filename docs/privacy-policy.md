# Privacy Policy — LabelPulse

> **Ultimo aggiornamento**: 27 Giugno 2026  
> **Titolare del trattamento**: Emmanuel Miro — LabelPulse  
> **Email contatto**: pulse.label.official@gmail.com  
> **Sito web**: https://labelpulse.vercel.app

---

## 1. Chi siamo

LabelPulse è un'applicazione web (PWA) sviluppata da Emmanuel Miro che permette a DJ e produttori musicali di gestire le proprie demo submission verso label discografiche elettroniche. Questa Privacy Policy descrive come raccogliamo, utilizziamo e proteggiamo i tuoi dati personali quando utilizzi LabelPulse.

## 2. Quali dati raccogliamo

### 2.1 Dati forniti dall'utente
- **Profilo utente**: nome artista, link SoundCloud, bio, foto profilo (opzionali)
- **Account Google**: email, nome e immagine del profilo Google (tramite NextAuth/OAuth)
- **Dati operativi**: label tracciate, demo salvate, pitch generati, note personali
- **Gmail integration**: accesso limitato all'invio di email (scope `https://mail.google.com/`) — non leggiamo la tua posta in arrivo

### 2.2 Dati raccolti automaticamente
- **Dati di utilizzo**: eventi di interazione (signup, onboarding, primo pitch, primo demo) tramite PostHog
- **Dati tecnici**: tipo di browser, sistema operativo, risoluzione schermo, dati di performance
- **Errori**: errori client-side e server-side raccolti tramite Bugsnag (con stack traces e contesto)
- **Cookie e localStorage**: vedi Sezione 5

### 2.3 Dati NON raccolti
- NON leggiamo le tue email in arrivo
- NON accediamo ai tuoi contatti
- NON tracciamo la tua posizione GPS
- NON raccogliamo dati di pagamento (non abbiamo ancora un sistema di billing)

## 3. Come utilizziamo i dati

| Finalità | Dati utilizzati | Base giuridica |
|----------|----------------|----------------|
| Fornire il servizio LabelPulse | Profilo, label, demo, pitch | Esecuzione contratto (art. 6(1)(b) GDPR) |
| Cloud sync tra dispositivi | Dati operativi su Supabase | Esecuzione contratto (art. 6(1)(b) GDPR) |
| Inviare pitch via Gmail | Email compose + send | Consenso (art. 6(1)(a) GDPR) |
| Analisi di utilizzo e miglioramento | Eventi anonimizzati PostHog | Interesse legittimo (art. 6(1)(f) GDPR) |
| Monitoraggio errori | Stack traces, contesto errore | Interesse legittimo (art. 6(1)(f) GDPR) |
| Comunicazioni beta | Email | Consenso (art. 6(1)(a) GDPR) |

## 4. Dove conserviamo i dati

### 4.1 Locale (tuo dispositivo)
- **localStorage**: dati dell'applicazione (Zustand persist), cache, preferenze lingua
- **IndexedDB**: (futuro) JWT di licenza per funzionalità offline
- **I dati locali sono una cache** — la fonte primaria è il cloud (Supabase)

### 4.2 Cloud (Supabase)
- **Tabella `user_data`**: dati operativi per utente (keyed by email), sincronizzati via realtime
- **Tabella `beta_access_codes`**: codici di accesso beta
- **Tabella `feedback_replies`**: risposte dell'admin ai feedback
- **Tabella `push_subscriptions`**: sottoscrizioni per notifiche push
- **Row Level Security (RLS)**: ogni utente può accedere solo ai propri dati
- **Regione**: EU (Supabase progetto in regione EU)
- **Backup**: giornalieri automatici (piano Pro)

### 4.3 Servizi terzi
| Servizio | Dati | Scopo | Regione |
|----------|------|-------|---------|
| Vercel | Codice sorgente, logs deploy | Hosting applicazione | US/EU |
| Supabase | Dati utente (vedi sopra) | Database + auth + realtime | EU |
| PostHog | Eventi anonimizzati di utilizzo | Analytics | US (configurabile EU) |
| Bugsnag | Errori + stack traces | Monitoraggio errori | US |
| Google (OAuth) | Email, nome, foto profilo | Autenticazione | US |
| Gmail API | Invio email per conto utente | Feature invio pitch | US |

## 5. Cookie e tecnologie simili

### 5.1 Cookie utilizzati

| Tipo | Nome/Pattern | Scopo | Durata | Opt-out |
|------|-------------|-------|--------|---------|
| Necessari | `labelpulse-storage` | Persistenza stato app (Zustand) | Persistente | No (necessario) |
| Necessari | `next-auth.*` | Sessione autenticazione | Sessione | No (necessario) |
| Analitici | PostHog localStorage | Eventi di utilizzo | Persistente | Sì (banner consenso) |
| Tecnici | Service Worker cache | Funzionamento offline PWA | Persistente | No (necessario) |

### 5.2 localStorage
LabelPulse utilizza principalmente `localStorage` invece di cookie per memorizzare i dati dell'applicazione. Questo è più privacy-friendly perché:
- I dati localStorage non vengono inviati automaticamente al server ad ogni richiesta HTTP
- L'utente può cancellare i dati localStorage dal browser in qualsiasi momento
- I dati localStorage sono isolati per dominio

### 5.3 Consenso
Al primo accesso, ti presentiamo un banner di consenso per i cookie analitici (PostHog). I cookie necessari non richiedono consenso. Puoi modificare le tue preferenze in qualsiasi momento.

## 6. Condivisione dei dati

### 6.1 Non vendiamo i tuoi dati
LabelPulse non vende, affitta o condivide i tuoi dati personali con terze parti per scopi di marketing.

### 6.2 Condivisione necessaria
Condividiamo dati solo con i servizi elencati nella Sezione 4.3, strettamente necessari per il funzionamento dell'applicazione.

### 6.3 Obblighi di legge
Possiamo divulgare i tuoi dati se richiesto dalla legge, da un'ordinanza del tribunale o da un'altra autorità competente.

## 7. I tuoi diritti (GDPR)

Come utente dell'UE, hai i seguenti diritti:

| Diritto | Descrizione | Come esercitarlo |
|---------|-------------|-----------------|
| **Accesso** (art. 15) | Ottenere una copia dei tuoi dati | Email a pulse.label.official@gmail.com |
| **Rettifica** (art. 16) | Correggere dati inesatti | Direttamente nell'app (profilo) |
| **Cancellazione** (art. 17) | Richiedere l'eliminazione dei dati | Email a pulse.label.official@gmail.com |
| **Limitazione** (art. 18) | Limitare il trattamento in certi casi | Email a pulse.label.official@gmail.com |
| **Portabilità** (art. 20) | Ricevere i dati in formato portabile | Funzione Export nell'app |
| **Opposizione** (art. 21) | Opporsi al trattamento per interesse legittimo | Email a pulse.label.official@gmail.com |
| **Recesso** (art. 7(3)) | Revocare il consenso in qualsiasi momento | Banner cookie o email |

Tempo di risposta: entro 30 giorni (come richiesto dal GDPR).

## 8. Sicurezza dei dati

### 8.1 Misure tecniche
- **Row Level Security (RLS)** su tutte le tabelle Supabase — ogni utente accede solo ai propri dati
- **HTTPS** su tutte le connessioni (Vercel + Supabase)
- **PII redaction** in Bugsnag — password, token, API key vengono automaticamente oscurati
- **NextAuth** per autenticazione sicura via Google OAuth
- **Hard reset** su cambio account — previene contaminazione cross-account

### 8.2 Misure organizzative
- Accesso al database limitato al solo fondatore
- API key e segreti mai esposti nel codice sorgente
- Codice sorgente su repository GitHub privato

### 8.3 Notifica data breach
In caso di violazione dei dati personali, notificheremo l'autorità di controllo (Garante Privacy Italia) entro 72 ore e gli utenti interessati senza ritardo ingiustificato, come richiesto dall'art. 33-34 GDPR.

## 9. Conservazione dei dati

| Tipo di dato | Periodo di conservazione |
|-------------|------------------------|
| Dati account | Fino alla cancellazione dell'account |
| Dati operativi (label, demo, pitch) | Fino alla cancellazione dell'account |
| Log di errore (Bugsnag) | 7 giorni (free tier) |
| Dati analytics (PostHog) | 7 anni (conservati da PostHog) |
| Feedback beta | Fino alla cancellazione dell'account |
| Codici beta | Fino all'utilizzo o scadenza |

## 10. Dati dei minori

LabelPulse non è destinato a minori di 16 anni. Non raccogliamo consapevolmente dati da minori. Se scopriamo che un minore ha fornito dati personali, li elimineremo tempestivamente.

## 11. Trasferimenti internazionali

Alcuni dei nostri fornitori di servizi (Vercel, PostHog, Bugsnag, Google) si trovano negli Stati Uniti. I trasferimenti di dati sono regolati da:
- **Standard Contractual Clauses (SCC)** tra UE e US
- **Data Processing Addendum (DPA)** con ciascun fornitore
- **EU-US Data Privacy Framework** (dove applicabile)

PostHog può essere configurato con hosting EU per evitare il trasferimento dei dati analytics verso gli US.

## 12. Modifiche a questa Privacy Policy

Potremmo aggiornare questa Privacy Policy periodicamente. Le modifiche significhe verranno notificate tramite:
- Banner nell'applicazione
- Email all'indirizzo associato al tuo account
- Aggiornamento della data "Ultimo aggiornamento" in cima a questa pagina

L'uso continuato dell'applicazione dopo le modifiche costituisce accettazione della policy aggiornata.

## 13. Contatti

Per qualsiasi domanda relativa a questa Privacy Policy o al trattamento dei tuoi dati personali:

- **Email**: pulse.label.official@gmail.com
- **Indirizzo**: disponibile su richiesta via email
- **DPO**: non ancora nominato (obbligatorio sopra 250 dipendenti o trattamento su larga scala di dati sensibili — verrà nominato prima del lancio GA)

---

Questa Privacy Policy è redatta in conformità con il Regolamento (UE) 2016/679 (GDPR) e il D.Lgs. 196/2003 (Codice della Privacy italiano).
