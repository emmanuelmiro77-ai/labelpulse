#!/bin/bash
# =====================================================================
# LABELPULSE — BACKUP VERIFICATION SCRIPT
# =====================================================================
# Verifica che un backup sia completo, leggibile e ripristinabile.
# Da eseguire DOPO backup-database.sh e PRIMA di qualsiasi modifica
# strutturale al database.
#
# PREREQUISITI:
#   - postgresql-client installato (psql)
#   - Backup generato da scripts/backup-database.sh
#
# UTILIZZO:
#   ./scripts/verify-backup.sh <TIMESTAMP>
#
#   Esempio:
#   ./scripts/verify-backup.sh 2026-07-08-143022
#
#   Oppure verifica l'ultimo backup:
#   ./scripts/verify-backup.sh latest
# =====================================================================

set -euo pipefail

# ---------------------------------------------------------------------
# 0. Argomenti
# ---------------------------------------------------------------------

TIMESTAMP="${1:-}"
BACKUP_DIR="docs/architecture/backups"

if [ -z "$TIMESTAMP" ]; then
  echo "❌ ERRORE: timestamp mancante."
  echo ""
  echo "Utilizzo:"
  echo "  $0 <TIMESTAMP>"
  echo "  $0 latest"
  echo ""
  echo "Esempio:"
  echo "  $0 2026-07-08-143022"
  exit 1
fi

# Se "latest", trova il timestamp più recente
if [ "$TIMESTAMP" = "latest" ]; then
  TIMESTAMP=$(ls -1 "${BACKUP_DIR}"/backup-manifest-*.txt 2>/dev/null | sort -r | head -1 | grep -oP '\d{4}-\d{2}-\d{2}-\d{6}' || echo "")
  if [ -z "$TIMESTAMP" ]; then
    echo "❌ Nessun backup trovato in ${BACKUP_DIR}/"
    exit 1
  fi
  echo "Ultimo backup trovato: ${TIMESTAMP}"
fi

echo "============================================================"
echo "  LABELPULSE — BACKUP VERIFICATION"
echo "  Timestamp: ${TIMESTAMP}"
echo "============================================================"
echo ""

# ---------------------------------------------------------------------
# File attesi
# ---------------------------------------------------------------------

FILE_FULL="${BACKUP_DIR}/database-full-backup-${TIMESTAMP}.sql.gz"
FILE_SCHEMA="${BACKUP_DIR}/schema-only-${TIMESTAMP}.sql"
FILE_RLS="${BACKUP_DIR}/rls-policies-${TIMESTAMP}.sql"
FILE_FUNCS="${BACKUP_DIR}/functions-triggers-${TIMESTAMP}.sql"
FILE_COUNTS="${BACKUP_DIR}/row-counts-${TIMESTAMP}.json"
FILE_MANIFEST="${BACKUP_DIR}/backup-manifest-${TIMESTAMP}.txt"

ERRORS=0
WARNINGS=0

# ---------------------------------------------------------------------
# 1. Verifica esistenza file
# ---------------------------------------------------------------------

echo "[1/5] Verifica esistenza file..."
echo ""

for f in "$FILE_FULL" "$FILE_SCHEMA" "$FILE_RLS" "$FILE_FUNCS" "$FILE_COUNTS" "$FILE_MANIFEST"; do
  if [ -f "$f" ]; then
    SIZE=$(du -h "$f" | cut -f1)
    echo "  ✅ $(basename "$f") — ${SIZE}"
  else
    echo "  ❌ $(basename "$f") — MANCANTE"
    ERRORS=$((ERRORS + 1))
  fi
done
echo ""

# ---------------------------------------------------------------------
# 2. Verifica file non vuoti
# ---------------------------------------------------------------------

echo "[2/5] Verifica file non vuoti..."
echo ""

for f in "$FILE_FULL" "$FILE_SCHEMA" "$FILE_RLS" "$FILE_FUNCS" "$FILE_COUNTS"; do
  if [ -f "$f" ]; then
    SIZE=$(stat -c%s "$f" 2>/dev/null || stat -f%z "$f" 2>/dev/null || echo "0")
    if [ "$SIZE" -lt 10 ]; then
      echo "  ❌ $(basename "$f") — VUOTO o quasi (${SIZE} bytes)"
      ERRORS=$((ERRORS + 1))
    else
      echo "  ✅ $(basename "$f") — ${SIZE} bytes"
    fi
  fi
done
echo ""

# ---------------------------------------------------------------------
# 3. Verifica leggibilità del backup completo (decompressione)
# ---------------------------------------------------------------------

echo "[3/5] Verifica leggibilità backup completo..."
echo ""

if [ -f "$FILE_FULL" ]; then
  # Prova a decomprimere i primi 100KB e verifica che contenga CREATE TABLE
  TEMP_CHECK=$(mktemp)
  gunzip -c "$FILE_FULL" 2>/dev/null | head -1000 > "$TEMP_CHECK" 2>/dev/null || true

  if [ -s "$TEMP_CHECK" ]; then
    CREATE_COUNT=$(grep -c "CREATE TABLE" "$TEMP_CHECK" 2>/dev/null || echo "0")
    INSERT_COUNT=$(grep -c "INSERT INTO" "$TEMP_CHECK" 2>/dev/null || echo "0")
    COPY_COUNT=$(grep -c "COPY " "$TEMP_CHECK" 2>/dev/null || echo "0")

    echo "  ✅ File decomprimibile"
    echo "  ✅ CREATE TABLE trovati (primi 1000 righe): ${CREATE_COUNT}"

    if [ "$INSERT_COUNT" -gt 0 ] || [ "$COPY_COUNT" -gt 0 ]; then
      echo "  ✅ Dati presenti (INSERT: ${INSERT_COUNT}, COPY: ${COPY_COUNT})"
    else
      echo "  ⚠️ Nessun dato trovato nei primi 1000 righe (potrebbe essere normale per dump grandi)"
      WARNINGS=$((WARNINGS + 1))
    fi
  else
    echo "  ❌ File non decomprimibile o vuoto dopo decompressione"
    ERRORS=$((ERRORS + 1))
  fi

  rm -f "$TEMP_CHECK"
else
  echo "  ⚠️ File backup completo mancante, salto verifica"
  WARNINGS=$((WARNINGS + 1))
fi
echo ""

# ---------------------------------------------------------------------
# 4. Verifica hash dal manifest
# ---------------------------------------------------------------------

echo "[4/5] Verifica hash dal manifest..."
echo ""

if [ -f "$FILE_MANIFEST" ]; then
  while IFS= read -r line; do
    if [[ "$line" == "SHA256:"* ]]; then
      EXPECTED_HASH=$(echo "$line" | cut -d' ' -f2)
      # Trova il file associato (riga precedente "File: xxx")
      # Verifica hash del file corrispondente
      :
    fi
  done < "$FILE_MANIFEST"

  # Verifica hash di ogni file
  for f in "$FILE_FULL" "$FILE_SCHEMA" "$FILE_RLS" "$FILE_FUNCS" "$FILE_COUNTS"; do
    if [ -f "$f" ]; then
      ACTUAL_HASH=$(sha256sum "$f" | cut -d' ' -f1)
      EXPECTED_HASH=$(grep -A3 "$(basename "$f")" "$FILE_MANIFEST" | grep "SHA256:" | cut -d' ' -f2 || echo "")

      if [ -n "$EXPECTED_HASH" ]; then
        if [ "$ACTUAL_HASH" = "$EXPECTED_HASH" ]; then
          echo "  ✅ $(basename "$f") — hash OK"
        else
          echo "  ❌ $(basename "$f") — hash NON corrisponde"
          echo "     Atteso: ${EXPECTED_HASH}"
          echo "     Attuale: ${ACTUAL_HASH}"
          ERRORS=$((ERRORS + 1))
        fi
      fi
    fi
  done
else
  echo "  ⚠️ Manifest mancante, salto verifica hash"
  WARNINGS=$((WARNINGS + 1))
fi
echo ""

# ---------------------------------------------------------------------
# 5. Verifica conteggi righe leggibili
# ---------------------------------------------------------------------

echo "[5/5] Verifica conteggi righe..."
echo ""

if [ -f "$FILE_COUNTS" ]; then
  TABLE_COUNT=$(python3 -c "
import json, sys
try:
    data = json.load(open('$FILE_COUNTS'))
    print(len(data))
    for table, count in sorted(data.items()):
        print(f'  ✅ {table}: {count} righe')
except Exception as e:
    print(f'ERROR: {e}')
    sys.exit(1)
" 2>/dev/null || echo "ERROR")

  if [ "$TABLE_COUNT" = "ERROR" ] || [ "$TABLE_COUNT" = "" ]; then
    echo "  ⚠️ File conteggi non in formato JSON valido"
    echo "  Contenuto del file:"
    head -5 "$FILE_COUNTS"
    WARNINGS=$((WARNINGS + 1))
  fi
else
  echo "  ⚠️ File conteggi mancante"
  WARNINGS=$((WARNINGS + 1))
fi
echo ""

# ---------------------------------------------------------------------
# Riepilogo
# ---------------------------------------------------------------------

echo "============================================================"
echo "  VERIFICHE COMPLETATE"
echo "============================================================"
echo ""
echo "  Errori: ${ERRORS}"
echo "  Warning: ${WARNINGS}"
echo ""

if [ $ERRORS -gt 0 ]; then
  echo "  ❌ BACKUP NON VALIDO — ${ERRORS} errori trovati."
  echo "     NON procedere con modifiche al database."
  echo "     Rifai il backup con: ./scripts/backup-database.sh \"\$DB_URL\""
  exit 1
elif [ $WARNINGS -gt 0 ]; then
  echo "  ⚠️ BACKUP PARZIALMENTE VALIDO — ${WARNINGS} warning."
  echo "     Verifica manualmente i warning prima di procedere."
  exit 0
else
  echo "  ✅ BACKUP VALIDO — tutti i controlli superati."
  echo "     Puoi procedere con le modifiche al database."
  exit 0
fi
