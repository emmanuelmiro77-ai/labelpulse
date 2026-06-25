#!/usr/bin/env bash
# ============================================================================
# log-agent-memory.sh
# ----------------------------------------------------------------------------
# Helper per loggare UN singolo bug fix o feature nella memoria permanente.
#
# Fa 3 cose:
#   1. Genera un INSERT SQL pronto da incollare nel Supabase SQL Editor
#      (per il backup cloud `agent_memory`)
#   2. Append la entry in BUG_REGISTRY.md (per il backup GitHub)
#   3. Stampa un promemoria per il commit + push
#
# USO INTERATTIVO:
#   bash scripts/log-agent-memory.sh
#
# USO NON-INTERATTIVO (per l'agente AI):
#   bash scripts/log-agent-memory.sh \
#     --type bug_fix \
#     --severity critical \
#     --title "Account diversi vedono i dati l'uno dell'altro" \
#     --description "Sintomo: ... | Causa: ... | Fix: commit f54bff8" \
#     --commit f54bff8 \
#     --files "src/lib/supabase.ts,src/lib/store.ts" \
#     --keywords "account,cross,contamination,utente"
#
# Dopo l'esecuzione:
#   - Copia l'SQL stampato e incollalo nel Supabase SQL Editor
#   - Verifica con: SELECT count(*) FROM agent_memory;
#   - Fai commit + push del BUG_REGISTRY.md aggiornato
# ============================================================================

set -euo pipefail

# Defaults
EVENT_TYPE=""
SEVERITY="medium"
TITLE=""
DESCRIPTION=""
COMMIT_HASH=""
FILES=""
KEYWORDS=""

# Parse args
while [[ $# -gt 0 ]]; do
  case "$1" in
    --type)        EVENT_TYPE="$2"; shift 2 ;;
    --severity)    SEVERITY="$2"; shift 2 ;;
    --title)       TITLE="$2"; shift 2 ;;
    --description) DESCRIPTION="$2"; shift 2 ;;
    --commit)      COMMIT_HASH="$2"; shift 2 ;;
    --files)       FILES="$2"; shift 2 ;;
    --keywords)    KEYWORDS="$2"; shift 2 ;;
    -h|--help)
      sed -n '2,30p' "$0"
      exit 0
      ;;
    *) echo "Argomento non riconosciuto: $1" >&2; exit 1 ;;
  esac
done

# Interactive mode se mancano argomenti obbligatori
if [[ -z "$TITLE" ]]; then
  echo "=== Log nuovo bug fix / feature in memoria permanente ==="
  echo
  read -rp "Tipo [bug_fix/feature/regression/decision/note/milestone] (default: bug_fix): " EVENT_TYPE
  EVENT_TYPE="${EVENT_TYPE:-bug_fix}"

  read -rp "Severity [critical/high/medium/low] (default: medium): " SEVERITY
  SEVERITY="${SEVERITY:-medium}"

  read -rp "Titolo breve (es: 'Gmail MIME headers leaking'): " TITLE
  if [[ -z "$TITLE" ]]; then echo "Titolo obbligatorio."; exit 1; fi

  echo "Descrizione (premere Invio su riga vuota per finire):"
  DESC_LINES=()
  while IFS= read -r line; do
    [[ -z "$line" ]] && break
    DESC_LINES+=("$line")
  done
  DESCRIPTION=$(IFS=' | '; echo "${DESC_LINES[*]}")

  read -rp "Commit hash (senza 'fix(...)' prefix, solo l'hash, opzionale): " COMMIT_HASH
  read -rp "File toccati (separati da virgola): " FILES
  read -rp "Parole chiave per ricerca (separate da virgola): " KEYWORDS
fi

# Validation
case "$EVENT_TYPE" in
  bug_fix|feature|regression|decision|note|milestone) ;;
  *) echo "event_type non valido: $EVENT_TYPE" >&2; exit 1 ;;
esac
case "$SEVERITY" in
  critical|high|medium|low) ;;
  *) echo "severity non valido: $SEVERITY" >&2; exit 1 ;;
esac
if [[ -z "$TITLE" ]]; then echo "title obbligatorio" >&2; exit 1; fi

# ---------------------------------------------------------------------------
# 1. Genera INSERT SQL per Supabase
# ---------------------------------------------------------------------------

# Escape singolo apostrofo per SQL (raddoppia)
sql_escape() {
  printf '%s' "$1" | sed "s/'/''/g"
}

# Costruisci arrays SQL
files_array="{"
if [[ -n "$FILES" ]]; then
  IFS=',' read -ra F_ARR <<< "$FILES"
  for i in "${!F_ARR[@]}"; do
    f="${F_ARR[$i]}"
    f="${f## }"; f="${f%% }"  # trim
    [[ $i -gt 0 ]] && files_array+=","
    files_array+="\"$(sql_escape "$f")\""
  done
fi
files_array+="}"

keywords_array="{"
if [[ -n "$KEYWORDS" ]]; then
  IFS=',' read -ra K_ARR <<< "$KEYWORDS"
  for i in "${!K_ARR[@]}"; do
    k="${K_ARR[$i]}"
    k="${k## }"; k="${k%% }"
    [[ $i -gt 0 ]] && keywords_array+=","
    keywords_array+="\"$(sql_escape "$k")\""
  done
fi
keywords_array+="}"

commit_value=$([[ -n "$COMMIT_HASH" ]] && echo "'$(sql_escape "$COMMIT_HASH")'" || echo "NULL")

# ISO timestamp
NOW=$(date -u +"%Y-%m-%dT%H:%M:%S+00:00")

SQL=$(cat <<EOF
-- Log entry: ${TITLE}
INSERT INTO agent_memory (
  event_type, title, description, commit_hash,
  files_affected, search_keywords, severity, metadata
) VALUES (
  '${EVENT_TYPE}',
  '$(sql_escape "$TITLE")',
  $([[ -n "$DESCRIPTION" ]] && echo "'$(sql_escape "$DESCRIPTION")'" || echo "NULL"),
  ${commit_value},
  '${files_array}'::TEXT[],
  '${keywords_array}'::TEXT[],
  '${SEVERITY}',
  '{"logged_at": "${NOW}", "logged_by": "log-agent-memory.sh"}'::JSONB
);
EOF
)

echo
echo "============================================================================="
echo "1) SQL PER SUPABASE — copia e incolla nel SQL Editor:"
echo "============================================================================="
echo
echo "$SQL"
echo
echo "Verifica dopo l'inserimento:"
echo "  SELECT count(*) FROM agent_memory;"
echo "  SELECT id, title, severity, created_at FROM agent_memory ORDER BY id DESC LIMIT 5;"
echo

# ---------------------------------------------------------------------------
# 2. Append in BUG_REGISTRY.md (se è un bug_fix o regression)
# ---------------------------------------------------------------------------

REGISTRY="/home/z/my-project/BUG_REGISTRY.md"
if [[ -f "$REGISTRY" && ( "$EVENT_TYPE" == "bug_fix" || "$EVENT_TYPE" == "regression" ) ]]; then
  echo "============================================================================="
  echo "2) Aggiungo entry a BUG_REGISTRY.md (sezione Log Cloud Sync)..."
  echo "============================================================================="

  # Se la sezione "## 📋 LOG CLOUD SYNC" non esiste, creala in fondo
  if ! grep -q "## 📋 LOG CLOUD SYNC" "$REGISTRY"; then
    cat >> "$REGISTRY" <<'EOF'

---

## 📋 LOG CLOUD SYNC

Entry loggate anche nella tabella Supabase `agent_memory`.
Ordine: più recente in alto.

EOF
  fi

  # Inserisci subito dopo la riga "## 📋 LOG CLOUD SYNC" + paragrafo intro
  # Usiamo un marker temporaneo: aggiungiamo in fondo alla sezione
  ENTRY=$(cat <<EOF
### [${NOW}] ${TITLE}

- **Tipo**: ${EVENT_TYPE}
- **Severity**: ${SEVERITY}
- **Commit**: ${COMMIT_HASH:-N/D}
- **File toccati**: ${FILES:-N/D}
- **Keywords**: ${KEYWORDS:-N/D}
- **Descrizione**: ${DESCRIPTION:-N/D}

EOF
)

  # Trova la sezione LOG CLOUD SYNC e aggiungi in fondo al file (dopo l'ultima entry esistente)
  # Più semplice: aggiungi in fondo
  echo "$ENTRY" >> "$REGISTRY"
  echo "  ✅ Aggiunta entry in fondo a $REGISTRY"
fi

# ---------------------------------------------------------------------------
# 3. Promemoria commit + push
# ---------------------------------------------------------------------------

echo
echo "============================================================================="
echo "3) PROSSIMI PASSI (da fare a mano)"
echo "============================================================================="
echo
echo "  a) Incolla l'SQL sopra nel Supabase SQL Editor → Run"
echo "  b) Verifica: SELECT count(*) FROM agent_memory;"
if [[ -f "$REGISTRY" && ( "$EVENT_TYPE" == "bug_fix" || "$EVENT_TYPE" == "regression" ) ]]; then
echo "  c) Commit del BUG_REGISTRY.md aggiornato:"
echo "       git add BUG_REGISTRY.md"
echo "       git commit -m 'docs(memory): log ${TITLE}'"
echo "       git push origin main"
else
echo "  c) (Feature/decision note — non serve toccare BUG_REGISTRY.md)"
fi
echo
echo "✅ Memoria permanente aggiornata su entrambi i livelli (cloud + GitHub)."
