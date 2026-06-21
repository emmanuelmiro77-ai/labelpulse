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

// ==================== BEATSTATS SCRAPER v2.1 ====================
// Beatstats rewrote their URL structure (2026): old /genre/{slug} and
// /label-ranking/{slug} both return 404. The new pattern is:
//     /list?genre={numericId}&period={periodId}
// Genres are NUMERIC IDs discovered dynamically from the homepage.
//
// FIX HISTORY:
//   v2.0 — switched to /list?genre=X&period=Y + dynamic genre discovery
//   v2.1 — fixed regex SyntaxError: [\u2212-+*] was parsed as range
//          from U+2212 to U+002B (out of order). Moved hyphen to end
//          of character class so it's literal: [\u2212+*-]
function buildBeatstatsScript(period: "current" | string, month: string | null): string {
  let periodLabel = "current";
  if (period !== "current") {
    periodLabel = period;
    if (month && month !== "all") {
      periodLabel = `${period}-${month}`;
    }
  }

  return `(async function(){'use strict';
var PERIOD_LABEL = ${JSON.stringify(periodLabel)};
var DELAY_MS = 600;
var S='%c[LabelPulse]',c1='color:#8b5cf6;font-weight:bold',c2='color:#666',cOk='color:#22c55e;font-weight:bold',cErr='color:#ef4444';
console.log(S+' %cBeatstats Scraper v3 avviato',c1,c2);
console.log(S+' %cPeriodo: '+PERIOD_LABEL,c1,c2);
var sleep=function(ms){return new Promise(function(r){setTimeout(r,ms)})};

if(location.hostname.indexOf('beatstats.com')===-1){
  console.log(S+' %cERRORE: non sei su beatstats.com!',c1,cErr);
  console.log(S+' %cApri https://www.beatstats.com/ , aspetta che carichi, poi rilancia lo script.',c1,cErr);
  var errOut={genres:[],labels:[],_meta:{source:'beatstats',scrapedAt:new Date().toISOString(),periodLabel:PERIOD_LABEL,totalLabels:0,totalGenres:0,successGenres:0,failedGenres:0,error:'NOT_ON_BEATSTATS'}};
  var errJs=JSON.stringify(errOut,null,2),errBl=new Blob([errJs],{type:'application/json'}),errU=URL.createObjectURL(errBl),errA=document.createElement('a');
  errA.href=errU;errA.download='labelpulse_beatstats_ERROR.json';document.body.appendChild(errA);errA.click();document.body.removeChild(errA);URL.revokeObjectURL(errU);
  return errOut;
}
var ORIGIN=location.origin;

// Browser-like headers so Beatstats/Cloudflare don't 404 our fetches
function browserHeaders(){
  return {
    'Accept':'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
    'Accept-Language':'en-US,en;q=0.9,it;q=0.8',
    'Sec-Fetch-Dest':'document',
    'Sec-Fetch-Mode':'navigate',
    'Sec-Fetch-Site':'same-origin',
    'Sec-Fetch-User':'?1',
    'Upgrade-Insecure-Requests':'1'
  };
}

// Resolve a (possibly relative) href against the current origin
function resolveHref(href){
  if(!href) return null;
  if(href.indexOf('http')===0) return href;
  if(href.charAt(0)==='/') return ORIGIN+href;
  return ORIGIN+'/'+href;
}

// Given a genre, build the best URL we can: prefer the captured href,
// fall back to reconstructing several known URL patterns
function buildGenreUrls(genre){
  var urls=[];
  if(genre.href){
    var resolved=resolveHref(genre.href);
    if(resolved) urls.push(resolved);
  }
  // Fallback URL patterns (in priority order)
  if(PERIOD_LABEL==='current'){
    urls.push(ORIGIN+'/list?genre='+genre.id+'&period=2');
    urls.push(ORIGIN+'/list?genre='+genre.id);
    urls.push(ORIGIN+'/label-ranking?genre='+genre.id+'&period=2');
  }else if(PERIOD_LABEL.indexOf('-')===-1){
    var y=parseInt(PERIOD_LABEL,10);
    urls.push(ORIGIN+'/list?genre='+genre.id+'&period=3&year='+y);
    urls.push(ORIGIN+'/list?genre='+genre.id+'&year='+y);
  }else{
    var parts=PERIOD_LABEL.split('-');
    urls.push(ORIGIN+'/list?genre='+genre.id+'&period=2&year='+parts[0]+'&month='+parts[1]);
    urls.push(ORIGIN+'/list?genre='+genre.id+'&year='+parts[0]+'&month='+parts[1]);
  }
  // De-duplicate
  var seen={},out=[];
  urls.forEach(function(u){ if(!seen[u]){ seen[u]=1; out.push(u);} });
  return out;
}

async function discoverGenres(){
  var genres=[];
  console.log(S+' %cFase 1: Scoperta generi da homepage...',c1,c2);
  try{
    var res=await fetch(ORIGIN+'/',{credentials:'include',headers:browserHeaders()});
    if(!res.ok){
      console.log(S+' %c  Homepage HTTP '+res.status+', provo URL alternativo',c1,cErr);
      res=await fetch(ORIGIN+'/list?genre=0&period=2',{credentials:'include',headers:browserHeaders()});
    }
    if(!res.ok){
      console.log(S+' %c  Impossibile caricare pagina: HTTP '+res.status+' (provo a leggere il body comunque)',c1,cErr);
    }
    var html=await res.text();
    if(html.indexOf('Just a moment...')!==-1||html.indexOf('__cf_chl_opt')!==-1){
      console.log(S+' %c  Cloudflare challenge. Aspetta che la pagina carichi e riprova.',c1,cErr);
      return [];
    }
    var doc=new DOMParser().parseFromString(html,'text/html');

    // Strategy A: <a href*="genre="> links — capture the FULL href
    var genreLinks=doc.querySelectorAll('a[href*="genre="]');
    var seen=new Set();
    genreLinks.forEach(function(link){
      var href=link.getAttribute('href')||'';
      var match=href.match(/[?&]genre=(\\d+)/);
      if(match){
        var id=parseInt(match[1],10);
        var name=(link.textContent||'').trim();
        if(name&&name.length>1&&!seen.has(id)){
          seen.add(id);
          genres.push({id:id,name:name,href:href});
        }
      }
    });
    if(genres.length>0){
      console.log(S+' %c  Trovati '+genres.length+' generi via link analysis',c1,cOk);
      // Diagnostic: log first 3 hrefs so we can verify the URL pattern
      for(var i=0;i<Math.min(3,genres.length);i++){
        console.log(S+' %c    sample['+i+'] id='+genres[i].id+' href='+genres[i].href,c1,c2);
      }
      return genres;
    }

    // Strategy B: __NEXT_DATA__ JSON
    var nextData=doc.getElementById('__NEXT_DATA__');
    if(nextData){
      try{
        var data=JSON.parse(nextData.textContent);
        function findGenres(obj,depth){
          if(depth>7||!obj||typeof obj!=='object') return null;
          if(Array.isArray(obj)){
            if(obj.length>5&&obj[0]&&typeof obj[0]==='object'&&((obj[0].id!==undefined)||(obj[0].genreId!==undefined))&&((obj[0].name)||(obj[0].slug))){
              return obj;
            }
            for(var i=0;i<obj.length;i++){var r=findGenres(obj[i],depth+1);if(r)return r;}
          }else{
            for(var k in obj){
              if((k==='genres'||k==='genreList')&&Array.isArray(obj[k])&&obj[k].length>5) return obj[k];
              var r=findGenres(obj[k],depth+1);if(r)return r;
            }
          }
          return null;
        }
        var found=findGenres(data,0);
        if(found){
          found.forEach(function(g){
            if(((g.id!==undefined)||(g.genreId!==undefined))&&(g.name||g.slug)){
              genres.push({id:g.id!==undefined?g.id:g.genreId,name:g.name||g.slug,href:g.href||g.url||g.link||null});
            }
          });
          if(genres.length>0){
            console.log(S+' %c  Trovati '+genres.length+' generi via __NEXT_DATA__',c1,cOk);
            return genres;
          }
        }
      }catch(e){
        console.log(S+' %c  __NEXT_DATA__ parse error: '+e.message,c1,cErr);
      }
    }

    // Strategy C: <select> dropdowns
    var selects=doc.querySelectorAll('select');
    selects.forEach(function(sel){
      if(genres.length>0) return;
      var opts=sel.querySelectorAll('option');
      opts.forEach(function(opt){
        var v=opt.getAttribute('value');
        var n=parseInt(v,10);
        var name=(opt.textContent||'').trim();
        if(!isNaN(n)&&name&&name.length>1){
          genres.push({id:n,name:name,href:null});
        }
      });
    });
    if(genres.length>0){
      console.log(S+' %c  Trovati '+genres.length+' generi via <select>',c1,cOk);
      return genres;
    }

    console.log(S+' %c  NESSUN genere trovato. Beatstats ha cambiato layout?',c1,cErr);
    return [];
  }catch(e){
    console.log(S+' %c  Errore fetch homepage: '+e.message,c1,cErr);
    return [];
  }
}

// NOTE: the hyphen MUST be at the END of the character class — otherwise
// [\\u2212-+*] is parsed as a range from U+2212 to U+002B (out of order).
// v2.0 had this bug; it threw SyntaxError and the whole script failed.
function parseCell(text){
  if(!text) return null;
  var clean=text.replace(/[\\s,]/g,'').replace(/[\\u2191\\u2193\\u2013\\u2014\\u2212+*\\-]/g,'').trim();
  if(!clean) return null;
  var m=clean.match(/^(\\d+)$/);
  if(!m) return null;
  var n=parseInt(m[1],10);
  if(isNaN(n)) return null;
  return {num:n};
}

function extractLabelsFromDoc(doc){
  var out=[];
  var seen=new Set();

  // Strategy A: __NEXT_DATA__ with embedded label rankings
  var nextData=doc.getElementById('__NEXT_DATA__');
  if(nextData){
    try{
      var data=JSON.parse(nextData.textContent);
      function findLabels(obj,depth){
        if(depth>8||!obj||typeof obj!=='object') return null;
        if(Array.isArray(obj)){
          if(obj.length>3&&obj[0]&&typeof obj[0]==='object'){
            var first=obj[0];
            if((first.name||first.label||first.labelName||first.label_name)&&
               (first.rank!==undefined||first.position!==undefined||first.points!==undefined||first.score!==undefined||first.totalPoints!==undefined)){
              return obj;
            }
          }
          for(var i=0;i<obj.length;i++){var r=findLabels(obj[i],depth+1);if(r)return r;}
        }else{
          for(var k in obj){
            if((k==='labels'||k==='ranking'||k==='results'||k==='items'||k==='data')&&
               Array.isArray(obj[k])&&obj[k].length>3){
              var arr=obj[k];
              if(arr[0]&&typeof arr[0]==='object'&&
                 (arr[0].name||arr[0].label||arr[0].labelName||arr[0].label_name)){
                return arr;
              }
            }
            var r=findLabels(obj[k],depth+1);if(r)return r;
          }
        }
        return null;
      }
      var found=findLabels(data,0);
      if(found){
        found.forEach(function(item,idx){
          var name=(item.name||item.label||item.labelName||item.label_name||'').toString().toUpperCase().trim();
          if(!name||name.length<2) return;
          if(seen.has(name)) return;
          seen.add(name);
          var rank=item.rank||item.position||(idx+1);
          var points=item.points||item.score||item.totalPoints||0;
          var tracks=item.tracks||item.trackCount||item.totalTracks||0;
          out.push({name:name,rank:parseInt(rank)||(idx+1),points:parseInt(points)||0,tracks:parseInt(tracks)||0});
        });
        if(out.length>0){
          console.log(S+' %c    Estratte '+out.length+' label via __NEXT_DATA__',c1,cOk);
          return out;
        }
      }
    }catch(e){
      console.log(S+' %c    __NEXT_DATA__ parse error: '+e.message,c1,cErr);
    }
  }

  // Strategy B: HTML <a href*="/label/"> links
  var labelLinks=doc.querySelectorAll('a[href*="/label/"], a[href*="/label."]');
  if(labelLinks.length>0){
    for(var i=0;i<labelLinks.length;i++){
      var link=labelLinks[i];
      var labelName=(link.textContent||'').trim();
      if(!labelName||labelName.length<2) continue;
      var key=labelName.toUpperCase().trim();
      if(seen.has(key)) continue;
      var row=link.closest('tr, li, [class*="row"], [class*="item"], [class*="label"], [class*="rank"]');
      if(!row) continue;
      var rowText=(row.textContent||'').trim();
      if(rowText.length<5) continue;
      var cells=row.querySelectorAll('td, th, .cell, [class*="col"], span');
      var nums=[];
      for(var j=0;j<cells.length;j++){
        var p=parseCell(cells[j].textContent||'');
        if(p) nums.push(p.num);
      }
      var rank=0, points=0, tracks=0;
      var positiveNums=nums.filter(function(n){return n>0;});
      if(positiveNums.length>0){
        rank=positiveNums[0];
        if(positiveNums.length>1){
          points=Math.max.apply(null,positiveNums.slice(1));
          if(positiveNums.length>2){
            var sorted=positiveNums.slice(1).sort(function(a,b){return b-a;});
            tracks=sorted[1]||0;
          }
        }
      }
      if(!rank) rank=out.length+1;
      if(rank>1000) rank=out.length+1;
      seen.add(key);
      out.push({name:key,rank:rank,points:Math.max(0,points),tracks:tracks});
    }
    if(out.length>0){
      console.log(S+' %c    Estratte '+out.length+' label via HTML link analysis',c1,cOk);
      return out;
    }
  }

  // Strategy C: generic table rows
  var rows=doc.querySelectorAll('table tbody tr, .ranking-row, .label-row, [data-label]');
  if(rows.length>0){
    rows.forEach(function(row,idx){
      var cells=row.querySelectorAll('td, .cell');
      if(cells.length<2) return;
      var rank=parseInt((cells[0].textContent||'').trim())||(idx+1);
      var name=(cells[1].textContent||'').trim().toUpperCase();
      var points=0;
      if(cells[2]) points=parseInt((cells[2].textContent||'').replace(/[^0-9]/g,''))||0;
      if(name&&name.length>1&&!seen.has(name)){
        seen.add(name);
        out.push({name:name,rank:rank,points:points,tracks:0});
      }
    });
    if(out.length>0){
      console.log(S+' %c    Estratte '+out.length+' label via table parsing',c1,cOk);
      return out;
    }
  }

  return out;
}

async function scrapeGenre(genre){
  var urls=buildGenreUrls(genre);
  for(var ui=0;ui<urls.length;ui++){
    var url=urls[ui];
    var tag=ui===0?'  GET':(ui===1?'  RETRY':'  RETRY['+ui+']');
    console.log(S+' %c'+tag+' '+url,c1,c2);
    try{
      var res=await fetch(url,{credentials:'include',headers:browserHeaders()});
      var html=await res.text();
      // Cloudflare challenge: bail and don't try fallbacks (we'd hit the same wall)
      if(html.indexOf('Just a moment...')!==-1||html.indexOf('__cf_chl_opt')!==-1){
        console.log(S+' %c  Cloudflare challenge per '+genre.name,c1,cErr);
        return [];
      }
      // Parse body EVEN on non-2xx — Next.js apps often return 404 status
      // but still embed __NEXT_DATA__ with the actual data
      var doc=new DOMParser().parseFromString(html,'text/html');
      var labels=extractLabelsFromDoc(doc);
      if(labels.length>0){
        labels.sort(function(a,b){
          if(b.points!==a.points) return b.points-a.points;
          return a.rank-b.rank;
        });
        labels.forEach(function(l,i){l.rank=i+1;});
        console.log(S+' %c  OK '+labels.length+' label (HTTP '+res.status+', url['+ui+']) \\u2014 #1: '+(labels[0]?labels[0].name:'-')+' ('+(labels[0]?labels[0].points:0)+' pts)',c1,cOk);
        return labels;
      }
      // 0 labels from this URL — try the next one
      console.log(S+' %c  HTTP '+res.status+' / 0 label da url['+ui+']',c1,cErr);
    }catch(e){
      console.log(S+' %c  Errore '+genre.name+' url['+ui+']: '+e.message,c1,cErr);
    }
  }
  console.log(S+' %c  FALLITO '+genre.name+' ('+urls.length+' URL provati, 0 label)',c1,cErr);
  return [];
}

console.log(S+' %c========================================',c1,c1);
console.log(S+' %cINIZIO ESTRAZIONE BEATSTATS v3',c1,cOk);
console.log(S+' %cPeriodo: '+PERIOD_LABEL,c1,c2);
console.log(S+' %c========================================',c1,c1);

var GENRES=await discoverGenres();
if(GENRES.length===0){
  console.log(S+' %cERRORE: Impossibile scoprire i generi.',c1,cErr);
  console.log(S+' %cAssicurati di essere su https://www.beatstats.com/ con pagina caricata.',c1,cErr);
  var emptyOut={genres:[],labels:[],_meta:{source:'beatstats',scrapedAt:new Date().toISOString(),scrapedPeriod:new Date().toISOString(),periodLabel:PERIOD_LABEL,totalLabels:0,totalGenres:0,successGenres:0,failedGenres:0,error:'GENRE_DISCOVERY_FAILED'}};
  var emptyJs=JSON.stringify(emptyOut,null,2),emptyBl=new Blob([emptyJs],{type:'application/json'}),emptyU=URL.createObjectURL(emptyBl),emptyA=document.createElement('a');
  emptyA.href=emptyU;emptyA.download='labelpulse_beatstats_'+PERIOD_LABEL.replace(/[^a-z0-9]+/gi,'_')+'_'+new Date().toISOString().split('T')[0]+'.json';
  document.body.appendChild(emptyA);emptyA.click();document.body.removeChild(emptyA);URL.revokeObjectURL(emptyU);
  return emptyOut;
}

console.log(S+' %cGeneri scoperti: '+GENRES.length,c1,cOk);
console.log(S+' %c========================================',c1,c1);

var gR={},tL=0,sC=0,fC=0;
for(var gi=0;gi<GENRES.length;gi++){
  var g=GENRES[gi];
  var pct=Math.round(((gi+1)/GENRES.length)*100);
  console.log(S+' %c['+pct+'%] '+g.name+' (id='+g.id+')...',c1,c2);
  var arr=await scrapeGenre(g);
  gR[g.name]=arr;
  tL+=arr.length;
  if(arr.length>0) sC++; else fC++;
  await sleep(DELAY_MS);
}

console.log(S+' %cCostruzione JSON...',c1,c2);

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

var scrapedPeriod;
if(PERIOD_LABEL==='current'){
  scrapedPeriod=new Date().toISOString();
}else if(PERIOD_LABEL.indexOf('-')===-1){
  var y=parseInt(PERIOD_LABEL,10);
  scrapedPeriod=new Date(Date.UTC(y,11,31,23,59,59)).toISOString();
}else{
  var parts=PERIOD_LABEL.split('-');
  var yy=parseInt(parts[0],10);
  var mm=parseInt(parts[1],10);
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
console.log(S+' %cPeriodo: '+PERIOD_LABEL+' (snapshot: '+scrapedPeriod+')',c1,c2);
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

export function RankingsWizard() {
  const { locale, rankingsUpdatedAt, importData, setRankingsUpdatedAt } = useAppStore();
  const { toast } = useToast();
  const [expanded, setExpanded] = useState(false);
  const [copied, setCopied] = useState(false);
  const [importWarning, setImportWarning] = useState(false);
  const [source, setSource] = useState<"beatport" | "beatstats">("beatport");
  const [period, setPeriod] = useState<string>("current");
  const [month, setMonth] = useState<string>("all");
  const fileInputRef = useRef<HTMLInputElement>(null);

  const daysSince = getDaysSince(rankingsUpdatedAt);
  const isStale = daysSince !== null && daysSince > 30;
  const neverUpdated = daysSince === null;

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

        // Detect scraper failures (empty results, Cloudflare block, etc.)
        const totalLabels = Array.isArray(parsed.labels) ? parsed.labels.length : 0;
        const failedGenres = parsed._meta?.failedGenres ?? 0;
        const successGenres = parsed._meta?.successGenres ?? 0;
        const scraperError = parsed._meta?.error;

        if (scraperError || totalLabels === 0 || (failedGenres > 0 && successGenres === 0)) {
          const errorMsg = scraperError === "NOT_ON_BEATSTATS"
            ? (locale === "it"
                ? "Lo script è stato eseguito fuori da beatstats.com. Apri https://www.beatstats.com/ , aspetta che carichi, poi riprova."
                : "Script was run outside beatstats.com. Open https://www.beatstats.com/, wait for it to load, then try again.")
            : scraperError === "GENRE_DISCOVERY_FAILED"
              ? (locale === "it"
                  ? "Impossibile scoprire i generi da beatstats. Assicurati che la pagina abbia caricato completamente (devi vedere la classifica) prima di lanciare lo script."
                  : "Could not discover genres from beatstats. Make sure the page has fully loaded (you should see the chart) before running the script.")
              : (locale === "it"
                  ? `Scraper fallito: 0 label estratte (${failedGenres}/${parsed._meta?.totalGenres ?? 32} generi senza dati). Probabilmente non hai superato Cloudflare — ricarica la pagina e riprova.`
                  : `Scraper failed: 0 labels extracted (${failedGenres}/${parsed._meta?.totalGenres ?? 32} genres with no data). Likely Cloudflare block — reload the page and try again.`);
          toast({
            title: locale === "it" ? "Importazione fallita" : "Import failed",
            description: errorMsg,
            variant: "destructive",
          });
          return;
        }

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
          // "rankingsUpdatedAt" so the UI shows the actual period of the data.
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

  const currentYear = new Date().getFullYear();
  const yearOptions = ["current"];
  for (let y = currentYear; y >= 2020; y--) yearOptions.push(String(y));
  const monthOptions = ["all"];
  for (let m = 1; m <= 12; m++) monthOptions.push(String(m));

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

          {/* Source selector: Beatport vs Beatstats */}
          <div className="space-y-2 p-3 rounded-lg bg-muted/30 border border-border/50">
            <div className="text-xs font-medium">
              {locale === "it" ? "Sorgente classifiche" : "Rankings source"}
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => setSource("beatport")}
                className={`flex-1 px-3 py-1.5 text-xs font-medium transition-colors rounded-md ${
                  source === "beatport"
                    ? "bg-primary/15 text-primary"
                    : "text-muted-foreground hover:text-foreground hover:bg-secondary/50"
                }`}
              >
                Beatport
                <span className="block text-[10px] font-normal opacity-70 mt-0.5">
                  {locale === "it" ? "Top-100 attuale" : "Current top-100"}
                </span>
              </button>
              <button
                onClick={() => setSource("beatstats")}
                className={`flex-1 px-3 py-1.5 text-xs font-medium transition-colors rounded-md ${
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

            {source === "beatstats" && (
              <div className="flex gap-2 mt-2">
                <div className="flex-1">
                  <label className="text-[10px] text-muted-foreground uppercase tracking-wide">
                    {locale === "it" ? "Anno" : "Year"}
                  </label>
                  <select
                    value={period}
                    onChange={(e) => setPeriod(e.target.value)}
                    className="w-full mt-1 px-2 py-1 text-xs bg-background border border-border rounded-md"
                  >
                    {yearOptions.map((y) => (
                      <option key={y} value={y}>
                        {y === "current" ? (locale === "it" ? "Attuale" : "Current") : y}
                      </option>
                    ))}
                  </select>
                </div>
                {period !== "current" && (
                  <div className="flex-1">
                    <label className="text-[10px] text-muted-foreground uppercase tracking-wide">
                      {locale === "it" ? "Mese" : "Month"}
                    </label>
                    <select
                      value={month}
                      onChange={(e) => setMonth(e.target.value)}
                      className="w-full mt-1 px-2 py-1 text-xs bg-background border border-border rounded-md"
                    >
                      {monthOptions.map((m) => (
                        <option key={m} value={m}>
                          {m === "all"
                            ? (locale === "it" ? "Tutto l'anno" : "Full year")
                            : new Date(2000, parseInt(m) - 1, 1).toLocaleDateString(locale === "it" ? "it-IT" : "en-US", { month: "long" })}
                        </option>
                      ))}
                    </select>
                  </div>
                )}
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
            {source === "beatstats" && (
              <div className="flex items-start gap-2 pl-7">
                <AlertTriangle className="h-3.5 w-3.5 text-orange-400 shrink-0 mt-0.5" />
                <p className="text-xs text-orange-300 leading-relaxed">
                  {locale === "it"
                    ? "Apri https://www.beatstats.com/ , ASPETTA che la pagina carichi completamente (vedrai la classifica con le label). SOLO ALLORA apri la console (F12) e incolla lo script. Lo script v2.1 scopre automaticamente i generi dalla homepage. Se vedi \"GENRE_DISCOVERY_FAILED\" nel JSON, ricarica la pagina e riprova."
                    : "Open https://www.beatstats.com/, WAIT for the page to fully load (you'll see the chart with labels). ONLY THEN open the console (F12) and paste the script. The v2.1 script auto-discovers genres from the homepage. If you see \"GENRE_DISCOVERY_FAILED\" in the JSON, reload the page and try again."}
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
