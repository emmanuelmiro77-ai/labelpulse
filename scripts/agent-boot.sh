#!/bin/bash
# ============================================================================
# agent-boot.sh — MEMORY BOOT SCRIPT
# ============================================================================
#
# SCOPO: Stampare un riassunto completo dello stato della memoria dell'agente
# all'inizio di ogni sessione, in modo che l'agente sappia SEMPRE:
#   - Quali file di memoria esistono e dove
#   - Quali bug sono già stati risolti (con commit di riferimento)
#   - Quali sono gli ultimi commit pushati
#   - Quali file sono stati modificati di recente (regressioni potenziali)
#   - Quali sono i fix critici da NON rompere mai
#
# COME USARLO:
#   bash scripts/agent-boot.sh
#
# L'agente DEVE eseguire questo script all'inizio di ogni sessione, prima
# di indagare qualsiasi bug. Il file BOOT.md nella root del progetto lo
# ricorda esplicitamente.
#
# ============================================================================

set -e
ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT_DIR"

echo "================================================================"
echo "🤖 LABELPULSE — AGENT MEMORY BOOT"
echo "   $(date -u '+%Y-%m-%d %H:%M:%S UTC')"
echo "================================================================"
echo ""

# ---------- 1. STATO PROGETTO ----------
echo "📦 PROGETTO"
echo "   Versione: $(grep '"version"' package.json | head -1 | sed 's/.*"version": "\([^"]*\)".*/\1/')"
echo "   Branch:   $(git branch --show-current)"
echo "   Commit HEAD: $(git rev-parse --short HEAD)"
echo "   Status: $(git status --porcelain | wc -l) file modificati non committati"
echo ""

# ---------- 2. ULTIMI 15 COMMIT ----------
echo "📜 ULTIMI 15 COMMIT (cronologia recente)"
echo "----------------------------------------------------------------"
git log --oneline -15 | sed 's/^/  /'
echo ""

# ---------- 3. FILE DI MEMORIA ----------
echo "🧠 FILE DI MEMORIA PERMANENTI (su GitHub)"
echo "----------------------------------------------------------------"
for f in BOOT.md AGENT_CONTEXT.md BUG_REGISTRY.md worklog.md VERSIONS.md; do
  if [ -f "$f" ]; then
    lines=$(wc -l < "$f")
    size=$(du -h "$f" | cut -f1)
    last_modified=$(stat -c '%y' "$f" | cut -d. -f1)
    echo "  ✅ $f"
    echo "     $lines righe, $size, modificato $last_modified"
  else
    echo "  ❌ $f — MANCANTE"
  fi
done
echo ""

# ---------- 4. ULTIME 10 ENTRY IN WORKLOG ----------
echo "📝 ULTIME 10 ENTRY IN WORKLOG.MD (attività recente)"
echo "----------------------------------------------------------------"
grep -n "^Task ID:" worklog.md 2>/dev/null | tail -10 | sed 's/^/  /'
echo ""

# ---------- 5. BUG CRITICI RISOLTI (da NON rompere mai) ----------
echo "🛡️ BUG CRITICI RISOLTI — DA NON ROMPERE MAI"
echo "----------------------------------------------------------------"
echo "  Cerca in BUG_REGISTRY.md per sintomo prima di indagare:"
echo ""
grep -E "^### " BUG_REGISTRY.md 2>/dev/null | head -25 | sed 's/^### /  • /'
echo ""

# ---------- 6. FILE MODIFICATI NEGLI ULTIMI 7 GIORNI ----------
echo "📂 FILE MODIFICATI NEGLI ULTIMI 7 GIORNI (regressioni potenziali)"
echo "----------------------------------------------------------------"
find src/ -name "*.tsx" -o -name "*.ts" -mtime -7 2>/dev/null | head -20 | sed 's/^/  /'
echo ""

# ---------- 7. PROTOCOLLO ANTI-REGRESSIONE ----------
echo "🚨 PROTOCOLLO ANTI-REGRESSIONE (obbligatorio per ogni fix)"
echo "----------------------------------------------------------------"
cat << 'EOF'
  PRIMA del fix:
    1. grep -i "<sintomo>" BUG_REGISTRY.md
    2. Se match → verifica fix ancora in codice
    3. Se regression → identifica commit che lo ha rotto

  PRIMA di committare (per ogni file toccato):
    1. grep "<path file>" BUG_REGISTRY.md
    2. Per ogni entry → verifica fix ancora presente nel codice
    3. Se manca → STOP, ripristina prima il fix passato

  DOPO il fix:
    1. Aggiungi entry a BUG_REGISTRY.md
    2. Conferma all'utente: "Verifica anti-regressione: N fix controllati, tutti presenti ✅"
EOF
echo ""

# ---------- 8. STATO DEPLOY ----------
echo "🚀 STATO DEPLOY"
echo "----------------------------------------------------------------"
if [ -d "out" ] && [ -f "out/index.html" ]; then
  build_time=$(stat -c '%y' out/index.html | cut -d. -f1)
  echo "  ✅ Build statico presente (out/) — ultima build: $build_time"
else
  echo "  ⚠️  Build statico mancante — esegui: bash scripts/build-static.sh"
fi

if curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/ 2>/dev/null | grep -q "200"; then
  echo "  ✅ Server locale attivo su http://localhost:3000"
else
  echo "  ⚠️  Server locale non risponde — avvia con: bash run-server.sh"
fi

# Check se ci sono commit non pushati
ahead=$(git log origin/main..HEAD --oneline 2>/dev/null | wc -l)
if [ "$ahead" -gt 0 ]; then
  echo "  ⚠️  $ahead commit locali non pushati su GitHub:"
  git log origin/main..HEAD --oneline 2>/dev/null | sed 's/^/     /'
else
  echo "  ✅ Tutto pushato su GitHub (origin/main aggiornato)"
fi
echo ""

echo "================================================================"
echo "✅ BOOT COMPLETATO — leggi quanto sopra PRIMA di indagare bug"
echo "================================================================"
