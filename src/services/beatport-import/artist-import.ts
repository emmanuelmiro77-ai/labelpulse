/**
 * BP-002 — Beatport Artist Import Service
 *
 * Isolated service that reads the `artists` array from a JSON file produced
 * by beatport-scraper-v2, upserts each artist into Supabase (global artists
 * row of `app_state` table, id = `global_artists`), and produces a report.
 *
 * ARCHITECTURE: mirrors the Label Import module (BP-001).
 *
 * RULES:
 * - Reads ONLY the `artists` array from the scraper JSON.
 * - Uses the normalized artist name as the primary key for merge.
 * - Updates ONLY scraper-sourced fields (name, imageUrl, genres, tracksByGenre,
 *   labelsPublishedOn, rankByGenre, pointsByGenre, trending, etc.).
 * - Preserves ALL personal data (instagramUrl, CRM data, etc.).
 * - Never deletes existing records.
 * - Produces a final report: created, updated, skipped, errors.
 *
 * ISOLATION:
 * - This service is NOT connected to the UI.
 * - It does NOT modify any existing flow.
 * - It does NOT modify React components, Label Finder, Artist Explorer,
 *   Track Importer, the scraper, or the Label Import module.
 */

import { createClient, SupabaseClient } from "@supabase/supabase-js";

// ==================== TYPES ====================

/** Fields that come from the scraper and can be overwritten on import. */
const ARTIST_SCRAPER_FIELDS = [
  "name",
  "imageUrl",
  "genres",
  "tracksByGenre",
  "labelsPublishedOn",
  "totalPoints",
  "bestPosition",
  "trending",
  "trendingRankByGenre",
  "trendingPointsByGenre",
  "isRemixerOnly",
  "slug",
  "beatportId",
  "beatportUrl",
] as const;

/** Fields that are user-owned and must NEVER be touched by the importer. */
const ARTIST_PERSONAL_FIELDS = [
  "instagramUrl",
  "firstSeenAt",
  "lastSeenAt",
] as const;

/** Shape of an artist entry in the scraper JSON output (RP-BPI-002C canonical). */
interface ScraperArtist {
  // Canonical id (art_<n>) — from RP-BPI-002B+
  canonicalId?: string;
  // Legacy id (bp_<beatportId> or nm_<name>) — from RP-BPI-002A
  id?: string;
  key?: string;
  beatportId?: number | null;
  name: string;
  slug?: string;
  imageUrl?: string;
  genres?: string[];
  tracksByGenre?: Record<string, any[]>;
  labelsPublishedOn?: string[];
  totalPoints?: number;
  bestPosition?: number;
  isRemixerOnly?: boolean;
  trending?: boolean;
  trendingRankByGenre?: Record<string, number>;
  trendingPointsByGenre?: Record<string, number>;
  // Canonical relationship fields (RP-BPI-002B+)
  labelIds?: string[];
  releaseIds?: string[];
  trackIds?: string[];
  // Legacy compat
  rankByGenre?: Record<string, number>;
  pointsByGenre?: Record<string, number>;
}

/** Shape of an artist as stored in the cloud artists row. */
interface StoredArtist {
  id: string;
  beatportId: number | null;
  name: string;
  slug: string;
  imageUrl: string;
  genres: string[];
  tracksByGenre: Record<string, any[]>;
  labelsPublishedOn: string[];
  totalPoints: number;
  bestPosition: number;
  isRemixerOnly: boolean;
  trending: boolean;
  trendingRankByGenre?: Record<string, number>;
  trendingPointsByGenre?: Record<string, number>;
  // Rank snapshot (previous ranking before last import)
  prevRankByGenre?: Record<string, number>;
  // Derived rankByGenre / pointsByGenre (computed from tracksByGenre)
  rankByGenre?: Record<string, number>;
  pointsByGenre?: Record<string, number>;
  // Beatport URL (derived from slug + beatportId)
  beatportUrl?: string;
  // Personal fields (preserved, never overwritten)
  instagramUrl?: string | null;
  firstSeenAt?: string;
  lastSeenAt?: string;
}

/** Final report produced by the import. */
export interface ArtistImportReport {
  totalInFile: number;
  artistsCreated: number;
  artistsUpdated: number;
  artistsSkipped: number;
  errors: Array<{ artistName: string; error: string }>;
  durationMs: number;
}

// ==================== UTILITIES ====================

/**
 * Normalize an artist name for use as a stable merge key.
 * Uppercase, trimmed, collapses internal whitespace.
 */
function normalizeName(name: string): string {
  return (name || "").toUpperCase().trim().replace(/\s+/g, " ");
}

/**
 * Build the Beatport URL for an artist from slug and beatportId.
 */
function buildBeatportUrl(slug?: string, beatportId?: number | null): string {
  if (slug && beatportId) {
    return `https://www.beatport.com/artist/${slug}/${beatportId}`;
  }
  return "";
}

/**
 * Deduplicate an array of strings, preserving order.
 */
function dedupStrings(arr: string[] | undefined): string[] {
  if (!Array.isArray(arr)) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const s of arr) {
    if (typeof s === "string" && s.trim() && !seen.has(s)) {
      seen.add(s);
      out.push(s);
    }
  }
  return out;
}

/**
 * Compute rankByGenre and pointsByGenre from tracksByGenre.
 * rankByGenre[genre] = best (lowest) position across all tracks in that genre.
 * pointsByGenre[genre] = sum of all track points in that genre.
 */
function computeRankAndPoints(tracksByGenre: Record<string, any[]> | undefined): {
  rankByGenre: Record<string, number>;
  pointsByGenre: Record<string, number>;
} {
  const rankByGenre: Record<string, number> = {};
  const pointsByGenre: Record<string, number> = {};
  if (!tracksByGenre || typeof tracksByGenre !== "object") {
    return { rankByGenre, pointsByGenre };
  }
  for (const genre of Object.keys(tracksByGenre)) {
    const tracks = tracksByGenre[genre];
    if (!Array.isArray(tracks) || tracks.length === 0) continue;
    let bestPos = 999;
    let totalPts = 0;
    for (const t of tracks) {
      if (typeof t.position === "number" && t.position < bestPos) {
        bestPos = t.position;
      }
      if (typeof t.points === "number") {
        totalPts += t.points;
      }
    }
    rankByGenre[genre] = bestPos < 999 ? bestPos : 0;
    pointsByGenre[genre] = totalPts;
  }
  return { rankByGenre, pointsByGenre };
}

/**
 * Extract only the scraper-sourced fields from a ScraperArtist.
 * Personal fields are never included.
 */
function extractScraperFields(sa: ScraperArtist): Partial<StoredArtist> {
  const out: Partial<StoredArtist> = {};

  // name (always present)
  out.name = sa.name;

  // imageUrl
  if (sa.imageUrl !== undefined) {
    out.imageUrl = sa.imageUrl || "";
  }

  // genres (dedup)
  if (Array.isArray(sa.genres)) {
    out.genres = dedupStrings(sa.genres);
  }

  // tracksByGenre (deep — replace entirely with scraper version)
  if (sa.tracksByGenre && typeof sa.tracksByGenre === "object") {
    out.tracksByGenre = sa.tracksByGenre;
  }

  // labelsPublishedOn (dedup)
  if (Array.isArray(sa.labelsPublishedOn)) {
    out.labelsPublishedOn = dedupStrings(sa.labelsPublishedOn);
  }

  // totalPoints
  if (typeof sa.totalPoints === "number") {
    out.totalPoints = sa.totalPoints;
  }

  // bestPosition
  if (typeof sa.bestPosition === "number") {
    out.bestPosition = sa.bestPosition;
  }

  // isRemixerOnly
  if (typeof sa.isRemixerOnly === "boolean") {
    out.isRemixerOnly = sa.isRemixerOnly;
  }

  // trending
  if (typeof sa.trending === "boolean") {
    out.trending = sa.trending;
  }

  // trendingRankByGenre
  if (sa.trendingRankByGenre && typeof sa.trendingRankByGenre === "object") {
    out.trendingRankByGenre = sa.trendingRankByGenre;
  }

  // trendingPointsByGenre
  if (sa.trendingPointsByGenre && typeof sa.trendingPointsByGenre === "object") {
    out.trendingPointsByGenre = sa.trendingPointsByGenre;
  }

  // slug
  if (sa.slug !== undefined) {
    out.slug = sa.slug || "";
  }

  // beatportId
  if (sa.beatportId !== undefined) {
    out.beatportId = sa.beatportId || null;
  }

  // beatportUrl (derived from slug + beatportId)
  out.beatportUrl = buildBeatportUrl(sa.slug, sa.beatportId);

  // Compute rankByGenre and pointsByGenre from tracksByGenre if not
  // explicitly provided in the scraper JSON
  if (sa.rankByGenre && typeof sa.rankByGenre === "object") {
    out.rankByGenre = sa.rankByGenre;
  } else if (sa.tracksByGenre) {
    const { rankByGenre } = computeRankAndPoints(sa.tracksByGenre);
    out.rankByGenre = rankByGenre;
  }

  if (sa.pointsByGenre && typeof sa.pointsByGenre === "object") {
    out.pointsByGenre = sa.pointsByGenre;
  } else if (sa.tracksByGenre) {
    const { pointsByGenre } = computeRankAndPoints(sa.tracksByGenre);
    out.pointsByGenre = pointsByGenre;
  }

  return out;
}

/**
 * Merge a scraper artist into an existing stored artist.
 * Only scraper-sourced fields are overwritten; personal fields are preserved.
 * labelsPublishedOn is merged (union, dedup) rather than replaced.
 */
function mergeArtist(
  existing: StoredArtist,
  scraperFields: Partial<StoredArtist>,
): { merged: StoredArtist; rankChanged: boolean } {
  const merged: StoredArtist = { ...existing };

  // Overwrite scraper-sourced fields
  for (const field of ARTIST_SCRAPER_FIELDS) {
    if (scraperFields[field as keyof Partial<StoredArtist>] !== undefined) {
      (merged as any)[field] = scraperFields[field as keyof Partial<StoredArtist>];
    }
  }

  // Special handling: labelsPublishedOn — merge (union, dedup) instead of replace
  if (scraperFields.labelsPublishedOn && existing.labelsPublishedOn) {
    merged.labelsPublishedOn = dedupStrings([
      ...existing.labelsPublishedOn,
      ...scraperFields.labelsPublishedOn,
    ]);
  }

  // Special handling: genres — merge (union, dedup) instead of replace
  if (scraperFields.genres && existing.genres) {
    merged.genres = dedupStrings([
      ...existing.genres,
      ...scraperFields.genres,
    ]);
  }

  // Compute rankByGenre / pointsByGenre from tracksByGenre if available
  if (scraperFields.tracksByGenre) {
    const { rankByGenre, pointsByGenre } = computeRankAndPoints(scraperFields.tracksByGenre);
    merged.rankByGenre = rankByGenre;
    merged.pointsByGenre = pointsByGenre;
  }

  // Track if ranking changed (for prevRankByGenre)
  let rankChanged = false;
  if (scraperFields.rankByGenre && existing.rankByGenre) {
    const oldRanks = JSON.stringify(existing.rankByGenre);
    const newRanks = JSON.stringify(scraperFields.rankByGenre);
    if (oldRanks !== newRanks) {
      rankChanged = true;
      merged.prevRankByGenre = { ...existing.rankByGenre };
    }
  } else if (merged.rankByGenre && existing.rankByGenre) {
    const oldRanks = JSON.stringify(existing.rankByGenre);
    const newRanks = JSON.stringify(merged.rankByGenre);
    if (oldRanks !== newRanks) {
      rankChanged = true;
      merged.prevRankByGenre = { ...existing.rankByGenre };
    }
  }

  // Ensure personal fields are preserved
  for (const field of ARTIST_PERSONAL_FIELDS) {
    if (existing[field as keyof StoredArtist] !== undefined) {
      (merged as any)[field] = existing[field as keyof StoredArtist];
    }
  }

  // Update lastSeenAt
  merged.lastSeenAt = new Date().toISOString();

  return { merged, rankChanged };
}

/**
 * Create a new StoredArtist from scraper data.
 * Personal fields get safe defaults.
 */
function createArtistFromScraper(
  scraperFields: Partial<StoredArtist>,
  id: string,
): StoredArtist {
  const now = new Date().toISOString();
  const { rankByGenre, pointsByGenre } = computeRankAndPoints(scraperFields.tracksByGenre);

  return {
    id,
    beatportId: scraperFields.beatportId ?? null,
    name: scraperFields.name || "",
    slug: scraperFields.slug || "",
    imageUrl: scraperFields.imageUrl || "",
    genres: scraperFields.genres || [],
    tracksByGenre: scraperFields.tracksByGenre || {},
    labelsPublishedOn: scraperFields.labelsPublishedOn || [],
    totalPoints: scraperFields.totalPoints ?? 0,
    bestPosition: scraperFields.bestPosition ?? 0,
    isRemixerOnly: scraperFields.isRemixerOnly ?? false,
    trending: scraperFields.trending ?? false,
    trendingRankByGenre: scraperFields.trendingRankByGenre || {},
    trendingPointsByGenre: scraperFields.trendingPointsByGenre || {},
    beatportUrl: scraperFields.beatportUrl || buildBeatportUrl(scraperFields.slug, scraperFields.beatportId),
    rankByGenre: scraperFields.rankByGenre || rankByGenre,
    pointsByGenre: scraperFields.pointsByGenre || pointsByGenre,
    prevRankByGenre: {},
    // Personal field defaults
    instagramUrl: null,
    firstSeenAt: now,
    lastSeenAt: now,
  };
}

// ==================== CORE IMPORT LOGIC ====================

/**
 * Import artists from a parsed scraper JSON object.
 *
 * Pure-logic core: takes the existing artists array and the scraper JSON,
 * produces a new artists array + report. No Supabase I/O.
 *
 * @param existingArtists - Current artists in the store (global artists row).
 * @param scraperJson - Parsed JSON from beatport-scraper-v2.js output.
 * @returns { artists: StoredArtist[], report: ArtistImportReport }
 */
export function importArtistsFromScraperJson(
  existingArtists: StoredArtist[],
  scraperJson: any,
): { artists: StoredArtist[]; report: ArtistImportReport } {
  const startTime = Date.now();
  const report: ArtistImportReport = {
    totalInFile: 0,
    artistsCreated: 0,
    artistsUpdated: 0,
    artistsSkipped: 0,
    errors: [],
    durationMs: 0,
  };

  // 1. Validate input
  if (!scraperJson || typeof scraperJson !== "object") {
    report.errors.push({ artistName: "(file)", error: "Invalid JSON: not an object" });
    report.durationMs = Date.now() - startTime;
    return { artists: existingArtists, report };
  }

  const scraperArtists: ScraperArtist[] = Array.isArray(scraperJson.artists)
    ? scraperJson.artists
    : [];

  if (scraperArtists.length === 0) {
    report.errors.push({ artistName: "(file)", error: "No artists array found in JSON" });
    report.durationMs = Date.now() - startTime;
    return { artists: existingArtists, report };
  }

  report.totalInFile = scraperArtists.length;

  // 2. Index existing artists by normalized name for fast lookup
  const existingByName = new Map<string, { index: number; artist: StoredArtist }>();
  for (let i = 0; i < existingArtists.length; i++) {
    const norm = normalizeName(existingArtists[i].name);
    if (norm && !existingByName.has(norm)) {
      existingByName.set(norm, { index: i, artist: existingArtists[i] });
    }
  }

  // 3. Process each scraper artist
  const resultArtists: StoredArtist[] = [...existingArtists];

  for (const sa of scraperArtists) {
    try {
      // Validate artist has a name
      if (!sa.name || typeof sa.name !== "string" || sa.name.trim() === "") {
        report.artistsSkipped++;
        report.errors.push({ artistName: "(unknown)", error: "Artist has no name" });
        continue;
      }

      const normName = normalizeName(sa.name);
      const scraperFields = extractScraperFields(sa);
      const existing = existingByName.get(normName);

      if (existing) {
        // UPDATE: merge scraper fields into existing artist, preserve personal fields
        const { merged } = mergeArtist(existing.artist, scraperFields);
        resultArtists[existing.index] = merged;
        report.artistsUpdated++;
      } else {
        // CREATE: new artist from scraper data
        const newId = sa.canonicalId || sa.id || sa.key || `art_${normName.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/_+$/, "")}`;
        const newArtist = createArtistFromScraper(scraperFields, newId);
        resultArtists.push(newArtist);
        existingByName.set(normName, { index: resultArtists.length - 1, artist: newArtist });
        report.artistsCreated++;
      }
    } catch (err: any) {
      report.artistsSkipped++;
      report.errors.push({
        artistName: sa?.name || "(unknown)",
        error: err?.message || String(err),
      });
    }
  }

  report.durationMs = Date.now() - startTime;
  return { artists: resultArtists, report };
}

// ==================== SUPABASE PERSISTENCE ====================

/** The cloud row id for global artists (mirrors supabase.ts getGlobalArtistsCloudRowId). */
const GLOBAL_ARTISTS_ROW_ID = "global_artists";
/** The Supabase table name (mirrors supabase.ts CLOUD_TABLE). */
const CLOUD_TABLE = "app_state";

/**
 * Push the imported artists to the Supabase global artists row.
 *
 * @param supabase - Authenticated Supabase client (service_role recommended).
 * @param artists - The merged artists array to push.
 * @returns { ok: boolean; error?: string }
 */
export async function pushArtistsToGlobalRow(
  supabase: SupabaseClient,
  artists: StoredArtist[],
): Promise<{ ok: boolean; error?: string }> {
  try {
    // Strip personal fields — global row contains only Beatport-sourced data
    const globalArtists = artists.map((a) => {
      const out: Record<string, any> = {};
      for (const f of ARTIST_SCRAPER_FIELDS) {
        if ((a as any)[f] !== undefined) {
          out[f] = (a as any)[f];
        }
      }
      // Include id and derived fields
      out.id = a.id;
      out.rankByGenre = a.rankByGenre;
      out.pointsByGenre = a.pointsByGenre;
      out.prevRankByGenre = a.prevRankByGenre;
      out.beatportUrl = a.beatportUrl;
      out.firstSeenAt = a.firstSeenAt;
      out.lastSeenAt = a.lastSeenAt;
      return out;
    });

    const { error } = await supabase.from(CLOUD_TABLE).upsert(
      {
        id: GLOBAL_ARTISTS_ROW_ID,
        data: { artists: globalArtists, savedAt: new Date().toISOString() },
        updated_at: new Date().toISOString(),
      },
      { onConflict: "id" },
    );

    if (error) {
      return { ok: false, error: error.message };
    }

    return { ok: true };
  } catch (err: any) {
    return { ok: false, error: err?.message || String(err) };
  }
}

/**
 * Fetch the current global artists from Supabase.
 *
 * @param supabase - Authenticated Supabase client.
 * @returns { artists: StoredArtist[]; error?: string }
 */
export async function fetchGlobalArtists(
  supabase: SupabaseClient,
): Promise<{ artists: StoredArtist[]; error?: string }> {
  try {
    const { data, error } = await supabase
      .from(CLOUD_TABLE)
      .select("data")
      .eq("id", GLOBAL_ARTISTS_ROW_ID)
      .maybeSingle();

    if (error) {
      return { artists: [], error: error.message };
    }

    const artists: StoredArtist[] = (data?.data?.artists as StoredArtist[]) || [];
    return { artists };
  } catch (err: any) {
    return { artists: [], error: err?.message || String(err) };
  }
}

// ==================== FULL PIPELINE ====================

/**
 * Full import pipeline: read JSON, merge with existing artists, push to cloud.
 *
 * @param scraperJson - Parsed JSON object from beatport-scraper-v2.js.
 * @param supabaseUrl - Supabase project URL.
 * @param supabaseServiceKey - Supabase service_role key (bypasses RLS for global row).
 * @param options - Optional: dryRun (don't push to cloud).
 * @returns ArtistImportReport
 */
export async function runArtistImport(
  scraperJson: any,
  supabaseUrl: string,
  supabaseServiceKey: string,
  options?: { dryRun?: boolean },
): Promise<ArtistImportReport> {
  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  // 1. Fetch existing global artists
  const { artists: existingArtists, error: fetchError } = await fetchGlobalArtists(supabase);
  if (fetchError) {
    console.error("[BP-002] Failed to fetch global artists:", fetchError);
    return {
      totalInFile: 0,
      artistsCreated: 0,
      artistsUpdated: 0,
      artistsSkipped: 0,
      errors: [{ artistName: "(cloud)", error: fetchError }],
      durationMs: 0,
    };
  }

  console.log(`[BP-002] Fetched ${existingArtists.length} existing artists from global row`);

  // 2. Run the pure-logic import
  const { artists: mergedArtists, report } = importArtistsFromScraperJson(existingArtists, scraperJson);

  console.log(
    `[BP-002] Import result: ${report.artistsCreated} created, ${report.artistsUpdated} updated, ${report.artistsSkipped} skipped, ${report.errors.length} errors`,
  );

  // 3. Push to cloud (unless dry-run)
  if (!options?.dryRun) {
    const { ok, error: pushError } = await pushArtistsToGlobalRow(supabase, mergedArtists);
    if (!ok) {
      report.errors.push({ artistName: "(cloud push)", error: pushError || "Unknown push error" });
    } else {
      console.log(`[BP-002] Pushed ${mergedArtists.length} artists to global row`);
    }
  } else {
    console.log("[BP-002] Dry-run mode: skipping cloud push");
  }

  return report;
}
