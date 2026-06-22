#!/usr/bin/env python3
"""Analizza l'export Beatport per verificare qualità di label e artisti."""
import json
from collections import Counter, defaultdict
from pathlib import Path

FILE = Path("/home/z/my-project/upload/labelpulse_beatport_2026-06-22.json")

def main():
    data = json.loads(FILE.read_text(encoding="utf-8"))
    
    print("=" * 70)
    print("STRUTTURA PRINCIPALE DEL FILE")
    print("=" * 70)
    if isinstance(data, dict):
        for k, v in data.items():
            if isinstance(v, list):
                print(f"  {k}: lista con {len(v)} elementi")
            elif isinstance(v, dict):
                print(f"  {k}: dict con chiavi {list(v.keys())[:8]}")
            else:
                print(f"  {k}: {type(v).__name__} = {str(v)[:80]}")
    elif isinstance(data, list):
        print(f"  Root è lista con {len(data)} elementi")
        if data:
            print(f"  Primo elemento ha chiavi: {list(data[0].keys())[:10]}")
    
    print()
    print("=" * 70)
    print("ANALISI LABEL")
    print("=" * 70)
    
    # Try to find labels in various structures
    labels = data.get("labels") if isinstance(data, dict) else None
    if not labels and isinstance(data, dict):
        # Maybe labels are nested
        for k in ("labelResults", "labelData", "scrapedLabels"):
            if k in data:
                labels = data[k]
                print(f"  (Trovate sotto chiave: {k})")
                break
    
    if not labels and isinstance(data, list):
        # Maybe each item has a label field
        sample = data[0] if data else {}
        if "label" in sample or "labelName" in sample:
            print("  Labels sono dentro ogni traccia (struttura piatta)")
            labels = []
            seen = set()
            for item in data:
                lbl = item.get("label") or item.get("labelName") or item.get("label_name")
                if lbl and lbl not in seen:
                    seen.add(lbl)
                    labels.append({"name": lbl})
    
    if labels:
        print(f"\n  Totale label: {len(labels)}")
        print(f"\n  PRIME 10 label:")
        for i, lbl in enumerate(labels[:10]):
            if isinstance(lbl, dict):
                name = lbl.get("name") or lbl.get("labelName") or lbl.get("label_name") or "?"
                artists = lbl.get("artists", [])
                n_artists = len(artists) if isinstance(artists, list) else 0
                print(f"    {i+1}. {name} — artisti: {n_artists}")
            else:
                print(f"    {i+1}. {lbl}")
        
        # Verifica artisti dentro le label
        print(f"\n  VERIFITA ARTISTI PER LABEL (prime 5):")
        for lbl in labels[:5]:
            if isinstance(lbl, dict):
                name = lbl.get("name") or lbl.get("labelName") or "?"
                artists = lbl.get("artists", [])
                if isinstance(artists, list):
                    print(f"    {name}: {len(artists)} artisti")
                    for a in artists[:5]:
                        if isinstance(a, dict):
                            an = a.get("name") or a.get("artistName") or "?"
                            print(f"        - {an}")
                        else:
                            print(f"        - {a}")
                    if len(artists) > 5:
                        print(f"        ... e altri {len(artists)-5}")
                else:
                    print(f"    {name}: artists NON è lista -> {type(artists).__name__}")
        
        # Distribuzione
        print(f"\n  DISTRIBUZIONE ARTISTI PER LABEL:")
        counts = []
        empty = 0
        for lbl in labels:
            if isinstance(lbl, dict):
                a = lbl.get("artists", [])
                n = len(a) if isinstance(a, list) else 0
                if n == 0:
                    empty += 1
                else:
                    counts.append(n)
        if counts:
            print(f"    Label con 0 artisti: {empty} su {len(labels)} ({empty*100//len(labels)}%)")
            print(f"    Label con almeno 1 artista: {len(counts)}")
            print(f"    Media artisti per label (non vuote): {sum(counts)//len(counts)}")
            print(f"    Massimo artisti in una label: {max(counts)}")
            print(f"    Minimo: {min(counts)}")
        
        # Campi attesi nelle label
        print(f"\n  CAMPI DISPONIBILI PER OGNI LABEL:")
        if labels and isinstance(labels[0], dict):
            for k in labels[0].keys():
                v = labels[0][k]
                t = type(v).__name__
                if isinstance(v, list):
                    t = f"list[{len(v)}]"
                print(f"    - {k} ({t})")
    else:
        print("  Nessuna label trovata nella struttura attesa.")
    
    print()
    print("=" * 70)
    print("ANALISI ARTISTI")
    print("=" * 70)
    artists = data.get("artists") if isinstance(data, dict) else None
    if not artists and isinstance(data, dict):
        for k in ("artistResults", "artistData", "scrapedArtists"):
            if k in data:
                artists = data[k]
                print(f"  (Trovati sotto chiave: {k})")
                break
    
    if artists:
        print(f"\n  Totale artisti: {len(artists)}")
        print(f"\n  PRIMI 10 artisti:")
        for i, a in enumerate(artists[:10]):
            if isinstance(a, dict):
                n = a.get("name") or a.get("artistName") or "?"
                lbl = a.get("label") or a.get("labelName") or "-"
                print(f"    {i+1}. {n} (label: {lbl})")
            else:
                print(f"    {i+1}. {a}")
        
        print(f"\n  CAMPI DISPONIBILI PER OGNI ARTISTA:")
        if artists and isinstance(artists[0], dict):
            for k in artists[0].keys():
                v = artists[0][k]
                t = type(v).__name__
                if isinstance(v, list):
                    t = f"list[{len(v)}]"
                print(f"    - {k} ({t})")
    else:
        print("  Nessun artista trovato nella struttura attesa.")
    
    print()
    print("=" * 70)
    print("VERIFICA INTEGRITÀ")
    print("=" * 70)
    if isinstance(data, dict):
        ts = data.get("scrapedAt") or data.get("timestamp") or data.get("exportedAt")
        print(f"  Timestamp export: {ts}")
        v = data.get("version") or data.get("schemaVersion")
        print(f"  Versione schema: {v}")
        
        # Conta artisti totali dentro tutte le label
        if labels:
            total_artists_in_labels = 0
            for lbl in labels:
                if isinstance(lbl, dict):
                    a = lbl.get("artists", [])
                    if isinstance(a, list):
                        total_artists_in_labels += len(a)
            print(f"  Totale artisti aggregati dentro le label: {total_artists_in_labels}")
        
        # Verifica duplicati label per nome
        if labels:
            names = []
            for lbl in labels:
                if isinstance(lbl, dict):
                    n = lbl.get("name") or lbl.get("labelName")
                    if n:
                        names.append(n.lower().strip())
            dup = {n: c for n, c in Counter(names).items() if c > 1}
            print(f"  Label duplicate (per nome): {len(dup)}")
            if dup:
                for n, c in list(dup.items())[:5]:
                    print(f"    '{n}' appare {c} volte")
        
        # Verifica artisti senza nome
        if labels:
            unnamed = 0
            for lbl in labels:
                if isinstance(lbl, dict):
                    for a in lbl.get("artists", []) or []:
                        if isinstance(a, dict):
                            an = a.get("name") or a.get("artistName")
                            if not an or not str(an).strip():
                                unnamed += 1
            print(f"  Artisti senza nome dentro le label: {unnamed}")
    
    print()
    print("=" * 70)
    print("CONCLUSIONE")
    print("=" * 70)

if __name__ == "__main__":
    main()
