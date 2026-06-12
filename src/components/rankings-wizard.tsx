"use client";

import { useAppStore } from "@/lib/store";
import { t } from "@/lib/i18n";
import { useState, useRef } from "react";
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

// The minified Beatport console scraper script
const BEATPORT_SCRAPER_SCRIPT = `(async function(){'use strict';var D=800,G=[{id:81,slug:'140-deep-dubstep-grime',name:'140 / Deep Dubstep / Grime'},{id:89,slug:'afro-house',name:'Afro House'},{id:99,slug:'amapiano',name:'Amapiano'},{id:85,slug:'ambient-experimental',name:'Ambient / Experimental'},{id:87,slug:'bass-club',name:'Bass / Club'},{id:91,slug:'bass-house',name:'Bass House'},{id:101,slug:'brazilian-funk',name:'Brazilian Funk'},{id:9,slug:'breaks-breakbeat-uk-bass',name:'Breaks / Breakbeat / Uk Bass'},{id:39,slug:'dance-pop',name:'Dance / Pop'},{id:12,slug:'deep-house',name:'Deep House'},{id:82,slug:'downtempo',name:'Downtempo'},{id:1,slug:'drum-and-bass',name:'Drum & Bass'},{id:18,slug:'dubstep',name:'Dubstep'},{id:84,slug:'electro-classic-detroit-modern',name:'Electro Classic / Detroit / Modern'},{id:3,slug:'electronica',name:'Electronica'},{id:97,slug:'funky-house',name:'Funky House'},{id:8,slug:'hard-dance-hardcore-neo-rave',name:'Hard Dance / Hardcore / Neo Rave'},{id:98,slug:'hard-techno',name:'Hard Techno'},{id:5,slug:'house',name:'House'},{id:37,slug:'indie-dance',name:'Indie Dance'},{id:96,slug:'jackin-house',name:'Jackin House'},{id:100,slug:'mainstage',name:'Mainstage'},{id:90,slug:'melodic-house-techno',name:'Melodic House & Techno'},{id:14,slug:'minimal-deep-tech',name:'Minimal / Deep Tech'},{id:50,slug:'nu-disco-disco',name:'Nu Disco / Disco'},{id:88,slug:'organic-house',name:'Organic House'},{id:15,slug:'progressive-house',name:'Progressive House'},{id:13,slug:'psy-trance',name:'Psy-Trance'},{id:11,slug:'tech-house',name:'Tech House'},{id:6,slug:'techno-peak-time-driving',name:'Techno Peak Time / Driving'},{id:92,slug:'techno-raw-deep-hypnotic',name:'Techno Raw / Deep / Hypnotic'},{id:7,slug:'trance-main-floor',name:'Trance Main Floor'},{id:38,slug:'trap-future-bass',name:'Trap / Future Bass'},{id:86,slug:'uk-garage-bassline',name:'Uk Garage / Bassline'}];var S='%c[LabelPulse]',c1='color:#8b5cf6;font-weight:bold',c2='color:#666',cOk='color:#22c55e;font-weight:bold',cErr='color:#ef4444';console.log(S+' %cBeatport Scraper avviato',c1,c2);console.log(S+' %cGeneri: '+G.length,c1,c2);var sleep=function(ms){return new Promise(function(r){setTimeout(r,ms)})};function processTracks(tracks,lm){for(var i=0;i<tracks.length;i++){var t=tracks[i],label=null;if(t.release&&t.release.label)label=t.release.label;else if(t.label)label=t.label;else if(t.release&&t.release.release&&t.release.release.label)label=t.release.release.label;if(!label||!label.name)continue;var n=label.name.toUpperCase().trim(),pos=t._position||(i+1),pts=Math.max(0,101-pos);if(!lm.has(n)){lm.set(n,{id:label.id||null,name:n,slug:label.slug||'',trackCount:0,totalPoints:0,bestPosition:pos})}var e=lm.get(n);e.trackCount++;e.totalPoints+=pts;if(pos<e.bestPosition)e.bestPosition=pos}}async function fetchGenre(gid,slug){var lm=new Map();try{var r=await fetch('/api/catalog/genres/'+gid+'/top-100/',{credentials:'include'});if(r.ok){var d=await r.json(),tr=d.results||d.tracks||d;if(Array.isArray(tr)&&tr.length>0){console.log(S+' %c API interna: '+tr.length+' tracce',c1,cOk);processTracks(tr,lm);return lm}}}catch(e){}try{var r2=await fetch('https://api.beatport.com/v4/catalog/genres/'+gid+'/top-10-tracks/?per_page=100',{credentials:'include'});if(r2.ok){var d2=await r2.json(),tr2=d2.results||d2;if(Array.isArray(tr2)&&tr2.length>0){console.log(S+' %c API v4: '+tr2.length+' tracce',c1,cOk);processTracks(tr2,lm);return lm}}}catch(e){}try{var r3=await fetch('https://www.beatport.com/genre/'+slug+'/'+gid+'/top-100',{credentials:'include'});if(r3.ok){var html=await r3.text(),p=new DOMParser(),doc=p.parseFromString(html,'text/html'),nd=doc.getElementById('__NEXT_DATA__');if(nd){var nData=JSON.parse(nd.textContent),q=nData&&nData.props&&nData.props.pageProps&&nData.props.pageProps.dehydratedState&&nData.props.pageProps.dehydratedState.queries;if(q){for(var qi=0;qi<q.length;qi++){var res=q[qi].state&&q[qi].state.data&&q[qi].state.data.results;if(Array.isArray(res)&&res.length>0){console.log(S+' %c Next.js data: '+res.length+' tracce',c1,cOk);processTracks(res,lm);return lm}var trk=q[qi].state&&q[qi].state.data&&q[qi].state.data.tracks;if(Array.isArray(trk)&&trk.length>0){console.log(S+' %c Next.js data: '+trk.length+' tracce',c1,cOk);processTracks(trk,lm);return lm}}}}var tEls=doc.querySelectorAll('[data-testid="track-row"],.track-grid-content,.bucket-item');var htmlTracks=[];tEls.forEach(function(el,idx){try{var lEl=el.querySelector('[data-testid="label-name"],.buk-track-labels a,.track-label a');var lName=lEl?lEl.textContent.trim():null;var lHref=lEl?lEl.getAttribute('href'):'';var lIdM=lHref.match(/\\/label\\/(\\d+)/);if(lName){htmlTracks.push({release:{label:{id:lIdM?parseInt(lIdM[1]):null,name:lName,slug:lHref.split('/').pop()||''}},_position:idx+1})}}catch(e){}});if(htmlTracks.length>0){console.log(S+' %c HTML parsing: '+htmlTracks.length+' tracce',c1,cOk);processTracks(htmlTracks,lm);return lm}}}catch(e){console.log(S+' %c Errore: '+e.message,c1,cErr)}if(lm.size===0)console.log(S+' %c Nessun dato',c1,cErr);return lm}console.log(S+' %c========================================',c1,c1);console.log(S+' %cINIZIO ESTRAZIONE',c1,cOk);console.log(S+' %c========================================',c1,c1);var gR={},tL=0,sC=0,fC=0;for(var gi=0;gi<G.length;gi++){var g=G[gi],pct=Math.round(((gi+1)/G.length)*100);console.log(S+' %c['+pct+'%] '+g.name+'...',c1,c2);var lm=await fetchGenre(g.id,g.slug),la=Array.from(lm.values());la.sort(function(a,b){return b.totalPoints-a.totalPoints});la.forEach(function(l,i){l.rank=i+1});gR[g.name]=la;tL+=la.length;if(la.length>0){sC++;console.log(S+' %c  OK '+la.length+' label \\u2014 #1: '+la[0].name,c1,cOk)}else{fC++}await sleep(D)}console.log(S+' %cCostruzione JSON...',c1,c2);var lM={};for(var gn in gR){for(var li=0;li<gR[gn].length;li++){var lb=gR[gn][li],nm=lb.name.toUpperCase().trim();if(!nm)continue;if(!lM[nm]){lM[nm]={id:'lbl_'+nm.toLowerCase().replace(/[^a-z0-9]+/g,'_').replace(/_+$/,''),name:nm,genres:[],rankByGenre:{},pointsByGenre:{},trending:false};if(lb.id)lM[nm].beatportId=lb.id}if(lM[nm].genres.indexOf(gn)===-1)lM[nm].genres.push(gn);lM[nm].rankByGenre[gn]=lb.rank;lM[nm].pointsByGenre[gn]=lb.totalPoints}}for(var k in lM){var l=lM[k],ranks=Object.values(l.rankByGenre),minR=Math.min.apply(null,ranks),tPts=Object.values(l.pointsByGenre).reduce(function(a,b){return a+b},0);if(minR<=25||tPts>500){l.trending=true;l.trendingRankByGenre={};l.trendingPointsByGenre={};for(var gr in l.rankByGenre){if(l.rankByGenre[gr]<=50){l.trendingRankByGenre[gr]=l.rankByGenre[gr];l.trendingPointsByGenre[gr]=l.pointsByGenre[gr]}}}}var out={genres:G.map(function(g){return g.name}),labels:Object.values(lM),_meta:{source:'beatport',scrapedAt:new Date().toISOString(),totalLabels:Object.keys(lM).length,totalGenres:G.length,successGenres:sC,failedGenres:fC}};var js=JSON.stringify(out,null,2),bl=new Blob([js],{type:'application/json'}),u=URL.createObjectURL(bl),a=document.createElement('a');a.href=u;a.download='labelpulse_beatport_'+new Date().toISOString().split('T')[0]+'.json';document.body.appendChild(a);a.click();document.body.removeChild(a);URL.revokeObjectURL(u);console.log(S+' %c========================================',c1,c1);console.log(S+' %cCOMPLETATO!',c1,cOk);console.log(S+' %c'+Object.keys(lM).length+' label da '+sC+'/'+G.length+' generi',c1,cOk);if(fC>0)console.log(S+' %c '+fC+' generi senza dati',c1,cErr);console.log(S+' %cFile JSON scaricato! Importa in LabelPulse',c1,cOk);console.log(S+' %c========================================',c1,c1);return out})();`;

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

  const handleCopyScript = async () => {
    try {
      await navigator.clipboard.writeText(BEATPORT_SCRAPER_SCRIPT);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback for older browsers
      const textarea = document.createElement("textarea");
      textarea.value = BEATPORT_SCRAPER_SCRIPT;
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

  const handleOpenBeatport = () => {
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
          setRankingsUpdatedAt(new Date().toISOString());
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

          {/* Step 2: Open Beatport + Console */}
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
                onClick={handleOpenBeatport}
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
