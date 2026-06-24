/**
 * Supabase helpers for Beatport snapshots + chart history + diff.
 *
 * Schema: see supabase-schema-snapshots.sql
 *   - beatport_snapshots      (1 row per scrape session)
 *   - beatport_chart_history  (1 row per track-per-snapshot)
 *   - followed_artists        (user → artist tracking)
 */

import { createClient } from "@supabase/supabase-js";

// ---------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------

export interface SnapshotTrackInput {
  id: string | null;
  key: string;
  name: string;
  mixName?: string;
  slug?: string;
  artists: { id: string | number | null; name: string; slug?: string }[];
  remixers: { id: string | number | null; name: string; slug?: string }[];
  label: string;
  labelId?: string | number | null;
  labelSlug?: string;
  primaryGenre: string;
  subGenre?: string | null;
  bpm?: number | null;
  keyCamelot?: string;
  keyName?: string;
  releaseDate?: string;
  coverArt?: string;
  sampleUrl?: string;
  positions: { genre: string; position: number; points: number; seenAt: string }[];
}

export interface SnapshotInput {
  snapshotDate: string; // ISO date (YYYY-MM-DD) — defaults to today
  source?: string; // 'browser-scrape' | 'admin-import'
  totalGenres: number;
  totalLabels: number;
  totalArtists: number;
  totalTracks: number;
  incompleteGenres?: string[];
  notes?: string;
  tracks: SnapshotTrackInput[];
}

export interface DiffResult {
  snapshotId: number;
  previousSnapshotId: number | null;
  previousSnapshotDate: string | null;
  totalTracks: number;
  newEntries: number;
  reentries: number;
  climbers: number; // position_change >= 5
  fastClimbers: number; // position_change >= 15
  droppers: number; // position_change <= -5
  fastDroppers: number; // position_change <= -15
  stable: number; // |position_change| < 5
  // Per-genre breakdown for top movers
  topClimbers: { trackKey: string; name: string; genre: string; change: number; position: number }[];
  topDroppers: { trackKey: string; name: string; genre: string; change: number; position: number }[];
  topNewEntries: { trackKey: string; name: string; genre: string; position: number }[];
}

// ---------------------------------------------------------------------
// Supabase client (server-side, anon key)
// ---------------------------------------------------------------------

function getServerSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) {
    throw new Error(
      "Supabase env vars missing on server. Set NEXT_PUBLIC_SUPABASE_URL + NEXT_PUBLIC_SUPABASE_ANON_KEY."
    );
  }
  return createClient(url, key, {
    auth: { persistSession: false },
  });
}

// ---------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------

function todayDateString(): string {
  return new Date().toISOString().split("T")[0];
}

function artistIdsArray(artists: SnapshotTrackInput["artists"]): string[] {
  return artists
    .map((a) => (a.id ? `bp_${a.id}` : `nm_${a.name.toUpperCase().trim()}`))
    .filter(Boolean);
}

function artistNamesArray(artists: SnapshotTrackInput["artists"]): string[] {
  return artists.map((a) => a.name).filter(Boolean);
}

// ---------------------------------------------------------------------
// getPreviousSnapshot
// ---------------------------------------------------------------------

export async function getPreviousSnapshot(currentSnapshotDate: string): Promise<{
  id: number;
  snapshotDate: string;
} | null> {
  const supabase = getServerSupabase();
  const { data, error } = await supabase
    .from("beatport_snapshots")
    .select("id, snapshot_date")
    .lt("snapshot_date", currentSnapshotDate)
    .order("snapshot_date", { ascending: false })
    .limit(1)
    .single();
  if (error || !data) return null;
  return { id: data.id, snapshotDate: data.snapshot_date };
}

// ---------------------------------------------------------------------
// loadPreviousPositions
// Returns Map<trackKey|genre, { position, weeksInChart }>
// ---------------------------------------------------------------------

export async function loadPreviousPositions(
  previousSnapshotId: number
): Promise<Map<string, { position: number; weeksInChart: number }>> {
  const supabase = getServerSupabase();
  const map = new Map<string, { position: number; weeksInChart: number }>();
  let offset = 0;
  const pageSize = 1000;
  // Paginate to handle ~3400+ rows
  while (true) {
    const { data, error } = await supabase
      .from("beatport_chart_history")
      .select("track_id, genre, position, weeks_in_chart")
      .eq("snapshot_id", previousSnapshotId)
      .range(offset, offset + pageSize - 1);
    if (error) {
      console.error("[snapshots] loadPreviousPositions error:", error);
      break;
    }
    if (!data || data.length === 0) break;
    for (const row of data) {
      const key = `${row.track_id}|${row.genre}`;
      map.set(key, {
        position: row.position,
        weeksInChart: row.weeks_in_chart || 1,
      });
    }
    if (data.length < pageSize) break;
    offset += pageSize;
  }
  return map;
}

// ---------------------------------------------------------------------
// saveSnapshot — main entry point
// ---------------------------------------------------------------------

export async function saveSnapshot(
  input: SnapshotInput
): Promise<DiffResult> {
  const supabase = getServerSupabase();
  const snapshotDate = input.snapshotDate || todayDateString();

  // 1. Find (or create) the snapshot row
  // Upsert by snapshot_date — if same-day scrape, REPLACE the snapshot
  const { data: existingSnap, error: existingErr } = await supabase
    .from("beatport_snapshots")
    .select("id")
    .eq("snapshot_date", snapshotDate)
    .maybeSingle();

  let snapshotId: number;
  if (existingErr) {
    console.error("[snapshots] error looking up existing snapshot:", existingErr);
    throw new Error(`Failed to check existing snapshot: ${existingErr.message}`);
  }

  if (existingSnap) {
    // Same-day snapshot exists — delete its chart history rows, then update metadata
    snapshotId = existingSnap.id;
    await supabase
      .from("beatport_chart_history")
      .delete()
      .eq("snapshot_id", snapshotId);
    await supabase
      .from("beatport_snapshots")
      .update({
        source: input.source || "browser-scrape",
        total_genres: input.totalGenres,
        total_labels: input.totalLabels,
        total_artists: input.totalArtists,
        total_tracks: input.totalTracks,
        incomplete_genres: input.incompleteGenres || [],
        notes: input.notes || null,
        created_at: new Date().toISOString(),
      })
      .eq("id", snapshotId);
  } else {
    // Insert new snapshot row
    const { data: newSnap, error: insertErr } = await supabase
      .from("beatport_snapshots")
      .insert({
        snapshot_date: snapshotDate,
        source: input.source || "browser-scrape",
        total_genres: input.totalGenres,
        total_labels: input.totalLabels,
        total_artists: input.totalArtists,
        total_tracks: input.totalTracks,
        incomplete_genres: input.incompleteGenres || [],
        notes: input.notes || null,
      })
      .select("id")
      .single();
    if (insertErr || !newSnap) {
      throw new Error(`Failed to create snapshot row: ${insertErr?.message}`);
    }
    snapshotId = newSnap.id;
  }

  // 2. Load previous snapshot + positions for diff
  const previous = await getPreviousSnapshot(snapshotDate);
  const previousPositions = previous
    ? await loadPreviousPositions(previous.id)
    : new Map<string, { position: number; weeksInChart: number }>();

  // 3. Build chart_history rows with diff fields
  const rows: any[] = [];
  const diffStats = {
    newEntries: 0,
    reentries: 0,
    climbers: 0,
    fastClimbers: 0,
    droppers: 0,
    fastDroppers: 0,
    stable: 0,
  };
  const movers = {
    topClimbers: [] as DiffResult["topClimbers"],
    topDroppers: [] as DiffResult["topDroppers"],
    topNewEntries: [] as DiffResult["topNewEntries"],
  };

  for (const track of input.tracks) {
    for (const pos of track.positions) {
      const key = `${track.key}|${pos.genre}`;
      const prev = previousPositions.get(key);

      let prevPosition: number | null = null;
      let positionChange: number | null = null;
      let isNewEntry = false;
      let isReentry = false;
      let weeksInChart = 1;

      if (prev) {
        prevPosition = prev.position;
        positionChange = prev.position - pos.position; // positive = climbed
        weeksInChart = (prev.weeksInChart || 1) + 1;
        if (Math.abs(positionChange) < 5) {
          diffStats.stable++;
        } else if (positionChange >= 15) {
          diffStats.fastClimbers++;
          diffStats.climbers++;
          movers.topClimbers.push({
            trackKey: track.key,
            name: track.name,
            genre: pos.genre,
            change: positionChange,
            position: pos.position,
          });
        } else if (positionChange >= 5) {
          diffStats.climbers++;
          movers.topClimbers.push({
            trackKey: track.key,
            name: track.name,
            genre: pos.genre,
            change: positionChange,
            position: pos.position,
          });
        } else if (positionChange <= -15) {
          diffStats.fastDroppers++;
          diffStats.droppers++;
          movers.topDroppers.push({
            trackKey: track.key,
            name: track.name,
            genre: pos.genre,
            change: positionChange,
            position: pos.position,
          });
        } else if (positionChange <= -5) {
          diffStats.droppers++;
          movers.topDroppers.push({
            trackKey: track.key,
            name: track.name,
            genre: pos.genre,
            change: positionChange,
            position: pos.position,
          });
        }
      } else {
        isNewEntry = true;
        diffStats.newEntries++;
        movers.topNewEntries.push({
          trackKey: track.key,
          name: track.name,
          genre: pos.genre,
          position: pos.position,
        });
      }

      rows.push({
        snapshot_id: snapshotId,
        snapshot_date: snapshotDate,
        genre: pos.genre,
        track_id: track.key,
        track_name: track.name || null,
        mix_name: track.mixName || null,
        position: pos.position,
        points: pos.points,
        bpm: track.bpm || null,
        key_camelot: track.keyCamelot || null,
        release_date: track.releaseDate || null,
        cover_art: track.coverArt || null,
        sample_url: track.sampleUrl || null,
        artist_ids: artistIdsArray(track.artists),
        artist_names: artistNamesArray(track.artists),
        label_id: track.labelId ? String(track.labelId) : null,
        label_name: track.label || null,
        prev_position: prevPosition,
        position_change: positionChange,
        is_new_entry: isNewEntry,
        is_reentry: isReentry,
        weeks_in_chart: weeksInChart,
      });
    }
  }

  // 4. Batch insert chart history rows (chunks of 500)
  const BATCH_SIZE = 500;
  for (let i = 0; i < rows.length; i += BATCH_SIZE) {
    const batch = rows.slice(i, i + BATCH_SIZE);
    const { error: batchErr } = await supabase
      .from("beatport_chart_history")
      .insert(batch);
    if (batchErr) {
      console.error(
        `[snapshots] batch insert error at offset ${i}:`,
        batchErr
      );
      // Continue — partial save is better than nothing
    }
  }

  // 5. Sort + slice top movers
  movers.topClimbers.sort((a, b) => b.change - a.change);
  movers.topDroppers.sort((a, b) => a.change - b.change);
  movers.topNewEntries.sort((a, b) => a.position - b.position);

  return {
    snapshotId,
    previousSnapshotId: previous?.id || null,
    previousSnapshotDate: previous?.snapshotDate || null,
    totalTracks: rows.length,
    ...diffStats,
    topClimbers: movers.topClimbers.slice(0, 10),
    topDroppers: movers.topDroppers.slice(0, 10),
    topNewEntries: movers.topNewEntries.slice(0, 10),
  };
}

// ---------------------------------------------------------------------
// getLatestSnapshot — for admin UI
// ---------------------------------------------------------------------

export async function getLatestSnapshot(): Promise<{
  id: number;
  snapshotDate: string;
  totalGenres: number;
  totalLabels: number;
  totalArtists: number;
  totalTracks: number;
  incompleteGenres: string[];
  createdAt: string;
} | null> {
  const supabase = getServerSupabase();
  const { data, error } = await supabase
    .from("beatport_snapshots")
    .select(
      "id, snapshot_date, total_genres, total_labels, total_artists, total_tracks, incomplete_genres, created_at"
    )
    .order("snapshot_date", { ascending: false })
    .limit(1)
    .single();
  if (error || !data) return null;
  return {
    id: data.id,
    snapshotDate: data.snapshot_date,
    totalGenres: data.total_genres,
    totalLabels: data.total_labels,
    totalArtists: data.total_artists,
    totalTracks: data.total_tracks,
    incompleteGenres: data.incomplete_genres || [],
    createdAt: data.created_at,
  };
}

// ---------------------------------------------------------------------
// getSnapshotDiff — for diff UI
// ---------------------------------------------------------------------

export async function getSnapshotDiff(
  snapshotDate: string
): Promise<DiffResult | null> {
  const supabase = getServerSupabase();
  // Find snapshot by date
  const { data: snap, error: snapErr } = await supabase
    .from("beatport_snapshots")
    .select("id")
    .eq("snapshot_date", snapshotDate)
    .maybeSingle();
  if (snapErr || !snap) return null;

  // Aggregate stats from chart_history
  const { data: stats, error: statsErr } = await supabase
    .from("beatport_chart_history")
    .select(
      "track_id, track_name, genre, position, position_change, is_new_entry"
    )
    .eq("snapshot_id", snap.id);

  if (statsErr || !stats) return null;

  const diff = {
    snapshotId: snap.id,
    previousSnapshotId: null as number | null,
    previousSnapshotDate: null as string | null,
    totalTracks: stats.length,
    newEntries: 0,
    reentries: 0,
    climbers: 0,
    fastClimbers: 0,
    droppers: 0,
    fastDroppers: 0,
    stable: 0,
    topClimbers: [] as DiffResult["topClimbers"],
    topDroppers: [] as DiffResult["topDroppers"],
    topNewEntries: [] as DiffResult["topNewEntries"],
  };

  const climbers: any[] = [];
  const droppers: any[] = [];
  const newEntries: any[] = [];

  for (const r of stats) {
    if (r.is_new_entry) {
      diff.newEntries++;
      newEntries.push({
        trackKey: r.track_id,
        name: r.track_name,
        genre: r.genre,
        change: 0,
        position: r.position,
      });
    } else if (r.position_change === null) {
      diff.stable++;
    } else if (r.position_change >= 5) {
      diff.climbers++;
      if (r.position_change >= 15) diff.fastClimbers++;
      climbers.push({
        trackKey: r.track_id,
        name: r.track_name,
        genre: r.genre,
        change: r.position_change,
        position: r.position,
      });
    } else if (r.position_change <= -5) {
      diff.droppers++;
      if (r.position_change <= -15) diff.fastDroppers++;
      droppers.push({
        trackKey: r.track_id,
        name: r.track_name,
        genre: r.genre,
        change: r.position_change,
        position: r.position,
      });
    } else {
      diff.stable++;
    }
  }

  climbers.sort((a, b) => b.change - a.change);
  droppers.sort((a, b) => a.change - b.change);
  newEntries.sort((a, b) => a.position - b.position);

  diff.topClimbers = climbers.slice(0, 10);
  diff.topDroppers = droppers.slice(0, 10);
  diff.topNewEntries = newEntries.slice(0, 10);

  return diff;
}
