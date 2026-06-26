# 📋 Screening Questionnaire — LabelPulse Beta Testing Program

> **Task BETA_ROADMAP Punto 0.5** — Screening form per selezionare beta tester
> **Piattaforma**: Tally.so (free, fino a 999 risposte/mese)
> **Tempo stimato setup**: 30 min

---

## Setup Tally.so

1. Vai su [tally.so](https://tally.so) e crea un account gratuito
2. Clicca **"New form"** → **"Start from scratch"**
3. Nome form: **"LabelPulse Beta Tester — Screening Questionnaire"**
4. Imposta **Cover** con:
   - Titolo: "🎧 Diventa Beta Tester di LabelPulse"
   - Sottotitolo: "Aiutaci a costruire il miglior tool per demo submission a label elettroniche. Accesso gratuito per 6 mesi + offerta Lifetime Early Adopter."
   - Immagine: logo LabelPulse o sfondo music/tech

---

## Le 8 Domande (in ordine)

### Domanda 1 — Nome e Email
**Tipo**: Due campi in una riga
- **Nome** (Short text, required)
  - Label: "Il tuo nome (o nome artistico)"
  - Placeholder: "es. DJ Marco"
- **Email** (Email, required)
  - Label: "La tua email"
  - Placeholder: "marco@email.com"
  - Validation: Email format

### Domanda 2 — Genere musicale
**Tipo**: Dropdown + Short text
- **Genere principale** (Dropdown, required)
  - Label: "Qual è il tuo genere principale?"
  - Opzioni:
    - Techno
    - House
    - Tech House
    - Deep House
    - Progressive House
    - Melodic Techno
    - Minimal
    - Electro
    - Drum & Bass
    - Trance
    - Dubstep / Bass
    - Hard Techno
    - Ambient / Downtempo
    - Altro (specificare)
- **Sottogenere** (Short text, optional)
  - Label: "Sottogenere o stile specifico (opzionale)"
  - Placeholder: "es. Peak Time Techno, Organic House"

### Domanda 3 — Volume demo mensile
**Tipo**: Multiple choice (required)
- Label: "Quanti demo invii al mese a label?"
- Opzioni:
  - Nessuno ancora (ma voglio iniziare)
  - 1-3 demo/mese
  - 4-10 demo/mese
  - 11-20 demo/mese
  - Più di 20 demo/mese

### Domanda 4 — Label contattate
**Tipo**: Long text (required)
- Label: "Quali label hai contattato negli ultimi 6 mesi?"
- Placeholder: "Elenca i nomi delle label, uno per riga. Es:\n- Afterlife\n- Drumcode\n- Intacts Records"
- Help text: "Ci aiuta a capire se il nostro database label copre le tue esigenze."

### Domanda 5 — Dispositivo principale
**Tipo**: Multiple choice (required)
- Label: "Qual è il tuo dispositivo principale per gestire le demo?"
- Opzioni:
  - iPhone / iOS
  - Android
  - Desktop (Mac/Windows)
  - Uso sia mobile che desktop

### Domanda 6 — Disponibilità call onboarding
**Tipo**: Multiple choice (required)
- Label: "Sei disponibile a una call di onboarding di 30 minuti?"
- Opzioni:
  - Sì, volentieri!
  - Sì, ma preferisco orari serali/weekend
  - No, preferisco procedere autonomamente

### Domanda 7 — Attività Discord
**Tipo**: Multiple choice (required)
- Label: "Sei attivo su Discord?"
- Opzioni:
  - Sì, lo uso tutti i giorni
  - Sì, ma lo consulto poco
  - No, ma sono disposto a iscrivermi
  - No, e preferisco altri canali (email/WhatsApp)

### Domanda 8 — Accettazione NDA e condizioni beta
**Tipo**: Checkbox (required)
- Label: "Accetti le seguenti condizioni del programma beta?"
- Opzioni (tutte richieste):
  - [ ] Accetto l'Accordo di Riservatezza (NDA) — [Leggi il NDA completo](https://github.com/emmanuelmiro77-ai/labelpulse/blob/main/docs/NDA-beta-tester.md)
  - [ ] Mi impegno a fornire feedback costruttivo entro 30 giorni per sbloccare l'offerta Lifetime Early Adopter a €149
  - [ ] Non condividerò screenshot o dettagli del prodotto fuori dal server Discord senza autorizzazione
  - [ ] Comprendo che questo è un software in beta e potrebbe contenere bug

---

## Pagina di conferma (Thank You)

Dopo l'invio del form, mostra questa pagina:

```
🎉 Grazie per la tua candidatura!

Ti risponderemo entro 48 ore all'email che hai indicato.

Se sei stato selezionato, riceverai:
1. Un invite al server Discord di LabelPulse Beta
2. Un codice beta per accedere all'app
3. Le istruzioni per l'onboarding

Nel frattempo:
🎧 Visita labelpulse.vercel.app per scoprire di più
📧 Controlla anche la cartella spam!

Se hai domande: hello@labelpulse.app
```

**Link Discord invite** (da inserire come bottone CTA nella thank you page):
- URL: [il tuo invite link Discord generato nel Punto 0.4]
- Testo bottone: "🎮 Entra nel Discord"

---

## Impostazioni Tally raccomandate

| Impostazione | Valore |
|-------------|--------|
| **Risposte** | Illimitate (free tier: 999/mese) |
| **Notifiche** | Email a ogni nuova risposta |
| **Privacy** | Non pubblica, accessibile solo via link |
| **Colleziona** | Email + IP (per anti-spam) |
| **Scadenza** | Nessuna (chiudi manualmente quando hai abbastanza tester) |
| **Progress bar** | Mostra (riduce abandonment) |
| **Branding** | Tally branding visibile (free tier) — accettabile per beta |

---

## Flusso post-submission

1. Tester compila il form → Tally salva la risposta
2. Tu ricevi notifica email
3. Valuti il candidato (criteri sotto)
4. Se accettato:
   - Invii DM su Discord con codice beta
   - Usi `/assign-beta @user` nel canale #benvenuto
   - Aggiungi il codice in `/admin/beta-testers`
5. Se rifiutato:
   - Email cortese: "Grazie per l'interesse, al momento abbiamo raggiunto il numero di tester previsti. Ti contatteremo per la prossima ondata."

### Criteri di selezione (priorità)

| Criterio | Peso | Note |
|----------|------|------|
| Invia già demo a label | 🔴 Alto | È l'utente target primario |
| Genere nel database LabelPulse | 🟡 Medio | 35+ generi coperti |
| Usa mobile (iOS/Android) | 🟡 Medio | Serve test PWA mobile |
| Disponibile a call | 🟢 Basso | Utile ma non necessario |
| Attivo su Discord | 🟢 Basso | Facilita la comunicazione |

### Target per prima ondata

- **5-10 tester** per la FASE 2 (Closed Beta)
- **Mix**: almeno 2 mobile-first, almeno 3 che inviano demo regolarmente, almeno 1 genere non-techno
- **Geografia**: preferibilmente EU (per GDPR testing) ma non esclusivo

---

## Link da usare

Dopo aver pubblicato il form su Tally:

1. Copia l'URL del form (es. `https://tally.so/r/abc123`)
2. Aggiorna il bot Discord:
   - Modifica `SCREENING_FORM_URL` in `scripts/discord-bot/.env`
3. Aggiorna i link nei canali Discord:
   - #benvenuto: aggiungi link al form
   - #regole: aggiungi link al NDA
4. Aggiorna la README del repo se necessario
