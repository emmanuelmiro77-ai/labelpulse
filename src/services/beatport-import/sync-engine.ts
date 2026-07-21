/**
 * BP-004 — Beatport Sync Engine
 *
 * Orchestrates the full Beatport import pipeline by calling the three
 * existing import services in the mandatory order:
 *
 *   1. Label Import   (BP-001)
 *   2. Artist Import  (BP-002)
 *   3. Track Import   (BP-003)
 *
 * If any step fails (returns errors that indicate a systemic failure),
 * the pipeline is interrupted immediately and the report is returned
 * with the failure point marked.
 *
 * ISOLATION:
 * - This module ONLY calls the existing import services. It does NOT
 *   implement any import logic itself.
 * - It does NOT modify any existing flow, component, store, or API.
 * - It is NOT connected to the UI.
 */

import { runLabelImport, type ImportReport } from "./label-import";
import { runArtistImport, type ArtistImportReport } from "./artist-import";
import { runTrackImport, type TrackImportReport } from "./track-import";

// ==================== TYPES ====================

/** Report for a single import step. */
interface StepReport {
  created: number;
  updated: number;
  skipped: number;
  errors: Array<{ name: string; error: string }>;
  durationMs: number;
}

/** Aggregated final report from the sync engine. */
export interface SyncReport {
  success: boolean;
  startedAt: string;
  finishedAt: string;
  durationMs: number;

  labels: StepReport;
  artists: StepReport;
  tracks: StepReport;

  totals: {
    created: number;
    updated: number;
    skipped: number;
    errors: number;
  };

  /** Which step failed, if any ("labels" | "artists" | "tracks" | null). */
  failedAt: "labels" | "artists" | "tracks" | null;
}

// ==================== HELPERS ====================

/**
 * Determine if a report indicates a systemic failure (not just individual
 * row errors). A step is considered "failed" if:
 * - It produced zero created AND zero updated (nothing was imported), OR
 * - The errors array has an entry with labelName/artistName/trackName
 *   starting with "(" (indicating a file-level or cloud-level error,
 *   not a per-row error).
 */
function isStepFailed(
  report: ImportReport | ArtistImportReport | TrackImportReport,
  entity: "labels" | "artists" | "tracks",
): boolean {
  // Check for systemic errors (file-level or cloud-level)
  const hasSystemicError = report.errors.some((e: any) => {
    const name = e.labelName || e.artistName || e.trackName || "";
    return name.startsWith("(");
  });
  if (hasSystemicError) return true;

  // Check if nothing was imported at all
  const created =
    entity === "labels"
      ? (report as ImportReport).created
      : entity === "artists"
        ? (report as ArtistImportReport).artistsCreated
        : (report as TrackImportReport).tracksCreated;

  const updated =
    entity === "labels"
      ? (report as ImportReport).updated
      : entity === "artists"
        ? (report as ArtistImportReport).artistsUpdated
        : (report as TrackImportReport).tracksUpdated;

  // If there were items in the file but nothing was created or updated,
  // and there are errors, it's a failure.
  if (report.totalInFile > 0 && created === 0 && updated === 0 && report.errors.length > 0) {
    return true;
  }

  return false;
}

/**
 * Convert an ImportReport into a StepReport.
 */
function labelReportToStep(r: ImportReport): StepReport {
  return {
    created: r.created,
    updated: r.updated,
    skipped: r.skipped,
    errors: r.errors.map((e) => ({ name: e.labelName, error: e.error })),
    durationMs: r.durationMs,
  };
}

/**
 * Convert an ArtistImportReport into a StepReport.
 */
function artistReportToStep(r: ArtistImportReport): StepReport {
  return {
    created: r.artistsCreated,
    updated: r.artistsUpdated,
    skipped: r.artistsSkipped,
    errors: r.errors.map((e) => ({ name: e.artistName, error: e.error })),
    durationMs: r.durationMs,
  };
}

/**
 * Convert a TrackImportReport into a StepReport.
 */
function trackReportToStep(r: TrackImportReport): StepReport {
  return {
    created: r.tracksCreated,
    updated: r.tracksUpdated,
    skipped: r.tracksSkipped,
    errors: r.errors.map((e) => ({ name: e.trackName, error: e.error })),
    durationMs: r.durationMs,
  };
}

/**
 * Create an empty StepReport (used when a step is skipped due to failure).
 */
function emptyStep(): StepReport {
  return { created: 0, updated: 0, skipped: 0, errors: [], durationMs: 0 };
}

// ==================== VALIDATION ====================

/**
 * Validate the scraper JSON has the required structure.
 * Returns an error message string if invalid, null if valid.
 */
function validateScraperJson(scraperJson: any): string | null {
  if (!scraperJson || typeof scraperJson !== "object") {
    return "Invalid JSON: not an object";
  }

  if (!scraperJson._meta || typeof scraperJson._meta !== "object") {
    return "Missing _meta object — not a valid scraper JSON";
  }

  if (scraperJson._meta.source !== "beatport") {
    return `_meta.source is "${scraperJson._meta.source}", expected "beatport"`;
  }

  // At least one entity array must be present and non-empty
  const hasLabels = Array.isArray(scraperJson.labels) && scraperJson.labels.length > 0;
  const hasArtists = Array.isArray(scraperJson.artists) && scraperJson.artists.length > 0;
  const hasTracks = Array.isArray(scraperJson.tracks) && scraperJson.tracks.length > 0;

  if (!hasLabels && !hasArtists && !hasTracks) {
    return "No labels, artists, or tracks arrays found in JSON (all empty or missing)";
  }

  return null;
}

// ==================== SYNC ENGINE ====================

/**
 * Run the full Beatport sync pipeline.
 *
 * Order: Labels → Artists → Tracks
 * If any step fails, the pipeline is interrupted immediately.
 *
 * @param scraperJson - Parsed JSON object from beatport-scraper-v2.js.
 * @param supabaseUrl - Supabase project URL.
 * @param supabaseServiceKey - Supabase service_role key.
 * @param options - Optional: dryRun (don't push to cloud).
 * @returns SyncReport
 */
export async function runBeatportSync(
  scraperJson: any,
  supabaseUrl: string,
  supabaseServiceKey: string,
  options?: { dryRun?: boolean },
): Promise<SyncReport> {
  const startedAt = new Date().toISOString();
  const startTime = Date.now();
  const dryRun = options?.dryRun === true;

  console.log(`[BP-004] Sync engine started${dryRun ? " (DRY RUN)" : ""}`);

  // Default report (all empty)
  const report: SyncReport = {
    success: false,
    startedAt,
    finishedAt: "",
    durationMs: 0,
    labels: emptyStep(),
    artists: emptyStep(),
    tracks: emptyStep(),
    totals: { created: 0, updated: 0, skipped: 0, errors: 0 },
    failedAt: null,
  };

  // 1. Validate the scraper JSON
  const validationError = validateScraperJson(scraperJson);
  if (validationError) {
    report.labels.errors.push({ name: "(validation)", error: validationError });
    report.totals.errors = 1;
    report.failedAt = "labels";
    report.finishedAt = new Date().toISOString();
    report.durationMs = Date.now() - startTime;
    console.error(`[BP-004] Validation failed: ${validationError}`);
    return report;
  }

  console.log(`[BP-004] JSON valid. Labels: ${scraperJson.labels?.length || 0}, Artists: ${scraperJson.artists?.length || 0}, Tracks: ${scraperJson.tracks?.length || 0}`);

  // 2. Step 1 — Label Import
  try {
    console.log("[BP-004] Step 1/3: Label Import...");
    const labelReport = await runLabelImport(scraperJson, supabaseUrl, supabaseServiceKey, { dryRun });
    report.labels = labelReportToStep(labelReport);

    if (isStepFailed(labelReport, "labels")) {
      report.failedAt = "labels";
      report.finishedAt = new Date().toISOString();
      report.durationMs = Date.now() - startTime;
      report.totals.errors = report.labels.errors.length;
      console.error("[BP-004] Label Import FAILED — pipeline interrupted");
      return report;
    }

    console.log(`[BP-004] Label Import OK: ${report.labels.created} created, ${report.labels.updated} updated`);
  } catch (err: any) {
    report.labels.errors.push({ name: "(exception)", error: err?.message || String(err) });
    report.failedAt = "labels";
    report.finishedAt = new Date().toISOString();
    report.durationMs = Date.now() - startTime;
    report.totals.errors = report.labels.errors.length;
    console.error("[BP-004] Label Import EXCEPTION — pipeline interrupted:", err);
    return report;
  }

  // 3. Step 2 — Artist Import
  try {
    console.log("[BP-004] Step 2/3: Artist Import...");
    const artistReport = await runArtistImport(scraperJson, supabaseUrl, supabaseServiceKey, { dryRun });
    report.artists = artistReportToStep(artistReport);

    if (isStepFailed(artistReport, "artists")) {
      report.failedAt = "artists";
      report.finishedAt = new Date().toISOString();
      report.durationMs = Date.now() - startTime;
      report.totals.errors = report.labels.errors.length + report.artists.errors.length;
      console.error("[BP-004] Artist Import FAILED — pipeline interrupted");
      return report;
    }

    console.log(`[BP-004] Artist Import OK: ${report.artists.created} created, ${report.artists.updated} updated`);
  } catch (err: any) {
    report.artists.errors.push({ name: "(exception)", error: err?.message || String(err) });
    report.failedAt = "artists";
    report.finishedAt = new Date().toISOString();
    report.durationMs = Date.now() - startTime;
    report.totals.errors = report.labels.errors.length + report.artists.errors.length;
    console.error("[BP-004] Artist Import EXCEPTION — pipeline interrupted:", err);
    return report;
  }

  // 4. Step 3 — Track Import
  try {
    console.log("[BP-004] Step 3/3: Track Import...");
    const trackReport = await runTrackImport(scraperJson, supabaseUrl, supabaseServiceKey, { dryRun });
    report.tracks = trackReportToStep(trackReport);

    if (isStepFailed(trackReport, "tracks")) {
      report.failedAt = "tracks";
      report.finishedAt = new Date().toISOString();
      report.durationMs = Date.now() - startTime;
      report.totals.errors = report.labels.errors.length + report.artists.errors.length + report.tracks.errors.length;
      console.error("[BP-004] Track Import FAILED — pipeline interrupted");
      return report;
    }

    console.log(`[BP-004] Track Import OK: ${report.tracks.created} created, ${report.tracks.updated} updated`);
  } catch (err: any) {
    report.tracks.errors.push({ name: "(exception)", error: err?.message || String(err) });
    report.failedAt = "tracks";
    report.finishedAt = new Date().toISOString();
    report.durationMs = Date.now() - startTime;
    report.totals.errors = report.labels.errors.length + report.artists.errors.length + report.tracks.errors.length;
    console.error("[BP-004] Track Import EXCEPTION — pipeline interrupted:", err);
    return report;
  }

  // 5. Compute totals
  report.totals.created = report.labels.created + report.artists.created + report.tracks.created;
  report.totals.updated = report.labels.updated + report.artists.updated + report.tracks.updated;
  report.totals.skipped = report.labels.skipped + report.artists.skipped + report.tracks.skipped;
  report.totals.errors = report.labels.errors.length + report.artists.errors.length + report.tracks.errors.length;

  // 6. Finalize
  report.success = report.failedAt === null;
  report.finishedAt = new Date().toISOString();
  report.durationMs = Date.now() - startTime;

  console.log(
    `[BP-004] Sync engine completed${dryRun ? " (DRY RUN)" : ""}: ` +
    `${report.totals.created} created, ${report.totals.updated} updated, ` +
    `${report.totals.skipped} skipped, ${report.totals.errors} errors ` +
    `in ${report.durationMs}ms`,
  );

  return report;
}
