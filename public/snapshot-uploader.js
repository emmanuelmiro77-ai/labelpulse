// =====================================================================
// LabelPulse — Snapshot uploader
// =====================================================================
// INCOLLA QUESTO SNIPPET NELLA CONSOLE DEL BROWSER DOPO che lo scraper
// v2 ha finito (deve aver scaricato il file JSON e stampato "COMPLETATO!").
//
// Lo snippet legge l'oggetto restituito dallo scraper e lo invia a
// /api/snapshots/save che salva il snapshot in Supabase + calcola il
// diff rispetto al snapshot precedente.
//
// OUTPUT atteso in console:
//   [LabelPulse] 📊 Snapshot salvato! ID: 42
//   [LabelPulse] 📈 Diff vs 2026-06-17:
//     • 145 new entries
//     • 38 climbers (12 fast, +15 o più posizioni)
//     • 22 droppers (5 fast, -15 o più posizioni)
//     • 2.195 stabili
//   [LabelPulse] 🔝 Top 3 climbers:
//     1. "Track Name" in Tech House: +47 posizioni (ora #5)
//     2. "Track Name" in Deep House: +32 posizioni (ora #12)
//     3. "Track Name" in House: +28 posizioni (ora #15)
// =====================================================================
(async function () {
  'use strict';

  var S = '%c[LabelPulse]';
  var c1 = 'color:#8b5cf6;font-weight:bold';
  var cOk = 'color:#22c55e;font-weight:bold';
  var cWarn = 'color:#f59e0b;font-weight:bold';
  var cErr = 'color:#ef4444;font-weight:bold';

  // Lo scraper v2 ritorna l'oggetto `out` come risultato della IIFE.
  // Se lo snippet viene eseguito subito dopo, l'oggetto è disponibile
  // come risultato dell'espressione precedente nella console.
  // In alternativa, lo snippet cerca l'oggetto in window.__labelPulseLastScrape
  // (che lo scraper potrebbe aver impostato) o chiede all'utente di incollarlo.

  var out = null;

  // Strategia 1: l'utente ha eseguito lo scraper con `var result = (async function(){...})();`
  // In questo caso `result` è disponibile come Promise risolta.
  // Strategia 2: l'utente ha eseguito lo scraper direttamente (IIFE) — il risultato
  // è disponibile come `__lastExpression` in alcune console ma non in tutte.
  // Strategia 3: l'utente ha esposto `window.__labelPulseLastScrape`.

  if (typeof window !== 'undefined' && window.__labelPulseLastScrape) {
    out = window.__labelPulseLastScrape;
    console.log(S + ' %cTrovato snapshot in window.__labelPulseLastScrape', c1, c2);
  }

  // Se non trovato, chiediamo all'utente di incollare l'oggetto JSON
  if (!out) {
    console.log(S + ' %c⚠️  Snapshot non trovato in automatico.', c1, cWarn);
    console.log(S + ' %cPer salvarlo in Supabase, due opzioni:', c1, c2);
    console.log(S + ' %c  Opzione A: esegui prima lo scraper così:', c1, c2);
    console.log(S + ' %c    window.__labelPulseLastScrape = await (async function(){ /* codice scraper */ })();', c1, c2);
    console.log(S + ' %c  Opzione B: apri il file JSON scaricato, copia il contenuto, e fai:', c1, c2);
    console.log(S + ' %c    var json = prompt("Incolla il JSON dello snapshot:");', c1, c2);
    console.log(S + ' %c    window.__labelPulseLastScrape = JSON.parse(json);', c1, c2);
    console.log(S + ' %cPoi ri-esegui questo snippet.', c1, c2);
    return;
  }

  // Verifica struttura minima
  if (!out.labels || !out.artists || !out.tracks || !out._meta) {
    console.log(S + ' %c❌ Struttura snapshot non valida. Atteso: { labels, artists, tracks, _meta }', c1, cErr);
    return;
  }

  console.log(S + ' %c========================================', c1, c1);
  console.log(S + ' %cINVIO SNAPSHOT A SUPABASE', c1, cOk);
  console.log(S + ' %c========================================', c1, c1);
  console.log(S + ' %cTracce totali: ' + out.tracks.length, c1, c2);
  console.log(S + ' %cGeneri: ' + out._meta.totalGenres + ' (' + out._meta.successGenres + ' ok, ' + out._meta.failedGenres + ' falliti)', c1, c2);

  // Verifica che siamo su LabelPulse (non su beatport.com)
  var origin = window.location.origin;
  if (origin.indexOf('vercel.app') === -1 && origin.indexOf('localhost') === -1 && origin.indexOf('labelpulse') === -1) {
    console.log(S + ' %c⚠️  ATTENZIONE: stai eseguendo lo snippet su ' + origin, c1, cWarn);
    console.log(S + ' %cLo snippet deve essere eseguito su LabelPulse (vercel.app o localhost).', c1, cWarn);
    console.log(S + ' %cApri LabelPulse in un altra tab, fai login, e incolla lo snippet lì.', c1, c2);
    return;
  }

  // Costruisci il payload per /api/snapshots/save
  // L'endpoint si aspetta: { snapshotDate, source, totalGenres, totalLabels, totalArtists, totalTracks, incompleteGenres, tracks[] }
  // Dove tracks[] ha shape: { id, key, name, mixName, artists[], label, labelId, primaryGenre, bpm, keyCamelot, releaseDate, coverArt, sampleUrl, positions[] }

  // Identifica generi incompleti (< 50 tracce) — se lo scraper non traccia questo,
  // calcoliamolo dal tracks array
  var tracksPerGenre = {};
  out.tracks.forEach(function (t) {
    if (t.positions && Array.isArray(t.positions)) {
      t.positions.forEach(function (p) {
        tracksPerGenre[p.genre] = (tracksPerGenre[p.genre] || 0) + 1;
      });
    }
  });
  var incompleteGenres = Object.keys(tracksPerGenre).filter(function (g) {
    return tracksPerGenre[g] < 50;
  });

  var payload = {
    snapshotDate: new Date().toISOString().split('T')[0],
    source: 'browser-scrape',
    totalGenres: out._meta.totalGenres,
    totalLabels: out._meta.totalLabels,
    totalArtists: out._meta.totalArtists,
    totalTracks: out._meta.totalTracks,
    incompleteGenres: incompleteGenres,
    notes: 'Scraped from browser console. ' + out._meta.successGenres + '/' + out._meta.totalGenres + ' genres succeeded.',
    tracks: out.tracks
  };

  console.log(S + ' %cInvio payload (' + JSON.stringify(payload).length + ' bytes)...', c1, c2);

  try {
    var res = await fetch('/api/snapshots/save', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    var data = await res.json();

    if (!res.ok) {
      console.log(S + ' %c❌ Errore HTTP ' + res.status + ': ' + (data.error || data.message || 'unknown'), c1, cErr);
      console.log(S + ' %cResponse completa:', c1, c2);
      console.log(data);
      return;
    }

    var diff = data.diff;
    console.log(S + ' %c========================================', c1, c1);
    console.log(S + ' %c✅ SNAPSHOT SALVATO! ID: ' + diff.snapshotId, c1, cOk);

    if (diff.previousSnapshotDate) {
      console.log(S + ' %c📊 Diff vs snapshot del ' + diff.previousSnapshotDate + ':', c1, cOk);
    } else {
      console.log(S + ' %c📊 Primo snapshot mai salvato — nessun diff disponibile', c1, cWarn);
    }

    console.log(S + ' %c  • ' + diff.newEntries + ' new entries', c1, c2);
    console.log(S + ' %c  • ' + diff.climbers + ' climbers (' + diff.fastClimbers + ' fast, +15 o più)', c1, c2);
    console.log(S + ' %c  • ' + diff.droppers + ' droppers (' + diff.fastDroppers + ' fast, -15 o più)', c1, c2);
    console.log(S + ' %c  • ' + diff.stable + ' stabili', c1, c2);
    console.log(S + ' %c  • Totale tracce: ' + diff.totalTracks, c1, c2);

    if (diff.topClimbers && diff.topClimbers.length > 0) {
      console.log(S + ' %c🔝 Top 3 climbers:', c1, cOk);
      diff.topClimbers.slice(0, 3).forEach(function (c, i) {
        console.log(S + ' %c  ' + (i + 1) + '. "' + c.name + '" in ' + c.genre + ': +' + c.change + ' posizioni (ora #' + c.position + ')', c1, c2);
      });
    }

    if (diff.topDroppers && diff.topDroppers.length > 0) {
      console.log(S + ' %c🔻 Top 3 droppers:', c1, cWarn);
      diff.topDroppers.slice(0, 3).forEach(function (c, i) {
        console.log(S + ' %c  ' + (i + 1) + '. "' + c.name + '" in ' + c.genre + ': ' + c.change + ' posizioni (ora #' + c.position + ')', c1, c2);
      });
    }

    if (diff.topNewEntries && diff.topNewEntries.length > 0) {
      console.log(S + ' %c🆕 Top 3 new entries:', c1, cOk);
      diff.topNewEntries.slice(0, 3).forEach(function (c, i) {
        console.log(S + ' %c  ' + (i + 1) + '. "' + c.name + '" in ' + c.genre + ': debutta al #' + c.position, c1, c2);
      });
    }

    console.log(S + ' %c========================================', c1, c1);
    console.log(S + ' %c✅ Fatto! Il snapshot è ora in Supabase.', c1, cOk);
    console.log(S + ' %cProssimo step: configurare il cron job per le notifiche.', c1, c2);

  } catch (err) {
    console.log(S + ' %c❌ Errore di rete:', c1, cErr);
    console.log(err);
  }
})();
