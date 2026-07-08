# BACKUP PROCEDURE — LabelPulse Database

Procedura di backup manuale del database Supabase, da eseguire prima di ogni modifica strutturale (Fasi 1, 7 del refactoring).

**Vincoli:**
- Piano Free Supabase (no backup management da Dashboard)
- Nessun uso di `SUPABASE_SERVICE_ROLE_KEY`
- Nessun uso di `VERCEL_TOKEN`
- Usa `pg_dump` + `psql` con connection string diretta PostgreSQL

---

## 1. PREREQUISITI

### 1.1 Installare postgresql-client

```bash
sudo apt-get update && sudo apt-get install -y postgresql-client
```

Verificare:
```bash
pg_dump --version
psql --version
```

Richiesto PostgreSQL client versione 14+ (Supabase usa PostgreSQL 15).

### 1.2 Ottenere la connection string

1. Vai su https://supabase.com/dashboard
2. Seleziona il progetto LabelPulse
3. Project Settings → Database
4. Sezione "Connection string"
5. Scegli **Session mode** (porta 5432) — preferita per `pg_dump`
6. Copia la stringa (formato: `postgresql://postgres.[REF]:[PASSWORD]@aws-0-[REGION].pooler.supabase.com:5432/postgres`)

⚠️ **NON usare la service_role key.** La connection string usa la password del database, non le API key.

⚠️ **NON committare la connection string.** Contiene la password del database.

---

## 2. ESECUZIONE DEL BACKUP

### 2.1 Script principale

```bash
cd /home/z/my-project

# Opzione A: passa la connection string come argomento
./scripts/backup-database.sh "postgresql://postgres.[REF]:[PASSWORD]@aws-0-[REGION].pooler.supabase.com:5432/postgres"

# Opzione B: usa variabile d'ambiente
export SUPABASE_DB_URL="postgresql://postgres.[REF]:[PASSWORD]@aws-0-[REGION].pooler.supabase.com:5432/postgres"
./scripts/backup-database.sh
```

### 2.2 File generati

Lo script crea 6 file in `docs/architecture/backups/`:

| File | Contenuto | Scopo |
|------|-----------|-------|
| `database-full-backup-<TS>.sql.gz` | Dump completo (dati + schema) compresso | Ripristino completo in caso di disastro |
| `schema-only-<TS>.sql` | Solo struttura DDL (CREATE TABLE, indici, vincoli) | Documentazione struttura |
| `rls-policies-<TS>.sql` | Istruzioni CREATE POLICY per ogni policy RLS | Ripristino policy RLS |
| `functions-triggers-<TS>.sql` | Definizioni funzioni + trigger PostgreSQL | Ripristino logica database |
| `row-counts-<TS>.json` | Conteggio righe per ogni tabella | Verifica integrità post-migrazione |
| `backup-manifest-<TS>.txt` | Hash SHA256 + dimensioni di ogni file | Verifica integrità backup |

Tutti i file hanno timestamp nel nome per evitare sovrascritture.

### 2.3 Directory di output

I backup vengono salvati in `docs/architecture/backups/`, che è nel `.gitignore`:
```
docs/architecture/backups/
```

I backup NON vengono committati nel repository (contengono dati sensibili).

---

## 3. VERIFICA DEL BACKUP

Dopo il backup, eseguire SEMPRE la verifica:

```bash
# Verifica un backup specifico
./scripts/verify-backup.sh 2026-07-08-143022

# Verifica l'ultimo backup
./scripts/verify-backup.sh latest
```

Lo script verifica:
1. ✅ Tutti i 6 file esistono
2. ✅ Nessun file è vuoto
3. ✅ Il backup completo è decomprimibile e contiene CREATE TABLE + dati
4. ✅ Gli hash SHA256 corrispondono al manifest
5. ✅ I conteggi righe sono in formato JSON valido e leggibili

**Risultato:**
- `✅ BACKUP VALIDO` → puoi procedere
- `⚠️ BACKUP PARZIALMENTE VALIDO` → verifica i warning manualmente
- `❌ BACKUP NON VALIDO` → NON procedere, rifai il backup

---

## 4. RIPRISTINO (in caso di disastro)

### 4.1 Ripristino completo

```bash
# Decomprimi e ripristina tutto
gunzip -c docs/architecture/backups/database-full-backup-<TS>.sql.gz | psql "$SUPABASE_DB_URL"
```

⚠️ Il ripristino sovrascrive tutti i dati esistenti. Usare solo in caso di disastro.

### 4.2 Ripristino solo policy RLS

```bash
psql "$SUPABASE_DB_URL" -f docs/architecture/backups/rls-policies-<TS>.sql
```

### 4.3 Ripristino solo funzioni/trigger

```bash
psql "$SUPABASE_DB_URL" -f docs/architecture/backups/functions-triggers-<TS>.sql
```

---

## 5. QUANDO ESEGUIRE IL BACKUP

Il backup DEVE essere eseguito prima di ogni fase del refactoring che modifica il database:

| Fase | Modifica database | Backup obbligatorio? |
|------|-------------------|---------------------|
| Fase 0 | Nessuna (solo backup) | ✅ È la fase stessa |
| Fase 0.5 | Policy RLS su snapshot tables | ✅ Sì |
| Fase 1 | Aggiunta user_id + nuove RLS | ✅ Sì (critico) |
| Fase 2 | Policy app_state finale | ✅ Sì |
| Fase 3 | Nessuna | ⚠️ Consigliato |
| Fase 4 | Nessuna | ⚠️ Consigliato |
| Fase 5 | Nessuna | ⚠️ Consigliato |
| Fase 5.5 | Nessuna | ⚠️ Consigliato |
| Fase 6 | Nessuna | ⚠️ Consigliato |
| Fase 7 | audit_log + trigger + DROP followed_artists + DELETE app_state default | ✅ Sì (critico) |

**Regola:** se la fase modifica il database (schema, RLS, funzioni, dati), il backup è obbligatorio. Se la fase modifica solo codice, il backup è consigliato (per rollback completo).

---

## 6. SICUREZZA

### 6.1 Connection string

- La connection string contiene la password del database → NON committarla
- NON salvarla in file nel repository
- NON incollarla in chat permanenti
- Passala come argomento o variabile d'ambiente temporanea
- Dopo il backup, cancella la variabile: `unset SUPABASE_DB_URL`

### 6.2 File di backup

- Contengono dati reali degli utenti → NON committarli
- `.gitignore` esclude `docs/architecture/backups/`
- Verificare che i backup NON appaiano in `git status`
- Per condivisione sicura: crittografare con `gpg` prima del trasferimento

### 6.3 Conservazione

- Conservare almeno 2 backup recenti (pre-Fase 1 e pre-Fase 7)
- Conservare il backup per almeno 30 giorni dopo il completamento del refactoring
- Eliminare i backup obsoleti per non accumulare dati sensibili

---

## 7. TROUBLESHOOTING

### Errore: "pg_dump not found"
```bash
sudo apt-get update && sudo apt-get install -y postgresql-client
```

### Errore: "connection refused"
- Verifica che la connection string usi la porta corretta (5432 per Session mode, 6543 per Transaction mode)
- `pg_dump` preferisce Session mode (porta 5432)

### Errore: "authentication failed"
- Verifica la password del database (non le API key)
- La password è in Supabase Dashboard → Project Settings → Database → Database password

### Errore: "version mismatch"
- `pg_dump` deve essere versione 14+ per Supabase (PostgreSQL 15)
- Se hai una versione vecchia: `sudo apt-get install postgresql-client-15`

### Backup troppo grande
- Il backup compresso (`.sql.gz`) è tipicamente 5-10x più piccolo dell'originale
- Se il backup è > 50MB, verificare che non includa tabelle di log non necessarie
- Lo script usa `--compress=9` per massima compressione

---

## 8. CHECKLIST PRE-MODIFICA

Prima di ogni fase che modifica il database:

- [ ] 1. `pg_dump --version` restituisce 14+
- [ ] 2. Connection string ottenuta da Supabase Dashboard
- [ ] 3. `./scripts/backup-database.sh "$SUPABASE_DB_URL"` completato senza errori
- [ ] 4. `./scripts/verify-backup.sh latest` restituisce "BACKUP VALIDO"
- [ ] 5. `git status` non mostra file in `docs/architecture/backups/` (gitignore attivo)
- [ ] 6. Backup conservato in posizione sicura
- [ ] 7. `unset SUPABASE_DB_URL` (cancella la password dalla sessione)

Solo dopo tutti i check ✅, procedere con la fase.
