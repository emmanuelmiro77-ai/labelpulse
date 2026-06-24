#!/usr/bin/env python3
"""Analizza un JSON di scrape Beatport per verificare se i loghi sono stati catturati."""
import json
import sys
from pathlib import Path
from collections import Counter

def main():
    path = Path(sys.argv[1] if len(sys.argv) > 1 else "/home/z/my-project/upload/labelpulse_beatport_2026-06-24 (1).json")
    if not path.exists():
        print(f"❌ File non trovato: {path}")
        sys.exit(1)

    print(f"📄 Analisi: {path.name}")
    print(f"   Size: {path.stat().st_size:,} bytes")

    with path.open("r", encoding="utf-8") as f:
        data = json.load(f)

    meta = data.get("_meta", {})
    labels = data.get("labels", [])
    artists = data.get("artists", [])
    tracks = data.get("tracks", [])
    genres = data.get("genres", [])

    print("\n" + "="*60)
    print("META")
    print("="*60)
    for k, v in meta.items():
        print(f"  {k}: {v}")

    print(f"\n{'='*60}")
    print(f"LABELS — totale: {len(labels)}")
    print(f"{'='*60}")

    with_image = [l for l in labels if l.get("imageUrl")]
    without_image = [l for l in labels if not l.get("imageUrl")]
    pct = (len(with_image) * 100 / len(labels)) if labels else 0
    print(f"  Con logo:     {len(with_image)} ({pct:.1f}%)")
    print(f"  Senza logo:   {len(without_image)} ({100-pct:.1f}%)")

    # Beatport ID/slug coverage
    with_id = sum(1 for l in labels if l.get("beatportId"))
    with_slug = sum(1 for l in labels if l.get("slug"))
    print(f"  Con beatportId: {with_id}/{len(labels)}")
    print(f"  Con slug:       {with_slug}/{len(labels)}")

    # Sample of labels with logo
    print(f"\n  📸 Prime 10 label CON logo:")
    for l in with_image[:10]:
        url = l["imageUrl"]
        # Show domain for readability
        domain = url.split("/")[2] if "//" in url else "?"
        print(f"    • {l['name'][:30]:30}  {domain}  {url[-60:]}")

    print(f"\n  🚫 Prime 10 label SENZA logo (campione):")
    for l in without_image[:10]:
        bp_id = l.get("beatportId", "?")
        slug = l.get("slug", "?")
        print(f"    • {l['name'][:30]:30}  bp_id={bp_id}  slug={slug}")

    # Sample image URL patterns
    print(f"\n  🔍 Pattern URL loghi (prime 5):")
    for url in [l["imageUrl"] for l in with_image[:5]]:
        print(f"    {url}")

    # Check if there's a common CDN pattern
    if with_image:
        domains = Counter(l["imageUrl"].split("/")[2] for l in with_image if "//" in l["imageUrl"])
        print(f"\n  🌐 Domini CDN dei loghi:")
        for dom, cnt in domains.most_common(5):
            print(f"    {dom}: {cnt}")

    print(f"\n{'='*60}")
    print(f"ALTRI DATI")
    print(f"{'='*60}")
    print(f"  Generi: {len(genres)}")
    print(f"  Artisti: {len(artists)}")
    print(f"  Tracce: {len(tracks)}")

    # Artist logos coverage (bonus check)
    if artists:
        artists_with_logo = sum(1 for a in artists if a.get("imageUrl"))
        print(f"  Artisti con logo: {artists_with_logo}/{len(artists)}")

    # Final verdict
    print(f"\n{'='*60}")
    print(f"VERDETTO")
    print(f"{'='*60}")
    if len(with_image) == 0:
        print("  ❌ NESSUN logo catturato. Beatport non espone label.image.uri")
        print("     nella API tracks. Serve fetch separato su /catalog/labels/{id}.")
    elif pct < 30:
        print(f"  ⚠️  Copertura bassa ({pct:.1f}%). Parziale.")
    elif pct < 80:
        print(f"  ✅ Copertura media ({pct:.1f}%). Buona ma migliorabile.")
    else:
        print(f"  ✅ Copertura alta ({pct:.1f}%). Funziona correttamente!")

if __name__ == "__main__":
    main()
