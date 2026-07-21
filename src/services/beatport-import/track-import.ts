/**
 * BP-003 — Beatport Track Import Service
 *
 * Isolated service that reads the `tracks` array from a JSON file produced
 * by beatport-scraper-v2, upserts each track into Supabase (global tracks
 * row of `app_state` table, id = `global_tracks`), and produces a report.
 *
 * ARCHITECTURE: mirrors the Label Import (BP-001) and Artist Import (BP-002).
 *
 * RULES:
 * - Reads ONLY the `tracks` array from the scraper JSON.
 * - Uses Beatport id as primary key when available, otherwise a canonical
 *   key derived from artist + title.
 * - Updates ONLY scraper-sourced fields.
 * - Preserves ALL personal data.
 * - Never deletes existing records.
 * - Produces a final report: created, updated, skipped, errors.
 *
 * ISOLATION:
 * - This service is NOT connected to the UI.
 * - It does NOT modify any existing flow, component, or other import module.
 */

import { createClient, SupabaseClient } from "@supabase/supabase-js";

// ==================== TYPES ====================

/** Fields that come from the scraper and can be overwritten on import. */
const TRACK_SCRAPER_FIELDS = [
  "name",
  "mixName",
  "slug",
  "bpm",
  "keyCamelot",
  "keyName",
  "releaseDate",
  "coverArt",
  "sampleUrl",
  "primaryGenre",
  "subGenre",
  "releaseId",
  "labelId",
  "artistIds",
  "remixerIds",
  "positions",
  "positionHistory",
  "trend",
  "trendScore",
  "momentum",
  "status",
  "insights",
  "beatportId",
  "beatportUrl",
  "beatportLabelId",
  "labelSlug",
  "artists",
  "remixers",
  "label",
] as const;

/** Fields that are user-owned and must NEVER be touched by the importer. */
const TRACK_PERSONAL_FIELDS = [
  "notes",
  "isFavorite",
  "userTags",
  "userRating",
  "firstSeenAt",
  "lastSeenAt",
] as const;

/** Shape of a track entry in the scraper JSON output. */
interface ScraperTrack {
  canonicalId?: string;
  id?: number | string | null;
  key?: string;
  beatportId?: number | null;
  name: string;
  mixName?: string;
  slug?: string;
  bpm?: number | null;
  keyCamelot?: string;
  keyName?: string;
  releaseDate?: string;
  coverArt?: string;
  sampleUrl?: string;
  primaryGenre?: string;
  subGenre?: string | null;
  // Canonical relationships
  releaseId?: string | null;
  labelId?: string;
  artistIds?: string[];
  remixerIds?: string[];
  // Aggregates
  positions?: Array<{ genre: string; position: number; points: number; seenAt: string }>;
  positionHistory?: Array<{ scrapedAt: string; genreId: number; genreName: string; position: number }>;
  trend?: string;
  trendScore?: number;
  momentum?: number;
  status?: string;
  insights?: any;
  seenAt?: string;
  // Legacy compat
  label?: string;
  beatportLabelId?: number | null;
  labelSlug?: string;
  artists?: Array<{ id: number | null; name: string; slug?: string }>;
  remixers?: Array<{ id: number | null; name: string; slug?: string }>;
}

/** Shape of a track as stored in the cloud tracks row. */
interface StoredTrack {
  id: string;
  beatportId: number | null;
  name: string;
  mixName: string;
  slug: string;
  bpm: number | null;
  keyCamelot: string;
  keyName: string;
  releaseDate: string;
  coverArt: string;
  sampleUrl: string;
  primaryGenre: string;
  subGenre: string | null;
  // Canonical relationships
  releaseId: string | null;
  labelId: string;
  artistIds: string[];
  remixerIds: string[];
  // Aggregates
  positions: Array<{ genre: string; position: number; points: number; seenAt: string }>;
  positionHistory: Array<{ scrapedAt: string; genreId: number; genreName: string; position: number }>;
  trend: string;
  trendScore: number;
  momentum: number;
  status: string;
  insights: any;
  seenAt: string;
  // Legacy compat
  label: string;
  beatportLabelId: number | null;
  labelSlug: string;
  artists: Array<{ id: number | null; name: string; slug?: string }>;
  remixers: Array<{ id: number | null; name: string; slug?: string }>;
  // Derived
  beatportUrl: string;
  rankByGenre: Record<string, number>;
  pointsByGenre: Record<string, number>;
  prevRankByGenre: Record<string, number>;
  // Personal fields (preserved)
  notes?: string;
  isFavorite?: boolean;
  userTags?: string[];
  userRating?: number;
  firstSeenAt?: string;
  lastSeenAt?: string;
}

/** Final report produced by the import. */
export interface TrackImportReport {
  totalInFile: number;
  tracksCreated: number;
  tracksUpdated: number;
  tracksSkipped: number;
  errors: Array<{ trackName: string; error: string }>;
  durationMs: number;
}

// ==================== UTILITIES ====================

/**
 * Build a stable track key from the first artist name + track name.
 * Used when beatportId is not available.
 */
function buildCanonicalKey(artists: Array<{ name?: string }> | undefined, trackName: string): string {
  const firstArtist = artists && artists.length > 0 ? (artists[0].name || "").toUpperCase().trim() : "";
  const normName = (trackName || "").toUpperCase().trim().replace(/\s+/g, " ");
  return `nm_${firstArtist}|${normName}`;
}

/**
 * Build the Beatport URL for a track from slug and beatportId.
 */
function buildBeatportUrl(slug?: string, beatportId?: number | null): string {
  if (slug && beatportId) {
    return `https://www.beatport.com/track/${slug}/${beatportId}`;
  }
  return "";
}

/**
 * Deduplicate an array of objects by a key function, preserving order.
 */
function dedupBy<T>(arr: T[] | undefined, keyFn: (item: T) => string): T[] {
  if (!Array.isArray(arr)) return [];
  const seen = new Set<string>();
  const out: T[] = [];
  for (const item of arr) {
    const k = keyFn(item);
    if (k && !seen.has(k)) {
      seen.add(k);
      out.push(item);
    }
  }
  return out;
}

/**
 * Compute rankByGenre and pointsByGenre from positions array.
 * rankByGenre[genre] = best (lowest) position.
 * pointsByGenre[genre] = sum of points.
 */
function computeRankAndPoints(
  positions: Array<{ genre: string; position: number; points: number }> | undefined,
): { rankByGenre: Record<string, number>; pointsByGenre: Record<string, number> } {
  const rankByGenre: Record<string, number> = {};
  const pointsByGenre: Record<string, number> = {};
  if (!Array.isArray(positions)) return { rankByGenre, pointsByGenre };
  for (const p of positions) {
    if (!p.genre) continue;
    if (typeof p.position === "number") {
      const existing = rankByGenre[p.genre];
      if (existing === undefined || p.position < existing) {
        rankByGenre[p.genre] = p.position;
      }
    }
    if (typeof p.points === "number") {
      pointsByGenre[p.genre] = (pointsByGenre[p.genre] || 0) + p.points;
    }
  }
  return { rankByGenre, pointsByGenre };
}

/**
 * Extract only the scraper-sourced fields from a ScraperTrack.
 * Personal fields are never included.
 */
function extractScraperFields(st: ScraperTrack): Partial<StoredTrack> {
  const out: Partial<StoredTrack> = {};

  out.name = st.name || "";
  out.mixName = st.mixName || "";
  out.slug = st.slug || "";
  out.bpm = st.bpm ?? null;
  out.keyCamelot = st.keyCamelot || "";
  out.keyName = st.keyName || "";
  out.releaseDate = st.releaseDate || "";
  out.coverArt = st.coverArt || "";
  out.sampleUrl = st.sampleUrl || "";
  out.primaryGenre = st.primaryGenre || "";
  out.subGenre = st.subGenre ?? null;

  // Canonical relationships
  out.releaseId = st.releaseId ?? null;
  out.labelId = st.labelId || "";
  out.artistIds = Array.isArray(st.artistIds) ? st.artistIds.slice() : [];
  out.remixerIds = Array.isArray(st.remixerIds) ? st.remixerIds.slice() : [];

  // Aggregates
  out.positions = Array.isArray(st.positions) ? st.positions.slice() : [];
  out.positionHistory = Array.isArray(st.positionHistory) ? st.positionHistory.slice() : [];
  out.trend = st.trend || "new";
  out.trendScore = typeof st.trendScore === "number" ? st.trendScore : 50;
  out.momentum = typeof st.momentum === "number" ? st.momentum : 0;
  out.status = st.status || "emerging";
  out.insights = st.insights || null;
  out.seenAt = st.seenAt || new Date().toISOString();

  // Legacy compat
  out.label = st.label || "";
  out.beatportLabelId = st.beatportLabelId ?? null;
  out.labelSlug = st.labelSlug || "";
  out.artists = Array.isArray(st.artists) ? dedupBy(st.artists, (a) => `${a.id || ""}|${(a.name || "").toUpperCase()}`) : [];
  out.remixers = Array.isArray(st.remixers) ? dedupBy(st.remixers, (a) => `${a.id || ""}|${(a.name || "").toUpperCase()}`) : [];

  // Beatport identity
  out.beatportId = st.beatportId ?? null;
  out.beatportUrl = buildBeatportUrl(st.slug, st.beatportId);

  // Compute rankByGenre / pointsByGenre from positions
  const { rankByGenre, pointsByGenre } = computeRankAndPoints(st.positions);
  out.rankByGenre = rankByGenre;
  out.pointsByGenre = pointsByGenre;

  return out;
}

/**
 * Merge a scraper track into an existing stored track.
 * Only scraper-sourced fields are overwritten; personal fields are preserved.
 */
function mergeTrack(
  existing: StoredTrack,
  scraperFields: Partial<StoredTrack>,
): { merged: StoredTrack; rankChanged: boolean } {
  const merged: StoredTrack = { ...existing };

  // Overwrite scraper-sourced fields
  for (const field of TRACK_SCRAPER_FIELDS) {
    if (scraperFields[field as keyof Partial<StoredTrack>] !== undefined) {
      (merged as any)[field] = scraperFields[field as keyof Partial<StoredTrack>];
    }
  }

  // Also overwrite derived fields
  if (scraperFields.rankByGenre) merged.rankByGenre = scraperFields.rankByGenre;
  if (scraperFields.pointsByGenre) merged.pointsByGenre = scraperFields.pointsByGenre;
  if (scraperFields.beatportUrl !== undefined) merged.beatportUrl = scraperFields.beatportUrl;

  // Track if ranking changed (for prevRankByGenre)
  let rankChanged = false;
  if (scraperFields.rankByGenre && existing.rankByGenre) {
    const oldRanks = JSON.stringify(existing.rankByGenre);
    const newRanks = JSON.stringify(scraperFields.rankByGenre);
    if (oldRanks !== newRanks) {
      rankChanged = true;
      merged.prevRankByGenre = { ...existing.rankByGenre };
    }
  }

  // Ensure personal fields are preserved
  for (const field of TRACK_PERSONAL_FIELDS) {
    if (existing[field as keyof StoredTrack] !== undefined) {
      (merged as any)[field] = existing[field as keyof StoredTrack];
    }
  }

  // Update lastSeenAt
  merged.lastSeenAt = new Date().toISOString();

  return { merged, rankChanged };
}

/**
 * Create a new StoredTrack from scraper data.
 * Personal fields get safe defaults.
 */
function createTrackFromScraper(
  scraperFields: Partial<StoredTrack>,
  id: string,
): StoredTrack {
  const now = new Date().toISOString();
  return {
    id,
    beatportId: scraperFields.beatportId ?? null,
    name: scraperFields.name || "",
    mixName: scraperFields.mixName || "",
    slug: scraperFields.slug || "",
    bpm: scraperFields.bpm ?? null,
    keyCamelot: scraperFields.keyCamelot || "",
    keyName: scraperFields.keyName || "",
    releaseDate: scraperFields.releaseDate || "",
    coverArt: scraperFields.coverArt || "",
    sampleUrl: scraperFields.sampleUrl || "",
    primaryGenre: scraperFields.primaryGenre || "",
    subGenre: scraperFields.subGenre ?? null,
    releaseId: scraperFields.releaseId ?? null,
    labelId: scraperFields.labelId || "",
    artistIds: scraperFields.artistIds || [],
    remixerIds: scraperFields.remixerIds || [],
    positions: scraperFields.positions || [],
    positionHistory: scraperFields.positionHistory || [],
    trend: scraperFields.trend || "new",
    trendScore: scraperFields.trendScore ?? 50,
    momentum: scraperFields.momentum ?? 0,
    status: scraperFields.status || "emerging",
    insights: scraperFields.insights || null,
    seenAt: scraperFields.seenAt || now,
    label: scraperFields.label || "",
    beatportLabelId: scraperFields.beatportLabelId ?? null,
    labelSlug: scraperFields.labelSlug || "",
    artists: scraperFields.artists || [],
    remixers: scraperFields.remixers || [],
    beatportUrl: scraperFields.beatportUrl || "",
    rankByGenre: scraperFields.rankByGenre || {},
    pointsByGenre: scraperFields.pointsByGenre || {},
    prevRankByGenre: {},
    // Personal defaults
    notes: "",
    isFavorite: false,
    userTags: [],
    userRating: 0,
    firstSeenAt: now,
    lastSeenAt: now,
  };
}

// ==================== CORE IMPORT LOGIC ====================

/**
 * Import tracks from a parsed scraper JSON object.
 *
 * Pure-logic core: takes the existing tracks array and the scraper JSON,
 * produces a new tracks array + report. No Supabase I/O.
 *
 * @param existingTracks - Current tracks in the store.
 * @param scraperJson - Parsed JSON from beatport-scraper-v2.js output.
 * @returns { tracks: StoredTrack[], report: TrackImportReport }
 */
export function importTracksFromScraperJson(
  existingTracks: StoredTrack[],
  scraperJson: any,
): { tracks: StoredTrack[]; report: TrackImportReport } {
  const startTime = Date.now();
  const report: TrackImportReport = {
    totalInFile: 0,
    tracksCreated: 0,
    tracksUpdated: 0,
    tracksSkipped: 0,
    errors: [],
    durationMs: 0,
  };

  // 1. Validate input
  if (!scraperJson || typeof scraperJson !== "object") {
    report.errors.push({ trackName: "(file)", error: "Invalid JSON: not an object" });
    report.durationMs = Date.now() - startTime;
    return { tracks: existingTracks, report };
  }

  const scraperTracks: ScraperTrack[] = Array.isArray(scraperJson.tracks)
    ? scraperJson.tracks
    : [];

  if (scraperTracks.length === 0) {
    report.errors.push({ trackName: "(file)", error: "No tracks array found in JSON" });
    report.durationMs = Date.now() - startTime;
    return { tracks: existingTracks, report };
  }

  report.totalInFile = scraperTracks.length;

  // 2. Index existing tracks by beatportId (primary) and by canonical key (fallback)
  const existingByBpId = new Map<number, { index: number; track: StoredTrack }>();
  const existingByCanonicalKey = new Map<string, { index: number; track: StoredTrack }>();

  for (let i = 0; i < existingTracks.length; i++) {
    const t = existingTracks[i];
    if (t.beatportId) {
      existingByBpId.set(t.beatportId, { index: i, track: t });
    }
    // Also index by canonical key for name-based matching
    const key = buildCanonicalKey(t.artists, t.name);
    if (key && !existingByCanonicalKey.has(key)) {
      existingByCanonicalKey.set(key, { index: i, track: t });
    }
  }

  // 3. Process each scraper track
  const resultTracks: StoredTrack[] = [...existingTracks];

  for (const st of scraperTracks) {
    try {
      // Validate track has a name
      if (!st.name || typeof st.name !== "string" || st.name.trim() === "") {
        report.tracksSkipped++;
        report.errors.push({ trackName: "(unknown)", error: "Track has no name" });
        continue;
      }

      const scraperFields = extractScraperFields(st);

      // Determine the match key: prefer beatportId, fall back to canonical key
      let existing: { index: number; track: StoredTrack } | undefined;

      if (st.beatportId) {
        existing = existingByBpId.get(st.beatportId);
      }

      if (!existing) {
        // Try canonical key (artist + title)
        const canonicalKey = buildCanonicalKey(st.artists, st.name);
        existing = existingByCanonicalKey.get(canonicalKey);
      }

      if (existing) {
        // UPDATE: merge scraper fields into existing track
        const { merged } = mergeTrack(existing.track, scraperFields);
        resultTracks[existing.index] = merged;
        report.tracksUpdated++;
      } else {
        // CREATE: new track from scraper data
        const newId = st.canonicalId || st.key ||
          (st.beatportId ? `bp_${st.beatportId}` : buildCanonicalKey(st.artists, st.name));
        const newTrack = createTrackFromScraper(scraperFields, newId);
        resultTracks.push(newTrack);

        // Update indexes
        if (st.beatportId) {
          existingByBpId.set(st.beatportId, { index: resultTracks.length - 1, track: newTrack });
        }
        const canonicalKey = buildCanonicalKey(st.artists, st.name);
        if (canonicalKey) {
          existingByCanonicalKey.set(canonicalKey, { index: resultTracks.length - 1, track: newTrack });
        }

        report.tracksCreated++;
      }
    } catch (err: any) {
      report.tracksSkipped++;
      report.errors.push({
        trackName: st?.name || "(unknown)",
        error: err?.message || String(err),
      });
    }
  }

  report.durationMs = Date.now() - startTime;
  return { tracks: resultTracks, report };
}

// ==================== SUPABASE PERSISTENCE ====================

/** The cloud row id for global tracks. */
const GLOBAL_TRACKS_ROW_ID = "global_tracks";
/** The Supabase table name. */
const CLOUD_TABLE = "app_state";

/**
 * Push the imported tracks to the Supabase global tracks row.
 *
 * @param supabase - Authenticated Supabase client (service_role recommended).
 * @param tracks - The merged tracks array to push.
 * @returns { ok: boolean; error?: string }
 */
export async function pushTracksToGlobalRow(
  supabase: SupabaseClient,
  tracks: StoredTrack[],
): Promise<{ ok: boolean; error?: string }> {
  try {
    // Strip personal fields — global row contains only Beatport-sourced data
    const globalTracks = tracks.map((t) => {
      const out: Record<string, any> = {};
      for (const f of TRACK_SCRAPER_FIELDS) {
        if ((t as any)[f] !== undefined) {
          out[f] = (t as any)[f];
        }
      }
      // Include id and derived fields
      out.id = t.id;
      out.beatportUrl = t.beatportUrl;
      out.rankByGenre = t.rankByGenre;
      out.pointsByGenre = t.pointsByGenre;
      out.prevRankByGenre = t.prevRankByGenre;
      out.firstSeenAt = t.firstSeenAt;
      out.lastSeenAt = t.lastSeenAt;
      return out;
    });

    const { error } = await supabase.from(CLOUD_TABLE).upsert(
      {
        id: GLOBAL_TRACKS_ROW_ID,
        data: { tracks: globalTracks, savedAt: new Date().toISOString() },
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
 * Fetch the current global tracks from Supabase.
 *
 * @param supabase - Authenticated Supabase client.
 * @returns { tracks: StoredTrack[]; error?: string }
 */
export async function fetchGlobalTracks(
  supabase: SupabaseClient,
): Promise<{ tracks: StoredTrack[]; error?: string }> {
  try {
    const { data, error } = await supabase
      .from(CLOUD_TABLE)
      .select("data")
      .eq("id", GLOBAL_TRACKS_ROW_ID)
      .maybeSingle();

    if (error) {
      return { tracks: [], error: error.message };
    }

    const tracks: StoredTrack[] = (data?.data?.tracks as StoredTrack[]) || [];
    return { tracks };
  } catch (err: any) {
    return { tracks: [], error: err?.message || String(err) };
  }
}

// ==================== FULL PIPELINE ====================

/**
 * Full import pipeline: read JSON, merge with existing tracks, push to cloud.
 *
 * @param scraperJson - Parsed JSON object from beatport-scraper-v2.js.
 * @param supabaseUrl - Supabase project URL.
 * @param supabaseServiceKey - Supabase service_role key.
 * @param options - Optional: dryRun (don't push to cloud).
 * @returns TrackImportReport
 */
export async function runTrackImport(
  scraperJson: any,
  supabaseUrl: string,
  supabaseServiceKey: string,
  options?: { dryRun?: boolean },
): Promise<TrackImportReport> {
  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  // 1. Fetch existing global tracks
  const { tracks: existingTracks, error: fetchError } = await fetchGlobalTracks(supabase);
  if (fetchError) {
    console.error("[BP-003] Failed to fetch global tracks:", fetchError);
    return {
      totalInFile: 0,
      tracksCreated: 0,
      tracksUpdated: 0,
      tracksSkipped: 0,
      errors: [{ trackName: "(cloud)", error: fetchError }],
      durationMs: 0,
    };
  }

  console.log(`[BP-003] Fetched ${existingTracks.length} existing tracks from global row`);

  // 2. Run the pure-logic import
  const { tracks: mergedTracks, report } = importTracksFromScraperJson(existingTracks, scraperJson);

  console.log(
    `[BP-003] Import result: ${report.tracksCreated} created, ${report.tracksUpdated} updated, ${report.tracksSkipped} skipped, ${report.errors.length} errors`,
  );

  // 3. Push to cloud (unless dry-run)
  if (!options?.dryRun) {
    const { ok, error: pushError } = await pushTracksToGlobalRow(supabase, mergedTracks);
    if (!ok) {
      report.errors.push({ trackName: "(cloud push)", error: pushError || "Unknown push error" });
    } else {
      console.log(`[BP-003] Pushed ${mergedTracks.length} tracks to global row`);
    }
  } else {
    console.log("[BP-003] Dry-run mode: skipping cloud push");
  }

  return report;
}
