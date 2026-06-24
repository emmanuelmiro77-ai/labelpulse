"use client";

import { useAppStore } from "@/lib/store";
import { t } from "@/lib/i18n";
import { useState, useRef, useMemo } from "react";
import {
  TrendingUp,
  Copy,
  Check,
  ExternalLink,
  Upload,
  ChevronDown,
  ChevronUp,
  AlertTriangle,
  Clock,
  FileJson,
  Keyboard,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";

// ==================== BEATPORT SCRAPER (current top-100, all genres) ====================
// Original minified script — scrapes Beatport's current top-100 across all genres.
const BEATPORT_SCRAPER_SCRIPT = `// ===================================================================
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
                var lIdM = lHref.match(/\\/label\\/(\\d+)/);
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
      console.log(S + ' %c  OK ' + la.length + ' label \\u2014 ' + res.am.size + ' artisti \\u2014 ' + res.tm.size + ' tracce \\u2014 #1: ' + la[0].name, c1, cOk);
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
`;


function getDaysSince(dateStr: string | null): number | null {
  if (!dateStr) return null;
  const diff = Date.now() - new Date(dateStr).getTime();
  return Math.floor(diff / (1000 * 60 * 60 * 24));
}

function formatDate(dateStr: string | null, locale: string): string {
  if (!dateStr) return "";
  try {
    return new Date(dateStr).toLocaleDateString(locale === "it" ? "it-IT" : locale === "en" ? "en-US" : locale === "es" ? "es-ES" : locale === "fr" ? "fr-FR" : locale === "de" ? "de-DE" : "pt-BR", {
      day: "numeric",
      month: "long",
      year: "numeric",
    });
  } catch {
    return dateStr.split("T")[0];
  }
}

export function RankingsWizard() {
  const { locale, rankingsUpdatedAt, importData, setRankingsUpdatedAt } = useAppStore();
  const { toast } = useToast();
  const [expanded, setExpanded] = useState(false);
  const [copied, setCopied] = useState(false);
  const [importWarning, setImportWarning] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const daysSince = getDaysSince(rankingsUpdatedAt);
  const isStale = daysSince !== null && daysSince > 30;
  const neverUpdated = daysSince === null;

  const scriptToCopy = useMemo(() => BEATPORT_SCRAPER_SCRIPT, []);

  const handleCopyScript = async () => {
    try {
      await navigator.clipboard.writeText(scriptToCopy);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      const textarea = document.createElement("textarea");
      textarea.value = scriptToCopy;
      textarea.style.position = "fixed";
      textarea.style.left = "-9999px";
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand("copy");
      document.body.removeChild(textarea);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const handleOpenSite = () => {
    window.open("https://www.beatport.com", "_blank");
  };

  const handleImportClick = () => {
    if (!importWarning) {
      setImportWarning(true);
      return;
    }
    fileInputRef.current?.click();
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const content = event.target?.result as string;

      try {
        const parsed = JSON.parse(content);
        const isRankingsFile = parsed._meta?.source === "beatport" || (parsed.genres && parsed.labels);

        if (!isRankingsFile) {
          toast({
            title: t(locale, "data.importError"),
            variant: "destructive",
          });
          return;
        }

        // Detect scraper failures (empty results, etc.)
        const totalLabels = Array.isArray(parsed.labels) ? parsed.labels.length : 0;
        const failedGenres = parsed._meta?.failedGenres ?? 0;
        const successGenres = parsed._meta?.successGenres ?? 0;

        if (totalLabels === 0 || (failedGenres > 0 && successGenres === 0)) {
          const errorMsg = locale === "it"
            ? `Scraper fallito: 0 label estratte (${failedGenres}/${parsed._meta?.totalGenres ?? 32} generi senza dati). Assicurati di essere su beatport.com con la pagina caricata, poi rilancia lo script.`
            : `Scraper failed: 0 labels extracted (${failedGenres}/${parsed._meta?.totalGenres ?? 32} genres with no data). Make sure you're on beatport.com with the page loaded, then run the script again.`;
          toast({
            title: locale === "it" ? "Importazione fallita" : "Import failed",
            description: errorMsg,
            variant: "destructive",
          });
          return;
        }

        // CRITICAL: pass artists[] and tracks[] through at the TOP LEVEL of
        // the payload (not inside `data`), because importData() in store.ts
        // reads them from `parsed.artists` / `parsed.tracks` directly.
        // Without this, scraper v2 data (3,400+ artists, 3,000 tracks) is
        // silently dropped on import and the Artisti tab stays empty.
        const importPayload = {
          app: "labelpulse",
          version: 1,
          data: {
            labels: parsed.labels || [],
            demos: [],
          },
          // Scraper v2 fields (ignored by v1 import path — backward compatible)
          artists: Array.isArray(parsed.artists) ? parsed.artists : [],
          tracks: Array.isArray(parsed.tracks) ? parsed.tracks : [],
          _meta: parsed._meta,
        };

        const success = importData(JSON.stringify(importPayload));
        if (success) {
          setRankingsUpdatedAt(new Date().toISOString());
          toast({ title: t(locale, "data.rankingsSuccess") });
          setImportWarning(false);

          // ─────────────────────────────────────────────────────────────
          // Fire-and-forget: save the Beatport snapshot to Supabase so we
          // build chart history over time (powers future "trending",
          // "new entries", "climbers/droppers", producer ranking pushes).
          // This is transparent to the admin — same flow as before. The
          // scraper's `tracks[]` shape already matches SnapshotTrackInput
          // exactly, so we forward the parsed data as-is. Failures are
          // logged but never block the import (the data is already in the
          // user's local store; the snapshot is supplementary).
          // ─────────────────────────────────────────────────────────────
          try {
            const meta = parsed._meta || {};
            const snapshotPayload = {
              snapshotDate: new Date().toISOString().split("T")[0],
              source: "admin-import",
              totalGenres: meta.totalGenres || (parsed.genres?.length ?? 0),
              totalLabels: meta.totalLabels || (parsed.labels?.length ?? 0),
              totalArtists: meta.totalArtists || (parsed.artists?.length ?? 0),
              totalTracks: meta.totalTracks || (parsed.tracks?.length ?? 0),
              incompleteGenres: [],
              notes: "Imported via rankings wizard",
              tracks: Array.isArray(parsed.tracks) ? parsed.tracks : [],
            };
            console.info(
              "%c[LabelPulse]%c Salvataggio snapshot in background…",
              "color:#8b5cf6;font-weight:bold",
              "color:#666",
              { tracks: snapshotPayload.tracks.length }
            );
            fetch("/api/snapshots/save", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(snapshotPayload),
            })
              .then((r) => (r.ok ? r.json() : Promise.reject(r)))
              .then((res) => {
                if (res?.diff) {
                  const d = res.diff;
                  console.info(
                    "%c[LabelPulse]%c Snapshot salvato ✓",
                    "color:#8b5cf6;font-weight:bold",
                    "color:#22c55e;font-weight:bold",
                    {
                      snapshotId: d.snapshotId,
                      previous: d.previousSnapshotDate,
                      newEntries: d.newEntries,
                      climbers: d.climbers,
                      droppers: d.droppers,
                      stable: d.stable,
                    }
                  );
                }
              })
              .catch((err) => {
                console.warn(
                  "%c[LabelPulse]%c Snapshot save fallito (non bloccante)",
                  "color:#8b5cf6;font-weight:bold",
                  "color:#ef4444",
                  err?.status || err
                );
              });
          } catch {
            // Non-fatal: snapshot save is best-effort
          }

          // Fire-and-forget: notify all users who opted in to 'rankings'
          // pushes. Admin's BETA_ADMIN_TOKEN is in localStorage (set from
          // /admin/feedback page). If not present, skip silently — admin
          // can still see the rankings, users just won't get a push.
          try {
            const adminToken = localStorage.getItem("beta_admin_token");
            if (adminToken) {
              const labelCount = (parsed.labels || []).length;
              const artistCount = (parsed.artists || []).length;
              const summary =
                locale === "it"
                  ? `${labelCount} label e ${artistCount} artisti aggiornati. Vai in Classifiche per vedere le novità.`
                  : `${labelCount} labels and ${artistCount} artists updated. Go to Rankings to see what's new.`;
              fetch("/api/push/rankings-updated", {
                method: "POST",
                headers: {
                  "Content-Type": "application/json",
                  Authorization: `Bearer ${adminToken}`,
                },
                body: JSON.stringify({ summary }),
              }).catch(() => {});
            }
          } catch {
            // Non-fatal: push is best-effort
          }
        } else {
          toast({
            title: t(locale, "data.importError"),
            variant: "destructive",
          });
        }
      } catch {
        toast({
          title: t(locale, "data.importError"),
          variant: "destructive",
        });
      }
    };
    reader.readAsText(file);
    e.target.value = "";
  };

  const lastUpdateText = neverUpdated
    ? t(locale, "data.rankingsNever")
    : daysSince === 0
      ? t(locale, "data.rankingsToday")
      : t(locale, "data.rankingsDaysAgo").replace("{days}", String(daysSince));

  return (
    <div className="space-y-3">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-between text-sm font-semibold group"
      >
        <div className="flex items-center gap-2">
          <TrendingUp className="h-4 w-4 text-cyan-400" />
          {t(locale, "data.rankingsTitle")}
        </div>
        <div className="flex items-center gap-2">
          <span
            className={`text-xs font-normal ${
              isStale
                ? "text-amber-400"
                : neverUpdated
                  ? "text-muted-foreground"
                  : "text-emerald-400"
            }`}
          >
            {lastUpdateText}
          </span>
          {expanded ? (
            <ChevronUp className="h-3.5 w-3.5 text-muted-foreground" />
          ) : (
            <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
          )}
        </div>
      </button>

      {isStale && !expanded && (
        <div className="flex items-center gap-2 p-2 rounded-md bg-amber-500/10 border border-amber-500/30">
          <AlertTriangle className="h-3.5 w-3.5 text-amber-400 shrink-0" />
          <p className="text-xs text-amber-400">{t(locale, "data.rankingsStale")}</p>
        </div>
      )}

      {expanded && (
        <div className="space-y-3">
          <p className="text-xs text-muted-foreground">{t(locale, "data.rankingsDesc")}</p>

          {rankingsUpdatedAt && (
            <div className="flex items-center gap-2 p-2 rounded-md bg-muted/50">
              <Clock className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
              <span className="text-xs text-muted-foreground">
                {t(locale, "data.rankingsLastUpdate")}: {formatDate(rankingsUpdatedAt, locale)}
              </span>
            </div>
          )}

          {/* Info banner: Beatport is the only source */}
          <div className="space-y-2 p-3 rounded-lg bg-muted/30 border border-border/50">
            <div className="text-xs font-medium">
              {locale === "it" ? "Sorgente classifiche" : "Rankings source"}
            </div>
            <div className="text-xs text-muted-foreground">
              {locale === "it"
                ? "Beatport — Top-100 attuale per ogni genere. Aggiornando le classifiche periodicamente si costruisce lo storico nel tempo."
                : "Beatport — current Top-100 per genre. Updating rankings periodically builds the history over time."}
            </div>
          </div>

          {/* Step 1: Copy Script */}
          <div className="space-y-2 p-3 rounded-lg bg-muted/30 border border-border/50">
            <div className="flex items-center gap-2">
              <div className="flex items-center justify-center w-5 h-5 rounded-full bg-cyan-500/20 text-cyan-400 text-xs font-bold">
                1
              </div>
              <span className="text-xs font-medium">{t(locale, "data.rankingsStep1Title")}</span>
            </div>
            <p className="text-xs text-muted-foreground pl-7">
              {t(locale, "data.rankingsStep1Desc")}
            </p>
            <div className="pl-7">
              <Button
                onClick={handleCopyScript}
                size="sm"
                variant={copied ? "outline" : "default"}
                className={`gap-1.5 text-xs ${copied ? "border-emerald-500/50 text-emerald-400" : ""}`}
              >
                {copied ? (
                  <>
                    <Check className="h-3.5 w-3.5" />
                    {t(locale, "data.rankingsCopied")}
                  </>
                ) : (
                  <>
                    <Copy className="h-3.5 w-3.5" />
                    {t(locale, "data.rankingsCopyScript")}
                  </>
                )}
              </Button>
            </div>
          </div>

          {/* Step 2: Open site + Console */}
          <div className="space-y-2 p-3 rounded-lg bg-muted/30 border border-border/50">
            <div className="flex items-center gap-2">
              <div className="flex items-center justify-center w-5 h-5 rounded-full bg-cyan-500/20 text-cyan-400 text-xs font-bold">
                2
              </div>
              <span className="text-xs font-medium">{t(locale, "data.rankingsStep2Title")}</span>
            </div>
            <p className="text-xs text-muted-foreground pl-7">
              {t(locale, "data.rankingsStep2Desc")}
            </p>
            <div className="flex items-start gap-2 pl-7">
              <AlertTriangle className="h-3.5 w-3.5 text-amber-400 shrink-0 mt-0.5" />
              <p className="text-xs text-amber-400">{t(locale, "data.rankingsStep2Warn")}</p>
            </div>
            <div className="pl-7 flex items-center gap-2">
              <Button
                onClick={handleOpenSite}
                size="sm"
                variant="outline"
                className="gap-1.5 text-xs"
              >
                <ExternalLink className="h-3.5 w-3.5" />
                {t(locale, "data.rankingsOpenBeatport")}
              </Button>
              <span className="text-xs text-muted-foreground flex items-center gap-1">
                <Keyboard className="h-3 w-3" /> F12 → Console
              </span>
            </div>
          </div>

          {/* Step 3: Wait for Download */}
          <div className="space-y-2 p-3 rounded-lg bg-muted/30 border border-border/50">
            <div className="flex items-center gap-2">
              <div className="flex items-center justify-center w-5 h-5 rounded-full bg-cyan-500/20 text-cyan-400 text-xs font-bold">
                3
              </div>
              <span className="text-xs font-medium">{t(locale, "data.rankingsStep3Title")}</span>
            </div>
            <p className="text-xs text-muted-foreground pl-7">
              {t(locale, "data.rankingsStep3Desc")}
            </p>
          </div>

          {/* Step 4: Import File */}
          <div className="space-y-2 p-3 rounded-lg bg-muted/30 border border-border/50">
            <div className="flex items-center gap-2">
              <div className="flex items-center justify-center w-5 h-5 rounded-full bg-cyan-500/20 text-cyan-400 text-xs font-bold">
                4
              </div>
              <span className="text-xs font-medium">{t(locale, "data.rankingsStep4Title")}</span>
            </div>
            <p className="text-xs text-muted-foreground pl-7">
              {t(locale, "data.rankingsStep4Desc")}
            </p>
            {importWarning && (
              <div className="flex items-start gap-2 pl-7">
                <AlertTriangle className="h-3.5 w-3.5 text-amber-400 shrink-0 mt-0.5" />
                <p className="text-xs text-amber-400">
                  {locale === "it"
                    ? "Le classifiche verranno aggiornate. I tuoi dati personali (email, note, link) sono al sicuro e non verranno sovrascritti."
                    : "Rankings will be updated. Your personal data (emails, notes, links) is safe and won't be overwritten."}
                </p>
              </div>
            )}
            <div className="pl-7">
              <Button
                onClick={handleImportClick}
                size="sm"
                variant={importWarning ? "default" : "outline"}
                className={`gap-1.5 text-xs ${importWarning ? "bg-cyan-600 hover:bg-cyan-500" : ""}`}
              >
                <FileJson className="h-3.5 w-3.5" />
                {importWarning
                  ? t(locale, "data.rankingsImportFile") + " ✓"
                  : t(locale, "data.rankingsImportFile")}
              </Button>
              <input
                ref={fileInputRef}
                type="file"
                accept=".json"
                onChange={handleFileChange}
                className="hidden"
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
