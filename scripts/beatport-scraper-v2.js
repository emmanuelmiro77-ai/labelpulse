// ===================================================================
// LabelPulse Beatport Scraper v2
// Captures: labels, artists (with tracks), full track list per genre
// Output: JSON with { genres, labels, artists, tracks, _meta }
// Backward-compatible with v1 import (labels[] unchanged, extra fields ignored)
// ===================================================================
(async function () {
  'use strict';
  var D = 800;
  var G = [
    { id: 81, slug: '140-deep-dubstep-grime', name: '140 / Deep Dubstep / Grime' },
    { id: 89, slug: 'afro-house', name: 'Afro House' },
    { id: 99, slug: 'amapiano', name: 'Amapiano' },
    { id: 85, slug: 'ambient-experimental', name: 'Ambient / Experimental' },
    { id: 87, slug: 'bass-club', name: 'Bass / Club' },
    { id: 91, slug: 'bass-house', name: 'Bass House' },
    { id: 101, slug: 'brazilian-funk', name: 'Brazilian Funk' },
    { id: 9, slug: 'breaks-breakbeat-uk-bass', name: 'Breaks / Breakbeat / Uk Bass' },
    { id: 39, slug: 'dance-pop', name: 'Dance / Pop' },
    { id: 12, slug: 'deep-house', name: 'Deep House' },
    { id: 82, slug: 'downtempo', name: 'Downtempo' },
    { id: 1, slug: 'drum-and-bass', name: 'Drum & Bass' },
    { id: 18, slug: 'dubstep', name: 'Dubstep' },
    { id: 84, slug: 'electro-classic-detroit-modern', name: 'Electro Classic / Detroit / Modern' },
    { id: 3, slug: 'electronica', name: 'Electronica' },
    { id: 97, slug: 'funky-house', name: 'Funky House' },
    { id: 8, slug: 'hard-dance-hardcore-neo-rave', name: 'Hard Dance / Hardcore / Neo Rave' },
    { id: 98, slug: 'hard-techno', name: 'Hard Techno' },
    { id: 5, slug: 'house', name: 'House' },
    { id: 37, slug: 'indie-dance', name: 'Indie Dance' },
    { id: 96, slug: 'jackin-house', name: 'Jackin House' },
    { id: 100, slug: 'mainstage', name: 'Mainstage' },
    { id: 90, slug: 'melodic-house-techno', name: 'Melodic House & Techno' },
    { id: 14, slug: 'minimal-deep-tech', name: 'Minimal / Deep Tech' },
    { id: 50, slug: 'nu-disco-disco', name: 'Nu Disco / Disco' },
    { id: 88, slug: 'organic-house', name: 'Organic House' },
    { id: 15, slug: 'progressive-house', name: 'Progressive House' },
    { id: 13, slug: 'psy-trance', name: 'Psy-Trance' },
    { id: 11, slug: 'tech-house', name: 'Tech House' },
    { id: 6, slug: 'techno-peak-time-driving', name: 'Techno Peak Time / Driving' },
    { id: 92, slug: 'techno-raw-deep-hypnotic', name: 'Techno Raw / Deep / Hypnotic' },
    { id: 7, slug: 'trance-main-floor', name: 'Trance Main Floor' },
    { id: 38, slug: 'trap-future-bass', name: 'Trap / Future Bass' },
    { id: 86, slug: 'uk-garage-bassline', name: 'Uk Garage / Bassline' }
  ];

  var S = '%c[LabelPulse]', c1 = 'color:#8b5cf6;font-weight:bold', c2 = 'color:#666', cOk = 'color:#22c55e;font-weight:bold', cErr = 'color:#ef4444';
  console.log(S + ' %cBeatport Scraper v2 avviato', c1, c2);
  console.log(S + ' %cGeneri: ' + G.length + ' — cattura label, artisti, tracce', c1, c2);

  var NOW = new Date().toISOString();
  var sleep = function (ms) { return new Promise(function (r) { setTimeout(r, ms); }); };

  // ===================================================================
  // processTracks: popola labelMap (lm), artistMap (am), trackMap (tm)
  // gn = genre name (string)
  // ===================================================================
  function processTracks(tracks, gn, lm, am, tm) {
    for (var i = 0; i < tracks.length; i++) {
      var t = tracks[i];

      // === LABEL EXTRACTION ===
      var label = null;
      if (t.release && t.release.label) label = t.release.label;
      else if (t.label) label = t.label;
      if (!label || !label.name) continue;

      var labelName = label.name.toUpperCase().trim();
      var pos = t._position || (i + 1);
      var pts = Math.max(0, 101 - pos);

      // === KEY EXTRACTION ===
      var k = t.key || {};
      var keyCamelot = (k.camelot_number != null && k.camelot_letter) ? (k.camelot_number + k.camelot_letter) : '';
      var keyName = k.name || '';

      // === RELEASE DATE ===
      var releaseDate = t.publish_date || t.new_release_date || '';

      // === COVER ART (release image) ===
      var coverArt = (t.release && t.release.image && t.release.image.uri) || '';

      // === LABEL MAP ===
      if (!lm.has(labelName)) {
        lm.set(labelName, {
          id: label.id || null,
          name: labelName,
          slug: label.slug || '',
          imageUrl: (label.image && label.image.uri) || '',
          trackCount: 0,
          totalPoints: 0,
          bestPosition: pos
        });
      }
      var lb = lm.get(labelName);
      lb.trackCount++;
      lb.totalPoints += pts;
      if (pos < lb.bestPosition) lb.bestPosition = pos;

      // === ARTISTS (primary) ===
      var artistsRaw = Array.isArray(t.artists) ? t.artists.slice() : [];
      var remixersRaw = Array.isArray(t.remixers) ? t.remixers.slice() : [];

      function processArtist(a, isRemixer) {
        var key = a.id ? ('bp_' + a.id) : ('nm_' + a.name.toUpperCase().trim());
        if (!am.has(key)) {
          am.set(key, {
            id: key,
            beatportId: a.id || null,
            name: a.name,
            slug: a.slug || '',
            imageUrl: (a.image && a.image.uri) || '',
            genres: [],
            tracksByGenre: {},
            labelsPublishedOn: [],
            totalPoints: 0,
            bestPosition: pos,
            isRemixerOnly: isRemixer
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
              id: t.id,
              name: t.name,
              mixName: t.mix_name || '',
              position: pos,
              points: pts,
              label: labelName,
              labelId: label.id || null,
              labelSlug: label.slug || '',
              releaseDate: releaseDate,
              bpm: t.bpm || null,
              keyCamelot: keyCamelot,
              keyName: keyName,
              coverArt: coverArt,
              sampleUrl: t.sample_url || '',
              seenAt: NOW
            });
          }
          ar.totalPoints += pts;
          if (pos < ar.bestPosition) ar.bestPosition = pos;
        }
        // For remixers, we only track that they remixed something (genres + labels already added)
        // but we don't credit points (it's not "their" track).
        // If they appear as primary artist elsewhere, isRemixerOnly flag will be false.
        if (!isRemixer && ar.isRemixerOnly) ar.isRemixerOnly = false;
      }

      artistsRaw.forEach(function (a) { processArtist(a, false); });
      remixersRaw.forEach(function (a) { processArtist(a, true); });

      // === TRACK MAP (deduplicated by Beatport track id) ===
      var trackKey = t.id ? ('bp_' + t.id) : ('nm_' + t.name + '|' + labelName);
      if (!tm.has(trackKey)) {
        tm.set(trackKey, {
          id: t.id || null,
          key: trackKey,
          name: t.name,
          mixName: t.mix_name || '',
          slug: t.slug || '',
          artists: artistsRaw.map(function (a) { return { id: a.id || null, name: a.name, slug: a.slug || '' }; }),
          remixers: remixersRaw.map(function (a) { return { id: a.id || null, name: a.name, slug: a.slug || '' }; }),
          label: labelName,
          labelId: label.id || null,
          labelSlug: label.slug || '',
          primaryGenre: gn,
          subGenre: (t.sub_genre && t.sub_genre.name) || null,
          bpm: t.bpm || null,
          keyCamelot: keyCamelot,
          keyName: keyName,
          releaseDate: releaseDate,
          coverArt: coverArt,
          sampleUrl: t.sample_url || '',
          positions: [{ genre: gn, position: pos, points: pts, seenAt: NOW }],
          seenAt: NOW
        });
      } else {
        // Same track seen in another genre — append position entry
        var tr = tm.get(trackKey);
        tr.positions.push({ genre: gn, position: pos, points: pts, seenAt: NOW });
      }
    }
  }

  // ===================================================================
  // fetchGenre: tries multiple sources, returns { lm, am, tm }
  // ===================================================================
  async function fetchGenre(gid, slug, gn) {
    var lm = new Map(), am = new Map(), tm = new Map();
    for (var att = 1; att <= 3; att++) {
      lm = new Map(); am = new Map(); tm = new Map();
      try {
        var r = await fetch('/api/catalog/genres/' + gid + '/top-100/', { credentials: 'include' });
        if (r.ok) {
          var d = await r.json(), tr = d.results || d.tracks || d;
          if (Array.isArray(tr) && tr.length > 0) {
            console.log(S + ' %c API interna: ' + tr.length + ' tracce', c1, cOk);
            processTracks(tr, gn, lm, am, tm);
          }
        }
      } catch (e) { /* ignore */ }
      if (lm.size > 0) break;

      try {
        var r2 = await fetch('https://api.beatport.com/v4/catalog/genres/' + gid + '/top-10-tracks/?per_page=100', { credentials: 'include' });
        if (r2.ok) {
          var d2 = await r2.json(), tr2 = d2.results || d2;
          if (Array.isArray(tr2) && tr2.length > 0) {
            console.log(S + ' %c API v4: ' + tr2.length + ' tracce', c1, cOk);
            processTracks(tr2, gn, lm, am, tm);
          }
        }
      } catch (e) { /* ignore */ }
      if (lm.size > 0) break;

      try {
        var r3 = await fetch('https://www.beatport.com/genre/' + slug + '/' + gid + '/top-100', { credentials: 'include' });
        if (r3.ok) {
          var html = await r3.text(), p = new DOMParser(), doc = p.parseFromString(html, 'text/html'), nd = doc.getElementById('__NEXT_DATA__');
          if (nd) {
            var nData = JSON.parse(nd.textContent);
            var q = nData && nData.props && nData.props.pageProps && nData.props.pageProps.dehydratedState && nData.props.pageProps.dehydratedState.queries;
            if (q) {
              for (var qi = 0; qi < q.length; qi++) {
                var res = q[qi].state && q[qi].state.data && q[qi].state.data.results;
                if (Array.isArray(res) && res.length > 0) {
                  console.log(S + ' %c Next.js data: ' + res.length + ' tracce', c1, cOk);
                  processTracks(res, gn, lm, am, tm);
                  break;
                }
                var trk = q[qi].state && q[qi].state.data && q[qi].state.data.tracks;
                if (Array.isArray(trk) && trk.length > 0) {
                  console.log(S + ' %c Next.js data: ' + trk.length + ' tracce', c1, cOk);
                  processTracks(trk, gn, lm, am, tm);
                  break;
                }
              }
            }
          }
          // HTML fallback: label-only (artist data not reliably extractable from HTML)
          if (lm.size === 0) {
            var tEls = doc.querySelectorAll('[data-testid="track-row"],.track-grid-content,.bucket-item');
            var htmlTracks = [];
            tEls.forEach(function (el, idx) {
              try {
                var lEl = el.querySelector('[data-testid="label-name"],.buk-track-labels a,.track-label a');
                var lName = lEl ? lEl.textContent.trim() : null;
                var lHref = lEl ? lEl.getAttribute('href') : '';
                var lIdM = lHref.match(/\/label\/(\d+)/);
                if (lName) {
                  htmlTracks.push({
                    id: null,
                    name: '',
                    mix_name: '',
                    artists: [],
                    remixers: [],
                    release: { label: { id: lIdM ? parseInt(lIdM[1]) : null, name: lName, slug: lHref.split('/').pop() || '' } },
                    _position: idx + 1
                  });
                }
              } catch (e) { /* ignore */ }
            });
            if (htmlTracks.length > 0) {
              console.log(S + ' %c HTML parsing (label-only): ' + htmlTracks.length + ' tracce', c1, cOk);
              processTracks(htmlTracks, gn, lm, am, tm);
            }
          }
        }
      } catch (e) {
        console.log(S + ' %c Errore: ' + e.message, c1, cErr);
      }
      if (lm.size > 0) break;
      if (att < 3) {
        console.log(S + ' %c 0 label, retry ' + att + '/2 in 1.5s...', c1, c2);
        await sleep(1500);
      }
    }
    if (lm.size === 0) console.log(S + ' %c Nessun dato dopo 3 tentativi', c1, cErr);
    return { lm: lm, am: am, tm: tm };
  }

  // ===================================================================
  // MAIN LOOP
  // ===================================================================
  console.log(S + ' %c========================================', c1, c1);
  console.log(S + ' %cINIZIO ESTRAZIONE', c1, cOk);
  console.log(S + ' %c========================================', c1, c1);

  var gR = {}, tL = 0, sC = 0, fC = 0;
  var globalAM = new Map(), globalTM = new Map();

  for (var gi = 0; gi < G.length; gi++) {
    var g = G[gi];
    var pct = Math.round(((gi + 1) / G.length) * 100);
    console.log(S + ' %c[' + pct + '%] ' + g.name + '...', c1, c2);

    var res = await fetchGenre(g.id, g.slug, g.name);
    var la = Array.from(res.lm.values());
    la.sort(function (a, b) { return b.totalPoints - a.totalPoints; });
    la.forEach(function (l, i) { l.rank = i + 1; });
    gR[g.name] = la;
    tL += la.length;

    // === Merge artists across genres ===
    res.am.forEach(function (v, k) {
      if (globalAM.has(k)) {
        var ex = globalAM.get(k);
        v.genres.forEach(function (gn2) { if (ex.genres.indexOf(gn2) === -1) ex.genres.push(gn2); });
        v.labelsPublishedOn.forEach(function (ln) { if (ex.labelsPublishedOn.indexOf(ln) === -1) ex.labelsPublishedOn.push(ln); });
        for (var gn3 in v.tracksByGenre) {
          if (!ex.tracksByGenre[gn3]) ex.tracksByGenre[gn3] = [];
          v.tracksByGenre[gn3].forEach(function (tr2) { ex.tracksByGenre[gn3].push(tr2); });
        }
        ex.totalPoints += v.totalPoints;
        if (v.bestPosition < ex.bestPosition) ex.bestPosition = v.bestPosition;
        if (!v.isRemixerOnly) ex.isRemixerOnly = false;
      } else {
        globalAM.set(k, v);
      }
    });

    // === Merge tracks across genres ===
    res.tm.forEach(function (v, k) {
      if (globalTM.has(k)) {
        var ex = globalTM.get(k);
        v.positions.forEach(function (p) { ex.positions.push(p); });
      } else {
        globalTM.set(k, v);
      }
    });

    if (la.length > 0) {
      sC++;
      console.log(S + ' %c  OK ' + la.length + ' label \u2014 ' + res.am.size + ' artisti \u2014 ' + res.tm.size + ' tracce \u2014 #1: ' + la[0].name, c1, cOk);
    } else {
      fC++;
    }
    await sleep(D);
  }

  console.log(S + ' %cCostruzione JSON...', c1, c2);

  // ===================================================================
  // BUILD LABELS (same shape as v1 — backward compatible)
  // ===================================================================
  var lM = {};
  for (var gn4 in gR) {
    for (var li = 0; li < gR[gn4].length; li++) {
      var lb = gR[gn4][li];
      var nm = lb.name.toUpperCase().trim();
      if (!nm) continue;
      if (!lM[nm]) {
        lM[nm] = {
          id: 'lbl_' + nm.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/_+$/, ''),
          name: nm,
          genres: [],
          rankByGenre: {},
          pointsByGenre: {},
          trending: false
        };
        if (lb.id) lM[nm].beatportId = lb.id;
        if (lb.slug) lM[nm].slug = lb.slug;
        if (lb.imageUrl) lM[nm].imageUrl = lb.imageUrl;
      }
      if (lM[nm].genres.indexOf(gn4) === -1) lM[nm].genres.push(gn4);
      lM[nm].rankByGenre[gn4] = lb.rank;
      lM[nm].pointsByGenre[gn4] = lb.totalPoints;
    }
  }

  // Trending computation for labels (same as v1)
  for (var k in lM) {
    var l = lM[k];
    var ranks = Object.values(l.rankByGenre);
    var minR = Math.min.apply(null, ranks);
    var tPts = Object.values(l.pointsByGenre).reduce(function (a, b) { return a + b; }, 0);
    if (minR <= 25 || tPts > 500) {
      l.trending = true;
      l.trendingRankByGenre = {};
      l.trendingPointsByGenre = {};
      for (var gr in l.rankByGenre) {
        if (l.rankByGenre[gr] <= 50) {
          l.trendingRankByGenre[gr] = l.rankByGenre[gr];
          l.trendingPointsByGenre[gr] = l.pointsByGenre[gr];
        }
      }
    }
  }

  // ===================================================================
  // BUILD ARTISTS (with trending computation)
  // ===================================================================
  var artistsArr = Array.from(globalAM.values());
  artistsArr.forEach(function (a) {
    // Sort each genre's tracks by points desc
    for (var gn5 in a.tracksByGenre) {
      a.tracksByGenre[gn5].sort(function (x, y) { return y.points - x.points; });
    }
    // Trending: best position <= 25 OR total points > 500
    if (a.bestPosition <= 25 || a.totalPoints > 500) {
      a.trending = true;
      a.trendingRankByGenre = {};
      a.trendingPointsByGenre = {};
      for (var gn6 in a.tracksByGenre) {
        var genrePoints = a.tracksByGenre[gn6].reduce(function (acc, t) { return acc + t.points; }, 0);
        var genreBestPos = a.tracksByGenre[gn6].reduce(function (min, t) { return t.position < min ? t.position : min; }, 999);
        if (genreBestPos <= 50) {
          a.trendingRankByGenre[gn6] = genreBestPos;
          a.trendingPointsByGenre[gn6] = genrePoints;
        }
      }
    } else {
      a.trending = false;
    }
  });
  artistsArr.sort(function (a, b) { return b.totalPoints - a.totalPoints; });

  // ===================================================================
  // BUILD TRACKS (global, deduplicated)
  // ===================================================================
  var tracksArr = Array.from(globalTM.values());

  // ===================================================================
  // OUTPUT
  // ===================================================================
  var out = {
    genres: G.map(function (g) { return g.name; }),
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
      totalGenres: G.length,
      successGenres: sC,
      failedGenres: fC
    }
  };

  var js = JSON.stringify(out, null, 2),
    bl = new Blob([js], { type: 'application/json' }),
    u = URL.createObjectURL(bl),
    a = document.createElement('a');
  a.href = u;
  a.download = 'labelpulse_beatport_' + new Date().toISOString().split('T')[0] + '.json';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(u);

  console.log(S + ' %c========================================', c1, c1);
  console.log(S + ' %cCOMPLETATO!', c1, cOk);
  console.log(S + ' %c' + Object.keys(lM).length + ' label, ' + artistsArr.length + ' artisti, ' + tracksArr.length + ' tracce da ' + sC + '/' + G.length + ' generi', c1, cOk);
  if (fC > 0) console.log(S + ' %c ' + fC + ' generi senza dati', c1, cErr);
  console.log(S + ' %cFile JSON scaricato! Importa in LabelPulse', c1, cOk);
  console.log(S + ' %c========================================', c1, c1);
  return out;
})();
