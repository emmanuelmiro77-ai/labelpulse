#!/usr/bin/env bash
# ============================================================
# LabelPulse - Auto-deploy script (definitive solution)
# ============================================================
#
# Usage:
#   ./scripts/deploy.sh "fix: messaggio commit"
#   ./scripts/deploy.sh                  # commit automatico con timestamp
#   ./scripts/deploy.sh --no-commit      # solo push + deploy (se già committato)
#
# What it does:
#   1. Commit delle modifiche (se ce ne sono)
#   2. Push su origin/main
#   3. Trigger deploy Vercel via API (non si affida all'integrazione GitHub)
#   4. Poll dello stato del deploy fino a "READY" o errore
#   5. Stampa l'URL del deploy in produzione
#
# Richiede .env.deploy con VERCEL_TOKEN e VERCEL_PROJECT_ID.
# Vedi .env.deploy.example per istruzioni.
# ============================================================

set -euo pipefail

# ---------- Colori ----------
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

print_step() { echo -e "${BLUE}▶${NC} $1"; }
print_ok()   { echo -e "${GREEN}✓${NC} $1"; }
print_warn() { echo -e "${YELLOW}⚠${NC} $1"; }
print_err()  { echo -e "${RED}✗${NC} $1" >&2; }
print_info() { echo -e "${CYAN}ℹ${NC} $1"; }

# ---------- Setup ----------
cd "$(git rev-parse --show-toplevel)"

ENV_FILE=".env.deploy"
if [[ ! -f "$ENV_FILE" ]]; then
  print_err "File $ENV_FILE non trovato."
  echo ""
  echo "Crea il file con:"
  echo "  cp .env.deploy.example .env.deploy"
  echo "  # poi edita .env.deploy con i tuoi token Vercel"
  exit 1
fi

# shellcheck disable=SC1090
source "$ENV_FILE"

if [[ -z "${VERCEL_TOKEN:-}" ]]; then
  print_err "VERCEL_TOKEN mancante in $ENV_FILE"
  exit 1
fi
if [[ -z "${VERCEL_PROJECT_ID:-}" ]]; then
  print_err "VERCEL_PROJECT_ID mancante in $ENV_FILE"
  exit 1
fi

# ---------- Args ----------
COMMIT_MSG=""
NO_COMMIT=false
if [[ "${1:-}" == "--no-commit" ]]; then
  NO_COMMIT=true
  shift
fi
if [[ $# -gt 0 ]]; then
  COMMIT_MSG="$*"
fi

# ---------- Step 1: commit se necessario ----------
if [[ "$NO_COMMIT" == "false" ]]; then
  if [[ -n "$(git status --porcelain)" ]]; then
    if [[ -z "$COMMIT_MSG" ]]; then
      COMMIT_MSG="auto: deploy $(date +%Y-%m-%d_%H:%M)"
    fi
    print_step "Commit: $COMMIT_MSG"
    git add -A
    git commit -m "$COMMIT_MSG" --no-verify
    print_ok "Commit creato"
  else
    print_info "Niente da committare (working tree pulito)"
  fi
fi

# ---------- Step 2: verifica che siamo su main ----------
CURRENT_BRANCH=$(git rev-parse --abbrev-ref HEAD)
if [[ "$CURRENT_BRANCH" != "main" ]]; then
  print_warn "Sei sul branch '$CURRENT_BRANCH', non 'main'."
  echo "Il deploy automatico è configurato solo per main. Procedo comunque."
fi

# Verifica che ci sia qualcosa da pushare
LOCAL=$(git rev-parse HEAD)
REMOTE=$(git rev-parse "origin/$CURRENT_BRANCH" 2>/dev/null || echo "")
if [[ "$LOCAL" == "$REMOTE" ]]; then
  print_info "Sei già allineato con origin/$CURRENT_BRANCH (nessun push necessario)"
else
  print_step "Push su origin/$CURRENT_BRANCH..."
  if git push origin "$CURRENT_BRANCH" 2>&1; then
    print_ok "Push completato: $(git rev-parse --short HEAD)"
  else
    print_err "Push fallito"
    exit 1
  fi
fi

# ---------- Step 3: trigger deploy Vercel via API ----------
print_step "Trigger deploy Vercel..."

# Prendi l'ultimo commit hash per verificare che il deploy lo includa
GIT_SHA=$(git rev-parse HEAD)
SHORT_SHA=$(git rev-parse --short HEAD)

# Metodo 1: POST /v13/deployments — crea un nuovo deployment production
# dal commit SHA corrente. Questo è il metodo ufficiale Vercel, testato e
# funzionante: non dipende dall'integrazione GitHub→Vercel.
#
# Body JSON:
#   name:     "labelpulse"  (nome progetto, NON project ID)
#   project:  prj_xxx       (project ID da .env.deploy)
#   target:   "production"
#   gitSource: {type: github, org, repo, ref: <git_sha>}
TRIGGER_RESULT=$(curl -sS -w "\n%{http_code}" \
  -X POST "https://api.vercel.com/v13/deployments" \
  -H "Authorization: Bearer $VERCEL_TOKEN" \
  -H "Content-Type: application/json" \
  -d "$(jq -n --arg pid "$VERCEL_PROJECT_ID" --arg sha "$GIT_SHA" \
    '{name: "labelpulse", project: $pid, target: "production", gitSource: {type: "github", org: "emmanuelmiro77-ai", repo: "labelpulse", ref: $sha}}')" \
  2>&1) || true

HTTP_CODE=$(echo "$TRIGGER_RESULT" | tail -1)
RESPONSE_BODY=$(echo "$TRIGGER_RESULT" | sed '$d')

# Metodo 2: fallback al Deploy Hook URL se configurato
if [[ "$HTTP_CODE" != "200" && "$HTTP_CODE" != "201" && -n "${VERCEL_DEPLOY_HOOK_URL:-}" ]]; then
  print_warn "API trigger HTTP $HTTP_CODE, fallback a Deploy Hook URL"
  HOOK_RESULT=$(curl -sS -w "\n%{http_code}" -X POST "$VERCEL_DEPLOY_HOOK_URL" 2>&1) || true
  HTTP_CODE=$(echo "$HOOK_RESULT" | tail -1)
  RESPONSE_BODY=$(echo "$HOOK_RESULT" | sed '$d')
fi

if [[ "$HTTP_CODE" != "200" && "$HTTP_CODE" != "201" ]]; then
  print_err "Trigger deploy fallito (HTTP $HTTP_CODE)"
  echo "Response: $RESPONSE_BODY" | head -20
  echo ""
  print_info "Puoi comunque fare il deploy manuale da Vercel dashboard."
  exit 1
fi

# Estrai deployment ID dalla response (per il polling successivo)
DEPLOY_ID=$(echo "$RESPONSE_BODY" | jq -r '.id // .uid // empty' 2>/dev/null || echo "")
DEPLOY_URL=$(echo "$RESPONSE_BODY" | jq -r '.url // empty' 2>/dev/null || echo "")
DEPLOY_INSPECTOR=$(echo "$RESPONSE_BODY" | jq -r '.inspectorUrl // empty' 2>/dev/null || echo "")

if [[ -n "$DEPLOY_ID" ]]; then
  print_ok "Deploy triggerato (id: $DEPLOY_ID)"
fi
if [[ -n "$DEPLOY_INSPECTOR" ]]; then
  print_info "Inspector: $DEPLOY_INSPECTOR"
fi

# ---------- Step 4: poll stato deploy ----------
print_step "Attesa deploy in corso..."
echo "  (CTRL+C per interrompere — il deploy continua su Vercel)"

MAX_ATTEMPTS=40  # 40 * 8s = ~5 minuti max (di solito ci mette 30-60s)
ATTEMPT=0
LAST_STATE=""

while [[ $ATTEMPT -lt $MAX_ATTEMPTS ]]; do
  sleep 8
  ATTEMPT=$((ATTEMPT + 1))

  # Polla direttamente il deployment tramite il suo ID (modo più affidabile)
  STATUS_RESP=$(curl -sS \
    -H "Authorization: Bearer $VERCEL_TOKEN" \
    "https://api.vercel.com/v13/deployments/$DEPLOY_ID" \
    2>/dev/null) || continue

  # readyState è il campo ufficiale: INITIALIZING → QUEUED → BUILDING → READY | ERROR | CANCELED
  STATE=$(echo "$STATUS_RESP" | jq -r '.readyState // .state // empty' 2>/dev/null || echo "")
  CURL_URL=$(echo "$STATUS_RESP" | jq -r '.url // empty' 2>/dev/null || echo "")
  DEPLOY_INSPECT_URL=$(echo "$STATUS_RESP" | jq -r '.inspectorUrl // empty' 2>/dev/null || echo "")
  ALIASES=$(echo "$STATUS_RESP" | jq -r '.alias // [] | join(", ")' 2>/dev/null || echo "")

  if [[ "$STATE" != "$LAST_STATE" ]]; then
    case "$STATE" in
      QUEUED|BUILDING)  print_info "[$ATTEMPT/$MAX_ATTEMPTS] Stato: $STATE..." ;;
      INITIALIZING)     print_info "[$ATTEMPT/$MAX_ATTEMPTS] Inizializzazione..." ;;
      READY)            print_ok "[$ATTEMPT/$MAX_ATTEMPTS] Deploy PRONTO!" ;;
      ERROR)            print_err "[$ATTEMPT/$MAX_ATTEMPTS] Deploy fallito!" ;;
      CANCELED)         print_warn "[$ATTEMPT/$MAX_ATTEMPTS] Deploy cancellato" ;;
      *)                print_info "[$ATTEMPT/$MAX_ATTEMPTS] Stato: $STATE" ;;
    esac
    LAST_STATE="$STATE"
  fi

  if [[ "$STATE" == "READY" ]]; then
    echo ""
    print_ok "============================="
    print_ok "DEPLOY COMPLETATO CON SUCCESSO"
    print_ok "============================="
    echo ""
    if [[ -n "$CURL_URL" ]]; then
      print_info "URL univoco:   https://$CURL_URL"
    fi
    if [[ -n "$ALIASES" ]]; then
      print_info "Alias attivi:  $ALIASES"
    fi
    print_info "Commit:        $SHORT_SHA ($GIT_SHA)"
    if [[ -n "$DEPLOY_INSPECT_URL" ]]; then
      print_info "Inspector:     $DEPLOY_INSPECT_URL"
    fi
    exit 0
  fi

  if [[ "$STATE" == "ERROR" || "$STATE" == "CANCELED" ]]; then
    echo ""
    print_err "============================="
    print_err "DEPLOY FALLITO: $STATE"
    print_err "============================="
    echo ""
    if [[ -n "$DEPLOY_INSPECT_URL" ]]; then
      print_info "Vedi i log: $DEPLOY_INSPECT_URL"
    fi
    exit 1
  fi
done

print_warn "Timeout dopo $((MAX_ATTEMPTS * 8))s. Il deploy potrebbe essere ancora in corso."
print_info "Controlla: https://vercel.com/dashboard"
exit 2
