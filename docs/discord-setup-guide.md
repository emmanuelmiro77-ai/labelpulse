# 🎧 Discord Setup Guide — LabelPulse Beta

> **Task BETA_ROADMAP Punto 0.4** — Setup Discord server privato per beta tester
> **Tempo stimato**: 30-45 min (segui questa guida passo-passo)
> **Costo**: €0 (tutto free)

---

## Passo 1 — Creare il server Discord

1. Apri Discord (desktop o browser)
2. Clicca **+** (Aggiungi server) in basso a sinistra
3. Scegli **"Crea il mio server"** → **"Per un club o una community"**
4. Nome server: **LabelPulse Beta**
5. Icona: usa il logo LabelPulse (se disponibile) o un'icona music/tech
6. Clicca **Crea**

---

## Passo 2 — Creare la struttura dei canali

Crea le seguenti categorie e canali nell'ordine indicato:

### 📋 Categoria: WELCOME
| Canale | Tipo | Descrizione |
|--------|------|-------------|
| `#benvenuto` | Testo | "Leggi le regole e presentati qui. Un mod ti assegnerà il ruolo Beta Tester." |
| `#regole` | Testo | "Regole della community LabelPulse Beta. Leggi prima di partecipare." |

### 📢 Categoria: ANNUNCI
| Canale | Tipo | Descrizione |
|--------|------|-------------|
| `#beta-announcements` | Testo | "Aggiornamenti ufficiali sulla beta. Solo i founder possono scrivere qui." |
| `#changelog` | Testo | "Ogni deploy e fix viene loggato qui automaticamente (ops: da collegare dopo)." |

### 💬 Categoria: COMMUNITY
| Canale | Tipo | Descrizione |
|--------|------|-------------|
| `#general` | Testo | "Discussioni generali su LabelPulse, demo, label, e musica elettronica." |
| `#presentazioni` | Testo | "Raccontaci chi sei, che genere produci, e quali label segui." |

### 🐛 Categoria: FEEDBACK
| Canale | Tipo | Descrizione |
|--------|------|-------------|
| `#bug-reports` | Testo | "Segnala bug qui. Includi: cosa facevi, cosa aspettavi, cosa è successo." |
| `#feature-requests` | Testo | "Suggerisci nuove feature. Vota con le reazioni quelle degli altri." |

### 🔧 Categoria: SUPPORTO TECNICO
| Canale | Tipo | Descrizione |
|--------|------|-------------|
| `#aiuto-tecnico` | Testo | "Problemi con login, sync, Gmail, PWA? Chiedi qui." |
| `#screenshot-video` | Testo | "Condividi screenshot o screen recording dei bug." |

### 🔒 Categoria: FOUNDER (privato)
| Canale | Tipo | Descrizione | Visibilità |
|--------|------|-------------|------------|
| `#founders-only` | Testo | "Discussione interna tra founder" | Solo ruolo Founder |
| `#mod-log` | Testo | "Log azioni moderazione" | Solo ruolo Founder |
| `#bot-config` | Testo | "Configurazione e test del bot" | Solo ruolo Founder |

---

## Passo 3 — Creare i ruoli

Vai su **Impostazioni Server → Ruoli** e crea nell'ordine (il primo in cima è il più alto):

| Ruolo | Colore | Permessi | Assegnazione |
|-------|--------|----------|--------------|
| **🟡 Founder** | Oro (#FFD700) | Tutti (Admin) | Solo tu |
| **🟢 Beta Tester** | Verde (#00D084) | Send Messages, Read Channels, Add Reactions, Attach Files, Use Slash Commands | Auto assegnato dal bot dopo verifica, o manuale |
| **🔵 Contributor** | Blu (#3B82F6) | Stessi di Beta Tester + Mention @everyone | Manuale (per tester molto attivi) |
| **⚫ Newcomer** | Grigio (#6B7280) | Read #benvenuto + #regole, Send Messages solo in #benvenuto | Default per nuovi membri |

### Permessi dettagliati per categoria

**WELCOME**: Newcomer può leggere/scrivere. Beta Tester+ può leggere.
**ANNUNCI**: Solo Founder può scrivere. Tutti possono leggere.
**COMMUNITY**: Beta Tester+ può leggere/scrivere.
**FEEDBACK**: Beta Tester+ può leggere/scrivere.
**SUPPORTO TECNICO**: Beta Tester+ può leggere/scrivere.
**FOUNDER**: Solo Founder può vedere.

---

## Passo 4 — Creare il Bot Discord (LabelPulse Bot)

### 4.1 Creare l'applicazione su Discord Developer Portal

1. Vai su [discord.com/developers/applications](https://discord.com/developers/applications)
2. Clicca **"New Application"**
3. Nome: **LabelPulse Bot**
4. Vai alla tab **Bot**:
   - Clicca **"Add Bot"** → conferma
   - Abilita **"Message Content Intent"** (toggle sotto "Privileged Gateway Intents")
   - Abilita **"Server Members Intent"** (necessario per l'evento memberJoin)
   - Copia il **Token** → salvalo in un posto sicuro (serve dopo)
5. Vai alla tab **OAuth2 → URL Generator**:
   - Scopes: `bot`
   - Bot Permissions: `Send Messages`, `Read Messages/View Channels`, `Manage Roles`, `Read Message History`
   - Copia l'URL generato
6. Apri l'URL nel browser → seleziona il server **LabelPulse Beta** → autorizza

### 4.2 Configurare il Bot

Il codice del bot è in `scripts/discord-bot/`. Vedi il README lì per le istruzioni complete.

In sintesi:
```bash
cd /home/z/my-project/scripts/discord-bot
cp .env.example .env
# Modifica .env con il token del bot e gli ID del server
npm install
node index.js
```

### 4.3 Cosa fa il Bot automaticamente

- ✅ **Welcome DM**: quando un nuovo membro entra, riceve un DM con:
  - Benvenuto in LabelPulse Beta
  - Link al NDA (da aggiungere dopo Punto 0.5)
  - Link allo screening form (da aggiungere dopo Punto 0.5)
  - Istruzioni per farsi assegnare il ruolo Beta Tester
- ✅ **Auto-reaction**: aggiunge reazione ✅ ai messaggi in #bug-reports e 💡 in #feature-requests
- ✅ **Comando /status**: mostra lo stato della beta (numero tester, versione app, prossimi task)

---

## Passo 5 — Generare l'Invite Link

1. Clicca sull'icona del server → **Invita persone**
2. Imposta:
   - Scadenza: **7 giorni**
   - Max usi: **25**
   - Scopo: "Beta Tester Recruitment — prima ondata"
3. Salva l'invite link (serve per il Punto 0.5 screening form)

### Invite link per diverse fasi

| Fase | Scadenza | Max usi | Note |
|------|----------|---------|------|
| Founder setup | Mai | Illimitati | Solo per te |
| Round 1 (amici vicini) | 7 giorni | 10 | Per i primi 5-10 tester fidati |
| Round 2 (Reddit/Discord) | 7 giorni | 25 | Per recruitment esterno |
| Round 3 (BetaList) | 14 giorni | 50 | Per featured launch |

---

## Passo 6 — Messaggio di benvenuto in #regole

Copia questo testo nel canale `#regole`:

```
🎧 **LabelPulse Beta — Regole della Community**

Benvenuto nella beta di LabelPulse! Siamo felici di averti qui.
Queste regole valgono per tutti i membri del server.

**1. 🤝 Rispetto reciproco**
Siamo tutti qui per migliorare LabelPulse. Critica costruttiva benvenuta, insulti no.

**2. 🔒 NDA e riservatezza**
Partecipando alla beta accetti di non condividere screenshot, feature o dettagli
del prodotto fuori da questo server senza autorizzazione.

**3. 🐛 Bug reports in #bug-reports**
Usa il canale dedicato. Includi sempre:
- Cosa stavi facendo
- Cosa ti aspettavi
- Cosa è successo invece
- Screenshot/video se possibile

**4. 💡 Feature requests in #feature-requests**
Una feature per messaggio. Usa le reazioni per votare quelle degli altri.

**5. 🚫 No spam, no self-promo**
Niente link ai tuoi brani/canali se non richiesto. Siamo qui per testare il prodotto.

**6. 📱 Problemi tecnici in #aiuto-tecnico**
Login non funziona? Sync rotto? PWA non parte? Chiedi lì.

**7. 🎵 Si parla di musica**
Ma il focus è LabelPulse. Per discorsi puramente musicali ci sono altri server.

Il tuo feedback è prezioso e ci aiuta a costruire il prodotto che serve davvero ai producer.
Grazie per far parte della beta! 🚀
```

---

## Passo 7 — Messaggio di benvenuto in #benvenuto

```
👋 Benvenuto in **LabelPulse Beta**!

Per ottenere l'accesso completo ai canali:

1️⃣ Leggi le **#regole**
2️⃣ Compila il form di screening (link arrivato via DM dal bot)
3️⃣ Presentati in **#presentazioni** dicendo:
   - Il tuo nome artistico
   - Il genere che produci
   - Quante demo invii al mese

Un founder ti assegnerà il ruolo **Beta Tester** e sbloccherà tutti i canali.

Buon testing! 🎧
```

---

## Checklist finale

- [ ] Server Discord creato con nome "LabelPulse Beta"
- [ ] 6 categorie con tutti i canali configurati
- [ ] 4 ruoli creati con permessi corretti
- [ ] Bot LabelPulse Bot invitato al server
- [ ] Bot online e risponde (verificare con /status)
- [ ] Welcome DM funzionante (testare con un account secondario)
- [ ] Messaggi #regole e #benvenuto postati
- [ ] Primo invite link generato (7 giorni, 25 usi)
- [ ] Permessi categoria FOUNDER ristretti al ruolo Founder
- [ ] Newcomer vede solo WELCOME fino a quando non riceve Beta Tester

**Criterio GO**: Server online, primo invite link generato, bot risponde. ✅

---

## Note per task futuri

- **Punto 0.5 (NDA + Screening)**: aggiornare il DM del bot con i link reali al NDA e al form Tally
- **Punto 1.1 (Beta code flow)**: aggiungere `discord_user_id` alla tabella `beta_access_codes`
- **Punto 1.4 (Feedback flow)**: collegare webhook da app → canale #bug-reports
- **Punto 2 (Closed Beta)**: usare invite link Round 2 per recruitment esterno
