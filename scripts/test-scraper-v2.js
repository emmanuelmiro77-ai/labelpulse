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
      release: { id: 4803379, name: 'palm of my hands - Odd Mob Extended Remix',
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
      release: { image: { uri: 'https://example.com/cover2.jpg' },
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
      release: { label: { id: 9001, name: 'Solid Grooves', slug: 'solid-grooves' } },
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
      release: { label: { id: 1234, name: 'Drumcode', slug: 'drumcode' } },
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
      release: { label: { id: 1234, name: 'Drumcode', slug: 'drumcode' } },
      _position: 8
    },
    {
      id: 19711262, name: 'industrial zone', mix_name: 'Original Mix', slug: 'industrial-zone',
      artists: [{ id: 1456, name: 'Adam Beyer', slug: 'adam-beyer' }],
      remixers: [],
      bpm: 138,
      key: { name: 'G Minor', camelot_number: 6, camelot_letter: 'A' },
      publish_date: '2024-09-05',
      release: { label: { id: 5678, name: 'Truesoul', slug: 'truesoul' } },
      _position: 18
    }
  ],
  'Minimal / Deep Tech': [
    {
      // Cross-genre duplicate: same track appears in both Tech House and Minimal / Deep Tech
      id: 19711256, name: 'lose control', mix_name: 'Original Mix', slug: 'lose-control',
      artists: [{ id: 770001, name: 'Mochakk', slug: 'mochakk' }],
      remixers: [],
      bpm: 128,
      key: { name: 'G Minor', camelot_number: 6, camelot_letter: 'A' },
      publish_date: '2024-10-01',
      release: { label: { id: 9001, name: 'Solid Grooves', slug: 'solid-grooves' } },
      _position: 2
    },
    {
      id: 19711270, name: 'dub layers', mix_name: 'Dub Mix', slug: 'dub-layers',
      artists: [{ id: 770001, name: 'Mochakk', slug: 'mochakk' }],
      remixers: [{ id: 9999, name: 'Wade', slug: 'wade' }],
      bpm: 127,
      key: { name: 'A Minor', camelot_number: 8, camelot_letter: 'A' },
      publish_date: '2024-11-01',
      release: { label: { id: 9001, name: 'Solid Grooves', slug: 'solid-grooves' } },
      _position: 25
    }
  ]
};

// === Re-implement processTracks (mirror of the scraper) ===
function processTracks(tracks, gn, lm, am, tm) {
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
  }
}

// === Run across genres ===
const gR = {};
const globalAM = new Map();
const globalTM = new Map();

for (const gn of Object.keys(sampleByGenre)) {
  const lm = new Map(), am = new Map(), tm = new Map();
  processTracks(sampleByGenre[gn], gn, lm, am, tm);

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

// === Output ===
const out = {
  genres: Object.keys(sampleByGenre),
  labels: Object.values(lM),
  artists: artistsArr,
  tracks: tracksArr,
  _meta: {
    source: 'beatport',
    version: 2,
    scrapedAt: NOW,
    totalLabels: Object.keys(lM).length,
    totalArtists: artistsArr.length,
    totalTracks: tracksArr.length,
    totalGenres: Object.keys(sampleByGenre).length,
    successGenres: Object.keys(sampleByGenre).length,
    failedGenres: 0
  }
};

// === Assertions ===
console.log('\n=== TEST RESULTS ===\n');

console.log('META:');
console.log('  totalLabels:', out._meta.totalLabels, '(expected: 4 — Experts Only, Solid Grooves, Drumcode, Truesoul)');
console.log('  totalArtists:', out._meta.totalArtists, '(expected: 6 — John Summit, venbee, Odd Mob, Mochakk, Adam Beyer, Layton Giordani, Wade = 7)');
console.log('  totalTracks:', out._meta.totalTracks, '(expected: 7 — 3 Tech House + 3 Techno + 1 new Minimal = 7 unique, 1 cross-genre duplicate merged)');

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

// Mochakk should have tracks in 2 genres
const mochakk = out.artists.find(a => a.name === 'Mochakk');
assert('Mochakk has 1 track in Tech House', mochakk.tracksByGenre['Tech House'].length, 1);
assert('Mochakk has 1 track in Minimal / Deep Tech', mochakk.tracksByGenre['Minimal / Deep Tech'].length, 1);

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

console.log('\n=== RESULT: ' + pass + ' passed, ' + fail + ' failed ===');
process.exit(fail > 0 ? 1 : 0);
