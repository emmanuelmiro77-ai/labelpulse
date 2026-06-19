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
const BEATPORT_SCRAPER_SCRIPT = `(async function(){'use strict';var D=800,G=[{id:81,slug:'140-deep-dubstep-grime',name:'140 / Deep Dubstep / Grime'},{id:89,slug:'afro-house',name:'Afro House'},{id:99,slug:'amapiano',name:'Amapiano'},{id:85,slug:'ambient-experimental',name:'Ambient / Experimental'},{id:87,slug:'bass-club',name:'Bass / Club'},{id:91,slug:'bass-house',name:'Bass House'},{id:101,slug:'brazilian-funk',name:'Brazilian Funk'},{id:9,slug:'breaks-breakbeat-uk-bass',name:'Breaks / Breakbeat / Uk Bass'},{id:39,slug:'dance-pop',name:'Dance / Pop'},{id:12,slug:'deep-house',name:'Deep House'},{id:82,slug:'downtempo',name:'Downtempo'},{id:1,slug:'drum-and-bass',name:'Drum & Bass'},{id:18,slug:'dubstep',name:'Dubstep'},{id:84,slug:'electro-classic-detroit-modern',name:'Electro Classic / Detroit / Modern'},{id:3,slug:'electronica',name:'Electronica'},{id:97,slug:'funky-house',name:'Funky House'},{id:8,slug:'hard-dance-hardcore-neo-rave',name:'Hard Dance / Hardcore / Neo Rave'},{id:98,slug:'hard-techno',name:'Hard Techno'},{id:5,slug:'house',name:'House'},{id:37,slug:'indie-dance',name:'Indie Dance'},{id:96,slug:'jackin-house',name:'Jackin House'},{id:100,slug:'mainstage',name:'Mainstage'},{id:90,slug:'melodic-house-techno',name:'Melodic House & Techno'},{id:14,slug:'minimal-deep-tech',name:'Minimal / Deep Tech'},{id:50,slug:'nu-disco-disco',name:'Nu Disco / Disco'},{id:88,slug:'organic-house',name:'Organic House'},{id:15,slug:'progressive-house',name:'Progressive House'},{id:13,slug:'psy-trance',name:'Psy-Trance'},{id:11,slug:'tech-house',name:'Tech House'},{id:6,slug:'techno-peak-time-driving',name:'Techno Peak Time / Driving'},{id:92,slug:'techno-raw-deep-hypnotic',name:'Techno Raw / Deep / Hypnotic'},{id:7,slug:'trance-main-floor',name:'Trance Main Floor'},{id:38,slug:'trap-future-bass',name:'Trap / Future Bass'},{id:86,slug:'uk-garage-bassline',name:'Uk Garage / Bassline'}];var S='%c[LabelPulse]',c1='color:#8b5cf6;font-weight:bold',c2='color:#666',cOk='color:#22c55e;font-weight:bold',cErr='color:#ef4444';console.log(S+' %cBeatport Scraper avviato',c1,c2);console.log(S+' %cGeneri: '+G.length,c1,c2);var sleep=function(ms){return new Promise(function(r){setTimeout(r,ms)})};function processTracks(tracks,lm){for(var i=0;i<tracks.length;i++){var t=tracks[i],label=null;if(t.release&&t.release.label)label=t.release.label;else if(t.label)label=t.label;else if(t.release&&t.release.release&&t.release.release.label)label=t.release.release.label;if(!label||!label.name)continue;var n=label.name.toUpperCase().trim(),pos=t._position||(i+1),pts=Math.max(0,101-pos);if(!lm.has(n)){lm.set(n,{id:label.id||null,name:n,slug:label.slug||'',trackCount:0,totalPoints:0,bestPosition:pos})}var e=lm.get(n);e.trackCount++;e.totalPoints+=pts;if(pos<e.bestPosition)e.bestPosition=pos}}async function fetchGenre(gid,slug){var lm=new Map();try{var r=await fetch('/api/catalog/genres/'+gid+'/top-100/',{credentials:'include'});if(r.ok){var d=await r.json(),tr=d.results||d.tracks||d;if(Array.isArray(tr)&&tr.length>0){console.log(S+' %c API interna: '+tr.length+' tracce',c1,cOk);processTracks(tr,lm);return lm}}}catch(e){}try{var r2=await fetch('https://api.beatport.com/v4/catalog/genres/'+gid+'/top-10-tracks/?per_page=100',{credentials:'include'});if(r2.ok){var d2=await r2.json(),tr2=d2.results||d2;if(Array.isArray(tr2)&&tr2.length>0){console.log(S+' %c API v4: '+tr2.length+' tracce',c1,cOk);processTracks(tr2,lm);return lm}}}catch(e){}try{var r3=await fetch('https://www.beatport.com/genre/'+slug+'/'+gid+'/top-100',{credentials:'include'});if(r3.ok){var html=await r3.text(),p=new DOMParser(),doc=p.parseFromString(html,'text/html'),nd=doc.getElementById('__NEXT_DATA__');if(nd){var nData=JSON.parse(nd.textContent),q=nData&&nData.props&&nData.props.pageProps&&nData.props.pageProps.dehydratedState&&nData.props.pageProps.dehydratedState.queries;if(q){for(var qi=0;qi<q.length;qi++){var res=q[qi].state&&q[qi].state.data&&q[qi].state.data.results;if(Array.isArray(res)&&res.length>0){console.log(S+' %c Next.js data: '+res.length+' tracce',c1,cOk);processTracks(res,lm);return lm}var trk=q[qi].state&&q[qi].state.data&&q[qi].state.data.tracks;if(Array.isArray(trk)&&trk.length>0){console.log(S+' %c Next.js data: '+trk.length+' tracce',c1,cOk);processTracks(trk,lm);return lm}}}}var tEls=doc.querySelectorAll('[data-testid="track-row"],.track-grid-content,.bucket-item');var htmlTracks=[];tEls.forEach(function(el,idx){try{var lEl=el.querySelector('[data-testid="label-name"],.buk-track-labels a,.track-label a');var lName=lEl?lEl.textContent.trim():null;var lHref=lEl?lEl.getAttribute('href'):'';var lIdM=lHref.match(/\\/label\\/(\\d+)/);if(lName){htmlTracks.push({release:{label:{id:lIdM?parseInt(lIdM[1]):null,name:lName,slug:lHref.split('/').pop()||''}},_position:idx+1})}}catch(e){}});if(htmlTracks.length>0){console.log(S+' %c HTML parsing: '+htmlTracks.length+' tracce',c1,cOk);processTracks(htmlTracks,lm);return lm}}}catch(e){console.log(S+' %c Errore: '+e.message,c1,cErr)}if(lm.size===0)console.log(S+' %c Nessun dato',c1,cErr);return lm}console.log(S+' %c========================================',c1,c1);console.log(S+' %cINIZIO ESTRAZIONE',c1,cOk);console.log(S+' %c========================================',c1,c1);var gR={},tL=0,sC=0,fC=0;for(var gi=0;gi<G.length;gi++){var g=G[gi],pct=Math.round(((gi+1)/G.length)*100);console.log(S+' %c['+pct+'%] '+g.name+'...',c1,c2);var lm=await fetchGenre(g.id,g.slug),la=Array.from(lm.values());la.sort(function(a,b){return b.totalPoints-a.totalPoints});la.forEach(function(l,i){l.rank=i+1});gR[g.name]=la;tL+=la.length;if(la.length>0){sC++;console.log(S+' %c  OK '+la.length+' label \\u2014 #1: '+la[0].name,c1,cOk)}else{fC++}await sleep(D)}console.log(S+' %cCostruzione JSON...',c1,c2);var lM={};for(var gn in gR){for(var li=0;li<gR[gn].length;li++){var lb=gR[gn][li],nm=lb.name.toUpperCase().trim();if(!nm)continue;if(!lM[nm]){lM[nm]={id:'lbl_'+nm.toLowerCase().replace(/[^a-z0-9]+/g,'_').replace(/_+$/,''),name:nm,genres:[],rankByGenre:{},pointsByGenre:{},trending:false};if(lb.id)lM[nm].beatportId=lb.id}if(lM[nm].genres.indexOf(gn)===-1)lM[nm].genres.push(gn);lM[nm].rankByGenre[gn]=lb.rank;lM[nm].pointsByGenre[gn]=lb.totalPoints}}for(var k in lM){var l=lM[k],ranks=Object.values(l.rankByGenre),minR=Math.min.apply(null,ranks),tPts=Object.values(l.pointsByGenre).reduce(function(a,b){return a+b},0);if(minR<=25||tPts>500){l.trending=true;l.trendingRankByGenre={};l.trendingPointsByGenre={};for(var gr in l.rankByGenre){if(l.rankByGenre[gr]<=50){l.trendingRankByGenre[gr]=l.rankByGenre[gr];l.trendingPointsByGenre[gr]=l.pointsByGenre[gr]}}}}var out={genres:G.map(function(g){return g.name}),labels:Object.values(lM),_meta:{source:'beatport',scrapedAt:new Date().toISOString(),totalLabels:Object.keys(lM).length,totalGenres:G.length,successGenres:sC,failedGenres:fC}};var js=JSON.stringify(out,null,2),bl=new Blob([js],{type:'application/json'}),u=URL.createObjectURL(bl),a=document.createElement('a');a.href=u;a.download='labelpulse_beatport_'+new Date().toISOString().split('T')[0]+'.json';document.body.appendChild(a);a.click();document.body.removeChild(a);URL.revokeObjectURL(u);console.log(S+' %c========================================',c1,c1);console.log(S+' %cCOMPLETATO!',c1,cOk);console.log(S+' %c'+Object.keys(lM).length+' label da '+sC+'/'+G.length+' generi',c1,cOk);if(fC>0)console.log(S+' %c '+fC+' generi senza dati',c1,cErr);console.log(S+' %cFile JSON scaricato! Importa in LabelPulse',c1,cOk);console.log(S+' %c========================================',c1,c1);return out})();`;

// ==================== BEATSTATS SCRAPER ====================
// Generates a scraper script for Beatstats. Supports current period + historical
// (yearly / monthly) archives. Same output format as Beatport scraper so the
// existing import flow works unchanged.
//
// Strategy: on each /genre/{slug}[/year][/month] page, find all <a href*="/label/">
// links. Each label name links to its Beatstats label page, so this pattern is
// stable across CSS refactors. Walk up to the row container, extract rank and
// points from sibling cells.
//
// The script is generated dynamically so we can inject the chosen period.
function buildBeatstatsScript(period: "current" | string, month: string | null): string {
  // Build the path suffix: "" for current, "/2024" for yearly, "/2024/6" for monthly
  let pathSuffix = "";
  let periodLabel = "current";
  if (period !== "current") {
    pathSuffix = `/${period}`;
    periodLabel = period;
    if (month && month !== "all") {
      pathSuffix += `/${month}`;
      periodLabel = `${period}-${month}`;
    }
  }

  // Beatstats genre list. Hardcoded because the homepage navigation is JS-rendered
  // and not always discoverable via simple fetch. If Beatstats adds/removes genres,
  // this list needs updating — but it's been stable for years.
  const genresJson = JSON.stringify([
    { slug: "house", name: "House" },
    { slug: "tech-house", name: "Tech House" },
    { slug: "techno", name: "Techno" },
    { slug: "deep-house", name: "Deep House" },
    { slug: "progressive-house", name: "Progressive House" },
    { slug: "electro-house", name: "Electro House" },
    { slug: "minimal", name: "Minimal" },
    { slug: "trance", name: "Trance" },
    { slug: "hard-dance", name: "Hard Dance" },
    { slug: "drum-and-bass", name: "Drum & Bass" },
    { slug: "dubstep", name: "Dubstep" },
    { slug: "breaks", name: "Breaks" },
    { slug: "hip-hop", name: "Hip Hop" },
    { slug: "r-and-b", name: "R & B" },
    { slug: "reggae-dancehall", name: "Reggae / Dancehall" },
    { slug: "latin", name: "Latin" },
    { slug: "acoustic", name: "Acoustic" },
    { slug: "classical", name: "Classical" },
    { slug: "jazz", name: "Jazz" },
    { slug: "soul-funk", name: "Soul / Funk" },
    { slug: "nu-disco-disco", name: "Nu Disco / Disco" },
    { slug: "indie-dance", name: "Indie Dance" },
    { slug: "funky-house", name: "Funky House" },
    { slug: "bass-club", name: "Bass / Club" },
    { slug: "jackin-house", name: "Jackin House" },
    { slug: "afro-house", name: "Afro House" },
    { slug: "organic-house", name: "Organic House" },
    { slug: "melodic-house-techno", name: "Melodic House & Techno" },
    { slug: "psy-trance", name: "Psy-Trance" },
    { slug: "uk-garage-bassline", name: "UK Garage / Bassline" },
    { slug: "trap-future-bass", name: "Trap / Future Bass" },
    { slug: "ambient-experimental", name: "Ambient / Experimental" },
  ]);

  return `(async function(){'use strict';
var PERIOD_SUFFIX = ${JSON.stringify(pathSuffix)};
var PERIOD_LABEL  = ${JSON.stringify(periodLabel)};
var GENRES = ${genresJson};
var DELAY_MS = 600;
var S='%c[LabelPulse]',c1='color:#8b5cf6;font-weight:bold',c2='color:#666',cOk='color:#22c55e;font-weight:bold',cErr='color:#ef4444';
console.log(S+' %cBeatstats Scraper avviato',c1,c2);
console.log(S+' %cPeriodo: '+PERIOD_LABEL,c1,c2);
console.log(S+' %cGeneri: '+GENRES.length,c1,c2);
var sleep=function(ms){return new Promise(function(r){setTimeout(r,ms)})};

// Extract numeric values from a cell's text. Returns {num, isPoints}.
function parseCell(text){
  if(!text) return null;
  var clean=text.replace(/[\\s,]/g,'').replace(/\\u2191|\\u2193|\\u2013|-|\\+|\\*/g,'').trim();
  if(!clean) return null;
  var m=clean.match(/^(-?\\d+)$/);
  if(!m) return null;
  var n=parseInt(m[1],10);
  if(isNaN(n)) return null;
  return {num:n};
}

// Scrape a single genre page. Returns array of {name, rank, points, tracks}.
// Tries multiple URL patterns because Beatstats has changed their URL structure
// over time (older docs use /label-ranking/{slug}, newer ones /genre/{slug}).
// All URLs are ABSOLUTE so the script works from any beatstats.com page.
async function scrapeGenre(slug, name){
  // Try patterns in order. /genre/{slug} is the current Beatstats pattern,
  // /label-ranking/{slug} is the legacy one. We try both because we can't
  // detect from outside which one is live.
  var urlPatterns = [
    'https://www.beatstats.com/genre/'+slug+PERIOD_SUFFIX,
    'https://www.beatstats.com/label-ranking/'+slug+PERIOD_SUFFIX,
    'https://beatstats.com/genre/'+slug+PERIOD_SUFFIX,
    'https://beatstats.com/label-ranking/'+slug+PERIOD_SUFFIX
  ];

  for(var pi=0; pi<urlPatterns.length; pi++){
    var url=urlPatterns[pi];
    console.log(S+' %c  ['+(pi+1)+'/'+urlPatterns.length+'] GET '+url,c1,c2);
    try{
      var res=await fetch(url,{credentials:'include',headers:{'Accept':'text/html'}});
      if(!res.ok){
        console.log(S+' %c  HTTP '+res.status+', provo prossimo pattern',c1,cErr);
        continue;
      }
      var html=await res.text();

      // Cloudflare challenge page detection — beatstats is behind CF.
      // If we get the "Just a moment..." challenge, fetch will return HTML
      // but it won't contain any label data. Skip and try next pattern.
      if(html.indexOf('Just a moment...')!==-1 || html.indexOf('__cf_chl_opt')!==-1){
        console.log(S+' %c  Cloudflare challenge rilevato, provo prossimo',c1,cErr);
        continue;
      }

      var doc=new DOMParser().parseFromString(html,'text/html');

      // Strategy: find every <a href*="/label/"> link.
      // Each label name on Beatstats links to /label/{slug}/{id}.
      var labelLinks=doc.querySelectorAll('a[href*="/label/"]');
      if(labelLinks.length===0){
        // Try alternative patterns
        labelLinks=doc.querySelectorAll('a[href*="/label."]');
      }
      if(labelLinks.length===0){
        console.log(S+' %c  Nessun link label per '+name+' con pattern '+(pi+1)+', provo prossimo',c1,cErr);
        continue;
      }

      var out=[];
      var seen=new Set();
      for(var i=0;i<labelLinks.length;i++){
        var link=labelLinks[i];
        var labelName=(link.textContent||'').trim();
        if(!labelName||labelName.length<2) continue;
        var key=labelName.toUpperCase().trim();
        // Dedupe within same page (label name may appear in nav + ranking)
        if(seen.has(key)) continue;

        // Walk up to find the row container (tr, li, .row, .item...)
        var row=link.closest('tr, li, [class*="row"], [class*="item"], [class*="label"]');
        if(!row) continue;

        // Skip if the row is in a sidebar/footer/header (heuristic: very short text content)
        var rowText=(row.textContent||'').trim();
        if(rowText.length<5) continue;

        // Collect all numeric cells in the row
        var cells=row.querySelectorAll('td, th, .cell, [class*="col"], span');
        var nums=[];
        for(var j=0;j<cells.length;j++){
          var p=parseCell(cells[j].textContent||'');
          if(p) nums.push(p.num);
        }

        // Heuristic: the FIRST positive small number (1-200) is the rank,
        // the LARGEST number is points, the second-largest is tracks.
        var rank=0, points=0, tracks=0;
        var positiveNums=nums.filter(function(n){return n>0;});
        if(positiveNums.length>0){
          rank=positiveNums[0];
          if(positiveNums.length>1){
            // max = points
            points=Math.max.apply(null,positiveNums.slice(1));
            // second max = tracks (only if there are 3+ numbers)
            if(positiveNums.length>2){
              var sorted=positiveNums.slice(1).sort(function(a,b){return b-a;});
              tracks=sorted[1]||0;
            }
          }
        }
        // Fallback rank: use position in labelLinks (1-based)
        if(!rank) rank=out.length+1;
        // Sanity: rank should be 1..500 ish
        if(rank>1000) rank=out.length+1;

        seen.add(key);
        out.push({name:key,rank:rank,points:Math.max(0,points),tracks:tracks});
      }

      if(out.length===0){
        console.log(S+' %c  0 label estratte da pattern '+(pi+1)+', provo prossimo',c1,cErr);
        continue;
      }

      // Sort by points desc (Beatstats ranking is by points), then assign final rank
      out.sort(function(a,b){
        if(b.points!==a.points) return b.points-a.points;
        return a.rank-b.rank;
      });
      out.forEach(function(l,i){l.rank=i+1;});

      console.log(S+' %c  OK '+out.length+' label \\u2014 #1: '+(out[0]?out[0].name:'-')+' ('+(out[0]?out[0].points:0)+' pts) [pattern '+(pi+1)+']',c1,cOk);
      return out;
    }catch(e){
      console.log(S+' %c  Errore '+name+' pattern '+(pi+1)+': '+e.message,c1,cErr);
      continue;
    }
  }

  console.log(S+' %c  TUTTI i pattern falliti per '+name,c1,cErr);
  return [];
}

console.log(S+' %c========================================',c1,c1);
console.log(S+' %cINIZIO ESTRAZIONE BEATSTATS',c1,cOk);
console.log(S+' %cPeriodo: '+PERIOD_LABEL+' \\u2014 Generi: '+GENRES.length,c1,c2);
console.log(S+' %c========================================',c1,c1);

var gR={},tL=0,sC=0,fC=0;
for(var gi=0;gi<GENRES.length;gi++){
  var g=GENRES[gi];
  var pct=Math.round(((gi+1)/GENRES.length)*100);
  console.log(S+' %c['+pct+'%] '+g.name+'...',c1,c2);
  var arr=await scrapeGenre(g.slug,g.name);
  gR[g.name]=arr;
  tL+=arr.length;
  if(arr.length>0) sC++; else fC++;
  await sleep(DELAY_MS);
}

console.log(S+' %cCostruzione JSON...',c1,c2);

// Build labels map (same format as Beatport scraper)
var lM={};
for(var gn in gR){
  for(var li=0;li<gR[gn].length;li++){
    var lb=gR[gn][li];
    var nm=lb.name.toUpperCase().trim();
    if(!nm) continue;
    if(!lM[nm]){
      lM[nm]={
        id:'lbl_'+nm.toLowerCase().replace(/[^a-z0-9]+/g,'_').replace(/_+$/,''),
        name:nm,
        genres:[],
        rankByGenre:{},
        pointsByGenre:{},
        trending:false
      };
    }
    if(lM[nm].genres.indexOf(gn)===-1) lM[nm].genres.push(gn);
    lM[nm].rankByGenre[gn]=lb.rank;
    lM[nm].pointsByGenre[gn]=lb.points;
  }
}

// Mark trending: top 25 in any genre OR > 500 total points
for(var k in lM){
  var l=lM[k];
  var ranks=Object.values(l.rankByGenre);
  var minR=Math.min.apply(null,ranks);
  var tPts=Object.values(l.pointsByGenre).reduce(function(a,b){return a+b;},0);
  if(minR<=25||tPts>500){
    l.trending=true;
    l.trendingRankByGenre={};
    l.trendingPointsByGenre={};
    for(var gr in l.rankByGenre){
      if(l.rankByGenre[gr]<=50){
        l.trendingRankByGenre[gr]=l.rankByGenre[gr];
        l.trendingPointsByGenre[gr]=l.pointsByGenre[gr];
      }
    }
  }
}

// Build scrapedPeriod ISO timestamp for snapshot ordering.
// "current" -> now
// "2024"    -> 2024-12-31T23:59:59Z  (end of that year)
// "2024-6"  -> 2024-06-30T23:59:59Z  (end of that month)
var scrapedPeriod;
if(PERIOD_LABEL==='current'){
  scrapedPeriod=new Date().toISOString();
}else if(PERIOD_LABEL.indexOf('-')===-1){
  // Yearly
  var y=parseInt(PERIOD_LABEL,10);
  scrapedPeriod=new Date(Date.UTC(y,11,31,23,59,59)).toISOString();
}else{
  // Monthly
  var parts=PERIOD_LABEL.split('-');
  var yy=parseInt(parts[0],10);
  var mm=parseInt(parts[1],10);
  // Last day of that month
  var lastDay=new Date(Date.UTC(yy,mm,0)).getUTCDate();
  scrapedPeriod=new Date(Date.UTC(yy,mm-1,lastDay,23,59,59)).toISOString();
}

var out={
  genres:GENRES.map(function(g){return g.name;}),
  labels:Object.values(lM),
  _meta:{
    source:'beatstats',
    scrapedAt:new Date().toISOString(),
    scrapedPeriod:scrapedPeriod,
    periodLabel:PERIOD_LABEL,
    totalLabels:Object.keys(lM).length,
    totalGenres:GENRES.length,
    successGenres:sC,
    failedGenres:fC
  }
};

var js=JSON.stringify(out,null,2);
var bl=new Blob([js],{type:'application/json'});
var u=URL.createObjectURL(bl);
var a=document.createElement('a');
a.href=u;
a.download='labelpulse_beatstats_'+PERIOD_LABEL.replace(/[^a-z0-9]+/gi,'_')+'_'+new Date().toISOString().split('T')[0]+'.json';
document.body.appendChild(a);
a.click();
document.body.removeChild(a);
URL.revokeObjectURL(u);

console.log(S+' %c========================================',c1,c1);
console.log(S+' %cCOMPLETATO!',c1,cOk);
console.log(S+' %c'+Object.keys(lM).length+' label da '+sC+'/'+GENRES.length+' generi',c1,cOk);
console.log(S+' %cPeriodo: '+PERIOD_LABEL+' (snapshot timestamp: '+scrapedPeriod+')',c1,c2);
if(fC>0) console.log(S+' %c '+fC+' generi senza dati',c1,cErr);
console.log(S+' %cFile JSON scaricato! Importa in LabelPulse',c1,cOk);
console.log(S+' %c========================================',c1,c1);
return out;
})();`;
}

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

const CURRENT_YEAR = new Date().getFullYear();
const YEAR_OPTIONS = ["current", ...Array.from({ length: CURRENT_YEAR - 2015 + 1 }, (_, i) => String(CURRENT_YEAR - i))];
const MONTH_OPTIONS = ["all", "1", "2", "3", "4", "5", "6", "7", "8", "9", "10", "11", "12"];

export function RankingsWizard() {
  const { locale, rankingsUpdatedAt, importData, setRankingsUpdatedAt } = useAppStore();
  const { toast } = useToast();
  const [expanded, setExpanded] = useState(false);
  const [copied, setCopied] = useState(false);
  const [importWarning, setImportWarning] = useState(false);
  const [source, setSource] = useState<"beatport" | "beatstats">("beatport");
  const [period, setPeriod] = useState<string>("current"); // "current" | "2024" | "2023" ...
  const [month, setMonth] = useState<string>("all"); // "all" | "1".."12"
  const fileInputRef = useRef<HTMLInputElement>(null);

  const daysSince = getDaysSince(rankingsUpdatedAt);
  const isStale = daysSince !== null && daysSince > 30;
  const neverUpdated = daysSince === null;

  // The script to copy depends on the selected source + period.
  const scriptToCopy = useMemo(() => {
    if (source === "beatport") return BEATPORT_SCRAPER_SCRIPT;
    return buildBeatstatsScript(period, month);
  }, [source, period, month]);

  const handleCopyScript = async () => {
    try {
      await navigator.clipboard.writeText(scriptToCopy);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback for older browsers
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
    if (source === "beatport") {
      window.open("https://www.beatport.com", "_blank");
    } else {
      // For Beatstats, ALWAYS open the homepage. Period-specific URLs like
      // /genre/house/2024 may not exist or may 404 — and the user just needs
      // to be ON beatstats.com (any page) to run the console scraper.
      // Cloudflare will challenge them on first visit; once they pass, the
      // scraper's fetch() calls inherit their session cookies and work.
      window.open("https://www.beatstats.com/", "_blank");
    }
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

      // Try to parse and check if it's a rankings file
      try {
        const parsed = JSON.parse(content);
        const isRankingsFile = parsed._meta?.source === "beatport" || parsed._meta?.source === "beatstats" || (parsed.genres && parsed.labels);

        if (!isRankingsFile) {
          toast({
            title: t(locale, "data.importError"),
            variant: "destructive",
          });
          return;
        }

        // ⚠️ Detect empty scrapes (scraper failed — usually Cloudflare block
        // or user ran the script from a non-beatstats page). Warn the user
        // instead of silently importing 0 labels.
        const totalLabels = Array.isArray(parsed.labels) ? parsed.labels.length : 0;
        const failedGenres = parsed._meta?.failedGenres ?? 0;
        const successGenres = parsed._meta?.successGenres ?? 0;
        if (totalLabels === 0 || (failedGenres > 0 && successGenres === 0)) {
          toast({
            title: locale === "it"
              ? `Scraper fallito: 0 label estratte (${failedGenres}/${parsed._meta?.totalGenres ?? 32} generi senza dati)`
              : `Scraper failed: 0 labels extracted (${failedGenres}/${parsed._meta?.totalGenres ?? 32} genres with no data)`,
            description: locale === "it"
              ? "Probabilmente Cloudflare ha bloccato le richieste. Apri beatstats.com, aspetta che la pagina carichi completamente, poi rifai lo script dalla console."
              : "Cloudflare likely blocked the requests. Open beatstats.com, wait for the page to fully load, then re-run the script from the console.",
            variant: "destructive",
          });
          return;
        }

        // Convert rankings format to full import format
        const importPayload = {
          app: "labelpulse",
          version: 1,
          data: {
            labels: parsed.labels || [],
            demos: [],
          },
          _meta: parsed._meta,
        };

        const success = importData(JSON.stringify(importPayload));
        if (success) {
          // For historical Beatstats imports, use the scraped period as the
          // "rankingsUpdatedAt" so the UI shows the actual period of the data
          // (e.g., "Classifica di dicembre 2024") instead of "now".
          const scrapedPeriod = parsed._meta?.scrapedPeriod;
          const updatedAt =
            scrapedPeriod && parsed._meta?.source === "beatstats"
              ? scrapedPeriod
              : new Date().toISOString();
          setRankingsUpdatedAt(updatedAt);
          toast({ title: t(locale, "data.rankingsSuccess") });
          setImportWarning(false);
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
      {/* Header with last update info */}
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

      {/* Stale warning banner */}
      {isStale && !expanded && (
        <div className="flex items-center gap-2 p-2 rounded-md bg-amber-500/10 border border-amber-500/30">
          <AlertTriangle className="h-3.5 w-3.5 text-amber-400 shrink-0" />
          <p className="text-xs text-amber-400">{t(locale, "data.rankingsStale")}</p>
        </div>
      )}

      {/* Expanded wizard steps */}
      {expanded && (
        <div className="space-y-3">
          <p className="text-xs text-muted-foreground">{t(locale, "data.rankingsDesc")}</p>

          {/* Last update detail */}
          {rankingsUpdatedAt && (
            <div className="flex items-center gap-2 p-2 rounded-md bg-muted/50">
              <Clock className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
              <span className="text-xs text-muted-foreground">
                {t(locale, "data.rankingsLastUpdate")}: {formatDate(rankingsUpdatedAt, locale)}
              </span>
            </div>
          )}

          {/* Source selector: Beatport vs Beatstats */}
          <div className="space-y-2 p-3 rounded-lg bg-muted/30 border border-border/50">
            <div className="text-xs font-medium">
              {locale === "it" ? "Sorgente classifiche" : "Rankings source"}
            </div>
            <div className="flex rounded-lg border border-border overflow-hidden">
              <button
                onClick={() => setSource("beatport")}
                className={`flex-1 px-3 py-1.5 text-xs font-medium transition-colors ${
                  source === "beatport"
                    ? "bg-primary/15 text-primary"
                    : "text-muted-foreground hover:text-foreground hover:bg-secondary/50"
                }`}
              >
                Beatport
                <span className="block text-[10px] font-normal opacity-70 mt-0.5">
                  {locale === "it" ? "Top 100 attuale" : "Current top 100"}
                </span>
              </button>
              <button
                onClick={() => setSource("beatstats")}
                className={`flex-1 px-3 py-1.5 text-xs font-medium transition-colors ${
                  source === "beatstats"
                    ? "bg-primary/15 text-primary"
                    : "text-muted-foreground hover:text-foreground hover:bg-secondary/50"
                }`}
              >
                Beatstats
                <span className="block text-[10px] font-normal opacity-70 mt-0.5">
                  {locale === "it" ? "Annuale / mensile (storico)" : "Yearly / monthly (historical)"}
                </span>
              </button>
            </div>

            {/* Period selectors — only shown for Beatstats */}
            {source === "beatstats" && (
              <div className="flex gap-2 mt-2">
                <div className="flex-1">
                  <label className="text-[10px] text-muted-foreground uppercase tracking-wide">
                    {locale === "it" ? "Anno" : "Year"}
                  </label>
                  <select
                    value={period}
                    onChange={(e) => setPeriod(e.target.value)}
                    className="w-full mt-0.5 bg-background border border-border rounded px-2 py-1 text-xs"
                  >
                    {YEAR_OPTIONS.map((y) => (
                      <option key={y} value={y}>
                        {y === "current"
                          ? locale === "it" ? "Classifica attuale" : "Current chart"
                          : y}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="flex-1">
                  <label className="text-[10px] text-muted-foreground uppercase tracking-wide">
                    {locale === "it" ? "Mese" : "Month"}
                  </label>
                  <select
                    value={month}
                    onChange={(e) => setMonth(e.target.value)}
                    disabled={period === "current"}
                    className="w-full mt-0.5 bg-background border border-border rounded px-2 py-1 text-xs disabled:opacity-40"
                  >
                    {MONTH_OPTIONS.map((m) => (
                      <option key={m} value={m}>
                        {m === "all"
                          ? locale === "it" ? "Tutto l'anno" : "Full year"
                          : new Date(2000, parseInt(m, 10) - 1, 1).toLocaleDateString(locale === "it" ? "it-IT" : "en-US", { month: "long" })}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            )}
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

          {/* Step 2: Open Beatport/Beatstats + Console */}
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
            {source === "beatstats" && (
              <div className="flex items-start gap-2 pl-7">
                <AlertTriangle className="h-3.5 w-3.5 text-orange-400 shrink-0 mt-0.5" />
                <p className="text-xs text-orange-300 leading-relaxed">
                  {locale === "it"
                    ? "Beatstats è protetto da Cloudflare. Apri il sito, ASPETTA che la pagina carichi completamente (vedrai la classifica), SOLO ALLORA apri la console (F12) e incolla lo script. Se lo script restituisce \"0 label\" significa che non hai superato il controllo Cloudflare — ricarica la pagina e riprova."
                    : "Beatstats is protected by Cloudflare. Open the site, WAIT for the page to fully load (you'll see the chart), ONLY THEN open the console (F12) and paste the script. If the script returns \"0 labels\" it means you didn't pass the Cloudflare check — reload the page and try again."}
                </p>
              </div>
            )}
            <div className="pl-7 flex items-center gap-2">
              <Button
                onClick={handleOpenSite}
                size="sm"
                variant="outline"
                className="gap-1.5 text-xs"
              >
                <ExternalLink className="h-3.5 w-3.5" />
                {source === "beatport"
                  ? t(locale, "data.rankingsOpenBeatport")
                  : (locale === "it" ? "Apri Beatstats" : "Open Beatstats")}
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
            {source === "beatstats" && (
              <p className="text-xs text-cyan-400 pl-7">
                {locale === "it"
                  ? `Lo script scaricherà le classifiche del periodo "${period === "current" ? "attuale" : period + (month !== "all" ? "/" + month : "")}" per tutti i generi. Ci vorranno ~30 secondi.`
                  : `The script will scrape the "${period === "current" ? "current" : period + (month !== "all" ? "/" + month : "")}" period for all genres. Takes ~30 seconds.`}
              </p>
            )}
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
