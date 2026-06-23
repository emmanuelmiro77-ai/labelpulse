#!/usr/bin/env bash
# ============================================================
# LabelPulse - Verifica stato deploy Vercel
# ============================================================
#
# Usage:
#   ./scripts/verify-deploy.sh              # mostra ultimi 3 deploy
#   ./scripts/verify-deploy.sh <commit-sha> # cerca deploy per uno specifico commit
#
# Esce con:
#   0 = ultimo deploy READY
#   1 = ultimo deploy in stato ERROR/CANCELED
#   2 = deploy ancora in corso o non trovato
# ============================================================

set -euo pipefail

cd "$(git rev-parse --show-toplevel)"

ENV_FILE=".env.deploy"
if [[ ! -f "$ENV_FILE" ]]; then
  echo "❌ File $ENV_FILE non trovato. Vedi .env.deploy.example."
  exit 1
fi
# shellcheck disable=SC1090
source "$ENV_FILE"

if [[ -z "${VERCEL_TOKEN:-}" || -z "${VERCEL_PROJECT_ID:-}" ]]; then
  echo "❌ VERCEL_TOKEN o VERCEL_PROJECT_ID mancanti in $ENV_FILE"
  exit 1
fi

GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m'

# Query: ultimi 5 deploy
LIMIT=5
RESP=$(curl -sS \
  -H "Authorization: Bearer $VERCEL_TOKEN" \
  "https://api.vercel.com/v6/deployments?projectId=$VERCEL_PROJECT_ID&limit=$LIMIT&target=production")

echo ""
echo "📋 Ultimi $LIMIT deploy production:"
echo "================================"

STATE_COLOR="$RED"
EXIT_CODE=2

# Stampa la tabella
echo "$RESP" | jq -r '.deployments[] | [
  .state,
  (.createdAt | tonumber | if . > 1000000000000 then ./1000 | floor else . end | strftime("%Y-%m-%d %H:%M")),
  (.meta.gitCommitMessage // "—" | .[0:60]),
  (.meta.gitCommitSha // "—" | .[0:7]),
  .url
] | @tsv' | while IFS=$'\t' read -r state date msg sha url; do
  case "$state" in
    READY)    color="$GREEN" ;;
    ERROR|CANCELED) color="$RED" ;;
    *) color="$YELLOW" ;;
  esac
  printf "${color}%-10s${NC}  %s  %s  %s\n" "$state" "$date" "$sha" "$msg"
  printf "           🔗 https://%s\n" "$url"
done

# Stato finale (per exit code)
LATEST_STATE=$(echo "$RESP" | jq -r '.deployments[0].state // "UNKNOWN"')
case "$LATEST_STATE" in
  READY)                exit 0 ;;
  ERROR|CANCELED)       exit 1 ;;
  *)                    exit 2 ;;
esac
