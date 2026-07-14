import { NextRequest, NextResponse } from "next/server";
import * as cheerio from "cheerio";

/**
 * 🔒 RP-009 — PromoLink Importer
 *
 * Scarica una pagina PromoLink, estrae TUTTI i metadati disponibili,
 * e li ritorna come JSON.
 *
 * NON crea la Track. NON apre il Promotion Workspace.
 * Solo estrazione + diagnostica.
 *
 * Se l'estrazione fallisce, ritorna diagnostica completa:
 * - pagina caricata? (HTTP status, content-type, HTML length)
 * - JavaScript? (SPA detection)
 * - autenticazione? (redirect a login?)
 * - contenuto dinamico? (__NEXT_DATA__, script count)
 * - parser non compatibile? (cosa è stato trovato vs cosa manca)
 */

const PROMOLINK_DOMAIN = "promolink.app";

interface ExtractedMetadata {
  title: string | null;
  artists: string[];
  label: string | null;
  genre: string | null;
  cover: string | null;
  beatportUrl: string | null;
  spotifyUrl: string | null;
  appleMusicUrl: string | null;
  youtubeUrl: string | null;
  soundcloudUrl: string | null;
  otherStores: { platform: string; url: string }[];
}

interface Diagnostics {
  httpStatus: number | null;
  contentType: string | null;
  htmlLength: number;
  hasJsonLd: boolean;
  jsonLdCount: number;
  hasOgTags: boolean;
  ogTagCount: number;
  hasNextData: boolean;
  scriptCount: number;
  linkCount: number;
  anchorCount: number;
  looksLikeSpa: boolean;
  spaReason: string | null;
  fetchError: string | null;
  redirectedTo: string | null;
  timeout: boolean;
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const url: string = body.url;

  if (!url) {
    return NextResponse.json({ error: "URL required" }, { status: 400 });
  }

  // 1. Validate URL format
  let parsedUrl: URL;
  try {
    parsedUrl = new URL(url);
  } catch {
    return NextResponse.json({
      error: "Invalid URL format",
      url,
    }, { status: 400 });
  }

  // 2. Validate it's a PromoLink URL
  if (!parsedUrl.hostname.includes(PROMOLINK_DOMAIN)) {
    return NextResponse.json({
      error: "Not a PromoLink URL",
      url,
      hostname: parsedUrl.hostname,
      expected: `*${PROMOLINK_DOMAIN}*`,
    }, { status: 400 });
  }

  // 3. Fetch the page (server-side, no CORS)
  const diagnostics: Diagnostics = {
    httpStatus: null,
    contentType: null,
    htmlLength: 0,
    hasJsonLd: false,
    jsonLdCount: 0,
    hasOgTags: false,
    ogTagCount: 0,
    hasNextData: false,
    scriptCount: 0,
    linkCount: 0,
    anchorCount: 0,
    looksLikeSpa: false,
    spaReason: null,
    fetchError: null,
    redirectedTo: null,
    timeout: false,
  };

  let html: string;
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 15000);

  try {
    const res = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.9,it;q=0.8",
        "Accept-Encoding": "gzip, deflate, br",
        "Connection": "keep-alive",
        "Upgrade-Insecure-Requests": "1",
      },
      redirect: "follow",
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    diagnostics.httpStatus = res.status;
    diagnostics.contentType = res.headers.get("content-type");

    // Check for redirect
    if (res.redirected) {
      diagnostics.redirectedTo = res.url;
    }

    html = await res.text();
    diagnostics.htmlLength = html.length;

    if (res.status !== 200) {
      return NextResponse.json({
        error: `HTTP ${res.status} fetching PromoLink`,
        url,
        diagnostics,
        possibleReason: res.status === 403
          ? "Forbidden — PromoLink potrebbe bloccare richieste server-side (bot detection)"
          : res.status === 404
            ? "Not Found — la traccia potrebbe non esistere o essere stata rimossa"
            : res.status === 401
              ? "Unauthorized — la traccia potrebbe richiedere autenticazione"
              : "Errore HTTP sconosciuto",
      }, { status: 502 });
    }
  } catch (err: any) {
    clearTimeout(timeoutId);
    diagnostics.fetchError = err.message;
    diagnostics.timeout = err.name === "AbortError";

    return NextResponse.json({
      error: diagnostics.timeout ? "Fetch timeout (15s)" : "Fetch failed",
      reason: err.message,
      url,
      diagnostics,
      possibleReason: diagnostics.timeout
        ? "Il server PromoLink non ha risposto entro 15 secondi. Possibile sovraccarico o blocco."
        : err.message.includes("ENOTFOUND")
          ? "DNS non risolto — il dominio PromoLink non è raggiungibile dal server."
          : err.message.includes("ECONNREFUSED")
            ? "Connessione rifiutata — il server PromoLink ha rifiutato la connessione."
            : "Errore di rete sconosciuto.",
    }, { status: 500 });
  }

  // 4. Parse HTML with cheerio
  const $ = cheerio.load(html);

  // Collect diagnostics about the HTML structure
  diagnostics.scriptCount = $("script").length;
  diagnostics.linkCount = $("link").length;
  diagnostics.anchorCount = $("a[href]").length;

  const ogTags = $('meta[property^="og:"]');
  diagnostics.hasOgTags = ogTags.length > 0;
  diagnostics.ogTagCount = ogTags.length;

  const jsonLdScripts = $('script[type="application/ld+json"]');
  diagnostics.hasJsonLd = jsonLdScripts.length > 0;
  diagnostics.jsonLdCount = jsonLdScripts.length;

  const nextData = $("#__NEXT_DATA__");
  diagnostics.hasNextData = nextData.length > 0;

  // SPA detection
  if (diagnostics.htmlLength < 5000 && diagnostics.scriptCount > 3 && !diagnostics.hasOgTags && !diagnostics.hasJsonLd) {
    diagnostics.looksLikeSpa = true;
    diagnostics.spaReason = "HTML molto breve (<5KB) + molti script + nessun og: tag + nessun JSON-LD. Il contenuto è probabilmente renderizzato lato client via JavaScript. Un semplice fetch HTTP non può estrarre i metadati — serve un headless browser (Playwright/Puppeteer).";
  } else if (diagnostics.htmlLength < 2000) {
    diagnostics.looksLikeSpa = true;
    diagnostics.spaReason = "HTML estremamente breve (<2KB). Probabile pagina SPA con rendering client-side.";
  }

  // 5. Extract metadata
  const extracted: ExtractedMetadata = {
    title: null,
    artists: [],
    label: null,
    genre: null,
    cover: null,
    beatportUrl: null,
    spotifyUrl: null,
    appleMusicUrl: null,
    youtubeUrl: null,
    soundcloudUrl: null,
    otherStores: [],
  };

  // 5a. Open Graph tags
  const ogTitle = $('meta[property="og:title"]').attr("content") || null;
  const ogDescription = $('meta[property="og:description"]').attr("content") || null;
  const ogImage = $('meta[property="og:image"]').attr("content") || null;
  const ogUrl = $('meta[property="og:url"]').attr("content") || null;

  if (ogTitle) {
    // Often "Artist - Title" format
    const parts = ogTitle.split(" - ");
    if (parts.length >= 2) {
      extracted.artists = [parts[0].trim()];
      extracted.title = parts.slice(1).join(" - ").trim();
    } else {
      extracted.title = ogTitle.trim();
    }
  }

  if (ogImage) {
    extracted.cover = ogImage;
  }

  // 5b. JSON-LD structured data
  const jsonLdItems: any[] = [];
  jsonLdScripts.each((_, script) => {
    try {
      const raw = $(script).html();
      if (!raw) return;
      const data = JSON.parse(raw);
      const items = Array.isArray(data) ? data : [data];
      jsonLdItems.push(...items);
    } catch {
      // Invalid JSON-LD
    }
  });

  for (const item of jsonLdItems) {
    if (!item || typeof item !== "object") continue;

    const type = item["@type"];
    const isMusicType = typeof type === "string" && (type.includes("Music") || type.includes("Album"));

    if (isMusicType || item.name || item.byArtist) {
      if (item.name && !extracted.title) {
        extracted.title = item.name;
      }
      if (item.byArtist) {
        if (typeof item.byArtist === "string") {
          if (extracted.artists.length === 0) extracted.artists = [item.byArtist];
        } else if (item.byArtist.name) {
          if (extracted.artists.length === 0) extracted.artists = [item.byArtist.name];
        } else if (Array.isArray(item.byArtist)) {
          const names = item.byArtist.map((a: any) => a?.name).filter(Boolean);
          if (extracted.artists.length === 0 && names.length > 0) extracted.artists = names;
        }
      }
      if (item.publisher?.name && !extracted.label) {
        extracted.label = item.publisher.name;
      }
      if (item.recordLabel?.name && !extracted.label) {
        extracted.label = item.recordLabel.name;
      }
      if (item.recordLabel && typeof item.recordLabel === "string" && !extracted.label) {
        extracted.label = item.recordLabel;
      }
      if (item.genre && !extracted.genre) {
        extracted.genre = Array.isArray(item.genre) ? item.genre[0] : item.genre;
      }
      if (item.image && !extracted.cover) {
        extracted.cover = Array.isArray(item.image) ? item.image[0] : item.image;
      }
    }
  }

  // 5c. Title tag fallback
  if (!extracted.title) {
    const titleTag = $("title").text().trim();
    if (titleTag) {
      // Remove common suffixes like " | PromoLink"
      const cleaned = titleTag.replace(/\s*[|\-–—]\s*PromoLink\s*$/i, "").trim();
      if (cleaned) {
        const parts = cleaned.split(" - ");
        if (parts.length >= 2 && extracted.artists.length === 0) {
          extracted.artists = [parts[0].trim()];
          extracted.title = parts.slice(1).join(" - ").trim();
        } else {
          extracted.title = cleaned;
        }
      }
    }
  }

  // 5d. Try to extract from __NEXT_DATA__ (if PromoLink is a Next.js app)
  if (diagnostics.hasNextData) {
    try {
      const nextDataRaw = nextData.html();
      if (nextDataRaw) {
        const nextDataObj = JSON.parse(nextDataRaw);
        const pageProps = nextDataObj?.props?.pageProps;

        if (pageProps) {
          // Try common property names for release data
          const releaseData = pageProps.release || pageProps.track || pageProps.campaign ||
                             pageProps.data?.release || pageProps.data?.track ||
                             pageProps.data;

          if (releaseData && typeof releaseData === "object") {
            if (releaseData.title && !extracted.title) extracted.title = releaseData.title;
            if (releaseData.name && !extracted.title) extracted.title = releaseData.name;
            if (releaseData.artist && extracted.artists.length === 0) {
              extracted.artists = Array.isArray(releaseData.artist) ? releaseData.artist : [releaseData.artist];
            }
            if (releaseData.artists && extracted.artists.length === 0) {
              extracted.artists = Array.isArray(releaseData.artists) ? releaseData.artists : [releaseData.artists];
            }
            if (releaseData.label && !extracted.label) extracted.label = releaseData.label;
            if (releaseData.genre && !extracted.genre) extracted.genre = releaseData.genre;
            if (releaseData.coverArt && !extracted.cover) extracted.cover = releaseData.coverArt;
            if (releaseData.coverImage && !extracted.cover) extracted.cover = releaseData.coverImage;
            if (releaseData.image && !extracted.cover) extracted.cover = releaseData.image;

            // Store URLs from __NEXT_DATA__
            const links = releaseData.links || releaseData.urls || releaseData.stores;
            if (links && typeof links === "object") {
              for (const [key, value] of Object.entries(links)) {
                const v = String(value);
                if (/beatport\.com/i.test(v) && !extracted.beatportUrl) extracted.beatportUrl = v;
                if (/open\.spotify\.com/i.test(v) && !extracted.spotifyUrl) extracted.spotifyUrl = v;
                if (/music\.apple\.com|itunes\.apple\.com/i.test(v) && !extracted.appleMusicUrl) extracted.appleMusicUrl = v;
                if (/youtube\.com|youtu\.be/i.test(v) && !extracted.youtubeUrl) extracted.youtubeUrl = v;
                if (/soundcloud\.com/i.test(v) && !extracted.soundcloudUrl) extracted.soundcloudUrl = v;
              }
            }
          }
        }
      }
    } catch {
      // __NEXT_DATA__ parse failed
    }
  }

  // 5e. Scan all <a> tags for store URLs
  const storePatterns: { platform: string; pattern: RegExp; field: keyof ExtractedMetadata }[] = [
    { platform: "Beatport", pattern: /beatport\.com/i, field: "beatportUrl" },
    { platform: "Spotify", pattern: /open\.spotify\.com/i, field: "spotifyUrl" },
    { platform: "Apple Music", pattern: /music\.apple\.com|itunes\.apple\.com/i, field: "appleMusicUrl" },
    { platform: "YouTube", pattern: /youtube\.com|youtu\.be/i, field: "youtubeUrl" },
    { platform: "SoundCloud", pattern: /soundcloud\.com/i, field: "soundcloudUrl" },
  ];

  const otherStorePatterns = [
    { platform: "Deezer", pattern: /deezer\.com/i },
    { platform: "Tidal", pattern: /tidal\.com/i },
    { platform: "Bandcamp", pattern: /bandcamp\.com/i },
    { platform: "Amazon Music", pattern: /music\.amazon\./i },
  ];

  const foundPlatforms = new Set<string>();

  $("a[href]").each((_, el) => {
    const href = $(el).attr("href");
    if (!href) return;

    let absoluteUrl: string;
    try {
      absoluteUrl = new URL(href, parsedUrl.origin).href;
    } catch {
      return;
    }

    // Check known stores
    for (const store of storePatterns) {
      if (store.pattern.test(absoluteUrl) && !foundPlatforms.has(store.platform)) {
        foundPlatforms.add(store.platform);
        (extracted[store.field] as string) = absoluteUrl;
      }
    }

    // Check other stores
    for (const store of otherStorePatterns) {
      if (store.pattern.test(absoluteUrl) && !foundPlatforms.has(store.platform)) {
        foundPlatforms.add(store.platform);
        extracted.otherStores.push({ platform: store.platform, url: absoluteUrl });
      }
    }
  });

  // 5f. Try to extract genre/label from description
  if (ogDescription) {
    if (!extracted.genre) {
      const genreMatch = ogDescription.match(/(?:genre|genere)\s*[:\-]\s*([^\n,;]+)/i);
      if (genreMatch) extracted.genre = genreMatch[1].trim();
    }
    if (!extracted.label) {
      const labelMatch = ogDescription.match(/(?:label|etichetta)\s*[:\-]\s*([^\n,;]+)/i);
      if (labelMatch) extracted.label = labelMatch[1].trim();
    }
  }

  // 5g. Meta description fallback
  if (!extracted.label || !extracted.genre) {
    const metaDesc = $('meta[name="description"]').attr("content");
    if (metaDesc) {
      if (!extracted.genre) {
        const genreMatch = metaDesc.match(/(?:genre|genere)\s*[:\-]\s*([^\n,;]+)/i);
        if (genreMatch) extracted.genre = genreMatch[1].trim();
      }
      if (!extracted.label) {
        const labelMatch = metaDesc.match(/(?:label|etichetta)\s*[:\-]\s*([^\n,;]+)/i);
        if (labelMatch) extracted.label = labelMatch[1].trim();
      }
    }
  }

  // 6. Build response
  const response = {
    success: !diagnostics.looksLikeSpa,
    url,
    fetchedAt: new Date().toISOString(),
    diagnostics,
    extracted,
    raw: {
      ogTitle,
      ogDescription,
      ogImage,
      ogUrl,
      titleTag: $("title").text().trim() || null,
      jsonLdCount: diagnostics.jsonLdCount,
      hasNextData: diagnostics.hasNextData,
    },
    // If SPA detected, explain what went wrong
    ...(diagnostics.looksLikeSpa && {
      error: "Contenuto dinamico — la pagina PromoLink è renderizzata lato client via JavaScript",
      explanation: diagnostics.spaReason,
      possibleSolutions: [
        "Usare un headless browser (Playwright/Puppeteer) per eseguire il JavaScript e ottenere il DOM renderizzato",
        "Verificare se PromoLink espone un'API pubblica (JSON) che restituisce i metadati della traccia",
        "Contattare PromoLink per un'API ufficiale di integrazione",
      ],
    }),
  };

  return NextResponse.json(response);
}
