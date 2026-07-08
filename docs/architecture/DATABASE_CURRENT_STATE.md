# DATABASE CURRENT STATE

Fotografia completa dello stato attuale del progetto LabelPulse dal punto di vista del database.

**Fonti analizzate:**
- Codice sorgente in `src/`
- Migration SQL / schema SQL nel repository (`supabase-schema*.sql`, `supabase-*.sql`)
- API route in `src/app/api/`
- Service in `src/lib/` (`api-client.ts`, `snapshots.ts`, `push.ts`)
- Hook in `src/hooks/`

**Limiti dell'analisi:**
- Lo stato reale del database live potrebbe differire dai file SQL (script applicati manualmente via SQL Editor in ordine non tracciato)
- Lo stato delle policy RLS dipende da quale degli script `supabase-rls-*.sql` è stato effettivamente eseguito per ultimo
- I conteggi righe non sono verificabili senza accesso al database

---

## 1. ELENCO COMPLETO DELLE TABELLE

### Tabelle dello schema `public`

| # | Tabella | File schema | Tipo | Stato RLS (nei file) |
|---|---------|-------------|------|---------------------|
| 1 | `app_state` | `supabase-schema.sql` | Globale + Personale (JSON blob) | ENABLE, policy permissive |
| 2 | `demo_submissions` | `supabase-schema-fase-c.sql` | Personale | ENABLE, policy `auth.jwt()->>'email'` (ma emergency fix le ha sostituite con `USING(true)`) |
| 3 | `label_personal_data` | `supabase-schema-fase-c.sql` | Personale | ENABLE, policy `auth.jwt()->>'email'` (emergency fix) |
| 4 | `pitch_campaigns` | `supabase-schema-fase-c.sql` | Personale | ENABLE, policy `auth.jwt()->>'email'` (emergency fix) |
| 5 | `user_profiles` | `supabase-schema-fase-c.sql` | Personale | ENABLE, policy `auth.jwt()->>'email'` (emergency fix) |
| 6 | `user_releases` | `supabase-schema-releases.sql` | Personale | ENABLE, policy `auth.jwt()->>'email'` |
| 7 | `push_subscriptions` | `supabase-schema-push.sql` | Personale | ENABLE, policy `current_setting('app.current_email', true)` |
| 8 | `beatport_snapshots` | `supabase-schema-snapshots.sql` | Globale | DISABLE |
| 9 | `beatport_chart_history` | `supabase-schema-snapshots.sql` | Globale | DISABLE |
| 10 | `followed_artists` | `supabase-schema-snapshots.sql` | Globale | DISABLE |
| 11 | `agent_memory` | `supabase-schema-agent-memory.sql` | Globale (admin) | ENABLE, policy `USING(true)` |
| 12 | `beta_feedback` | `supabase-schema.sql` | Personale | ENABLE, policy `FOR INSERT WITH CHECK (true)` |
| 13 | `beta_access_codes` | `supabase-schema-beta-codes.sql` | Globale (admin) | ENABLE, policy scoped |
| 14 | `v_beta_tester_status` | `supabase-schema-beta-tracking.sql` | View globale | N/A (view) |

### Tabelle di sistema

| Tabella | Schema | Note |
|---------|--------|------|
| `auth.users` | `auth` | Utenti registrati via Google OAuth (Supabase Auth) |
| `auth.sessions` | `auth` | Sessioni Supabase Auth |

---

## 2. ANALISI DETTAGLIATA PER TABELLA

### 2.1 `app_state`

| Aspetto | Valore |
|---------|--------|
| **Scopo** | Memorizza lo stato completo dell'app come JSONB blob |
| **Dati contenuti** | Riga `id='global'`: classifiche Beatport, label globali, artisti, snapshots. Riga `id='<email>'`: labels personalizzate, demos, releases, savedPitches, sentCampaigns, userProfile, gmailAuth, rankingSnapshots |
| **Globale o personale** | Entrambi (riga globale + righe personali) |
| **Chiave primaria** | `id TEXT` (valore: `'global'` o `'<email>'`) |
| **Chi la utilizza** | `supabase.ts`, `store.ts`, API route admin/cron/debug |
| **API coinvolte** | `/api/admin/push-rankings` (POST upsert riga globale, GET lettura), `/api/admin/migrate-appstate` (POST migrazione), `/api/cron/follow-up-reminders` (GET lettura), `/api/cron/weekly-recap` (GET lettura), `/api/debug-cloud-state` (GET diagnostica), `/api/debug-rankings` (GET diagnostica), `/api/sync-status` (GET diagnostica) |
| **Componenti coinvolti** | Indiretto via store Zustand (tutti i componenti) |
| **RLS prevista** | Globale leggibile da tutti; personale leggibile solo dal proprietario |
| **RLS realmente definita** | `FOR SELECT USING (true)` (tutti leggono tutto) + INSERT/UPDATE/DELETE con `WITH CHECK (id IS NOT NULL)` (nessun controllo per-user) |
| **Criticità** | 🔴 CRITICA — policy `USING(true)` permette a chiunque con anon key di leggere TUTTE le righe di TUTTI gli utenti (email, profile, demos, note, contatti). Doppia fonte di verità (JSON blob + tabelle dedicate). |

### 2.2 `demo_submissions`

| Aspetto | Valore |
|---------|--------|
| **Scopo** | Demo inviati dall'utente alle label |
| **Dati contenuti** | `id, user_email, label_id, label_name, track_name, artist_name, link, status, sent_date, pitch_text, pitch_subject, pitch_tracks, notes, parent_release_id, created_at, updated_at` |
| **Globale o personale** | Personale |
| **Chiave primaria** | `id TEXT` |
| **Chi la utilizza** | `api-client.ts`, API route |
| **API coinvolte** | `/api/demos` (GET/POST/PATCH/DELETE), `/api/sync-status` (GET count), `/api/admin/migrate-appstate` (POST migrazione), `/api/debug-profile` (GET diagnostica) |
| **Componenti coinvolti** | `demo-tracker.tsx` (via store + api-client) |
| **RLS prevista** | `user_email = auth.jwt()->>'email'` |
| **RLS realmente definita** | Dipende da quale script è stato eseguito per ultimo: schema FASE C definisce `USING (user_email = auth.jwt() ->> 'email')`, ma `supabase-rls-disable-emergency.sql` la sostituisce con `FOR ALL USING (true) WITH CHECK (true)` |
| **Criticità** | 🔴 ALTA — se emergency fix applicato, accesso totale a chiunque. Chiave `user_email` TEXT invece di `user_id` UUID (fragile, no FK a auth.users). |

### 2.3 `label_personal_data`

| Aspetto | Valore |
|---------|--------|
| **Scopo** | Dati personali che l'utente aggiunge alle label (contatti, note, link, status) |
| **Dati contenuti** | `id, user_email, label_id, emails[], notes, status, website, demo_link, social_link, soundcloud_link, beatport_link, contact_info, custom_links, is_custom, custom_name, custom_genre, is_favorite, created_at, updated_at` |
| **Globale o personale** | Personale |
| **Chiave primaria** | `id BIGSERIAL` + UNIQUE `(user_email, label_id)` |
| **Chi la utilizza** | `api-client.ts`, API route |
| **API coinvolte** | `/api/label-data` (GET/POST/PATCH/DELETE), `/api/sync-status` (GET count), `/api/admin/migrate-appstate` (POST migrazione), `/api/debug-profile` (GET diagnostica) |
| **Componenti coinvolti** | `label-finder.tsx`, `demo-tracker.tsx` (via store + api-client) |
| **RLS prevista** | `user_email = auth.jwt()->>'email'` |
| **RLS realmente definita** | Come demo_submissions (emergency fix sostituisce con `USING(true)`) |
| **Criticità** | 🔴 ALTA — emergency fix. Chiave `user_email` TEXT. Contiene dati sensibili (emails contatti, note private). |

### 2.4 `pitch_campaigns`

| Aspetto | Valore |
|---------|--------|
| **Scopo** | Pitch bozze e inviate |
| **Dati contenuti** | `id, user_email, label_id, label_name, demo_id, subject, body, pitch_tracks, ep_link_mode, ep_soundcloud_url, status, sent_at, sent_method, created_at, updated_at` |
| **Globale o personale** | Personale |
| **Chiave primaria** | `id TEXT` |
| **Chi la utilizza** | `api-client.ts`, API route |
| **API coinvolte** | `/api/pitches` (GET/POST/PATCH/DELETE), `/api/sync-status` (GET count), `/api/admin/migrate-appstate` (POST migrazione) |
| **Componenti coinvolti** | `pitch-generator.tsx` (via store + api-client) |
| **RLS prevista** | `user_email = auth.jwt()->>'email'` |
| **RLS realmente definita** | Come demo_submissions (emergency fix) |
| **Criticità** | 🔴 ALTA — emergency fix. Chiave `user_email` TEXT. |

### 2.5 `user_profiles`

| Aspetto | Valore |
|---------|--------|
| **Scopo** | Profilo utente (artist name, bio, foto, social link) |
| **Dati contenuti** | `user_email, artist_name, bio, photo_url, sc_link, links, cyanite_api_token, locale, created_at, updated_at` |
| **Globale o personale** | Personale |
| **Chiave primaria** | `user_email TEXT` |
| **Chi la utilizza** | `api-client.ts`, API route |
| **API coinvolte** | `/api/profile` (GET/POST/DELETE), `/api/sync-status` (GET), `/api/admin/migrate-appstate` (POST), `/api/debug-profile` (GET) |
| **Componenti coinvolti** | `producer-profile.tsx` (via store + api-client) |
| **RLS prevista** | `user_email = auth.jwt()->>'email'` |
| **RLS realmente definita** | Come demo_submissions (emergency fix) |
| **Criticità** | 🔴 ALTA — emergency fix. Contiene `photo_url` (data URL base64), `cyanite_api_token` (BYOK). Chiave `user_email` TEXT. |

### 2.6 `user_releases`

| Aspetto | Valore |
|---------|--------|
| **Scopo** | EP/release utente |
| **Dati contenuti** | `id, user_email, type, title, artists[], track_ids[], genre, notes, ep_soundcloud_url, created_at, updated_at` |
| **Globale o personale** | Personale |
| **Chiave primaria** | `id TEXT` |
| **Chi la utilizza** | `api-client.ts`, API route |
| **API coinvolte** | `/api/releases` (GET/POST/PATCH/DELETE), `/api/sync-status` (GET count) |
| **Componenti coinvolti** | `demo-tracker.tsx` (sezione EP, via store + api-client) |
| **RLS prevista** | `user_email = auth.jwt()->>'email'` |
| **RLS realmente definita** | `USING (user_email = auth.jwt() ->> 'email')` (schema releases.sql, non toccata da emergency fix) |
| **Criticità** | 🟡 MEDIA — RLS corretta ma chiave `user_email` TEXT. |

### 2.7 `push_subscriptions`

| Aspetto | Valore |
|---------|--------|
| **Scopo** | Sottoscrizioni notifiche push per device |
| **Dati contenuti** | `id, user_email, endpoint, p256dh, auth_key, prefs_follow_up, prefs_rankings, prefs_weekly_recap, created_at, last_seen_at` |
| **Globale o personale** | Personale |
| **Chiave primaria** | `id BIGSERIAL` + UNIQUE `endpoint` |
| **Chi la utilizza** | `push.ts`, API route push + cron |
| **API coinvolte** | `/api/push/subscribe` (POST), `/api/push/unsubscribe` (POST), `/api/push/update-prefs` (POST), `/api/push/test` (POST), `/api/push/rankings-updated` (POST admin), `/api/cron/follow-up-reminders` (GET), `/api/cron/weekly-recap` (GET) |
| **Componenti coinvolti** | `notification-settings.tsx` (via push.ts) |
| **RLS prevista** | `user_email = current_setting('app.current_email', true)` |
| **RLS realmente definita** | Solo policy SELECT con `current_setting`. INSERT/UPDATE/DELETE senza policy esplicite (bloccate da RLS di default). |
| **Criticità** | 🟡 MEDIA — policy SELECT usa `current_setting` (non standard), mancano policy INSERT/UPDATE/DELETE esplicite. Chiave `user_email` TEXT. |

### 2.8 `beatport_snapshots`

| Aspetto | Valore |
|---------|--------|
| **Scopo** | Snapshot sessioni di scraping Beatport (1 riga per sessione) |
| **Dati contenuti** | `id, snapshot_date, source, total_genres, total_labels, total_artists, total_tracks, incomplete_genres, notes, tracks JSONB, created_at` |
| **Globale o personale** | Globale |
| **Chiave primaria** | `id BIGSERIAL` |
| **Chi la utilizza** | `snapshots.ts` |
| **API coinvolte** | `/api/snapshots/save` (POST), `/api/snapshots/latest` (GET), `/api/snapshots/diff/[date]` (GET) |
| **Componenti coinvolti** | `rankings-wizard.tsx` (POST save), `rankings-page.tsx` (GET latest/diff) |
| **RLS prevista** | Read-only per utenti, scrittura solo admin |
| **RLS realmente definita** | `DISABLE ROW LEVEL SECURITY` — RLS disabilitata, accesso totale a chiunque |
| **Criticità** | 🔴 ALTA — RLS disabilitata. Route `/api/snapshots/*` senza auth check, chiunque può scrivere. |

### 2.9 `beatport_chart_history`

| Aspetto | Valore |
|---------|--------|
| **Scopo** | Storico posizioni tracce per snapshot (diff) |
| **Dati contenuti** | `id, snapshot_id, track_id, track_key, name, mix_name, slug, artists JSONB, remixers JSONB, label, label_id, label_slug, primary_genre, sub_genre, bpm, key_camelot, key_name, release_date, cover_art, sample_url, genre, position, points, prev_position, position_change, is_new_entry, weeks_in_chart, artist_ids[], created_at` |
| **Globale o personale** | Globale |
| **Chiave primaria** | `id BIGSERIAL` |
| **Chi la utilizza** | `snapshots.ts` |
| **API coinvolte** | Stesse di `beatport_snapshots` |
| **Componenti coinvolti** | Indiretto via snapshots |
| **RLS prevista** | Read-only per utenti |
| **RLS realmente definita** | `DISABLE ROW LEVEL SECURITY` |
| **Criticità** | 🔴 ALTA — RLS disabilitata. |

### 2.10 `followed_artists`

| Aspetto | Valore |
|---------|--------|
| **Scopo** | Tracking user → artist (mai implementata) |
| **Dati contenuti** | `id, user_email, artist_id, created_at` |
| **Globale o personale** | Personale (mai usata) |
| **Chiave primaria** | `id BIGSERIAL` |
| **Chi la utilizza** | ❌ Nessuno (nessun riferimento nel codice `src/`) |
| **API coinvolte** | ❌ Nessuna |
| **Componenti coinvolti** | ❌ Nessuno |
| **RLS prevista** | N/A |
| **RLS realmente definita** | `DISABLE ROW LEVEL SECURITY` |
| **Criticità** | 🟡 MEDIA — tabella orfana, RLS disabilitata, mai usata. Candidata all'eliminazione. |

### 2.11 `agent_memory`

| Aspetto | Valore |
|---------|--------|
| **Scopo** | Memoria AI per bug fix e regressioni |
| **Dati contenuti** | `id, title, severity, status, symptom, cause, fix, files_affected[], search_keywords[], event_type, created_at` |
| **Globale o personale** | Globale (admin) |
| **Chiave primaria** | `id BIGSERIAL` |
| **Chi la utilizza** | ❌ Nessun componente dell'app. Script esterni: `scripts/log-agent-memory.sh`, `scripts/seed-agent-memory.py` |
| **API coinvolte** | ❌ Nessuna API route |
| **Componenti coinvolti** | ❌ Nessuno |
| **RLS prevista** | Solo admin (service_role) |
| **RLS realmente definita** | `ENABLE ROW LEVEL SECURITY` + `FOR SELECT USING (true)` + `FOR INSERT WITH CHECK (true)` — accesso totale a chiunque |
| **Criticità** | 🔴 ALTA — policy permissive espongono memoria AI con dettagli bug, file toccati, soluzioni. |

### 2.12 `beta_feedback`

| Aspetto | Valore |
|---------|--------|
| **Scopo** | Feedback dei beta tester |
| **Dati contenuti** | `id, email, category, subject, message, user_agent, url, app_version, label_count, demo_count, locale, status, admin_reply, admin_replied_at, admin_reply_seen_at, created_at` |
| **Globale o personale** | Personale (per email) |
| **Chiave primaria** | `id BIGSERIAL` |
| **Chi la utilizza** | API route |
| **API coinvolte** | `/api/beta-feedback` (POST insert utente, GET list admin, PATCH admin update), `/api/beta-feedback/my-replies` (GET utente, PATCH utente seen_at) |
| **Componenti coinvolti** | `beta-feedback-button.tsx` (utente), `feedback-inbox.tsx` (admin), `admin/feedback/page.tsx` (admin) |
| **RLS prevista** | INSERT utente autenticato, SELECT/UPDATE solo admin |
| **RLS realmente definita** | Solo `FOR INSERT WITH CHECK (true)` — nessuna policy SELECT/UPDATE/DELETE (bloccate da RLS di default), ma INSERT anonima permessa |
| **Criticità** | 🟡 MEDIA — INSERT anonima permette spam. SELECT/UPDATE bloccate (OK). La route admin usa `supabaseKey` di tipo da verificare (service_role o anon). |

### 2.13 `beta_access_codes`

| Aspetto | Valore |
|---------|--------|
| **Scopo** | Codici di accesso per beta tester |
| **Dati contenuti** | `id, email, code, discord_user_id, note, expires_at, used_at, created_by, created_at` |
| **Globale o personale** | Globale (admin) |
| **Chiave primaria** | `id BIGSERIAL` |
| **Chi la utilizza** | API route auth + admin |
| **API coinvolte** | `/api/auth/beta-verify` (POST verifica codice), `/api/admin/generate-beta-code` (POST creazione, GET list) |
| **Componenti coinvolti** | `auth-page.tsx` (login beta-code), `admin/beta-testers/page.tsx` (admin) |
| **RLS prevista** | SELECT scoped (verifica codice specifico), INSERT/UPDATE/DELETE solo service_role |
| **RLS realmente definita** | `FOR SELECT USING (codice match)` + `FOR INSERT/UPDATE/DELETE WITH CHECK (false)` — ben scoping |
| **Criticità** | 🟢 BASSA — RLS corretta e ben scoping. Unica tabella con policy davvero sicure. |

### 2.14 `v_beta_tester_status` (view)

| Aspetto | Valore |
|---------|--------|
| **Scopo** | View per tracciare stato beta tester (unisce `beta_access_codes` + `app_state`) |
| **Dati contenuti** | `code_id, email, code, note, discord_user_id, invited_at, expires_at, first_login_at, created_by, has_app_data, last_activity_at, tester_status` |
| **Globale o personale** | Globale (admin) |
| **Chi la utilizza** | Probabilmente admin dashboard (non verificato nel codice) |
| **API coinvolte** | ❌ Nessuna API route |
| **Componenti coinvolti** | Probabilmente `admin/beta-testers/page.tsx` (non confermato) |
| **RLS prevista** | Solo admin |
| **RLS realmente definita** | N/A (view, eredita RLS dalle tabelle sottostanti — `app_state` SELECT `USING(true)` espone tutto) |
| **Criticità** | 🟡 MEDIA — view eredita policy permissive di `app_state`. |

---

## 3. RELAZIONI TRA LE TABELLE

### 3.1 Relazioni logiche (non enforced da FK)

```
auth.users (UUID id)
    │
    │ user_email = auth.users.email (TEXT, no FK)
    ↓
┌───┴────────────────────────────────────────────┐
│                                                │
demo_submissions     label_personal_data         │
    │                    │                       │
    │ label_id           │ label_id              │
    │ (logico, no FK)    │ (logico, no FK)       │
    ↓                    ↓                       │
app_state id='global' (label ufficiali)          │
                                                 │
pitch_campaigns ──── demo_id ──→ demo_submissions│
    │                                            │
    │ label_id (logico)                          │
    └────────────────────────────────────────────┘
                                                 │
user_releases ──── track_ids[] ──→ demo_submissions
                                                 │
user_profiles (1:1 con user_email)               │
                                                 │
push_subscriptions (N:1 con user_email)          │
                                                 │
beta_feedback (N:1 con email utente)             │
                                                 │
beta_access_codes (1:1 con email)                │
    │                                            │
    └──→ v_beta_tester_status (view)             │
              ↑                                  │
              └── app_state id='<email>' (join)  │
                                                 │
beatport_snapshots ──→ beatport_chart_history    │
    │ (1:N, snapshot_id)                         │
    │                                            │
    └──→ followed_artists (mai usata)            │
                                                 │
agent_memory (standalone, admin)                 │
└────────────────────────────────────────────────┘
```

### 3.2 Relazioni enforced (FK)

**Nessuna.** Nessuna tabella ha foreign key verso `auth.users` o verso altre tabelle. Le relazioni sono tutte logiche (via `user_email` TEXT o `label_id` TEXT), non enforceable a livello database.

### 3.3 Relazioni via `app_state` JSON blob

La riga `app_state id='<email>'` contiene un JSON blob con:
- `labels[]` — array di label con campi personali (emails, notes, status, demoLink, ecc.)
- `demos[]` — array di demo
- `releases[]` — array di release
- `savedPitches[]` — array di pitch bozze
- `sentCampaigns[]` — array di pitch inviate
- `userProfile` — oggetto profilo
- `gmailAuth` — oggetto auth Gmail
- `rankingSnapshots[]` — array di snapshot classifiche
- `artists[]` — array di artisti

Questi dati sono **duplicati** nelle tabelle FASE C dedicate (`demo_submissions`, `label_personal_data`, `pitch_campaigns`, `user_profiles`, `user_releases`).

---

## 4. TABELLE LEGACY

| Tabella | Tipo | Motivo legacy |
|---------|------|---------------|
| `app_state` riga personale `id='<email>'` | JSON blob | Sostituita dalle tabelle FASE C. `DISABLE_OLD_APP_STATE_SYNC` disabilita la scrittura. Letta ancora da `loadStateFromCloud` per fallback. |
| `app_state` riga `id='default'` | JSON blob | Backward compatibility vecchia versione single-user. Inserita da `INSERT INTO app_state (id, data) VALUES ('default', '{}')` nello schema. |
| `followed_artists` | Tabella | Definita nello schema ma mai usata nel codice. Orfana. |

---

## 5. TABELLE DUPLICATE

### 5.1 Duplicazione `app_state` personale vs tabelle FASE C

| Dato | `app_state` riga personale | Tabella FASE C |
|------|---------------------------|----------------|
| Demo | `data.demos[]` | `demo_submissions` |
| Label personalizzate | `data.labels[]` (con campi personali) | `label_personal_data` |
| Pitch bozze | `data.savedPitches[]` | `pitch_campaigns` (status='draft') |
| Pitch inviate | `data.sentCampaigns[]` | `pitch_campaigns` (status='sent') |
| Profilo | `data.userProfile` | `user_profiles` |
| Release | `data.releases[]` | `user_releases` |
| gmailAuth | `data.gmailAuth` | ❌ Nessuna tabella dedicata (solo in app_state) |
| rankingSnapshots | `data.rankingSnapshots[]` | Solo in `app_state` riga globale (read-only) |
| artists | `data.artists[]` | Solo in `app_state` riga `<email>_artists` |

**Causa:** la migrazione FASE C ha creato tabelle dedicate ma non ha eliminato la scrittura su `app_state`. `syncToCloud`/`forceCloudSync` sono disabilitati (`DISABLE_OLD_APP_STATE_SYNC`) ma ancora presenti nel codice.

### 5.2 Duplicazione `gmailAuth`

`gmailAuth` (token OAuth Gmail) esiste **solo** in `app_state.data.gmailAuth`. Nessuna tabella dedicata. Se `app_state` personale viene eliminata, `gmailAuth` viene perso.

---

## 6. TABELLE DA ELIMINARE

| Tabella | Motivo | Fase refactoring |
|---------|--------|------------------|
| `app_state` riga personale `id='<email>'` | Duplicata da tabelle FASE C | Fase 2 (blocca scrittura) + Fase 7 (elimina fisicamente) |
| `app_state` riga `id='default'` | Backward compatibility single-user, non più usata | Fase 7 |
| `followed_artists` | Orfana, mai usata nel codice | Fase 0.5 (RLS) o Fase 7 (eliminazione) |
| `v_beta_tester_status` (view) | Eredita policy permissive di `app_state`, espone dati | Valutare dopo Fase 2 |

**Note:**
- `app_state` riga globale `id='global'` **NON va eliminata** — contiene classifiche Beatport read-only
- `agent_memory` non va eliminata, va solo protetta con RLS (script admin la usano)

---

## 7. DIPENDENZE TRA LE TABELLE

### 7.1 Dipendenze di lettura

```
Componente UI
    ↓
Hook (use-realtime-sync.ts) / Store (Zustand)
    ↓
Service (api-client.ts, snapshots.ts, push.ts)
    ↓
API Route (/api/demos, /api/label-data, /api/profile, ecc.)
    ↓
getAdminClient() (supabase-admin.ts)
    ↓
Supabase (JWT utente o service_role fallback)
    ↓
Tabelle: demo_submissions, label_personal_data, user_profiles, pitch_campaigns, user_releases
```

### 7.2 Dipendenze di scrittura

```
Azione utente (addDemo, addLabel, setUserProfile, ecc.)
    ↓
Store Zustand set() [ottimistico]
    ↓
syncToCloud() [disabilitato, disattivo]
    ↓
apiCreateDemo() / apiUpsertLabelData() / apiUpsertProfile() [via writeWithOutbox]
    ↓
API Route POST
    ↓
getAdminClient() → Supabase
    ↓
Tabelle FASE C
```

### 7.3 Dipendenze del boot

```
Login (use-auth.ts)
    ↓
Promise.all([
  loadFromCloud() → app_state id='global' (classifiche)
  loadFromNewTables() → 5 tabelle FASE C (demos, labels, pitches, profile, releases)
])
    ↓
setState Zustand [race condition]
    ↓
Fallback restoreFromSnapshot() [IndexedDB] se cloud vuoto
```

### 7.4 Dipendenze cross-tabella

| Tabella | Dipende da | Per |
|---------|------------|-----|
| `demo_submissions` | `app_state` globale (label_id) | Risolvere nome label |
| `label_personal_data` | `app_state` globale (label_id) | Dati ufficiali label |
| `pitch_campaigns` | `demo_submissions` (demo_id) | Collegamento pitch → demo |
| `pitch_campaigns` | `label_personal_data` (label_id) | Invio pitch a label |
| `user_releases` | `demo_submissions` (track_ids[]) | EP composto da demo |
| `v_beta_tester_status` | `app_state` + `beta_access_codes` | View admin |
| `push_subscriptions` | nessuna | Standalone |
| `beatport_chart_history` | `beatport_snapshots` (snapshot_id) | Storico per snapshot |

---

## 8. DIAGRAMMA DELL'ARCHITETTURA DATI

```
┌─────────────────────────────────────────────────────────────────────┐
│                    SUPABASE POSTGRESQL                               │
│                                                                     │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │  auth.users (UUID id, email)                                 │   │
│  │  ⚠️ Nessuna FK verso le tabelle sottostanti                  │   │
│  └─────────────────────────────────────────────────────────────┘   │
│                                                                     │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │  app_state (JSON blob)                                       │   │
│  │  ┌─────────────────────────────────────────────────────┐    │   │
│  │  │  Riga id='global' (GLOBALE, read-only per utenti)   │    │   │
│  │  │  - labels[] (classifiche Beatport)                  │    │   │
│  │  │  - rankingSnapshots[]                               │    │   │
│  │  │  - artists[]                                        │    │   │
│  │  └─────────────────────────────────────────────────────┘    │   │
│  │  ┌─────────────────────────────────────────────────────┐    │   │
│  │  │  Righe id='<email>' (PERSONALE, LEGACY)             │    │   │
│  │  │  - labels[], demos[], releases[]                    │    │   │
│  │  │  - savedPitches[], sentCampaigns[]                  │    │   │
│  │  │  - userProfile, gmailAuth                           │    │   │
│  │  │  - rankingSnapshots[], artists[]                    │    │   │
│  │  │  ⚠️ DUPLICATA da tabelle FASE C                    │    │   │
│  │  └─────────────────────────────────────────────────────┘    │   │
│  │  RLS: ENABLE, SELECT USING(true) [🚨 permissive]            │   │
│  └─────────────────────────────────────────────────────────────┘   │
│                                                                     │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │  Tabelle FASE C (PERSONALI, user_email TEXT)                 │   │
│  │  ┌──────────────────┐  ┌──────────────────┐                 │   │
│  │  │ demo_submissions  │  │ label_personal_  │                 │   │
│  │  │  (id, user_email, │  │   data           │                 │   │
│  │  │   label_id, ...)  │  │  (id, user_email,│                 │   │
│  │  │  RLS: ⚠️ emergency│  │   label_id, ...) │                 │   │
│  │  │  fix USING(true)  │  │  RLS: ⚠️ emergency│                 │   │
│  │  └──────────────────┘  │  fix USING(true)  │                 │   │
│  │                         └──────────────────┘                 │   │
│  │  ┌──────────────────┐  ┌──────────────────┐                 │   │
│  │  │ pitch_campaigns   │  │ user_profiles    │                 │   │
│  │  │  (id, user_email, │  │  (user_email PK, │                 │   │
│  │  │   demo_id, ...)   │  │   artist_name,   │                 │   │
│  │  │  RLS: ⚠️ emergency│  │   bio, photo_url)│                 │   │
│  │  │  fix USING(true)  │  │  RLS: ⚠️ emergency│                 │   │
│  │  └──────────────────┘  │  fix USING(true)  │                 │   │
│  │                         └──────────────────┘                 │   │
│  │  ┌──────────────────┐  ┌──────────────────┐                 │   │
│  │  │ user_releases     │  │ push_subscriptions│                │   │
│  │  │  (id, user_email, │  │  (id, user_email,│                 │   │
│  │  │   title, ...)     │  │   endpoint, ...) │                 │   │
│  │  │  RLS: ✅ jwt email│  │  RLS: ⚠️ partial │                 │   │
│  │  └──────────────────┘  └──────────────────┘                 │   │
│  └─────────────────────────────────────────────────────────────┘   │
│                                                                     │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │  Tabelle GLOBALI (scraping Beatport)                         │   │
│  │  ┌──────────────────┐  ┌──────────────────┐                 │   │
│  │  │ beatport_snapshots│  │ beatport_chart_  │                 │   │
│  │  │  (id, snapshot_   │  │  history          │                 │   │
│  │  │   date, tracks)   │  │  (id, snapshot_id,│                 │   │
│  │  │  RLS: ❌ DISABLED │  │   track_id, ...)  │                 │   │
│  │  └──────────────────┘  │  RLS: ❌ DISABLED │                 │   │
│  │                         └──────────────────┘                 │   │
│  │  ┌──────────────────┐                                      │   │
│  │  │ followed_artists  │  (orfana, mai usata)                 │   │
│  │  │  RLS: ❌ DISABLED │                                      │   │
│  │  └──────────────────┘                                      │   │
│  └─────────────────────────────────────────────────────────────┘   │
│                                                                     │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │  Tabelle ACCESSORIE                                          │   │
│  │  ┌──────────────────┐  ┌──────────────────┐                 │   │
│  │  │ agent_memory      │  │ beta_feedback     │                │   │
│  │  │  (admin, AI)      │  │  (user, feedback) │                │   │
│  │  │  RLS: 🚨 USING(true)│  │  RLS: ⚠️ INSERT anon│              │   │
│  │  └──────────────────┘  └──────────────────┘                 │   │
│  │  ┌──────────────────┐  ┌──────────────────┐                 │   │
│  │  │ beta_access_codes │  │ v_beta_tester_    │ (view)         │   │
│  │  │  (admin, codes)   │  │  status           │                │   │
│  │  │  RLS: ✅ scoped   │  │  RLS: ⚠️ inherits  │                │   │
│  │  └──────────────────┘  └──────────────────┘                 │   │
│  └─────────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────┐
│                    APPLICAZIONE (client + server)                    │
│                                                                     │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │  Componenti UI                                                │   │
│  │  demo-tracker, label-finder, producer-profile,               │   │
│  │  pitch-generator, notification-settings, rankings-wizard     │   │
│  └──────────────────────────┬──────────────────────────────────┘   │
│                              │ usa                                  │   │
│                              ▼                                      │   │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │  Store Zustand (useAppStore) + Hook (use-realtime-sync)      │   │
│  │  ⚠️ Zustand persist su IndexedDB (violazione Costituzione)   │   │
│  └──────────────────────────┬──────────────────────────────────┘   │
│                              │ usa                                  │   │
│                              ▼                                      │   │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │  Service (api-client.ts, snapshots.ts, push.ts)              │   │
│  │  - apiCreateDemo, apiUpsertLabelData, apiUpsertProfile       │   │
│  │  - saveSnapshot, getLatestSnapshot, getSnapshotDiff          │   │
│  │  - saveSubscription, sendPushToUser                          │   │
│  │  - writeWithOutbox (coda offline su IndexedDB)               │   │
│  └──────────────────────────┬──────────────────────────────────┘   │
│                              │ fetch HTTP                           │   │
│                              ▼                                      │   │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │  API Route (Next.js serverless)                              │   │
│  │  /api/demos, /api/label-data, /api/profile, /api/pitches     │   │
│  │  /api/releases, /api/snapshots/*, /api/push/*, /api/admin/*  │   │
│  │  /api/cron/*, /api/beta-feedback, /api/auth/*                │   │
│  └──────────────────────────┬──────────────────────────────────┘   │
│                              │ getAdminClient()                     │   │
│                              ▼                                      │   │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │  supabase-admin.ts (getAdminClient)                          │   │
│  │  1. JWT Supabase (se valido) → RLS attiva                    │   │
│  │  2. Fallback service_role (bypassa RLS)                      │   │
│  │  3. Fallback anon key (policy permissive)                    │   │
│  └──────────────────────────┬──────────────────────────────────┘   │
└──────────────────────────────┬──────────────────────────────────────┘
                               │
                               ▼
                    (connessione a Supabase sopra)
```

---

## 9. CRITICITÀ RIEPILOGATIVE

### 9.1 Criticità critiche (bloccanti)

1. **`app_state` SELECT `USING(true)`** — chiunque con anon key legge tutti i dati di tutti gli utenti
2. **Tabelle FASE C con emergency fix `USING(true)`** — se `supabase-rls-disable-emergency.sql` è stato eseguito, accesso totale
3. **Doppia fonte di verità** — `app_state` JSON blob + tabelle FASE C con stessi dati
4. **`beatport_snapshots` + `beatport_chart_history` RLS disabilitata** — route senza auth possono scrivere

### 9.2 Criticità alte

5. **`agent_memory` policy `USING(true)`** — espone memoria AI con dettagli bug
6. **Chiave `user_email` TEXT invece di `user_id` UUID** su tutte le tabelle FASE C — no FK a auth.users, RLS fragile
7. **`getAdminClient` fallback service_role/anon** — bypassa RLS
8. **Race condition boot** — `loadFromCloud` + `loadFromNewTables` concorrenti

### 9.3 Criticità medie

9. **`followed_artists` orfana + RLS disabilitata** — tabella inutile, rischio sicurezza
10. **`beta_feedback` INSERT anonima** — spam possibile
11. **`push_subscriptions` policy partial** — mancano INSERT/UPDATE/DELETE esplicite
12. **`v_beta_tester_status` eredita policy permissive** — espone dati via view
13. **Nessuna FK enforced** — relazioni logiche non garantite a livello database
14. **`gmailAuth` solo in app_state** — nessuna tabella dedicata, rischio perdita

### 9.4 Criticità basse

15. **`beta_access_codes` RLS corretta** — unica tabella ben protetta
16. **Script SQL senza migration framework** — 10+ file `.sql` applicati manualmente, ordine non tracciato

---

## 10. NOTE METODOLOGICHE

- Questo documento è basato esclusivamente su analisi statica del codice e dei file SQL nel repository
- Lo stato reale del database potrebbe differire (script applicati in ordine diverso, modifiche via SQL Editor non tracciate)
- Per verificare lo stato reale delle policy RLS, eseguire:
  ```sql
  SELECT tablename, rowsecurity, policyname, cmd, qual, with_check
  FROM pg_tables t
  LEFT JOIN pg_policies p ON p.tablename = t.tablename
  WHERE t.schemaname = 'public'
  ORDER BY t.tablename, p.cmd;
  ```
- Per verificare i conteggi righe reali, eseguire le query del punto 0.5 del `LABELPULSE_REFACTORING_PLAN_v1.0.md`

---

**Fine del documento.**

Nessuna modifica al codice. Nessuna modifica al database. Nessuna migration creata. Solo analisi e documentazione.
