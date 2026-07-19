// ===================================================================
// Offline test: simulate scraper execution with sample Beatport tracks.
// Validates RP-BPI-001 (releases), RP-BPI-002A (stable IDs),
//            RP-BPI-002B (Canonical Data Model).
//
// RP-BPI-002B invariants tested:
//   1. Each entity has ONE canonical id (canonicalId field).
//   2. All relationships use canonical ids exclusively.
//   3. beatportId is an attribute, NEVER used as relational key.
//   4. No relation field (releaseId, labelId, artistIds[], remixerIds[],
//      trackIds[], releaseIds[], labelIds[]) contains a beatportId.
//   5. All canonical id references point to existing entities.
//   6. Complete backward compat: all legacy fields still present.
// ===================================================================
const fs = require('fs');

const NOW = '2026-06-21T10:00:00.000Z';

// === Sample Beatport tracks (3 genres, 8 tracks, cross-genre duplicates) ===
const sampleByGenre = {
  'Tech House': [
    {
      id: 19711254, name: 'palm of my hands', mix_name: 'Odd Mob Extended Remix', slug: 'palm-of-my-hands',
      artists: [{ id: 610028, name: 'John Summit', slug: 'john-summit', image: { uri: 'https://example.com/summit.jpg' } },
                { id: 1068825, name: 'venbee', slug: 'venbee', image: { uri: 'https://example.com/venbee.jpg' } }],
      remixers: [{ id: 353575, name: 'Odd Mob', slug: 'odd-mob', image: { uri: 'https://example.com/odd.jpg' } }],
      bpm: 132,
      key: { id: 2, name: 'Eb Minor', camelot_number: 2, camelot_letter: 'A' },
      publish_date: '2024-11-08',
      release: { id: 4803379, slug: 'palm-of-my-hands-odd-mob-extended-remix', name: 'palm of my hands - Odd Mob Extended Remix',
                 image: { uri: 'https://example.com/cover1.jpg' },
                 label: { id: 103008, name: 'Experts Only', slug: 'experts-only', image: { uri: 'https://example.com/label-experts.jpg' } } },
      sample_url: 'https://example.com/sample1.mp3',
      sub_genre: null,
      _position: 1
    },
    {
      id: 19711255, name: 'walls', mix_name: 'Original Mix', slug: 'walls',
      artists: [{ id: 610028, name: 'John Summit', slug: 'john-summit', image: { uri: 'https://example.com/summit.jpg' } }],
      remixers: [],
      bpm: 126,
      key: { id: 1, name: 'A Minor', camelot_number: 5, camelot_letter: 'A' },
      publish_date: '2024-09-15',
      release: { id: 4803380, slug: 'walls', name: 'walls',
                 image: { uri: 'https://example.com/cover2.jpg' },
                 label: { id: 103008, name: 'Experts Only', slug: 'experts-only', image: { uri: 'https://example.com/label-experts.jpg' } } },
      sample_url: '',
      sub_genre: { id: 257, name: 'Latin Tech', slug: 'latin-tech' },
      _position: 5
    },
    {
      id: 19711256, name: 'lose control', mix_name: 'Original Mix', slug: 'lose-control',
      artists: [{ id: 770001, name: 'Mochakk', slug: 'mochakk' }],
      remixers: [],
      bpm: 128,
      key: { name: 'G Minor', camelot_number: 6, camelot_letter: 'A' },
      publish_date: '2024-10-01',
      release: { id: 4900001, slug: 'lose-control', name: 'lose control',
                 label: { id: 9001, name: 'Solid Grooves', slug: 'solid-grooves' } },
      _position: 12
    }
  ],
  'Techno Peak Time / Driving': [
    {
      id: 19711260, name: 'code reader', mix_name: 'Original Mix', slug: 'code-reader',
      artists: [{ id: 1456, name: 'Adam Beyer', slug: 'adam-beyer' }],
      remixers: [],
      bpm: 135,
      key: { name: 'F Minor', camelot_number: 4, camelot_letter: 'A' },
      publish_date: '2024-08-20',
      release: { id: 4900002, slug: 'code-reader', name: 'code reader',
                 label: { id: 1234, name: 'Drumcode', slug: 'drumcode' } },
      _position: 3
    },
    {
      id: 19711261, name: 'server farm', mix_name: 'Original Mix', slug: 'server-farm',
      artists: [{ id: 1456, name: 'Adam Beyer', slug: 'adam-beyer' },
                { id: 7800, name: 'Layton Giordani', slug: 'layton-giordani' }],
      remixers: [],
      bpm: 133,
      key: { name: 'C Minor', camelot_number: 5, camelot_letter: 'A' },
      publish_date: '2024-07-10',
      release: { id: 4900003, slug: 'server-farm', name: 'server farm',
                 label: { id: 1234, name: 'Drumcode', slug: 'drumcode' } },
      _position: 8
    },
    {
      id: 19711262, name: 'industrial zone', mix_name: 'Original Mix', slug: 'industrial-zone',
      artists: [{ id: 1456, name: 'Adam Beyer', slug: 'adam-beyer' }],
      remixers: [],
      bpm: 138,
      key: { name: 'G Minor', camelot_number: 6, camelot_letter: 'A' },
      publish_date: '2024-09-05',
      release: { id: 4900004, slug: 'industrial-zone', name: 'industrial zone',
                 label: { id: 5678, name: 'Truesoul', slug: 'truesoul' } },
      _position: 18
    }
  ],
  'Minimal / Deep Tech': [
    {
      // Cross-genre duplicate: same track appears in both Tech House and Minimal / Deep Tech
      // RP-BPI-001: stessa release.id (4900001) → merge cross-genre
      id: 19711256, name: 'lose control', mix_name: 'Original Mix', slug: 'lose-control',
      artists: [{ id: 770001, name: 'Mochakk', slug: 'mochakk' }],
      remixers: [],
      bpm: 128,
      key: { name: 'G Minor', camelot_number: 6, camelot_letter: 'A' },
      publish_date: '2024-10-01',
      release: { id: 4900001, slug: 'lose-control', name: 'lose control',
                 label: { id: 9001, name: 'Solid Grooves', slug: 'solid-grooves' } },
      _position: 2
    },
    {
      id: 19711270, name: 'dub layers', mix_name: 'Dub Mix', slug: 'dub-layers',
      artists: [{ id: 770001, name: 'Mochakk', slug: 'mochakk' }],
      remixers: [{ id: 9999, name: 'Wade', slug: 'wade' }],
      bpm: 127,
      key: { name: 'A Minor', camelot_number: 8, camelot_letter: 'A' },
      publish_date: '2024-11-01',
      release: { id: 4900005, slug: 'dub-layers', name: 'dub layers',
                 label: { id: 9001, name: 'Solid Grooves', slug: 'solid-grooves' } },
      _position: 25
    }
  ]
};


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

// === RP-BPI-002B — Canonical ID generators (mirror of the scraper) ===
const canonicalCounters = { track: 0, release: 0, artist: 0, label: 0 };
const PAD = 6;
function padNum(n) { let s = String(n); while (s.length < PAD) s = '0' + s; return s; }
function canonicalTrackId() { canonicalCounters.track++; return 'trk_' + padNum(canonicalCounters.track); }
function canonicalReleaseId() { canonicalCounters.release++; return 'rel_' + padNum(canonicalCounters.release); }
function canonicalArtistId() { canonicalCounters.artist++; return 'art_' + padNum(canonicalCounters.artist); }
function canonicalLabelId() { canonicalCounters.label++; return 'lbl_' + padNum(canonicalCounters.label); }

// === RP-BPI-004 — Track Trend Engine ===
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

// === RP-BPI-002A — Beatport-derived stable key helpers (kept for dedup internal) ===
function artistKey(a) {
  if (!a) return null;
  if (a.id) return 'bp_' + a.id;
  const nm = (a.name || '').toUpperCase().trim();
  return nm ? ('nm_' + nm) : null;
}
function labelKey(label) {
  if (!label) return null;
  if (label.id) return 'bp_lbl_' + label.id;
  const nm = (label.name || '').toUpperCase().trim();
  return nm ? ('nm_lbl_' + nm) : null;
}
function trackKeyFor(t, labelName) {
  if (!t) return null;
  if (t.id) return 'bp_' + t.id;
  const nm = (t.name || '').toUpperCase().trim();
  return nm ? ('nm_' + nm + '|' + (labelName || '')) : null;
}
function releaseKeyFor(rel, labelName) {
  if (!rel) return null;
  if (rel.id) return 'bp_rel_' + rel.id;
  const slug = rel.slug || rel.name || '';
  return slug ? ('nm_rel_' + slug + '|' + (labelName || '')) : null;
}

// === Re-implement processTracks (mirror of the scraper — RP-BPI-002B canonical) ===
function processTracks(tracks, gn, gid, lm, am, tm, rm) {
  for (var i = 0; i < tracks.length; i++) {
    var t = tracks[i];
    var label = null;
    if (t.release && t.release.label) label = t.release.label;
    else if (t.label) label = t.label;
    if (!label || !label.name) continue;

    var labelName = label.name.toUpperCase().trim();
    var pos = t._position || (i + 1);
    var pts = Math.max(0, 101 - pos);
    var lblBpKey = labelKey(label);

    var k = t.key || {};
    var keyCamelot = (k.camelot_number != null && k.camelot_letter) ? (k.camelot_number + k.camelot_letter) : '';
    var keyName = k.name || '';
    var releaseDate = t.publish_date || t.new_release_date || '';
    var coverArt = (t.release && t.release.image && t.release.image.uri) || '';

    // === LABEL MAP (canonical id) ===
    if (!lm.has(lblBpKey)) {
      lm.set(lblBpKey, {
        id: canonicalLabelId(),
        beatportId: label.id || null,
        name: labelName,
        slug: label.slug || '',
        imageUrl: (label.image && label.image.uri) || '',
        artistIds: [],
        releaseIds: [],
        trackIds: [],
        _trackCount: 0,
        _totalPoints: 0,
        _bestPosition: pos,
        _genres: [],
        _rankByGenre: {},
        _pointsByGenre: {},
        _compat: {
          legacyId: 'lbl_' + labelName.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/_+$/, ''),
          key: lblBpKey
        }
      });
    }
    var lb = lm.get(lblBpKey);
    lb._trackCount++;
    lb._totalPoints += pts;
    if (pos < lb._bestPosition) lb._bestPosition = pos;
    if (lb._genres.indexOf(gn) === -1) lb._genres.push(gn);
    var canonicalLabelIdForTrack = lb.id;

    var artistsRaw = Array.isArray(t.artists) ? t.artists.slice() : [];
    var remixersRaw = Array.isArray(t.remixers) ? t.remixers.slice() : [];

    function processArtist(a, isRemixer) {
      var bpKey = artistKey(a);
      if (!bpKey) return null;
      if (!am.has(bpKey)) {
        am.set(bpKey, {
          id: canonicalArtistId(),
          beatportId: a.id || null,
          name: a.name,
          slug: a.slug || '',
          imageUrl: (a.image && a.image.uri) || '',
          labelIds: [],
          releaseIds: [],
          trackIds: [],
          _genres: [],
          _tracksByGenre: {},
          _labelsPublishedOnNames: [],
          _totalPoints: 0,
          _bestPosition: pos,
          _isRemixerOnly: isRemixer,
          _compat: { key: bpKey }
        });
      }
      var ar = am.get(bpKey);
      if (ar._genres.indexOf(gn) === -1) ar._genres.push(gn);
      if (ar._labelsPublishedOnNames.indexOf(labelName) === -1) ar._labelsPublishedOnNames.push(labelName);
      if (canonicalLabelIdForTrack && ar.labelIds.indexOf(canonicalLabelIdForTrack) === -1) {
        ar.labelIds.push(canonicalLabelIdForTrack);
      }
      if (!isRemixer) {
        if (!ar._tracksByGenre[gn]) ar._tracksByGenre[gn] = [];
        var alreadyInGenre = false;
        for (var q = 0; q < ar._tracksByGenre[gn].length; q++) {
          if (ar._tracksByGenre[gn][q].id === t.id) { alreadyInGenre = true; break; }
        }
        if (!alreadyInGenre) {
          ar._tracksByGenre[gn].push({
            id: t.id, name: t.name, mixName: t.mix_name || '',
            position: pos, points: pts, label: labelName,
            labelId: label.id || null,
            labelKey: lblBpKey,
            labelSlug: label.slug || '',
            releaseDate: releaseDate, bpm: t.bpm || null,
            keyCamelot: keyCamelot, keyName: keyName, coverArt: coverArt,
            sampleUrl: t.sample_url || '', seenAt: NOW
          });
        }
        ar._totalPoints += pts;
        if (pos < ar._bestPosition) ar._bestPosition = pos;
      }
      if (!isRemixer && ar._isRemixerOnly) ar._isRemixerOnly = false;
      return ar.id;
    }

    var trackArtistCanonicalIds = [];
    artistsRaw.forEach(function (a) {
      var cId = processArtist(a, false);
      if (cId && trackArtistCanonicalIds.indexOf(cId) === -1) trackArtistCanonicalIds.push(cId);
    });
    var trackRemixerCanonicalIds = [];
    remixersRaw.forEach(function (a) {
      var cId = processArtist(a, true);
      if (cId && trackRemixerCanonicalIds.indexOf(cId) === -1) trackRemixerCanonicalIds.push(cId);
    });

    // === RELEASE MAP (canonical id) ===
    var rel = t.release || null;
    var tReleaseCanonicalId = null;
    var tReleaseBpKey = releaseKeyFor(rel, labelName);
    if (rel && tReleaseBpKey) {
      var releaseId = rel.id || null;
      var releaseSlug = rel.slug || '';
      var releaseName = rel.name || '';
      var releaseUrl = releaseSlug && releaseId
        ? ('https://www.beatport.com/release/' + releaseSlug + '/' + releaseId)
        : '';
      var releaseCatalog = rel.catalog_number || rel.catalogNumber || '';
      var releaseImage = (rel.image && rel.image.uri) || coverArt || '';
      var trackBpId = t.id || null;
      var trackBpm = (typeof t.bpm === 'number' && t.bpm > 0) ? t.bpm : null;
      // RP-BPI-002B — Release.artistIds[] contains ONLY primary artists.
      // Remixers are in Track.remixerIds[] and Release._compat.artistBpIds/artistNames (legacy, all contributors).
      var allCanonicalArtistIdsOnTrack = trackArtistCanonicalIds.slice();

      if (!rm.has(tReleaseBpKey)) {
        var newRel = {
          id: canonicalReleaseId(),
          beatportId: releaseId,
          name: releaseName,
          slug: releaseSlug,
          url: releaseUrl,
          catalogNumber: releaseCatalog,
          releaseDate: releaseDate,
          imageUrl: releaseImage,
          labelId: canonicalLabelIdForTrack,
          artistIds: [],
          trackIds: [],
          trackCount: 0,
          genres: [],
          bpmAverage: null,
          keyDistribution: {},
          firstSeen: NOW,
          lastSeen: NOW,
          _bpmSum: 0,
          _bpmCount: 0,
          _compat: {
            labelId: label.id || null,
            labelName: labelName,
            artistBpIds: [],
            artistNames: [],
            trackBpIds: [],
            key: tReleaseBpKey
          }
        };
        var seenArtistCanonicalIds = {};
        allCanonicalArtistIdsOnTrack.forEach(function (cArtId) {
          if (!seenArtistCanonicalIds[cArtId]) {
            seenArtistCanonicalIds[cArtId] = true;
            newRel.artistIds.push(cArtId);
            var artistEntry = null;
            am.forEach(function (av) { if (av.id === cArtId) artistEntry = av; });
            newRel._compat.artistBpIds.push(artistEntry ? (artistEntry.beatportId || null) : null);
            newRel._compat.artistNames.push(artistEntry ? artistEntry.name : '');
          }
        });
        // Aggiungi remixers ai soli array legacy (non a Release.artistIds canonical)
        var allArtistsRawForLegacy = artistsRaw.concat(remixersRaw);
        var seenLegacyKeys = {};
        allCanonicalArtistIdsOnTrack.forEach(function (cArtId) {
          var artistEntry = null;
          am.forEach(function (av) { if (av.id === cArtId) artistEntry = av; });
          if (artistEntry) seenLegacyKeys[artistEntry._compat.key] = true;
        });
        allArtistsRawForLegacy.forEach(function (a) {
          var bpKey = artistKey(a);
          if (bpKey && !seenLegacyKeys[bpKey]) {
            seenLegacyKeys[bpKey] = true;
            newRel._compat.artistBpIds.push(a.id || null);
            newRel._compat.artistNames.push(a.name || '');
          }
        });
        if (trackBpm != null) {
          newRel._bpmSum += trackBpm;
          newRel._bpmCount++;
          newRel.bpmAverage = Math.round(newRel._bpmSum / newRel._bpmCount);
        }
        if (keyCamelot) newRel.keyDistribution[keyCamelot] = 1;
        if (newRel.genres.indexOf(gn) === -1) newRel.genres.push(gn);
        rm.set(tReleaseBpKey, newRel);
      } else {
        var exRel = rm.get(tReleaseBpKey);
        allCanonicalArtistIdsOnTrack.forEach(function (cArtId) {
          if (exRel.artistIds.indexOf(cArtId) === -1) {
            exRel.artistIds.push(cArtId);
            var artistEntry = null;
            am.forEach(function (av) { if (av.id === cArtId) artistEntry = av; });
            exRel._compat.artistBpIds.push(artistEntry ? (artistEntry.beatportId || null) : null);
            exRel._compat.artistNames.push(artistEntry ? artistEntry.name : '');
          }
        });
        // Aggiungi remixers ai soli array legacy
        var allArtistsRawForLegacyEx = artistsRaw.concat(remixersRaw);
        var seenLegacyKeysEx = {};
        exRel._compat.artistNames.forEach(function (nm) {
          seenLegacyKeysEx[nm.toUpperCase().trim()] = true;
        });
        allArtistsRawForLegacyEx.forEach(function (a) {
          var nmUpper = (a.name || '').toUpperCase().trim();
          if (nmUpper && !seenLegacyKeysEx[nmUpper]) {
            seenLegacyKeysEx[nmUpper] = true;
            exRel._compat.artistBpIds.push(a.id || null);
            exRel._compat.artistNames.push(a.name || '');
          }
        });
        if (exRel.genres.indexOf(gn) === -1) exRel.genres.push(gn);
        if (trackBpm != null) {
          exRel._bpmSum += trackBpm;
          exRel._bpmCount++;
          exRel.bpmAverage = Math.round(exRel._bpmSum / exRel._bpmCount);
        }
        if (keyCamelot) {
          exRel.keyDistribution[keyCamelot] = (exRel.keyDistribution[keyCamelot] || 0) + 1;
        }
        exRel.lastSeen = NOW;
        if (!exRel.beatportId && releaseId) exRel.beatportId = releaseId;
        if (!exRel.labelId && canonicalLabelIdForTrack) exRel.labelId = canonicalLabelIdForTrack;
        if (!exRel._compat.labelId && label.id) exRel._compat.labelId = label.id;
        if (!exRel._compat.labelName) exRel._compat.labelName = labelName;
        if (!exRel.imageUrl && releaseImage) exRel.imageUrl = releaseImage;
        if (!exRel.releaseDate && releaseDate) exRel.releaseDate = releaseDate;
        if (!exRel.catalogNumber && releaseCatalog) exRel.catalogNumber = releaseCatalog;
        if (!exRel.slug && releaseSlug) exRel.slug = releaseSlug;
        if (!exRel.url && releaseUrl) exRel.url = releaseUrl;
        if (!exRel.name && releaseName) exRel.name = releaseName;
      }
      tReleaseCanonicalId = rm.get(tReleaseBpKey).id;
    }

    // === TRACK MAP (canonical id) ===
    var trackBpKey = trackKeyFor(t, labelName);
    if (!tm.has(trackBpKey)) {
      var newTrack = {
        id: canonicalTrackId(),
        beatportId: t.id || null,
        name: t.name,
        mixName: t.mix_name || '',
        slug: t.slug || '',
        bpm: t.bpm || null,
        keyCamelot: keyCamelot,
        keyName: keyName,
        releaseDate: releaseDate,
        coverArt: coverArt,
        sampleUrl: t.sample_url || '',
        primaryGenre: gn,
        subGenre: (t.sub_genre && t.sub_genre.name) || null,
        releaseId: tReleaseCanonicalId,
        labelId: canonicalLabelIdForTrack,
        artistIds: trackArtistCanonicalIds.slice(),
        remixerIds: trackRemixerCanonicalIds.slice(),
        positions: [{ genre: gn, position: pos, points: pts, seenAt: NOW }],
        // RP-BPI-003 — Position History
        positionHistory: [{ scrapedAt: NOW, genreId: gid, genreName: gn, position: pos }],
        // RP-BPI-004 — Track Trend
        trend: 'new',
        seenAt: NOW,
        _compat: {
          key: trackBpKey,
          label: labelName,
          labelId: label.id || null,
          labelSlug: label.slug || '',
          artists: artistsRaw.map(function (a) { return { id: a.id || null, name: a.name, slug: a.slug || '' }; }),
          remixers: remixersRaw.map(function (a) { return { id: a.id || null, name: a.name, slug: a.slug || '' }; })
        }
      };
      tm.set(trackBpKey, newTrack);
    } else {
      var tr = tm.get(trackBpKey);
      tr.positions.push({ genre: gn, position: pos, points: pts, seenAt: NOW });
      if (!tr.releaseId && tReleaseCanonicalId) tr.releaseId = tReleaseCanonicalId;
      // RP-BPI-003 — Position History: dedup consecutivi
      var ph = tr.positionHistory;
      var lastEntry = ph.length > 0 ? ph[ph.length - 1] : null;
      var differs = !lastEntry || lastEntry.genreName !== gn || lastEntry.position !== pos;
      if (differs) {
        ph.push({ scrapedAt: NOW, genreId: gid, genreName: gn, position: pos });
      }
      // RP-BPI-004 — Ricalcola trend
      tr.trend = computeTrend(ph, gn);
    }

    // === Aggiorna Release.trackIds[] con il canonical track id ===
    if (tReleaseBpKey) {
      var relToUpdate = rm.get(tReleaseBpKey);
      var canonicalTrackIdForThisTrack = tm.get(trackBpKey).id;
      if (relToUpdate && relToUpdate.trackIds.indexOf(canonicalTrackIdForThisTrack) === -1) {
        relToUpdate.trackIds.push(canonicalTrackIdForThisTrack);
        relToUpdate.trackCount = relToUpdate.trackIds.length;
        if (t.id != null && relToUpdate._compat.trackBpIds.indexOf(t.id) === -1) {
          relToUpdate._compat.trackBpIds.push(t.id);
        }
      }
    }
  }
}

// === buildCanonicalRelationships (mirror of the scraper) ===
function buildCanonicalRelationships() {
  var globalTM = graph.tracks;
  var globalRM = graph.releases;
  var globalAM = graph.artists;
  var globalLM = graph.labels;
  var artistById = new Map();
  globalAM.forEach(function (a) { artistById.set(a.id, a); });
  var labelById = new Map();
  globalLM.forEach(function (l) { labelById.set(l.id, l); });
  var releaseById = new Map();
  globalRM.forEach(function (r) { releaseById.set(r.id, r); });

  globalTM.forEach(function (tr) {
    tr.artistIds.forEach(function (aId) {
      var ar = artistById.get(aId);
      if (ar && ar.trackIds.indexOf(tr.id) === -1) ar.trackIds.push(tr.id);
    });
    if (tr.releaseId) {
      var rel = releaseById.get(tr.releaseId);
      if (rel) {
        tr.artistIds.forEach(function (aId) {
          var ar = artistById.get(aId);
          if (ar && ar.releaseIds.indexOf(rel.id) === -1) ar.releaseIds.push(rel.id);
        });
      }
    }
    if (tr.labelId) {
      var lb = labelById.get(tr.labelId);
      if (lb) {
        if (lb.trackIds.indexOf(tr.id) === -1) lb.trackIds.push(tr.id);
        tr.artistIds.forEach(function (aId) {
          if (lb.artistIds.indexOf(aId) === -1) lb.artistIds.push(aId);
        });
      }
    }
  });

  globalRM.forEach(function (r) {
    if (r.labelId) {
      var lb = labelById.get(r.labelId);
      if (lb) {
        if (lb.releaseIds.indexOf(r.id) === -1) lb.releaseIds.push(r.id);
        r.artistIds.forEach(function (aId) {
          if (lb.artistIds.indexOf(aId) === -1) lb.artistIds.push(aId);
        });
      }
    }
    r.artistIds.forEach(function (aId) {
      var ar = artistById.get(aId);
      if (ar && ar.releaseIds.indexOf(r.id) === -1) ar.releaseIds.push(r.id);
    });
  });
}

// === remapCanonicalIds (mirror of the scraper) ===
function remapCanonicalIds() {
  var globalTM = graph.tracks;
  var globalRM = graph.releases;
  var globalAM = graph.artists;
  var globalLM = graph.labels;
  function remapTrackId(id) { return id == null ? id : (graph.remapRegistry.track[id] || id); }
  function remapReleaseId(id) { return id == null ? id : (graph.remapRegistry.release[id] || id); }
  function remapArtistId(id) { return id == null ? id : (graph.remapRegistry.artist[id] || id); }
  function remapLabelId(id) { return id == null ? id : (graph.remapRegistry.label[id] || id); }
  function dedup(arr) {
    var seen = {};
    var out = [];
    for (var i = 0; i < arr.length; i++) {
      var k = String(arr[i]);
      if (!seen[k]) { seen[k] = true; out.push(arr[i]); }
    }
    return out;
  }

  globalTM.forEach(function (t) {
    t.releaseId = remapReleaseId(t.releaseId);
    t.labelId = remapLabelId(t.labelId);
    t.artistIds = dedup(t.artistIds.map(remapArtistId));
    t.remixerIds = dedup(t.remixerIds.map(remapArtistId));
  });
  globalRM.forEach(function (r) {
    r.labelId = remapLabelId(r.labelId);
    r.artistIds = dedup(r.artistIds.map(remapArtistId));
    r.trackIds = dedup(r.trackIds.map(remapTrackId));
    r.trackCount = r.trackIds.length;
  });
  globalAM.forEach(function (a) {
    a.labelIds = dedup(a.labelIds.map(remapLabelId));
  });
}


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
        // RP-BPI-003 — Merge positionHistory with dedup
        v.positionHistory.forEach(function (phEntry) {
          var lastPh = ex.positionHistory.length > 0 ? ex.positionHistory[ex.positionHistory.length - 1] : null;
          var phDiffers = !lastPh || lastPh.genreName !== phEntry.genreName || lastPh.position !== phEntry.position;
          if (phDiffers) {
            ex.positionHistory.push(phEntry);
          }
        });
        // RP-BPI-004 — Ricalcola trend dopo merge
        if (ex.positionHistory.length > 0) {
          ex.trend = computeTrend(ex.positionHistory, ex.positionHistory[ex.positionHistory.length - 1].genreName);
        }
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
// === Build labels output (canonical + legacy compat) ===
const labelArr = Array.from(graph.labels.values()).map(l => {
  const ranks = Object.values(l._rankByGenre);
  const minR = ranks.length > 0 ? Math.min(...ranks) : 999;
  const tPts = Object.values(l._pointsByGenre).reduce((a, b) => a + b, 0);
  let trending = false;
  let trendingRankByGenre = {};
  let trendingPointsByGenre = {};
  if (minR <= 25 || tPts > 500) {
    trending = true;
    for (const gr in l._rankByGenre) {
      if (l._rankByGenre[gr] <= 50) {
        trendingRankByGenre[gr] = l._rankByGenre[gr];
        trendingPointsByGenre[gr] = l._pointsByGenre[gr];
      }
    }
  }
  return {
    canonicalId: l.id,
    beatportId: l.beatportId,
    name: l.name,
    slug: l.slug,
    imageUrl: l.imageUrl,
    artistIds: l.artistIds.slice(),
    releaseIds: l.releaseIds.slice(),
    trackIds: l.trackIds.slice(),
    id: l._compat.legacyId,
    key: l._compat.key,
    genres: l._genres.slice(),
    rankByGenre: Object.assign({}, l._rankByGenre),
    pointsByGenre: Object.assign({}, l._pointsByGenre),
    trending,
    trendingRankByGenre,
    trendingPointsByGenre
  };
});

// === Build artists output (canonical + legacy compat) ===
const artistsArr = Array.from(graph.artists.values()).map(a => {
  const tracksByGenreOut = {};
  for (const gn in a._tracksByGenre) {
    tracksByGenreOut[gn] = a._tracksByGenre[gn].slice().sort((x, y) => y.points - x.points);
  }
  let trending = false;
  let trendingRankByGenre = {};
  let trendingPointsByGenre = {};
  if (a._bestPosition <= 25 || a._totalPoints > 500) {
    trending = true;
    for (const gn in a._tracksByGenre) {
      const genrePoints = a._tracksByGenre[gn].reduce((acc, t) => acc + t.points, 0);
      const genreBestPos = a._tracksByGenre[gn].reduce((min, t) => t.position < min ? t.position : min, 999);
      if (genreBestPos <= 50) {
        trendingRankByGenre[gn] = genreBestPos;
        trendingPointsByGenre[gn] = genrePoints;
      }
    }
  }
  return {
    canonicalId: a.id,
    beatportId: a.beatportId,
    name: a.name,
    slug: a.slug,
    imageUrl: a.imageUrl,
    labelIds: a.labelIds.slice(),
    releaseIds: a.releaseIds.slice(),
    trackIds: a.trackIds.slice(),
    totalPoints: a._totalPoints,
    bestPosition: a._bestPosition,
    isRemixerOnly: a._isRemixerOnly,
    trending,
    trendingRankByGenre,
    trendingPointsByGenre,
    id: a._compat.key,
    key: a._compat.key,
    genres: a._genres.slice(),
    tracksByGenre: tracksByGenreOut,
    labelsPublishedOn: a._labelsPublishedOnNames.slice()
  };
});
artistsArr.sort((a, b) => b.totalPoints - a.totalPoints);

// === Build tracks output (canonical + legacy compat) ===
const tracksArr = Array.from(graph.tracks.values()).map(t => ({
  canonicalId: t.id,
  beatportId: t.beatportId,
  name: t.name,
  mixName: t.mixName,
  slug: t.slug,
  bpm: t.bpm,
  keyCamelot: t.keyCamelot,
  keyName: t.keyName,
  releaseDate: t.releaseDate,
  coverArt: t.coverArt,
  sampleUrl: t.sampleUrl,
  primaryGenre: t.primaryGenre,
  subGenre: t.subGenre,
  releaseId: t.releaseId,
  labelId: t.labelId,
  artistIds: t.artistIds.slice(),
  remixerIds: t.remixerIds.slice(),
  positions: t.positions.slice(),
  // RP-BPI-003 — Position History
  positionHistory: t.positionHistory.slice(),
  // RP-BPI-004 — Track Trend
  trend: t.trend,
  seenAt: t.seenAt,
  id: t.beatportId,
  key: t._compat.key,
  label: t._compat.label,
  beatportLabelId: t._compat.labelId,
  labelSlug: t._compat.labelSlug,
  artists: t._compat.artists.slice(),
  remixers: t._compat.remixers.slice()
}));

// === Build releases output (canonical + legacy compat) ===
const releasesArr = Array.from(graph.releases.values()).map(r => ({
  canonicalId: r.id,
  beatportId: r.beatportId,
  name: r.name,
  slug: r.slug,
  url: r.url,
  catalogNumber: r.catalogNumber,
  releaseDate: r.releaseDate,
  imageUrl: r.imageUrl,
  labelId: r.labelId,
  artistIds: r.artistIds.slice(),
  trackIds: r.trackIds.slice(),
  trackCount: r.trackCount,
  genres: r.genres.slice(),
  bpmAverage: r.bpmAverage,
  keyDistribution: Object.assign({}, r.keyDistribution),
  firstSeen: r.firstSeen,
  lastSeen: r.lastSeen,
  id: r.beatportId,
  key: r._compat.key,
  beatportLabelId: r._compat.labelId,
  labelName: r._compat.labelName,
  artistBpIds: r._compat.artistBpIds.slice(),
  artistNames: r._compat.artistNames.slice(),
  trackBpIds: r._compat.trackBpIds.slice()
}));
releasesArr.sort((a, b) => b.trackCount - a.trackCount);

// === Output ===
const out = {
  genres: Object.keys(sampleByGenre),
  labels: labelArr,
  artists: artistsArr,
  tracks: tracksArr,
  releases: releasesArr,
  _meta: {
    source: 'beatport',
    version: 2,
    schemaVersion: 3,
    canonicalModel: 1,
    scrapedAt: NOW,
    totalLabels: labelArr.length,
    totalArtists: artistsArr.length,
    totalTracks: tracksArr.length,
    totalReleases: releasesArr.length,
    totalGenres: Object.keys(sampleByGenre).length,
    successGenres: Object.keys(sampleByGenre).length,
    failedGenres: 0
  }
};

  return { export: function () { return out; } };
}

// ===================================================================
// MAIN: Three-phase pipeline
// ===================================================================

// Create the Canonical Graph and Builder
const graph = createCanonicalGraph();
const builder = createCanonicalGraphBuilder(graph);

// RP-BPI-003 — genreName → genreId mapping (for positionHistory.genreId).
// Beatport genre ids (from the scraper's G array): Tech House=11, Techno Peak Time / Driving=6,
// Minimal / Deep Tech=14.
const genreIdMap = {
  'Tech House': 11,
  'Techno Peak Time / Driving': 6,
  'Minimal / Deep Tech': 14
};

// Phase 1+2: Beatport Import + Graph construction
for (const gn of Object.keys(sampleByGenre)) {
  const lm = new Map(), am = new Map(), tm = new Map(), rm = new Map();
  const gid = genreIdMap[gn] || 0;
  builder.processTracks(sampleByGenre[gn], gn, gid, lm, am, tm, rm);
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


// === Save sample output JSON ===
const samplePath = '/home/z/my-project/download/beatport-scraper-v2-sample-output.json';
fs.mkdirSync('/home/z/my-project/download', { recursive: true });
fs.writeFileSync(samplePath, JSON.stringify(out, null, 2));

// ====================================================================
// ASSERTIONS
// ====================================================================
let pass = 0, fail = 0;
function assert(name, actual, expected) {
  if (JSON.stringify(actual) === JSON.stringify(expected)) {
    console.log('  ✓ ' + name);
    pass++;
  } else {
    console.log('  ✗ ' + name + ' — got: ' + JSON.stringify(actual) + ', expected: ' + JSON.stringify(expected));
    fail++;
  }
}

console.log('\n=== RP-BPI-002C GRAPH STRUCTURE ===');
// The CanonicalGraph must contain exactly 4 entity Maps + remapRegistry
assert('graph has labels Map', graph.labels instanceof Map, true);
assert('graph has artists Map', graph.artists instanceof Map, true);
assert('graph has releases Map', graph.releases instanceof Map, true);
assert('graph has tracks Map', graph.tracks instanceof Map, true);
assert('graph has remapRegistry', typeof graph.remapRegistry, 'object');
assert('graph.labels has 4 entries', graph.labels.size, 4);
assert('graph.artists has 7 entries', graph.artists.size, 7);
assert('graph.tracks has 7 entries', graph.tracks.size, 7);
assert('graph.releases has 7 entries', graph.releases.size, 7);

// The builder must expose the 4 methods
assert('builder has processTracks', typeof builder.processTracks, 'function');
assert('builder has mergeGenreIntoGlobal', typeof builder.mergeGenreIntoGlobal, 'function');
assert('builder has remapCanonicalIds', typeof builder.remapCanonicalIds, 'function');
assert('builder has buildCanonicalRelationships', typeof builder.buildCanonicalRelationships, 'function');

// The exporter must expose the export method
assert('exporter has export', typeof exporter.export, 'function');

// The graph entities must have canonical ids (not beatportIds as ids)
const graphLabelIds = Array.from(graph.labels.values()).map(l => l.id);
assert('graph label ids are canonical (lbl_<n>)', graphLabelIds.every(id => id.startsWith('lbl_')), true);
const graphArtistIds = Array.from(graph.artists.values()).map(a => a.id);
assert('graph artist ids are canonical (art_<n>)', graphArtistIds.every(id => id.startsWith('art_')), true);
const graphTrackIds = Array.from(graph.tracks.values()).map(t => t.id);
assert('graph track ids are canonical (trk_<n>)', graphTrackIds.every(id => id.startsWith('trk_')), true);
const graphReleaseIds = Array.from(graph.releases.values()).map(r => r.id);
assert('graph release ids are canonical (rel_<n>)', graphReleaseIds.every(id => id.startsWith('rel_')), true);

// JSON output must match graph entity counts
assert('out.labels.length === graph.labels.size', out.labels.length, graph.labels.size);
assert('out.artists.length === graph.artists.size', out.artists.length, graph.artists.size);
assert('out.tracks.length === graph.tracks.size', out.tracks.length, graph.tracks.size);
assert('out.releases.length === graph.releases.size', out.releases.length, graph.releases.size);

console.log('\n=== META ===');
assert('_meta.schemaVersion = 3', out._meta.schemaVersion, 3);
assert('_meta.canonicalModel = 1', out._meta.canonicalModel, 1);
assert('_meta.version = 2 (legacy preserved)', out._meta.version, 2);
assert('_meta.source = "beatport"', out._meta.source, 'beatport');
assert('4 labels total', out._meta.totalLabels, 4);
assert('7 artists total', out._meta.totalArtists, 7);
assert('7 tracks total', out._meta.totalTracks, 7);
assert('7 releases total', out._meta.totalReleases, 7);

console.log('\n=== CANONICAL ID UNIQUENESS ===');
// Each entity has ONE canonical id. Verify uniqueness across each entity set.
const labelCanonicalIds = out.labels.map(l => l.canonicalId);
const artistCanonicalIds = out.artists.map(a => a.canonicalId);
const trackCanonicalIds = out.tracks.map(t => t.canonicalId);
const releaseCanonicalIds = out.releases.map(r => r.canonicalId);

assert('label canonicalIds are unique', new Set(labelCanonicalIds).size, labelCanonicalIds.length);
assert('artist canonicalIds are unique', new Set(artistCanonicalIds).size, artistCanonicalIds.length);
assert('track canonicalIds are unique', new Set(trackCanonicalIds).size, trackCanonicalIds.length);
assert('release canonicalIds are unique', new Set(releaseCanonicalIds).size, releaseCanonicalIds.length);

// Canonical ids must follow the canonical prefix convention
assert('all label canonicalIds start with lbl_', labelCanonicalIds.every(id => id.startsWith('lbl_')), true);
assert('all artist canonicalIds start with art_', artistCanonicalIds.every(id => id.startsWith('art_')), true);
assert('all track canonicalIds start with trk_', trackCanonicalIds.every(id => id.startsWith('trk_')), true);
assert('all release canonicalIds start with rel_', releaseCanonicalIds.every(id => id.startsWith('rel_')), true);

// No canonical id should equal a beatportId (they are independent)
const allBeatportIds = [
  ...out.labels.map(l => l.beatportId),
  ...out.artists.map(a => a.beatportId),
  ...out.tracks.map(t => t.beatportId),
  ...out.releases.map(r => r.beatportId)
].filter(id => id != null);
const allCanonicalIds = [...labelCanonicalIds, ...artistCanonicalIds, ...trackCanonicalIds, ...releaseCanonicalIds];
const noOverlap = allCanonicalIds.every(cId => !allBeatportIds.includes(cId));
assert('no canonicalId equals any beatportId (independent)', noOverlap, true);

console.log('\n=== NO RELATION USES beatportId ===');
// CRITICAL INVARIANT: every relation field must contain a canonicalId,
// never a beatportId (numeric) or a name-based key.

// Track relations
const trackRelationsUseCanonical = out.tracks.every(t => {
  // releaseId must be null OR start with rel_
  if (t.releaseId != null && !t.releaseId.startsWith('rel_')) return false;
  // labelId must start with lbl_
  if (typeof t.labelId !== 'string' || !t.labelId.startsWith('lbl_')) return false;
  // artistIds must all start with art_
  if (!Array.isArray(t.artistIds) || !t.artistIds.every(id => id.startsWith('art_'))) return false;
  // remixerIds must all start with art_
  if (!Array.isArray(t.remixerIds) || !t.remixerIds.every(id => id.startsWith('art_'))) return false;
  return true;
});
assert('every Track relation (releaseId, labelId, artistIds, remixerIds) uses canonical id', trackRelationsUseCanonical, true);

// Release relations
const releaseRelationsUseCanonical = out.releases.every(r => {
  if (typeof r.labelId !== 'string' || !r.labelId.startsWith('lbl_')) return false;
  if (!Array.isArray(r.artistIds) || !r.artistIds.every(id => id.startsWith('art_'))) return false;
  if (!Array.isArray(r.trackIds) || !r.trackIds.every(id => id.startsWith('trk_'))) return false;
  return true;
});
assert('every Release relation (labelId, artistIds, trackIds) uses canonical id', releaseRelationsUseCanonical, true);

// Artist relations
const artistRelationsUseCanonical = out.artists.every(a => {
  if (!Array.isArray(a.labelIds) || !a.labelIds.every(id => id.startsWith('lbl_'))) return false;
  if (!Array.isArray(a.releaseIds) || !a.releaseIds.every(id => id.startsWith('rel_'))) return false;
  if (!Array.isArray(a.trackIds) || !a.trackIds.every(id => id.startsWith('trk_'))) return false;
  return true;
});
assert('every Artist relation (labelIds, releaseIds, trackIds) uses canonical id', artistRelationsUseCanonical, true);

// Label relations
const labelRelationsUseCanonical = out.labels.every(l => {
  if (!Array.isArray(l.artistIds) || !l.artistIds.every(id => id.startsWith('art_'))) return false;
  if (!Array.isArray(l.releaseIds) || !l.releaseIds.every(id => id.startsWith('rel_'))) return false;
  if (!Array.isArray(l.trackIds) || !l.trackIds.every(id => id.startsWith('trk_'))) return false;
  return true;
});
assert('every Label relation (artistIds, releaseIds, trackIds) uses canonical id', labelRelationsUseCanonical, true);

console.log('\n=== REFERENTIAL INTEGRITY (all refs point to existing entities) ===');

const labelCanonicalIdSet = new Set(labelCanonicalIds);
const artistCanonicalIdSet = new Set(artistCanonicalIds);
const trackCanonicalIdSet = new Set(trackCanonicalIds);
const releaseCanonicalIdSet = new Set(releaseCanonicalIds);

// Track.releaseId → Release.canonicalId
const trackReleaseRefsValid = out.tracks.every(t =>
  t.releaseId == null || releaseCanonicalIdSet.has(t.releaseId)
);
assert('every Track.releaseId points to existing Release', trackReleaseRefsValid, true);

// Track.labelId → Label.canonicalId
const trackLabelRefsValid = out.tracks.every(t => labelCanonicalIdSet.has(t.labelId));
assert('every Track.labelId points to existing Label', trackLabelRefsValid, true);

// Track.artistIds → Artist.canonicalId
const trackArtistRefsValid = out.tracks.every(t =>
  t.artistIds.every(id => artistCanonicalIdSet.has(id))
);
assert('every Track.artistIds points to existing Artist', trackArtistRefsValid, true);

// Track.remixerIds → Artist.canonicalId
const trackRemixerRefsValid = out.tracks.every(t =>
  t.remixerIds.every(id => artistCanonicalIdSet.has(id))
);
assert('every Track.remixerIds points to existing Artist', trackRemixerRefsValid, true);

// Release.labelId → Label.canonicalId
const releaseLabelRefsValid = out.releases.every(r => labelCanonicalIdSet.has(r.labelId));
assert('every Release.labelId points to existing Label', releaseLabelRefsValid, true);

// Release.artistIds → Artist.canonicalId
const releaseArtistRefsValid = out.releases.every(r =>
  r.artistIds.every(id => artistCanonicalIdSet.has(id))
);
assert('every Release.artistIds points to existing Artist', releaseArtistRefsValid, true);

// Release.trackIds → Track.canonicalId
const releaseTrackRefsValid = out.releases.every(r =>
  r.trackIds.every(id => trackCanonicalIdSet.has(id))
);
assert('every Release.trackIds points to existing Track', releaseTrackRefsValid, true);

// Artist.labelIds → Label.canonicalId
const artistLabelRefsValid = out.artists.every(a =>
  a.labelIds.every(id => labelCanonicalIdSet.has(id))
);
assert('every Artist.labelIds points to existing Label', artistLabelRefsValid, true);

// Artist.releaseIds → Release.canonicalId
const artistReleaseRefsValid = out.artists.every(a =>
  a.releaseIds.every(id => releaseCanonicalIdSet.has(id))
);
assert('every Artist.releaseIds points to existing Release', artistReleaseRefsValid, true);

// Artist.trackIds → Track.canonicalId
const artistTrackRefsValid = out.artists.every(a =>
  a.trackIds.every(id => trackCanonicalIdSet.has(id))
);
assert('every Artist.trackIds points to existing Track', artistTrackRefsValid, true);

// Label.artistIds → Artist.canonicalId
const labelArtistRefsValid = out.labels.every(l =>
  l.artistIds.every(id => artistCanonicalIdSet.has(id))
);
assert('every Label.artistIds points to existing Artist', labelArtistRefsValid, true);

// Label.releaseIds → Release.canonicalId
const labelReleaseRefsValid = out.labels.every(l =>
  l.releaseIds.every(id => releaseCanonicalIdSet.has(id))
);
assert('every Label.releaseIds points to existing Release', labelReleaseRefsValid, true);

// Label.trackIds → Track.canonicalId
const labelTrackRefsValid = out.labels.every(l =>
  l.trackIds.every(id => trackCanonicalIdSet.has(id))
);
assert('every Label.trackIds points to existing Track', labelTrackRefsValid, true);

console.log('\n=== BIDIRECTIONAL RELATIONSHIP CONSISTENCY ===');
// If Track T has releaseId R, then Release R should have T in trackIds.
const trackReleaseBidirectional = out.tracks.every(t => {
  if (!t.releaseId) return true;
  const r = out.releases.find(rr => rr.canonicalId === t.releaseId);
  return r && r.trackIds.includes(t.canonicalId);
});
assert('Track.releaseId ↔ Release.trackIds bidirectional', trackReleaseBidirectional, true);

// If Track T has labelId L, then Label L should have T in trackIds.
const trackLabelBidirectional = out.tracks.every(t => {
  const l = out.labels.find(ll => ll.canonicalId === t.labelId);
  return l && l.trackIds.includes(t.canonicalId);
});
assert('Track.labelId ↔ Label.trackIds bidirectional', trackLabelBidirectional, true);

// If Track T has artistIds [A1, A2], then each Ai should have T in trackIds.
const trackArtistBidirectional = out.tracks.every(t =>
  t.artistIds.every(aId => {
    const a = out.artists.find(aa => aa.canonicalId === aId);
    return a && a.trackIds.includes(t.canonicalId);
  })
);
assert('Track.artistIds ↔ Artist.trackIds bidirectional', trackArtistBidirectional, true);

// If Release R has labelId L, then Label L should have R in releaseIds.
const releaseLabelBidirectional = out.releases.every(r => {
  const l = out.labels.find(ll => ll.canonicalId === r.labelId);
  return l && l.releaseIds.includes(r.canonicalId);
});
assert('Release.labelId ↔ Label.releaseIds bidirectional', releaseLabelBidirectional, true);

// If Release R has artistIds [A1, A2], then each Ai should have R in releaseIds.
const releaseArtistBidirectional = out.releases.every(r =>
  r.artistIds.every(aId => {
    const a = out.artists.find(aa => aa.canonicalId === aId);
    return a && a.releaseIds.includes(r.canonicalId);
  })
);
assert('Release.artistIds ↔ Artist.releaseIds bidirectional', releaseArtistBidirectional, true);

console.log('\n=== SPECIFIC ENTITY CHECKS ===');

// John Summit artist
const summit = out.artists.find(a => a.name === 'John Summit');
assert('Summit found', !!summit, true);
if (summit) {
  assert('Summit.canonicalId starts with art_', summit.canonicalId.startsWith('art_'), true);
  assert('Summit.beatportId = 610028 (attribute only)', summit.beatportId, 610028);
  assert('Summit.canonicalId != beatportId', summit.canonicalId !== summit.beatportId, true);
  assert('Summit has 2 trackIds (palm + walls)', summit.trackIds.length, 2);
  assert('Summit has 1 releaseId (palm release) + 1 releaseId (walls release) = 2', summit.releaseIds.length, 2);
  assert('Summit has 1 labelId (Experts Only)', summit.labelIds.length, 1);
  assert('Summit.labelIds[0] starts with lbl_', summit.labelIds[0].startsWith('lbl_'), true);
  // Summit.trackIds must all be trk_ ids (canonical)
  assert('Summit.trackIds all start with trk_', summit.trackIds.every(id => id.startsWith('trk_')), true);
  // Summit.releaseIds must all be rel_ ids (canonical)
  assert('Summit.releaseIds all start with rel_', summit.releaseIds.every(id => id.startsWith('rel_')), true);
}

// Adam Beyer artist — published on 2 labels (Drumcode + Truesoul)
const beyer = out.artists.find(a => a.name === 'Adam Beyer');
assert('Beyer found', !!beyer, true);
if (beyer) {
  assert('Beyer.canonicalId starts with art_', beyer.canonicalId.startsWith('art_'), true);
  assert('Beyer has 3 trackIds (code reader + server farm + industrial zone)', beyer.trackIds.length, 3);
  assert('Beyer has 3 releaseIds', beyer.releaseIds.length, 3);
  assert('Beyer has 2 labelIds (Drumcode + Truesoul)', beyer.labelIds.length, 2);
  // All labelIds are canonical (lbl_<n>), NOT beatportIds (1234, 5678)
  assert('Beyer.labelIds are NOT beatportIds', !beyer.labelIds.includes(1234) && !beyer.labelIds.includes(5678), true);
}

// palm of my hands track
const palmTrack = out.tracks.find(t => t.beatportId === 19711254);
assert('palm track found by beatportId', !!palmTrack, true);
if (palmTrack) {
  assert('palm track.canonicalId starts with trk_', palmTrack.canonicalId.startsWith('trk_'), true);
  assert('palm track.canonicalId != beatportId (19711254)', palmTrack.canonicalId !== 19711254, true);
  assert('palm track.releaseId starts with rel_', palmTrack.releaseId && palmTrack.releaseId.startsWith('rel_'), true);
  assert('palm track.labelId starts with lbl_', palmTrack.labelId.startsWith('lbl_'), true);
  assert('palm track.artistIds = [Summit canonicalId, venbee canonicalId]', palmTrack.artistIds.length, 2);
  assert('palm track.artistIds all start with art_', palmTrack.artistIds.every(id => id.startsWith('art_')), true);
  assert('palm track.remixerIds = [Odd Mob canonicalId]', palmTrack.remixerIds.length, 1);
  assert('palm track.remixerIds[0] starts with art_', palmTrack.remixerIds[0].startsWith('art_'), true);
  // CRITICAL: palm track.artistIds must NOT contain Beatport ids (610028, 1068825)
  assert('palm track.artistIds does NOT contain beatportId 610028', !palmTrack.artistIds.includes(610028), true);
  assert('palm track.artistIds does NOT contain beatportId 1068825', !palmTrack.artistIds.includes(1068825), true);
}

// palm release (id 4803379)
const palmRelease = out.releases.find(r => r.beatportId === 4803379);
assert('palm release found by beatportId', !!palmRelease, true);
if (palmRelease) {
  assert('palm release.canonicalId starts with rel_', palmRelease.canonicalId.startsWith('rel_'), true);
  assert('palm release.canonicalId != beatportId (4803379)', palmRelease.canonicalId !== 4803379, true);
  assert('palm release.labelId starts with lbl_', palmRelease.labelId.startsWith('lbl_'), true);
  // CRITICAL: palm release.labelId must NOT be the beatport label id (103008)
  assert('palm release.labelId is NOT beatportId 103008', palmRelease.labelId !== 103008, true);
  assert('palm release.artistIds = 2 (Summit + venbee, primary only — Odd Mob is remixer, in _compat only)', palmRelease.artistIds.length, 2);
  assert('palm release.artistIds all start with art_', palmRelease.artistIds.every(id => id.startsWith('art_')), true);
  // Legacy _compat arrays include ALL contributors (primary + remixers)
  assert('palm release _compat.artistNames = 3 (Summit + venbee + Odd Mob)', palmRelease.artistNames.length, 3);
  assert('palm release _compat.artistBpIds = 3', palmRelease.artistBpIds.length, 3);
  assert('palm release.trackIds = 1 (palm track canonicalId)', palmRelease.trackIds.length, 1);
  assert('palm release.trackIds[0] starts with trk_', palmRelease.trackIds[0].startsWith('trk_'), true);
  assert('palm release trackCount = 1', palmRelease.trackCount, 1);
  assert('palm release bpmAverage = 132', palmRelease.bpmAverage, 132);
  assert('palm release keyDistribution = { "2A": 1 }', palmRelease.keyDistribution, { '2A': 1 });
  assert('palm release genres = ["Tech House"]', palmRelease.genres, ['Tech House']);
  assert('palm release url contains beatport.com/release/', palmRelease.url.indexOf('https://www.beatport.com/release/'), 0);
}

// lose control release (cross-genre merge — same release.id 4900001 in Tech House + Minimal)
const loseControlRelease = out.releases.find(r => r.beatportId === 4900001);
assert('lose control release found by beatportId', !!loseControlRelease, true);
if (loseControlRelease) {
  assert('lose control release.canonicalId starts with rel_', loseControlRelease.canonicalId.startsWith('rel_'), true);
  assert('lose control release has 1 artist (Mochakk)', loseControlRelease.artistIds.length, 1);
  assert('lose control release artistIds[0] starts with art_', loseControlRelease.artistIds[0].startsWith('art_'), true);
  assert('lose control release trackCount = 1 (cross-genre dedup)', loseControlRelease.trackCount, 1);
  assert('lose control release genres = [Tech House, Minimal / Deep Tech]', loseControlRelease.genres.sort(), ['Tech House', 'Minimal / Deep Tech'].sort());
  assert('lose control release bpmAverage = 128', loseControlRelease.bpmAverage, 128);
  assert('lose control release keyDistribution = { "6A": 2 } (cross-genre)', loseControlRelease.keyDistribution, { '6A': 2 });
}

// dub layers release (Mochakk + Wade)
const dubLayersRel = out.releases.find(r => r.beatportId === 4900005);
assert('dub layers release found', !!dubLayersRel, true);
if (dubLayersRel) {
  // RP-BPI-002B: Release.artistIds[] = primary only (Mochakk). Wade is a remixer.
  assert('dub layers release.artistIds = 1 (Mochakk primary only — Wade is remixer)', dubLayersRel.artistIds.length, 1);
  // Legacy _compat arrays include ALL contributors (Mochakk + Wade)
  assert('dub layers release _compat.artistNames = 2 (Mochakk + Wade)', dubLayersRel.artistNames.length, 2);
  assert('dub layers release artistIds all start with art_', dubLayersRel.artistIds.every(id => id.startsWith('art_')), true);
  assert('dub layers release bpmAverage = 127', dubLayersRel.bpmAverage, 127);
}

// Experts Only label
const expertsOnly = out.labels.find(l => l.name === 'EXPERTS ONLY');
assert('Experts Only found', !!expertsOnly, true);
if (expertsOnly) {
  assert('Experts Only.canonicalId starts with lbl_', expertsOnly.canonicalId.startsWith('lbl_'), true);
  assert('Experts Only.canonicalId != beatportId (103008)', expertsOnly.canonicalId !== 103008, true);
  assert('Experts Only.beatportId = 103008 (attribute)', expertsOnly.beatportId, 103008);
  // Experts Only has 2 tracks (palm + walls) and 2 releases
  assert('Experts Only has 2 trackIds (palm + walls)', expertsOnly.trackIds.length, 2);
  assert('Experts Only has 2 releaseIds (palm + walls releases)', expertsOnly.releaseIds.length, 2);
  // Experts Only has 2 artists (John Summit + venbee) — Odd Mob is a remixer, not primary on Experts Only
  // Actually palm track primary artists = John Summit + venbee. walls primary = John Summit.
  // So Experts Only artists = {John Summit, venbee} = 2.
  assert('Experts Only has 2 artistIds (Summit + venbee)', expertsOnly.artistIds.length, 2);
  assert('Experts Only artistIds all start with art_', expertsOnly.artistIds.every(id => id.startsWith('art_')), true);
  // CRITICAL: Experts Only.artistIds must NOT contain beatportIds
  assert('Experts Only.artistIds does NOT contain beatportId 610028', !expertsOnly.artistIds.includes(610028), true);
  assert('Experts Only.artistIds does NOT contain beatportId 1068825', !expertsOnly.artistIds.includes(1068825), true);
}

// Drumcode label — should have Adam Beyer + Layton Giordani as artists
const drumcode = out.labels.find(l => l.name === 'DRUMCODE');
assert('Drumcode found', !!drumcode, true);
if (drumcode) {
  assert('Drumcode.canonicalId starts with lbl_', drumcode.canonicalId.startsWith('lbl_'), true);
  assert('Drumcode has 2 releaseIds (code reader + server farm)', drumcode.releaseIds.length, 2);
  assert('Drumcode has 2 trackIds (code reader + server farm)', drumcode.trackIds.length, 2);
  // Artists on Drumcode: Adam Beyer (both tracks) + Layton Giordani (server farm)
  assert('Drumcode has 2 artistIds (Beyer + Giordani)', drumcode.artistIds.length, 2);
}

console.log('\n=== BACKWARD COMPATIBILITY (legacy fields preserved) ===');

// Track legacy fields
const trackLegacyFields = out.tracks.every(t =>
  typeof t.id !== 'undefined' &&             // legacy id (was BP id)
  typeof t.key === 'string' &&               // legacy RP-BPI-002A stable key
  typeof t.label === 'string' &&             // legacy NAME
  typeof t.beatportLabelId !== 'undefined' && // legacy BP label id (was labelId)
  typeof t.labelSlug === 'string' &&         // legacy label slug
  Array.isArray(t.artists) &&                // legacy artists array {id,name,slug}
  Array.isArray(t.remixers)                  // legacy remixers array {id,name,slug}
);
assert('every Track preserves legacy fields (id, key, label, beatportLabelId, labelSlug, artists[], remixers[])', trackLegacyFields, true);

// Artist legacy fields
const artistLegacyFields = out.artists.every(a =>
  typeof a.id !== 'undefined' &&             // legacy id (was RP-BPI-002A stable key)
  typeof a.key === 'string' &&               // legacy key
  Array.isArray(a.genres) &&                 // legacy genres
  typeof a.tracksByGenre === 'object' &&     // legacy tracksByGenre
  Array.isArray(a.labelsPublishedOn) &&      // legacy NAME array
  typeof a.totalPoints === 'number' &&       // legacy totalPoints
  typeof a.bestPosition === 'number' &&      // legacy bestPosition
  typeof a.isRemixerOnly === 'boolean' &&    // legacy isRemixerOnly
  typeof a.trending === 'boolean'            // legacy trending
);
assert('every Artist preserves legacy fields (id, key, genres, tracksByGenre, labelsPublishedOn, totalPoints, bestPosition, isRemixerOnly, trending)', artistLegacyFields, true);

// Label legacy fields
const labelLegacyFields = out.labels.every(l =>
  typeof l.id === 'string' &&                // legacy id (was lbl_<slug>)
  typeof l.key === 'string' &&               // legacy RP-BPI-002A stable key
  typeof l.beatportId !== 'undefined' &&     // legacy beatportId
  typeof l.slug === 'string' &&              // legacy slug
  (typeof l.imageUrl === 'string' || typeof l.imageUrl === 'undefined') && // imageUrl may be undefined
  Array.isArray(l.genres) &&                 // legacy genres
  typeof l.rankByGenre === 'object' &&       // legacy rankByGenre
  typeof l.pointsByGenre === 'object' &&     // legacy pointsByGenre
  typeof l.trending === 'boolean'            // legacy trending
);
assert('every Label preserves legacy fields (id, key, beatportId, slug, imageUrl, genres, rankByGenre, pointsByGenre, trending)', labelLegacyFields, true);

// Release legacy fields
const releaseLegacyFields = out.releases.every(r =>
  typeof r.id !== 'undefined' &&             // legacy id (was BP id)
  typeof r.key === 'string' &&               // legacy RP-BPI-002A stable key
  typeof r.beatportLabelId !== 'undefined' && // legacy BP label id (was labelId)
  typeof r.labelName === 'string' &&         // legacy NAME
  Array.isArray(r.artistBpIds) &&            // legacy BP ids parallel array
  Array.isArray(r.artistNames) &&            // legacy NAME parallel array
  Array.isArray(r.trackBpIds)                // legacy BP track ids parallel array
);
assert('every Release preserves legacy fields (id, key, beatportLabelId, labelName, artistBpIds, artistNames, trackBpIds)', releaseLegacyFields, true);

// _meta legacy fields preserved
assert('_meta.version preserved', out._meta.version, 2);
assert('_meta.totalLabels preserved', typeof out._meta.totalLabels, 'number');
assert('_meta.totalArtists preserved', typeof out._meta.totalArtists, 'number');
assert('_meta.totalTracks preserved', typeof out._meta.totalTracks, 'number');
assert('_meta.totalReleases preserved', typeof out._meta.totalReleases, 'number');
assert('_meta.scrapedAt preserved', typeof out._meta.scrapedAt, 'string');
assert('_meta.source preserved', out._meta.source, 'beatport');

// releases array is before _meta in JSON (RP-BPI-001 invariant preserved)
const jsonKeys = Object.keys(out);
assert('releases is before _meta in JSON keys', jsonKeys.indexOf('releases'), jsonKeys.indexOf('_meta') - 1);

// ====================================================================
// RP-BPI-003 — POSITION HISTORY TESTS
// ====================================================================
console.log('\n=== RP-BPI-003 POSITION HISTORY ===');

// --- Test 1: First acquisition ---
// Every track from the first (and only) scrape must have a positionHistory
// with at least 1 entry.
const allTracksHavePositionHistory = out.tracks.every(t =>
  Array.isArray(t.positionHistory) && t.positionHistory.length >= 1
);
assert('every track has positionHistory array with >= 1 entry', allTracksHavePositionHistory, true);

// Each entry must have: scrapedAt, genreId, genreName, position
const allEntriesWellFormed = out.tracks.every(t =>
  t.positionHistory.every(e =>
    typeof e.scrapedAt === 'string' &&
    typeof e.genreId === 'number' &&
    typeof e.genreName === 'string' &&
    typeof e.position === 'number'
  )
);
assert('every positionHistory entry has scrapedAt, genreId, genreName, position', allEntriesWellFormed, true);

// --- Test 2: Cross-genre track has multiple entries ---
// "lose control" (beatportId 19711256) appears in Tech House (pos 12) and
// Minimal / Deep Tech (pos 2). Its positionHistory must have 2 entries
// (different genre → different entry, not a duplicate).
const loseCtrlTrack = out.tracks.find(t => t.beatportId === 19711256);
assert('lose control track found', !!loseCtrlTrack, true);
if (loseCtrlTrack) {
  assert('lose control positionHistory has 2 entries (cross-genre)', loseCtrlTrack.positionHistory.length, 2);
  // Entry 0: Tech House (first genre processed), pos 12
  // Entry 1: Minimal / Deep Tech (second genre processed), pos 2
  // Note: the genre order in the test is Tech House → Techno → Minimal/Deep Tech
  assert('lose control positionHistory[0].genreName = Tech House', loseCtrlTrack.positionHistory[0].genreName, 'Tech House');
  assert('lose control positionHistory[0].genreId = 11', loseCtrlTrack.positionHistory[0].genreId, 11);
  assert('lose control positionHistory[0].position = 12', loseCtrlTrack.positionHistory[0].position, 12);
  assert('lose control positionHistory[1].genreName = Minimal / Deep Tech', loseCtrlTrack.positionHistory[1].genreName, 'Minimal / Deep Tech');
  assert('lose control positionHistory[1].genreId = 14', loseCtrlTrack.positionHistory[1].genreId, 14);
  assert('lose control positionHistory[1].position = 2', loseCtrlTrack.positionHistory[1].position, 2);
}

// ====================================================================
// RP-BPI-003 — MULTI-SCRAPE SIMULATION
// ====================================================================
console.log('\n=== RP-BPI-003 MULTI-SCRAPE SIMULATION ===');

// To test positionHistory across multiple scraping sessions, we create a
// FRESH graph + builder, then run processTracks multiple times with
// different sample data (simulating different positions over time).
// The NOW timestamp is different per scrape to simulate time passing.

// Sample data for 3 scraping sessions of the SAME track "test track":
//   Scrape 1: position 5 (first acquisition)
//   Scrape 2: position 3 (improvement)
//   Scrape 3: position 3 (same → dedup, no new entry)
//   Scrape 4: position 8 (worsening)
//   Scrape 5: track not in chart (exit — no processTracks call)
//   Scrape 6: position 10 (re-entry)
//   Scrape 7: position 10 (same → dedup)

function makeTrack(id, name, position, labelId, labelName) {
  return {
    id: id,
    name: name,
    mix_name: 'Original Mix',
    slug: name.toLowerCase().replace(/\s+/g, '-'),
    artists: [{ id: 99999, name: 'Test Artist', slug: 'test-artist' }],
    remixers: [],
    bpm: 128,
    key: { name: 'A Minor', camelot_number: 1, camelot_letter: 'A' },
    publish_date: '2024-01-01',
    release: {
      id: 88888, slug: 'test-release', name: 'Test Release',
      label: { id: labelId, name: labelName, slug: labelName.toLowerCase().replace(/\s+/g, '-') }
    },
    _position: position
  };
}

// Create a fresh graph + builder for the multi-scrape test
const graph2 = createCanonicalGraph();
const builder2 = createCanonicalGraphBuilder(graph2);
const genreName2 = 'Tech House';
const genreId2 = 11;

// Scrape 1: position 5 (first acquisition)
// We need to temporarily override NOW for each scrape to simulate different timestamps.
// Since NOW is a const in the test, we'll use the builder with a custom timestamp
// by directly calling processTracks with a modified track that carries _scrapedAt.
// Actually, the scraper uses NOW internally. For the test, we'll just check
// that entries are added in order (the timestamp is always NOW, but the
// positionHistory array is ordered by insertion).

// Scrape 1: first acquisition, position 5
let lm2 = new Map(), am2 = new Map(), tm2 = new Map(), rm2 = new Map();
builder2.processTracks([makeTrack(77777, 'test track', 5, 55555, 'Test Label')], genreName2, genreId2, lm2, am2, tm2, rm2);
builder2.mergeGenreIntoGlobal(lm2, am2, tm2, rm2, genreName2);

let testTrack = Array.from(graph2.tracks.values()).find(t => t.beatportId === 77777);
assert('multi-scrape: scrape 1 — track created', !!testTrack, true);
if (testTrack) {
  assert('multi-scrape: scrape 1 — positionHistory has 1 entry', testTrack.positionHistory.length, 1);
  assert('multi-scrape: scrape 1 — positionHistory[0].position = 5', testTrack.positionHistory[0].position, 5);
}

// Scrape 2: position 3 (improvement — different from last → new entry)
lm2 = new Map(); am2 = new Map(); tm2 = new Map(); rm2 = new Map();
builder2.processTracks([makeTrack(77777, 'test track', 3, 55555, 'Test Label')], genreName2, genreId2, lm2, am2, tm2, rm2);
builder2.mergeGenreIntoGlobal(lm2, am2, tm2, rm2, genreName2);

testTrack = Array.from(graph2.tracks.values()).find(t => t.beatportId === 77777);
if (testTrack) {
  assert('multi-scrape: scrape 2 (improvement) — positionHistory has 2 entries', testTrack.positionHistory.length, 2);
  assert('multi-scrape: scrape 2 — positionHistory[1].position = 3', testTrack.positionHistory[1].position, 3);
}

// Scrape 3: position 3 (same as last → dedup, NO new entry)
lm2 = new Map(); am2 = new Map(); tm2 = new Map(); rm2 = new Map();
builder2.processTracks([makeTrack(77777, 'test track', 3, 55555, 'Test Label')], genreName2, genreId2, lm2, am2, tm2, rm2);
builder2.mergeGenreIntoGlobal(lm2, am2, tm2, rm2, genreName2);

testTrack = Array.from(graph2.tracks.values()).find(t => t.beatportId === 77777);
if (testTrack) {
  assert('multi-scrape: scrape 3 (same position → dedup) — positionHistory still 2 entries', testTrack.positionHistory.length, 2);
}

// Scrape 4: position 8 (worsening — different from last → new entry)
lm2 = new Map(); am2 = new Map(); tm2 = new Map(); rm2 = new Map();
builder2.processTracks([makeTrack(77777, 'test track', 8, 55555, 'Test Label')], genreName2, genreId2, lm2, am2, tm2, rm2);
builder2.mergeGenreIntoGlobal(lm2, am2, tm2, rm2, genreName2);

testTrack = Array.from(graph2.tracks.values()).find(t => t.beatportId === 77777);
if (testTrack) {
  assert('multi-scrape: scrape 4 (worsening) — positionHistory has 3 entries', testTrack.positionHistory.length, 3);
  assert('multi-scrape: scrape 4 — positionHistory[2].position = 8', testTrack.positionHistory[2].position, 8);
}

// Scrape 5: track NOT in chart (exit — no processTracks call, so no new entry)
// In a real scraper, if the track is not in the chart, processTracks is not
// called for it, so positionHistory is not modified.
// We simulate this by simply not calling processTracks for this track.
// positionHistory should remain at 3 entries.
testTrack = Array.from(graph2.tracks.values()).find(t => t.beatportId === 77777);
if (testTrack) {
  assert('multi-scrape: scrape 5 (exit — no call) — positionHistory still 3 entries', testTrack.positionHistory.length, 3);
}

// Scrape 6: position 10 (re-entry — different from last → new entry)
lm2 = new Map(); am2 = new Map(); tm2 = new Map(); rm2 = new Map();
builder2.processTracks([makeTrack(77777, 'test track', 10, 55555, 'Test Label')], genreName2, genreId2, lm2, am2, tm2, rm2);
builder2.mergeGenreIntoGlobal(lm2, am2, tm2, rm2, genreName2);

testTrack = Array.from(graph2.tracks.values()).find(t => t.beatportId === 77777);
if (testTrack) {
  assert('multi-scrape: scrape 6 (re-entry) — positionHistory has 4 entries', testTrack.positionHistory.length, 4);
  assert('multi-scrape: scrape 6 — positionHistory[3].position = 10', testTrack.positionHistory[3].position, 10);
}

// Scrape 7: position 10 (same as last → dedup, NO new entry)
lm2 = new Map(); am2 = new Map(); tm2 = new Map(); rm2 = new Map();
builder2.processTracks([makeTrack(77777, 'test track', 10, 55555, 'Test Label')], genreName2, genreId2, lm2, am2, tm2, rm2);
builder2.mergeGenreIntoGlobal(lm2, am2, tm2, rm2, genreName2);

testTrack = Array.from(graph2.tracks.values()).find(t => t.beatportId === 77777);
if (testTrack) {
  assert('multi-scrape: scrape 7 (same position → dedup) — positionHistory still 4 entries', testTrack.positionHistory.length, 4);
}

// --- Final verification: no consecutive duplicates ---
// Walk the entire positionHistory and verify no two consecutive entries
// have the same genreName AND position.
if (testTrack) {
  let noConsecutiveDups = true;
  for (let i = 1; i < testTrack.positionHistory.length; i++) {
    const prev = testTrack.positionHistory[i - 1];
    const curr = testTrack.positionHistory[i];
    if (prev.genreName === curr.genreName && prev.position === curr.position) {
      noConsecutiveDups = false;
      break;
    }
  }
  assert('multi-scrape: no consecutive duplicates in positionHistory', noConsecutiveDups, true);

  // Verify the full history is correct (chronological order):
  // 1. pos 5 (first acquisition)
  // 2. pos 3 (improvement)
  // 3. pos 8 (worsening)
  // 4. pos 10 (re-entry)
  assert('multi-scrape: positionHistory[0].position = 5 (first)', testTrack.positionHistory[0].position, 5);
  assert('multi-scrape: positionHistory[1].position = 3 (improvement)', testTrack.positionHistory[1].position, 3);
  assert('multi-scrape: positionHistory[2].position = 8 (worsening)', testTrack.positionHistory[2].position, 8);
  assert('multi-scrape: positionHistory[3].position = 10 (re-entry)', testTrack.positionHistory[3].position, 10);

  // All entries should have the same genreName (all in Tech House)
  assert('multi-scrape: all entries have genreName = Tech House',
    testTrack.positionHistory.every(e => e.genreName === 'Tech House'), true);
  // All entries should have genreId = 11
  assert('multi-scrape: all entries have genreId = 11',
    testTrack.positionHistory.every(e => e.genreId === 11), true);
}

// --- Verify Artist/Release/Label entities do NOT have positionHistory ---
// RP-BPI-003 extends ONLY the Track entity.
const artistsHaveNoPositionHistory = out.artists.every(a => !('positionHistory' in a));
assert('no Artist has positionHistory field (RP-BPI-003 extends only Track)', artistsHaveNoPositionHistory, true);
const releasesHaveNoPositionHistory = out.releases.every(r => !('positionHistory' in r));
assert('no Release has positionHistory field (RP-BPI-003 extends only Track)', releasesHaveNoPositionHistory, true);
const labelsHaveNoPositionHistory = out.labels.every(l => !('positionHistory' in l));
assert('no Label has positionHistory field (RP-BPI-003 extends only Track)', labelsHaveNoPositionHistory, true);

// ====================================================================
// RP-BPI-004 — TRACK TREND ENGINE TESTS
// ====================================================================
console.log('\n=== RP-BPI-004 TRACK TREND ENGINE ===');

// --- Test 1: Every track has a trend field with valid value ---
const validTrendValues = ['up', 'down', 'stable', 'new'];
const allTracksHaveTrend = out.tracks.every(t =>
  typeof t.trend === 'string' && validTrendValues.includes(t.trend)
);
assert('every track has trend field with valid value (up/down/stable/new)', allTracksHaveTrend, true);

// --- Test 2: New track (single scrape) → trend = "new" ---
// All tracks in the first scrape have 1-2 positionHistory entries.
// Tracks with only 1 entry → trend = "new".
// Tracks with 2 entries but from DIFFERENT genres (cross-genre) → trend = "new"
// (because there's only 1 entry per genre, so no comparison possible).
// In our sample, "lose control" has 2 entries (Tech House + Minimal/Deep Tech)
// but each genre has only 1 entry → trend = "new".
// Tracks with 1 entry → trend = "new".
// So ALL tracks in the single-scrape sample should have trend = "new".
const allTracksAreNew = out.tracks.every(t => t.trend === 'new');
assert('all tracks in first scrape have trend = "new" (1 entry per genre)', allTracksAreNew, true);

// --- Test 3: Verify specific tracks ---
// "palm of my hands" — 1 entry (Tech House only) → new
const palmTrk = out.tracks.find(t => t.beatportId === 19711254);
assert('palm track trend = new (1 entry)', palmTrk ? palmTrk.trend : null, 'new');

// "lose control" — 2 entries but cross-genre (Tech House + Minimal/Deep Tech)
// Only 1 entry per genre → trend = "new"
const loseCtrlTrk = out.tracks.find(t => t.beatportId === 19711256);
assert('lose control track trend = new (cross-genre, 1 entry per genre)', loseCtrlTrk ? loseCtrlTrk.trend : null, 'new');

// ====================================================================
// RP-BPI-004 — MULTI-SCRAPE TREND SIMULATION
// ====================================================================
console.log('\n=== RP-BPI-004 MULTI-SCRAPE TREND SIMULATION ===');

// Reuse the multi-scrape track from RP-BPI-003 test (graph2, builder2).
// The track has 4 positionHistory entries (all Tech House):
//   1. pos 5 (first → new)
//   2. pos 3 (improvement → up)
//   3. pos 8 (worsening → down)
//   4. pos 10 (worsening → down)
// Note: the trend is recalculated after EACH scrape, so the FINAL trend
// reflects the last two entries (pos 8 → pos 10 = down).

const multiScrapeTrack = Array.from(graph2.tracks.values()).find(t => t.beatportId === 77777);
assert('multi-scrape track found', !!multiScrapeTrack, true);
if (multiScrapeTrack) {
  // Final trend: last two entries are pos 8 → pos 10 (worsening) → "down"
  assert('multi-scrape final trend = down (pos 8 → pos 10)', multiScrapeTrack.trend, 'down');
}

// --- Test trend at each step using a fresh builder ---
// Scrape 1: pos 5 → new (1 entry)
const g3 = createCanonicalGraph();
const b3 = createCanonicalGraphBuilder(g3);
let lm3 = new Map(), am3 = new Map(), tm3 = new Map(), rm3 = new Map();
b3.processTracks([makeTrack(88888, 'trend test', 5, 55555, 'Test Label')], 'Tech House', 11, lm3, am3, tm3, rm3);
b3.mergeGenreIntoGlobal(lm3, am3, tm3, rm3, 'Tech House');
let tt = Array.from(g3.tracks.values()).find(t => t.beatportId === 88888);
assert('trend test scrape 1 (pos 5, 1 entry) → new', tt ? tt.trend : null, 'new');

// Scrape 2: pos 3 → up (5→3, improvement)
lm3 = new Map(); am3 = new Map(); tm3 = new Map(); rm3 = new Map();
b3.processTracks([makeTrack(88888, 'trend test', 3, 55555, 'Test Label')], 'Tech House', 11, lm3, am3, tm3, rm3);
b3.mergeGenreIntoGlobal(lm3, am3, tm3, rm3, 'Tech House');
tt = Array.from(g3.tracks.values()).find(t => t.beatportId === 88888);
assert('trend test scrape 2 (pos 5→3, improvement) → up', tt ? tt.trend : null, 'up');

// Scrape 3: pos 3 → same as last, dedup prevents new entry.
// positionHistory still [5, 3] → trend stays "up" (not "stable", because
// "stable" requires two entries with the same position in the same genre,
// and dedup prevents consecutive same-position entries in the same genre).
lm3 = new Map(); am3 = new Map(); tm3 = new Map(); rm3 = new Map();
b3.processTracks([makeTrack(88888, 'trend test', 3, 55555, 'Test Label')], 'Tech House', 11, lm3, am3, tm3, rm3);
b3.mergeGenreIntoGlobal(lm3, am3, tm3, rm3, 'Tech House');
tt = Array.from(g3.tracks.values()).find(t => t.beatportId === 88888);
assert('trend test scrape 3 (pos 3→3, dedup, trend stays up)', tt ? tt.trend : null, 'up');

// Scrape 4: pos 7 → down (3→7, worsening)
lm3 = new Map(); am3 = new Map(); tm3 = new Map(); rm3 = new Map();
b3.processTracks([makeTrack(88888, 'trend test', 7, 55555, 'Test Label')], 'Tech House', 11, lm3, am3, tm3, rm3);
b3.mergeGenreIntoGlobal(lm3, am3, tm3, rm3, 'Tech House');
tt = Array.from(g3.tracks.values()).find(t => t.beatportId === 88888);
assert('trend test scrape 4 (pos 3→7, worsening) → down', tt ? tt.trend : null, 'down');

// --- Test "stable" with cross-genre scenario ---
console.log('\n=== RP-BPI-004 STABLE TREND (cross-genre) ===');

const g4 = createCanonicalGraph();
const b4 = createCanonicalGraphBuilder(g4);

// Scrape 1: Tech House, pos 5
let lm4 = new Map(), am4 = new Map(), tm4 = new Map(), rm4 = new Map();
b4.processTracks([makeTrack(99999, 'stable test', 5, 55555, 'Test Label')], 'Tech House', 11, lm4, am4, tm4, rm4);
b4.mergeGenreIntoGlobal(lm4, am4, tm4, rm4, 'Tech House');
let st = Array.from(g4.tracks.values()).find(t => t.beatportId === 99999);
assert('stable test scrape 1 (Tech House pos 5) → new', st ? st.trend : null, 'new');

// Scrape 2: Minimal / Deep Tech, pos 3 (different genre → entry added)
lm4 = new Map(); am4 = new Map(); tm4 = new Map(); rm4 = new Map();
b4.processTracks([makeTrack(99999, 'stable test', 3, 55555, 'Test Label')], 'Minimal / Deep Tech', 14, lm4, am4, tm4, rm4);
b4.mergeGenreIntoGlobal(lm4, am4, tm4, rm4, 'Minimal / Deep Tech');
st = Array.from(g4.tracks.values()).find(t => t.beatportId === 99999);
// Last genre = Minimal / Deep Tech, only 1 entry for that genre → "new"
assert('stable test scrape 2 (Minimal pos 3) → new (1 entry for Minimal)', st ? st.trend : null, 'new');

// Scrape 3: Tech House, pos 5 (same genre A, same pos 5 as entry 1).
// Last entry is Minimal pos 3, which differs from Tech House pos 5 → entry IS added.
// Now positionHistory = [TH:5, M:3, TH:5]
// For genre Tech House: last two entries are [5, 5] → stable!
lm4 = new Map(); am4 = new Map(); tm4 = new Map(); rm4 = new Map();
b4.processTracks([makeTrack(99999, 'stable test', 5, 55555, 'Test Label')], 'Tech House', 11, lm4, am4, tm4, rm4);
b4.mergeGenreIntoGlobal(lm4, am4, tm4, rm4, 'Tech House');
st = Array.from(g4.tracks.values()).find(t => t.beatportId === 99999);
// Last genre = Tech House. Tech House entries: [5, 5] → stable!
assert('stable test scrape 3 (Tech House pos 5 again) → stable (TH: 5→5)', st ? st.trend : null, 'stable');

// --- Verify Artist/Release/Label do NOT have trend ---
const artistsHaveNoTrend = out.artists.every(a => !('trend' in a));
assert('no Artist has trend field (RP-BPI-004 extends only Track)', artistsHaveNoTrend, true);
const releasesHaveNoTrend = out.releases.every(r => !('trend' in r));
assert('no Release has trend field (RP-BPI-004 extends only Track)', releasesHaveNoTrend, true);
const labelsHaveNoTrend = out.labels.every(l => !('trend' in l));
assert('no Label has trend field (RP-BPI-004 extends only Track)', labelsHaveNoTrend, true);

console.log('\n=== RESULT: ' + pass + ' passed, ' + fail + ' failed ===');
console.log('=== Sample JSON saved to: ' + samplePath + ' ===');
process.exit(fail > 0 ? 1 : 0);
