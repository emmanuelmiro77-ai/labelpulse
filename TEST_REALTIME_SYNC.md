# 🧪 TEST PROCEDURE: Realtime Rankings Sync Fix

## Pre-Test Checklist
- [ ] Hai 2 dispositivi (o browser windows) con la stessa account
- [ ] Admin credentials pronte (per aggiornare classifiche)
- [ ] Browser console aperta (F12) per vedere i log
- [ ] Network tab monitor (per vedere Supabase realtime events)

---

## TEST 1: BASIC REALTIME SYNC ✅

### Setup
```
Device A: macBook (admin)
Device B: iPhone (same admin account)
```

### Steps
1. **Apri su Device A (PC/macBook):**
   - Vai a https://labelpulse.dev
   - Login come admin
   - Attendi che l'app carica

2. **Apri su Device B (iPhone):**
   - Vai a https://labelpulse.dev
   - Login come admin (SAME account)
   - Attendi che l'app carica
   - Nota il timestamp in alto: `rankingsUpdatedAt: 2026-06-30T14:20:00Z` (esempio)

3. **Su Device A - Aggiorna classifiche:**
   - Vai alla Admin Dashboard
   - Clicca "Scrape Beatport" o "Update Rankings"
   - Attendi il completamento
   - Nota il NEW timestamp: `rankingsUpdatedAt: 2026-06-30T15:30:00Z` (sarà più recente)

4. **Guarda Device B (iPhone):**
   - Dovresti veder il timestamp CAMBIARE entro 2-3 secondi ✅
   - Se rimane il vecchio timestamp dopo 5 secondi = BUG ❌

5. **Verifica classifiche identiche:**
   ```
   Device A: Rekids — rank#12, 5400pts
   Device B: Rekids — rank#12, 5400pts ✅
   
   Se Device B rimane rank#15, 4200pts = BUG ❌
   ```

### Expected Console Logs
On Device B (iPhone), dovresti vedere:
```
[LabelPulse Cloud] Realtime GLOBAL update (admin pushed new rankings), refreshing...
[LabelPulse Cloud] Global labels applied: 1500 total
[LabelPulse Cloud] Global data applied to store: labels=1500, snapshots=15, updatedAt=2026-06-30T15:30:00Z
```

### Pass/Fail
- ✅ **PASS**: Timestamps match, classifiche identiche, log dice "Global data applied"
- ❌ **FAIL**: Timestamps diversi, classifiche vecchie, log dice "loadStateFromCloud" (old code)

---

## TEST 2: PERSONAL DATA PRESERVATION 🔐

### Scenario
Quando admin aggiorna classifiche, i TUOI dati personali NON vengono persi.

### Setup
1. Su Device B (iPhone), aggiungi dati personali ad una label:
   - Clicca su "Rekids"
   - Clicca "Edit"
   - Aggiungi:
     - Email: `booking@rekids.com`
     - Tier: "top"
     - Notes: "Always responsive"
   - Salva
   - Verifica che appare su screen

2. Nota il timestamp di Rekids (prima dell'update)

### Execute
1. Su Device A (PC): Aggiorna classifiche (scrape Beatport)
2. Attendi realtime sync su Device B
3. Device B: Rigarda Rekids

### Expected Result
```
✅ Email rimane: booking@rekids.com
✅ Tier rimane: "top"
✅ Notes rimane: "Always responsive"
✅ Ma classifiche aggiornate (nuovi rank/punti se admin ha fatto scrape nuovo)
```

### Pass/Fail
- ✅ **PASS**: Tutti i tuoi dati personali rimangono + classifiche updated
- ❌ **FAIL**: Email/notes cancellate = union by ID non funziona

---

## TEST 3: EDGE CASE - OFFLINE SYNC 🌐

### Scenario
Device B perde internet, poi ritorna online. Dovrebbe ricevere l'update.

### Setup
1. Apri su Device B
2. Nota timestamp attuale

### Steps
1. Device B: Metti in modalità Aereo (perde internet)
2. Device A: Aggiorna classifiche (scrape Beatport)
3. Device A: Verifica che riceve update ✅
4. Device B: Ancora offline, timestamp rimane vecchio
5. Device B: TOGLI modalità Aereo (ritorna online)
6. Attendi 5-10 secondi

### Expected
- Realtime subscription si riconnette
- Riceve l'update dalla coda
- Timestamp si aggiorna
- Classifiche si sincronizzano

### Pass/Fail
- ✅ **PASS**: Timestamp updated dopo ritorno online
- ❌ **FAIL**: Rimane timestamp vecchio anche dopo 10sec online = subscription non riconne

tte

---

## TEST 4: MULTIPLE USERS (Cross-Account) ❌

### Scenario
Verificare che i dati di User A non vengono visti da User B

### Setup
1. Device A: Login come user1@gmail.com (admin)
2. Device B: Login come user2@gmail.com (different user)

### Steps
1. Device A: Aggiorna classifiche
2. Aspetta realtime
3. Device B: Verifica che timestamp NON cambia

### Expected
```
Device A: rankingsUpdatedAt updated ✅
Device B: rankingsUpdatedAt rimane uguale ✅
(Global rankings sono uguali, solo timestamp attuale è visto via realtime)
```

### Pass/Fail
- ✅ **PASS**: Entrambi vedono same classifiche (global), ma timestamp sync è per admin
- ℹ️ **INFO**: Questo test è "informativo" — non è un fail se timestamp non sync per user2

---

## TEST 5: PERFORMANCE - Rapid Updates 🚀

### Scenario
Admin aggiorna classifiche 3 volte in 10 secondi. Verifica che realtime non fai crash.

### Steps
1. Su Device A (PC): Aggiorna classifiche
2. Dopo 2 secondi: Aggiorna ancora
3. Dopo altri 2 secondi: Aggiorna una terza volta
4. Su Device B: Guarda se rimane responsive

### Expected
- Device B rimane responsive ✅
- Tutti e 3 gli update arrivano
- Timestamp finale è il più recente ✅
- No console errors ❌

### Pass/Fail
- ✅ **PASS**: UI responsive, timestamp corretto, no errors
- ❌ **FAIL**: Device B si freeza, error in console, timestamp non aggiorna

---

## DEBUG CHECKLIST

Se un test fallisce, eseguire debug:

### 1. Check realtime subscription active
Browser console on Device B:
```javascript
// Nel console:
document.addEventListener("console", (msg) => {
  if (msg.includes("SUBSCRIBED")) console.log("✅ Realtime active");
});
```

### 2. Check network requests
Apri Network tab (F12):
1. Filtra per "supabase"
2. Cerca realtime events
3. Se vedi "CHANNEL_ERROR" = subscription failed

### 3. Check store updates
```javascript
// In console (Zustand store):
useAppStore.getState().rankingsUpdatedAt  // Dovrebbe essere timestamp recente
useAppStore.getState().labels.length       // Dovrebbe essere 1000+ labels
```

### 4. Check logs in code
File: `src/lib/supabase.ts`
Linea 1100: Dovrebbe loggare "Realtime GLOBAL update" quando admin scrape
Linea 1511: Dovrebbe loggare "Global data applied to store"

---

## WHEN TO DECLARE "FIXED"

Se **TUTTI** questi test passano ✅:
1. ✅ Test 1: Realtime sync works (timestamps match)
2. ✅ Test 2: Personal data preserved (emails/notes remain)
3. ✅ Test 3: Offline sync works (reconnect updates)
4. ✅ Test 4: Cross-account isolated (no data leak)
5. ✅ Test 5: Performance stable (rapid updates work)

→ **IL BUG È FISSO! 🎉**

---

## ROLLBACK PLAN (If Tests Fail)

Se qualcosa non funziona:

```bash
# Revert changes
git revert HEAD

# Or restore from backup
git checkout HEAD~1 -- src/lib/supabase.ts

# Retest
npm run dev
```

---

## NOTES FOR ZAI

- Browser console DEVE essere aperto durante i test
- Usa Network tab per vedere realtime events in real-time
- Se un test fallisce, non passare al prossimo — debug first!
- Timestamp è la **key indicator** che realtime è working
- Se videe "loadStateFromCloud" in logs = OLD CODE STILL RUNNING (rollback!)

Good luck! 🚀
