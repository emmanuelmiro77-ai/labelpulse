# 🐛 BUG FIX — Classifiche non si sincronizzano cross-device

> **Data**: 30 Giugno 2026
> **Commit**: `2b521d1`
> **Severità**: CRITICO

---

## 📋 Sintomo

L'admin (emmanuel.miro77@gmail.com) aggiorna le classifiche Beatport su PC lavoro → le classifiche nuove appaiono sul PC → ma sul telefono (stesso account) rimangono le classifiche VECCHIE.

## 🔍 Causa

Il canale realtime GLOBAL riceveva la notifica quando l'admin pushava nuove classifiche, MA il handler chiamava `loadStateFromCloud()` — una funzione che era stata **DISABILITATA** in precedenza (commit `328d5b9`) per evitare statement timeout.

```javascript
// ❌ CODICE BUGGATO (riga 1092 di supabase.ts)
const fresh = await loadStateFromCloud();  // ← DISABILITATA! Ritorna subito senza fare nulla
if (fresh) await applyRemoteData(fresh);   // ← Mai eseguito
```

Risultato: il telefono riceveva la notifica realtime, ma non applicava MAI le classifiche nuove.

## ✅ Fix

Sostituito `loadStateFromCloud()` con `loadGlobalRowOnly()` + `applyGlobalDataToStore()`:

```javascript
// ✅ CODICE FIXATO
const globalData = await loadGlobalRowOnly();     // ← Carica SOLO riga globale (classifiche)
if (globalData) {
  await applyGlobalDataToStore(globalData);        // ← Applica al store con merge
}
```

### Funzioni nuove/aggiornate:

1. **`loadGlobalRowOnly()`** (gia esistente) — carica SOLO la riga `global` da `app_state`, non quella personale (che causava timeout)

2. **`applyGlobalDataToStore(globalData)`** (NUOVA) — fa il merge delle classifiche globali con i dati locali:
   - Locale come base (mantiene email/note personalizzate)
   - Globale vince su campi Beatport (rank, points, genres, trending, imageUrl, slug)
   - Aggiunge label globali nuove non presenti in locale

### Anche fixato: Realtime PERSONAL

Il canale PERSONAL aveva lo stesso bug. Ora chiama `loadFromNewTables()` che carica dalle 4 tabelle dedicate (demo_submissions, label_personal_data, pitch_campaigns, user_profiles).

## 🎯 Flusso corretto ORA

```
Admin fa scrape su PC lavoro →
  pushRankingsToCloud() → POST /api/admin/push-rankings →
  riga 'global' aggiornata su Supabase →
  realtime GLOBAL notifica tutti i dispositivi connessi →
  applyGlobalDataToStore() applica le nuove classifiche →
  tutti i dispositivi vedono le classifiche aggiornate entro 1-2 secondi
```

## 📁 File modificati

- `src/lib/supabase.ts` — realtime handlers + nuova funzione `applyGlobalDataToStore()`

## ⚠️ Note

- Il realtime richiede che l'utente sia autenticato con JWT Supabase (bridge NextAuth→Supabase Auth)
- Se il telefono ha cache vecchia (Service Worker v6), vedere fix SW v7 (commit `d4d4eea`)
- Il `DISABLE_OLD_APP_STATE_SYNC = true` rimane attivo — il vecchio sync è disabilitato per evitare timeout
