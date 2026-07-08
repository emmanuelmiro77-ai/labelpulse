#!/bin/bash
# =====================================================================
# LABELPULSE — DATABASE BACKUP SCRIPT
# =====================================================================
# Esegue un backup completo del database Supabase usando pg_dump.
# NON utilizza SUPABASE_SERVICE_ROLE_KEY né VERCEL_TOKEN.
# Usa la connection string diretta PostgreSQL (da Supabase Dashboard).
#
# PREREQUISITI:
#   - postgresql-client installato (pg_dump + psql)
#   - Connection string PostgreSQL da Supabase Dashboard
#     (Project Settings → Database → Connection string)
#
# UTILIZZO:
#   ./scripts/backup-database.sh "postgresql://postgres:[PASSWORD]@db.[REF].supabase.co:5432/postgres"
#
#   Oppure con variabile d'ambiente:
#   export SUPABASE_DB_URL="postgresql://postgres:[PASSWORD]@db.[REF].supabase.co:5432/postgres"
#   ./scripts/backup-database.sh
#
# OUTPUT:
#   docs/architecture/backups/
#   ├── database-full-backup-YYYY-MM-DD-HHMMSS.sql.gz  (dump completo dati + schema)
#   ├── schema-only-YYYY-MM-DD-HHMMSS.sql               (solo struttura DDL)
#   ├── rls-policies-YYYY-MM-DD-HHMMSS.sql              (policy RLS)
#   ├── functions-triggers-YYYY-MM-DD-HHMMSS.sql        (funzioni + trigger)
#   ├── row-counts-YYYY-MM-DD-HHMMSS.json               (conteggi righe per tabella)
#   └── backup-manifest-YYYY-MM-DD-HHMMSS.txt           (manifest con hash + dimensioni)
# =====================================================================

set -euo pipefail

# ---------------------------------------------------------------------
# 0. Argomenti e variabili
# ---------------------------------------------------------------------

DB_URL="${1:-${SUPABASE_DB_URL:-}}"

if [ -z "$DB_URL" ]; then
  echo "❌ ERRORE: connection string mancante."
  echo ""
  echo "Utilizzo:"
  echo "  $0 \"postgresql://postgres:PASSWORD@db.REF.supabase.co:5432/postgres\""
  echo ""
  echo "Oppure imposta la variabile d'ambiente:"
  echo "  export SUPABASE_DB_URL=\"postgresql://...\""
  echo "  $0"
  echo ""
  echo "Ottieni la connection string da:"
  echo "  Supabase Dashboard → Project Settings → Database → Connection string"
  exit 1
fi

TIMESTAMP=$(date +"%Y-%m-%d-%H%M%S")
BACKUP_DIR="docs/architecture/backups"
mkdir -p "$BACKUP_DIR"

# File di output
FILE_FULL="${BACKUP_DIR}/database-full-backup-${TIMESTAMP}.sql.gz"
FILE_SCHEMA="${BACKUP_DIR}/schema-only-${TIMESTAMP}.sql"
FILE_RLS="${BACKUP_DIR}/rls-policies-${TIMESTAMP}.sql"
FILE_FUNCS="${BACKUP_DIR}/functions-triggers-${TIMESTAMP}.sql"
FILE_COUNTS="${BACKUP_DIR}/row-counts-${TIMESTAMP}.json"
FILE_MANIFEST="${BACKUP_DIR}/backup-manifest-${TIMESTAMP}.txt"

echo "============================================================"
echo "  LABELPULSE — DATABASE BACKUP"
echo "  Timestamp: ${TIMESTAMP}"
echo "============================================================"
echo ""

# ---------------------------------------------------------------------
# 1. Verifica prerequisiti
# ---------------------------------------------------------------------

echo "[1/6] Verifica prerequisiti..."

if ! command -v pg_dump &> /dev/null; then
  echo "❌ pg_dump non trovato. Installa postgresql-client:"
  echo "   sudo apt-get update && sudo apt-get install -y postgresql-client"
  exit 1
fi

if ! command -v psql &> /dev/null; then
  echo "❌ psql non trovato. Installa postgresql-client:"
  echo "   sudo apt-get update && sudo apt-get install -y postgresql-client"
  exit 1
fi

PG_VERSION=$(pg_dump --version | grep -oP '\d+' | head -1)
echo "   ✅ pg_dump versione: ${PG_VERSION}"
echo "   ✅ psql disponibile"
echo ""

# ---------------------------------------------------------------------
# 2. Backup completo (dati + schema) compresso
# ---------------------------------------------------------------------

echo "[2/6] Backup completo database (dati + schema)..."
echo "   File: ${FILE_FULL}"

pg_dump \
  --dbname="$DB_URL" \
  --no-owner \
  --no-privileges \
  --format=plain \
  --compress=9 \
  > "$FILE_FULL" 2> "${BACKUP_DIR}/.backup-errors-${TIMESTAMP}.log"

if [ $? -eq 0 ]; then
  FILESIZE=$(du -h "$FILE_FULL" | cut -f1)
  echo "   ✅ Completato (${FILESIZE})"
else
  echo "   ❌ Errore durante il backup. Vedi ${BACKUP_DIR}/.backup-errors-${TIMESTAMP}.log"
  cat "${BACKUP_DIR}/.backup-errors-${TIMESTAMP}.log"
  exit 1
fi
echo ""

# ---------------------------------------------------------------------
# 3. Backup solo schema (DDL senza dati)
# ---------------------------------------------------------------------

echo "[3/6] Backup schema (solo struttura DDL)..."
echo "   File: ${FILE_SCHEMA}"

pg_dump \
  --dbname="$DB_URL" \
  --no-owner \
  --no-privileges \
  --schema-only \
  > "$FILE_SCHEMA" 2>> "${BACKUP_DIR}/.backup-errors-${TIMESTAMP}.log"

if [ $? -eq 0 ]; then
  FILESIZE=$(du -h "$FILE_SCHEMA" | cut -f1)
  echo "   ✅ Completato (${FILESIZE})"
else
  echo "   ❌ Errore. Vedi log."
  exit 1
fi
echo ""

# ---------------------------------------------------------------------
# 4. Esportazione policy RLS
# ---------------------------------------------------------------------

echo "[4/6] Esportazione policy RLS..."
echo "   File: ${FILE_RLS}"

psql \
  "$DB_URL" \
  --no-align \
  --tuples-only \
  --field-separator='|' \
  --command="
    SELECT
      '-- Tabella: ' || tablename || ' -- Policy: ' || policyname || ' -- Cmd: ' || cmd,
      '',
      'DROP POLICY IF EXISTS \"' || policyname || '\" ON ' || schemaname || '.' || tablename || ';',
      'CREATE POLICY \"' || policyname || '\" ON ' || schemaname || '.' || tablename ||
        ' FOR ' || cmd ||
        CASE WHEN qual IS NOT NULL THEN ' USING (' || qual || ')' ELSE '' END ||
        CASE WHEN with_check IS NOT NULL THEN ' WITH CHECK (' || with_check || ')' ELSE '' END ||
        ';'
    FROM pg_policies
    WHERE schemaname = 'public'
    ORDER BY tablename, cmd;
  " \
  > "$FILE_RLS" 2>> "${BACKUP_DIR}/.backup-errors-${TIMESTAMP}.log"

if [ $? -eq 0 ]; then
  FILESIZE=$(du -h "$FILE_RLS" | cut -f1)
  POLICY_COUNT=$(grep -c "CREATE POLICY" "$FILE_RLS" 2>/dev/null || echo "0")
  echo "   ✅ Completato (${FILESIZE}, ${POLICY_COUNT} policy)"
else
  echo "   ⚠️ Errore o nessuna policy. File potrebbe essere vuoto."
fi
echo ""

# ---------------------------------------------------------------------
# 5. Esportazione funzioni e trigger
# ---------------------------------------------------------------------

echo "[5/6] Esportazione funzioni e trigger..."
echo "   File: ${FILE_FUNCS}"

psql \
  "$DB_URL" \
  --no-align \
  --tuples-only \
  --command="
    -- Funzioni
    SELECT '-- Funzione: ' || routine_name;
    SELECT pg_get_functiondef(p.oid)
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
    ORDER BY p.proname;

    -- Trigger
    SELECT '';
    SELECT '-- Trigger: ' || tgname || ' su ' || c.relname;
    SELECT pg_get_triggerdef(oid)
    FROM pg_trigger
    WHERE tgnamespace = (SELECT oid FROM pg_namespace WHERE nspname = 'public')
      AND NOT tgisinternal
    ORDER BY tgname;
  " \
  > "$FILE_FUNCS" 2>> "${BACKUP_DIR}/.backup-errors-${TIMESTAMP}.log"

if [ $? -eq 0 ]; then
  FILESIZE=$(du -h "$FILE_FUNCS" | cut -f1)
  FUNC_COUNT=$(grep -c "CREATE OR REPLACE FUNCTION" "$FILE_FUNCS" 2>/dev/null || echo "0")
  TRIGGER_COUNT=$(grep -c "CREATE TRIGGER" "$FILE_FUNCS" 2>/dev/null || echo "0")
  echo "   ✅ Completato (${FILESIZE}, ${FUNC_COUNT} funzioni, ${TRIGGER_COUNT} trigger)"
else
  echo "   ⚠️ Errore o nessuna funzione/trigger. File potrebbe essere vuoto."
fi
echo ""

# ---------------------------------------------------------------------
# 6. Conteggi righe per tabella
# ---------------------------------------------------------------------

echo "[6/6] Conteggi righe per tabella..."
echo "   File: ${FILE_COUNTS}"

psql \
  "$DB_URL" \
  --no-align \
  --tuples-only \
  --field-separator=':' \
  --command="
    SELECT jsonb_object_agg(tablename, cnt)
    FROM (
      SELECT schemaname || '.' || tablename as tablename,
             (xpath('/row/c/text()', query_to_xml('SELECT COUNT(*) as c FROM ' || schemaname || '.' || tablename, true, true, '')))[1]::text::bigint as cnt
      FROM pg_tables
      WHERE schemaname = 'public'
      ORDER BY tablename
    ) t;
  " \
  > "$FILE_COUNTS" 2>> "${BACKUP_DIR}/.backup-errors-${TIMESTAMP}.log"

if [ $? -eq 0 ]; then
  FILESIZE=$(du -h "$FILE_COUNTS" | cut -f1)
  TABLE_COUNT=$(python3 -c "import json; print(len(json.load(open('$FILE_COUNTS'))))" 2>/dev/null || echo "?")
  echo "   ✅ Completato (${FILESIZE}, ${TABLE_COUNT} tabelle)"
else
  echo "   ⚠️ Errore conteggi. Tentativo con query alternativa..."

  # Fallback: query tabella per tabella
  psql \
    "$DB_URL" \
    --no-align \
    --tuples-only \
    --field-separator='|' \
    --command="
      SELECT 'app_state', COUNT(*) FROM app_state
      UNION ALL SELECT 'demo_submissions', COUNT(*) FROM demo_submissions
      UNION ALL SELECT 'label_personal_data', COUNT(*) FROM label_personal_data
      UNION ALL SELECT 'pitch_campaigns', COUNT(*) FROM pitch_campaigns
      UNION ALL SELECT 'user_profiles', COUNT(*) FROM user_profiles
      UNION ALL SELECT 'user_releases', COUNT(*) FROM user_releases
      UNION ALL SELECT 'push_subscriptions', COUNT(*) FROM push_subscriptions
      UNION ALL SELECT 'beatport_snapshots', COUNT(*) FROM beatport_snapshots
      UNION ALL SELECT 'beatport_chart_history', COUNT(*) FROM beatport_chart_history
      UNION ALL SELECT 'followed_artists', COUNT(*) FROM followed_artists
      UNION ALL SELECT 'beta_feedback', COUNT(*) FROM beta_feedback
      UNION ALL SELECT 'beta_access_codes', COUNT(*) FROM beta_access_codes
      UNION ALL SELECT 'agent_memory', COUNT(*) FROM agent_memory
      ORDER BY 1;
    " \
    > "${FILE_COUNTS}.csv" 2>> "${BACKUP_DIR}/.backup-errors-${TIMESTAMP}.log"

  if [ $? -eq 0 ]; then
    echo "   ✅ Fallback completato (formato CSV: ${FILE_COUNTS}.csv)"
  else
    echo "   ❌ Errore anche con fallback."
  fi
fi
echo ""

# ---------------------------------------------------------------------
# 7. Manifest con hash e dimensioni
# ---------------------------------------------------------------------

echo "Generazione manifest..."

{
  echo "============================================================"
  echo "  LABELPULSE BACKUP MANIFEST"
  echo "  Timestamp: ${TIMESTAMP}"
  echo "  Date: $(date -u +"%Y-%m-%dT%H:%M:%SZ")"
  echo "============================================================"
  echo ""
  echo "File generati:"
  echo ""

  for f in "$FILE_FULL" "$FILE_SCHEMA" "$FILE_RLS" "$FILE_FUNCS" "$FILE_COUNTS"; do
    if [ -f "$f" ]; then
      SIZE=$(du -h "$f" | cut -f1)
      SHA256=$(sha256sum "$f" | cut -d' ' -f1)
      LINES=$(wc -l < "$f" 2>/dev/null || echo "N/A")
      echo "  File: $(basename "$f")"
      echo "  Size: ${SIZE}"
      echo "  Lines: ${LINES}"
      echo "  SHA256: ${SHA256}"
      echo ""
    fi
  done

  echo "Note:"
  echo "  - Il backup completo (${FILE_FULL}) contiene dati + schema"
  echo "  - Lo schema-only (${FILE_SCHEMA}) contiene solo DDL"
  echo "  - Le policy RLS (${FILE_RLS}) sono istruzioni CREATE POLICY"
  echo "  - Le funzioni (${FILE_FUNCS}) sono definizioni complete"
  echo "  - I conteggi (${FILE_COUNTS}) servono per verifica post-migrazione"
  echo ""
  echo "Per ripristinare:"
  echo "  gunzip -c $(basename "$FILE_FULL") | psql \"\$DB_URL\""
  echo ""
} > "$FILE_MANIFEST"

echo "   ✅ Manifest: ${FILE_MANIFEST}"

# ---------------------------------------------------------------------
# 8. Pulizia file temporanei
# ---------------------------------------------------------------------

rm -f "${BACKUP_DIR}/.backup-errors-${TIMESTAMP}.log" 2>/dev/null || true

# ---------------------------------------------------------------------
# 9. Riepilogo
# ---------------------------------------------------------------------

echo ""
echo "============================================================"
echo "  BACKUP COMPLETATO"
echo "============================================================"
echo ""
echo "File generati in ${BACKUP_DIR}/:"
echo ""
ls -lh ${BACKUP_DIR}/*-${TIMESTAMP}* 2>/dev/null | awk '{print "  " $NF " (" $5 ")"}'
echo ""
echo "Manifest: ${FILE_MANIFEST}"
echo ""
echo "⚠️  VERIFICA IL BACKUP prima di procedere:"
echo "   ./scripts/verify-backup.sh ${TIMESTAMP}"
echo ""
echo "⚠️  I file di backup sono nel .gitignore e NON vengono committati."
echo ""
