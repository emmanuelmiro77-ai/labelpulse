# Backup Strategy — LabelPulse

> **Ultimo aggiornamento**: 27 Giugno 2026  
> **Responsabile**: Emmanuel Miro

---

## Strategia di Backup

### Database Supabase (Primary Data Store)

| Aspetto | Dettaglio |
|---------|-----------|
| **Provider** | Supabase (Pro Plan — €25/mese) |
| **Backup automatici** | ✅ Daily Point-in-Time Recovery (PITR) |
| **Retention** | 7 giorni (Pro Plan) |
| **Regione** | EU (conforme GDPR) |
| **Restore** | Via Supabase Dashboard → Database → Backups |
| **Costo** | Incluso nel piano Pro |

### Tabelle critiche

| Tabella | Contenuto | Frequenza modifica | Criticità |
|---------|-----------|-------------------|-----------|
| `user_data` | Dati operativi per utente | Ogni sessione | 🔴 Alta |
| `beta_access_codes` | Codici accesso beta | Sporadica | 🟡 Media |
| `feedback_replies` | Risposte admin ai feedback | Sporadica | 🟢 Bassa |
| `push_subscriptions` | Sottoscrizioni notifiche | Al login | 🟢 Bassa |
| `agent_memory` | Bug registry cloud | Ad ogni fix | 🟡 Media |

### Dati locali (localStorage utente)

| Aspetto | Dettaglio |
|---------|-----------|
| **Tipo** | Zustand persist v18 su localStorage |
| **Backup automatico** | ✅ Sidecar backup ogni 60s (on mutation) |
| **Cloud sync** | ✅ Supabase realtime (per utenti autenticati) |
| **Export manuale** | ✅ Funzione Export/Import nell'app (DataBackup component) |
| **Risk** | Se utente non sincronizza col cloud → perdita dati locali |

---

## Procedure di Restore

### Restore da Supabase Dashboard

1. Accedi a [supabase.com/dashboard](https://supabase.com/dashboard)
2. Seleziona il progetto LabelPulse
3. Vai in **Database → Backups**
4. Seleziona il backup desiderato (ultimi 7 giorni disponibili)
5. Clicca **Restore** → conferma
6. Tempo stimato: 5-30 minuti (dipende dalla dimensione)

### Restore per singolo utente

Se un utente perde dati locali ma ha il cloud sync attivo:
1. L'utente fa login → `loadFromCloud()` carica i dati da Supabase
2. Se il cloud è vuoto (raro) → l'utente usa la funzione Import da backup locale
3. Se non ha backup → contatto supporto per restore dal PITR

---

## Test di Restore (obbligatorio mensile)

### Procedura di test

1. **Quando**: Prima settimana di ogni mese
2. **Come**:
   - Creare un record di test in `user_data` (es. campo `notes: "BACKUP_TEST_[data]"`)
   - Attendere 24 ore (per essere incluso nel backup daily)
   - Verificare che il record appaia in Supabase Dashboard → Backups
   - Non serve fare restore effettivo (solo verificare che il backup contenga i dati)
3. **Log**: Aggiungere entry nel worklog.md con risultato del test

### Prossimo test programmato: Prima settimana di Luglio 2026

---

## Piano di Disaster Recovery

### Scenario 1 — Perdita dati utente (singolo utente)
- **Probabilità**: Bassa (cloud sync attivo)
- **Impatto**: Medio (dati di un utente)
- **Recovery**: Login → loadFromCloud → verify data. Se mancante: PITR restore.
- **Tempo**: < 1 ora

### Scenario 2 — Corruzione tabella Supabase
- **Probabilità**: Molto bassa
- **Impatto**: Alto (tutti gli utenti)
- **Recovery**: Supabase PITR restore della tabella specifica
- **Tempo**: 1-4 ore

### Scenario 3 — Outage Supabase completo
- **Probabilità**: Molto bassa (SLA 99.9%)
- **Impatto**: Alto (app non funzionante)
- **Recovery**: Attendere risoluzione Supabase. Utenti con dati locali possono continuare a usare l'app.
- **Tempo**: Dipende da Supabase (solitamente < 2 ore)

### Scenario 4 — Perdita dati locale + cloud
- **Probabilità**: Molto bassa (richiede fallimento sia locale che cloud)
- **Impatto**: Critico per l'utente coinvolto
- **Recovery**: PITR da Supabase + import backup locale se disponibile
- **Tempo**: < 1 ora

---

## Note per FASE 4 (GA Prep)

- [ ] Valutare upgrade retention backup a 30 giorni (Supabase add-on)
- [ ] Aggiungere backup automatizzato del codice sorgente (GitHub already covered)
- [ ] Implementare export automatico settimanale dei dati critici in formato JSON (S3/R2)
- [ ] Aggiungere monitoring del backup status (alert se backup fallisce)
- [ ] Considerare replica geografica per disaster recovery cross-region
