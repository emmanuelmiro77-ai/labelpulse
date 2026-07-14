import { NextRequest, NextResponse } from "next/server";
import { chromium } from "playwright";

/**
 * 🔒 RP-009 + RP-011 — PromoLink Importer con Playwright
 *
 * PromoLink è una SPA Next.js: l'HTML iniziale contiene solo un loader.
 * I metadati vengono renderizzati lato client via JavaScript.
 * Un semplice fetch HTTP non può estrarli — serve un headless browser.
 *
 * Playwright carica la pagina, esegue il JS, aspetta il rendering,
 * poi estrae:
 *   - og: tags (title, description, image)
 *   - title tag
 *   - link agli store (Beatport, Spotify, Apple Music, YouTube, SoundCloud, ecc.)
 *   - label e genere dal testo visibile della pagina
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
  htmlLength: number;
  renderedTextLength: number;
  storeLinksFound: number;
  fetchError: string | null;
  timeout: boolean;
}

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
    return NextResponse.json({ error: "Invalid URL format", url }, { status: 400 });
  }

  if (!parsedUrl.hostname.includes(PROMOLINK_DOMAIN)) {
    return NextResponse.json({
      error: "Not a PromoLink URL",
      url,
      hostname: parsedUrl.hostname,
      expected: `*${PROMOLINK_DOMAIN}*`,
    }, { status: 400 });
  }

  const diagnostics: Diagnostics = {
    httpStatus: null,
    htmlLength: 0,
    renderedTextLength: 0,
    storeLinksFound: 0,
    fetchError: null,
    timeout: false,
  };

  let browser;
  try {
    browser = await chromium.launch({
      headless: true,
      args: ["--no-sandbox", "--disable-setuid-sandbox"],
    });
    const page = await browser.newPage({
      userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    });

    // Navigate and wait for network to be idle (SPA loaded)
    const response = await page.goto(url, { waitUntil: "networkidle", timeout: 20000 });
    diagnostics.httpStatus = response?.status() || null;

    // Extra wait for client-side rendering to complete
    await page.waitForTimeout(2000);

    const html = await page.content();
    diagnostics.htmlLength = html.length;

    // Extract metadata from rendered DOM
    const extracted: ExtractedMetadata = await page.evaluate(() => {
      const getMeta = (sel: string): string | null =>
        document.querySelector(sel)?.getAttribute("content") || null;

      const ogTitle = getMeta('meta[property="og:title"]');
      const ogDesc = getMeta('meta[property="og:description"]');
      const ogImage = getMeta('meta[property="og:image"]');
      const titleTag = document.title;

      const result: ExtractedMetadata = {
        title: null,
        artists: [],
        label: null,
        genre: null,
        cover: ogImage,
        beatportUrl: null,
        spotifyUrl: null,
        appleMusicUrl: null,
        youtubeUrl: null,
        soundcloudUrl: null,
        otherStores: [],
      };

      // Parse title — usually "Artist - Title" or "Artist1, Artist2 - Title"
      const titleSource = ogTitle || titleTag || "";
      const cleanedTitle = titleSource.replace(/\s*[|\-–—]\s*PromoLink\s*$/i, "").trim();

      if (cleanedTitle.includes(" - ")) {
        const parts = cleanedTitle.split(" - ");
        result.artists = parts[0].split(",").map((s) => s.trim()).filter(Boolean);
        result.title = parts.slice(1).join(" - ").trim();
      } else if (cleanedTitle) {
        result.title = cleanedTitle;
      }

      // Scan all <a> tags for store URLs
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

      document.querySelectorAll("a[href]").forEach((a) => {
        const href = (a as HTMLAnchorElement).href;
        if (!href) return;

        for (const store of storePatterns) {
          if (store.pattern.test(href) && !foundPlatforms.has(store.platform)) {
            foundPlatforms.add(store.platform);
            (result[store.field] as string) = href;
          }
        }

        for (const store of otherStorePatterns) {
          if (store.pattern.test(href) && !foundPlatforms.has(store.platform)) {
            foundPlatforms.add(store.platform);
            result.otherStores.push({ platform: store.platform, url: href });
          }
        }
      });

      // Extract label and genre from visible body text
      // PromoLink renders: "Title\n\nArtists\n\nLabel\n\nGenre\nStore links..."
      const bodyText = document.body.innerText || "";

      // Heuristic: lines after artists, before store links
      const lines = bodyText.split("\n").map((l) => l.trim()).filter(Boolean);

      // Find the title line index
      let titleIdx = -1;
      if (result.title) {
        titleIdx = lines.findIndex((l) => l === result.title || l.includes(result.title!));
      }

      if (titleIdx >= 0 && titleIdx + 2 < lines.length) {
        // After title: artists line, then label, then genre
        // Artists may be on one line comma-separated
        const labelCandidate = lines[titleIdx + 2];
        const genreCandidate = lines[titleIdx + 3];

        // Label is usually short (1-3 words, uppercase often)
        if (labelCandidate && !result.label && labelCandidate.length < 50 &&
            !/spotify|beatport|apple|youtube|soundcloud|deezer|tidal|powered/i.test(labelCandidate)) {
          result.label = labelCandidate;
        }

        // Genre usually contains parentheses or known genre keywords
        if (genreCandidate && !result.genre && genreCandidate.length < 60 &&
            !/spotify|beatport|apple|youtube|soundcloud|deezer|tidal|powered/i.test(genreCandidate)) {
          result.genre = genreCandidate;
        }
      }

      // Fallback: regex search in body text for genre patterns
      if (!result.genre) {
        const genreMatch = bodyText.match(/(Techno|House|Trance|Progressive|Deep|Tech|Melodic|Minimal|Electro|Dubstep|Drum.?n.?Bass|Ambient|Breakbeat|Hardcore|Psytrance|Garage|Funky|Soulful|Afro|Amapiano|Downtempo|Indie Dance|Nu Disco)[^\n]*?(?:\([^)]*\))?/i);
        if (genreMatch) result.genre = genreMatch[0].trim();
      }

      return result;
    });

    diagnostics.renderedTextLength = (await page.evaluate(() => document.body.innerText.length)) || 0;
    diagnostics.storeLinksFound =
      [extracted.beatportUrl, extracted.spotifyUrl, extracted.appleMusicUrl, extracted.youtubeUrl, extracted.soundcloudUrl]
        .filter(Boolean).length + extracted.otherStores.length;

    await browser.close();

    return NextResponse.json({
      success: true,
      url,
      fetchedAt: new Date().toISOString(),
      diagnostics,
      extracted,
    });
  } catch (err: any) {
    if (browser) await browser.close();

    diagnostics.fetchError = err.message;
    diagnostics.timeout = err.message.includes("Timeout") || err.message.includes("timeout");

    return NextResponse.json({
      error: diagnostics.timeout ? "Timeout — la pagina non si è caricata entro 20s" : "Extraction failed",
      reason: err.message,
      url,
      diagnostics,
      possibleReason: diagnostics.timeout
        ? "Il server PromoLink non ha risposto entro 20 secondi, oppure il rendering JavaScript è troppo lento."
        : err.message.includes("Target closed")
          ? "Il browser headless è stato chiuso inaspettatamente (possibile out of memory sul server)."
          : "Errore sconosciuto durante il rendering della pagina.",
    }, { status: 500 });
  }
}
