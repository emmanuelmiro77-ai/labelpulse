# 🧪 TEST — Realtime Sync Classifiche Cross-Device

> **Prerequisiti**:
> - Deploy `2b521d1` online (verifica su Vercel → Deployments → "Ready")
> - 2 dispositivi con stesso account Google (PC + telefono, oppure 2 browser)

---

## 🎯 Obiettivo

Verificare che quando l'admin aggiorna le classifiche su un dispositivo, tutti gli altri dispositivi ricevono l'aggiornamento in tempo reale (entro 1-2 secondi, senza reload).

---

## 📋 Setup

### Dispositivo A (Admin — PC lavoro o dove hai le classifiche nuove)

1. Apri `https://my-project-ivory-nine.vercel.app`
2. Fai login con `emmanuel.miro77@gmail.com`
3. Apri console (F12)
4. Verifica che sei autenticato:
   ```javascript
   const s = await fetch("/api/auth/session").then(r => r.json());
   console.log("Email:", s.user?.email);
   console.log("Supabase token:", !!s.supabaseAccessToken);
   ```
   → Devi vedere `Email: emmanuel.miro77@gmail.com` e `Supabase token: true`

### Dispositivo B (Telefono o secondo browser)

1. Apri `https://my-project-ivory-nine.vercel.app`
2. Fai login con la STESSA email Google
3. Apri console (se telefono, usa Safari → Sviluppo → [tuo iPhone] → console)
4. Vai su tab **Classifiche** → segna la data delle classifiche attuali
5. Verifica realtime attivo:
   ```javascript
   // Dovresti vedere nei log: "[LabelPulse Cloud] Realtime GLOBAL subscription active"
   ```

---

## 🚀 Test

### Step 1 — Admin pusha le classifiche (Dispositivo A)

Esegui nella console del Dispositivo A:

```javascript
// Verifica quante label con rank hai localmente
const store = JSON.parse(localStorage.getItem("labelpulse-storage") || "{}");
const labels = store?.state?.labels || [];
console.log("Label totali:", labels.length);
console.log("Label con rank:", labels.filter(l => l.rankByGenre && Object.keys(l.rankByGenre).length > 0).length);
console.log("RankingsUpdatedAt:", store?.state?.rankingsUpdatedAt);
```

Se hai label con rank, pushale al cloud:

```javascript
const store = JSON.parse(localStorage.getItem("labelpulse-storage") || "{}");
const labels = store?.state?.labels || [];
const snaps = store?.state?.rankingSnapshots || [];

const res = await fetch("/api/admin/push-rankings", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    labels: labels,
    rankingSnapshots: snaps,
    rankingsUpdatedAt: new Date().toISOString(),
  })
});
const data = await res.json();
console.log("PUSH RESULT:", data);
```

→ Devi vedere: `{ ok: true, labelsPushed: N, snapshotsPushed: M, updatedAt: "..." }`

### Step 2 — Verifica ricezione realtime (Dispositivo B)

Sul Dispositivo B (telefono), guarda la console. Entro 1-2 secondi dovresti vedere:

```
[LabelPulse Cloud] Realtime GLOBAL update (admin pushed new rankings), refreshing...
[LabelPulse Cloud] Realtime GLOBAL — applying new rankings: { labels: N, snaps: M, updatedAt: "..." }
[LabelPulse Cloud] Global data applied to store. Labels: N UpdatedAt: "..."
```

### Step 3 — Verifica visiva (Dispositivo B)

Vai su tab **Classifiche**:
- ✅ Le classifiche dovrebbero essere aggiornate alla data di oggi
- ✅ Le label dovrebbero avere i rank nuovi
- ✅ Senza aver fatto reload manuale

---

## ✅ Criteri di successo

| Test | Risultato atteso |
|------|------------------|
| Push da Dispositivo A | `{ ok: true, labelsPushed: N }` |
| Realtime su Dispositivo B | Log "Realtime GLOBAL update" entro 2 secondi |
| Classifiche su Dispositivo B | Aggiornate alla data di oggi |
| Senza reload manuale | ✅ |

## ❌ Se fallisce

### Problema: Non vedo il log "Realtime GLOBAL update" sul telefono

**Causa probabile**: Service Worker vecchio (cache v6)
**Fix**: Sul telefono, vai su Safari → Impostazioni → Cancella dati siti web → Riapri l'app

### Problema: Vedo il log ma le classifiche non cambiano

**Causa probabile**: `applyGlobalDataToStore` non sta mergiando correttamente
**Fix**: Esegui sul telefono:
```javascript
const state = useAppStore.getState();
console.log("Labels:", state.labels.length);
console.log("UpdatedAt:", state.rankingsUpdatedAt);
```
Dimmi cosa esce.

### Problema: Push fallisce con 401

**Causa probabile**: Non sei loggato come admin
**Fix**: Verifica che la sessione abbia `supabaseAccessToken: true`

---

## 📊 Risultato

**Funziona!** → Il realtime cross-device è operativo. Possiamo procedere con la FASE 2.

**Bug!** → Copiami i log della console di entrambi i dispositivi.
