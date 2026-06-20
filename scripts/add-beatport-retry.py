#!/usr/bin/env python3
"""Add retry logic to the Beatport scraper's fetchGenre function.

When a genre returns 0 labels (e.g., transient Cloudflare block), wait
1.5s and retry. Max 3 attempts total.
"""
import sys

FILE = '/home/z/my-project/src/components/rankings-wizard.tsx'

with open(FILE, 'r') as f:
    content = f.read()

START_MARKER = 'async function fetchGenre(gid,slug){'
start = content.find(START_MARKER)
if start == -1:
    print('ERROR: fetchGenre function not found', file=sys.stderr)
    sys.exit(1)

# Find matching closing brace by counting
i = content.index('{', start)
depth = 0
end = i
while i < len(content):
    if content[i] == '{':
        depth += 1
    elif content[i] == '}':
        depth -= 1
        if depth == 0:
            end = i + 1
            break
    i += 1

old = content[start:end]
print(f'Old fetchGenre: {len(old)} chars')

# New fetchGenre with retry. Note: backslashes are doubled (\\d, \\/)
# because this string lives inside a TypeScript template literal, which
# processes \\ -> \ at runtime. The final JS regex will be /\d+/ and /\/label\/(\d+)/.
new = (
    'async function fetchGenre(gid,slug){'
    'var lm=new Map();'
    'for(var att=1;att<=3;att++){'
    'lm=new Map();'
    # Strategy 1: internal API
    'try{var r=await fetch(\'/api/catalog/genres/\'+gid+\'/top-100/\',{credentials:\'include\'});'
    'if(r.ok){var d=await r.json(),tr=d.results||d.tracks||d;'
    'if(Array.isArray(tr)&&tr.length>0){console.log(S+\' %c API interna: \'+tr.length+\' tracce\',c1,cOk);processTracks(tr,lm)}}}'
    'catch(e){}'
    'if(lm.size>0)break;'
    # Strategy 2: Beatport v4 API
    'try{var r2=await fetch(\'https://api.beatport.com/v4/catalog/genres/\'+gid+\'/top-10-tracks/?per_page=100\',{credentials:\'include\'});'
    'if(r2.ok){var d2=await r2.json(),tr2=d2.results||d2;'
    'if(Array.isArray(tr2)&&tr2.length>0){console.log(S+\' %c API v4: \'+tr2.length+\' tracce\',c1,cOk);processTracks(tr2,lm)}}}'
    'catch(e){}'
    'if(lm.size>0)break;'
    # Strategy 3: HTML scrape with __NEXT_DATA__ + fallback HTML parsing
    'try{var r3=await fetch(\'https://www.beatport.com/genre/\'+slug+\'/\'+gid+\'/top-100\',{credentials:\'include\'});'
    'if(r3.ok){var html=await r3.text(),p=new DOMParser(),doc=p.parseFromString(html,\'text/html\'),nd=doc.getElementById(\'__NEXT_DATA__\');'
    'if(nd){var nData=JSON.parse(nd.textContent),q=nData&&nData.props&&nData.props.pageProps&&nData.props.pageProps.dehydratedState&&nData.props.pageProps.dehydratedState.queries;'
    'if(q){for(var qi=0;qi<q.length;qi++){var res=q[qi].state&&q[qi].state.data&&q[qi].state.data.results;'
    'if(Array.isArray(res)&&res.length>0){console.log(S+\' %c Next.js data: \'+res.length+\' tracce\',c1,cOk);processTracks(res,lm);break}'
    'var trk=q[qi].state&&q[qi].state.data&&q[qi].state.data.tracks;'
    'if(Array.isArray(trk)&&trk.length>0){console.log(S+\' %c Next.js data: \'+trk.length+\' tracce\',c1,cOk);processTracks(trk,lm);break}}}}'
    'if(lm.size===0){var tEls=doc.querySelectorAll(\'[data-testid="track-row"],.track-grid-content,.bucket-item\');var htmlTracks=[];'
    'tEls.forEach(function(el,idx){try{var lEl=el.querySelector(\'[data-testid="label-name"],.buk-track-labels a,.track-label a\');'
    'var lName=lEl?lEl.textContent.trim():null;var lHref=lEl?lEl.getAttribute(\'href\'):\'\';'
    'var lIdM=lHref.match(/\\\\/label\\\\/(\\\\d+)/);'
    'if(lName){htmlTracks.push({release:{label:{id:lIdM?parseInt(lIdM[1]):null,name:lName,slug:lHref.split(\'/\').pop()||\'\'}},_position:idx+1})}}catch(e){}});'
    'if(htmlTracks.length>0){console.log(S+\' %c HTML parsing: \'+htmlTracks.length+\' tracce\',c1,cOk);processTracks(htmlTracks,lm)}}}}'
    'catch(e){console.log(S+\' %c Errore: \'+e.message,c1,cErr)}'
    'if(lm.size>0)break;'
    # Retry logic: if still empty and not last attempt, wait and retry
    'if(att<3){console.log(S+\' %c 0 label, retry \'+att+\'/2 in 1.5s...\',c1,c2);await sleep(1500)}'
    '}'
    'if(lm.size===0)console.log(S+\' %c Nessun dato dopo 3 tentativi\',c1,cErr);'
    'return lm}'
)

print(f'New fetchGenre: {len(new)} chars')

# Verify the new function is syntactically balanced (brace count)
depth = 0
for ch in new:
    if ch == '{': depth += 1
    elif ch == '}': depth -= 1
assert depth == 0, f'Brace mismatch in new function! Final depth: {depth}'
print('Brace balance: OK')

new_content = content[:start] + new + content[end:]
with open(FILE, 'w') as f:
    f.write(new_content)

print('File written successfully')
print(f'File size: {len(content)} -> {len(new_content)} chars ({len(new_content)-len(content):+d})')
