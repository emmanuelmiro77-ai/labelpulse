# LABELPULSE SYSTEM ARCHITECTURE SPECIFICATION v1.0

Documento vincolante per sviluppo, modifica e manutenzione del progetto.

---

LABELPULSE SYSTEM ARCHITECTURE SPECIFICATION v1.0
Documento vincolante per sviluppo, modifica e manutenzione del progetto.
REGOLA ZERO — SINGLE SOURCE OF TRUTH
Ogni dato persistente deve avere un solo proprietario, una sola tabella autorevole,
un solo flusso di lettura e un solo flusso di scrittura.
Non sono ammesse copie parallele, cache persistenti o fonti duplicate di verità.
1. IDENTITÀ DEL PRODOTTO
LabelPulse è un CRM verticale per producer musicali.
Obiettivo: permettere ai producer di trovare rapidamente la label più adatta
alla propria musica e gestire il rapporto con essa.
2. PRINCIPIO CLOUD FIRST
L'applicazione funziona esclusivamente online.
Supabase è l'unica fonte di verità.
Flusso obbligatorio:
Browser -> Supabase -> Database PostgreSQL
Vietato:
Browser -> Storage locale -> Supabase
3. STORAGE LOCALE
Vietati:
- localStorage persistente
- IndexedDB persistente
- file JSON locali
- cache persistenti
- Zustand persist o sistemi equivalenti
Consentito solo stato temporaneo React per rendering durante la sessione.
4. SALVATAGGIO DATI
Ogni modifica utente deve essere scritta su Supabase.
Flusso:
Utente modifica
-> UI

---

-> Service/Hook
-> Supabase
-> Conferma
-> Aggiornamento interfaccia
Nessun dato importante può rimanere solamente nel browser.
5. MULTI DEVICE
Ogni dispositivo deve mostrare sempre lo stesso stato.
Una modifica effettuata su un dispositivo deve essere disponibile dopo login
da qualsiasi altro dispositivo.
6. MULTI TENANT
Ogni utente vede e modifica solamente i propri dati.
La sicurezza deve essere implementata tramite Supabase Authentication e Row Level Security.
7. DATI GLOBALI E DATI PERSONALI
Dati globali:
- classifiche Beatport
- dati scraping
- label ufficiali
- artisti
- statistiche
Gestiti solo dall'amministratore.
Dati personali:
- bio
- link
- social
- demo
- pitch
- email
- note
- contatti label personali
- preferiti
- promemoria
Ogni utente possiede esclusivamente i propri dati.
8. MODIFICHE ALLE LABEL
Le informazioni ufficiali delle label sono globali.

---

Le informazioni aggiunte dagli utenti (contatti, note, link personali)
devono essere private per ogni utente.
9. CLASSIFICHE BEATPORT
Solo Admin può aggiornare le classifiche.
Gli utenti possono solo leggere i dati aggiornati.
Ogni aggiornamento deve registrare data, fonte e amministratore.
10. ARCHITETTURA SOFTWARE
Architettura obbligatoria:
React UI
|
Custom Hooks / Business Services
|
Supabase Client
|
PostgreSQL + RLS
I componenti UI non devono parlare direttamente con Supabase.
11. DATA OWNERSHIP
Ogni nuovo tipo di dato deve essere definito prima di creare una tabella.
Ogni tabella personale deve avere user_id.
12. AUDIT LOG
Le modifiche importanti devono poter essere tracciate:
utente, azione, tabella, record, timestamp.
13. DATABASE MIGRATIONS
Ogni modifica allo schema deve essere documentata tramite migration.
14. REGOLE PER AGENTI AI
Prima di modificare:
- analizzare problema
- trovare causa reale
- indicare file coinvolti
- proporre piano
- applicare modifica

---

- testare
15. DIVIETI ASSOLUTI
Mai:
- introdurre storage locale persistente
- bypassare RLS
- creare copie dei dati
- creare workaround permanenti
- modificare file non coinvolti senza motivazione
16. CRITERI DI COMPLETAMENTO
Un task è concluso solo se:
- il bug è risolto
- non ci sono regressioni
- il dato segue la ownership corretta
- Supabase resta unica fonte di verità
- il test cross-device funziona
FINE SPECIFICA

---

