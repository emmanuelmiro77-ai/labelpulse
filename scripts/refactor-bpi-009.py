#!/usr/bin/env python3
"""
RP-BPI-009 — Refactor CanonicalGraphBuilder: extract engines.

Extracts 5 engine factories from the builder:
  - HistoryEngine  (positionHistory management)
  - TrendEngine    (trend + trendScore)
  - MomentumEngine (momentum)
  - StatusEngine   (status)
  - InsightsEngine (insights)

The builder creates instances and delegates to them.
No behavior changes, no new fields, identical JSON output.
"""

import re

def refactor_scraper(filepath):
    with open(filepath, 'r') as f:
        content = f.read()

    # 1. Replace the 5 standalone compute functions (lines 189-353 approximately)
    # with 5 engine factory functions.
    # The block starts at the RP-BPI-004 comment and ends right before processTracks.

    # Find the block to replace: from "// RP-BPI-004 — TRACK TREND ENGINE" to just before "// processTracks:"
    # Actually, let's find from the first compute function comment to the last compute function's closing brace.
    old_block_start = content.find('  // ===================================================================\n  // RP-BPI-004 — TRACK TREND ENGINE')
    old_block_end = content.find('  // ===================================================================\n  // processTracks:')
    if old_block_start == -1 or old_block_end == -1:
        print("ERROR: Could not find block boundaries")
        return

    old_block = content[old_block_start:old_block_end]

    new_block = """  // ===================================================================
  // RP-BPI-009 — ENGINE MODULES
  //
  // The builder's computation logic is extracted into 5 internal engine
  // modules. Each engine contains exclusively its own logic. The builder
  // coordinates their execution.
  // ===================================================================

  // --- HistoryEngine (RP-BPI-003) ---
  // Manages positionHistory: adding entries with dedup, and merging
  // per-genre histories into the global track.
  function createHistoryEngine() {
    function addEntry(positionHistory, scrapedAt, genreId, genreName, position) {
      var lastEntry = positionHistory.length > 0 ? positionHistory[positionHistory.length - 1] : null;
      var differs = !lastEntry || lastEntry.genreName !== genreName || lastEntry.position !== position;
      if (differs) {
        positionHistory.push({ scrapedAt: scrapedAt, genreId: genreId, genreName: genreName, position: position });
        return true;
      }
      return false;
    }
    function mergeHistory(targetHistory, sourceHistory) {
      var phAdded = false;
      sourceHistory.forEach(function (phEntry) {
        var lastPh = targetHistory.length > 0 ? targetHistory[targetHistory.length - 1] : null;
        var phDiffers = !lastPh || lastPh.genreName !== phEntry.genreName || lastPh.position !== phEntry.position;
        if (phDiffers) {
          targetHistory.push(phEntry);
          phAdded = true;
        }
      });
      return phAdded;
    }
    return { addEntry: addEntry, mergeHistory: mergeHistory };
  }

  // --- TrendEngine (RP-BPI-004 + RP-BPI-005) ---
  // Computes trend and trendScore from positionHistory.
  function createTrendEngine() {
    function computeTrend(positionHistory, currentGenreName) {
      if (!Array.isArray(positionHistory) || positionHistory.length <= 1) {
        return 'new';
      }
      var genre = currentGenreName || positionHistory[positionHistory.length - 1].genreName;
      var sameGenre = positionHistory.filter(function (e) { return e.genreName === genre; });
      if (sameGenre.length < 2) {
        return 'new';
      }
      var last = sameGenre[sameGenre.length - 1];
      var prev = sameGenre[sameGenre.length - 2];
      if (last.position < prev.position) return 'up';
      if (last.position > prev.position) return 'down';
      return 'stable';
    }
    function computeTrendScore(positionHistory, currentGenreName, prevTrendScore) {
      var trend = computeTrend(positionHistory, currentGenreName);
      if (trend === 'new') {
        return 50;
      }
      if (trend === 'stable') {
        return prevTrendScore;
      }
      var genre = currentGenreName || positionHistory[positionHistory.length - 1].genreName;
      var sameGenre = positionHistory.filter(function (e) { return e.genreName === genre; });
      var last = sameGenre[sameGenre.length - 1];
      var prev = sameGenre[sameGenre.length - 2];
      var delta = prev.position - last.position;
      var score = (typeof prevTrendScore === 'number' ? prevTrendScore : 50) + delta;
      if (score < 0) score = 0;
      if (score > 100) score = 100;
      return score;
    }
    return { computeTrend: computeTrend, computeTrendScore: computeTrendScore };
  }

  // --- MomentumEngine (RP-BPI-006) ---
  // Computes momentum from the last 3 same-genre entries.
  function createMomentumEngine() {
    function computeMomentum(positionHistory, currentGenreName) {
      if (!Array.isArray(positionHistory) || positionHistory.length < 3) {
        return 0;
      }
      var genre = currentGenreName || positionHistory[positionHistory.length - 1].genreName;
      var sameGenre = positionHistory.filter(function (e) { return e.genreName === genre; });
      if (sameGenre.length < 3) {
        return 0;
      }
      var p1 = sameGenre[sameGenre.length - 3].position;
      var p2 = sameGenre[sameGenre.length - 2].position;
      var p3 = sameGenre[sameGenre.length - 1].position;
      var delta1 = p2 - p1;
      var delta2 = p3 - p2;
      var momentum = -(delta1 + delta2);
      if (momentum < -100) momentum = -100;
      if (momentum > 100) momentum = 100;
      return momentum;
    }
    return { computeMomentum: computeMomentum };
  }

  // --- StatusEngine (RP-BPI-007) ---
  // Determines status from trend, trendScore, and momentum.
  function createStatusEngine() {
    function computeStatus(trend, trendScore, momentum) {
      if (trend === 'new') return 'emerging';
      if (momentum > 20 && trendScore >= 60) return 'rising';
      if (momentum < -20 && trendScore <= 40) return 'declining';
      if (trend === 'stable') return 'stable';
      return 'cold';
    }
    return { computeStatus: computeStatus };
  }

  // --- InsightsEngine (RP-BPI-008) ---
  // Builds insights object from positionHistory.
  function createInsightsEngine() {
    function computeInsights(positionHistory) {
      if (!Array.isArray(positionHistory) || positionHistory.length === 0) {
        return {
          hasHistory: false,
          historyEntries: 0,
          latestGenre: null,
          latestPosition: null,
          bestPosition: null,
          worstPosition: null
        };
      }
      var last = positionHistory[positionHistory.length - 1];
      var positions = positionHistory.map(function (e) { return e.position; });
      return {
        hasHistory: true,
        historyEntries: positionHistory.length,
        latestGenre: last.genreName,
        latestPosition: last.position,
        bestPosition: Math.min.apply(null, positions),
        worstPosition: Math.max.apply(null, positions)
      };
    }
    return { computeInsights: computeInsights };
  }

"""

    content = content[:old_block_start] + new_block + content[old_block_end:]

    # 2. Add engine instantiation at the top of createCanonicalGraphBuilder
    # Find "var gR = {};" inside the builder and add engine instances after it
    content = content.replace(
        '    var gR = {};\n',
        '    var gR = {};\n\n'
        '    // RP-BPI-009 — Engine instances\n'
        '    var historyEngine = createHistoryEngine();\n'
        '    var trendEngine = createTrendEngine();\n'
        '    var momentumEngine = createMomentumEngine();\n'
        '    var statusEngine = createStatusEngine();\n'
        '    var insightsEngine = createInsightsEngine();\n'
    )

    # 3. Replace call sites in processTracks (new track creation)
    # The new track uses computeInsights([{ scrapedAt: NOW, ... }])
    content = content.replace(
        'insights: computeInsights([{ scrapedAt: NOW, genreId: gid, genreName: gn, position: pos }]),',
        'insights: insightsEngine.computeInsights([{ scrapedAt: NOW, genreId: gid, genreName: gn, position: pos }]),'
    )

    # 4. Replace call sites in processTracks (existing track, differs branch)
    # Replace the inline dedup + compute block
    content = content.replace(
        '        var ph = tr.positionHistory;\n'
        '        var lastEntry = ph.length > 0 ? ph[ph.length - 1] : null;\n'
        '        var differs = !lastEntry || lastEntry.genreName !== gn || lastEntry.position !== pos;\n'
        '        if (differs) {\n'
        '          ph.push({ scrapedAt: NOW, genreId: gid, genreName: gn, position: pos });\n'
        '          // RP-BPI-004 — Ricalcola il trend dopo l\'aggiornamento di positionHistory.\n'
        '          tr.trend = computeTrend(ph, gn);\n'
        '          // RP-BPI-005 — Ricalcola trendScore\n'
        '          tr.trendScore = computeTrendScore(ph, gn, tr.trendScore);\n'
        '          // RP-BPI-006 — Ricalcola momentum\n'
        '          tr.momentum = computeMomentum(ph, gn);\n'
        '          // RP-BPI-007 — Ricalcola status\n'
        '          tr.status = computeStatus(tr.trend, tr.trendScore, tr.momentum);\n'
        '          // RP-BPI-008 — Ricalcola insights\n'
        '          tr.insights = computeInsights(ph);\n'
        '        } else {\n'
        '          // Dedup: posizione invariata → trend = "stable", trendScore invariato.\n'
        '          tr.trend = \'stable\';\n'
        '          // RP-BPI-007 — Ricalcola status (trend changed to "stable")\n'
        '          tr.status = computeStatus(tr.trend, tr.trendScore, tr.momentum);\n'
        '          // RP-BPI-008 — Ricalcola insights (positionHistory unchanged, but recompute for consistency)\n'
        '          tr.insights = computeInsights(ph);\n'
        '        }',

        '        var ph = tr.positionHistory;\n'
        '        var added = historyEngine.addEntry(ph, NOW, gid, gn, pos);\n'
        '        if (added) {\n'
        '          // RP-BPI-004/005/006/007/008 — Recompute all derived fields via engines\n'
        '          tr.trend = trendEngine.computeTrend(ph, gn);\n'
        '          tr.trendScore = trendEngine.computeTrendScore(ph, gn, tr.trendScore);\n'
        '          tr.momentum = momentumEngine.computeMomentum(ph, gn);\n'
        '          tr.status = statusEngine.computeStatus(tr.trend, tr.trendScore, tr.momentum);\n'
        '          tr.insights = insightsEngine.computeInsights(ph);\n'
        '        } else {\n'
        '          // Dedup: posizione invariata → trend = "stable"\n'
        '          tr.trend = \'stable\';\n'
        '          tr.status = statusEngine.computeStatus(tr.trend, tr.trendScore, tr.momentum);\n'
        '          tr.insights = insightsEngine.computeInsights(ph);\n'
        '        }'
    )

    # 5. Replace call sites in mergeGenreIntoGlobal
    # The merge logic currently has inline phAdded tracking + compute calls
    content = content.replace(
        '          // RP-BPI-003 — Merge positionHistory: append per-genre entries\n'
        '          // with dedup (skip if same genreName+position as last entry).\n'
        '          var phAdded = false;\n'
        '          v.positionHistory.forEach(function (phEntry) {\n'
        '            var lastPh = ex.positionHistory.length > 0 ? ex.positionHistory[ex.positionHistory.length - 1] : null;\n'
        '            var phDiffers = !lastPh || lastPh.genreName !== phEntry.genreName || lastPh.position !== phEntry.position;\n'
        '            if (phDiffers) {\n'
        '              ex.positionHistory.push(phEntry);\n'
        '              phAdded = true;\n'
        '            }\n'
        '          });\n'
        '          // RP-BPI-004/005/006/007 — Ricalcola trend, trendScore, momentum e status\n'
        '          // solo se nuove entry sono state aggiunte. Su dedup (nessuna nuova entry),\n'
        '          // il trend viene impostato a "stable" e lo status viene ricalcolato.\n'
        '          if (phAdded && ex.positionHistory.length > 0) {\n'
        '            ex.trend = computeTrend(ex.positionHistory, ex.positionHistory[ex.positionHistory.length - 1].genreName);\n'
        '            ex.trendScore = computeTrendScore(ex.positionHistory, ex.positionHistory[ex.positionHistory.length - 1].genreName, ex.trendScore);\n'
        '            ex.momentum = computeMomentum(ex.positionHistory, ex.positionHistory[ex.positionHistory.length - 1].genreName);\n'
        '            ex.status = computeStatus(ex.trend, ex.trendScore, ex.momentum);\n'
        '            // RP-BPI-008 — Ricalcola insights\n'
        '            ex.insights = computeInsights(ex.positionHistory);\n'
        '          } else if (ex.positionHistory.length > 0) {\n'
        '            // Dedup: posizione invariata → trend = "stable", status ricalcolato.\n'
        '            ex.trend = \'stable\';\n'
        '            ex.status = computeStatus(ex.trend, ex.trendScore, ex.momentum);\n'
        '            // RP-BPI-008 — Ricalcola insights\n'
        '            ex.insights = computeInsights(ex.positionHistory);\n'
        '          }',

        '          // RP-BPI-003/009 — Merge positionHistory via HistoryEngine\n'
        '          var phAdded = historyEngine.mergeHistory(ex.positionHistory, v.positionHistory);\n'
        '          // RP-BPI-004/005/006/007/008/009 — Ricalcola tutti i campi derivati via engines\n'
        '          if (phAdded && ex.positionHistory.length > 0) {\n'
        '            ex.trend = trendEngine.computeTrend(ex.positionHistory, ex.positionHistory[ex.positionHistory.length - 1].genreName);\n'
        '            ex.trendScore = trendEngine.computeTrendScore(ex.positionHistory, ex.positionHistory[ex.positionHistory.length - 1].genreName, ex.trendScore);\n'
        '            ex.momentum = momentumEngine.computeMomentum(ex.positionHistory, ex.positionHistory[ex.positionHistory.length - 1].genreName);\n'
        '            ex.status = statusEngine.computeStatus(ex.trend, ex.trendScore, ex.momentum);\n'
        '            ex.insights = insightsEngine.computeInsights(ex.positionHistory);\n'
        '          } else if (ex.positionHistory.length > 0) {\n'
        '            ex.trend = \'stable\';\n'
        '            ex.status = statusEngine.computeStatus(ex.trend, ex.trendScore, ex.momentum);\n'
        '            ex.insights = insightsEngine.computeInsights(ex.positionHistory);\n'
        '          }'
    )

    with open(filepath, 'w') as f:
        f.write(content)
    print(f"Refactored {filepath} ({len(content)} chars)")


def refactor_test(filepath):
    with open(filepath, 'r') as f:
        content = f.read()

    # Same transformation as the scraper, but for the test file.
    # The test has the same structure: standalone compute functions inside
    # createCanonicalGraphBuilder, and the same call sites.

    # 1. Replace the 5 standalone compute functions with 5 engine factory functions.
    # In the test, these are defined OUTSIDE the builder (at module level).
    # We need to wrap them in factory functions and move them inside the builder.

    # Find the block from computeTrend to computeInsights
    old_block_start = content.find('// === RP-BPI-004 — Track Trend Engine ===')
    old_block_end = content.find('// === RP-BPI-002A — Beatport-derived stable key helpers')
    if old_block_start == -1 or old_block_end == -1:
        print("ERROR: Could not find compute function block in test")
        return

    old_block = content[old_block_start:old_block_end]

    new_block = """// === RP-BPI-009 — ENGINE MODULES (mirrors the scraper) ===

// --- HistoryEngine (RP-BPI-003) ---
function createHistoryEngine() {
  function addEntry(positionHistory, scrapedAt, genreId, genreName, position) {
    var lastEntry = positionHistory.length > 0 ? positionHistory[positionHistory.length - 1] : null;
    var differs = !lastEntry || lastEntry.genreName !== genreName || lastEntry.position !== position;
    if (differs) {
      positionHistory.push({ scrapedAt: scrapedAt, genreId: genreId, genreName: genreName, position: position });
      return true;
    }
    return false;
  }
  function mergeHistory(targetHistory, sourceHistory) {
    var phAdded = false;
    sourceHistory.forEach(function (phEntry) {
      var lastPh = targetHistory.length > 0 ? targetHistory[targetHistory.length - 1] : null;
      var phDiffers = !lastPh || lastPh.genreName !== phEntry.genreName || lastPh.position !== phEntry.position;
      if (phDiffers) {
        targetHistory.push(phEntry);
        phAdded = true;
      }
    });
    return phAdded;
  }
  return { addEntry: addEntry, mergeHistory: mergeHistory };
}

// --- TrendEngine (RP-BPI-004 + RP-BPI-005) ---
function createTrendEngine() {
  function computeTrend(positionHistory, currentGenreName) {
    if (!Array.isArray(positionHistory) || positionHistory.length <= 1) {
      return 'new';
    }
    var genre = currentGenreName || positionHistory[positionHistory.length - 1].genreName;
    var sameGenre = positionHistory.filter(function (e) { return e.genreName === genre; });
    if (sameGenre.length < 2) {
      return 'new';
    }
    var last = sameGenre[sameGenre.length - 1];
    var prev = sameGenre[sameGenre.length - 2];
    if (last.position < prev.position) return 'up';
    if (last.position > prev.position) return 'down';
    return 'stable';
  }
  function computeTrendScore(positionHistory, currentGenreName, prevTrendScore) {
    var trend = computeTrend(positionHistory, currentGenreName);
    if (trend === 'new') {
      return 50;
    }
    if (trend === 'stable') {
      return prevTrendScore;
    }
    var genre = currentGenreName || positionHistory[positionHistory.length - 1].genreName;
    var sameGenre = positionHistory.filter(function (e) { return e.genreName === genre; });
    var last = sameGenre[sameGenre.length - 1];
    var prev = sameGenre[sameGenre.length - 2];
    var delta = prev.position - last.position;
    var score = (typeof prevTrendScore === 'number' ? prevTrendScore : 50) + delta;
    if (score < 0) score = 0;
    if (score > 100) score = 100;
    return score;
  }
  return { computeTrend: computeTrend, computeTrendScore: computeTrendScore };
}

// --- MomentumEngine (RP-BPI-006) ---
function createMomentumEngine() {
  function computeMomentum(positionHistory, currentGenreName) {
    if (!Array.isArray(positionHistory) || positionHistory.length < 3) {
      return 0;
    }
    var genre = currentGenreName || positionHistory[positionHistory.length - 1].genreName;
    var sameGenre = positionHistory.filter(function (e) { return e.genreName === genre; });
    if (sameGenre.length < 3) {
      return 0;
    }
    var p1 = sameGenre[sameGenre.length - 3].position;
    var p2 = sameGenre[sameGenre.length - 2].position;
    var p3 = sameGenre[sameGenre.length - 1].position;
    var delta1 = p2 - p1;
    var delta2 = p3 - p2;
    var momentum = -(delta1 + delta2);
    if (momentum < -100) momentum = -100;
    if (momentum > 100) momentum = 100;
    return momentum;
  }
  return { computeMomentum: computeMomentum };
}

// --- StatusEngine (RP-BPI-007) ---
function createStatusEngine() {
  function computeStatus(trend, trendScore, momentum) {
    if (trend === 'new') return 'emerging';
    if (momentum > 20 && trendScore >= 60) return 'rising';
    if (momentum < -20 && trendScore <= 40) return 'declining';
    if (trend === 'stable') return 'stable';
    return 'cold';
  }
  return { computeStatus: computeStatus };
}

// --- InsightsEngine (RP-BPI-008) ---
function createInsightsEngine() {
  function computeInsights(positionHistory) {
    if (!Array.isArray(positionHistory) || positionHistory.length === 0) {
      return {
        hasHistory: false,
        historyEntries: 0,
        latestGenre: null,
        latestPosition: null,
        bestPosition: null,
        worstPosition: null
      };
    }
    var last = positionHistory[positionHistory.length - 1];
    var positions = positionHistory.map(function (e) { return e.position; });
    return {
      hasHistory: true,
      historyEntries: positionHistory.length,
      latestGenre: last.genreName,
      latestPosition: last.position,
      bestPosition: Math.min.apply(null, positions),
      worstPosition: Math.max.apply(null, positions)
    };
  }
  return { computeInsights: computeInsights };
}

"""

    content = content[:old_block_start] + new_block + content[old_block_end:]

    # 2. Add engine instantiation at the top of createCanonicalGraphBuilder
    content = content.replace(
        '  var gR = {};\n',
        '  var gR = {};\n\n'
        '  // RP-BPI-009 — Engine instances\n'
        '  var historyEngine = createHistoryEngine();\n'
        '  var trendEngine = createTrendEngine();\n'
        '  var momentumEngine = createMomentumEngine();\n'
        '  var statusEngine = createStatusEngine();\n'
        '  var insightsEngine = createInsightsEngine();\n'
    )

    # 3. Replace call sites in processTracks (new track creation)
    content = content.replace(
        'insights: computeInsights([{ scrapedAt: NOW, genreId: gid, genreName: gn, position: pos }]),',
        'insights: insightsEngine.computeInsights([{ scrapedAt: NOW, genreId: gid, genreName: gn, position: pos }]),'
    )

    # 4. Replace call sites in processTracks (existing track)
    content = content.replace(
        '      var ph = tr.positionHistory;\n'
        '      var lastEntry = ph.length > 0 ? ph[ph.length - 1] : null;\n'
        '      var differs = !lastEntry || lastEntry.genreName !== gn || lastEntry.position !== pos;\n'
        '      if (differs) {\n'
        '        ph.push({ scrapedAt: NOW, genreId: gid, genreName: gn, position: pos });\n'
        '        // RP-BPI-004 — Ricalcola trend\n'
        '        tr.trend = computeTrend(ph, gn);\n'
        '        // RP-BPI-005 — Ricalcola trendScore\n'
        '        tr.trendScore = computeTrendScore(ph, gn, tr.trendScore);\n'
        '        // RP-BPI-006 — Ricalcola momentum\n'
        '        tr.momentum = computeMomentum(ph, gn);\n'
        '        // RP-BPI-007 — Ricalcola status\n'
        '        tr.status = computeStatus(tr.trend, tr.trendScore, tr.momentum);\n'
        '        // RP-BPI-008 — Ricalcola insights\n'
        '        tr.insights = computeInsights(ph);\n'
        '      } else {\n'
        '        // Dedup: posizione invariata → trend = "stable", trendScore invariato.\n'
        '        tr.trend = \'stable\';\n'
        '        // RP-BPI-007 — Ricalcola status (trend changed to stable)\n'
        '        tr.status = computeStatus(tr.trend, tr.trendScore, tr.momentum);\n'
        '        // RP-BPI-008 — Ricalcola insights\n'
        '        tr.insights = computeInsights(ph);\n'
        '      }',

        '      var ph = tr.positionHistory;\n'
        '      var added = historyEngine.addEntry(ph, NOW, gid, gn, pos);\n'
        '      if (added) {\n'
        '        // RP-BPI-004/005/006/007/008 — Recompute all derived fields via engines\n'
        '        tr.trend = trendEngine.computeTrend(ph, gn);\n'
        '        tr.trendScore = trendEngine.computeTrendScore(ph, gn, tr.trendScore);\n'
        '        tr.momentum = momentumEngine.computeMomentum(ph, gn);\n'
        '        tr.status = statusEngine.computeStatus(tr.trend, tr.trendScore, tr.momentum);\n'
        '        tr.insights = insightsEngine.computeInsights(ph);\n'
        '      } else {\n'
        '        // Dedup: posizione invariata → trend = "stable"\n'
        '        tr.trend = \'stable\';\n'
        '        tr.status = statusEngine.computeStatus(tr.trend, tr.trendScore, tr.momentum);\n'
        '        tr.insights = insightsEngine.computeInsights(ph);\n'
        '      }'
    )

    # 5. Replace call sites in mergeGenreIntoGlobal
    content = content.replace(
        '        // RP-BPI-003 — Merge positionHistory with dedup\n'
        '        var phAdded = false;\n'
        '        v.positionHistory.forEach(function (phEntry) {\n'
        '          var lastPh = ex.positionHistory.length > 0 ? ex.positionHistory[ex.positionHistory.length - 1] : null;\n'
        '          var phDiffers = !lastPh || lastPh.genreName !== phEntry.genreName || lastPh.position !== phEntry.position;\n'
        '          if (phDiffers) {\n'
        '            ex.positionHistory.push(phEntry);\n'
        '            phAdded = true;\n'
        '          }\n'
        '        });\n'
        '        // RP-BPI-004/005/006/007 — Ricalcola trend, trendScore, momentum e status\n'
        '        // solo se nuove entry sono state aggiunte. Su dedup (nessuna nuova entry),\n'
        '        // il trend viene impostato a "stable" e lo status viene ricalcolato.\n'
        '        if (phAdded && ex.positionHistory.length > 0) {\n'
        '          ex.trend = computeTrend(ex.positionHistory, ex.positionHistory[ex.positionHistory.length - 1].genreName);\n'
        '          ex.trendScore = computeTrendScore(ex.positionHistory, ex.positionHistory[ex.positionHistory.length - 1].genreName, ex.trendScore);\n'
        '          ex.momentum = computeMomentum(ex.positionHistory, ex.positionHistory[ex.positionHistory.length - 1].genreName);\n'
        '          ex.status = computeStatus(ex.trend, ex.trendScore, ex.momentum);\n'
        '            ex.insights = computeInsights(ex.positionHistory);\n'
        '        } else if (ex.positionHistory.length > 0) {\n'
        '          // Dedup: posizione invariata → trend = "stable", status ricalcolato.\n'
        '          ex.trend = \'stable\';\n'
        '          ex.status = computeStatus(ex.trend, ex.trendScore, ex.momentum);\n'
        '            ex.insights = computeInsights(ex.positionHistory);\n'
        '        }',

        '        // RP-BPI-003/009 — Merge positionHistory via HistoryEngine\n'
        '        var phAdded = historyEngine.mergeHistory(ex.positionHistory, v.positionHistory);\n'
        '        // RP-BPI-004/005/006/007/008/009 — Ricalcola tutti i campi derivati via engines\n'
        '        if (phAdded && ex.positionHistory.length > 0) {\n'
        '          ex.trend = trendEngine.computeTrend(ex.positionHistory, ex.positionHistory[ex.positionHistory.length - 1].genreName);\n'
        '          ex.trendScore = trendEngine.computeTrendScore(ex.positionHistory, ex.positionHistory[ex.positionHistory.length - 1].genreName, ex.trendScore);\n'
        '          ex.momentum = momentumEngine.computeMomentum(ex.positionHistory, ex.positionHistory[ex.positionHistory.length - 1].genreName);\n'
        '          ex.status = statusEngine.computeStatus(ex.trend, ex.trendScore, ex.momentum);\n'
        '          ex.insights = insightsEngine.computeInsights(ex.positionHistory);\n'
        '        } else if (ex.positionHistory.length > 0) {\n'
        '          ex.trend = \'stable\';\n'
        '          ex.status = statusEngine.computeStatus(ex.trend, ex.trendScore, ex.momentum);\n'
        '          ex.insights = insightsEngine.computeInsights(ex.positionHistory);\n'
        '        }'
    )

    with open(filepath, 'w') as f:
        f.write(content)
    print(f"Refactored {filepath} ({len(content)} chars)")


if __name__ == '__main__':
    refactor_scraper('/home/z/my-project/scripts/beatport-scraper-v2.js')
    refactor_test('/home/z/my-project/scripts/test-scraper-v2.js')
