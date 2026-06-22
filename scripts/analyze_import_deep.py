#!/usr/bin/env python3
"""Analisi approfondita: link artisti↔label e qualità complessiva."""
import json
from collections import Counter, defaultdict
from pathlib import Path

FILE = Path("/home/z/my-project/upload/labelpulse_beatport_2026-06-22.json")
data = json.loads(FILE.read_text(encoding="utf-8"))

labels = data.get("labels", [])
artists = data.get("artists", [])
tracks = data.get("tracks", [])
genres = data.get("genres", [])
meta = data.get("_meta", {})

print("=" * 70)
print("META")
print("=" * 70)
for k, v in meta.items():
    print(f"  {k}: {v}")

print()
print("=" * 70)
print("GENERI SCRAPATI")
print("=" * 70)
for g in genres:
    if isinstance(g, dict):
        n = g.get("name") or g.get("slug") or "?"
        print(f"  - {n}")
    else:
        print(f"  - {g}")

# Build label index by id
label_by_id = {l["id"]: l for l in labels if isinstance(l, dict) and "id" in l}
label_by_name = {l["name"].lower().strip(): l for l in labels if isinstance(l, dict) and "name" in l}

print()
print("=" * 70)
print("LINK ARTISTI → LABEL (tramite 'labelsPublishedOn')")
print("=" * 70)
total_links = 0
artists_with_links = 0
artists_no_links = 0
broken_links = 0  # artist references a label id not in labels array
link_counts = []

# Verifica struttura labelsPublishedOn
sample = artists[0].get("labelsPublishedOn") if artists else []
print(f"\n  Esempio labelsPublishedOn (primo artista, {artists[0].get('name')}):")
print(f"    {sample}")

for a in artists:
    refs = a.get("labelsPublishedOn") or []
    if not refs:
        artists_no_links += 1
        continue
    artists_with_links += 1
    valid = 0
    for r in refs:
        # r can be string id, or dict with id
        rid = r if isinstance(r, str) else (r.get("id") if isinstance(r, dict) else None)
        if rid and rid in label_by_id:
            valid += 1
            total_links += 1
        else:
            broken_links += 1
    link_counts.append(valid)

print(f"\n  Artisti con almeno 1 label collegata: {artists_with_links}")
print(f"  Artisti SENZA label collegate: {artists_no_links}")
print(f"  Totale link validi artista→label: {total_links}")
print(f"  Link rotti (label id mancante): {broken_links}")
if link_counts:
    print(f"  Media label per artista (con link): {sum(link_counts)/len(link_counts):.1f}")
    print(f"  Massimo label per un artista: {max(link_counts)}")

print()
print("=" * 70)
print("DISTRIBUZIONE GENERI SULLE LABEL")
print("=" * 70)
lbl_genres = Counter()
for l in labels:
    g = l.get("genres") or []
    for x in g:
        if isinstance(x, dict):
            lbl_genres[x.get("name") or x.get("slug") or "?"] += 1
        else:
            lbl_genres[str(x)] += 1
for g, c in lbl_genres.most_common(20):
    print(f"  {g}: {c} label")

print()
print("=" * 70)
print("DISTRIBUZIONE GENERI SUGLI ARTISTI")
print("=" * 70)
art_genres = Counter()
for a in artists:
    g = a.get("genres") or []
    for x in g:
        if isinstance(x, dict):
            art_genres[x.get("name") or x.get("slug") or "?"] += 1
        else:
            art_genres[str(x)] += 1
for g, c in art_genres.most_common(20):
    print(f"  {g}: {c} artisti")

print()
print("=" * 70)
print("VERIFITA TRENDING / RANKING DATI")
print("=" * 70)
trending_labels = sum(1 for l in labels if l.get("trending"))
trending_artists = sum(1 for a in artists if a.get("trending"))
labels_with_rank = sum(1 for l in labels if l.get("rankByGenre"))
artists_with_rank = sum(1 for a in artists if a.get("tracksByGenre"))
print(f"  Label con trending=true: {trending_labels}")
print(f"  Artisti con trending=true: {trending_artists}")
print(f"  Label con rankByGenre popolato: {labels_with_rank}")
print(f"  Artisti con tracksByGenre popolato: {artists_with_rank}")

# Sample rankByGenre
print(f"\n  Esempio rankByGenre (label '{labels[0].get('name')}'):")
print(f"    {labels[0].get('rankByGenre')}")
print(f"\n  Esempio tracksByGenre (artista '{artists[0].get('name')}'):")
print(f"    {artists[0].get('tracksByGenre')}")

print()
print("=" * 70)
print("VERIFICA TRACCE (3000)")
print("=" * 70)
if tracks and isinstance(tracks[0], dict):
    print(f"  Campi traccia: {list(tracks[0].keys())}")
    # Check linkage
    t_with_label = sum(1 for t in tracks if t.get("label") or t.get("labelId") or t.get("labelName"))
    t_with_artist = sum(1 for t in tracks if t.get("artist") or t.get("artistId") or t.get("artists"))
    print(f"  Tracce con label collegata: {t_with_label} / {len(tracks)}")
    print(f"  Tracce con artista collegato: {t_with_artist} / {len(tracks)}")
    
    # Generi delle tracce
    tg = Counter()
    for t in tracks:
        g = t.get("genre") or t.get("genreName")
        if g:
            tg[str(g)] += 1
    print(f"\n  Generi tracce (top 10):")
    for g, c in tg.most_common(10):
        print(f"    {g}: {c}")

print()
print("=" * 70)
print("VERIFICA NOMI LABEL - QUALITÀ")
print("=" * 70)
# Cerca nomi che sembrano IDs o robaccia
suspicious = []
for l in labels:
    n = l.get("name", "")
    # Solo cifre o tutto maiuscolo corto
    if not n or n.isdigit() or (len(n) <= 4 and n.isupper()):
        suspicious.append(n)
print(f"  Label con nome sospetto (cifre/corto): {len(suspicious)}")
for n in suspicious[:10]:
    print(f"    - {n}")

# Cerca artisti con nome vuoto
empty_artists = [a for a in artists if not (a.get("name") or "").strip()]
print(f"  Artisti con nome vuoto: {len(empty_artists)}")

# Verifica un artista famoso per sanity check
famous = ["David Guetta", "Skrillex", "ANOTR", "Subtronics"]
for fname in famous:
    found = next((a for a in artists if a.get("name") == fname), None)
    if found:
        print(f"\n  ✓ '{fname}' presente:")
        print(f"    - generi: {found.get('genres')}")
        print(f"    - totalPoints: {found.get('totalPoints')}")
        print(f"    - bestPosition: {found.get('bestPosition')}")
        print(f"    - labelsPublishedOn: {found.get('labelsPublishedOn')}")
        # Risolvi i nomi delle label
        if isinstance(found.get("labelsPublishedOn"), list):
            for ref in found["labelsPublishedOn"][:5]:
                rid = ref if isinstance(ref, str) else (ref.get("id") if isinstance(ref, dict) else None)
                if rid and rid in label_by_id:
                    print(f"        → {label_by_id[rid].get('name')}")
                else:
                    print(f"        → (ID non trovato: {rid})")
