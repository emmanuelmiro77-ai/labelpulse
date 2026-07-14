/**
 * 🔒 RP-020 — Buyer Engine (pipeline unica)
 *
 * Architettura a pipeline singola: il funnel visualizzato e la lista
 * finale dei target sono prodotti dalla STESSA sequenza di filtri.
 *
 * Pipeline:
 *   0. Tutti gli artisti nel DB locale
 *   1. Filtro per genere Beatport (match esatto o parziale)
 *   2. Filtro per attività recente (ultimi 90 giorni, o lastSeenAt null = passa)
 *   3. Calcolo Musical Interest Score (con label come fattore di score, NON filtro)
 *   4. Filtro score ≥ soglia minima
 *   5. Filtro confidence ≥ soglia minima
 *   6. Sort per score desc, confidence desc
 *   7. Top 50
 *
 * Le label NON escludono artisti. Contribuiscono al punteggio come
 * segnale aggiuntivo di radicamento nella scena.
 *
 * Le motivazioni sono leggibili (non tecniche):
 *   "Molto attivo negli ultimi 30 giorni nel genere Techno Peak Time / Driving."
 *   "Pubblica regolarmente su label di riferimento della scena."
 *   "Presenza costante nelle classifiche Beatport."
 */

import type { Artist, Release } from "./store";

// ==================== TYPES ====================

export type InterestBucket = "max" | "high" | "medium" | "low";
export type ConfidenceLabel = "alta" | "media" | "bassa";

export interface ScoredArtist {
  artist: Artist;
  score: number;
  rules: RuleHit[];
  motivation: string;       // stringa leggibile concatenata (legacy)
  priority: InterestBucket;
  interestBucket: InterestBucket;
  reasons: string[];        // motivazioni leggibili positive
  confidence: number;
  confidenceLabel: ConfidenceLabel;
  confidenceFactors: string[];
}

interface RuleHit {
  id: string;
  label: string;            // motivazione leggibile
}

interface InterestRule {
  id: string;
  name: string;
  weight: number;
  enabled: boolean;
  evaluate: (release: Release, artist: Artist) => RuleHit | null;
}

// ==================== FUNNEL RESULT ====================

export interface TargetingResult {
  funnel: {
    totalArtists: number;
    sameGenre: number;
    recentlyActive: number;
    scored: number;
    passedScore: number;
    passedConfidence: number;
    recommended: number;
  };
  targets: ScoredArtist[];
}

// ==================== HELPERS ====================

function normalizeGenre(g: string): string {
  return (g || "").trim().toLowerCase();
}

function genreKeywords(g: string): string[] {
  const norm = normalizeGenre(g);
  if (!norm) return [];
  return norm
    .split(/[\s/&,]+/)
    .map((k) => k.trim())
    .filter((k) => k.length > 3);
}

function daysSince(isoTimestamp: string | undefined): number | null {
  if (!isoTimestamp) return null;
  const ts = new Date(isoTimestamp).getTime();
  if (Number.isNaN(ts)) return null;
  return Math.max(0, (Date.now() - ts) / 86400000);
}

function hasGenreMatch(release: Release, artist: Artist): boolean {
  const rg = normalizeGenre(release.genre);
  if (!rg) return false;
  return artist.genres.some((g) => normalizeGenre(g) === rg);
}

function hasPartialGenreMatch(release: Release, artist: Artist): boolean {
  const rg = normalizeGenre(release.genre);
  if (!rg) return false;
  const releaseKw = genreKeywords(release.genre);
  if (releaseKw.length === 0) return false;
  return artist.genres.some((ag) => {
    const agKw = genreKeywords(ag);
    return releaseKw.some((k) => agKw.includes(k));
  });
}

// Case-insensitive lookup per tracksByGenre / trendingRankByGenre / trendingPointsByGenre
function lookupGenreKey<T>(map: Record<string, T> | undefined, genre: string): T | undefined {
  if (!map) return undefined;
  // Try exact key first
  const exact = map[genre];
  if (exact !== undefined) return exact;
  // Try case-insensitive
  const lower = genre.toLowerCase();
  for (const key of Object.keys(map)) {
    if (key.toLowerCase() === lower) return map[key];
  }
  return undefined;
}

// ==================== MUSICAL INTEREST RULES ====================

const MUSICAL_INTEREST_RULES: InterestRule[] = [
  // ---------- F1: GENERE IDENTICO ----------
  {
    id: "exact_genre_match",
    name: "Stesso genere",
    weight: 20,
    enabled: true,
    evaluate: (release, artist) => {
      const rg = normalizeGenre(release.genre);
      if (!rg) return null;
      const hit = artist.genres.some((g) => normalizeGenre(g) === rg);
      if (!hit) return null;
      return {
        id: "exact_genre_match",
        label: `Stesso genere della release (${release.genre.trim()}).`,
      };
    },
  },

  // ---------- F2: GENERE CORRELATO ----------
  {
    id: "partial_genre_match",
    name: "Genere correlato",
    weight: 10,
    enabled: true,
    evaluate: (release, artist) => {
      const rg = normalizeGenre(release.genre);
      if (!rg) return null;
      const exact = artist.genres.some((g) => normalizeGenre(g) === rg);
      if (exact) return null;
      if (hasPartialGenreMatch(release, artist)) {
        const artistGenre = artist.genres.find((ag) => {
          const agKw = genreKeywords(ag);
          return genreKeywords(release.genre).some((k) => agKw.includes(k));
        });
        return {
          id: "partial_genre_match",
          label: `Genere correlato (${artistGenre || "scena affine"}).`,
        };
      }
      return null;
    },
  },

  // ---------- F3: PROFONDITÀ NEL GENERE ----------
  {
    id: "genre_depth_high",
    name: "Profondità nel genere (≥10 tracce)",
    weight: 25,
    enabled: true,
    evaluate: (release, artist) => {
      const rg = release.genre?.trim();
      if (!rg) return null;
      const tracks = lookupGenreKey(artist.tracksByGenre, rg);
      const count = Array.isArray(tracks) ? tracks.length : 0;
      if (count >= 10) {
        return {
          id: "genre_depth_high",
          label: `Molto attivo nel genere con ${count} tracce pubblicate.`,
        };
      }
      return null;
    },
  },
  {
    id: "genre_depth_medium",
    name: "Profondità nel genere (5-9 tracce)",
    weight: 15,
    enabled: true,
    evaluate: (release, artist) => {
      const rg = release.genre?.trim();
      if (!rg) return null;
      const tracks = lookupGenreKey(artist.tracksByGenre, rg);
      const count = Array.isArray(tracks) ? tracks.length : 0;
      if (count >= 5 && count <= 9) {
        return {
          id: "genre_depth_medium",
          label: `Attivo nel genere con ${count} tracce pubblicate.`,
        };
      }
      return null;
    },
  },
  {
    id: "genre_depth_low",
    name: "Profondità nel genere (2-4 tracce)",
    weight: 8,
    enabled: true,
    evaluate: (release, artist) => {
      const rg = release.genre?.trim();
      if (!rg) return null;
      const tracks = lookupGenreKey(artist.tracksByGenre, rg);
      const count = Array.isArray(tracks) ? tracks.length : 0;
      if (count >= 2 && count <= 4) {
        return {
          id: "genre_depth_low",
          label: `Presente nel genere con ${count} tracce.`,
        };
      }
      return null;
    },
  },

  // ---------- F7: ATTIVITÀ RECENTE NEL GENERE ----------
  {
    id: "recent_activity_in_genre",
    name: "Attività recente nel genere (≤30gg)",
    weight: 20,
    enabled: true,
    evaluate: (release, artist) => {
      const d = daysSince(artist.lastSeenAt);
      if (d === null) return null;
      if (d > 30) return null;
      if (!hasGenreMatch(release, artist) && !hasPartialGenreMatch(release, artist)) {
        return null;
      }
      const days = Math.floor(d);
      const genreName = release.genre?.trim() || "";
      if (days === 0) {
        return {
          id: "recent_activity_in_genre",
          label: `In classifica oggi nel genere ${genreName}.`,
        };
      }
      return {
        id: "recent_activity_in_genre",
        label: `Molto attivo negli ultimi ${days} giorn${days === 1 ? "o" : "i"} nel genere ${genreName}.`,
      };
    },
  },

  // ---------- F8: ATTIVITÀ MEDIAMENTE RECENTE ----------
  {
    id: "medium_recent_activity_in_genre",
    name: "Attività mediamente recente (31-90gg)",
    weight: 10,
    enabled: true,
    evaluate: (release, artist) => {
      const d = daysSince(artist.lastSeenAt);
      if (d === null) return null;
      if (d <= 30 || d > 90) return null;
      if (!hasGenreMatch(release, artist) && !hasPartialGenreMatch(release, artist)) {
        return null;
      }
      const days = Math.floor(d);
      return {
        id: "medium_recent_activity_in_genre",
        label: `Attivo negli ultimi ${days} giorni nel genere ${release.genre?.trim() || ""}.`,
      };
    },
  },

  // ---------- F9: TRENDING NEL GENERE ----------
  {
    id: "trending_in_genre",
    name: "Trending nel genere della release",
    weight: 25,
    enabled: true,
    evaluate: (release, artist) => {
      if (!artist.trending) return null;
      const rg = release.genre?.trim();
      if (!rg) return null;
      const rank = lookupGenreKey(artist.trendingRankByGenre, rg);
      if (rank === undefined || rank === null) return null;
      return {
        id: "trending_in_genre",
        label: `Trending nel genere ${rg} (rank #${rank}).`,
      };
    },
  },

  // ---------- F10: PUNTI RECENTI NEL GENERE ----------
  {
    id: "recent_genre_points_high",
    name: "Punti recenti nel genere (≥500)",
    weight: 15,
    enabled: true,
    evaluate: (release, artist) => {
      const rg = release.genre?.trim();
      if (!rg) return null;
      const pts = lookupGenreKey(artist.trendingPointsByGenre, rg) || 0;
      if (pts >= 500) {
        return {
          id: "recent_genre_points_high",
          label: `Presenza costante nelle classifiche Beatport (${pts} punti recenti nel genere).`,
        };
      }
      return null;
    },
  },
  {
    id: "recent_genre_points_medium",
    name: "Punti recenti nel genere (100-499)",
    weight: 8,
    enabled: true,
    evaluate: (release, artist) => {
      const rg = release.genre?.trim();
      if (!rg) return null;
      const pts = lookupGenreKey(artist.trendingPointsByGenre, rg) || 0;
      if (pts >= 100 && pts < 500) {
        return {
          id: "recent_genre_points_medium",
          label: `${pts} punti recenti nelle classifiche del genere.`,
        };
      }
      return null;
    },
  },

  // ---------- F11: RADICAMENTO LABEL (fattore di score, NON filtro) ----------
  {
    id: "label_scene_rooted",
    name: "Radicato in una scena label",
    weight: 12,
    enabled: true,
    evaluate: (_release, artist) => {
      const count = artist.labelsPublishedOn?.length || 0;
      if (count >= 5) {
        return {
          id: "label_scene_rooted",
          label: `Pubblica regolarmente su ${count} label di riferimento della scena.`,
        };
      }
      if (count >= 3) {
        return {
          id: "label_scene_rooted",
          label: `Presente su ${count} label della scena.`,
        };
      }
      return null;
    },
  },

  // ---------- N1: INATTIVITÀ PROLUNGATA ----------
  {
    id: "inactive_over_year",
    name: "Inattivo da oltre 1 anno",
    weight: -20,
    enabled: true,
    evaluate: (_release, artist) => {
      const d = daysSince(artist.lastSeenAt);
      if (d === null) return null;
      if (d > 365) {
        return { id: "inactive_over_year", label: "Inattivo da oltre 1 anno." };
      }
      return null;
    },
  },

  // ---------- N2: SOLO REMIXER ----------
  {
    id: "remixer_only_penalty",
    name: "Solo remixer",
    weight: -8,
    enabled: true,
    evaluate: (_release, artist) => {
      if (!artist.isRemixerOnly) return null;
      return { id: "remixer_only_penalty", label: "Solo remixer, non produce release proprie." };
    },
  },
];

// ==================== SOGLIE ====================

const INTEREST_THRESHOLDS = {
  max: 100,
  high: 60,
  medium: 25,
  low: 10,
} as const;

const MIN_SCORE_TO_INCLUDE = INTEREST_THRESHOLDS.low;
const DEFAULT_MIN_CONFIDENCE = 30;
const DEFAULT_LIMIT = 50;

// ==================== CONFIDENCE RULES ====================

interface ConfidenceRule {
  id: string;
  name: string;
  weight: number;
  enabled: boolean;
  evaluate: (release: Release, artist: Artist) => string | null;
}

const CONFIDENCE_RULES: ConfidenceRule[] = [
  {
    id: "conf_recent_7d",
    name: "Attivo negli ultimi 7 giorni",
    weight: 30,
    enabled: true,
    evaluate: (_release, artist) => {
      const d = daysSince(artist.lastSeenAt);
      if (d === null) return null;
      if (d <= 7) return "attivo questa settimana";
      return null;
    },
  },
  {
    id: "conf_recent_30d",
    name: "Attivo negli ultimi 30 giorni",
    weight: 20,
    enabled: true,
    evaluate: (_release, artist) => {
      const d = daysSince(artist.lastSeenAt);
      if (d === null) return null;
      if (d > 7 && d <= 30) return "attivo nell'ultimo mese";
      return null;
    },
  },
  {
    id: "conf_recent_90d",
    name: "Attivo negli ultimi 90 giorni",
    weight: 10,
    enabled: true,
    evaluate: (_release, artist) => {
      const d = daysSince(artist.lastSeenAt);
      if (d === null) return null;
      if (d > 30 && d <= 90) return "attivo negli ultimi 3 mesi";
      return null;
    },
  },
  {
    id: "conf_high_presence",
    name: "Presenza molto costante (>2000 punti)",
    weight: 25,
    enabled: true,
    evaluate: (_release, artist) => {
      if (artist.totalPoints >= 2000) return `${artist.totalPoints} punti totali`;
      return null;
    },
  },
  {
    id: "conf_medium_presence",
    name: "Presenza costante (>500 punti)",
    weight: 15,
    enabled: true,
    evaluate: (_release, artist) => {
      if (artist.totalPoints >= 500 && artist.totalPoints < 2000) {
        return `${artist.totalPoints} punti totali`;
      }
      return null;
    },
  },
  {
    id: "conf_low_presence",
    name: "Presenza minima (>100 punti)",
    weight: 5,
    enabled: true,
    evaluate: (_release, artist) => {
      if (artist.totalPoints >= 100 && artist.totalPoints < 500) {
        return `${artist.totalPoints} punti totali`;
      }
      return null;
    },
  },
  {
    id: "conf_exact_genre",
    name: "Coerenza genere perfetta",
    weight: 25,
    enabled: true,
    evaluate: (release, artist) => {
      const rg = normalizeGenre(release.genre);
      if (!rg) return null;
      const hit = artist.genres.some((g) => normalizeGenre(g) === rg);
      return hit ? "genere perfettamente coerente" : null;
    },
  },
  {
    id: "conf_partial_genre",
    name: "Coerenza genere parziale",
    weight: 15,
    enabled: true,
    evaluate: (release, artist) => {
      const rg = normalizeGenre(release.genre);
      if (!rg) return null;
      const exact = artist.genres.some((g) => normalizeGenre(g) === rg);
      if (exact) return null;
      if (hasPartialGenreMatch(release, artist)) {
        return "genere parzialmente coerente";
      }
      return null;
    },
  },
  {
    id: "conf_label_rooted",
    name: "Radicato su multiple label",
    weight: 10,
    enabled: true,
    evaluate: (_release, artist) => {
      const count = artist.labelsPublishedOn?.length || 0;
      if (count >= 5) return `radicato su ${count} label`;
      if (count >= 3) return `presente su ${count} label`;
      return null;
    },
  },
  {
    id: "conf_data_beatport_id",
    name: "Beatport ID disponibile",
    weight: 3,
    enabled: true,
    evaluate: (_release, artist) => {
      return artist.beatportId ? "profilo Beatport verificato" : null;
    },
  },
  {
    id: "conf_data_slug",
    name: "Slug Beatport disponibile",
    weight: 2,
    enabled: true,
    evaluate: (_release, artist) => {
      return artist.slug ? "URL Beatport diretto" : null;
    },
  },
  {
    id: "conf_data_image",
    name: "Immagine profilo disponibile",
    weight: 2,
    enabled: true,
    evaluate: (_release, artist) => {
      return artist.imageUrl ? "immagine profilo disponibile" : null;
    },
  },
  {
    id: "conf_data_tracks",
    name: "Tracce note in classifica",
    weight: 3,
    enabled: true,
    evaluate: (_release, artist) => {
      const trackCount = Object.values(artist.tracksByGenre || {}).reduce(
        (sum, tracks) => sum + (Array.isArray(tracks) ? tracks.length : 0),
        0
      );
      return trackCount >= 3 ? `${trackCount} tracce note` : null;
    },
  },
];

const CONFIDENCE_THRESHOLDS = {
  alta: 70,
  media: 40,
} as const;

// ==================== SCORING ====================

export function scoreArtistForRelease(
  release: Release,
  artist: Artist
): ScoredArtist {
  let score = 0;
  const hits: RuleHit[] = [];

  for (const rule of MUSICAL_INTEREST_RULES) {
    if (!rule.enabled) continue;
    const hit = rule.evaluate(release, artist);
    if (hit) {
      score += rule.weight;
      hits.push(hit);
    }
  }

  const positiveHits = hits.filter((h) => {
    const rule = MUSICAL_INTEREST_RULES.find((r) => r.id === h.id);
    return rule ? rule.weight > 0 : true;
  });

  const motivation =
    positiveHits.length > 0
      ? positiveHits.map((h) => h.label).join(" · ")
      : "nessuna corrispondenza forte";

  const reasons = positiveHits.map((h) => h.label);

  const { confidence, factors } = calculateConfidence(release, artist);
  const bucket = bucketForScore(score);

  return {
    artist,
    score,
    rules: hits,
    motivation,
    priority: bucket,
    interestBucket: bucket,
    reasons,
    confidence,
    confidenceLabel: bucketForConfidence(confidence),
    confidenceFactors: factors,
  };
}

function calculateConfidence(
  release: Release,
  artist: Artist
): { confidence: number; factors: string[] } {
  let raw = 0;
  const factors: string[] = [];
  let maxTheoretical = 0;

  for (const rule of CONFIDENCE_RULES) {
    if (!rule.enabled) continue;
    maxTheoretical += rule.weight;
    const factor = rule.evaluate(release, artist);
    if (factor) {
      raw += rule.weight;
      factors.push(factor);
    }
  }

  if (maxTheoretical === 0) return { confidence: 0, factors };
  return { confidence: Math.min(100, Math.round((raw / maxTheoretical) * 100)), factors };
}

function bucketForScore(score: number): InterestBucket {
  if (score >= INTEREST_THRESHOLDS.max) return "max";
  if (score >= INTEREST_THRESHOLDS.high) return "high";
  if (score >= INTEREST_THRESHOLDS.medium) return "medium";
  return "low";
}

function bucketForConfidence(confidence: number): ConfidenceLabel {
  if (confidence >= CONFIDENCE_THRESHOLDS.alta) return "alta";
  if (confidence >= CONFIDENCE_THRESHOLDS.media) return "media";
  return "bassa";
}

// ==================== PIPELINE UNICA ====================

/**
 * RP-020 — Pipeline unica autorevole.
 *
 * Questa è l'UNICA funzione che calcola i target per una release.
 * Il funnel visualizzato e la lista target sono prodotti dalla
 * STESSA sequenza di filtri.
 *
 * Pipeline:
 *   0. Tutti gli artisti
 *   1. Filtro genere Beatport (match esatto o parziale)
 *   2. Filtro attività recente (≤90gg, oppure lastSeenAt null = passa)
 *   3. Calcolo score per ogni artista
 *   4. Filtro score ≥ MIN_SCORE_TO_INCLUDE (10)
 *   5. Filtro confidence ≥ DEFAULT_MIN_CONFIDENCE (30)
 *   6. Sort per score desc, poi confidence desc
 *   7. Top 50
 *
 * Le label NON sono un filtro di esclusione. Contribuiscono al
 * punteggio tramite la regola F11 (label_scene_rooted, +12).
 */
export function calculateTargets(
  release: Release,
  artists: Artist[],
  options?: { minScore?: number; minConfidence?: number; limit?: number }
): TargetingResult {
  const minScore = options?.minScore ?? MIN_SCORE_TO_INCLUDE;
  const minConfidence = options?.minConfidence ?? DEFAULT_MIN_CONFIDENCE;
  const limit = options?.limit ?? DEFAULT_LIMIT;

  // Step 0: tutti gli artisti
  const totalArtists = artists.length;

  // Step 1: filtro per genere Beatport
  const genreFiltered = artists.filter((a) =>
    hasGenreMatch(release, a) || hasPartialGenreMatch(release, a)
  );
  const sameGenre = genreFiltered.length;

  // Step 2: filtro per attività recente (≤90gg)
  // Artisti con lastSeenAt null PASSANO (non vengono esclusi per dati mancanti)
  const activeFiltered = genreFiltered.filter((a) => {
    const d = daysSince(a.lastSeenAt);
    // Se lastSeenAt è null/undefined, passa (non penalizzare per dati mancanti)
    if (d === null) return true;
    return d <= 90;
  });
  const recentlyActive = activeFiltered.length;

  // Step 3: calcolo score per ogni artista sopravvissuto
  const scored = activeFiltered.map((a) => scoreArtistForRelease(release, a));

  // Step 4: filtro score ≥ minimo
  const passedScore = scored.filter((s) => s.score >= minScore);

  // Step 5: filtro confidence ≥ minimo
  const passedConfidence = passedScore.filter((s) => s.confidence >= minConfidence);

  // Step 6: sort per score desc, poi confidence desc
  const sorted = passedConfidence.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return b.confidence - a.confidence;
  });

  // Step 7: top 50
  const targets = sorted.slice(0, limit);

  return {
    funnel: {
      totalArtists,
      sameGenre,
      recentlyActive,
      scored: scored.length,
      passedScore: passedScore.length,
      passedConfidence: passedConfidence.length,
      recommended: targets.length,
    },
    targets,
  };
}

// ==================== UI HELPERS ====================

export const PRIORITY_LABELS: Record<InterestBucket, { icon: string; label: string; color: string }> = {
  max: { icon: "🔥", label: "Altissimo", color: "text-red-400" },
  high: { icon: "🟢", label: "Alto", color: "text-emerald-400" },
  medium: { icon: "🟡", label: "Medio", color: "text-amber-400" },
  low: { icon: "⚪", label: "Basso", color: "text-muted-foreground" },
};

export const CONFIDENCE_LABELS: Record<ConfidenceLabel, { color: string; bgClass: string }> = {
  alta: { color: "text-emerald-400", bgClass: "bg-emerald-500/10" },
  media: { color: "text-amber-400", bgClass: "bg-amber-500/10" },
  bassa: { color: "text-muted-foreground", bgClass: "bg-secondary/50" },
};

export function summarizeByPriority(
  targets: ScoredArtist[]
): Record<InterestBucket, number> {
  const summary: Record<InterestBucket, number> = { max: 0, high: 0, medium: 0, low: 0 };
  for (const t of targets) summary[t.priority]++;
  return summary;
}

export function summarizeByConfidence(
  targets: ScoredArtist[]
): Record<ConfidenceLabel, number> {
  const summary: Record<ConfidenceLabel, number> = { alta: 0, media: 0, bassa: 0 };
  for (const t of targets) summary[t.confidenceLabel]++;
  return summary;
}

// ==================== BEATPORT URL HELPER ====================

export function getArtistBeatportUrl(artist: Artist): string | null {
  if (artist.slug && artist.beatportId) {
    return `https://www.beatport.com/artist/${artist.slug}/${artist.beatportId}`;
  }
  return null;
}

// ==================== GENRE NORMALIZATION (RP-019) ====================

const GENRE_NORMALIZATION_MAP: Record<string, string> = {
  "techno (peak time / driving)": "Techno Peak Time / Driving",
  "techno (peak time)": "Techno Peak Time / Driving",
  "techno peak time / driving": "Techno Peak Time / Driving",
  "techno (raw / deep / hypnotic)": "Techno Raw / Deep / Hypnotic",
  "techno (raw/deep/hypnotic)": "Techno Raw / Deep / Hypnotic",
  "techno raw / deep / hypnotic": "Techno Raw / Deep / Hypnotic",
  "techno raw/deep/hypnotic": "Techno Raw / Deep / Hypnotic",
  "hard techno": "Hard Techno",
  "melodic house & techno": "Melodic House & Techno",
  "melodic house and techno": "Melodic House & Techno",
  "melodic house": "Melodic House & Techno",
  "tech house": "Tech House",
  "deep house": "Deep House",
  "funky house": "Funky House",
  "jackin house": "Jackin House",
  "progressive house": "Progressive House",
  "organic house": "Organic House",
  "afro house": "Afro House",
  "minimal / deep tech": "Minimal / Deep Tech",
  "minimal/deep tech": "Minimal / Deep Tech",
  "breaks / breakbeat / uk bass": "Breaks / Breakbeat / Uk Bass",
  "breaks/breakbeat/uk bass": "Breaks / Breakbeat / Uk Bass",
  "bass / club": "Bass / Club",
  "bass house": "Bass House",
  "uk garage / bassline": "Uk Garage / Bassline",
  "drum & bass": "Drum & Bass",
  "drum and bass": "Drum & Bass",
  "indie dance": "Indie Dance",
  "nu disco / disco": "Nu Disco / Disco",
  "nu disco": "Nu Disco / Disco",
  "psy-trance": "Psy-Trance",
  "psy trance": "Psy-Trance",
  "trance main floor": "Trance Main Floor",
  "hard dance / hardcore / neo rave": "Hard Dance / Hardcore / Neo Rave",
  "electronica": "Electronica",
  "ambient / experimental": "Ambient / Experimental",
  "downtempo": "Downtempo",
  "electro classic / detroit / modern": "Electro Classic / Detroit / Modern",
  "dance / pop": "Dance / Pop",
  "mainstage": "Mainstage",
  "amapiano": "Amapiano",
  "brazilian funk": "Brazilian Funk",
  "dubstep": "Dubstep",
  "140 / deep dubstep / grime": "140 / Deep Dubstep / Grime",
  "trap / future bass": "Trap / Future Bass",
};

export function normalizeBeatportGenre(
  genre: string | null | undefined,
  beatportGenres: string[]
): string | null {
  if (!genre || !genre.trim()) return null;
  const trimmed = genre.trim();

  if (beatportGenres.includes(trimmed)) return trimmed;

  const lowerTrimmed = trimmed.toLowerCase();
  const ciMatch = beatportGenres.find((g) => g.toLowerCase() === lowerTrimmed);
  if (ciMatch) return ciMatch;

  const normalized = GENRE_NORMALIZATION_MAP[lowerTrimmed];
  if (normalized && beatportGenres.includes(normalized)) return normalized;

  const genreNoParens = trimmed.replace(/[()]/g, "").trim();
  for (const bg of beatportGenres) {
    if (genreNoParens.toLowerCase() === bg.toLowerCase()) return bg;
    if (genreNoParens.toLowerCase().includes(bg.toLowerCase()) && bg.toLowerCase().length > 5) return bg;
  }

  return null;
}
