(async function(){'use strict';
var PERIOD_LABEL = "current";
var DELAY_MS = 600;
var S='%c[LabelPulse]',c1='color:#8b5cf6;font-weight:bold',c2='color:#666',cOk='color:#22c55e;font-weight:bold',cErr='color:#ef4444';
console.log(S+' %cBeatstats Scraper v2.1 avviato',c1,c2);
console.log(S+' %cPeriodo: '+PERIOD_LABEL,c1,c2);
var sleep=function(ms){return new Promise(function(r){setTimeout(r,ms)})};

if(location.hostname.indexOf('beatstats.com')===-1){
  console.log(S+' %cERRORE: non sei su beatstats.com!',c1,cErr);
  console.log(S+' %cApri https://www.beatstats.com/ , aspetta che carichi, poi rilancia lo script.',c1,cErr);
  return;
}
var ORIGIN=location.origin;

function buildGenreUrl(genreId){
  return ORIGIN+'/list?genre='+genreId+'&period=2';
}

async function discoverGenres(){
  var genres=[];
  console.log(S+' %cFase 1: Scoperta generi da homepage...',c1,c2);
  try{
    var res=await fetch(ORIGIN+'/',{credentials:'include',headers:{'Accept':'text/html'}});
    if(!res.ok){
      res=await fetch(ORIGIN+'/list?genre=0&period=2',{credentials:'include',headers:{'Accept':'text/html'}});
    }
    if(!res.ok){
      console.log(S+' %c  Impossibile caricare pagina: HTTP '+res.status,c1,cErr);
      return [];
    }
    var html=await res.text();
    if(html.indexOf('Just a moment...')!==-1||html.indexOf('__cf_chl_opt')!==-1){
      console.log(S+' %c  Cloudflare challenge. Aspetta che la pagina carichi e riprova.',c1,cErr);
      return [];
    }
    var doc=new DOMParser().parseFromString(html,'text/html');

    // Strategy A: <a href="?genre=N"> links
    var genreLinks=doc.querySelectorAll('a[href*="genre="]');
    var seen=new Set();
    genreLinks.forEach(function(link){
      var href=link.getAttribute('href')||'';
      var match=href.match(/[?&]genre=(\d+)/);
      if(match){
        var id=parseInt(match[1],10);
        var name=(link.textContent||'').trim();
        if(name&&name.length>1&&!seen.has(id)){
          seen.add(id);
          genres.push({id:id,name:name});
        }
      }
    });
    if(genres.length>0){
      console.log(S+' %c  Trovati '+genres.length+' generi via link analysis',c1,cOk);
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
              genres.push({id:g.id!==undefined?g.id:g.genreId,name:g.name||g.slug});
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
          genres.push({id:n,name:name});
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

// FIXED: hyphen at END of char class to avoid range SyntaxError
function parseCell(text){
  if(!text) return null;
  var clean=text.replace(/[\s,]/g,'').replace(/[\u2191\u2193\u2013\u2014\u2212+*\-]/g,'').trim();
  if(!clean) return null;
  var m=clean.match(/^(\d+)$/);
  if(!m) return null;
  var n=parseInt(m[1],10);
  if(isNaN(n)) return null;
  return {num:n};
}

function extractLabelsFromDoc(doc){
  var out=[];
  var seen=new Set();

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
  var url=buildGenreUrl(genre.id);
  console.log(S+' %c  GET '+url,c1,c2);
  try{
    var res=await fetch(url,{credentials:'include',headers:{'Accept':'text/html'}});
    if(!res.ok){
      console.log(S+' %c  HTTP '+res.status+' per '+genre.name,c1,cErr);
      return [];
    }
    var html=await res.text();
    if(html.indexOf('Just a moment...')!==-1||html.indexOf('__cf_chl_opt')!==-1){
      console.log(S+' %c  Cloudflare challenge per '+genre.name,c1,cErr);
      return [];
    }
    var doc=new DOMParser().parseFromString(html,'text/html');
    var labels=extractLabelsFromDoc(doc);
    if(labels.length===0){
      console.log(S+' %c  0 label per '+genre.name,c1,cErr);
      return [];
    }
    labels.sort(function(a,b){
      if(b.points!==a.points) return b.points-a.points;
      return a.rank-b.rank;
    });
    labels.forEach(function(l,i){l.rank=i+1;});
    console.log(S+' %c  OK '+labels.length+' label \u2014 #1: '+(labels[0]?labels[0].name:'-')+' ('+(labels[0]?labels[0].points:0)+' pts)',c1,cOk);
    return labels;
  }catch(e){
    console.log(S+' %c  Errore '+genre.name+': '+e.message,c1,cErr);
    return [];
  }
}

console.log(S+' %c========================================',c1,c1);
console.log(S+' %cINIZIO ESTRAZIONE BEATSTATS v2.1',c1,cOk);
console.log(S+' %cPeriodo: '+PERIOD_LABEL,c1,c2);
console.log(S+' %c========================================',c1,c1);

var GENRES=await discoverGenres();
if(GENRES.length===0){
  console.log(S+' %cERRORE: Impossibile scoprire i generi.',c1,cErr);
  console.log(S+' %cAssicurati di essere su https://www.beatstats.com/ con pagina caricata.',c1,cErr);
  return;
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

var out={
  genres:GENRES.map(function(g){return g.name;}),
  labels:Object.values(lM),
  _meta:{
    source:'beatstats',
    scrapedAt:new Date().toISOString(),
    scrapedPeriod:new Date().toISOString(),
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
if(fC>0) console.log(S+' %c '+fC+' generi senza dati',c1,cErr);
console.log(S+' %cFile JSON scaricato! Importa in LabelPulse',c1,cOk);
console.log(S+' %c========================================',c1,c1);
return out;
})();