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

  // ===================================================================
  // RP-BPI-002A — STABLE ID HELPERS (legacy, kept for backward compat output)
  //
  // Queste funzioni producono chiavi "stabili" basate su Beatport id (fallback
  // name-based). Vengono ancora usate internamente per la DEDUPLICATION durante
  // lo scraping (Map keys), ma NON sono più l'identificatore canonico.
  //
  // RP-BPI-002B — CANONICAL DATA MODEL:
  // Ogni entità ha UN SOLO identificatore interno (id canonico), generato
  // sequentialmente e INDIPENDENTE da Beatport. Tutte le relazioni utilizzano
  // esclusivamente l'id canonico. `beatportId` diventa un attributo
  // informativo della sorgente, mai usato come chiave relazionale.
  //
  //   Track    → 'trk_<n>' (es. trk_000001)
  //   Release  → 'rel_<n>' (es. rel_000001)
  //   Artist   → 'art_<n>' (es. art_000001)
  //   Label    → 'lbl_<n>' (es. lbl_000001)  — SOSTITUISCE il legacy 'lbl_<slug>'
  //
  // I campi legacy (name-based o beatportId-based) sono preservati nell'output
  // per retrocompatibilità, ma NON sono più usati internamente come chiavi
  // relazionali.
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
  // RP-BPI-002B — CANONICAL ID GENERATORS
  //
  // Generano identificativi sequenziali indipendenti da Beatport.
  // Ogni entità ha il proprio contatore. L'id canonico è l'UNICA chiave
  // usata nelle relazioni.
  // ===================================================================

  var canonicalCounters = { track: 0, release: 0, artist: 0, label: 0 };
  var PAD = 6; // zero-pad a 6 cifre (supporta fino a 999.999 entità per tipo)

  function padNum(n) {
    var s = String(n);
    while (s.length < PAD) s = '0' + s;
    return s;
  }

  function canonicalTrackId() {
    canonicalCounters.track++;
    return 'trk_' + padNum(canonicalCounters.track);
  }

  function canonicalReleaseId() {
    canonicalCounters.release++;
    return 'rel_' + padNum(canonicalCounters.release);
  }

  function canonicalArtistId() {
    canonicalCounters.artist++;
    return 'art_' + padNum(canonicalCounters.artist);
  }

  function canonicalLabelId() {
    canonicalCounters.label++;
    return 'lbl_' + padNum(canonicalCounters.label);
  }

  // ===================================================================
  // RP-BPI-004 — TRACK TREND ENGINE
  //
  // Calcola il trend di una traccia in base alla sua positionHistory.
  // Il calcolo viene fatto durante la costruzione del Canonical Graph
  // (nel builder), NON nell'Exporter.
  //
  // Regole:
  //   - Se positionHistory ha 0 o 1 entry → trend = "new"
  //   - Altrimenti, trova le ultime due entry dello STESSO genere.
  //     Se non ci sono due entry dello stesso genere → trend = "new"
  //     (la traccia è apparsa per la prima volta in quel genere).
  //   - Confronta le posizioni delle ultime due entry dello stesso genere:
  //       posizione migliorata (numero più basso) → trend = "up"
  //       posizione peggiorata (numero più alto)  → trend = "down"
  //       posizione invariata                     → trend = "stable"
  // ===================================================================
  function computeTrend(positionHistory, currentGenreName) {
    if (!Array.isArray(positionHistory) || positionHistory.length <= 1) {
      return 'new';
    }
    // Filtra le entry dello stesso genere corrente (o dell'ultima entry)
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

  // ===================================================================
  // processTracks: popola labelMap (lm), artistMap (am), trackMap (tm),
  //                releaseMap (rm) — RP-BPI-001
  // gn = genre name (string)
  //
  // RP-BPI-002A — entità popolate con riferimenti stabili basati su ID.
  // RP-BPI-002B — CANONICAL DATA MODEL: ogni entità ha UN SOLO id canonico
  //              (trk_<n>, rel_<n>, art_<n>, lbl_<n>) indipendente da Beatport.
  //              Tutte le relazioni utilizzano esclusivamente l'id canonico.
  //              `beatportId` è un attributo informativo della sorgente.
  //              I campi legacy sono preservati con marcatura _compat.
  //
  // Le Map sono keyed per Beatport-derived key (per deduplication interna
  // durante lo scraping). L'entity `id` field è l'id canonico sequenziale.
  //
  // Le relazioni DIRETTE (forward) sono popolate qui:
  //   Track.releaseId, Track.labelId, Track.artistIds[], Track.remixerIds[]
  //   Release.labelId, Release.artistIds[], Release.trackIds[]
  // Le relazioni INVERSE (backward) sono popolate in una fase successiva
  // (buildCanonicalRelationships) perché richiedono che tutte le entità
  // siano già state acquisite:
  //   Artist.labelIds[], Artist.releaseIds[], Artist.trackIds[]
  //   Label.artistIds[], Label.releaseIds[], Label.trackIds[]
  // ===================================================================
  function processTracks(tracks, gn, gid, lm, am, tm, rm) {
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

      // RP-BPI-002B — Beatport-derived key (per dedup interna, NON è l'id canonico)
      var lblBpKey = labelKey(label);

      // === KEY EXTRACTION ===
      var k = t.key || {};
      var keyCamelot = (k.camelot_number != null && k.camelot_letter) ? (k.camelot_number + k.camelot_letter) : '';
      var keyName = k.name || '';

      // === RELEASE DATE ===
      var releaseDate = t.publish_date || t.new_release_date || '';

      // === COVER ART (release image) ===
      var coverArt = (t.release && t.release.image && t.release.image.uri) || '';

      // === LABEL MAP ===
      // RP-BPI-002B — la label ha id canonico (lbl_<n>). La Map è keyed
      // per Beatport-derived key (lblBpKey) per dedup interna.
      if (!lm.has(lblBpKey)) {
        lm.set(lblBpKey, {
          // === CANONICAL ===
          id: canonicalLabelId(),
          beatportId: label.id || null,
          // === ATTRIBUTES ===
          name: labelName,
          slug: label.slug || '',
          imageUrl: (label.image && label.image.uri) || '',
          // === CANONICAL RELATIONSHIPS (popolati in buildCanonicalRelationships) ===
          artistIds: [],
          releaseIds: [],
          trackIds: [],
          // === SCRAPER-INTERNAL (per trending computation, non esportati) ===
          _trackCount: 0,
          _totalPoints: 0,
          _bestPosition: pos,
          _genres: [],
          _rankByGenre: {},
          _pointsByGenre: {},
          // === LEGACY COMPAT (preservati per backward compat, marcati _compat) ===
          _compat: {
            // Legacy `id` was 'lbl_<slug>' (name-based synthetic). Preservato per
            // consumer v1 che lo usano come chiave. L'id canonico è nel campo `id`.
            legacyId: 'lbl_' + labelName.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/_+$/, ''),
            // Beatport-derived stable key (RP-BPI-002A) — preservato per consumer 002A
            key: lblBpKey
          }
        });
      }
      var lb = lm.get(lblBpKey);
      lb._trackCount++;
      lb._totalPoints += pts;
      if (pos < lb._bestPosition) lb._bestPosition = pos;
      if (lb._genres.indexOf(gn) === -1) lb._genres.push(gn);
      // Canonical label id (alias per chiarezza nel codice seguente)
      var canonicalLabelIdForTrack = lb.id;

      // === ARTISTS (primary) ===
      var artistsRaw = Array.isArray(t.artists) ? t.artists.slice() : [];
      var remixersRaw = Array.isArray(t.remixers) ? t.remixers.slice() : [];

      function processArtist(a, isRemixer) {
        var bpKey = artistKey(a);
        if (!bpKey) return null;
        if (!am.has(bpKey)) {
          am.set(bpKey, {
            // === CANONICAL ===
            id: canonicalArtistId(),
            beatportId: a.id || null,
            // === ATTRIBUTES ===
            name: a.name,
            slug: a.slug || '',
            imageUrl: (a.image && a.image.uri) || '',
            // === CANONICAL RELATIONSHIPS ===
            // Forward (popolati qui parzialmente, completati in buildCanonicalRelationships)
            labelIds: [],
            releaseIds: [],
            trackIds: [],
            // === SCRAPER-INTERNAL (per trending computation) ===
            _genres: [],
            _tracksByGenre: {},
            _labelsPublishedOnNames: [],   // legacy name array (preservato)
            _totalPoints: 0,
            _bestPosition: pos,
            _isRemixerOnly: isRemixer,
            // === LEGACY COMPAT ===
            _compat: {
              // Beatport-derived stable key (RP-BPI-002A) — preservato
              key: bpKey
            }
          });
        }
        var ar = am.get(bpKey);
        if (ar._genres.indexOf(gn) === -1) ar._genres.push(gn);
        if (ar._labelsPublishedOnNames.indexOf(labelName) === -1) ar._labelsPublishedOnNames.push(labelName);
        // Canonical label id (per la relazione Artist → Label)
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
              labelKey: lblBpKey,                 // legacy RP-BPI-002A stable key
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
        // Ritorna l'id canonico dell'artista per uso nel Track/Release
        return ar.id;
      }

      // === Track.artistIds[] (canonical) ===
      var trackArtistCanonicalIds = [];
      artistsRaw.forEach(function (a) {
        var cId = processArtist(a, false);
        if (cId && trackArtistCanonicalIds.indexOf(cId) === -1) trackArtistCanonicalIds.push(cId);
      });
      // === Track.remixerIds[] (canonical) ===
      var trackRemixerCanonicalIds = [];
      remixersRaw.forEach(function (a) {
        var cId = processArtist(a, true);
        if (cId && trackRemixerCanonicalIds.indexOf(cId) === -1) trackRemixerCanonicalIds.push(cId);
      });

      // === RELEASE MAP (RP-BPI-001 + RP-BPI-002B canonical) ===
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
        // RP-BPI-002B — Release.artistIds[] contains ONLY primary artists
        // (not remixers). Remixers are tracked in Track.remixerIds[] and in
        // Release._compat.artistBpIds/artistNames (legacy, includes remixers).
        // This matches the legacy behavior where Label.labelsPublishedOn
        // contains only primary artists.
        var allCanonicalArtistIdsOnTrack = trackArtistCanonicalIds.slice();

        if (!rm.has(tReleaseBpKey)) {
          // === NUOVA RELEASE (canonical id) ===
          var newRel = {
            // === CANONICAL ===
            id: canonicalReleaseId(),
            beatportId: releaseId,
            // === ATTRIBUTES ===
            name: releaseName,
            slug: releaseSlug,
            url: releaseUrl,
            catalogNumber: releaseCatalog,
            releaseDate: releaseDate,
            imageUrl: releaseImage,
            // === CANONICAL RELATIONSHIPS ===
            labelId: canonicalLabelIdForTrack,         // canonical label id
            artistIds: [],                             // canonical artist ids
            trackIds: [],                              // canonical track ids
            trackCount: 0,
            // === AGGREGATES ===
            genres: [],
            bpmAverage: null,
            keyDistribution: {},
            firstSeen: NOW,
            lastSeen: NOW,
            // === SCRAPER-INTERNAL (per bpmAverage running sum) ===
            _bpmSum: 0,
            _bpmCount: 0,
            // === LEGACY COMPAT ===
            _compat: {
              // Legacy labelId (BP id, may be null) — preservato
              labelId: label.id || null,
              // Legacy labelName (NAME) — preservato
              labelName: labelName,
              // Legacy artistBpIds (BP ids parallel array) — preservato
              artistBpIds: [],
              // Legacy artistNames (NAME parallel array) — preservato
              artistNames: [],
              // Legacy trackBpIds (BP ids) — preservato
              trackBpIds: [],
              // Beatport-derived stable key (RP-BPI-002A) — preservato
              key: tReleaseBpKey
            }
          };
          // Popola artistIds (canonical, dedup, PRIMARY ONLY) + legacy artistBpIds/artistNames (ALL contributors)
          // RP-BPI-002B: Release.artistIds[] = primary artists only.
          //              Release._compat.artistBpIds/artistNames = ALL contributors (primary + remixers),
          //              for backward compat with RP-BPI-001.
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
          // Marca i primary già aggiunti
          allCanonicalArtistIdsOnTrack.forEach(function (cArtId) {
            var artistEntry = null;
            am.forEach(function (av) { if (av.id === cArtId) artistEntry = av; });
            if (artistEntry) seenLegacyKeys[artistEntry._compat.key] = true;
          });
          allArtistsRawForLegacy.forEach(function (a) {
            var bpKey = artistKey(a);
            if (bpKey && !seenLegacyKeys[bpKey]) {
              seenLegacyKeys[bpKey] = true;
              // Remixer non in artistIds (canonical), ma aggiunto ai legacy arrays
              newRel._compat.artistBpIds.push(a.id || null);
              newRel._compat.artistNames.push(a.name || '');
            }
          });
          // trackIds e trackBpIds verranno popolati dopo (quando il Track ha il suo canonical id)
          // Per ora inizializziamo bpmAverage con la traccia corrente.
          if (trackBpm != null) {
            newRel._bpmSum += trackBpm;
            newRel._bpmCount++;
            newRel.bpmAverage = Math.round(newRel._bpmSum / newRel._bpmCount);
          }
          if (keyCamelot) newRel.keyDistribution[keyCamelot] = 1;
          if (newRel.genres.indexOf(gn) === -1) newRel.genres.push(gn);
          rm.set(tReleaseBpKey, newRel);
        } else {
          // === RELEASE ESISTENTE — AGGIORNA ===
          var exRel = rm.get(tReleaseBpKey);
          // Merge artistIds (canonical, dedup, PRIMARY ONLY) + legacy artistBpIds/artistNames (ALL contributors)
          allCanonicalArtistIdsOnTrack.forEach(function (cArtId) {
            if (exRel.artistIds.indexOf(cArtId) === -1) {
              exRel.artistIds.push(cArtId);
              var artistEntry = null;
              am.forEach(function (av) { if (av.id === cArtId) artistEntry = av; });
              exRel._compat.artistBpIds.push(artistEntry ? (artistEntry.beatportId || null) : null);
              exRel._compat.artistNames.push(artistEntry ? artistEntry.name : '');
            }
          });
          // Aggiungi remixers ai soli array legacy (non a Release.artistIds canonical)
          var allArtistsRawForLegacyEx = artistsRaw.concat(remixersRaw);
          var seenLegacyKeysEx = {};
          // Marca i primary già presenti nei legacy arrays (match per name)
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
          // trackIds verrà popolato dopo (quando il Track ha il suo canonical id)
          // Merge genres (dedup)
          if (exRel.genres.indexOf(gn) === -1) exRel.genres.push(gn);
          // Ricalcola bpmAverage
          if (trackBpm != null) {
            exRel._bpmSum += trackBpm;
            exRel._bpmCount++;
            exRel.bpmAverage = Math.round(exRel._bpmSum / exRel._bpmCount);
          }
          // Aggiorna keyDistribution
          if (keyCamelot) {
            exRel.keyDistribution[keyCamelot] = (exRel.keyDistribution[keyCamelot] || 0) + 1;
          }
          exRel.lastSeen = NOW;
          // Fill campi mancanti
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
        // Track canonical release id (per il Track entity)
        tReleaseCanonicalId = rm.get(tReleaseBpKey).id;
      }

      // === TRACK MAP (canonical id) ===
      var trackBpKey = trackKeyFor(t, labelName);
      if (!tm.has(trackBpKey)) {
        var newTrack = {
          // === CANONICAL ===
          id: canonicalTrackId(),
          beatportId: t.id || null,
          // === ATTRIBUTES ===
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
          // === CANONICAL RELATIONSHIPS ===
          releaseId: tReleaseCanonicalId,             // canonical release id (may be null if release skipped)
          labelId: canonicalLabelIdForTrack,           // canonical label id
          artistIds: trackArtistCanonicalIds.slice(),  // canonical artist ids (primary)
          remixerIds: trackRemixerCanonicalIds.slice(),// canonical remixer ids
          // === AGGREGATES ===
          positions: [{ genre: gn, position: pos, points: pts, seenAt: NOW }],
          // RP-BPI-003 — Position History: array ordinato cronologicamente.
          // Ogni entry: { scrapedAt, genreId, genreName, position }
          // Dedup: una nuova entry viene aggiunta solo se differisce dall'ultima
          // (genere o posizione diversi). Conserva tutta la cronologia.
          positionHistory: [{ scrapedAt: NOW, genreId: gid, genreName: gn, position: pos }],
          // RP-BPI-004 — Track Trend: calcolato durante la costruzione del graph.
          // "new" per la prima acquisizione (1 entry in positionHistory).
          trend: 'new',
          seenAt: NOW,
          // === LEGACY COMPAT ===
          _compat: {
            // Legacy `key` (RP-BPI-002A stable key, Beatport-derived) — preservato
            key: trackBpKey,
            // Legacy `label` (NAME) — preservato
            label: labelName,
            // Legacy `labelId` (BP id, may be null) — preservato
            labelId: label.id || null,
            // Legacy `labelSlug` — preservato
            labelSlug: label.slug || '',
            // Legacy `artists` array of {id,name,slug} — preservato
            artists: artistsRaw.map(function (a) { return { id: a.id || null, name: a.name, slug: a.slug || '' }; }),
            // Legacy `remixers` array of {id,name,slug} — preservato
            remixers: remixersRaw.map(function (a) { return { id: a.id || null, name: a.name, slug: a.slug || '' }; })
          }
        };
        tm.set(trackBpKey, newTrack);
      } else {
        // Same track seen in another genre (or same genre in a later scrape) — append position entry
        var tr = tm.get(trackBpKey);
        tr.positions.push({ genre: gn, position: pos, points: pts, seenAt: NOW });
        // Fill releaseId if not set
        if (!tr.releaseId && tReleaseCanonicalId) tr.releaseId = tReleaseCanonicalId;
        // RP-BPI-003 — Position History: aggiungi una nuova entry solo se
        // differisce dall'ultima registrata (genreName o position diversi).
        // Questo evita duplicati consecutivi quando la stessa traccia appare
        // nello stesso genere alla stessa posizione in scrape successivi.
        var ph = tr.positionHistory;
        var lastEntry = ph.length > 0 ? ph[ph.length - 1] : null;
        var differs = !lastEntry || lastEntry.genreName !== gn || lastEntry.position !== pos;
        if (differs) {
          ph.push({ scrapedAt: NOW, genreId: gid, genreName: gn, position: pos });
        }
        // RP-BPI-004 — Ricalcola il trend dopo l'aggiornamento di positionHistory.
        // Il trend è basato sulle ultime due entry dello stesso genere.
        tr.trend = computeTrend(ph, gn);
      }

      // === AGGIORNA Release.trackIds[] con il canonical track id (ora disponibile) ===
      if (tReleaseBpKey) {
        var relToUpdate = rm.get(tReleaseBpKey);
        var canonicalTrackIdForThisTrack = tm.get(trackBpKey).id;
        if (relToUpdate && relToUpdate.trackIds.indexOf(canonicalTrackIdForThisTrack) === -1) {
          relToUpdate.trackIds.push(canonicalTrackIdForThisTrack);
          relToUpdate.trackCount = relToUpdate.trackIds.length;
          // Legacy trackBpIds (parallel, dedup)
          if (t.id != null && relToUpdate._compat.trackBpIds.indexOf(t.id) === -1) {
            relToUpdate._compat.trackBpIds.push(t.id);
          }
        }
      }
    }
  }

  // ===================================================================
  // RP-BPI-002B — BUILD CANONICAL RELATIONSHIPS (inverse)
  //
  // Popola gli array relazionali INVERSI che non potevano essere
  // popolati durante processTracks (perché richiedevano che tutte le
  // entità fossero già acquisite):
  //   - Artist.trackIds[] (tutte le tracce in cui l'artista compare come primary)
  //   - Artist.releaseIds[] (tutte le release in cui l'artista compare)
  //   - Label.trackIds[] (tutte le tracce sulla label)
  //   - Label.releaseIds[] (tutte le release sulla label)
  //   - Label.artistIds[] (tutti gli artisti che hanno pubblicato sulla label)
  //
  // Questa funzione opera sulle Map GLOBALI (globalTM, globalRM, globalAM,
  // globalLM) dopo il merge cross-genre.
  // ===================================================================
  function buildCanonicalRelationships() {
    var globalTM = graph.tracks;
    var globalRM = graph.releases;
    var globalAM = graph.artists;
    var globalLM = graph.labels;
    // Index artists by canonical id for fast lookup
    var artistById = new Map();
    globalAM.forEach(function (a) { artistById.set(a.id, a); });
    // Index labels by canonical id
    var labelById = new Map();
    globalLM.forEach(function (l) { labelById.set(l.id, l); });
    // Index releases by canonical id
    var releaseById = new Map();
    globalRM.forEach(function (r) { releaseById.set(r.id, r); });

    // 1) Per ogni Track: aggiorna Artist.trackIds[], Artist.releaseIds[],
    //    Label.trackIds[], Label.artistIds[]
    globalTM.forEach(function (tr) {
      // Artist ← Track (primary artists)
      tr.artistIds.forEach(function (aId) {
        var ar = artistById.get(aId);
        if (ar && ar.trackIds.indexOf(tr.id) === -1) ar.trackIds.push(tr.id);
      });
      // Note: remixers are NOT credited with the track (legacy behavior).
      // Artist ← Release (via track.releaseId, primary artists only)
      if (tr.releaseId) {
        var rel = releaseById.get(tr.releaseId);
        if (rel) {
          tr.artistIds.forEach(function (aId) {
            var ar = artistById.get(aId);
            if (ar && ar.releaseIds.indexOf(rel.id) === -1) ar.releaseIds.push(rel.id);
          });
        }
      }
      // Label ← Track
      if (tr.labelId) {
        var lb = labelById.get(tr.labelId);
        if (lb) {
          if (lb.trackIds.indexOf(tr.id) === -1) lb.trackIds.push(tr.id);
          // Label ← Artist (primary artists on this track)
          tr.artistIds.forEach(function (aId) {
            if (lb.artistIds.indexOf(aId) === -1) lb.artistIds.push(aId);
          });
        }
      }
    });

    // 2) Per ogni Release: aggiorna Label.releaseIds[], Label.artistIds[],
    //    Artist.releaseIds[] (artisti della release, primary + remixers)
    globalRM.forEach(function (r) {
      if (r.labelId) {
        var lb = labelById.get(r.labelId);
        if (lb) {
          if (lb.releaseIds.indexOf(r.id) === -1) lb.releaseIds.push(r.id);
          // Label ← Artist (tutti gli artisti della release)
          r.artistIds.forEach(function (aId) {
            if (lb.artistIds.indexOf(aId) === -1) lb.artistIds.push(aId);
          });
        }
      }
      // Artist ← Release (tutti gli artisti della release)
      r.artistIds.forEach(function (aId) {
        var ar = artistById.get(aId);
        if (ar && ar.releaseIds.indexOf(r.id) === -1) ar.releaseIds.push(r.id);
      });
    });
  }

  // ===================================================================
  // RP-BPI-002B — REMAP CANONICAL IDS (cross-genre orphan fix)
  //
  // PROBLEM: canonical ids are generated per-genre in processTracks.
  // When the same logical entity (e.g. track "lose control") appears in
  // multiple genres, each genre's processTracks call generates a NEW
  // canonical id for it (trk_000006 in Minimal, trk_000008 in Tech House).
  // During cross-genre merge, only ONE entry survives in the global Map
  // (keyed by Beatport-derived key). The other entry's canonical id
  // becomes an ORPHAN — it was already used in other entities' relation
  // fields (e.g. a Tech House release's trackIds contains trk_000008,
  // but only trk_000006 survives in globalTM).
  //
  // SOLUTION: after cross-genre merge, build a remap table from
  // (per-genre canonical id) → (global canonical id) for entities that
  // were merged. Then walk all entities and replace orphan canonical ids
  // in relation fields with the global canonical id.
  //
  // The remap is built by indexing the global Maps by Beatport-derived key
  // (the _compat.key field), and checking if any per-genre canonical id
  // (from relation fields) is missing from the global set.
  // ===================================================================
  function remapCanonicalIds() {
    var globalTM = graph.tracks;
    var globalRM = graph.releases;
    var globalAM = graph.artists;
    var globalLM = graph.labels;
    // Build sets of surviving canonical ids
    var survivingTrackIds = new Set();
    globalTM.forEach(function (t) { survivingTrackIds.add(t.id); });
    var survivingReleaseIds = new Set();
    globalRM.forEach(function (r) { survivingReleaseIds.add(r.id); });
    var survivingArtistIds = new Set();
    globalAM.forEach(function (a) { survivingArtistIds.add(a.id); });
    var survivingLabelIds = new Set();
    globalLM.forEach(function (l) { survivingLabelIds.add(l.id); });

    // Build index: Beatport-derived key → global canonical id
    // (per risolvere l'orphan → global mapping)
    var trackByKey = new Map();
    globalTM.forEach(function (t) { trackByKey.set(t._compat.key, t.id); });
    var releaseByKey = new Map();
    globalRM.forEach(function (r) { releaseByKey.set(r._compat.key, r.id); });
    var artistByKey = new Map();
    globalAM.forEach(function (a) { artistByKey.set(a._compat.key, a.id); });
    var labelByKey = new Map();
    globalLM.forEach(function (l) { labelByKey.set(l._compat.key, l.id); });

    var remapTrack = graph.remapRegistry.track;     // per-genre canonical id → global canonical id
    var remapRelease = graph.remapRegistry.release;
    var remapArtist = graph.remapRegistry.artist;
    var remapLabel = graph.remapRegistry.label;

    function remapTrackId(id) {
      if (id == null) return id;
      return remapTrack[id] || id;
    }
    function remapReleaseId(id) {
      if (id == null) return id;
      return remapRelease[id] || id;
    }
    function remapArtistId(id) {
      if (id == null) return id;
      return remapArtist[id] || id;
    }
    function remapLabelId(id) {
      if (id == null) return id;
      return remapLabel[id] || id;
    }
    function dedup(arr) {
      var seen = {};
      var out = [];
      for (var i = 0; i < arr.length; i++) {
        var k = String(arr[i]);
        if (!seen[k]) { seen[k] = true; out.push(arr[i]); }
      }
      return out;
    }

    // Remap Track relations + dedup
    globalTM.forEach(function (t) {
      t.releaseId = remapReleaseId(t.releaseId);
      t.labelId = remapLabelId(t.labelId);
      t.artistIds = dedup(t.artistIds.map(remapArtistId));
      t.remixerIds = dedup(t.remixerIds.map(remapArtistId));
    });

    // Remap Release relations + dedup + ricalcola trackCount
    globalRM.forEach(function (r) {
      r.labelId = remapLabelId(r.labelId);
      r.artistIds = dedup(r.artistIds.map(remapArtistId));
      r.trackIds = dedup(r.trackIds.map(remapTrackId));
      r.trackCount = r.trackIds.length;
    });

    // Remap Artist relations (labelIds was populated during processTracks,
    // may contain orphan label canonical ids) + dedup
    globalAM.forEach(function (a) {
      a.labelIds = dedup(a.labelIds.map(remapLabelId));
      // releaseIds and trackIds will be populated by buildCanonicalRelationships
      // AFTER remap, so they'll use the correct global ids.
    });

    // Label relations are populated by buildCanonicalRelationships after remap,
    // so no remap needed here.
  }

  // Global remap registry: populated during cross-genre merge.
  // Maps per-genre canonical id → global canonical id (for merged entities).
  var graph.remapRegistry = {
    track: {},     // { perGenreCanonicalId: globalCanonicalId }
    release: {},
    artist: {},
    label: {}
  };


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
          // RP-BPI-003 — Merge positionHistory: append per-genre entries
          // with dedup (skip if same genreName+position as last entry).
          v.positionHistory.forEach(function (phEntry) {
            var lastPh = ex.positionHistory.length > 0 ? ex.positionHistory[ex.positionHistory.length - 1] : null;
            var phDiffers = !lastPh || lastPh.genreName !== phEntry.genreName || lastPh.position !== phEntry.position;
            if (phDiffers) {
              ex.positionHistory.push(phEntry);
            }
          });
          // RP-BPI-004 — Ricalcola il trend dopo il merge di positionHistory.
          // Usa l'genreName dell'ultima entry come genere corrente.
          if (ex.positionHistory.length > 0) {
            ex.trend = computeTrend(ex.positionHistory, ex.positionHistory[ex.positionHistory.length - 1].genreName);
          }
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

  // ===================================================================
  // EXPORTER
  //
  // RP-BPI-002C — Receives a CanonicalGraph and produces the final JSON.
  // No scraping logic, no entity construction — only serialization.
  // The output is IDENTICAL to the pre-002C format (same fields, same ordering).
  // ===================================================================
  function createExporter(graph, metaInfo) {
  
  // ===================================================================
  // BUILD LABELS — canonical model + legacy compat output
  // ===================================================================
  // L'output mantiene totale backward compat con v1 + RP-BPI-001 + RP-BPI-002A:
  //   - `id` (legacy synthetic 'lbl_<slug>') → esposto come `id` (per consumer v1)
  //   - `beatportId` (BP id) → esposto
  //   - `key` (RP-BPI-002A stable key 'bp_lbl_<id>') → esposto
  //   - `genres`, `rankByGenre`, `pointsByGenre`, `trending` → esposti (legacy)
  //   - `slug`, `imageUrl` → esposti
  // AGGIUNTI (canonical, RP-BPI-002B):
  //   - `canonicalId` → l'id canonico (lbl_<n>) — nuovo campo, NON sovrascrive `id`
  //   - `artistIds`, `releaseIds`, `trackIds` → canonical relationship arrays
  //
  // NOTA: per evitare di rompere i consumer v1 che usano `id` come chiave,
  // esponiamo l'id canonico come `canonicalId` e manteniamo `id` = legacyId.
  // I nuovi consumer devono usare `canonicalId` come chiave relazionale.
  // ===================================================================
  var labelArr = Array.from(graph.labels.values()).map(function (l) {
    // Trending computation (legacy, same as v1)
    var ranks = Object.values(l._rankByGenre);
    var minR = ranks.length > 0 ? Math.min.apply(null, ranks) : 999;
    var tPts = Object.values(l._pointsByGenre).reduce(function (a, b) { return a + b; }, 0);
    var trending = false;
    var trendingRankByGenre = {};
    var trendingPointsByGenre = {};
    if (minR <= 25 || tPts > 500) {
      trending = true;
      for (var gr in l._rankByGenre) {
        if (l._rankByGenre[gr] <= 50) {
          trendingRankByGenre[gr] = l._rankByGenre[gr];
          trendingPointsByGenre[gr] = l._pointsByGenre[gr];
        }
      }
    }
    return {
      // === CANONICAL (RP-BPI-002B) ===
      canonicalId: l.id,                    // l'id canonico (lbl_<n>)
      beatportId: l.beatportId,             // attributo informativo della sorgente
      // === ATTRIBUTES ===
      name: l.name,
      slug: l.slug,
      imageUrl: l.imageUrl,
      // === CANONICAL RELATIONSHIPS ===
      artistIds: l.artistIds.slice(),
      releaseIds: l.releaseIds.slice(),
      trackIds: l.trackIds.slice(),
      // === LEGACY (preservato per backward compat) ===
      id: l._compat.legacyId,               // legacy 'lbl_<slug>' synthetic id
      key: l._compat.key,                   // RP-BPI-002A stable key 'bp_lbl_<id>'
      genres: l._genres.slice(),
      rankByGenre: Object.assign({}, l._rankByGenre),
      pointsByGenre: Object.assign({}, l._pointsByGenre),
      trending: trending,
      trendingRankByGenre: trendingRankByGenre,
      trendingPointsByGenre: trendingPointsByGenre
    };
  });

  // ===================================================================
  // BUILD ARTISTS — canonical model + legacy compat output
  // ===================================================================
  var artistsArr = Array.from(graph.artists.values()).map(function (a) {
    // Sort each genre's tracks by points desc (legacy behavior)
    var tracksByGenreOut = {};
    for (var gn5 in a._tracksByGenre) {
      tracksByGenreOut[gn5] = a._tracksByGenre[gn5].slice().sort(function (x, y) { return y.points - x.points; });
    }
    // Trending computation (legacy)
    var trending = false;
    var trendingRankByGenre = {};
    var trendingPointsByGenre = {};
    if (a._bestPosition <= 25 || a._totalPoints > 500) {
      trending = true;
      for (var gn6 in a._tracksByGenre) {
        var genrePoints = a._tracksByGenre[gn6].reduce(function (acc, t) { return acc + t.points; }, 0);
        var genreBestPos = a._tracksByGenre[gn6].reduce(function (min, t) { return t.position < min ? t.position : min; }, 999);
        if (genreBestPos <= 50) {
          trendingRankByGenre[gn6] = genreBestPos;
          trendingPointsByGenre[gn6] = genrePoints;
        }
      }
    }
    return {
      // === CANONICAL (RP-BPI-002B) ===
      canonicalId: a.id,                    // l'id canonico (art_<n>)
      beatportId: a.beatportId,             // attributo informativo della sorgente
      // === ATTRIBUTES ===
      name: a.name,
      slug: a.slug,
      imageUrl: a.imageUrl,
      // === CANONICAL RELATIONSHIPS ===
      labelIds: a.labelIds.slice(),
      releaseIds: a.releaseIds.slice(),
      trackIds: a.trackIds.slice(),
      // === AGGREGATES (legacy) ===
      totalPoints: a._totalPoints,
      bestPosition: a._bestPosition,
      isRemixerOnly: a._isRemixerOnly,
      trending: trending,
      trendingRankByGenre: trendingRankByGenre,
      trendingPointsByGenre: trendingPointsByGenre,
      // === LEGACY (preservato per backward compat) ===
      id: a._compat.key,                    // legacy RP-BPI-002A stable key 'bp_<id>'/'nm_<name>'
      key: a._compat.key,                   // alias
      genres: a._genres.slice(),
      tracksByGenre: tracksByGenreOut,
      labelsPublishedOn: a._labelsPublishedOnNames.slice()   // legacy NAME array
    };
  });
  artistsArr.sort(function (a, b) { return b.totalPoints - a.totalPoints; });

  // ===================================================================
  // BUILD TRACKS — canonical model + legacy compat output
  // ===================================================================
  // NOTA IMPORTANTE: nel legacy, `track.labelId` era il BP id della label.
  // Nel canonical, `track.labelId` è l'id canonico (lbl_<n>).
  // Per evitare conflitto di naming mantenendo backward compat:
  //   - Il campo `labelId` nell'output è l'id CANONICO (RP-BPI-002B).
  //   - Il BP id legacy è preservato in `track.beatportLabelId`.
  var tracksArr = Array.from(graph.tracks.values()).map(function (t) {
    return {
      // === CANONICAL (RP-BPI-002B) ===
      canonicalId: t.id,                    // l'id canonico (trk_<n>)
      beatportId: t.beatportId,             // attributo informativo della sorgente
      // === ATTRIBUTES ===
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
      // === CANONICAL RELATIONSHIPS ===
      releaseId: t.releaseId,               // canonical release id (rel_<n>) — may be null
      labelId: t.labelId,                   // canonical label id (lbl_<n>) — RP-BPI-002B
      artistIds: t.artistIds.slice(),       // canonical artist ids (primary, art_<n>)
      remixerIds: t.remixerIds.slice(),     // canonical remixer ids (art_<n>)
      // === AGGREGATES ===
      positions: t.positions.slice(),
      // RP-BPI-003 — Position History (cronologia ordinata delle posizioni
      // in classifica nel tempo, con dedup di entry consecutive identiche).
      positionHistory: t.positionHistory.slice(),
      // RP-BPI-004 — Track Trend: calcolato nel builder, non nell'exporter.
      trend: t.trend,
      seenAt: t.seenAt,
      // === LEGACY (preservato per backward compat) ===
      id: t.beatportId,                     // legacy: BP id (alias of beatportId, may be null)
      key: t._compat.key,                   // legacy RP-BPI-002A stable key 'bp_<id>'
      label: t._compat.label,               // legacy NAME
      // `labelId` legacy (BP id) è ora in `beatportLabelId` per evitare conflitto
      // con il `labelId` canonical (lbl_<n>).
      beatportLabelId: t._compat.labelId,   // legacy BP id della label (may be null)
      labelSlug: t._compat.labelSlug,       // legacy label slug
      artists: t._compat.artists.slice(),   // legacy array of {id,name,slug}
      remixers: t._compat.remixers.slice()  // legacy array of {id,name,slug}
    };
  });

  // ===================================================================
  // BUILD RELEASES — canonical model + legacy compat output
  // ===================================================================
  var releasesArr = Array.from(graph.releases.values()).map(function (r) {
    return {
      // === CANONICAL (RP-BPI-002B) ===
      canonicalId: r.id,                    // l'id canonico (rel_<n>)
      beatportId: r.beatportId,             // attributo informativo della sorgente
      // === ATTRIBUTES ===
      name: r.name,
      slug: r.slug,
      url: r.url,
      catalogNumber: r.catalogNumber,
      releaseDate: r.releaseDate,
      imageUrl: r.imageUrl,
      // === CANONICAL RELATIONSHIPS ===
      labelId: r.labelId,                   // canonical label id (lbl_<n>)
      artistIds: r.artistIds.slice(),       // canonical artist ids (art_<n>)
      trackIds: r.trackIds.slice(),         // canonical track ids (trk_<n>)
      trackCount: r.trackCount,
      // === AGGREGATES ===
      genres: r.genres.slice(),
      bpmAverage: r.bpmAverage,
      keyDistribution: Object.assign({}, r.keyDistribution),
      firstSeen: r.firstSeen,
      lastSeen: r.lastSeen,
      // === LEGACY (preservato per backward compat) ===
      id: r.beatportId,                     // legacy: BP id (alias of beatportId, may be null)
      key: r._compat.key,                   // legacy RP-BPI-002A stable key 'bp_rel_<id>'
      // `labelId` legacy (BP id) è ora in `beatportLabelId` per evitare conflitto.
      beatportLabelId: r._compat.labelId,   // legacy BP id della label (may be null)
      labelName: r._compat.labelName,       // legacy NAME della label
      artistBpIds: r._compat.artistBpIds.slice(),   // legacy BP ids (parallel to artistIds)
      artistNames: r._compat.artistNames.slice(),   // legacy NAME array (parallel to artistIds)
      trackBpIds: r._compat.trackBpIds.slice()      // legacy BP track ids (parallel to trackIds)
    };
  });
  // Sort per trackCount desc (release con più tracce in cima)
  releasesArr.sort(function (a, b) {
    return b.trackCount - a.trackCount;
  });

  // ===================================================================
  // OUTPUT OBJECT (assembled by Exporter from graph + metaInfo)
  // ===================================================================
  var logosCount = labelArr.filter(function (l) { return l.imageUrl; }).length;

  var out = {
    genres: metaInfo.genres.map(function (g) { return g.name; }),
    labels: labelArr,
    artists: artistsArr,
    tracks: tracksArr,
    releases: releasesArr,
    _meta: {
      source: 'beatport',
      version: 2,
      schemaVersion: 3,
      canonicalModel: 1,
      scrapedAt: metaInfo.scrapedAt,
      totalLabels: labelArr.length,
      totalLabelsWithLogo: logosCount,
      totalArtists: artistsArr.length,
      totalTracks: tracksArr.length,
      totalReleases: releasesArr.length,
      totalGenres: metaInfo.genres.length,
      successGenres: metaInfo.successGenres,
      failedGenres: metaInfo.failedGenres
    }
  };

    return { export: function () { return out; } };
  }

  // ===================================================================
  // fetchGenre: tries multiple sources, returns { lm, am, tm, rm }
  // RP-BPI-001 — rm (releaseMap) è ritornato insieme a lm/am/tm.
  // ===================================================================
  async function fetchGenre(gid, slug, gn, builder) {
    var lm = new Map(), am = new Map(), tm = new Map(), rm = new Map();
    for (var att = 1; att <= 3; att++) {
      lm = new Map(); am = new Map(); tm = new Map(); rm = new Map();
      try {
        var r = await fetch('/api/catalog/genres/' + gid + '/top-100/', { credentials: 'include' });
        if (r.ok) {
          var d = await r.json(), tr = d.results || d.tracks || d;
          if (Array.isArray(tr) && tr.length > 0) {
            console.log(S + ' %c API interna: ' + tr.length + ' tracce', c1, cOk);
            builder.processTracks(tr, gn, gid, lm, am, tm, rm);
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
            builder.processTracks(tr2, gn, gid, lm, am, tm, rm);
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
                  builder.processTracks(res, gn, gid, lm, am, tm, rm);
                  break;
                }
                var trk = q[qi].state && q[qi].state.data && q[qi].state.data.tracks;
                if (Array.isArray(trk) && trk.length > 0) {
                  console.log(S + ' %c Next.js data: ' + trk.length + ' tracce', c1, cOk);
                  builder.processTracks(trk, gn, gid, lm, am, tm, rm);
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
              builder.processTracks(htmlTracks, gn, gid, lm, am, tm, rm);
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
      console.log(S + ' %c  OK ' + la.length + ' label (loghi: ' + logosHere + '/' + la.length + ') \u2014 ' + res.am.size + ' artisti \u2014 ' + res.tm.size + ' tracce \u2014 ' + res.rm.size + ' release \u2014 #1: ' + la[0].name, c1, cOk);
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
  console.log(S + ' %c' + out._meta.totalLabels + ' label, ' + out._meta.totalArtists + ' artisti, ' + out._meta.totalTracks + ' tracce, ' + out._meta.totalReleases + ' release da ' + sC + '/' + G.length + ' generi', c1, cOk);
  console.log(S + ' %cLoghi label acquisiti: ' + out._meta.totalLabelsWithLogo + '/' + out._meta.totalLabels + (out._meta.totalLabels > 0 ? ' (' + Math.round(out._meta.totalLabelsWithLogo * 100 / out._meta.totalLabels) + '%)' : ''), c1, cOk);
  if (fC > 0) console.log(S + ' %c ' + fC + ' generi senza dati', c1, cErr);
  console.log(S + ' %cFile JSON scaricato! Importa in LabelPulse', c1, cOk);
  console.log(S + ' %c========================================', c1, c1);
  return out;
})();