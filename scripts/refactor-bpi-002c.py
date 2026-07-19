#!/usr/bin/env python3
"""
RP-BPI-002C — Refactor scraper into CanonicalGraph / Builder / Exporter architecture.

Three-phase pipeline:
  Phase 1: Beatport Import (fetchGenre) — reads Beatport, calls builder.processTracks
  Phase 2: CanonicalGraphBuilder — builds graph entities + relations
  Phase 3: Exporter — serializes graph to JSON (identical output)

The script transforms beatport-scraper-v2.js and test-scraper-v2.js in-place.
"""

import re
import sys

def refactor_scraper(filepath):
    """Refactor the main scraper file."""
    with open(filepath, 'r') as f:
        lines = f.readlines()

    # Find section boundaries by line number (0-indexed)
    # Line 69 (1-indexed) = index 68: start of RP-BPI-002A helpers section
    # Line 756 (1-indexed) = index 755: end of globalRemapRegistry section (before fetchGenre comment)
    # Line 757 (1-indexed) = index 756: start of fetchGenre section
    # Line 855 (1-indexed) = index 854: start of MAIN LOOP section
    # Line 1061 (1-indexed) = index 1060: start of "remap + build" section
    # Line 1080 (1-indexed) = index 1079: "Costruzione JSON" line
    # Line 1281 (1-indexed) = index 1280: start of OUTPUT section
    # Line 1335 (1-indexed) = index 1334: end of file

    # Extract sections
    # Header: lines 1-68 (index 0-67) — IIFE opening + genres + styles + NOW + sleep
    header = ''.join(lines[0:68])

    # Builder section: lines 69-755 (index 68-754) — helpers + canonical generators + processTracks + buildCanonicalRelationships + remapCanonicalIds + globalRemapRegistry
    builder_body = ''.join(lines[68:755])

    # fetchGenre: lines 757-854 (index 756-853)
    fetchgenre_section = ''.join(lines[756:854])

    # Main loop: lines 855-1060 (index 854-1059)
    main_loop_section = ''.join(lines[854:1060])

    # Remap + build calls: lines 1061-1079 (index 1060-1078)
    remap_build_section = ''.join(lines[1060:1079])

    # Build output: lines 1080-1280 (index 1079-1279)
    build_output_section = ''.join(lines[1079:1280])

    # Output + download: lines 1281-1335 (index 1280-1334)
    output_download = ''.join(lines[1280:])

    # === Extract processTracks, buildCanonicalRelationships, remapCanonicalIds from builder_body ===
    # These are currently standalone functions. We need to wrap them inside createCanonicalGraphBuilder.
    # The builder_body contains:
    #   - Comment blocks + helper functions (artistKey, labelKey, etc.)
    #   - Canonical id generators
    #   - processTracks function
    #   - buildCanonicalRelationships function
    #   - remapCanonicalIds function
    #   - globalRemapRegistry variable declaration

    # Strategy: keep the builder_body mostly as-is, but:
    # 1. Remove the `var globalRemapRegistry = { ... };` declaration (it becomes graph.remapRegistry)
    # 2. Replace `globalRemapRegistry` references with `graph.remapRegistry`
    # 3. Replace `globalLM` with `graph.labels`, `globalAM` with `graph.artists`, etc.
    #    (but ONLY in remapCanonicalIds and buildCanonicalRelationships, which take these as params)
    #    Actually, these functions take globalTM, globalRM, globalAM, globalLM as PARAMETERS.
    #    So we need to change the function signatures to not take params and instead use graph.tracks etc.
    # 4. Wrap everything in `function createCanonicalGraphBuilder(graph) { ... return {...}; }`

    # Actually, let's be more surgical. The functions processTracks, buildCanonicalRelationships,
    # remapCanonicalIds all take parameters. We'll:
    # - Keep processTracks signature as-is (it takes per-genre Maps, not global ones)
    # - Change buildCanonicalRelationships to use graph.tracks/releases/artists/labels instead of params
    # - Change remapCanonicalIds to use graph.tracks/releases/artists/labels and graph.remapRegistry
    # - Remove globalRemapRegistry declaration
    # - Add mergeGenreIntoGlobal method (extracted from main loop)

    # Let's do this with string replacements on builder_body

    # 1. Remove globalRemapRegistry declaration
    builder_body = re.sub(
        r'\n\s*// Global remap registry:.*?\n\s*var globalRemapRegistry = \{[^}]+\};\s*\n',
        '\n',
        builder_body,
        flags=re.DOTALL
    )

    # 2. Change buildCanonicalRelationships signature: remove params, use graph internally
    builder_body = builder_body.replace(
        'function buildCanonicalRelationships(globalTM, globalRM, globalAM, globalLM) {',
        'function buildCanonicalRelationships() {\n    var globalTM = graph.tracks;\n    var globalRM = graph.releases;\n    var globalAM = graph.artists;\n    var globalLM = graph.labels;'
    )

    # 3. Change remapCanonicalIds signature: remove params, use graph internally
    builder_body = builder_body.replace(
        'function remapCanonicalIds(globalTM, globalRM, globalAM, globalLM) {',
        'function remapCanonicalIds() {\n    var globalTM = graph.tracks;\n    var globalRM = graph.releases;\n    var globalAM = graph.artists;\n    var globalLM = graph.labels;'
    )

    # 4. Replace globalRemapRegistry references with graph.remapRegistry
    builder_body = builder_body.replace('globalRemapRegistry', 'graph.remapRegistry')

    # 5. Fix indentation of the wrapped functions (they were at 2-space indent, now need 4-space)
    # Actually, we'll leave indentation as-is — JavaScript doesn't care about indentation.

    # Now construct the builder factory
    builder_factory = """  // ===================================================================
  // CANONICAL GRAPH STRUCTURE
  // ===================================================================
  function createCanonicalGraph() {
    return {
      labels: new Map(),
      artists: new Map(),
      releases: new Map(),
      tracks: new Map(),
      remapRegistry: { track: {}, release: {}, artist: {}, label: {} }
    };
  }

  // ===================================================================
  // CANONICAL GRAPH BUILDER
  //
  // RP-BPI-002C — Encapsulates ALL entity construction logic.
  // The scraper only calls builder methods; it never constructs entities
  // directly. The builder owns:
  //   - Canonical id generators (sequential, independent of Beatport)
  //   - Stable key helpers (for dedup during scraping)
  //   - processTracks (per-genre entity creation)
  //   - mergeGenreIntoGlobal (cross-genre merge into graph)
  //   - remapCanonicalIds (fix orphan canonical ids from cross-genre merge)
  //   - buildCanonicalRelationships (inverse relation arrays)
  //
  // The builder contains NO export logic and NO scraping logic.
  // ===================================================================
  function createCanonicalGraphBuilder(graph) {
    // === Per-genre ranking data (for backward compat rankByGenre/pointsByGenre) ===
    var gR = {};

""" + builder_body + """

    // === mergeGenreIntoGlobal ===
    // Merges per-genre Maps (from fetchGenre) into the global graph.
    // Also populates graph.remapRegistry for orphan canonical id fix.
    function mergeGenreIntoGlobal(res, genreName) {
      var la = Array.from(res.lm.values());
      la.sort(function (a, b) { return b._totalPoints - a._totalPoints; });
      la.forEach(function (l, i) {
        l._rankByGenre[genreName] = i + 1;
        l._pointsByGenre[genreName] = l._totalPoints;
        l.rank = i + 1;
      });
      gR[genreName] = la;

      // === Merge labels ===
      res.lm.forEach(function (v, k) {
        if (graph.labels.has(k)) {
          var exL = graph.labels.get(k);
          if (v.id !== exL.id) {
            graph.remapRegistry.label[v.id] = exL.id;
          }
          exL._trackCount += v._trackCount;
          exL._totalPoints += v._totalPoints;
          if (v._bestPosition < exL._bestPosition) exL._bestPosition = v._bestPosition;
          v._genres.forEach(function (gn2) {
            if (exL._genres.indexOf(gn2) === -1) exL._genres.push(gn2);
          });
          for (var grKey in v._rankByGenre) {
            exL._rankByGenre[grKey] = v._rankByGenre[grKey];
          }
          for (var ppKey in v._pointsByGenre) {
            exL._pointsByGenre[ppKey] = (exL._pointsByGenre[ppKey] || 0) + v._pointsByGenre[ppKey];
          }
          if (!exL.slug && v.slug) exL.slug = v.slug;
          if (!exL.imageUrl && v.imageUrl) exL.imageUrl = v.imageUrl;
          if (exL.beatportId == null && v.beatportId != null) exL.beatportId = v.beatportId;
        } else {
          graph.labels.set(k, v);
        }
      });

      // === Merge artists ===
      res.am.forEach(function (v, k) {
        if (graph.artists.has(k)) {
          var ex = graph.artists.get(k);
          if (v.id !== ex.id) {
            graph.remapRegistry.artist[v.id] = ex.id;
          }
          v._genres.forEach(function (gn2) { if (ex._genres.indexOf(gn2) === -1) ex._genres.push(gn2); });
          v._labelsPublishedOnNames.forEach(function (ln) {
            if (ex._labelsPublishedOnNames.indexOf(ln) === -1) ex._labelsPublishedOnNames.push(ln);
          });
          if (Array.isArray(v.labelIds)) {
            v.labelIds.forEach(function (lId) {
              if (lId && ex.labelIds.indexOf(lId) === -1) ex.labelIds.push(lId);
            });
          }
          for (var gn3 in v._tracksByGenre) {
            if (!ex._tracksByGenre[gn3]) ex._tracksByGenre[gn3] = [];
            v._tracksByGenre[gn3].forEach(function (tr2) { ex._tracksByGenre[gn3].push(tr2); });
          }
          ex._totalPoints += v._totalPoints;
          if (v._bestPosition < ex._bestPosition) ex._bestPosition = v._bestPosition;
          if (!v._isRemixerOnly) ex._isRemixerOnly = false;
        } else {
          graph.artists.set(k, v);
        }
      });

      // === Merge tracks ===
      res.tm.forEach(function (v, k) {
        if (graph.tracks.has(k)) {
          var ex = graph.tracks.get(k);
          if (v.id !== ex.id) {
            graph.remapRegistry.track[v.id] = ex.id;
          }
          v.positions.forEach(function (p) { ex.positions.push(p); });
          if (!ex.releaseId && v.releaseId) ex.releaseId = v.releaseId;
        } else {
          graph.tracks.set(k, v);
        }
      });

      // === Merge releases ===
      res.rm.forEach(function (v, k) {
        if (graph.releases.has(k)) {
          var exR = graph.releases.get(k);
          if (v.id !== exR.id) {
            graph.remapRegistry.release[v.id] = exR.id;
          }
          v.artistIds.forEach(function (cArtId, idx) {
            if (!cArtId) return;
            if (exR.artistIds.indexOf(cArtId) === -1) {
              exR.artistIds.push(cArtId);
              exR._compat.artistBpIds.push(v._compat.artistBpIds[idx] != null ? v._compat.artistBpIds[idx] : null);
              exR._compat.artistNames.push(v._compat.artistNames[idx] || '');
            }
          });
          // Merge remixers into legacy arrays
          var allArtistsRawForLegacyEx = v._compat._allArtistsRaw || [];
          // Actually, remixers are already in _compat.artistBpIds/artistNames from processTracks
          // So we just need to merge any new ones
          var seenLegacyKeysEx = {};
          exR._compat.artistNames.forEach(function (nm) {
            seenLegacyKeysEx[nm.toUpperCase().trim()] = true;
          });
          v._compat.artistNames.forEach(function (nm, idx) {
            var nmUpper = (nm || '').toUpperCase().trim();
            if (nmUpper && !seenLegacyKeysEx[nmUpper]) {
              seenLegacyKeysEx[nmUpper] = true;
              exR._compat.artistBpIds.push(v._compat.artistBpIds[idx] != null ? v._compat.artistBpIds[idx] : null);
              exR._compat.artistNames.push(nm);
            }
          });
          v.trackIds.forEach(function (cTrkId, idx) {
            if (!cTrkId) return;
            if (exR.trackIds.indexOf(cTrkId) === -1) {
              exR.trackIds.push(cTrkId);
            }
            var tBpId = v._compat.trackBpIds[idx];
            if (tBpId != null && exR._compat.trackBpIds.indexOf(tBpId) === -1) {
              exR._compat.trackBpIds.push(tBpId);
            }
          });
          exR.trackCount = exR.trackIds.length;
          v.genres.forEach(function (gn2) {
            if (exR.genres.indexOf(gn2) === -1) exR.genres.push(gn2);
          });
          if (typeof exR._bpmSum !== 'number') {
            exR._bpmSum = exR.bpmAverage || 0;
            exR._bpmCount = exR.bpmAverage != null ? 1 : 0;
          }
          if (typeof v._bpmSum === 'number' && typeof v._bpmCount === 'number') {
            exR._bpmSum += v._bpmSum;
            exR._bpmCount += v._bpmCount;
          } else if (v.bpmAverage != null) {
            exR._bpmSum += v.bpmAverage;
            exR._bpmCount += 1;
          }
          exR.bpmAverage = exR._bpmCount > 0 ? Math.round(exR._bpmSum / exR._bpmCount) : null;
          for (var kk in v.keyDistribution) {
            exR.keyDistribution[kk] = (exR.keyDistribution[kk] || 0) + v.keyDistribution[kk];
          }
          if (v.lastSeen > exR.lastSeen) exR.lastSeen = v.lastSeen;
          if (!exR.labelId && v.labelId) exR.labelId = v.labelId;
          if (!exR._compat.labelId && v._compat.labelId) exR._compat.labelId = v._compat.labelId;
          if (!exR._compat.labelName && v._compat.labelName) exR._compat.labelName = v._compat.labelName;
          if (!exR.imageUrl && v.imageUrl) exR.imageUrl = v.imageUrl;
          if (!exR.releaseDate && v.releaseDate) exR.releaseDate = v.releaseDate;
          if (!exR.catalogNumber && v.catalogNumber) exR.catalogNumber = v.catalogNumber;
          if (!exR.slug && v.slug) exR.slug = v.slug;
          if (!exR.url && v.url) exR.url = v.url;
          if (!exR.name && v.name) exR.name = v.name;
          if (exR.beatportId == null && v.beatportId != null) exR.beatportId = v.beatportId;
        } else {
          graph.releases.set(k, v);
        }
      });

      return la;  // return label array for logging
    }

    return {
      processTracks: processTracks,
      mergeGenreIntoGlobal: mergeGenreIntoGlobal,
      remapCanonicalIds: remapCanonicalIds,
      buildCanonicalRelationships: buildCanonicalRelationships,
      graph: graph
    };
  }

"""

    # === Construct the Exporter factory from build_output_section ===
    # The build_output_section contains:
    #   - "Costruzione JSON" console.log
    #   - Build labelArr from globalLM
    #   - Build artistsArr from globalAM
    #   - Build tracksArr from globalTM
    #   - Build releasesArr from globalRM
    #   - logosCount computation
    #   - var out = { ... }

    # We need to:
    # 1. Replace globalLM → graph.labels, globalAM → graph.artists, etc.
    # 2. Wrap in createExporter function
    # 3. The _meta needs genres (G), scrapedAt (NOW), successGenres (sC), failedGenres (fC)
    #    — these come from the scraper, passed as metaInfo

    exporter_body = build_output_section
    exporter_body = exporter_body.replace('globalLM', 'graph.labels')
    exporter_body = exporter_body.replace('globalAM', 'graph.artists')
    exporter_body = exporter_body.replace('globalTM', 'graph.tracks')
    exporter_body = exporter_body.replace('globalRM', 'graph.releases')

    # Replace G.map with metaInfo.genres.map, NOW with metaInfo.scrapedAt, sC with metaInfo.successGenres, fC with metaInfo.failedGenres
    # But only in the _meta object, not in the build sections
    # Actually, G is used in "G.map(function (g) { return g.name; })" for genres array
    # NOW is used in scrapedAt
    # sC is used in successGenres
    # fC is used in failedGenres
    # G.length is used in totalGenres

    exporter_body = exporter_body.replace('G.map(function (g) { return g.name; })', 'metaInfo.genres.map(function (g) { return g.name; })')
    exporter_body = exporter_body.replace('G.length', 'metaInfo.genres.length')
    exporter_body = exporter_body.replace('scrapedAt: NOW,', 'scrapedAt: metaInfo.scrapedAt,')
    exporter_body = exporter_body.replace('successGenres: sC,', 'successGenres: metaInfo.successGenres,')
    exporter_body = exporter_body.replace('failedGenres: fC', 'failedGenres: metaInfo.failedGenres')

    # Remove the "Costruzione JSON" console.log (it belongs in the main flow, not the exporter)
    exporter_body = re.sub(r'console\.log\(S \+ \' %cCostruzione JSON\.\.\.\', c1, c2\);\n', '', exporter_body)

    exporter_factory = """  // ===================================================================
  // EXPORTER
  //
  // RP-BPI-002C — Receives a CanonicalGraph and produces the final JSON.
  // No scraping logic, no entity construction — only serialization.
  // The output is IDENTICAL to the pre-002C format (same fields, same ordering).
  // ===================================================================
  function createExporter(graph, metaInfo) {
""" + exporter_body + """
    return { export: function () { return out; } };
  }

"""

    # === Update fetchGenre to accept builder parameter ===
    fetchgenre_updated = fetchgenre_section.replace(
        'async function fetchGenre(gid, slug, gn) {',
        'async function fetchGenre(gid, slug, gn, builder) {'
    )
    # Replace all processTracks calls inside fetchGenre with builder.processTracks
    fetchgenre_updated = fetchgenre_updated.replace(
        'processTracks(tr, gn, lm, am, tm, rm);',
        'builder.processTracks(tr, gn, lm, am, tm, rm);'
    )
    fetchgenre_updated = fetchgenre_updated.replace(
        'processTracks(tr2, gn, lm, am, tm, rm);',
        'builder.processTracks(tr2, gn, lm, am, tm, rm);'
    )
    fetchgenre_updated = fetchgenre_updated.replace(
        'processTracks(res, gn, lm, am, tm, rm);',
        'builder.processTracks(res, gn, lm, am, tm, rm);'
    )
    fetchgenre_updated = fetchgenre_updated.replace(
        'processTracks(trk, gn, lm, am, tm, rm);',
        'builder.processTracks(trk, gn, lm, am, tm, rm);'
    )
    fetchgenre_updated = fetchgenre_updated.replace(
        'processTracks(htmlTracks, gn, lm, am, tm, rm);',
        'builder.processTracks(htmlTracks, gn, lm, am, tm, rm);'
    )
    # Also fix the initial "var lm = new Map(), am = new Map(), tm = new Map(), rm = new Map();" line
    # to also include rm (it already does in the current code)

    # === Construct the new main loop ===
    # The main loop now uses the three-phase pipeline:
    # Phase 1: fetchGenre (Beatport Import)
    # Phase 2: builder.mergeGenreIntoGlobal + builder.remapCanonicalIds + builder.buildCanonicalRelationships
    # Phase 3: exporter.export()

    new_main_loop = """  // ===================================================================
  // MAIN: Three-phase pipeline
  //
  // Phase 1: Beatport Import (fetchGenre reads Beatport, calls builder.processTracks)
  // Phase 2: CanonicalGraphBuilder (merge + remap + build relationships)
  // Phase 3: Exporter (serialize graph to JSON)
  // ===================================================================
  console.log(S + ' %c========================================', c1, c1);
  console.log(S + ' %cINIZIO ESTRAZIONE', c1, cOk);
  console.log(S + ' %c========================================', c1, c1);

  var sC = 0, fC = 0, tL = 0;

  // Create the Canonical Graph and Builder
  var graph = createCanonicalGraph();
  var builder = createCanonicalGraphBuilder(graph);

  for (var gi = 0; gi < G.length; gi++) {
    var g = G[gi];
    var pct = Math.round(((gi + 1) / G.length) * 100);
    console.log(S + ' %c[' + pct + '%] ' + g.name + '...', c1, c2);

    // Phase 1: Beatport Import
    var res = await fetchGenre(g.id, g.slug, g.name, builder);

    // Phase 2: Merge per-genre data into the global graph
    var la = builder.mergeGenreIntoGlobal(res, g.name);
    tL += la.length;

    if (la.length > 0) {
      sC++;
      var logosHere = la.filter(function (l) { return l.imageUrl; }).length;
      console.log(S + ' %c  OK ' + la.length + ' label (loghi: ' + logosHere + '/' + la.length + ') \\u2014 ' + res.am.size + ' artisti \\u2014 ' + res.tm.size + ' tracce \\u2014 ' + res.rm.size + ' release \\u2014 #1: ' + la[0].name, c1, cOk);
    } else {
      fC++;
    }
    await sleep(D);
  }

  // Phase 2 (finalize): Fix orphan canonical ids + build inverse relationships
  builder.remapCanonicalIds();
  builder.buildCanonicalRelationships();

  console.log(S + ' %cCostruzione JSON...', c1, c2);

  // Phase 3: Export
  var exporter = createExporter(graph, {
    genres: G,
    scrapedAt: NOW,
    successGenres: sC,
    failedGenres: fC
  });
  var out = exporter.export();

"""

    # === Construct the download section (keep as-is, it's after `var out = ...`) ===
    # The output_download section starts with "var logosCount" and includes "var out = { ... }" + download
    # But we already have "var out = exporter.export();" in the new main loop.
    # So we need to extract ONLY the download part (after "var out = { ... };")
    # Actually, the exporter already produces `out`, so we just need the download code.

    # The download code starts after the _meta object closing brace + "};"
    # Let's find it: it's the "var js = JSON.stringify(out, null, 2)," line
    download_match = re.search(r'(  var js = JSON\.stringify.*?)(  return out;\n\}\)\(\);)', output_download, re.DOTALL)
    if download_match:
        download_section = download_match.group(1)
        ending = download_match.group(2)
    else:
        download_section = ''
        ending = '  return out;\n})();'

    # === Assemble the new file ===
    new_content = header + builder_factory + exporter_factory + fetchgenre_updated + new_main_loop + download_section + ending

    with open(filepath, 'w') as f:
        f.write(new_content)

    print(f"Refactored {filepath} ({len(new_content)} chars)")


if __name__ == '__main__':
    refactor_scraper('/home/z/my-project/scripts/beatport-scraper-v2.js')
