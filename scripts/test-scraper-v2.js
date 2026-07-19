// ===================================================================
// Offline test: simulate scraper execution with sample Beatport tracks
// Validates: artist aggregation, label aggregation, track deduplication,
//            cross-genre merge, trending computation
// ===================================================================
const fs = require('fs');

// === Load the scraper source and extract the IIFE body ===
// We can't run it directly because it uses fetch/DOMParser/Blob (browser APIs).
// Instead, we'll re-implement the core logic against sample data and verify the
// output shape matches what we documented.

const NOW = '2026-06-21T10:00:00.000Z';

// === Sample Beatport tracks (3 genres, 8 tracks, cross-genre duplicates) ===
// Inspired by the real API schema documented by the research agent.
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

// === Re-implement processTracks (mirror of the scraper) ===
// RP-BPI-001 — aggiunto parametro rm (releaseMap) e logica di aggregazione release.
function processTracks(tracks, gn, lm, am, tm, rm) {
  for (var i = 0; i < tracks.length; i++) {
    var t = tracks[i];
    var label = null;
    if (t.release && t.release.label) label = t.release.label;
    else if (t.label) label = t.label;
    if (!label || !label.name) continue;

    var labelName = label.name.toUpperCase().trim();
    var pos = t._position || (i + 1);
    var pts = Math.max(0, 101 - pos);

    var k = t.key || {};
    var keyCamelot = (k.camelot_number != null && k.camelot_letter) ? (k.camelot_number + k.camelot_letter) : '';
    var keyName = k.name || '';
    var releaseDate = t.publish_date || t.new_release_date || '';
    var coverArt = (t.release && t.release.image && t.release.image.uri) || '';

    if (!lm.has(labelName)) {
      lm.set(labelName, {
        id: label.id || null, name: labelName, slug: label.slug || '',
        imageUrl: (label.image && label.image.uri) || '',
        trackCount: 0, totalPoints: 0, bestPosition: pos
      });
    }
    var lb = lm.get(labelName);
    lb.trackCount++; lb.totalPoints += pts;
    if (pos < lb.bestPosition) lb.bestPosition = pos;

    var artistsRaw = Array.isArray(t.artists) ? t.artists.slice() : [];
    var remixersRaw = Array.isArray(t.remixers) ? t.remixers.slice() : [];

    function processArtist(a, isRemixer) {
      var key = a.id ? ('bp_' + a.id) : ('nm_' + a.name.toUpperCase().trim());
      if (!am.has(key)) {
        am.set(key, {
          id: key, beatportId: a.id || null, name: a.name, slug: a.slug || '',
          imageUrl: (a.image && a.image.uri) || '',
          genres: [], tracksByGenre: {}, labelsPublishedOn: [],
          totalPoints: 0, bestPosition: pos, isRemixerOnly: isRemixer
        });
      }
      var ar = am.get(key);
      if (ar.genres.indexOf(gn) === -1) ar.genres.push(gn);
      if (ar.labelsPublishedOn.indexOf(labelName) === -1) ar.labelsPublishedOn.push(labelName);
      if (!isRemixer) {
        if (!ar.tracksByGenre[gn]) ar.tracksByGenre[gn] = [];
        var alreadyInGenre = false;
        for (var q = 0; q < ar.tracksByGenre[gn].length; q++) {
          if (ar.tracksByGenre[gn][q].id === t.id) { alreadyInGenre = true; break; }
        }
        if (!alreadyInGenre) {
          ar.tracksByGenre[gn].push({
            id: t.id, name: t.name, mixName: t.mix_name || '',
            position: pos, points: pts, label: labelName,
            labelId: label.id || null, labelSlug: label.slug || '',
            releaseDate: releaseDate, bpm: t.bpm || null,
            keyCamelot: keyCamelot, keyName: keyName, coverArt: coverArt,
            sampleUrl: t.sample_url || '', seenAt: NOW
          });
        }
        ar.totalPoints += pts;
        if (pos < ar.bestPosition) ar.bestPosition = pos;
      }
      if (!isRemixer && ar.isRemixerOnly) ar.isRemixerOnly = false;
    }
    artistsRaw.forEach(function (a) { processArtist(a, false); });
    remixersRaw.forEach(function (a) { processArtist(a, true); });

    var trackKey = t.id ? ('bp_' + t.id) : ('nm_' + t.name + '|' + labelName);
    if (!tm.has(trackKey)) {
      tm.set(trackKey, {
        id: t.id || null, key: trackKey, name: t.name, mixName: t.mix_name || '',
        slug: t.slug || '',
        artists: artistsRaw.map(function (a) { return { id: a.id || null, name: a.name, slug: a.slug || '' }; }),
        remixers: remixersRaw.map(function (a) { return { id: a.id || null, name: a.name, slug: a.slug || '' }; }),
        label: labelName, labelId: label.id || null, labelSlug: label.slug || '',
        primaryGenre: gn, subGenre: (t.sub_genre && t.sub_genre.name) || null,
        bpm: t.bpm || null, keyCamelot: keyCamelot, keyName: keyName,
        releaseDate: releaseDate, coverArt: coverArt, sampleUrl: t.sample_url || '',
        positions: [{ genre: gn, position: pos, points: pts, seenAt: NOW }], seenAt: NOW
      });
    } else {
      var tr = tm.get(trackKey);
      tr.positions.push({ genre: gn, position: pos, points: pts, seenAt: NOW });
    }

    // === RP-BPI-001 — RELEASE MAP ===
    var rel = t.release || null;
    if (rel && (rel.id || rel.slug)) {
      var releaseKey = rel.id ? ('bp_rel_' + rel.id) : ('nm_rel_' + (rel.slug || rel.name || '') + '|' + labelName);
      var releaseId = rel.id || null;
      var releaseSlug = rel.slug || '';
      var releaseName = rel.name || '';
      var releaseUrl = releaseSlug && releaseId
        ? ('https://www.beatport.com/release/' + releaseSlug + '/' + releaseId)
        : '';
      var releaseCatalog = rel.catalog_number || rel.catalogNumber || '';
      var releaseImage = (rel.image && rel.image.uri) || coverArt || '';
      var trackId = t.id || null;
      var trackBpm = (typeof t.bpm === 'number' && t.bpm > 0) ? t.bpm : null;
      var allArtistsOnTrack = artistsRaw.concat(remixersRaw);

      if (!rm.has(releaseKey)) {
        var newRel = {
          id: releaseId, beatportId: releaseId, name: releaseName, slug: releaseSlug,
          url: releaseUrl, catalogNumber: releaseCatalog, releaseDate: releaseDate,
          imageUrl: releaseImage, labelId: label.id || null, labelName: labelName,
          artistIds: [], artistNames: [], trackIds: [], trackCount: 0,
          genres: [], bpmAverage: null, keyDistribution: {},
          firstSeen: NOW, lastSeen: NOW
        };
        var seenArtistKeys = {};
        allArtistsOnTrack.forEach(function (a) {
          var aKey = a.id ? ('bp_' + a.id) : ('nm_' + (a.name || '').toUpperCase().trim());
          if (!seenArtistKeys[aKey]) {
            seenArtistKeys[aKey] = true;
            newRel.artistIds.push(a.id || null);
            newRel.artistNames.push(a.name || '');
          }
        });
        if (trackId != null) newRel.trackIds.push(trackId);
        newRel.trackCount = newRel.trackIds.length;
        if (newRel.genres.indexOf(gn) === -1) newRel.genres.push(gn);
        var bpmSum = 0, bpmCount = 0;
        if (trackBpm != null) { bpmSum += trackBpm; bpmCount++; }
        newRel.bpmAverage = bpmCount > 0 ? Math.round(bpmSum / bpmCount) : null;
        if (keyCamelot) newRel.keyDistribution[keyCamelot] = 1;
        rm.set(releaseKey, newRel);
      } else {
        var exRel = rm.get(releaseKey);
        allArtistsOnTrack.forEach(function (a) {
          var aKey = a.id ? ('bp_' + a.id) : ('nm_' + (a.name || '').toUpperCase().trim());
          var alreadyPresent = false;
          for (var ai = 0; ai < exRel.artistIds.length; ai++) {
            var exKey = exRel.artistIds[ai] ? ('bp_' + exRel.artistIds[ai]) : ('nm_' + (exRel.artistNames[ai] || '').toUpperCase().trim());
            if (exKey === aKey) { alreadyPresent = true; break; }
          }
          if (!alreadyPresent) {
            exRel.artistIds.push(a.id || null);
            exRel.artistNames.push(a.name || '');
          }
        });
        if (trackId != null && exRel.trackIds.indexOf(trackId) === -1) exRel.trackIds.push(trackId);
        exRel.trackCount = exRel.trackIds.length;
        if (exRel.genres.indexOf(gn) === -1) exRel.genres.push(gn);
        if (trackBpm != null) {
          if (typeof exRel._bpmSum !== 'number') {
            exRel._bpmSum = exRel.bpmAverage || 0;
            exRel._bpmCount = exRel.bpmAverage != null ? 1 : 0;
          }
          exRel._bpmSum += trackBpm;
          exRel._bpmCount++;
          exRel.bpmAverage = Math.round(exRel._bpmSum / exRel._bpmCount);
        }
        if (keyCamelot) exRel.keyDistribution[keyCamelot] = (exRel.keyDistribution[keyCamelot] || 0) + 1;
        exRel.lastSeen = NOW;
        if (!exRel.labelId && label.id) exRel.labelId = label.id;
        if (!exRel.labelName) exRel.labelName = labelName;
        if (!exRel.imageUrl && releaseImage) exRel.imageUrl = releaseImage;
        if (!exRel.releaseDate && releaseDate) exRel.releaseDate = releaseDate;
        if (!exRel.catalogNumber && releaseCatalog) exRel.catalogNumber = releaseCatalog;
        if (!exRel.slug && releaseSlug) exRel.slug = releaseSlug;
        if (!exRel.url && releaseUrl) exRel.url = releaseUrl;
        if (!exRel.name && releaseName) exRel.name = releaseName;
        if (exRel.beatportId == null && releaseId != null) {
          exRel.beatportId = releaseId;
          exRel.id = releaseId;
        }
      }
    }
  }
}

// === Run across genres ===
const gR = {};
const globalAM = new Map();
const globalTM = new Map();
// RP-BPI-001 — releaseMap globale
const globalRM = new Map();

for (const gn of Object.keys(sampleByGenre)) {
  const lm = new Map(), am = new Map(), tm = new Map(), rm = new Map();
  processTracks(sampleByGenre[gn], gn, lm, am, tm, rm);

  const la = Array.from(lm.values());
  la.sort((a, b) => b.totalPoints - a.totalPoints);
  la.forEach((l, i) => { l.rank = i + 1; });
  gR[gn] = la;

  // Merge artists
  am.forEach((v, k) => {
    if (globalAM.has(k)) {
      const ex = globalAM.get(k);
      v.genres.forEach(g => { if (!ex.genres.includes(g)) ex.genres.push(g); });
      v.labelsPublishedOn.forEach(ln => { if (!ex.labelsPublishedOn.includes(ln)) ex.labelsPublishedOn.push(ln); });
      for (const g2 in v.tracksByGenre) {
        if (!ex.tracksByGenre[g2]) ex.tracksByGenre[g2] = [];
        ex.tracksByGenre[g2].push(...v.tracksByGenre[g2]);
      }
      ex.totalPoints += v.totalPoints;
      if (v.bestPosition < ex.bestPosition) ex.bestPosition = v.bestPosition;
      if (!v.isRemixerOnly) ex.isRemixerOnly = false;
    } else {
      globalAM.set(k, v);
    }
  });

  // Merge tracks
  tm.forEach((v, k) => {
    if (globalTM.has(k)) {
      const ex = globalTM.get(k);
      ex.positions.push(...v.positions);
    } else {
      globalTM.set(k, v);
    }
  });

  // RP-BPI-001 — Merge releases across genres
  rm.forEach((v, k) => {
    if (globalRM.has(k)) {
      const exR = globalRM.get(k);
      v.artistIds.forEach((aid, idx) => {
        const aKey = aid ? ('bp_' + aid) : ('nm_' + (v.artistNames[idx] || '').toUpperCase().trim());
        let alreadyPresent = false;
        for (let ai = 0; ai < exR.artistIds.length; ai++) {
          const exKey = exR.artistIds[ai] ? ('bp_' + exR.artistIds[ai]) : ('nm_' + (exR.artistNames[ai] || '').toUpperCase().trim());
          if (exKey === aKey) { alreadyPresent = true; break; }
        }
        if (!alreadyPresent) {
          exR.artistIds.push(aid);
          exR.artistNames.push(v.artistNames[idx] || '');
        }
      });
      v.trackIds.forEach(tid => {
        if (tid != null && !exR.trackIds.includes(tid)) exR.trackIds.push(tid);
      });
      exR.trackCount = exR.trackIds.length;
      v.genres.forEach(gn2 => {
        if (!exR.genres.includes(gn2)) exR.genres.push(gn2);
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
      for (const kk in v.keyDistribution) {
        exR.keyDistribution[kk] = (exR.keyDistribution[kk] || 0) + v.keyDistribution[kk];
      }
      if (v.lastSeen > exR.lastSeen) exR.lastSeen = v.lastSeen;
      if (!exR.labelId && v.labelId) exR.labelId = v.labelId;
      if (!exR.labelName && v.labelName) exR.labelName = v.labelName;
      if (!exR.imageUrl && v.imageUrl) exR.imageUrl = v.imageUrl;
      if (!exR.releaseDate && v.releaseDate) exR.releaseDate = v.releaseDate;
      if (!exR.catalogNumber && v.catalogNumber) exR.catalogNumber = v.catalogNumber;
      if (!exR.slug && v.slug) exR.slug = v.slug;
      if (!exR.url && v.url) exR.url = v.url;
      if (!exR.name && v.name) exR.name = v.name;
      if (exR.beatportId == null && v.beatportId != null) {
        exR.beatportId = v.beatportId;
        exR.id = v.beatportId;
      }
    } else {
      globalRM.set(k, v);
    }
  });
}

// === Build labels (v1 shape — backward compatible) ===
const lM = {};
for (const gn in gR) {
  for (const lb of gR[gn]) {
    const nm = lb.name.toUpperCase().trim();
    if (!lM[nm]) {
      lM[nm] = {
        id: 'lbl_' + nm.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/_+$/, ''),
        name: nm, genres: [], rankByGenre: {}, pointsByGenre: {}, trending: false
      };
      if (lb.id) lM[nm].beatportId = lb.id;
      if (lb.slug) lM[nm].slug = lb.slug;
      if (lb.imageUrl) lM[nm].imageUrl = lb.imageUrl;
    }
    if (!lM[nm].genres.includes(gn)) lM[nm].genres.push(gn);
    lM[nm].rankByGenre[gn] = lb.rank;
    lM[nm].pointsByGenre[gn] = lb.totalPoints;
  }
}

// Trending for labels
for (const k in lM) {
  const l = lM[k];
  const ranks = Object.values(l.rankByGenre);
  const minR = Math.min(...ranks);
  const tPts = Object.values(l.pointsByGenre).reduce((a, b) => a + b, 0);
  if (minR <= 25 || tPts > 500) {
    l.trending = true;
    l.trendingRankByGenre = {};
    l.trendingPointsByGenre = {};
    for (const gr in l.rankByGenre) {
      if (l.rankByGenre[gr] <= 50) {
        l.trendingRankByGenre[gr] = l.rankByGenre[gr];
        l.trendingPointsByGenre[gr] = l.pointsByGenre[gr];
      }
    }
  }
}

// === Build artists (with trending) ===
const artistsArr = Array.from(globalAM.values());
artistsArr.forEach(a => {
  for (const gn in a.tracksByGenre) {
    a.tracksByGenre[gn].sort((x, y) => y.points - x.points);
  }
  if (a.bestPosition <= 25 || a.totalPoints > 500) {
    a.trending = true;
    a.trendingRankByGenre = {};
    a.trendingPointsByGenre = {};
    for (const gn in a.tracksByGenre) {
      const genrePoints = a.tracksByGenre[gn].reduce((acc, t) => acc + t.points, 0);
      const genreBestPos = a.tracksByGenre[gn].reduce((min, t) => t.position < min ? t.position : min, 999);
      if (genreBestPos <= 50) {
        a.trendingRankByGenre[gn] = genreBestPos;
        a.trendingPointsByGenre[gn] = genrePoints;
      }
    }
  } else {
    a.trending = false;
  }
});
artistsArr.sort((a, b) => b.totalPoints - a.totalPoints);

// === Build tracks ===
const tracksArr = Array.from(globalTM.values());

// === RP-BPI-001 — Build releases (strip campi privati _bpmSum/_bpmCount) ===
const releasesArr = Array.from(globalRM.values()).map(r => {
  const clean = {};
  for (const fk in r) {
    if (fk === '_bpmSum' || fk === '_bpmCount') continue;
    clean[fk] = r[fk];
  }
  return clean;
});
releasesArr.sort((a, b) => b.trackCount - a.trackCount);

// === Output ===
const out = {
  genres: Object.keys(sampleByGenre),
  labels: Object.values(lM),
  artists: artistsArr,
  tracks: tracksArr,
  // RP-BPI-001 — releases array prima di _meta
  releases: releasesArr,
  _meta: {
    source: 'beatport',
    version: 2,
    scrapedAt: NOW,
    totalLabels: Object.keys(lM).length,
    totalArtists: artistsArr.length,
    totalTracks: tracksArr.length,
    // RP-BPI-001 — conteggio release
    totalReleases: releasesArr.length,
    totalGenres: Object.keys(sampleByGenre).length,
    successGenres: Object.keys(sampleByGenre).length,
    failedGenres: 0
  }
};

// === Assertions ===
console.log('\n=== TEST RESULTS ===\n');

console.log('META:');
console.log('  totalLabels:', out._meta.totalLabels, '(expected: 4 — Experts Only, Solid Grooves, Drumcode, Truesoul)');
console.log('  totalArtists:', out._meta.totalArtists, '(expected: 7 — John Summit, venbee, Odd Mob, Mochakk, Adam Beyer, Layton Giordani, Wade)');
console.log('  totalTracks:', out._meta.totalTracks, '(expected: 7 — 3 Tech House + 3 Techno + 1 new Minimal = 7 unique, 1 cross-genre duplicate merged)');
console.log('  totalReleases:', out._meta.totalReleases, '(RP-BPI-001)');

console.log('\nLABELS:');
out.labels.forEach(l => {
  console.log('  ' + l.name + ' — genres: ' + l.genres.join(', ') + ' — trending: ' + l.trending);
  console.log('    rankByGenre:', JSON.stringify(l.rankByGenre));
  console.log('    pointsByGenre:', JSON.stringify(l.pointsByGenre));
});

console.log('\nARTISTS (sorted by points):');
out.artists.forEach(a => {
  console.log('  ' + a.name + ' (bpId:' + a.beatportId + ')');
  console.log('    genres:', a.genres.join(', '));
  console.log('    labelsPublishedOn:', a.labelsPublishedOn.join(', '));
  console.log('    totalPoints:', a.totalPoints, '/ bestPosition:', a.bestPosition, '/ trending:', a.trending);
  console.log('    isRemixerOnly:', a.isRemixerOnly);
  for (const gn in a.tracksByGenre) {
    console.log('    [' + gn + ']:');
    a.tracksByGenre[gn].forEach(t => {
      console.log('      #' + t.position + ' "' + t.name + '" (' + t.mixName + ') — ' + t.bpm + ' BPM ' + t.keyCamelot + ' — on ' + t.label + ' — ' + t.releaseDate + ' — ' + t.points + ' pts');
    });
  }
});

console.log('\nTRACKS (deduplicated):');
out.tracks.forEach(t => {
  console.log('  #' + t.id + ' "' + t.name + '" (' + t.mixName + ') — ' + t.bpm + ' BPM ' + t.keyCamelot);
  console.log('    artists:', t.artists.map(a => a.name).join(' + '));
  if (t.remixers.length > 0) console.log('    remixers:', t.remixers.map(a => a.name).join(' + '));
  console.log('    label:', t.label, '/ primaryGenre:', t.primaryGenre, '/ subGenre:', t.subGenre);
  console.log('    positions:', JSON.stringify(t.positions.map(p => ({ g: p.genre, pos: p.position, pts: p.points }))));
});

console.log('\nRELEASES (RP-BPI-001 — deduplicated):');
out.releases.forEach(r => {
  console.log('  #' + r.id + ' "' + r.name + '" — ' + r.trackCount + ' tracks — ' + r.artistNames.join(' + '));
  console.log('    label:', r.labelName, '/ releaseDate:', r.releaseDate, '/ bpmAvg:', r.bpmAverage);
  console.log('    genres:', r.genres.join(', '));
  console.log('    keyDistribution:', JSON.stringify(r.keyDistribution));
  console.log('    trackIds:', JSON.stringify(r.trackIds));
});

// === Save sample output JSON for inspection ===
const samplePath = '/home/z/my-project/download/beatport-scraper-v2-sample-output.json';
fs.mkdirSync('/home/z/my-project/download', { recursive: true });
fs.writeFileSync(samplePath, JSON.stringify(out, null, 2));
console.log('\n=== Sample JSON saved to: ' + samplePath + ' ===');

// === Verify assertions ===
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

console.log('\n=== ASSERTIONS ===');
assert('4 labels total', out._meta.totalLabels, 4);
assert('7 artists total (incl. remixer Wade)', out._meta.totalArtists, 7);
assert('7 tracks total (cross-genre dedup works)', out._meta.totalTracks, 7);

// John Summit should have 2 tracks in Tech House (positions 1 and 5), 0 in Techno
const summit = out.artists.find(a => a.name === 'John Summit');
assert('Summit totalPoints = 100 + 96 = 196', summit.totalPoints, 196);
assert('Summit has 2 tracks in Tech House', summit.tracksByGenre['Tech House'].length, 2);
assert('Summit bestPosition = 1', summit.bestPosition, 1);
assert('Summit trending = true', summit.trending, true);
assert('Summit labelsPublishedOn = ["EXPERTS ONLY"]', summit.labelsPublishedOn, ['EXPERTS ONLY']);

// Adam Beyer should have 3 tracks across 2 labels (Drumcode + Truesoul)
const beyer = out.artists.find(a => a.name === 'Adam Beyer');
assert('Beyer has 3 tracks in Techno', beyer.tracksByGenre['Techno Peak Time / Driving'].length, 3);
assert('Beyer labelsPublishedOn = ["DRUMCODE", "TRUESOUL"]', beyer.labelsPublishedOn.sort(), ['DRUMCODE', 'TRUESOUL'].sort());
assert('Beyer trending = true', beyer.trending, true);

// Mochakk should have tracks in 2 genres.
// In Tech House: only "lose control" (1 track).
// In Minimal / Deep Tech: "lose control" (cross-genre duplicate) + "dub layers" (2 tracks).
// (Pre-existing test expected 1 — was already failing before RP-BPI-001; fixed expectation here.)
const mochakk = out.artists.find(a => a.name === 'Mochakk');
assert('Mochakk has 1 track in Tech House', mochakk.tracksByGenre['Tech House'].length, 1);
assert('Mochakk has 2 tracks in Minimal / Deep Tech (lose control + dub layers)', mochakk.tracksByGenre['Minimal / Deep Tech'].length, 2);

// Track #19711256 (lose control) should have 2 positions (cross-genre)
const loseCtrl = out.tracks.find(t => t.id === 19711256);
assert('lose control has 2 position entries', loseCtrl.positions.length, 2);

// Odd Mob is a remixer only — should appear with isRemixerOnly: true
const oddMob = out.artists.find(a => a.name === 'Odd Mob');
assert('Odd Mob isRemixerOnly = true', oddMob.isRemixerOnly, true);
assert('Odd Mob has 0 tracks in tracksByGenre', Object.keys(oddMob.tracksByGenre).length, 0);

// Wade is a remixer in Mochakk's "dub layers" — also remixer-only
const wade = out.artists.find(a => a.name === 'Wade');
assert('Wade isRemixerOnly = true', wade.isRemixerOnly, true);

// === RP-BPI-001 — Release assertions ===
console.log('\n=== RP-BPI-001 RELEASE ASSERTIONS ===');

// Atteso: 6 release uniche nel sample
// Tech House:
//   - release 4803379 (palm of my hands - Odd Mob Extended Remix) — 1 track
//   - release senza id (walls) — fallback nm_rel_<slug>|label → 1 track
//   - release senza id (lose control su Solid Grooves Tech House) — 1 track
// Techno Peak Time / Driving:
//   - release senza id (code reader su Drumcode) — 1 track
//   - release senza id (server farm su Drumcode) — 1 track
//   - release senza id (industrial zone su Truesoul) — 1 track
// Minimal / Deep Tech:
//   - release senza id (lose control su Solid Grooves) — DUPLICATA con Tech House (stessa release slug+label) → merge
//   - release senza id (dub layers su Solid Grooves) — 1 track
// Totale: 6 release uniche (con lose control merged tra Tech House e Minimal).
// Nota: le tracce senza release.id usano come chiave nm_rel_<slug>|<labelName_upper>.
// lose control ha release.slug = '' → chiave nm_rel_|SOLID GROOVES (la stessa tra Tech House e Minimal).

assert('releases array is populated', out.releases.length > 0, true);
assert('releases is array', Array.isArray(out.releases), true);
assert('releases is before _meta in JSON keys', Object.keys(out).indexOf('releases'), Object.keys(out).indexOf('_meta') - 1);

// Verifica che ogni release abbia tutti i campi richiesti
const requiredFields = ['id', 'beatportId', 'name', 'slug', 'url', 'catalogNumber',
  'releaseDate', 'imageUrl', 'labelId', 'labelName', 'artistIds', 'artistNames',
  'trackIds', 'trackCount', 'genres', 'bpmAverage', 'keyDistribution', 'firstSeen', 'lastSeen'];
const releasesWithAllFields = out.releases.every(r => requiredFields.every(f => f in r));
assert('every release has all required fields', releasesWithAllFields, true);

// Verifica che nessuna release abbia campi privati _bpmSum/_bpmCount nell'output
const noPrivateFields = out.releases.every(r => !('_bpmSum' in r) && !('_bpmCount' in r));
assert('no private _bpmSum/_bpmCount in output', noPrivateFields, true);

// Verifica artistIds/artistNames coerenti (stessa lunghezza)
const artistsCoherent = out.releases.every(r => r.artistIds.length === r.artistNames.length);
assert('artistIds.length === artistNames.length for every release', artistsCoherent, true);

// Verifica trackCount === trackIds.length
const trackCountCoherent = out.releases.every(r => r.trackCount === r.trackIds.length);
assert('trackCount === trackIds.length for every release', trackCountCoherent, true);

// La release di "palm of my hands" (id 4803379) deve avere:
//   - 2 artistIds (John Summit + venbee come primary) + 1 remixer (Odd Mob) = 3
//   - 1 track (id 19711254)
//   - bpmAverage 132 (singola traccia con bpm 132)
//   - keyDistribution: { '2A': 1 } (camelot 2A dalla traccia)
//   - genres: ['Tech House']
//   - labelName: 'EXPERTS ONLY'
const palmRelease = out.releases.find(r => r.beatportId === 4803379);
assert('palm release found by beatportId 4803379', !!palmRelease, true);
if (palmRelease) {
  assert('palm release has 3 artistIds (John Summit + venbee + Odd Mob)', palmRelease.artistIds.length, 3);
  assert('palm release has 3 artistNames', palmRelease.artistNames.length, 3);
  assert('palm release artistNames = [John Summit, venbee, Odd Mob]', palmRelease.artistNames.sort(), ['John Summit', 'venbee', 'Odd Mob'].sort());
  assert('palm release trackCount = 1', palmRelease.trackCount, 1);
  assert('palm release trackIds = [19711254]', palmRelease.trackIds, [19711254]);
  assert('palm release bpmAverage = 132', palmRelease.bpmAverage, 132);
  assert('palm release keyDistribution = { "2A": 1 }', palmRelease.keyDistribution, { '2A': 1 });
  assert('palm release genres = ["Tech House"]', palmRelease.genres, ['Tech House']);
  assert('palm release labelName = "EXPERTS ONLY"', palmRelease.labelName, 'EXPERTS ONLY');
  assert('palm release url contains beatport.com/release/', palmRelease.url.indexOf('https://www.beatport.com/release/'), 0);
}

// La release "lose control" (stessa traccia cross-genre Tech House + Minimal / Deep Tech,
// stessa release.slug='' su Solid Grooves) deve essere MERGED in un singolo record:
//   - 1 artista (Mochakk)
//   - 1 traccia (19711256) — dedup trackIds
//   - 2 generi (Tech House + Minimal / Deep Tech)
//   - bpmAverage 128 (singola traccia, bpm 128)
//   - keyDistribution: { '6A': 2 } (2 occorrenze di 6A — una per genere)
const loseControlRelease = out.releases.find(r => r.trackIds.includes(19711256));
assert('lose control release found by trackId 19711256', !!loseControlRelease, true);
if (loseControlRelease) {
  assert('lose control release has 1 artist (Mochakk)', loseControlRelease.artistNames.length, 1);
  assert('lose control release artistNames = [Mochakk]', loseControlRelease.artistNames, ['Mochakk']);
  assert('lose control release trackCount = 1 (dedup)', loseControlRelease.trackCount, 1);
  assert('lose control release trackIds = [19711256]', loseControlRelease.trackIds, [19711256]);
  assert('lose control release genres = [Tech House, Minimal / Deep Tech]', loseControlRelease.genres.sort(), ['Tech House', 'Minimal / Deep Tech'].sort());
  assert('lose control release bpmAverage = 128', loseControlRelease.bpmAverage, 128);
  // La traccia 19711256 appare 2 volte (Tech House pos 12 + Minimal pos 2), entrambe con keyCamelot 6A
  assert('lose control release keyDistribution = { "6A": 2 }', loseControlRelease.keyDistribution, { '6A': 2 });
}

// Adam Beyer's tracks on Drumcode: code reader (19711260) e server farm (19711261)
// sono 2 release separate (slug diversi), ognuna con 1 traccia.
// Verifica che esistano 2 release distinte con trackId 19711260 e 19711261
const codeReaderRel = out.releases.find(r => r.trackIds.includes(19711260));
const serverFarmRel = out.releases.find(r => r.trackIds.includes(19711261));
assert('code reader release found', !!codeReaderRel, true);
assert('server farm release found', !!serverFarmRel, true);
assert('code reader and server farm are DIFFERENT releases', codeReaderRel !== serverFarmRel, true);
if (codeReaderRel) {
  assert('code reader release labelName = DRUMCODE', codeReaderRel.labelName, 'DRUMCODE');
  assert('code reader release artistNames = [Adam Beyer]', codeReaderRel.artistNames, ['Adam Beyer']);
  assert('code reader release bpmAverage = 135', codeReaderRel.bpmAverage, 135);
}
if (serverFarmRel) {
  assert('server farm release artistNames = [Adam Beyer, Layton Giordani]', serverFarmRel.artistNames, ['Adam Beyer', 'Layton Giordani']);
  assert('server farm release bpmAverage = 133', serverFarmRel.bpmAverage, 133);
}

// dub layers release: track 19711270 su Solid Grooves, artista Mochakk + remixer Wade
//   → artistIds deve contenere sia Mochakk che Wade
const dubLayersRel = out.releases.find(r => r.trackIds.includes(19711270));
assert('dub layers release found', !!dubLayersRel, true);
if (dubLayersRel) {
  assert('dub layers release has 2 artists (Mochakk + Wade)', dubLayersRel.artistNames.length, 2);
  assert('dub layers release artistNames = [Mochakk, Wade]', dubLayersRel.artistNames.sort(), ['Mochakk', 'Wade'].sort());
  assert('dub layers release bpmAverage = 127', dubLayersRel.bpmAverage, 127);
}

console.log('\n=== RESULT: ' + pass + ' passed, ' + fail + ' failed ===');
process.exit(fail > 0 ? 1 : 0);
