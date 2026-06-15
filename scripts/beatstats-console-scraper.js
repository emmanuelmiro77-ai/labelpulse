/**
 * LabelPulse BeatStats Scraper — Console Script
 * 
 * ISTRUZIONI:
 * 1. Vai su https://beatstats.com nel tuo browser Chrome/Firefox
 * 2. Supera il controllo Cloudflare se necessario
 * 3. Apri la Console del browser (F12 → tab Console)
 * 4. Incolla questo script e premi Invio
 * 5. Lo script scaricherà automaticamente i dati di tutti i generi
 * 6. Importa il file JSON in LabelPulse usando il pulsante Backup → Importa
 * 
 * Nota: Lo script naviga le pagine di BeatStats usando fetch()
 * dal tuo browser (dove hai già superato Cloudflare).
 * Ci vorranno circa 2-3 minuti per tutti i generi.
 */

(async function() {
    'use strict';

    // ==================== CONFIGURAZIONE ====================
    const DELAY_MS = 1500;              // Pausa tra una richiesta e l'altra (rispetta il server)
    const MAX_PAGES_PER_GENRE = 3;       // Max pagine per genere (3 pagine = ~150 label)

    // Mappatura generi BeatStats → nomi LabelPulse
    const GENRES = [
        { slug: '140-deep-dubstep-grime', name: '140 / Deep Dubstep / Grime' },
        { slug: 'afro-house', name: 'Afro House' },
        { slug: 'amapiano', name: 'Amapiano' },
        { slug: 'ambient-experimental', name: 'Ambient / Experimental' },
        { slug: 'bass-club', name: 'Bass / Club' },
        { slug: 'bass-house', name: 'Bass House' },
        { slug: 'brazilian-funk', name: 'Brazilian Funk' },
        { slug: 'breaks-breakbeat-uk-bass', name: 'Breaks / Breakbeat / Uk Bass' },
        { slug: 'dance-pop', name: 'Dance / Pop' },
        { slug: 'deep-house', name: 'Deep House' },
        { slug: 'downtempo', name: 'Downtempo' },
        { slug: 'drum-and-bass', name: 'Drum & Bass' },
        { slug: 'dubstep', name: 'Dubstep' },
        { slug: 'electro-classic-detroit-modern', name: 'Electro Classic / Detroit / Modern' },
        { slug: 'electronica', name: 'Electronica' },
        { slug: 'funky-house', name: 'Funky House' },
        { slug: 'hard-dance-hardcore-neo-rave', name: 'Hard Dance / Hardcore / Neo Rave' },
        { slug: 'hard-techno', name: 'Hard Techno' },
        { slug: 'house', name: 'House' },
        { slug: 'indie-dance', name: 'Indie Dance' },
        { slug: 'jackin-house', name: 'Jackin House' },
        { slug: 'mainstage', name: 'Mainstage' },
        { slug: 'melodic-house-techno', name: 'Melodic House & Techno' },
        { slug: 'minimal-deep-tech', name: 'Minimal / Deep Tech' },
        { slug: 'nu-disco-disco', name: 'Nu Disco / Disco' },
        { slug: 'organic-house', name: 'Organic House' },
        { slug: 'progressive-house', name: 'Progressive House' },
        { slug: 'psy-trance', name: 'Psy-Trance' },
        { slug: 'tech-house', name: 'Tech House' },
        { slug: 'techno-peak-time-driving', name: 'Techno Peak Time / Driving' },
        { slug: 'techno-raw-deep-hypnotic', name: 'Techno Raw / Deep / Hypnotic' },
        { slug: 'trance-main-floor', name: 'Trance Main Floor' },
        { slug: 'trap-future-bass', name: 'Trap / Future Bass' },
        { slug: 'uk-garage-bassline', name: 'Uk Garage / Bassline' },
    ];

    // ==================== UI CONSOLE ====================
    const style = 'color: #8b5cf6; font-weight: bold;';
    const styleDim = 'color: #666;';
    const styleOk = 'color: #22c55e; font-weight: bold;';
    const styleErr = 'color: #ef4444;';

    console.log('%c[LabelPulse]%c Avvio estrazione dati da BeatStats...', style, styleDim);
    console.log('%c[LabelPulse]%c Generi da elaborare: %d', style, styleDim, GENRES.length);

    // ==================== FUNZIONI HELPER ====================

    function sleep(ms) {
        return new Promise(r => setTimeout(r, ms));
    }

    /**
     * Fetch e parsing di una pagina BeatStats
     */
    async function fetchPage(url) {
        try {
            const response = await fetch(url);
            if (!response.ok) {
                console.log('%c[LabelPulse]%c HTTP %d per %s', style, styleErr, response.status, url);
                return [];
            }
            const html = await response.text();
            const parser = new DOMParser();
            const doc = parser.parseFromString(html, 'text/html');
            return extractLabelsFromDoc(doc);
        } catch(e) {
            console.log('%c[LabelPulse]%c Errore fetch %s: %s', style, styleErr, url, e.message);
            return [];
        }
    }

    /**
     * Estrae label dal documento HTML di BeatStats
     * BeatStats usa tabelle con: Rank | Label | Points | Trend
     */
    function extractLabelsFromDoc(doc) {
        const labels = [];

        // Metodo 1: Tabella standard BeatStats
        const rows = doc.querySelectorAll('table tbody tr');
        if (rows.length > 0) {
            rows.forEach((row) => {
                const cells = row.querySelectorAll('td');
                if (cells.length >= 3) {
                    const rank = parseInt(cells[0]?.textContent?.trim()) || 0;
                    const name = cells[1]?.textContent?.trim() || '';
                    const points = parseInt(cells[2]?.textContent?.replace(/[^0-9]/g, '')) || 0;
                    if (name && rank > 0) {
                        labels.push({ rank, name, points });
                    }
                }
            });
            if (labels.length > 0) return labels;
        }

        // Metodo 2: Div con classe ranking/label
        const items = doc.querySelectorAll('[class*="label-row"], [class*="ranking-row"], .rank-item');
        items.forEach((item, idx) => {
            const text = item.textContent || '';
            const rankMatch = text.match(/^#?(\d+)/);
            const rank = rankMatch ? parseInt(rankMatch[1]) : (idx + 1);
            // Il nome della label è tipicamente il link più prominente
            const link = item.querySelector('a');
            const name = link?.textContent?.trim() || '';
            const pointsMatch = text.match(/(\d{3,})/g);
            const points = pointsMatch ? parseInt(pointsMatch[pointsMatch.length - 1]) : 0;
            if (name) {
                labels.push({ rank, name, points });
            }
        });
        if (labels.length > 0) return labels;

        // Metodo 3: Qualsiasi link che punti a /label/ 
        const labelLinks = doc.querySelectorAll('a[href*="/label/"]');
        labelLinks.forEach((link, idx) => {
            const name = link.textContent?.trim();
            const row = link.closest('tr') || link.closest('div');
            const rowText = row?.textContent || '';
            const rankMatch = rowText.match(/^#?(\d+)/) || rowText.match(/(\d+)\./);
            const rank = rankMatch ? parseInt(rankMatch[1]) : (idx + 1);
            const pointsMatch = rowText.match(/(\d{3,})/g);
            const points = pointsMatch ? parseInt(pointsMatch[pointsMatch.length - 1]) : 0;
            if (name && name.length > 1) {
                labels.push({ rank, name, points });
            }
        });

        return labels;
    }

    // ==================== ESTRAZIONE PRINCIPALE ====================

    const genreResults = {};
    let totalLabels = 0;
    let processedGenres = 0;

    for (const genre of GENRES) {
        processedGenres++;
        const pct = Math.round((processedGenres / GENRES.length) * 100);
        console.log(
            '%c[LabelPulse]%c [%d%%] Scaricando %s...',
            style, styleDim, pct, genre.name
        );

        const allLabels = [];
        
        for (let page = 1; page <= MAX_PAGES_PER_GENRE; page++) {
            // BeatStats URL format: /label-ranking/{slug} or /label-ranking/{slug}/{page}
            const url = page === 1 
                ? `https://beatstats.com/label-ranking/${genre.slug}`
                : `https://beatstats.com/label-ranking/${genre.slug}/${page}`;
            
            const labels = await fetchPage(url);
            
            if (labels.length === 0 && page === 1) {
                // Prova con formato URL alternativo
                const altUrl = `https://beatstats.com/label-ranking/${genre.slug}/1`;
                const altLabels = await fetchPage(altUrl);
                if (altLabels.length === 0) {
                    console.log('%c[LabelPulse]%c   Nessun dato per %s — skip', style, styleDim, genre.name);
                    break;
                }
                allLabels.push(...altLabels);
            } else if (labels.length === 0) {
                break; // Non ci sono più pagine
            } else {
                allLabels.push(...labels);
            }
            
            await sleep(DELAY_MS);
        }

        genreResults[genre.name] = allLabels;
        totalLabels += allLabels.length;
        console.log(
            '%c[LabelPulse]%c   ✓ %s: %d label trovate',
            style, styleOk, genre.name, allLabels.length
        );
    }

    // ==================== COSTRUZIONE JSON LABELPULSE ====================
    
    console.log('%c[LabelPulse]%c Costruzione JSON...', style, styleDim);
    
    const labelMap = {};

    for (const [genreName, labels] of Object.entries(genreResults)) {
        for (const label of labels) {
            const name = label.name.toUpperCase().trim();
            if (!name) continue;
            
            if (!labelMap[name]) {
                labelMap[name] = {
                    id: 'lbl_' + name.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/_+$/, ''),
                    name: name,
                    genres: [],
                    rankByGenre: {},
                    pointsByGenre: {},
                    trending: false,
                };
            }
            if (!labelMap[name].genres.includes(genreName)) {
                labelMap[name].genres.push(genreName);
            }
            labelMap[name].rankByGenre[genreName] = label.rank;
            labelMap[name].pointsByGenre[genreName] = label.points;
        }
    }

    // Calcola trending
    for (const label of Object.values(labelMap)) {
        const ranks = Object.values(label.rankByGenre);
        const minRank = Math.min(...ranks);
        const totalPoints = Object.values(label.pointsByGenre).reduce((a, b) => a + b, 0);
        
        if (minRank <= 30 || totalPoints > 10000) {
            label.trending = true;
            label.trendingRankByGenre = {};
            label.trendingPointsByGenre = {};
            for (const [genre, rank] of Object.entries(label.rankByGenre)) {
                if (rank <= 50) {
                    label.trendingRankByGenre[genre] = rank;
                    label.trendingPointsByGenre[genre] = label.pointsByGenre[genre];
                }
            }
        }
    }

    // Risultato finale
    const output = {
        genres: GENRES.map(g => g.name),
        labels: Object.values(labelMap),
        _meta: {
            source: 'beatstats',
            scrapedAt: new Date().toISOString(),
            totalLabels: Object.keys(labelMap).length,
            totalGenres: GENRES.length,
            note: 'Importa questo file in LabelPulse usando Backup → Importa'
        }
    };

    // Download JSON
    const json = JSON.stringify(output, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `labelpulse_data_${new Date().toISOString().split('T')[0]}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    console.log('%c[LabelPulse]%c ============================================', style, style);
    console.log('%c[LabelPulse]%c ESTRAZIONE COMPLETATA!', style, styleOk);
    console.log('%c[LabelPulse]%c %d label estratte da %d generi', style, styleOk, Object.keys(labelMap).length, GENRES.length);
    console.log('%c[LabelPulse]%c File JSON scaricato!', style, styleOk);
    console.log('%c[LabelPulse]%c Ora importalo in LabelPulse: Backup → Importa', style, styleDim);
    console.log('%c[LabelPulse]%c ============================================', style, style);

    // Ritorna anche i dati in console per ispezione
    return output;
})();
