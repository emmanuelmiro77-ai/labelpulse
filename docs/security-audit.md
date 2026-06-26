# 🔒 Security Audit — LabelPulse

> **Data**: 27 Giugno 2026  
> **Auditor**: AI Agent (automated scan)  
> **Scope**: API routes, Supabase RLS, client-side secrets, auth coverage  
> **Stato**: Audit completato → fix critici da implementare prima della beta

---

## Riepilogo

| Severità | Conteggio | Azione |
|----------|-----------|--------|
| 🔴 CRITICO | 5 | Fix obbligatorio prima della beta |
| 🟠 ALTO | 8 | Fix prima del GA |
| 🟡 MEDIO | 6 | Nice-to-have |

---

## 🔴 CRITICI — Fix prima della beta

### C-1. Tabella `app_state` RLS = `USING (true)` → chiunque legge tutti i dati
- **File**: `supabase-schema.sql` righe 47-55
- **Rischio**: Chiunque con l'anon key può fare `SELECT * FROM app_state` e vedere labels, demo, pitch di TUTTI gli utenti
- **Fix**: Sostituire policy con scoping per email (vedi report completo)

### C-2. Tabella `beta_access_codes` RLS = `USING (true)` → chiunque enumera/modifica codici beta
- **File**: `supabase-schema-beta-codes.sql` righe 36-40
- **Rischio**: Enumerare tutti i codici, crearne di nuovi, modificare esistenti
- **Fix**: Restrict a service_role per admin ops; SELECT limitato per verify

### C-3. Endpoints push notification senza auth
- **File**: `src/app/api/push/subscribe/route.ts`, `unsubscribe`, `update-prefs`, `test`
- **Rischio**: Spam notifiche, unsubscribe DoS, modifica preferenze altrui
- **Fix**: Aggiungere session verification come `/api/gmail/send`

### C-4. `/api/beta-feedback` POST senza auth
- **File**: `src/app/api/beta-feedback/route.ts`
- **Rischio**: Spam illimitato di feedback fake
- **Fix**: Aggiungere session check + rate limiting

### C-5. `/api/account/withdrawal` POST senza auth
- **File**: `src/app/api/account/withdrawal/route.ts`
- **Rischio**: Richieste recesso false per qualsiasi email
- **Fix**: Verificare sessione e match email

---

## 🟠 ALTI — Fix prima del GA

| ID | Issue | File |
|----|-------|------|
| H-1 | Tabelle snapshots RLS DISABLED | supabase-schema-snapshots.sql |
| H-2 | Tabella agent_memory accessibile anon | supabase-schema-agent-memory.sql |
| H-3 | SoundCloud client IDs hardcoded | src/app/api/audio-proxy/route.ts |
| H-4 | Audio proxy = SSRF vector | src/app/api/audio-proxy/route.ts |
| H-5 | `/api/snapshots/save` senza auth | src/app/api/snapshots/save/route.ts |
| H-6 | Snapshots endpoints pubblici | src/app/api/snapshots/latest, diff |
| H-7 | RLS push_subscriptions broken | supabase-schema-push.sql |
| H-8 | Debug endpoints in production | auth-debug, cloud-debug, /debug |

---

## 🟡 MEDI

| ID | Issue |
|----|-------|
| M-1 | Logica "value" (demo matcher, pitch) tutta client-side → reverse-engineerable |
| M-2 | BETA_ADMIN_TOKEN in localStorage (XSS risk) |
| M-3 | NextAuth debug:true in production |
| M-4 | /api/email/send GET senza auth |
| M-5 | Nessun rate limiting su nessun endpoint |
| M-6 | NEXT_PUBLIC_SUPABASE_ANON_KEY accettabile SOLO con RLS corretto |

---

## Decisione: Repo pubblico o privato?

**Raccomandazione**: **PRIVATO** fino al GA, per i seguenti motivi:
1. La logica "value" (demo-matcher, pitch templates) è tutta client-side → un repo pubblico la rende copiabile
2. Il database label (1192 labels + rankings) è nel codice → valore commerciale esposto
3. L'NDA beta proibisce la condivisione di dettagli → un repo pubblico contraddice l'NDA
4. Dopo il GA: valutare public trust vs IP protection

---

## Priorità fix (ordine di implementazione)

1. **C-3 + C-5**: Aggiungere auth ai push endpoints + withdrawal (30 min)
2. **C-4**: Aggiungere auth a beta-feedback POST (15 min)
3. **C-1 + C-2**: Fix RLS Supabase (1-2 ore, richiede migrazione)
4. **H-8**: Rimuovere/guardare debug endpoints (15 min)
5. **M-3**: Disabilitare NextAuth debug in production (5 min)

**Tempo totale stimato**: 3-4 ore per i fix critici
