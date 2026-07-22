/**
 * BP-001 — Beatport Import Service (Labels only)
 *
 * Isolated service that reads a JSON file produced by beatport-scraper-v2,
 * iterates only the `labels` array, and upserts each label into Supabase
 * (global row of `app_state` table).
 *
 * RULES:
 * - Reads ONLY the `labels` array from the scraper JSON.
 * - Uses the normalized label name as the primary key.
 * - Updates ONLY scraper-sourced fields (name, imageUrl, genres, rankByGenre,
 *   pointsByGenre, trending, trendingRankByGenre, trendingPointsByGenre,
 *   beatportLink, slug, beatportId).
 * - Preserves ALL user-entered data (notes, emails, website, demoLink,
 *   socialLink, soundcloudLink, customLinks, contactInfo, status,
 *   submissionType, genre, createdAt, isFavorite, isCustom).
 * - Never deletes existing records.
 * - Produces a final report: created, updated, skipped, errors.
 *
 * ISOLATION:
 * - This service is NOT connected to the UI.
 * - It does NOT modify any existing flow.
 * - It does NOT modify React components, Track Importer, Artist Explorer,
 *   Label Finder, or the scraper.
 */

import { createClient, SupabaseClient } from "@supabase/supabase-js";

// ==================== TYPES ====================

/** Fields that come from the scraper and can be overwritten on import. */
const SCRAPER_FIELDS = [
  "name",
  "imageUrl",
  "genres",
  "rankByGenre",
  "pointsByGenre",
  "trending",
  "trendingRankByGenre",
  "trendingPointsByGenre",
  "beatportLink",
  "slug",
  "beatportId",
  "prevRankByGenre",
] as const;

/** Fields that are user-owned and must NEVER be touched by the importer. */
const PERSONAL_FIELDS = [
  "emails",
  "contactInfo",
  "website",
  "demoLink",
  "socialLink",
  "soundcloudLink",
  "customLinks",
  "notes",
  "status",
  "submissionType",
  "genre",
  "createdAt",
  "isFavorite",
  "isCustom",
] as const;

/** Shape of a label entry in the scraper JSON output. */
interface ScraperLabel {
  // Canonical / legacy id (from scraper)
  canonicalId?: string;
  id?: string;
  beatportId?: number | null;
  name: string;
  slug?: string;
  imageUrl?: string;
  genres?: string[];
  rankByGenre?: Record<string, number>;
  pointsByGenre?: Record<string, number>;
  trending?: boolean;
  trendingRankByGenre?: Record<string, number>;
  trendingPointsByGenre?: Record<string, number>;
  // Legacy fields
  key?: string;
}

/** Shape of a label as stored in the global app_state row. */
interface StoredLabel {
  id: string;
  name: string;
  genres?: string[];
  rankByGenre?: Record<string, number>;
  pointsByGenre?: Record<string, number>;
  trending?: boolean;
  trendingRankByGenre?: Record<string, number>;
  trendingPointsByGenre?: Record<string, number>;
  imageUrl?: string;
  slug?: string;
  beatportId?: number | null;
  beatportLink?: string;
  prevRankByGenre?: Record<string, number>;
  // Personal fields (preserved, never overwritten)
  emails?: string[];
  contactInfo?: string;
  website?: string;
  demoLink?: string;
  socialLink?: string;
  soundcloudLink?: string;
  customLinks?: { type: string; value: string }[];
  notes?: string;
  status?: string;
  submissionType?: string;
  genre?: string;
  createdAt?: string;
  isFavorite?: boolean;
  isCustom?: boolean;
}

/** Final report produced by the import. */
export interface ImportReport {
  totalInFile: number;
  created: number;
  updated: number;
  skipped: number;
  errors: Array<{ labelName: string; error: string }>;
  durationMs: number;
}

// ==================== UTILITIES ====================

/**
 * Normalize a label name for use as a stable key.
 * Uppercase, trimmed, collapses internal whitespace.
 */
function normalizeName(name: string): string {
  return (name || "").toUpperCase().trim().replace(/\s+/g, " ");
}

/**
 * Build the Beatport URL for a label from its slug and beatportId.
 */
function buildBeatportLink(slug?: string, beatportId?: number | null): string | undefined {
  if (slug && beatportId) {
    return `https://www.beatport.com/label/${slug}/${beatportId}`;
  }
  return undefined;
}

/**
 * Extract only the scraper-sourced fields from a ScraperLabel.
 * Personal fields are never included.
 */
function extractScraperFields(sl: ScraperLabel): Partial<StoredLabel> {
  const out: Partial<StoredLabel> = {};

  // name (always present)
  out.name = sl.name;

  // imageUrl
  if (sl.imageUrl !== undefined) {
    out.imageUrl = sl.imageUrl || undefined;
  }

  // genres
  if (Array.isArray(sl.genres)) {
    out.genres = sl.genres;
  }

  // rankByGenre
  if (sl.rankByGenre && typeof sl.rankByGenre === "object") {
    out.rankByGenre = sl.rankByGenre;
  }

  // pointsByGenre
  if (sl.pointsByGenre && typeof sl.pointsByGenre === "object") {
    out.pointsByGenre = sl.pointsByGenre;
  }

  // trending
  if (typeof sl.trending === "boolean") {
    out.trending = sl.trending;
  }

  // trendingRankByGenre
  if (sl.trendingRankByGenre && typeof sl.trendingRankByGenre === "object") {
    out.trendingRankByGenre = sl.trendingRankByGenre;
  }

  // trendingPointsByGenre
  if (sl.trendingPointsByGenre && typeof sl.trendingPointsByGenre === "object") {
    out.trendingPointsByGenre = sl.trendingPointsByGenre;
  }

  // beatportLink (derived from slug + beatportId)
  const bpLink = buildBeatportLink(sl.slug, sl.beatportId);
  if (bpLink) {
    out.beatportLink = bpLink;
  }

  // slug
  if (sl.slug !== undefined) {
    out.slug = sl.slug || undefined;
  }

  // beatportId
  if (sl.beatportId !== undefined) {
    out.beatportId = sl.beatportId || null;
  }

  return out;
}

/**
 * Merge a scraper label into an existing stored label.
 * Only scraper-sourced fields are overwritten; personal fields are preserved.
 */
function mergeLabel(existing: StoredLabel, scraperFields: Partial<StoredLabel>): StoredLabel {
  const merged: StoredLabel = { ...existing };

  // Overwrite only scraper-sourced fields
  for (const field of SCRAPER_FIELDS) {
    if (scraperFields[field] !== undefined) {
      // Guard: never overwrite a valid existing name with null, undefined,
      // empty string, or "Unknown". The scraper name is only applied when
      // it contains a real value. This protects personal/manual labels
      // that may have a user-customized name.
      if (field === "name") {
        const newName = scraperFields.name;
        if (newName && typeof newName === "string" && newName.trim() !== "" && newName !== "Unknown") {
          merged.name = newName;
        }
        // Otherwise: keep existing name (already set via spread above)
        continue;
      }
      (merged as any)[field] = scraperFields[field];
    }
  }

  // Ensure personal fields are preserved (they already are via spread, but
  // we explicitly list them here for documentation and safety)
  for (const field of PERSONAL_FIELDS) {
    if (existing[field as keyof StoredLabel] !== undefined) {
      (merged as any)[field] = existing[field as keyof StoredLabel];
    }
  }

  return merged;
}

/**
 * Create a new StoredLabel from scraper data.
 * Personal fields get safe defaults.
 */
function createLabelFromScraper(scraperFields: Partial<StoredLabel>, id: string): StoredLabel {
  return {
    id,
    // "Unknown" is only used when the record truly has no name.
    name: (scraperFields.name && typeof scraperFields.name === "string" && scraperFields.name.trim() !== "")
      ? scraperFields.name
      : "Unknown",
    genres: scraperFields.genres || [],
    rankByGenre: scraperFields.rankByGenre || {},
    pointsByGenre: scraperFields.pointsByGenre || {},
    trending: scraperFields.trending || false,
    trendingRankByGenre: scraperFields.trendingRankByGenre || {},
    trendingPointsByGenre: scraperFields.trendingPointsByGenre || {},
    imageUrl: scraperFields.imageUrl || "",
    slug: scraperFields.slug || "",
    beatportId: scraperFields.beatportId || null,
    beatportLink: scraperFields.beatportLink || "",
    prevRankByGenre: scraperFields.prevRankByGenre || {},
    // Personal field defaults
    emails: [],
    contactInfo: "",
    website: "",
    demoLink: "",
    socialLink: "",
    soundcloudLink: "",
    customLinks: [],
    notes: "",
    status: "to_contact",
    submissionType: "demo",
    genre: (scraperFields.genres && scraperFields.genres[0]) || "",
    createdAt: new Date().toISOString(),
    isFavorite: false,
    isCustom: false,
    ...scraperFields, // spread scraper fields on top (they take priority for scraper-sourced fields)
  };
}

// ==================== CORE IMPORT LOGIC ====================

/**
 * Import labels from a parsed scraper JSON object.
 *
 * This is the pure-logic core: it takes the existing labels array and the
 * scraper JSON, produces a new labels array + report. No Supabase I/O.
 *
 * @param existingLabels - Current labels in the store (global row).
 * @param scraperJson - Parsed JSON from beatport-scraper-v2.js output.
 * @returns { labels: StoredLabel[], report: ImportReport }
 */
export function importLabelsFromScraperJson(
  existingLabels: StoredLabel[],
  scraperJson: any,
): { labels: StoredLabel[]; report: ImportReport } {
  const startTime = Date.now();
  const report: ImportReport = {
    totalInFile: 0,
    created: 0,
    updated: 0,
    skipped: 0,
    errors: [],
    durationMs: 0,
  };

  // 1. Validate input
  if (!scraperJson || typeof scraperJson !== "object") {
    report.errors.push({ labelName: "(file)", error: "Invalid JSON: not an object" });
    report.durationMs = Date.now() - startTime;
    return { labels: existingLabels, report };
  }

  const scraperLabels: ScraperLabel[] = Array.isArray(scraperJson.labels) ? scraperJson.labels : [];

  if (scraperLabels.length === 0) {
    report.errors.push({ labelName: "(file)", error: "No labels array found in JSON" });
    report.durationMs = Date.now() - startTime;
    return { labels: existingLabels, report };
  }

  report.totalInFile = scraperLabels.length;

  // 2. Index existing labels by normalized name for fast lookup
  const existingByName = new Map<string, { index: number; label: StoredLabel }>();
  for (let i = 0; i < existingLabels.length; i++) {
    const norm = normalizeName(existingLabels[i].name);
    if (norm && !existingByName.has(norm)) {
      existingByName.set(norm, { index: i, label: existingLabels[i] });
    }
  }

  // 3. Process each scraper label
  const resultLabels: StoredLabel[] = [...existingLabels];

  for (const sl of scraperLabels) {
    try {
      // Validate label has a name
      if (!sl.name || typeof sl.name !== "string" || sl.name.trim() === "") {
        report.skipped++;
        report.errors.push({ labelName: "(unknown)", error: "Label has no name" });
        continue;
      }

      const normName = normalizeName(sl.name);
      const scraperFields = extractScraperFields(sl);
      const existing = existingByName.get(normName);

      if (existing) {
        // UPDATE: merge scraper fields into existing label, preserve personal fields
        const merged = mergeLabel(existing.label, scraperFields);

        // Compute prevRankByGenre: save the old rankByGenre as prevRankByGenre
        // before overwriting with new ranks (only if new ranks differ)
        if (scraperFields.rankByGenre && existing.label.rankByGenre) {
          const oldRanks = JSON.stringify(existing.label.rankByGenre);
          const newRanks = JSON.stringify(scraperFields.rankByGenre);
          if (oldRanks !== newRanks) {
            merged.prevRankByGenre = { ...existing.label.rankByGenre };
          }
        }

        resultLabels[existing.index] = merged;
        report.updated++;
      } else {
        // CREATE: new label from scraper data
        const newId = sl.canonicalId || sl.id || `lbl_${normName.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/_+$/, "")}`;
        const newLabel = createLabelFromScraper(scraperFields, newId);
        resultLabels.push(newLabel);
        existingByName.set(normName, { index: resultLabels.length - 1, label: newLabel });
        report.created++;
      }
    } catch (err: any) {
      report.skipped++;
      report.errors.push({
        labelName: sl?.name || "(unknown)",
        error: err?.message || String(err),
      });
    }
  }

  report.durationMs = Date.now() - startTime;
  return { labels: resultLabels, report };
}

// ==================== SUPABASE PERSISTENCE ====================

/**
 * Push the imported labels to the Supabase global row (app_state, id='global').
 *
 * This writes ONLY the Beatport-sourced fields (strips personal data before
 * pushing, same as the existing push-rankings API).
 *
 * @param supabase - Authenticated Supabase client (service_role recommended).
 * @param labels - The merged labels array to push.
 * @param rankingSnapshots - Optional ranking snapshots to include.
 * @returns { ok: boolean; error?: string }
 */
export async function pushLabelsToGlobalRow(
  supabase: SupabaseClient,
  labels: StoredLabel[],
  rankingSnapshots?: any[],
): Promise<{ ok: boolean; error?: string }> {
  try {
    // Strip personal fields — global row should only contain Beatport-sourced data
    const globalLabels = labels
      .filter((l) => l && !l.isCustom)
      .map((l) => {
        const out: Record<string, any> = {};
        for (const f of SCRAPER_FIELDS) {
          if ((l as any)[f] !== undefined) {
            out[f] = (l as any)[f];
          }
        }
        // Include id for matching
        out.id = l.id;
        return out;
      });

    const payload = {
      labels: globalLabels,
      rankingSnapshots: rankingSnapshots || [],
      rankingsUpdatedAt: new Date().toISOString(),
      lastGlobalUpdate: new Date().toISOString(),
    };

    const { error } = await supabase.from("app_state").upsert(
      {
        id: "global",
        data: payload,
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
 * Fetch the current global labels from Supabase (app_state, id='global').
 *
 * @param supabase - Authenticated Supabase client.
 * @returns { labels: StoredLabel[]; error?: string }
 */
export async function fetchGlobalLabels(
  supabase: SupabaseClient,
): Promise<{ labels: StoredLabel[]; error?: string }> {
  try {
    const { data, error } = await supabase
      .from("app_state")
      .select("data")
      .eq("id", "global")
      .maybeSingle();

    if (error) {
      return { labels: [], error: error.message };
    }

    const labels: StoredLabel[] = (data?.data?.labels as StoredLabel[]) || [];
    return { labels };
  } catch (err: any) {
    return { labels: [], error: err?.message || String(err) };
  }
}

// ==================== FULL PIPELINE ====================

/**
 * Full import pipeline: read JSON, merge with existing labels, push to cloud.
 *
 * @param scraperJson - Parsed JSON object from beatport-scraper-v2.js.
 * @param supabaseUrl - Supabase project URL.
 * @param supabaseServiceKey - Supabase service_role key (bypasses RLS for global row).
 * @param options - Optional: dryRun (don't push to cloud), rankingSnapshots.
 * @returns ImportReport
 */
export async function runLabelImport(
  scraperJson: any,
  supabaseUrl: string,
  supabaseServiceKey: string,
  options?: { dryRun?: boolean; rankingSnapshots?: any[] },
): Promise<ImportReport> {
  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  // 1. Fetch existing global labels
  const { labels: existingLabels, error: fetchError } = await fetchGlobalLabels(supabase);
  if (fetchError) {
    console.error("[BP-001] Failed to fetch global labels:", fetchError);
    return {
      totalInFile: 0,
      created: 0,
      updated: 0,
      skipped: 0,
      errors: [{ labelName: "(cloud)", error: fetchError }],
      durationMs: 0,
    };
  }

  console.log(`[BP-001] Fetched ${existingLabels.length} existing labels from global row`);

  // 2. Run the pure-logic import
  const { labels: mergedLabels, report } = importLabelsFromScraperJson(existingLabels, scraperJson);

  console.log(`[BP-001] Import result: ${report.created} created, ${report.updated} updated, ${report.skipped} skipped, ${report.errors.length} errors`);

  // 3. Push to cloud (unless dry-run)
  if (!options?.dryRun) {
    const { ok, error: pushError } = await pushLabelsToGlobalRow(
      supabase,
      mergedLabels,
      options?.rankingSnapshots,
    );
    if (!ok) {
      report.errors.push({ labelName: "(cloud push)", error: pushError || "Unknown push error" });
    } else {
      console.log(`[BP-001] Pushed ${mergedLabels.length} labels to global row`);
    }
  } else {
    console.log("[BP-001] Dry-run mode: skipping cloud push");
  }

  return report;
}
