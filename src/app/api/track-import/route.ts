import { NextRequest, NextResponse } from "next/server";
import * as cheerio from "cheerio";

/**
 * 🔒 RP-016 — Universal Track Importer (fetch + cheerio, NO Playwright)
 *
 * Strategia:
 *   1. fetch HTTP dell'URL (server-side, no CORS)
 *   2. Parsing HTML con cheerio
 *   3. Estrazione metadati da:
 *      - og: meta tags (og:title, og:description, og:image)
 *      - JSON-LD structured data (schema.org MusicRecording/MusicAlbum)
 *      - title tag
 *      - <a> tags per URL store (Beatport, Spotify, Apple Music, ecc.)
 *      - regex su description per genre/label
 *
 * Se la pagina è protetta da Cloudflare (403) o è una SPA pura senza
 * metadati server-rendered, ritorna errore esplicito.
 *
 * NON usa Playwright. NON usa headless browser.
 */

// ==================== SOURCE DETECTION ====================

type SourceType =
  | "promolink"
  | "beatport_release"
  | "beatport_track"
  | "spotify"
  | "soundcloud"
  | "linktree"
  | "unknown";

interface SourceInfo {
  type: SourceType;
  label: string;
  supported: boolean;
}

function detectSource(url: URL): SourceInfo {
  const host = url.hostname.toLowerCase();
  const path = url.pathname.toLowerCase();

  if (host.includes("promolink.app")) {
    return { type: "promolink", label: "PromoLink", supported: true };
  }

  if (host.includes("beatport.com")) {
    if (path.includes("/release/")) {
      return { type: "beatport_release", label: "Beatport Release", supported: true };
    }
    if (path.includes("/track/")) {
      return { type: "beatport_track", label: "Beatport Track", supported: true };
    }
    return { type: "beatport_release", label: "Beatport", supported: true };
  }

  if (host.includes("open.spotify.com") || host.includes("spotify.com")) {
    return { type: "spotify", label: "Spotify", supported: true };
  }

  if (host.includes("soundcloud.com")) {
    return { type: "soundcloud", label: "SoundCloud", supported: true };
  }

  if (host.includes("linktr.ee")) {
    return { type: "linktree", label: "Linktree", supported: true };
  }

  return { type: "unknown", label: "Sconosciuta", supported: false };
}

// ==================== TYPES ====================

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
  source: string;
  httpStatus: number | null;
  htmlLength: number;
  hasOgTags: boolean;
  hasJsonLd: boolean;
  hasNextData: boolean;
  cloudflareBlocked: boolean;
  fetchError: string | null;
  timeout: boolean;
}

// ==================== EXTRACTOR (fetch + cheerio) ====================

async function extractWithFetch(
  url: string,
  sourceInfo: SourceInfo
): Promise<{ extracted: ExtractedMetadata; diagnostics: Diagnostics }> {
  const diagnostics: Diagnostics = {
    source: sourceInfo.label,
    httpStatus: null,
    htmlLength: 0,
    hasOgTags: false,
    hasJsonLd: false,
    hasNextData: false,
    cloudflareBlocked: false,
    fetchError: null,
    timeout: false,
  };

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 15000);

  let html: string;
  try {
    const res = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.9",
        "Accept-Encoding": "gzip, deflate, br",
        "Connection": "keep-alive",
        "Upgrade-Insecure-Requests": "1",
      },
      redirect: "follow",
      signal: controller.signal,
    });

    clearTimeout(timeoutId);
    diagnostics.httpStatus = res.status;
    html = await res.text();
    diagnostics.htmlLength = html.length;

    // Cloudflare detection
    if (res.status === 403 && html.includes("cloudflare")) {
      diagnostics.cloudflareBlocked = true;
    }
  } catch (err: any) {
    clearTimeout(timeoutId);
    diagnostics.fetchError = err.message;
    diagnostics.timeout = err.name === "AbortError";
    throw new Error(
      diagnostics.timeout
        ? "Timeout — la pagina non ha risposto entro 15 secondi"
        : `Errore fetch: ${err.message}`
    );
  }

  // Parse HTML with cheerio
  const $ = cheerio.load(html);

  const ogTags = $('meta[property^="og:"]');
  diagnostics.hasOgTags = ogTags.length > 0;

  const jsonLdScripts = $('script[type="application/ld+json"]');
  diagnostics.hasJsonLd = jsonLdScripts.length > 0;

  const nextData = $("#__NEXT_DATA__");
  diagnostics.hasNextData = nextData.length > 0;

  // ==================== EXTRACT METADATA ====================

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

  // --- og: tags ---
  const ogTitle = $('meta[property="og:title"]').attr("content") || null;
  const ogDescription = $('meta[property="og:description"]').attr("content") || null;
  const ogImage = $('meta[property="og:image"]').attr("content") || null;

  if (ogTitle) {
    const parts = ogTitle.split(" - ");
    if (parts.length >= 2) {
      extracted.artists = [parts[0].trim()];
      extracted.title = parts.slice(1).join(" - ").trim();
    } else {
      extracted.title = ogTitle.trim();
    }
  }

  if (ogImage) extracted.cover = ogImage;

  // --- JSON-LD ---
  const jsonLdItems: any[] = [];
  jsonLdScripts.each((_, script) => {
    try {
      const raw = $(script).html();
      if (!raw) return;
      const data = JSON.parse(raw);
      const items = Array.isArray(data) ? data : [data];
      jsonLdItems.push(...items);
    } catch {}
  });

  for (const item of jsonLdItems) {
    if (!item || typeof item !== "object") continue;
    if (item.name && !extracted.title) extracted.title = item.name;
    if (item.byArtist) {
      if (typeof item.byArtist === "string" && extracted.artists.length === 0) {
        extracted.artists = [item.byArtist];
      } else if (item.byArtist.name && extracted.artists.length === 0) {
        extracted.artists = [item.byArtist.name];
      } else if (Array.isArray(item.byArtist) && extracted.artists.length === 0) {
        extracted.artists = item.byArtist.map((a: any) => a?.name).filter(Boolean);
      }
    }
    if (item.publisher?.name && !extracted.label) extracted.label = item.publisher.name;
    if (item.recordLabel?.name && !extracted.label) extracted.label = item.recordLabel.name;
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

  // --- title tag fallback ---
  if (!extracted.title) {
    const titleTag = $("title").text().trim();
    if (titleTag) {
      const cleaned = titleTag.replace(/\s*[|\-–—]\s*(PromoLink|Beatport|Spotify|SoundCloud|Linktree)\s*$/i, "").trim();
      if (cleaned.includes(" - ")) {
        const parts = cleaned.split(" - ");
        if (extracted.artists.length === 0) extracted.artists = [parts[0].trim()];
        extracted.title = parts.slice(1).join(" - ").trim();
      } else if (cleaned) {
        extracted.title = cleaned;
      }
    }
  }

  // --- __NEXT_DATA__ (per SPA Next.js come PromoLink) ---
  if (diagnostics.hasNextData) {
    try {
      const nextDataRaw = nextData.html();
      if (nextDataRaw) {
        const nextDataObj = JSON.parse(nextDataRaw);
        const pageProps = nextDataObj?.props?.pageProps;
        if (pageProps) {
          const releaseData = pageProps.release || pageProps.track || pageProps.campaign ||
                             pageProps.data?.release || pageProps.data?.track || pageProps.data;
          if (releaseData && typeof releaseData === "object") {
            if (releaseData.title && !extracted.title) extracted.title = releaseData.title;
            if (releaseData.artist && extracted.artists.length === 0) {
              extracted.artists = Array.isArray(releaseData.artist) ? releaseData.artist : [releaseData.artist];
            }
            if (releaseData.label && !extracted.label) extracted.label = releaseData.label;
            if (releaseData.genre && !extracted.genre) extracted.genre = releaseData.genre;
            if (releaseData.coverArt && !extracted.cover) extracted.cover = releaseData.coverArt;
          }
        }
      }
    } catch {}
  }

  // --- Scan <a> tags for store URLs ---
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
  const parsedUrl = new URL(url);

  $("a[href]").each((_, el) => {
    const href = $(el).attr("href");
    if (!href) return;
    let absoluteUrl: string;
    try {
      absoluteUrl = new URL(href, parsedUrl.origin).href;
    } catch { return; }

    for (const store of storePatterns) {
      if (store.pattern.test(absoluteUrl) && !foundPlatforms.has(store.platform)) {
        foundPlatforms.add(store.platform);
        (extracted[store.field] as string) = absoluteUrl;
      }
    }
    for (const store of otherStorePatterns) {
      if (store.pattern.test(absoluteUrl) && !foundPlatforms.has(store.platform)) {
        foundPlatforms.add(store.platform);
        extracted.otherStores.push({ platform: store.platform, url: absoluteUrl });
      }
    }
  });

  // --- genre/label from description ---
  const descSource = ogDescription || $('meta[name="description"]').attr("content") || "";
  if (descSource) {
    if (!extracted.genre) {
      const genreMatch = descSource.match(/(?:genre|genere)\s*[:\-]\s*([^\n,;]+)/i);
      if (genreMatch) extracted.genre = genreMatch[1].trim();
    }
    if (!extracted.label) {
      const labelMatch = descSource.match(/(?:label|etichetta)\s*[:\-]\s*([^\n,;]+)/i);
      if (labelMatch) extracted.label = labelMatch[1].trim();
    }
  }

  // --- genre regex fallback ---
  if (!extracted.genre) {
    const genreMatch = descSource.match(
      /(Techno|House|Trance|Progressive|Deep|Tech|Melodic|Minimal|Electro|Dubstep|Drum.?n.?Bass|Ambient|Breakbeat|Hardcore|Psytrance|Garage|Funky|Soulful|Afro|Amapiano|Downtempo|Indie Dance|Nu Disco|Bass|Hard)[^\n]*?(?:\([^)]*\))?/i
    );
    if (genreMatch) extracted.genre = genreMatch[0].trim();
  }

  return { extracted, diagnostics };
}

// ==================== ROUTE HANDLER ====================

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const url: string = body.url;

  if (!url) {
    return NextResponse.json({ error: "URL required" }, { status: 400 });
  }

  let parsedUrl: URL;
  try {
    parsedUrl = new URL(url);
  } catch {
    return NextResponse.json({ error: "Formato URL non valido", url }, { status: 400 });
  }

  const sourceInfo = detectSource(parsedUrl);

  if (!sourceInfo.supported) {
    return NextResponse.json({
      error: "Formato non ancora supportato",
      url,
      hostname: parsedUrl.hostname,
      detectedSource: sourceInfo.label,
    }, { status: 400 });
  }

  try {
    const { extracted, diagnostics } = await extractWithFetch(url, sourceInfo);

    // Cloudflare block detection (Beatport)
    if (diagnostics.cloudflareBlocked) {
      return NextResponse.json({
        error: "Beatport blocca l'accesso automatico (Cloudflare bot detection)",
        reason: "Beatport utilizza Cloudflare per bloccare richieste server-side. Non è possibile estrarre metadati automaticamente da URL Beatport con fetch HTTP.",
        url,
        source: sourceInfo.label,
        sourceType: sourceInfo.type,
        diagnostics,
        possibleReason: "Beatport richiede un browser reale per superare Cloudflare. Per ora incolla manualmente i metadati nella schermata di revisione.",
      }, { status: 403 });
    }

    // SPA detection — if HTML is very short and no og: tags, likely a SPA
    if (diagnostics.htmlLength < 3000 && !diagnostics.hasOgTags && !diagnostics.hasJsonLd) {
      return NextResponse.json({
        error: "La pagina è una SPA (Single Page Application) senza metadati server-rendered",
        reason: "Il contenuto viene renderizzato lato client via JavaScript. Un semplice fetch HTTP non può estrarre i metadati.",
        url,
        source: sourceInfo.label,
        sourceType: sourceInfo.type,
        diagnostics,
        possibleReason: "Per questa sorgente serve un headless browser (Playwright). Per ora incolla manualmente i metadati nella schermata di revisione.",
      }, { status: 422 });
      }

    return NextResponse.json({
      success: true,
      url,
      source: sourceInfo.label,
      sourceType: sourceInfo.type,
      fetchedAt: new Date().toISOString(),
      diagnostics,
      extracted,
    });
  } catch (err: any) {
    return NextResponse.json({
      error: err.message,
      url,
      source: sourceInfo.label,
      sourceType: sourceInfo.type,
      diagnostics: {
        source: sourceInfo.label,
        httpStatus: null,
        htmlLength: 0,
        hasOgTags: false,
        hasJsonLd: false,
        hasNextData: false,
        cloudflareBlocked: false,
        fetchError: err.message,
        timeout: err.message.includes("Timeout"),
      },
    }, { status: 500 });
  }
}
