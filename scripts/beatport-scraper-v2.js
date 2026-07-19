// ===================================================================
// LabelPulse Beatport Scraper v2
// Captures: labels (con loghi), artists (with tracks), full track list per genre,
//           releases (RP-BPI-001 — release-level aggregation)
// Output: JSON with { genres, labels, artists, tracks, releases, _meta }
// Backward-compatible with v1 import (labels[] unchanged, extra fields ignored)
//
// LOGHI LABEL: per ogni label viene catturato imageUrl (CDN Beatport) da
// label.image.uri nella response API. Le label senza logo su Beatport
// avranno imageUrl='' e l'UI mostrerà un fallback con iniziali+gradiente.
// I loghi sono mostrati automaticamente nelle card e nel detail dialog
// del Label Finder dopo l'import.
//
// RP-BPI-001 — RELEASE ENTITY:
// Durante processTracks() viene popolato anche releaseMap. Ogni release è
// deduplicata per id (fallback slug). Se incontrata più volte (più tracce
// della stessa release, o stessa release in più generi), vengono aggiornati
// artistIds, trackIds, genres, bpmAverage e keyDistribution senza creare
// duplicati. Le release sono mergete globalmente come artistMap e trackMap,
// e incluse nell'output JSON prima di _meta.
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
  console.log(S + ' %cGeneri: ' + G.length + ' — cattura label (con loghi), artisti, tracce', c1, c2);

  var NOW = new Date().toISOString();
  var sleep = function (ms) { return new Promise(function (r) { setTimeout(r, ms); }); };

  // ===================================================================
  // RP-BPI-002A — STABLE ID HELPERS
  //
  // Ogni entità ha un identificatore STABILE indipendente dal nome:
  //   Artist  → 'bp_<beatportId>' oppure 'nm_<NAME_UPPER>' (fallback)
  //   Label   → 'bp_lbl_<beatportId>' oppure 'nm_lbl_<NAME_UPPER>' (fallback)
  //   Track   → 'bp_<beatportId>' oppure 'nm_<name>|<LABEL_NAME>' (fallback)
  //   Release → 'bp_rel_<beatportId>' oppure 'nm_rel_<slug>|<LABEL_NAME>' (fallback)
  //
  // Queste funzioni vengono usate per popolare i nuovi campi *Ids[]/*Key
  // nelle entità, in modo che i riferimenti siano sempre basati su ID
  // (Beatport id quando esiste, fallback name-based quando manca).
  // I campi legacy (name-based come `label`, `labelId`, `artists`/`remixers`
  // come array di oggetti `{id,name,slug}`) vengono PRESERVATI per
  // retrocompatibilità.
  // ===================================================================

  function artistKey(a) {
    if (!a) return null;
    if (a.id) return 'bp_' + a.id;
    var nm = (a.name || '').toUpperCase().trim();
    return nm ? ('nm_' + nm) : null;
  }

  function labelKey(label) {
    if (!label) return null;
    if (label.id) return 'bp_lbl_' + label.id;
    var nm = (label.name || '').toUpperCase().trim();
    return nm ? ('nm_lbl_' + nm) : null;
  }

  function trackKeyFor(t, labelName) {
    if (!t) return null;
    if (t.id) return 'bp_' + t.id;
    var nm = (t.name || '').toUpperCase().trim();
    return nm ? ('nm_' + nm + '|' + (labelName || '')) : null;
  }

  function releaseKeyFor(rel, labelName) {
    if (!rel) return null;
    if (rel.id) return 'bp_rel_' + rel.id;
    var slug = rel.slug || rel.name || '';
    return slug ? ('nm_rel_' + slug + '|' + (labelName || '')) : null;
  }

  // ===================================================================
  // processTracks: popola labelMap (lm), artistMap (am), trackMap (tm),
  //                releaseMap (rm) — RP-BPI-001
  // gn = genre name (string)
  //
  // RP-BPI-002A — Track/Artist/Label/Release entità vengono popolate con
  // riferimenti stabili basati su ID (Beatport id quando esiste, fallback
  // name-based). I campi legacy vengono preservati per retrocompatibilità.
  // ===================================================================
  function processTracks(tracks, gn, lm, am, tm, rm) {
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

      // RP-BPI-002A — stable label key (bp_lbl_<id> o nm_lbl_<name>)
      var lblKey = labelKey(label);

      // === KEY EXTRACTION ===
      var k = t.key || {};
      var keyCamelot = (k.camelot_number != null && k.camelot_letter) ? (k.camelot_number + k.camelot_letter) : '';
      var keyName = k.name || '';

      // === RELEASE DATE ===
      var releaseDate = t.publish_date || t.new_release_date || '';

      // === COVER ART (release image) ===
      var coverArt = (t.release && t.release.image && t.release.image.uri) || '';

      // === LABEL MAP ===
      // RP-BPI-002A — aggiunto campo `key` (stable id) e `beatportId`.
      //              La Map è ancora keyed by NAME per backward compat con
      //              il codice esistente (che cerca per labelName).
      if (!lm.has(labelName)) {
        lm.set(labelName, {
          id: label.id || null,
          key: lblKey,                       // RP-BPI-002A — stable label key
          beatportId: label.id || null,      // RP-BPI-002A — alias esplicito
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

      // RP-BPI-002A — stable keys per artisti e remixers della traccia corrente
      var primaryArtistKeys = artistsRaw.map(artistKey).filter(function (kx) { return kx !== null; });
      var remixerKeys = remixersRaw.map(artistKey).filter(function (kx) { return kx !== null; });

      function processArtist(a, isRemixer) {
        var key = artistKey(a);
        if (!key) return;
        if (!am.has(key)) {
          am.set(key, {
            id: key,
            beatportId: a.id || null,
            name: a.name,
            slug: a.slug || '',
            imageUrl: (a.image && a.image.uri) || '',
            genres: [],
            tracksByGenre: {},
            labelsPublishedOn: [],            // legacy: array di NAME (backward compat)
            labelIds: [],                     // RP-BPI-002A — array di stable label keys
            totalPoints: 0,
            bestPosition: pos,
            isRemixerOnly: isRemixer
          });
        }
        var ar = am.get(key);
        if (ar.genres.indexOf(gn) === -1) ar.genres.push(gn);
        if (ar.labelsPublishedOn.indexOf(labelName) === -1) ar.labelsPublishedOn.push(labelName);
        // RP-BPI-002A — aggiungi stable label key (dedup)
        if (lblKey && ar.labelIds.indexOf(lblKey) === -1) ar.labelIds.push(lblKey);

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
              labelKey: lblKey,                 // RP-BPI-002A — stable label key
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
      var trackKey = trackKeyFor(t, labelName);
      // RP-BPI-002A — stable release key per linkare Track → Release
      var rel = t.release || null;
      var tReleaseKey = releaseKeyFor(rel, labelName);
      if (!tm.has(trackKey)) {
        tm.set(trackKey, {
          id: t.id || null,
          key: trackKey,                     // RP-BPI-002A — stable track key (alias of map key)
          beatportId: t.id || null,          // RP-BPI-002A — alias esplicito
          name: t.name,
          mixName: t.mix_name || '',
          slug: t.slug || '',
          // Legacy artist arrays (preservati per backward compat — array di oggetti {id,name,slug})
          artists: artistsRaw.map(function (a) { return { id: a.id || null, name: a.name, slug: a.slug || '' }; }),
          remixers: remixersRaw.map(function (a) { return { id: a.id || null, name: a.name, slug: a.slug || '' }; }),
          // RP-BPI-002A — stable artist/remixer keys (array di stringhe 'bp_<id>'/'nm_<name>')
          artistIds: primaryArtistKeys.slice(),
          remixerIds: remixerKeys.slice(),
          // Legacy label fields (preservati — label è il NAME, labelId è il BP id)
          label: labelName,
          labelId: label.id || null,
          labelKey: lblKey,                  // RP-BPI-002A — stable label key
          labelSlug: label.slug || '',
          // RP-BPI-002A — stable release key (link Track → Release)
          releaseId: tReleaseKey,
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
        // RP-BPI-002A — se la traccia esiste già ma releaseId non era settato (race condition edge), fill
        if (!tr.releaseId && tReleaseKey) tr.releaseId = tReleaseKey;
      }

      // === RELEASE MAP (RP-BPI-001) ===
      // Deduplica per release.id (fallback slug). Se la release è già nota,
      // aggiorna artistIds, trackIds, genres, bpmAverage e keyDistribution
      // senza creare duplicati.
      //
      // RP-BPI-002A — artistIds[] ora contiene STABLE KEYS ('bp_<id>'/'nm_<name>'),
      //              non più BP ids raw. Il campo legacy artistIds era array
      //              di BP ids (con null per name-only); per backward compat
      //              manteniamo `artistBpIds[]` con i BP ids (null-safe).
      //              Stessa cosa per trackIds → trackBpIds[].
      if (rel && (rel.id || rel.slug)) {
        var releaseKey = releaseKeyFor(rel, labelName);
        var releaseId = rel.id || null;
        var releaseSlug = rel.slug || '';
        var releaseName = rel.name || '';
        // URL costruito da slug + id (formato Beatport standard)
        var releaseUrl = releaseSlug && releaseId
          ? ('https://www.beatport.com/release/' + releaseSlug + '/' + releaseId)
          : '';
        var releaseCatalog = rel.catalog_number || rel.catalogNumber || '';
        var releaseImage = (rel.image && rel.image.uri) || coverArt || '';

        // Campi specifici della traccia corrente (per aggregazione)
        var trackBpId = t.id || null;
        var trackBpm = (typeof t.bpm === 'number' && t.bpm > 0) ? t.bpm : null;
        // Per artistIds/Names: includiamo sia primary artists che remixers
        var allArtistsOnTrack = artistsRaw.concat(remixersRaw);
        // RP-BPI-002A — stable keys per artisti (primary + remixers)
        var allArtistKeysOnTrack = primaryArtistKeys.concat(remixerKeys);

        if (!rm.has(releaseKey)) {
          // === NUOVA RELEASE ===
          var newRel = {
            id: releaseId,
            beatportId: releaseId,
            key: releaseKey,                 // RP-BPI-002A — stable release key (alias esplicito)
            name: releaseName,
            slug: releaseSlug,
            url: releaseUrl,
            catalogNumber: releaseCatalog,
            releaseDate: releaseDate,
            imageUrl: releaseImage,
            labelId: label.id || null,       // legacy: BP id della label (null se mancante)
            labelKey: lblKey,                // RP-BPI-002A — stable label key
            labelName: labelName,
            // RP-BPI-002A — artistIds[] ora contiene STABLE KEYS (legacy era BP ids).
            // Per backward compat con RP-BPI-001, manteniamo artistBpIds[] con i BP ids.
            artistIds: [],                   // RP-BPI-002A — stable artist keys ('bp_<id>'/'nm_<name>')
            artistBpIds: [],                 // RP-BPI-002A — legacy BP ids (alias del vecchio artistIds)
            artistNames: [],
            trackIds: [],                    // RP-BPI-002A — stable track keys ('bp_<id>'/'nm_<name>|<label>')
            trackBpIds: [],                  // RP-BPI-002A — legacy BP track ids (alias del vecchio trackIds)
            trackCount: 0,
            genres: [],
            bpmAverage: null,
            keyDistribution: {},
            firstSeen: NOW,
            lastSeen: NOW
          };
          // Popola artistIds/Names (dedup per stable key)
          var seenArtistKeys = {};
          allArtistsOnTrack.forEach(function (a, idx) {
            var aKey = artistKey(a);
            if (!aKey) return;
            if (!seenArtistKeys[aKey]) {
              seenArtistKeys[aKey] = true;
              newRel.artistIds.push(aKey);
              newRel.artistBpIds.push(a.id || null);
              newRel.artistNames.push(a.name || '');
            }
          });
          // Popola trackIds (stable key) e trackBpIds (legacy BP id)
          if (trackKey) newRel.trackIds.push(trackKey);
          if (trackBpId != null) newRel.trackBpIds.push(trackBpId);
          newRel.trackCount = newRel.trackIds.length;
          // Popola genres
          if (newRel.genres.indexOf(gn) === -1) newRel.genres.push(gn);
          // Inizializza bpmAverage e keyDistribution con la traccia corrente
          var bpmSum = 0, bpmCount = 0;
          if (trackBpm != null) { bpmSum += trackBpm; bpmCount++; }
          newRel.bpmAverage = bpmCount > 0 ? Math.round(bpmSum / bpmCount) : null;
          if (keyCamelot) {
            newRel.keyDistribution[keyCamelot] = 1;
          }
          rm.set(releaseKey, newRel);
        } else {
          // === RELEASE ESISTENTE — AGGIORNA ===
          var exRel = rm.get(releaseKey);
          // Aggiorna artistIds (stable keys, dedup) + artistBpIds (legacy) + artistNames
          allArtistsOnTrack.forEach(function (a) {
            var aKey = artistKey(a);
            if (!aKey) return;
            if (exRel.artistIds.indexOf(aKey) === -1) {
              exRel.artistIds.push(aKey);
              exRel.artistBpIds.push(a.id || null);
              exRel.artistNames.push(a.name || '');
            }
          });
          // Aggiorna trackIds (stable key, dedup) + trackBpIds (legacy, dedup)
          if (trackKey && exRel.trackIds.indexOf(trackKey) === -1) {
            exRel.trackIds.push(trackKey);
          }
          if (trackBpId != null && exRel.trackBpIds.indexOf(trackBpId) === -1) {
            exRel.trackBpIds.push(trackBpId);
          }
          exRel.trackCount = exRel.trackIds.length;
          // Aggiorna genres (dedup)
          if (exRel.genres.indexOf(gn) === -1) exRel.genres.push(gn);
          // Ricalcola bpmAverage su tutte le tracce note.
          // Approccio: teniamo running sum e count direttamente nella release.
          // Poiché non abbiamo accesso diretto a tutte le tracce qui, usiamo
          // un'approssimazione: accumuliamo _bpmSum e _bpmCount come campi
          // privati (con underscore) e li usiamo per il calcolo.
          if (trackBpm != null) {
            if (typeof exRel._bpmSum !== 'number') {
              // Prima aggregazione dopo la creazione: inizializza con i valori attuali
              exRel._bpmSum = exRel.bpmAverage || 0;
              exRel._bpmCount = exRel.bpmAverage != null ? 1 : 0;
            }
            exRel._bpmSum += trackBpm;
            exRel._bpmCount++;
            exRel.bpmAverage = Math.round(exRel._bpmSum / exRel._bpmCount);
          }
          // Aggiorna keyDistribution
          if (keyCamelot) {
            exRel.keyDistribution[keyCamelot] = (exRel.keyDistribution[keyCamelot] || 0) + 1;
          }
          // Aggiorna lastSeen
          exRel.lastSeen = NOW;
          // Aggiorna labelId/labelKey/labelName se non erano settati (caso edge)
          if (!exRel.labelId && label.id) exRel.labelId = label.id;
          if (!exRel.labelKey && lblKey) exRel.labelKey = lblKey;
          if (!exRel.labelName) exRel.labelName = labelName;
          // Aggiorna imageUrl se non era settato
          if (!exRel.imageUrl && releaseImage) exRel.imageUrl = releaseImage;
          // Aggiorna releaseDate se non era settato (manteniamo il primo valore)
          if (!exRel.releaseDate && releaseDate) exRel.releaseDate = releaseDate;
          // Aggiorna catalogNumber se non era settato
          if (!exRel.catalogNumber && releaseCatalog) exRel.catalogNumber = releaseCatalog;
          // Aggiorna slug/url/name se non erano settati (release senza id inizialmente)
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

  // ===================================================================
  // fetchGenre: tries multiple sources, returns { lm, am, tm, rm }
  // RP-BPI-001 — rm (releaseMap) è ritornato insieme a lm/am/tm.
  // ===================================================================
  async function fetchGenre(gid, slug, gn) {
    var lm = new Map(), am = new Map(), tm = new Map(), rm = new Map();
    for (var att = 1; att <= 3; att++) {
      lm = new Map(); am = new Map(); tm = new Map(); rm = new Map();
      try {
        var r = await fetch('/api/catalog/genres/' + gid + '/top-100/', { credentials: 'include' });
        if (r.ok) {
          var d = await r.json(), tr = d.results || d.tracks || d;
          if (Array.isArray(tr) && tr.length > 0) {
            console.log(S + ' %c API interna: ' + tr.length + ' tracce', c1, cOk);
            processTracks(tr, gn, lm, am, tm, rm);
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
            processTracks(tr2, gn, lm, am, tm, rm);
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
                  processTracks(res, gn, lm, am, tm, rm);
                  break;
                }
                var trk = q[qi].state && q[qi].state.data && q[qi].state.data.tracks;
                if (Array.isArray(trk) && trk.length > 0) {
                  console.log(S + ' %c Next.js data: ' + trk.length + ' tracce', c1, cOk);
                  processTracks(trk, gn, lm, am, tm, rm);
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
              processTracks(htmlTracks, gn, lm, am, tm, rm);
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
    return { lm: lm, am: am, tm: tm, rm: rm };
  }

  // ===================================================================
  // MAIN LOOP
  // ===================================================================
  console.log(S + ' %c========================================', c1, c1);
  console.log(S + ' %cINIZIO ESTRAZIONE', c1, cOk);
  console.log(S + ' %c========================================', c1, c1);

  var gR = {}, tL = 0, sC = 0, fC = 0;
  var globalAM = new Map(), globalTM = new Map();
  // RP-BPI-001 — releaseMap globale, mergeto per-genre come globalAM e globalTM.
  var globalRM = new Map();

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
    // RP-BPI-002A — merge anche di labelIds[] (stable keys) oltre a labelsPublishedOn[] (names).
    res.am.forEach(function (v, k) {
      if (globalAM.has(k)) {
        var ex = globalAM.get(k);
        v.genres.forEach(function (gn2) { if (ex.genres.indexOf(gn2) === -1) ex.genres.push(gn2); });
        v.labelsPublishedOn.forEach(function (ln) { if (ex.labelsPublishedOn.indexOf(ln) === -1) ex.labelsPublishedOn.push(ln); });
        // RP-BPI-002A — merge stable label keys
        if (Array.isArray(v.labelIds)) {
          v.labelIds.forEach(function (lk) {
            if (lk && ex.labelIds.indexOf(lk) === -1) ex.labelIds.push(lk);
          });
        }
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
        // RP-BPI-002A — fill releaseId se la prima occorrenza non lo aveva
        if (!ex.releaseId && v.releaseId) ex.releaseId = v.releaseId;
      } else {
        globalTM.set(k, v);
      }
    });

    // === RP-BPI-001 — Merge releases across genres ===
    // Stessa logica di aggregazione usata in processTracks per le release
    // già esistenti: dedup artistIds, trackIds, genres; ricalcola bpmAverage;
    // aggiorna keyDistribution; aggiorna lastSeen e campi mancanti.
    //
    // RP-BPI-002A — artistIds[] e trackIds[] ora contengono STABLE KEYS.
    // La dedup è fatta per stable key (stringa 'bp_<id>' o 'nm_<name>').
    // artistBpIds[] e trackBpIds[] (legacy BP ids) vengono mantenuti
    // allineati per backward compat.
    res.rm.forEach(function (v, k) {
      if (globalRM.has(k)) {
        var exR = globalRM.get(k);
        // Merge artistIds (stable keys, dedup) + artistBpIds (legacy) + artistNames
        v.artistIds.forEach(function (aKey, idx) {
          if (!aKey) return;
          if (exR.artistIds.indexOf(aKey) === -1) {
            exR.artistIds.push(aKey);
            exR.artistBpIds.push(v.artistBpIds[idx] != null ? v.artistBpIds[idx] : null);
            exR.artistNames.push(v.artistNames[idx] || '');
          }
        });
        // Merge trackIds (stable keys, dedup) + trackBpIds (legacy, dedup)
        v.trackIds.forEach(function (tKey, idx) {
          if (!tKey) return;
          if (exR.trackIds.indexOf(tKey) === -1) {
            exR.trackIds.push(tKey);
          }
          var tBpId = v.trackBpIds[idx];
          if (tBpId != null && exR.trackBpIds.indexOf(tBpId) === -1) {
            exR.trackBpIds.push(tBpId);
          }
        });
        exR.trackCount = exR.trackIds.length;
        // Merge genres (dedup)
        v.genres.forEach(function (gn2) {
          if (exR.genres.indexOf(gn2) === -1) exR.genres.push(gn2);
        });
        // Ricalcola bpmAverage: combina i running sums delle due mappe.
        // Inizializza _bpmSum/_bpmCount sul target se non presenti.
        if (typeof exR._bpmSum !== 'number') {
          exR._bpmSum = exR.bpmAverage || 0;
          exR._bpmCount = exR.bpmAverage != null ? 1 : 0;
        }
        if (typeof v._bpmSum === 'number' && typeof v._bpmCount === 'number') {
          // La release source ha accumulatori → combinali
          exR._bpmSum += v._bpmSum;
          exR._bpmCount += v._bpmCount;
        } else if (v.bpmAverage != null) {
          // Fallback: usa il bpmAverage già calcolato (1 sample)
          exR._bpmSum += v.bpmAverage;
          exR._bpmCount += 1;
        }
        exR.bpmAverage = exR._bpmCount > 0 ? Math.round(exR._bpmSum / exR._bpmCount) : null;
        // Merge keyDistribution
        for (var kk in v.keyDistribution) {
          exR.keyDistribution[kk] = (exR.keyDistribution[kk] || 0) + v.keyDistribution[kk];
        }
        // Aggiorna lastSeen
        if (v.lastSeen > exR.lastSeen) exR.lastSeen = v.lastSeen;
        // Aggiorna campi mancanti sul target
        if (!exR.labelId && v.labelId) exR.labelId = v.labelId;
        if (!exR.labelKey && v.labelKey) exR.labelKey = v.labelKey;
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

    if (la.length > 0) {
      sC++;
      var logosHere = la.filter(function (l) { return l.imageUrl; }).length;
      console.log(S + ' %c  OK ' + la.length + ' label (loghi: ' + logosHere + '/' + la.length + ') \u2014 ' + res.am.size + ' artisti \u2014 ' + res.tm.size + ' tracce \u2014 ' + res.rm.size + ' release \u2014 #1: ' + la[0].name, c1, cOk);
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
        // RP-BPI-002A — stable label key (alias del campo `key` popolato in lm)
        if (lb.key) lM[nm].key = lb.key;
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
  // BUILD RELEASES (RP-BPI-001 — global, deduplicated)
  // ===================================================================
  // Le release vengono estratte da globalRM. I campi privati _bpmSum e
  // _bpmCount (usati come accumulatori running) vengono rimossi prima
  // della serializzazione per non inquinare l'output JSON.
  var releasesArr = Array.from(globalRM.values()).map(function (r) {
    // Clona shallow + rimuovi campi privati
    var clean = {};
    for (var fk in r) {
      if (fk === '_bpmSum' || fk === '_bpmCount') continue;
      clean[fk] = r[fk];
    }
    return clean;
  });
  // Sort per trackCount desc (release con più tracce in cima)
  releasesArr.sort(function (a, b) {
    return b.trackCount - a.trackCount;
  });

  // ===================================================================
  // OUTPUT
  // ===================================================================
  // Conteggio loghi acquisiti (diagnostica visibile in console + nel JSON)
  var labelArr = Object.values(lM);
  var logosCount = labelArr.filter(function (l) { return l.imageUrl; }).length;

  var out = {
    genres: G.map(function (g) { return g.name; }),
    labels: labelArr,
    artists: artistsArr,
    tracks: tracksArr,
    // RP-BPI-001 — releases array prima di _meta, come richiesto.
    releases: releasesArr,
    _meta: {
      source: 'beatport',
      version: 2,
      // RP-BPI-002A — schemaVersion esplicito per future migration path.
      // 2 = modello dati normalizzato con stable ID references.
      // I campi legacy (name-based) sono ancora presenti per retrocompatibilità.
      schemaVersion: 2,
      scrapedAt: NOW,
      totalLabels: labelArr.length,
      totalLabelsWithLogo: logosCount,
      totalArtists: artistsArr.length,
      totalTracks: tracksArr.length,
      // RP-BPI-001 — conteggio release nell'output JSON.
      totalReleases: releasesArr.length,
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
  console.log(S + ' %c' + Object.keys(lM).length + ' label, ' + artistsArr.length + ' artisti, ' + tracksArr.length + ' tracce, ' + releasesArr.length + ' release da ' + sC + '/' + G.length + ' generi', c1, cOk);
  console.log(S + ' %cLoghi label acquisiti: ' + logosCount + '/' + labelArr.length + (labelArr.length > 0 ? ' (' + Math.round(logosCount * 100 / labelArr.length) + '%)' : ''), c1, cOk);
  if (fC > 0) console.log(S + ' %c ' + fC + ' generi senza dati', c1, cErr);
  console.log(S + ' %cFile JSON scaricato! Importa in LabelPulse', c1, cOk);
  console.log(S + ' %c========================================', c1, c1);
  return out;
})();
