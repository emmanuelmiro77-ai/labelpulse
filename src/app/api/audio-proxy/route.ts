import { NextRequest, NextResponse } from "next/server";

/**
 * Audio Proxy API
 * Bypasses CORS restrictions to fetch audio bytes from SoundCloud or direct URLs.
 *
 * GET /api/audio-proxy?url=https://soundcloud.com/...
 * GET /api/audio-proxy?url=https://example.com/track.mp3
 *
 * Returns: audio/mpeg stream with CORS headers
 */

// SoundCloud client_id (public, used by their web widget)
// Note: This is a fallback method. SoundCloud may break this at any time.
// For production, a proper SoundCloud API integration with OAuth is recommended.
const SOUNDCLOUD_CLIENT_IDS = [
  "iZIs9mchVcX5lhVRyQGGAYlNPVldzAo3",
  "Q6m8ve6qEBRZhSeEyq8uu5gUgeUUeT6n",
];

interface ScResolveResponse {
  id: number;
  title: string;
  duration: number;
  streamable: boolean;
  media: {
    transcodings: Array<{
      url: string;
      format: { protocol: string; mime_type: string };
      quality: string;
    }>;
  };
}

/**
 * Resolve a SoundCloud URL to a streamable audio URL via the public API.
 * Returns the progressive MP3 128kbps URL if available.
 */
async function resolveSoundCloudUrl(trackUrl: string): Promise<string | null> {
  for (const clientId of SOUNDCLOUD_CLIENT_IDS) {
    try {
      const resolveApiUrl = `https://api-v2.soundcloud.com/resolve?url=${encodeURIComponent(
        trackUrl
      )}&client_id=${clientId}`;

      const resp = await fetch(resolveApiUrl, {
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
          Accept: "application/json",
        },
      });

      if (!resp.ok) {
        continue;
      }

      const data = (await resp.json()) as ScResolveResponse;
      if (!data.streamable || !data.media?.transcodings?.length) {
        continue;
      }

      // Find the best progressive MP3 transcoding (no HLS)
      const progressiveMp3 = data.media.transcodings.find(
        (t) =>
          t.format.protocol === "progressive" &&
          t.format.mime_type === "audio/mpeg"
      );

      const chosen = progressiveMp3 || data.media.transcodings[0];
      if (!chosen) continue;

      // Resolve the actual stream URL
      const streamResp = await fetch(`${chosen.url}?client_id=${clientId}`, {
        headers: { Accept: "application/json" },
      });
      if (!streamResp.ok) continue;

      const streamData = (await streamResp.json()) as { url: string };
      if (streamData.url) {
        return streamData.url;
      }
    } catch (err) {
      // Try next client_id
      continue;
    }
  }
  return null;
}

/**
 * Determine if a URL is a SoundCloud track URL.
 */
function isSoundCloudUrl(url: string): boolean {
  return /https?:\/\/(www\.)?soundcloud\.com\//i.test(url);
}

/**
 * Determine if a URL points to a direct audio file.
 */
function isDirectAudioUrl(url: string): boolean {
  return /\.(mp3|wav|m4a|ogg|flac|aac)(\?|$)/i.test(url);
}

/**
 * Fallback SoundCloud resolver: fetches the track page HTML and extracts
 * the embedded JSON hydration data which contains stream URLs.
 *
 * SoundCloud embeds a JSON object in window.__sc_hydration = [...]
 * that includes a "sound" object with media.transcodings[].
 * Each transcoding has a URL that returns the actual stream URL when fetched
 * with a client_id parameter.
 */
async function resolveSoundCloudViaHtml(
  trackUrl: string
): Promise<string | null> {
  try {
    const resp = await fetch(trackUrl, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        Accept: "text/html,application/xhtml+xml",
        "Accept-Language": "en-US,en;q=0.9",
      },
    });

    if (!resp.ok) return null;
    const html = await resp.text();

    // Look for the hydration JSON blob: window.__sc_hydration = [...]
    const hydrationMatch = html.match(
      /window\.__sc_hydration\s*=\s*(\[[\s\S]*?\]);/
    );
    if (!hydrationMatch) return null;

    let hydration: any[];
    try {
      hydration = JSON.parse(hydrationMatch[1]);
    } catch {
      return null;
    }

    // Find the "sound" hydration entry
    const soundEntry = hydration.find(
      (h: any) => h?.hydratable === "sound" && h?.data?.media?.transcodings
    );
    if (!soundEntry) return null;

    const transcodings = soundEntry.data.media.transcodings;
    if (!Array.isArray(transcodings) || transcodings.length === 0) return null;

    // Prefer progressive MP3, fallback to first transcoding
    const progressiveMp3 = transcodings.find(
      (t: any) =>
        t.format?.protocol === "progressive" &&
        t.format?.mime_type === "audio/mpeg"
    );
    const chosen = progressiveMp3 || transcodings[0];
    if (!chosen?.url) return null;

    // The transcoding URL is an API endpoint that returns the stream URL
    // Try with each client_id
    for (const clientId of SOUNDCLOUD_CLIENT_IDS) {
      try {
        const streamResp = await fetch(`${chosen.url}?client_id=${clientId}`, {
          headers: { Accept: "application/json" },
        });
        if (!streamResp.ok) continue;
        const streamData = await streamResp.json();
        if (streamData.url) return streamData.url;
      } catch {
        continue;
      }
    }

    return null;
  } catch {
    return null;
  }
}

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const targetUrl = url.searchParams.get("url");

  if (!targetUrl) {
    return NextResponse.json(
      { error: "Missing 'url' parameter" },
      { status: 400 }
    );
  }

  let audioUrl: string | null = null;

  try {
    // Step 1: Resolve SoundCloud URLs to a direct stream URL
    if (isSoundCloudUrl(targetUrl)) {
      // Try API resolve first
      audioUrl = await resolveSoundCloudUrl(targetUrl);
      // If API fails, try HTML scraping fallback
      if (!audioUrl) {
        audioUrl = await resolveSoundCloudViaHtml(targetUrl);
      }
      if (!audioUrl) {
        return NextResponse.json(
          {
            error:
              "Impossibile risolvere il link SoundCloud. SoundCloud ha bloccato l'accesso automatico. Prova a caricare direttamente il file audio usando il pulsante 'Carica file'.",
          },
          { status: 502 }
        );
      }
    } else if (isDirectAudioUrl(targetUrl)) {
      audioUrl = targetUrl;
    } else {
      return NextResponse.json(
        { error: "L'URL deve essere un link SoundCloud o un file audio diretto (mp3, wav, m4a, ecc.)" },
        { status: 400 }
      );
    }

    // Step 2: Fetch the audio bytes with a streaming response
    const audioResp = await fetch(audioUrl, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
        Accept: "audio/*",
      },
    });

    if (!audioResp.ok || !audioResp.body) {
      return NextResponse.json(
        { error: `Failed to fetch audio: ${audioResp.status} ${audioResp.statusText}` },
        { status: 502 }
      );
    }

    // Determine content type
    const contentType =
      audioResp.headers.get("content-type") || "audio/mpeg";

    // Step 3: Stream back the audio bytes with CORS headers
    const proxyHeaders = new Headers();
    proxyHeaders.set("Content-Type", contentType);
    proxyHeaders.set("Access-Control-Allow-Origin", "*");
    proxyHeaders.set("Access-Control-Allow-Methods", "GET, OPTIONS");
    proxyHeaders.set("Access-Control-Allow-Headers", "Content-Type");
    proxyHeaders.set("Cache-Control", "public, max-age=3600");

    const contentLength = audioResp.headers.get("content-length");
    if (contentLength) {
      proxyHeaders.set("Content-Length", contentLength);
    }

    return new NextResponse(audioResp.body, {
      status: 200,
      headers: proxyHeaders,
    });
  } catch (err: any) {
    console.error("[audio-proxy] Error:", err);
    return NextResponse.json(
      { error: `Proxy error: ${err?.message || "unknown error"}` },
      { status: 500 }
    );
  }
}

export async function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    },
  });
}
