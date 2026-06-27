#!/usr/bin/env python3
"""
seed-agent-memory.py

Legge BUG_REGISTRY.md, estrae tutti i bug risolti, e genera un file
SQL con un INSERT multiplo per popolare la tabella agent_memory su Supabase.

Output: scripts/seed-agent-memory.sql

COME USARLO:
  python3 scripts/seed-agent-memory.py
  # poi incolla il contenuto di scripts/seed-agent-memory.sql
  # nel SQL Editor di Supabase
"""

import re
import sys
from pathlib import Path
from datetime import datetime, timezone

BUG_REGISTRY = Path("/home/z/my-project/BUG_REGISTRY.md")
OUTPUT = Path("/home/z/my-project/scripts/seed-agent-memory.sql")

# Mappa categoria (sezione ##) → severity
CATEGORY_SEVERITY = {
    "🔥 CRITICI": "critical",
    "📧 EMAIL": "high",
    "🎵 NAVIGAZIONE": "medium",
    "💥 CRASH": "high",
    "☁️ CLOUD": "critical",
    "🔊 AUDIO": "medium",
    "🔔 NOTIFICHE PUSH": "medium",
    "📦 PWA": "medium",
    "🏷️ LABELS": "medium",
    "🎤 PITCH": "medium",
    "🚀 DEPLOY": "high",
}

# Mappa categoria → event_type
CATEGORY_EVENT_TYPE = {
    "🔥 CRITICI": "bug_fix",
    "📧 EMAIL": "bug_fix",
    "🎵 NAVIGAZIONE": "bug_fix",
    "💥 CRASH": "bug_fix",
    "☁️ CLOUD": "bug_fix",
    "🔊 AUDIO": "bug_fix",
    "🔔 NOTIFICHE PUSH": "bug_fix",
    "📦 PWA": "bug_fix",
    "🏷️ LABELS": "bug_fix",
    "🎤 PITCH": "feature",
    "🚀 DEPLOY": "bug_fix",
}


def parse_bug_registry(content: str):
    """Estrae i bug dal markdown. Restituisce lista di dict."""
    entries = []
    current_category = None
    current_title = None
    current_fields = {}

    for line in content.splitlines():
        # Nuova sezione categoria
        if line.startswith("## "):
            # Salva la entry precedente se esiste prima di cambiare sezione
            if current_title and current_fields:
                entries.append(
                    {
                        "category": current_category or "",
                        "title": current_title,
                        **current_fields,
                    }
                )
                current_title = None
                current_fields = {}

            cat = line[3:].strip()
            # Cerca nella mappa
            matched = False
            for prefix, severity in CATEGORY_SEVERITY.items():
                if cat.startswith(prefix) or prefix in cat:
                    current_category = cat
                    matched = True
                    break
            if not matched:
                current_category = cat
            # Se siamo in una sezione non-bug, segnaliamo con None
            # così i ### sotto non vengono processati
            if current_category and any(
                x in current_category
                for x in ["PROTOCOLLO", "WORKFLOW", "🛡️", "📝", "HOW TO", "MANUTENZIONE"]
            ):
                current_category = None
            continue

        # Salta sezioni non-bug
        if current_category is None:
            continue
        if any(
            x in current_category
            for x in ["PROTOCOLLO", "WORKFLOW", "🛡️", "📝", "HOW TO", "MANUTENZIONE"]
        ):
            continue

        # Nuova entry bug (### Titolo)
        if line.startswith("### "):
            # Salva la entry precedente se esiste
            if current_title and current_fields:
                entries.append(
                    {
                        "category": current_category,
                        "title": current_title,
                        **current_fields,
                    }
                )
            current_title = line[4:].strip()
            current_fields = {"symptom": None, "cause": None, "fix": None, "files": []}
            continue

        if current_title is None:
            continue

        # Campi
        if line.startswith("- **Sintomo**:"):
            current_fields["symptom"] = line[len("- **Sintomo**:"):].strip()
        elif line.startswith("- **Causa**:"):
            current_fields["cause"] = line[len("- **Causa**:"):].strip()
        elif line.startswith("- **Fix**:"):
            current_fields["fix"] = line[len("- **Fix**:"):].strip()
        elif line.startswith("- **File**:"):
            files_str = line[len("- **File**:"):].strip()
            # Estrai path file tra backtick
            current_fields["files"] = re.findall(r"`([^`]+)`", files_str)

    # Ultima entry
    if current_title and current_fields:
        entries.append(
            {
                "category": current_category,
                "title": current_title,
                **current_fields,
            }
        )

    return entries


def sql_escape(s: str) -> str:
    """Escape per stringa SQL single-quote."""
    if s is None:
        return ""
    return s.replace("'", "''")


def extract_commit_hash(fix_str: str) -> str:
    """Estrae l'hash del commit dal testo del fix."""
    if not fix_str:
        return ""
    m = re.search(r"`([a-f0-9]{7,40})`", fix_str)
    return m.group(1) if m else ""


def extract_search_keywords(title: str, symptom: str) -> list:
    """Estrae keyword di ricerca dal titolo e sintomo."""
    text = f"{title} {symptom}".lower()
    # Stop words italiane + inglesi
    stop = {
        "il", "lo", "la", "i", "gli", "le", "di", "da", "del", "della",
        "in", "su", "per", "con", "the", "a", "an", "of", "to", "in",
        "on", "for", "with", "and", "or", "not", "is", "are", "was",
        "after", "before", "non", "più", "anche", "se", "ma", "che",
        "come", "dopo", "prima", "tra", "sotto", "sopra",
    }
    words = re.findall(r"[a-zà-ù]+", text)
    keywords = [w for w in words if len(w) > 2 and w not in stop]
    # Dedup preservando ordine
    seen = set()
    unique = []
    for w in keywords:
        if w not in seen:
            seen.add(w)
            unique.append(w)
    return unique[:10]  # max 10 keywords


def build_sql_insert(entries: list) -> str:
    """Costruisce l'SQL INSERT multiplo."""
    now = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%S+00:00")

    lines = [
        "-- ============================================================================",
        "-- SEED agent_memory — Popolamento iniziale tabella",
        "-- ============================================================================",
        "-- Generato automaticamente da scripts/seed-agent-memory.py",
        f"-- Data generazione: {now}",
        f"-- Totale entry: {len(entries)}",
        "--",
        "-- COME USARLO:",
        "--   1. Apri Supabase Dashboard → SQL Editor → New query",
        "--   2. Incolla tutto questo file",
        "--   3. Click Run (Ctrl+Enter)",
        "--   4. Se vedi 'Success. No rows returned' → fatto",
        "--",
        "-- Per verificare:",
        "--   SELECT count(*) FROM agent_memory;  -- deve restituire il numero di entry",
        "-- ============================================================================",
        "",
    ]

    # Pulisci la tabella prima del seed (idempotente)
    lines.extend([
        "-- Pulisci entry esistenti (seed idempotente — sicuro re-runnare)",
        "DELETE FROM agent_memory WHERE event_type IN ('bug_fix', 'feature', 'regression');",
        "",
        "-- Reset sequence per avere id puliti",
        "SELECT setval('agent_memory_id_seq', 1, false);",
        "",
        "-- ============================================================================",
        "-- INSERT",
        "-- ============================================================================",
        "",
    ])

    # INSERT multipli
    for i, entry in enumerate(entries, 1):
        cat = entry.get("category", "")
        # Trova severity
        severity = "medium"
        event_type = "bug_fix"
        for prefix, sev in CATEGORY_SEVERITY.items():
            if prefix in cat:
                severity = sev
                event_type = CATEGORY_EVENT_TYPE.get(prefix, "bug_fix")
                break

        title = sql_escape(entry["title"])
        description_parts = []
        if entry.get("symptom"):
            description_parts.append(f"Sintomo: {entry['symptom']}")
        if entry.get("cause"):
            description_parts.append(f"Causa: {entry['cause']}")
        if entry.get("fix"):
            description_parts.append(f"Fix: {entry['fix']}")
        description = sql_escape(" | ".join(description_parts))

        commit_hash = extract_commit_hash(entry.get("fix", ""))
        files = entry.get("files", [])
        files_array = "{" + ",".join(sql_escape(f) for f in files) + "}" if files else "{}"

        keywords = extract_search_keywords(entry["title"], entry.get("symptom", ""))
        keywords_array = "{" + ",".join(keywords) + "}" if keywords else "{}"

        lines.append(f"-- Entry {i}: {entry['title'][:60]}")
        lines.append(
            f"INSERT INTO agent_memory "
            f"(event_type, title, description, commit_hash, files_affected, search_keywords, severity, metadata) "
            f"VALUES "
            f"('{event_type}', '{title}', '{description}', "
            f"'{commit_hash}', "
            f"'{files_array}'::TEXT[], '{keywords_array}'::TEXT[], "
            f"'{severity}', "
            f"'{{\"seeded_at\": \"{now}\", \"source\": \"BUG_REGISTRY.md\"}}'::JSONB);"
        )
        lines.append("")

    lines.extend([
        "-- ============================================================================",
        f"-- FINE SEED — {len(entries)} entry inserite",
        "-- ============================================================================",
        "",
        "-- Verifica:",
        "SELECT event_type, severity, count(*) FROM agent_memory GROUP BY event_type, severity ORDER BY event_type, severity;",
        "",
    ])

    return "\n".join(lines)


def main():
    if not BUG_REGISTRY.exists():
        print(f"❌ BUG_REGISTRY.md non trovato: {BUG_REGISTRY}", file=sys.stderr)
        sys.exit(1)

    content = BUG_REGISTRY.read_text(encoding="utf-8")
    entries = parse_bug_registry(content)

    if not entries:
        print("❌ Nessuna entry trovata in BUG_REGISTRY.md", file=sys.stderr)
        sys.exit(1)

    print(f"✅ Estratte {len(entries)} entry da BUG_REGISTRY.md")

    # Statistiche
    by_category = {}
    for e in entries:
        cat = e["category"]
        by_category[cat] = by_category.get(cat, 0) + 1
    print("\nDistribuzione per categoria:")
    for cat, count in sorted(by_category.items()):
        print(f"  {cat}: {count}")

    sql = build_sql_insert(entries)
    OUTPUT.write_text(sql, encoding="utf-8")
    print(f"\n✅ SQL scritto in: {OUTPUT}")
    print(f"   Dimensione: {len(sql)} caratteri, {sql.count(chr(10))} righe")
    print(f"\n📋 Prossimo step: incolla il contenuto di {OUTPUT} nel SQL Editor di Supabase")


if __name__ == "__main__":
    main()
