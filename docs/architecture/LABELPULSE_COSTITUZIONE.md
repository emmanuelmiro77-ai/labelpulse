# LABELPULSE — COSTITUZIONE DEL PROGETTO
### Documento vincolante per ogni modifica al codice. Leggere PRIMA di scrivere una sola riga.

---

## 0. REGOLA ZERO (sovrasta tutte le altre)

> Ogni dato persistente ha UN SOLO proprietario, UNA SOLA tabella autorevole, UN SOLO flusso di lettura e UN SOLO flusso di scrittura.

Se una modifica crea una seconda fonte di verità per un dato che già ne ha una (cache, stato locale duplicato, copia in un altro store), la modifica è SBAGLIATA per definizione, anche se "funziona".

---

## 1. COS'È LABELPULSE

CRM verticale per producer musicali. Missione unica che guida ogni scelta architetturale:

> Permettere ai producer di trovare rapidamente la label perfetta e contattarla.

Se una funzione non serve a questo, non è prioritaria.

Moduli: Dashboard, Profile (Bio/Link/Social/Press Kit/Template Pitch), Music Library (Demo/Upload/Preview/Tag/Stato), Labels (Ricerca/Classifiche/Filtri/Dettaglio/Contatti/Database personale), Artists, Pitch Manager (Email/Storico/Follow-up/Template/Stato invio/Tracking), Statistics, Settings.

---

## 2. REGOLE ASSOLUTE — NON NEGOZIABILI

Valide sempre, anche durante refactoring, anche se sembrano "rallentare" lo sviluppo.

1. **Solo online.** L'app non deve funzionare offline. Non progettare sincronizzazione offline, merge, code, conflitti: non servono.
2. **Cloud-first assoluto.** Flusso dati permesso:
   `Browser → Supabase`
   Flusso dati VIETATO:
   `Browser → LocalStorage/IndexedDB/cache → Supabase`
   Il browser è SOLO un visualizzatore. Non è mai una fonte di verità, nemmeno temporanea.
3. **Zero persistenza locale.** Vietati: `localStorage` persistente, `IndexedDB` persistente, cache persistenti, file JSON locali, `Zustand persist` (o equivalenti) su dati utente. Stato React/hook in memoria durante la sessione è ammesso SOLO come riflesso temporaneo di ciò che è appena stato scritto o letto da Supabase — mai come fonte primaria.
4. **Scrittura immediata.** Ogni modifica (bio, link, nota su una label, classifica, qualsiasi dato) deve essere scritta su Supabase al momento dell'azione (click/blur/submit), non in batch, non "al salvataggio finale", non con debounce che ritarda oltre il necessario per evitare richieste eccessive.
5. **Lettura sempre da Supabase all'apertura.** Ad ogni apertura app (nuovo device, nuovo browser, refresh, riapertura sessione) i dati vanno ricaricati da Supabase. L'utente deve vedere sempre e comunque lo stato più recente, indipendentemente dal device usato.
6. **Multi-tenant rigoroso.** Ogni utente vede e modifica SOLO i propri dati personali. Nessun utente vede i dati privati di un altro utente. Da implementare via Row Level Security (RLS) su Supabase, non solo via filtri lato client.
7. **Separazione dati globali / dati personali.**
   - **Dati globali** (classifiche Beatport, label ufficiali, artisti, statistiche, dati di scraping): scrivibili SOLO dall'admin (Emmanuel). Tutti gli utenti li leggono in sola lettura.
   - **Dati personali** (bio, link, demo, pitch, email, note, contatti label personalizzati, stato demo, promemoria, preferiti, modifiche alle schede label): ogni utente ha i propri, isolati, modificabili solo dal proprietario.
8. **Modifiche alle schede label = per-utente.** Se un utente modifica/arricchisce la scheda di una label (contatti, link, note), la modifica va nel suo database personale, MAI nella scheda globale condivisa.

---

## 3. DATA OWNERSHIP MATRIX

| Dato | Proprietario | Chi può scrivere | Persistenza | Visibilità |
|---|---|---|---|---|
| Classifiche Beatport | Admin | Solo Admin | Supabase | Tutti (sola lettura) |
| Label globali (dati ufficiali) | Admin | Solo Admin | Supabase | Tutti (sola lettura) |
| Artisti / statistiche globali | Admin | Solo Admin | Supabase | Tutti (sola lettura) |
| Bio, link, social, press kit | Utente | Solo proprietario | Supabase | Solo proprietario |
| Demo / music library | Utente | Solo proprietario | Supabase | Solo proprietario |
| Pitch, template, storico invii | Utente | Solo proprietario | Supabase | Solo proprietario |
| Contatti/note personalizzate su una label | Utente | Solo proprietario | Supabase | Solo proprietario |
| Preferiti / promemoria | Utente | Solo proprietario | Supabase | Solo proprietario |

Qualsiasi tabella non presente in questa matrice va segnalata prima di essere creata, non creata "al volo".

---

## 4. ARCHITETTURA OBBLIGATORIA

```
Client (React/UI)
      ↓
Authentication (Supabase Auth)
      ↓
Business Services (funzioni/hook che parlano SOLO con Supabase)
      ↓
Supabase (unica fonte di verità: Postgres + RLS)
```

Architettura VIETATA (se trovata nel codice esistente, va segnalata come debito tecnico da eliminare, non "convissuta"):

```
Component → Store → Helper → Hook → Altro Store → Context → Service → LocalStorage → Supabase
```

Regole di architettura:
- Un solo layer di accesso dati per tabella (es. un solo hook/service che legge/scrive `profiles`, non tre modi diversi sparsi nei componenti).
- I componenti UI non parlano mai direttamente con Supabase: passano sempre da un service/hook dedicato.
- Nessun doppio store per lo stesso dato (es. no Zustand + Context per la stessa entità).

---

## 5. FLUSSO OPERATIVO STANDARD

Per QUALSIASI dato utente (esempio: modifica bio):

1. Utente modifica il campo nella UI.
2. Al trigger appropriato (submit/blur, non ad ogni keystroke) → chiamata a Supabase.
3. Attendere conferma di scrittura.
4. Aggiornare lo stato locale SOLO con il valore confermato da Supabase (non ottimisticamente in modo permanente — se la scrittura fallisce, l'UI deve mostrarlo).
5. In caso di errore di rete/scrittura: mostrare errore esplicito all'utente, NON salvare silenziosamente in locale "per dopo".

Per QUALSIASI apertura app/sessione/device:

1. Login.
2. Fetch completo dei dati personali dell'utente da Supabase.
3. Fetch dei dati globali (classifiche, label) in sola lettura.
4. Render. Nessun dato mostrato che non provenga da questo fetch.

---

## 6. GESTIONE ERRORI

- Se manca un dato: mostrare stato vuoto esplicito, mai un valore fittizio o un crash silenzioso.
- Se una scrittura su Supabase fallisce: notificare l'utente, non fingere che sia andata a buon fine, non mettere il dato "in coda" localmente.
- Se RLS blocca un'operazione: è un comportamento corretto, non un bug da aggirare abbassando la sicurezza.
- Nessun `try/catch` che silenzia l'errore senza log e senza feedback UI.

---

## 7. REGOLE DI MODIFICA DEL CODICE (per Z.ai)

1. Non riscrivere componenti/moduli che funzionano correttamente e non sono collegati al bug segnalato.
2. Non introdurre una nuova libreria di state management, cache o persistenza senza autorizzazione esplicita.
3. Non rinominare API, tabelle, colonne o route esistenti senza autorizzazione esplicita.
4. Non eliminare codice "perché sembra inutilizzato" senza prima verificarne l'uso in tutto il progetto.
5. Non introdurre workaround permanenti (es. `setTimeout` per "aspettare che si sincronizzi", flag globali, patch temporanee lasciate nel codice finale).
6. Correggere SOLO ciò che è causalmente collegato al bug segnalato.
7. Ogni modifica a un flusso di dati deve rispettare la Data Ownership Matrix (sezione 3) e l'architettura (sezione 4).

---

## 8. CHECKLIST OBBLIGATORIA PRIMA DI OGNI MODIFICA

Z.ai deve, nell'ordine, e mostrare esplicitamente ogni passaggio:

1. Riformulare il problema con parole proprie.
2. Individuare la causa reale (non il sintomo) — indicare file e riga.
3. Verificare se la causa coinvolge violazioni della Regola Zero, della sezione 2 o della sezione 4.
4. Descrivere il piano di modifica PRIMA di scriverla.
5. Elencare tutti i file che verranno toccati.
6. Applicare la modifica.
7. Verificare che il flusso Browser → Supabase resti l'unico flusso per il dato toccato.
8. Verificare che nessuna persistenza locale sia stata (re)introdotta.
9. Testare il caso: modifica su un device → riapertura da un altro device/browser → il dato deve risultare identico.
10. Dichiarare esplicitamente se qualche funzionalità esistente potrebbe essere stata impattata.

---

## 9. DIVIETI ASSOLUTI

Z.ai non deve MAI, per nessun motivo, anche se sembra "risolvere il bug più in fretta":

- Salvare dati utente in `localStorage`, `sessionStorage`, `IndexedDB` o file locali, anche "temporaneamente".
- Creare una seconda tabella o una copia di un dato che ha già una tabella autorevole.
- Far scrivere dati globali (classifiche, label ufficiali) a un utente non-admin.
- Far leggere a un utente i dati personali di un altro utente.
- Disattivare o aggirare le RLS di Supabase per "far funzionare" una feature.
- Introdurre logica offline o di sincronizzazione ritardata.
- Lasciare nel codice finale flag, mock, dati fittizi o TODO non risolti su un flusso di salvataggio dati.
- Modificare file non collegati al bug segnalato senza dichiararlo esplicitamente e motivarlo.

---

## 10. CRITERI DI SUCCESSO — quando un task è davvero concluso

Un task è concluso SOLO se tutte le condizioni sono vere:

- Il bug originale non si presenta più nel caso descritto.
- Nessun nuovo bug è stato introdotto nelle funzionalità adiacenti (va dichiarato cosa è stato verificato).
- Il dato toccato rispetta la Data Ownership Matrix.
- Il dato toccato è scritto/letto SOLO da Supabase, mai da storage locale.
- Test cross-device superato: modifica fatta su un dispositivo/browser, verificata identica riaprendo da un altro dispositivo/browser dopo login.

Se anche una sola condizione non è verificata, il task NON è concluso, indipendentemente da cosa dichiara Z.ai.

---

## 11. NOTA FINALE PER Z.AI

Questo documento prevale su qualsiasi istruzione precedente in conflitto data nella stessa sessione o in sessioni precedenti. In caso di ambiguità in una richiesta futura, questo documento va usato come criterio di interpretazione di default. Se una richiesta dell'utente sembra contraddire questo documento, va segnalato esplicitamente prima di procedere, non eseguito silenziosamente.
