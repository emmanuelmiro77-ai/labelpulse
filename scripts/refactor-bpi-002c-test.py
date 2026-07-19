#!/usr/bin/env python3
"""
RP-BPI-002C — Refactor test-scraper-v2.js into Graph/Builder/Exporter architecture.

Mirrors the scraper refactoring: wraps existing functions in factory functions,
creating a clear three-phase pipeline.
"""

import re

def refactor_test(filepath):
    with open(filepath, 'r') as f:
        content = f.read()

    # The test file has these sections (by function/const declarations):
    # 1. Header + fs + NOW + sampleByGenre (lines 1-125)
    # 2. Canonical ID generators (lines 127-134)
    # 3. Stable key helpers (lines 136-160)
    # 4. processTracks (lines 162-464)
    # 5. buildCanonicalRelationships (lines 466-510)
    # 6. globalRemapRegistry (lines 517-518)
    # 7. remapCanonicalIds (lines 520-549)
    # 8. Run across genres (lines 553-647) — main loop with merge
    # 9. remap + build calls (lines 691-695)
    # 10. Build output (lines 697-840 approx)
    # 11. Output object (lines 842-870 approx)
    # 12. Assertions (lines 872-end)

    # Strategy: wrap sections 2-9 in createCanonicalGraphBuilder,
    # wrap sections 10-11 in createExporter,
    # keep section 1 (header) and section 12 (assertions) as-is but update
    # the main flow to use the factories.

    lines = content.split('\n')

    # Find exact line indices (0-indexed) for section boundaries
    # Section 2 start: "// === RP-BPI-002B — Canonical ID generators"
    # Section 8 end: "// === Build labels output" (start of section 10)
    # Section 11 end: "const out = {" ... "};"
    # Section 12 start: assertions

    # Let's find these by searching for unique markers
    def find_line(prefix, start=0):
        for i in range(start, len(lines)):
            if lines[i].startswith(prefix) or lines[i].strip().startswith(prefix):
                return i
        return -1

    # Section boundaries
    idx_canonical_gen = find_line('// === RP-BPI-002B — Canonical ID generators')
    idx_sample_end = find_line('// === RP-BPI-002A — Beatport-derived stable key helpers')
    # Actually, the stable key helpers are BETWEEN canonical generators and processTracks
    # Let me re-find:
    idx_stable_keys = find_line('// === RP-BPI-002A — Beatport-derived stable key helpers')
    idx_processTracks = find_line('// === Re-implement processTracks')
    idx_buildRel = find_line('// === buildCanonicalRelationships')
    idx_remapReg = find_line('// === Global remap registry')
    idx_remapFunc = find_line('// === remapCanonicalIds')
    idx_run = find_line('// === Run across genres')
    idx_remap_call = find_line('// === Remap canonical ids (fix orphans)')
    idx_build_call = find_line('// === Build canonical relationships (inverse)')
    idx_build_output = find_line('// === Build labels output')
    idx_out_obj = -1
    for i in range(idx_build_output, len(lines)):
        if lines[i].strip().startswith('const out = {'):
            idx_out_obj = i
            break
    idx_assertions = -1
    for i in range(idx_out_obj, len(lines)):
        if '// === ASSERTIONS' in lines[i] or 'let pass = 0' in lines[i]:
            idx_assertions = i
            break
    # Find the end of the out object (line with just '};')
    idx_out_end = -1
    brace_count = 0
    for i in range(idx_out_obj, len(lines)):
        brace_count += lines[i].count('{') - lines[i].count('}')
        if brace_count == 0 and i > idx_out_obj:
            idx_out_end = i
            break

    # Find the end of the build output section (start of out object)
    # The build output sections are: Build labels, Build artists, Build tracks, Build releases, then "const out = {"
    # The Exporter should contain all of these.

    # Header: lines 0 to idx_canonical_gen-1
    header = '\n'.join(lines[0:idx_canonical_gen])

    # Builder body: lines idx_canonical_gen to idx_run-1 (canonical generators + helpers + processTracks + buildCanonicalRelationships + remapRegistry + remapCanonicalIds)
    builder_body = '\n'.join(lines[idx_canonical_gen:idx_run])

    # Main loop (run across genres): lines idx_run to idx_remap_call-1
    main_loop_body = '\n'.join(lines[idx_run:idx_remap_call])

    # Remap + build calls: lines idx_remap_call to idx_build_output-1
    remap_build_calls = '\n'.join(lines[idx_remap_call:idx_build_output])

    # Build output + out object: lines idx_build_output to idx_out_end
    exporter_body = '\n'.join(lines[idx_build_output:idx_out_end+1])

    # Assertions + rest: lines idx_out_end+1 to end
    assertions = '\n'.join(lines[idx_out_end+1:])

    # === Transform builder_body ===
    # Remove the globalRemapRegistry const declaration
    builder_body = re.sub(
        r'// === Global remap registry.*?\nconst globalRemapRegistry = \{[^}]+\};\n',
        '',
        builder_body,
        flags=re.DOTALL
    )

    # Replace globalRemapRegistry with graph.remapRegistry
    builder_body = builder_body.replace('globalRemapRegistry', 'graph.remapRegistry')

    # Change buildCanonicalRelationships signature
    builder_body = builder_body.replace(
        'function buildCanonicalRelationships(globalTM, globalRM, globalAM, globalLM) {',
        'function buildCanonicalRelationships() {\n  var globalTM = graph.tracks;\n  var globalRM = graph.releases;\n  var globalAM = graph.artists;\n  var globalLM = graph.labels;'
    )

    # Change remapCanonicalIds signature
    builder_body = builder_body.replace(
        'function remapCanonicalIds(globalTM, globalRM, globalAM, globalLM) {',
        'function remapCanonicalIds() {\n  var globalTM = graph.tracks;\n  var globalRM = graph.releases;\n  var globalAM = graph.artists;\n  var globalLM = graph.labels;'
    )

    # === Transform main_loop_body ===
    # This is the "Run across genres" section that creates per-genre Maps, calls processTracks,
    # and merges into globalAM/globalTM/globalRM/globalLM.
    # We need to:
    # 1. Replace globalAM → graph.artists, globalTM → graph.tracks, etc.
    # 2. Replace globalRemapRegistry → graph.remapRegistry
    # 3. Replace processTracks call → builder.processTracks (but builder doesn't exist yet at this scope)
    #    Actually, in the test, processTracks is called directly. In the new architecture,
    #    the main loop calls builder.processTracks. But the builder is a factory.
    #    So we need to restructure: the main loop creates a graph + builder, then for each genre,
    #    creates per-genre Maps, calls builder.processTracks, then calls builder.mergeGenreIntoGlobal.

    # Actually, for the test, the simplest approach is to keep the main loop logic as-is
    # but wrap it in a function that operates on the graph. The builder factory will
    # expose processTracks, mergeGenreIntoGlobal, remapCanonicalIds, buildCanonicalRelationships.

    # Let me extract the merge logic from the main loop and make it a mergeGenreIntoGlobal method.

    # The main loop body currently:
    # 1. Creates per-genre Maps
    # 2. Calls processTracks(sampleByGenre[gn], gn, lm, am, tm, rm)
    # 3. Sorts labels + sets rank
    # 4. Merges labels/artists/tracks/releases into global Maps
    # 5. Returns

    # I'll split this into:
    # - The for loop (stays in the test main flow)
    # - builder.processTracks (already a function, becomes a method)
    # - builder.mergeGenreIntoGlobal (extracted from the merge logic)

    # For the test, let me keep it simpler: the test's "main flow" calls the builder methods directly.
    # The builder has: processTracks, mergeGenreIntoGlobal, remapCanonicalIds, buildCanonicalRelationships.

    # Transform exporter_body: replace globalLM → graph.labels, etc.
    exporter_body = exporter_body.replace('globalLM', 'graph.labels')
    exporter_body = exporter_body.replace('globalAM', 'graph.artists')
    exporter_body = exporter_body.replace('globalTM', 'graph.tracks')
    exporter_body = exporter_body.replace('globalRM', 'graph.releases')

    # === Construct the new test file ===
    new_content = header + """

// ===================================================================
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
// ===================================================================
function createCanonicalGraphBuilder(graph) {
  var gR = {};

""" + builder_body + """

  // === mergeGenreIntoGlobal ===
  function mergeGenreIntoGlobal(lm, am, tm, rm, genreName) {
    const la = Array.from(lm.values());
    la.sort((a, b) => b._totalPoints - a._totalPoints);
    la.forEach((l, i) => {
      l._rankByGenre[genreName] = i + 1;
      l._pointsByGenre[genreName] = l._totalPoints;
      l.rank = i + 1;
    });
    gR[genreName] = la;

    // Merge labels
    lm.forEach((v, k) => {
      if (graph.labels.has(k)) {
        const exL = graph.labels.get(k);
        if (v.id !== exL.id) {
          graph.remapRegistry.label[v.id] = exL.id;
        }
        exL._trackCount += v._trackCount;
        exL._totalPoints += v._totalPoints;
        if (v._bestPosition < exL._bestPosition) exL._bestPosition = v._bestPosition;
        v._genres.forEach(gn2 => { if (!exL._genres.includes(gn2)) exL._genres.push(gn2); });
        for (const grKey in v._rankByGenre) exL._rankByGenre[grKey] = v._rankByGenre[grKey];
        for (const ppKey in v._pointsByGenre) exL._pointsByGenre[ppKey] = (exL._pointsByGenre[ppKey] || 0) + v._pointsByGenre[ppKey];
        if (!exL.slug && v.slug) exL.slug = v.slug;
        if (!exL.imageUrl && v.imageUrl) exL.imageUrl = v.imageUrl;
        if (exL.beatportId == null && v.beatportId != null) exL.beatportId = v.beatportId;
      } else {
        graph.labels.set(k, v);
      }
    });

    // Merge artists
    am.forEach((v, k) => {
      if (graph.artists.has(k)) {
        const ex = graph.artists.get(k);
        if (v.id !== ex.id) {
          graph.remapRegistry.artist[v.id] = ex.id;
        }
        v._genres.forEach(gn2 => { if (!ex._genres.includes(gn2)) ex._genres.push(gn2); });
        v._labelsPublishedOnNames.forEach(ln => { if (!ex._labelsPublishedOnNames.includes(ln)) ex._labelsPublishedOnNames.push(ln); });
        if (Array.isArray(v.labelIds)) {
          v.labelIds.forEach(lId => { if (lId && !ex.labelIds.includes(lId)) ex.labelIds.push(lId); });
        }
        for (const gn3 in v._tracksByGenre) {
          if (!ex._tracksByGenre[gn3]) ex._tracksByGenre[gn3] = [];
          ex._tracksByGenre[gn3].push(...v._tracksByGenre[gn3]);
        }
        ex._totalPoints += v._totalPoints;
        if (v._bestPosition < ex._bestPosition) ex._bestPosition = v._bestPosition;
        if (!v._isRemixerOnly) ex._isRemixerOnly = false;
      } else {
        graph.artists.set(k, v);
      }
    });

    // Merge tracks
    tm.forEach((v, k) => {
      if (graph.tracks.has(k)) {
        const ex = graph.tracks.get(k);
        if (v.id !== ex.id) {
          graph.remapRegistry.track[v.id] = ex.id;
        }
        ex.positions.push(...v.positions);
        if (!ex.releaseId && v.releaseId) ex.releaseId = v.releaseId;
      } else {
        graph.tracks.set(k, v);
      }
    });

    // Merge releases
    rm.forEach((v, k) => {
      if (graph.releases.has(k)) {
        const exR = graph.releases.get(k);
        if (v.id !== exR.id) {
          graph.remapRegistry.release[v.id] = exR.id;
        }
        v.artistIds.forEach((cArtId, idx) => {
          if (!cArtId) return;
          if (!exR.artistIds.includes(cArtId)) {
            exR.artistIds.push(cArtId);
            exR._compat.artistBpIds.push(v._compat.artistBpIds[idx] != null ? v._compat.artistBpIds[idx] : null);
            exR._compat.artistNames.push(v._compat.artistNames[idx] || '');
          }
        });
        // Merge remixers into legacy arrays
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
        v.trackIds.forEach((cTrkId, idx) => {
          if (!cTrkId) return;
          if (!exR.trackIds.includes(cTrkId)) exR.trackIds.push(cTrkId);
          const tBpId = v._compat.trackBpIds[idx];
          if (tBpId != null && !exR._compat.trackBpIds.includes(tBpId)) exR._compat.trackBpIds.push(tBpId);
        });
        exR.trackCount = exR.trackIds.length;
        v.genres.forEach(gn2 => { if (!exR.genres.includes(gn2)) exR.genres.push(gn2); });
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
        for (const kk in v.keyDistribution) {
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

    return la;
  }

  return {
    processTracks: processTracks,
    mergeGenreIntoGlobal: mergeGenreIntoGlobal,
    remapCanonicalIds: remapCanonicalIds,
    buildCanonicalRelationships: buildCanonicalRelationships,
    graph: graph
  };
}

// ===================================================================
// EXPORTER
// ===================================================================
function createExporter(graph, metaInfo) {
""" + exporter_body + """

  return { export: function () { return out; } };
}

// ===================================================================
// MAIN: Three-phase pipeline
// ===================================================================

// Create the Canonical Graph and Builder
const graph = createCanonicalGraph();
const builder = createCanonicalGraphBuilder(graph);

// Phase 1+2: Beatport Import + Graph construction
for (const gn of Object.keys(sampleByGenre)) {
  const lm = new Map(), am = new Map(), tm = new Map(), rm = new Map();
  builder.processTracks(sampleByGenre[gn], gn, lm, am, tm, rm);
  builder.mergeGenreIntoGlobal(lm, am, tm, rm, gn);
}

// Phase 2 (finalize): Fix orphan canonical ids + build inverse relationships
builder.remapCanonicalIds();
builder.buildCanonicalRelationships();

// Phase 3: Export
const exporter = createExporter(graph, {
  genres: Object.keys(sampleByGenre),
  scrapedAt: NOW,
  successGenres: Object.keys(sampleByGenre).length,
  failedGenres: 0
});
const out = exporter.export();

""" + assertions

    with open(filepath, 'w') as f:
        f.write(new_content)

    print(f"Refactored {filepath} ({len(new_content)} chars)")


if __name__ == '__main__':
    refactor_test('/home/z/my-project/scripts/test-scraper-v2.js')
