import { NextRequest, NextResponse } from "next/server";
import { chromium } from "playwright-core";
import chromiumLambda from "@sparticuz/chromium";

/**
 * 🔒 RP-013 + RP-014 — Universal Track Importer
 *
 * Usa playwright-core + @sparticuz/chromium per compatibilità Vercel Lambda.
 * @sparticuz/chromium è una build minimale di chromium (~130MB) progettata
 * per AWS Lambda / Vercel serverless functions.
 *
 * In development (locale), usa chromium di sistema se disponibile.
 * In production (Vercel), usa @sparticuz/chromium.
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
    // Generic Beatport — try anyway
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
  renderedTextLength: number;
  storeLinksFound: number;
  fetchError: string | null;
  timeout: boolean;
}

// ==================== EXTRACTOR ====================

async function extractWithPlaywright(url: string): Promise<{ extracted: ExtractedMetadata; diagnostics: Diagnostics }> {
  const diagnostics: Diagnostics = {
    source: "",
    httpStatus: null,
    htmlLength: 0,
    renderedTextLength: 0,
    storeLinksFound: 0,
    fetchError: null,
    timeout: false,
  };

  // Detect environment: Vercel Lambda (production) vs locale (development)
  const isVercel = !!process.env.VERCEL;
  const isProduction = process.env.NODE_ENV === "production";

  let browser;

  if (isVercel || isProduction) {
    // Vercel Lambda: usa @sparticuz/chromium
    // chromiumLambda.executablePath() ritorna il path al binario chromium
    // estratto dal layer @sparticuz/chromium (compatibile Lambda)
    browser = await chromium.launch({
      args: chromiumLambda.args,
      executablePath: await chromiumLambda.executablePath(),
      headless: true,
    });
  } else {
    // Development locale: usa chromium di sistema (installato via `npx playwright install`)
    browser = await chromium.launch({
      headless: true,
      args: ["--no-sandbox", "--disable-setuid-sandbox"],
    });
  }

  try {
    const page = await browser.newPage({
      userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    });

    const response = await page.goto(url, { waitUntil: "networkidle", timeout: 20000 });
    diagnostics.httpStatus = response?.status() || null;

    // Extra wait for client-side rendering
    await page.waitForTimeout(2000);

    const html = await page.content();
    diagnostics.htmlLength = html.length;

    // Extract metadata from rendered DOM
    const extracted: ExtractedMetadata = await page.evaluate(() => {
      const getMeta = (sel: string): string | null =>
        document.querySelector(sel)?.getAttribute("content") || null;

      const ogTitle = getMeta('meta[property="og:title"]');
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
      const cleanedTitle = titleSource
        .replace(/\s*[|\-–—]\s*(PromoLink|Beatport|Spotify|SoundCloud|Linktree)\s*$/i, "")
        .replace(/\s*[|\-–—]\s*YouTube\s*$/i, "")
        .trim();

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
      const bodyText = document.body.innerText || "";
      const lines = bodyText.split("\n").map((l) => l.trim()).filter(Boolean);

      // Find the title line index
      let titleIdx = -1;
      if (result.title) {
        titleIdx = lines.findIndex((l) => l === result.title || l.includes(result.title!));
      }

      if (titleIdx >= 0 && titleIdx + 3 < lines.length) {
        const labelCandidate = lines[titleIdx + 2];
        const genreCandidate = lines[titleIdx + 3];

        if (labelCandidate && !result.label && labelCandidate.length < 50 &&
            !/spotify|beatport|apple|youtube|soundcloud|deezer|tidal|powered|listen|play/i.test(labelCandidate)) {
          result.label = labelCandidate;
        }

        if (genreCandidate && !result.genre && genreCandidate.length < 80 &&
            !/spotify|beatport|apple|youtube|soundcloud|deezer|tidal|powered|listen|play/i.test(genreCandidate)) {
          result.genre = genreCandidate;
        }
      }

      // Fallback: regex search for genre patterns
      if (!result.genre) {
        const genreMatch = bodyText.match(
          /(Techno|House|Trance|Progressive|Deep|Tech|Melodic|Minimal|Electro|Dubstep|Drum.?n.?Bass|Ambient|Breakbeat|Hardcore|Psytrance|Garage|Funky|Soulful|Afro|Amapiano|Downtempo|Indie Dance|Nu Disco|Bass|Hard)[^\n]*?(?:\([^)]*\))?/i
        );
        if (genreMatch) result.genre = genreMatch[0].trim();
      }

      return result;
    });

    diagnostics.renderedTextLength = (await page.evaluate(() => document.body.innerText.length)) || 0;
    diagnostics.storeLinksFound =
      [extracted.beatportUrl, extracted.spotifyUrl, extracted.appleMusicUrl, extracted.youtubeUrl, extracted.soundcloudUrl]
        .filter(Boolean).length + extracted.otherStores.length;

    return { extracted, diagnostics };
  } finally {
    await browser.close();
  }
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

  // 1. Detect source
  const sourceInfo = detectSource(parsedUrl);

  if (!sourceInfo.supported) {
    return NextResponse.json({
      error: "Formato non ancora supportato",
      url,
      hostname: parsedUrl.hostname,
      detectedSource: sourceInfo.label,
    }, { status: 400 });
  }

  // 2. Extract metadata using Playwright (universal extractor)
  try {
    const { extracted, diagnostics } = await extractWithPlaywright(url);
    diagnostics.source = sourceInfo.label;

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
    const isTimeout = err.message.includes("Timeout") || err.message.includes("timeout");

    return NextResponse.json({
      error: isTimeout
        ? "Timeout — la pagina non si è caricata entro 20s"
        : "Estrazione fallita",
      reason: err.message,
      url,
      source: sourceInfo.label,
      sourceType: sourceInfo.type,
      diagnostics: {
        source: sourceInfo.label,
        httpStatus: null,
        htmlLength: 0,
        renderedTextLength: 0,
        storeLinksFound: 0,
        fetchError: err.message,
        timeout: isTimeout,
      },
      possibleReason: isTimeout
        ? "Il server non ha risposto entro 20 secondi, oppure il rendering JavaScript è troppo lento."
        : err.message.includes("Target closed")
          ? "Il browser headless è stato chiuso inaspettatamente (possibile out of memory)."
          : "Errore sconosciuto durante il rendering della pagina.",
    }, { status: 500 });
  }
}
