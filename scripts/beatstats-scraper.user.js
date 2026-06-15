// ==UserScript==
// @name         LabelPulse Data Updater — BeatStats Scraper
// @namespace    labelpulse
// @version      1.0
// @description  Estrae i dati delle classifiche label da BeatStats e genera un JSON per LabelPulse
// @author       LabelPulse
// @match        https://beatstats.com/*
// @match        https://www.beatstats.com/*
// @grant        none
// @run-at       document-idle
// ==/UserScript==

(function() {
    'use strict';

    // ==================== CONFIGURAZIONE ====================
    const DELAY_BETWEEN_PAGES = 2000; // ms tra una pagina e l'altra
    const MAX_PAGES_PER_GENRE = 5;    // max 5 pagine = top 250 label per genere

    // Generi BeatStats → mappatura ai nomi LabelPulse
    const GENRE_MAP = {
        '140-deep-dubstep-grime': '140 / Deep Dubstep / Grime',
        'afro-house': 'Afro House',
        'amapiano': 'Amapiano',
        'ambient-experimental': 'Ambient / Experimental',
        'bass-club': 'Bass / Club',
        'bass-house': 'Bass House',
        'brazilian-funk': 'Brazilian Funk',
        'breaks-breakbeat-uk-bass': 'Breaks / Breakbeat / Uk Bass',
        'dance-pop': 'Dance / Pop',
        'deep-house': 'Deep House',
        'downtempo': 'Downtempo',
        'drum-and-bass': 'Drum & Bass',
        'dubstep': 'Dubstep',
        'electro-classic-detroit-modern': 'Electro Classic / Detroit / Modern',
        'electronica': 'Electronica',
        'funky-house': 'Funky House',
        'hard-dance-hardcore-neo-rave': 'Hard Dance / Hardcore / Neo Rave',
        'hard-techno': 'Hard Techno',
        'house': 'House',
        'indie-dance': 'Indie Dance',
        'jackin-house': 'Jackin House',
        'mainstage': 'Mainstage',
        'melodic-house-techno': 'Melodic House & Techno',
        'minimal-deep-tech': 'Minimal / Deep Tech',
        'nu-disco-disco': 'Nu Disco / Disco',
        'organic-house': 'Organic House',
        'progressive-house': 'Progressive House',
        'psy-trance': 'Psy-Trance',
        'tech-house': 'Tech House',
        'techno-peak-time-driving': 'Techno Peak Time / Driving',
        'techno-raw-deep-hypnotic': 'Techno Raw / Deep / Hypnotic',
        'trance-main-floor': 'Trance Main Floor',
        'trap-future-bass': 'Trap / Future Bass',
        'uk-garage-bassline': 'Uk Garage / Bassline',
    };

    const GENRE_SLUGS = Object.keys(GENRE_MAP);

    // ==================== UI ====================

    // Crea il pannello flottante
    const panel = document.createElement('div');
    panel.id = 'lp-scraper-panel';
    panel.innerHTML = `
        <div style="
            position: fixed; bottom: 20px; right: 20px; z-index: 99999;
            background: #1a1a2e; color: #e0e0e0; border: 2px solid #8b5cf6;
            border-radius: 12px; padding: 16px; width: 340px;
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
            font-size: 13px; box-shadow: 0 8px 32px rgba(0,0,0,0.5);
        ">
            <div style="display:flex; align-items:center; gap:8px; margin-bottom:12px;">
                <div style="width:8px;height:8px;background:#8b5cf6;border-radius:50%;"></div>
                <b style="color:#8b5cf6; font-size:14px;">LabelPulse Data Updater</b>
            </div>
            <div id="lp-status" style="margin-bottom:10px; color:#a0a0a0; font-size:12px;">
                Pronto per estrarre i dati da BeatStats
            </div>
            <div id="lp-progress" style="display:none; margin-bottom:10px;">
                <div style="background:#2a2a3e; border-radius:6px; height:6px; overflow:hidden;">
                    <div id="lp-progress-bar" style="background:linear-gradient(90deg,#8b5cf6,#06b6d4); height:100%; width:0%; transition:width 0.3s;"></div>
                </div>
                <div id="lp-progress-text" style="font-size:11px; color:#666; margin-top:4px;"></div>
            </div>
            <div style="display:flex; gap:8px;">
                <button id="lp-start" style="
                    flex:1; padding:8px 16px; background:linear-gradient(135deg,#8b5cf6,#06b6d4);
                    color:white; border:none; border-radius:8px; cursor:pointer; font-size:12px; font-weight:600;
                ">Avvia Estrazione</button>
                <button id="lp-close" style="
                    padding:8px 12px; background:#2a2a3e; color:#888; border:1px solid #333;
                    border-radius:8px; cursor:pointer; font-size:12px;
                ">X</button>
            </div>
        </div>
    `;
    document.body.appendChild(panel);

    // Elementi UI
    const statusEl = document.getElementById('lp-status');
    const progressEl = document.getElementById('lp-progress');
    const progressBar = document.getElementById('lp-progress-bar');
    const progressText = document.getElementById('lp-progress-text');
    const startBtn = document.getElementById('lp-start');
    const closeBtn = document.getElementById('lp-close');

    closeBtn.onclick = () => panel.remove();

    // ==================== SCRAPING LOGIC ====================

    function sleep(ms) {
        return new Promise(r => setTimeout(r, ms));
    }

    /**
     * Estrae le label dalla tabella della pagina BeatStats corrente
     */
    function extractLabelsFromPage() {
        const labels = [];
        
        // BeatStats usa tabelle con righe di label
        // Selettore principale: righe della tabella classifica
        const rows = document.querySelectorAll('table tbody tr, .ranking-table tr, [class*="label-row"], .table-row');
        
        rows.forEach((row, index) => {
            try {
                const cells = row.querySelectorAll('td');
                if (cells.length < 2) return;
                
                // Struttura tipica BeatStats: Rank | Label Name | Points | Change
                const rankText = cells[0]?.textContent?.trim();
                const nameText = cells[1]?.textContent?.trim();
                const pointsText = cells[2]?.textContent?.trim();
                
                const rank = parseInt(rankText) || (index + 1);
                const name = nameText;
                const points = parseInt(pointsText?.replace(/[^0-9]/g, '')) || 0;
                
                if (name && name.length > 0) {
                    labels.push({ rank, name, points });
                }
            } catch(e) {
                // Skip malformed rows
            }
        });

        // Fallback: prova a cercare elementi lista/card se la tabella non ha funzionato
        if (labels.length === 0) {
            const items = document.querySelectorAll('[class*="rank"], [class*="label-item"], .list-item');
            items.forEach((item, index) => {
                const text = item.textContent?.trim();
                if (text && text.length > 0 && text.length < 200) {
                    const nameMatch = text.match(/\d+\.\s*(.+?)(?:\s+\d)/);
                    const name = nameMatch ? nameMatch[1].trim() : text.substring(text.indexOf('.') + 1).trim();
                    const rank = index + 1;
                    const pointsMatch = text.match(/(\d{3,})/);
                    const points = pointsMatch ? parseInt(pointsMatch[1]) : 0;
                    if (name) labels.push({ rank, name, points });
                }
            });
        }

        return labels;
    }

    /**
     * Fetch di una pagina BeatStats e parsing dell'HTML
     */
    async function fetchBeatStatsPage(url) {
        const response = await fetch(url);
        const html = await response.text();
        const parser = new DOMParser();
        const doc = parser.parseFromString(html, 'text/html');
        
        const labels = [];
        const rows = doc.querySelectorAll('table tbody tr, .ranking-table tr, [class*="label-row"]');
        
        rows.forEach((row, index) => {
            try {
                const cells = row.querySelectorAll('td');
                if (cells.length < 2) return;
                
                const rankText = cells[0]?.textContent?.trim();
                const nameText = cells[1]?.textContent?.trim();
                const pointsText = cells[2]?.textContent?.trim();
                
                const rank = parseInt(rankText) || (index + 1);
                const name = nameText;
                const points = parseInt(pointsText?.replace(/[^0-9]/g, '')) || 0;
                
                if (name && name.length > 0) {
                    labels.push({ rank, name, points });
                }
            } catch(e) {}
        });

        return labels;
    }

    /**
     * Scrape tutte le pagine per un genere
     */
    async function scrapeGenre(slug, genreName) {
        const allLabels = [];
        
        for (let page = 1; page <= MAX_PAGES_PER_GENRE; page++) {
            const url = `https://beatstats.com/label-ranking/${slug}${page > 1 ? '/' + page : ''}`;
            statusEl.textContent = `Scaricando ${genreName} — pagina ${page}...`;
            
            try {
                const labels = await fetchBeatStatsPage(url);
                if (labels.length === 0) break; // Non ci sono più pagine
                allLabels.push(...labels);
            } catch(e) {
                console.warn(`Errore su ${url}:`, e);
                break;
            }
            
            await sleep(DELAY_BETWEEN_PAGES);
        }
        
        return allLabels;
    }

    /**
     * Processo principale di estrazione
     */
    async function runExtraction() {
        startBtn.disabled = true;
        startBtn.textContent = 'Estrazione in corso...';
        progressEl.style.display = 'block';

        const genreResults = {};
        let processed = 0;

        for (const slug of GENRE_SLUGS) {
            const genreName = GENRE_MAP[slug];
            processed++;
            const pct = Math.round((processed / GENRE_SLUGS.length) * 100);
            progressBar.style.width = pct + '%';
            progressText.textContent = `${processed}/${GENRE_SLUGS.length} generi — ${genreName}`;

            const labels = await scrapeGenre(slug, genreName);
            genreResults[genreName] = labels;
            
            console.log(`[LabelPulse] ${genreName}: ${labels.length} labels estratte`);
        }

        // ==================== COSTRUISCI JSON PER LABELPULSE ====================
        statusEl.textContent = 'Costruendo il JSON per LabelPulse...';

        const labelMap = {}; // name → label object

        for (const [genreName, labels] of Object.entries(genreResults)) {
            for (const label of labels) {
                const name = label.name.toUpperCase().trim();
                if (!labelMap[name]) {
                    labelMap[name] = {
                        id: 'lbl_' + name.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/_+$/,''),
                        name: name,
                        genres: [],
                        rankByGenre: {},
                        pointsByGenre: {},
                        trending: false,
                    };
                }
                labelMap[name].genres.push(genreName);
                labelMap[name].rankByGenre[genreName] = label.rank;
                labelMap[name].pointsByGenre[genreName] = label.points;
            }
        }

        // Determina trending (label che hanno punti significativi in posizioni alte)
        for (const label of Object.values(labelMap)) {
            const ranks = Object.values(label.rankByGenre);
            const hasHighRank = ranks.some(r => r <= 20);
            const totalPoints = Object.values(label.pointsByGenre).reduce((a,b) => a+b, 0);
            label.trending = hasHighRank && totalPoints > 5000;

            if (label.trending) {
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

        // Genera la lista dei generi
        const genres = [...new Set(Object.values(genreResults).flatMap(l => l.map(() => '')))];
        // Usa i nomi generi dal GENRE_MAP
        const genreList = Object.values(GENRE_MAP);

        const output = {
            genres: genreList,
            labels: Object.values(labelMap),
            _meta: {
                source: 'beatstats',
                scrapedAt: new Date().toISOString(),
                totalLabels: Object.keys(labelMap).length,
                totalGenres: genreList.length,
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

        // Aggiorna UI
        statusEl.innerHTML = `
            <span style="color:#22c55e; font-weight:600;">Fatto!</span><br>
            <span style="font-size:11px; color:#888;">
                ${Object.keys(labelMap).length} label estratte da ${genreList.length} generi<br>
                File JSON scaricato — importalo in LabelPulse!
            </span>
        `;
        startBtn.disabled = false;
        startBtn.textContent = 'Ri-estratti dati';
    }

    startBtn.onclick = runExtraction;

    // Mostra un avviso se siamo su una pagina BeatStats
    console.log('[LabelPulse Scraper] Pronto! Clicca "Avvia Estrazione" nel pannello in basso a destra.');
})();
