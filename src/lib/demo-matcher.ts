/**
 * Demo Matcher — find labels and artists similar to a user's track.
 *
 * When a producer finishes a track and wants to send it out as a demo, the
 * biggest question is: "who do I send it to?". This module answers that by
 * mining the scraped Beatport data we already have:
 *
 *   - For each scraped track, we know: label, artist, genre, BPM, key (Camelot),
 *     release date, chart position, points.
 *   - Given the user's track (BPM, key, optional genre, optional energy), we
 *     compute a similarity score and rank labels / artists accordingly.
 *
 * SCORING (per scraped track vs. user's track):
 *   BPM match:
 *     - exact (±2)   → 1.0
 *     - close (±5)   → 0.7
 *     - loose (±10)  → 0.4
 *     - else         → 0.0
 *   Key match (Camelot):
 *     - same code           → 1.0
 *     - compatible (±1 / relative) → 0.7
 *     - else                → 0.0
 *   Genre match (when user supplies a genre):
 *     - same genre          → 1.0
 *     - else                → 0.3 (still useful — labels often span sub-genres)
 *
 * LABEL SCORE = sum of (track score × track points) for all matching scraped
 * tracks on that label, normalized. Top labels get surfaced as "your track
 * would fit here". The label's current rank/points in that genre act as a
 * tiebreaker so we prefer active, well-positioned labels.
 *
 * ARTIST SCORE = sum of track scores for all matching scraped tracks by that
 * artist. Top artists are "your peers" — useful for collaborations or
 * remix-style pitches.
 *
 * The matcher is PURE and SYNCHRONOUS — it reads from the artists array
 * passed in, no network calls, no side effects. Caching is left to the
 * caller (useMemo with [bpm, key, genre, artists] deps).
 */

import type { Artist, ArtistTrack, Label } from "@/lib/store";
import { isCamelotCompatible } from "@/lib/audio-analysis";

export interface TrackProfile {
  bpm: number | null;
  /** Camelot code, e.g. "8A" — null if unknown */
  camelotKey: string | null;
  /** User's genre — if known. Case-insensitive matching. */
  genre: string | null;
}

export interface ScoredLabel {
  label: Label;
  /** 0–100, normalized within the result set for display */
  score: number;
  /** raw sum of (track score × track points) — used for sorting */
  rawScore: number;
  /** how many scraped tracks on this label match the user's track */
  matchCount: number;
  /** the genre where this label fits best (for display) */
  bestGenre: string;
}

export interface ScoredArtist {
  artist: Artist;
  score: number;
  rawScore: number;
  matchCount: number;
  /** best chart position the artist reached on a matching track (1 = #1) */
  bestPosition: number | null;
}

export interface MatchResult {
  labels: ScoredLabel[];
  artists: ScoredArtist[];
  /** total scraped tracks considered (for the "based on N tracks" subtitle) */
  totalTracksScanned: number;
}

// ---------- internal helpers ----------

function bpmScore(userBpm: number | null, trackBpm: number | null): number {
  if (userBpm == null || trackBpm == null) return 0;
  // Halve-doubling equivalence: a track at 130 BPM is also at 65 (half) or 260 (double).
  // We consider both for matching because DJs often pitch-shift between them.
  const candidates = [trackBpm, trackBpm / 2, trackBpm * 2];
  let best = 0;
  for (const c of candidates) {
    if (!Number.isFinite(c) || c < 30 || c > 300) continue;
    const diff = Math.abs(c - userBpm);
    let s = 0;
    if (diff <= 2) s = 1.0;
    else if (diff <= 5) s = 0.7;
    else if (diff <= 10) s = 0.4;
    else continue;
    if (s > best) best = s;
  }
  return best;
}

function keyScore(userKey: string | null, trackKey: string | null): number {
  if (!userKey || !trackKey) return 0;
  if (userKey === trackKey) return 1.0;
  if (isCamelotCompatible(userKey, trackKey)) return 0.7;
  return 0;
}

function genreScore(userGenre: string | null, trackGenre: string | null): number {
  if (!userGenre) return 0.5; // neutral when user didn't specify
  if (!trackGenre) return 0.3;
  // Loose match: same lowercase string OR one contains the other
  // (handles "Melodic House & Techno" vs "Melodic House")
  const u = userGenre.toLowerCase().trim();
  const t = trackGenre.toLowerCase().trim();
  if (u === t) return 1.0;
  if (u.includes(t) || t.includes(u)) return 0.85;
  return 0.3;
}

function trackScore(
  user: TrackProfile,
  track: ArtistTrack,
  trackGenre: string | null
): number {
  // Weighted: BPM and key matter most, genre is a tiebreaker.
  // If user didn't supply a genre, we don't penalize — we just rely on
  // BPM+key. If user DID supply a genre, we still allow cross-genre matches
  // but with a lower score.
  const bpmS = bpmScore(user.bpm, track.bpm);
  const keyS = keyScore(user.camelotKey, track.keyCamelot || null);
  const genreS = genreScore(user.genre, trackGenre);

  // Require at least one of BPM/key to be a positive match — otherwise
  // the score is meaningless.
  if (bpmS === 0 && keyS === 0) return 0;

  // Weighted sum (max = 1.0)
  const s = bpmS * 0.45 + keyS * 0.35 + genreS * 0.20;
  return s;
}

// ---------- main entry point ----------

/**
 * Find labels and artists similar to the given track profile.
 *
 * @param user      the user's track (BPM, key, genre — any may be null)
 * @param artists   the full scraped artists array (3000+ items, each with tracksByGenre)
 * @param labels    the full labels array (1192+ items, used to resolve label metadata)
 * @param options   tuning knobs (mostly for testing)
 */
export function findSimilarLabelsAndArtists(
  user: TrackProfile,
  artists: Artist[],
  labels: Label[],
  options?: { maxResults?: number; minScore?: number }
): MatchResult {
  const maxResults = options?.maxResults ?? 10;
  const minScore = options?.minScore ?? 0.05;

  const safeArtists = Array.isArray(artists) ? artists : [];
  const safeLabels = Array.isArray(labels) ? labels : [];

  // Build a quick name -> label index (case-insensitive) so we can resolve
  // the Label object from a track's label name.
  const labelByName = new Map<string, Label>();
  for (const l of safeLabels) {
    const k = (l.name || "").toLowerCase().trim();
    if (k && !labelByName.has(k)) labelByName.set(k, l);
  }

  const labelAgg = new Map<
    string,
    {
      label: Label;
      rawScore: number;
      matchCount: number;
      byGenre: Map<string, { rawScore: number; matchCount: number }>;
    }
  >();
  const artistAgg = new Map<
    string,
    {
      artist: Artist;
      rawScore: number;
      matchCount: number;
      bestPosition: number | null;
    }
  >();

  let totalTracksScanned = 0;

  for (const artist of safeArtists) {
    const tbg = artist.tracksByGenre || {};
    for (const genre of Object.keys(tbg)) {
      const tracks = tbg[genre] || [];
      for (const track of tracks) {
        if (!track) continue;
        totalTracksScanned++;

        const s = trackScore(user, track, genre);
        if (s <= 0) continue;

        // ---- accumulate per-label ----
        const labelKey = (track.label || "").toLowerCase().trim();
        if (labelKey) {
          let entry = labelAgg.get(labelKey);
          if (!entry) {
            const labelObj =
              labelByName.get(labelKey) ||
              ({
                id: `unknown_${labelKey}`,
                name: track.label,
                genre: genre,
                submissionType: "email",
                contactInfo: "",
                status: "open",
                notes: "",
                createdAt: "",
                emails: [],
                website: "",
                demoLink: "",
                socialLink: "",
                soundcloudLink: "",
                beatportLink: "",
                customLinks: [],
                genres: [genre],
                rankByGenre: {},
                pointsByGenre: {},
                trending: false,
                trendingRankByGenre: {},
                trendingPointsByGenre: {},
              } as Label);
            entry = {
              label: labelObj,
              rawScore: 0,
              matchCount: 0,
              byGenre: new Map(),
            };
            labelAgg.set(labelKey, entry);
          }
          // track points act as a multiplier — a #1 hit match counts more
          // than a #100 match
          const points = track.points || 1;
          entry.rawScore += s * points;
          entry.matchCount += 1;
          let g = entry.byGenre.get(genre);
          if (!g) {
            g = { rawScore: 0, matchCount: 0 };
            entry.byGenre.set(genre, g);
          }
          g.rawScore += s * points;
          g.matchCount += 1;
        }

        // ---- accumulate per-artist ----
        const artistKey = artist.id;
        let ae = artistAgg.get(artistKey);
        if (!ae) {
          ae = {
            artist,
            rawScore: 0,
            matchCount: 0,
            bestPosition: null,
          };
          artistAgg.set(artistKey, ae);
        }
        ae.rawScore += s;
        ae.matchCount += 1;
        if (
          track.position > 0 &&
          (ae.bestPosition === null || track.position < ae.bestPosition)
        ) {
          ae.bestPosition = track.position;
        }
      }
    }
  }

  // Sort + slice
  const labelList = Array.from(labelAgg.values())
    .filter((e) => e.rawScore > 0 && e.matchCount > 0)
    .map((e) => {
      // Find the genre where this label has the best raw score
      let bestGenre = "";
      let bestGenreScore = -1;
      for (const [g, info] of e.byGenre) {
        if (info.rawScore > bestGenreScore) {
          bestGenreScore = info.rawScore;
          bestGenre = g;
        }
      }
      return {
        label: e.label,
        rawScore: e.rawScore,
        matchCount: e.matchCount,
        bestGenre,
      };
    })
    .sort((a, b) => {
      // Primary: raw score (more matching tracks + higher chart positions)
      if (b.rawScore !== a.rawScore) return b.rawScore - a.rawScore;
      // Secondary: the label's current rank in its best genre (lower = better)
      const aRank = a.label.rankByGenre?.[a.bestGenre] ?? 9999;
      const bRank = b.label.rankByGenre?.[b.bestGenre] ?? 9999;
      if (aRank !== bRank) return aRank - bRank;
      return a.label.name.localeCompare(b.label.name);
    })
    .slice(0, maxResults);

  // Normalize label scores to 0–100 for display
  const maxLabelRaw = labelList.length > 0 ? labelList[0].rawScore : 1;
  const scoredLabels: ScoredLabel[] = labelList
    .filter((l) => l.rawScore / maxLabelRaw >= minScore)
    .map((l) => ({
      ...l,
      score: Math.round((l.rawScore / maxLabelRaw) * 100),
    }));

  const artistList = Array.from(artistAgg.values())
    .filter((e) => e.rawScore > 0 && e.matchCount > 0)
    .sort((a, b) => {
      if (b.rawScore !== a.rawScore) return b.rawScore - a.rawScore;
      // Tiebreak: best chart position (1 is best)
      if (a.bestPosition !== null && b.bestPosition !== null) {
        return a.bestPosition - b.bestPosition;
      }
      return a.artist.name.localeCompare(b.artist.name);
    })
    .slice(0, maxResults);

  const maxArtistRaw = artistList.length > 0 ? artistList[0].rawScore : 1;
  const scoredArtists: ScoredArtist[] = artistList
    .filter((a) => a.rawScore / maxArtistRaw >= minScore)
    .map((a) => ({
      ...a,
      score: Math.round((a.rawScore / maxArtistRaw) * 100),
    }));

  return {
    labels: scoredLabels,
    artists: scoredArtists,
    totalTracksScanned,
  };
}

/**
 * Convenience helper: turn a Demo's audio analysis into a TrackProfile.
 * Returns null if neither BPM nor key was detected (in which case there's
 * nothing to match on).
 */
export function profileFromAnalysis(
  analysis: {
    bpm: number;
    bpmConfidence: number;
    key: { camelot: string; confidence: number };
  } | null | undefined,
  genre: string | null
): TrackProfile | null {
  if (!analysis) return null;
  const bpm =
    analysis.bpm && analysis.bpm > 0 && analysis.bpmConfidence > 0
      ? Math.round(analysis.bpm)
      : null;
  const camelotKey =
    analysis.key?.camelot && analysis.key.confidence > 0
      ? analysis.key.camelot
      : null;
  if (bpm === null && camelotKey === null) return null;
  return { bpm, camelotKey, genre: genre?.trim() || null };
}

/**
 * Human-readable explanation of why a particular label/artist matched,
 * for the "Why this suggestion?" tooltip.
 */
export function explainMatch(
  user: TrackProfile,
  match: { matchCount: number; bestGenre: string }
): string {
  const parts: string[] = [];
  if (user.genre && match.bestGenre) {
    if (user.genre.toLowerCase() === match.bestGenre.toLowerCase()) {
      parts.push(`Genere: ${match.bestGenre}`);
    } else {
      parts.push(`Genere simile: ${match.bestGenre}`);
    }
  } else if (match.bestGenre) {
    parts.push(`Genere tipico: ${match.bestGenre}`);
  }
  parts.push(`${match.matchCount} tracc${match.matchCount === 1 ? "ia" : "e"} simile${match.matchCount === 1 ? "" : "i"}`);
  return parts.join(" · ");
}
