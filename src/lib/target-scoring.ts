/**
 * 🔒 Musical Interest Engine — MVP per Close Your Eyes
 *
 * Domanda: "Quanto è probabile che questo DJ sia interessato
 * musicisticamente a questa release?"
 *
 * Solo dati oggettivi già presenti in DB (Artist, Release, Demo).
 * Niente ipotesi comportamentali, niente reachability, niente
 * saturazione top-tier. Pura affinità musicale.
 *
 * MVP subset — fattori implementabili subito:
 *   F1  Genere identico              +20
 *   F2  Genere correlato             +10
 *   F3  Profondità nel genere        +8/+15/+25
 *   F7  Attività recente (≤30gg)     +20
 *   F8  Attività mediamente recente  +10
 *   F9  Trending nel genere          +25
 *   F10 Punti recenti nel genere     +8/+15
 *   F11 Stessa scena label (3+)      +12
 *   N1  Inattività prolungata        -20
 *   N2  Solo remixer                 -8
 *
 * Disattivati nell'MVP (richiedono dati non sempre disponibili):
 *   F4  Label match (richiede release.label esplicito)
 *   F5  BPM match (richiede demo analizzati)
 *   F6  Key match (richiede demo analizzati)
 *   F12 Collaborazione passata (richiede ArtistTrack.artists)
 *
 * Range teorico: -28 a +135
 * Soglia inclusione: ≥ 10
 * Bucket:
 *   ≥100  🔥 Altissimo
 *   60-99 🟢 Alto
 *   25-59 🟡 Medio
 *   10-24 ⚪ Basso
 *   <10   escluso
 */

import type { Artist, Release } from "./store";

// ==================== TYPES ====================

export type InterestBucket = "max" | "high" | "medium" | "low";
export type ConfidenceLabel = "alta" | "media" | "bassa";

export interface ScoredArtist {
  artist: Artist;
  score: number;
  rules: RuleHit[];
  motivation: string;
  priority: InterestBucket; // alias legacy per compat UI
  interestBucket: InterestBucket; // naming nuovo
  reasons: string[];
  // RP-002: Confidence (affidabilità dati) — resta invariata
  confidence: number;
  confidenceLabel: ConfidenceLabel;
  confidenceFactors: string[];
}

interface RuleHit {
  id: string;
  label: string;
}

interface InterestRule {
  id: string;
  name: string;
  weight: number;
  enabled: boolean;
  evaluate: (release: Release, artist: Artist) => RuleHit | null;
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
      return hit ? { id: "exact_genre_match", label: "stesso genere" } : null;
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
      // Se c'è match esatto, F1 ha già coperto.
      const exact = artist.genres.some((g) => normalizeGenre(g) === rg);
      if (exact) return null;
      if (hasPartialGenreMatch(release, artist)) {
        return { id: "partial_genre_match", label: "genere correlato" };
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
      const tracks = artist.tracksByGenre?.[rg];
      const count = Array.isArray(tracks) ? tracks.length : 0;
      if (count >= 10) {
        return { id: "genre_depth_high", label: `molto attivo nel genere (${count} tracce)` };
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
      const tracks = artist.tracksByGenre?.[rg];
      const count = Array.isArray(tracks) ? tracks.length : 0;
      if (count >= 5 && count <= 9) {
        return { id: "genre_depth_medium", label: `attivo nel genere (${count} tracce)` };
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
      const tracks = artist.tracksByGenre?.[rg];
      const count = Array.isArray(tracks) ? tracks.length : 0;
      if (count >= 2 && count <= 4) {
        return { id: "genre_depth_low", label: `presente nel genere (${count} tracce)` };
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
      // Solo se c'è match di genere
      if (!hasGenreMatch(release, artist) && !hasPartialGenreMatch(release, artist)) {
        return null;
      }
      const days = Math.floor(d);
      if (days === 0) {
        return { id: "recent_activity_in_genre", label: "in classifica oggi" };
      }
      return {
        id: "recent_activity_in_genre",
        label: `in classifica ${days} giorn${days === 1 ? "o" : "i"} fa`,
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
        label: `in classifica ${days} giorni fa`,
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
      const rank = artist.trendingRankByGenre?.[rg];
      if (rank === undefined || rank === null) return null;
      return {
        id: "trending_in_genre",
        label: `trending nel genere (rank #${rank})`,
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
      const pts = artist.trendingPointsByGenre?.[rg] || 0;
      if (pts >= 500) {
        return { id: "recent_genre_points_high", label: `${pts} punti recenti nel genere` };
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
      const pts = artist.trendingPointsByGenre?.[rg] || 0;
      if (pts >= 100 && pts < 500) {
        return { id: "recent_genre_points_medium", label: `${pts} punti recenti nel genere` };
      }
      return null;
    },
  },

  // ---------- F11: STESSA SCENA LABEL ----------
  {
    id: "label_scene_rooted",
    name: "Radicato in una scena label (3+)",
    weight: 12,
    enabled: true,
    evaluate: (_release, artist) => {
      const count = artist.labelsPublishedOn?.length || 0;
      if (count >= 5) {
        return { id: "label_scene_rooted", label: `radicato su ${count} label` };
      }
      if (count >= 3) {
        return { id: "label_scene_rooted", label: `presente su ${count} label` };
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
        return { id: "inactive_over_year", label: "inattivo da oltre 1 anno" };
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
      return { id: "remixer_only_penalty", label: "solo remixer" };
    },
  },
];

// ==================== SOGLIE ====================

const INTEREST_THRESHOLDS = {
  max: 100,    // 🔥 Altissimo
  high: 60,    // 🟢 Alto
  medium: 25,  // 🟡 Medio
  low: 10,     // ⚪ Basso (sotto 10 → escluso)
} as const;

const MIN_SCORE_TO_INCLUDE = INTEREST_THRESHOLDS.low; // 10
const DEFAULT_LIMIT = 50;

// ==================== CONFIDENCE RULES (RP-002, invariate) ====================

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

const DEFAULT_MIN_CONFIDENCE = 30;

// ==================== CORE FUNCTIONS ====================

/**
 * Calcola il Musical Interest Score di un artista rispetto a una release.
 */
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

  // Separa positive da negative
  const positiveHits = hits.filter((h) => {
    const rule = MUSICAL_INTEREST_RULES.find((r) => r.id === h.id);
    return rule ? rule.weight > 0 : true;
  });

  const motivation =
    positiveHits.length > 0
      ? positiveHits.map((h) => h.label).join(" · ")
      : "nessuna corrispondenza forte";

  const reasons = positiveHits.map((h) => h.label);

  // Confidence
  const { confidence, factors } = calculateConfidence(release, artist);

  const bucket = bucketForScore(score);

  return {
    artist,
    score,
    rules: hits,
    motivation,
    priority: bucket, // alias legacy
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

  if (maxTheoretical === 0) {
    return { confidence: 0, factors };
  }

  const confidence = Math.round((raw / maxTheoretical) * 100);
  return { confidence: Math.min(100, confidence), factors };
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

/**
 * Calcola la lista ordinata di target per una release.
 * Filtra per score minimo e confidence minima.
 */
export function calculateTopTargets(
  release: Release,
  artists: Artist[],
  options?: { minScore?: number; minConfidence?: number; limit?: number }
): ScoredArtist[] {
  const minScore = options?.minScore ?? MIN_SCORE_TO_INCLUDE;
  const minConfidence = options?.minConfidence ?? DEFAULT_MIN_CONFIDENCE;
  const limit = options?.limit ?? DEFAULT_LIMIT;

  return artists
    .map((a) => scoreArtistForRelease(release, a))
    .filter((s) => s.score >= minScore && s.confidence >= minConfidence)
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      return b.confidence - a.confidence;
    })
    .slice(0, limit);
}

// ==================== FUNNEL (RP-017) ====================

export interface TargetingFunnel {
  totalArtists: number;       // Step 0: tutti gli artisti nel DB
  sameGenre: number;          // Step 1: filtro per genere Beatport
  recentlyActive: number;     // Step 2: filtro per attività recente (90gg)
  labelCompatible: number;    // Step 3: filtro per affinità label
  scored: number;             // Step 4: calcolo score (superano minimo)
  recommended: number;        // Step 5: migliori target (top 50)
}

/**
 * RP-017 — Calcola il funnel di targeting a 5 step.
 *
 * Pipeline:
 *   1. Filtro per genere Beatport (match esatto o parziale)
 *   2. Filtro per attività recente (ultimi 90 giorni)
 *   3. Filtro per affinità label (3+ label note)
 *   4. Calcolo score (Musical Interest Score ≥ 10)
 *   5. Restituisce soltanto i migliori 50 target
 */
export function calculateFunnel(
  release: Release,
  artists: Artist[]
): TargetingFunnel {
  const totalArtists = artists.length;

  // Step 1: filtro per genere Beatport
  const genreFiltered = artists.filter((a) =>
    hasGenreMatch(release, a) || hasPartialGenreMatch(release, a)
  );
  const sameGenre = genreFiltered.length;

  // Step 2: filtro per attività recente (ultimi 90 giorni)
  const activeFiltered = genreFiltered.filter((a) => {
    const d = daysSince(a.lastSeenAt);
    return d !== null && d <= 90;
  });
  const recentlyActive = activeFiltered.length;

  // Step 3: filtro per affinità label (3+ label note)
  const labelFiltered = activeFiltered.filter((a) =>
    (a.labelsPublishedOn?.length || 0) >= 1
  );
  const labelCompatible = labelFiltered.length;

  // Step 4: calcolo score
  const scored = labelFiltered
    .map((a) => scoreArtistForRelease(release, a))
    .filter((s) => s.score >= MIN_SCORE_TO_INCLUDE);

  // Step 5: migliori target (top 50, ordinati per score)
  const recommended = Math.min(scored.length, DEFAULT_LIMIT);

  return {
    totalArtists,
    sameGenre,
    recentlyActive,
    labelCompatible,
    scored: scored.length,
    recommended,
  };
}

// ==================== GENRE NORMALIZATION (RP-019) ====================

/**
 * Mappa delle varianti di genere estratte da fonti esterne (PromoLink, ecc.)
 * ai valori ufficiali della lista Beatport in labels-data.json.
 *
 * Le chiavi sono lowercase + trim per matching case-insensitive.
 */
const GENRE_NORMALIZATION_MAP: Record<string, string> = {
  // Techno variants
  "techno (peak time / driving)": "Techno Peak Time / Driving",
  "techno (peak time)": "Techno Peak Time / Driving",
  "techno peak time": "Techno Peak Time / Driving",
  "techno peak time / driving": "Techno Peak Time / Driving",
  "techno (raw / deep / hypnotic)": "Techno Raw / Deep / Hypnotic",
  "techno (raw/deep/hypnotic)": "Techno Raw / Deep / Hypnotic",
  "techno raw / deep / hypnotic": "Techno Raw / Deep / Hypnotic",
  "techno raw/deep/hypnotic": "Techno Raw / Deep / Hypnotic",
  "hard techno": "Hard Techno",

  // House variants
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

  // Minimal
  "minimal / deep tech": "Minimal / Deep Tech",
  "minimal/deep tech": "Minimal / Deep Tech",
  "minimal / deep tech house": "Minimal / Deep Tech",

  // Breaks / Bass
  "breaks / breakbeat / uk bass": "Breaks / Breakbeat / Uk Bass",
  "breaks/breakbeat/uk bass": "Breaks / Breakbeat / Uk Bass",
  "bass / club": "Bass / Club",
  "bass house": "Bass House",
  "uk garage / bassline": "Uk Garage / Bassline",

  // Other common
  "drum & bass": "Drum & Bass",
  "drum and bass": "Drum & Bass",
  "indie dance": "Indie Dance",
  "nu disco / disco": "Nu Disco / Disco",
  "nu disco": "Nu Disco / Disco",
  "psy-trance": "Psy-Trance",
  "psy trance": "Psy-Trance",
  "trance main floor": "Trance Main Floor",
  "hard dance / hardcore / neo rave": "Hard Dance / Hardcore / Neo Rave",

  // Electronica / Ambient
  "electronica": "Electronica",
  "ambient / experimental": "Ambient / Experimental",
  "downtempo": "Downtempo",
  "electro classic / detroit / modern": "Electro Classic / Detroit / Modern",

  // Pop / Mainstage
  "dance / pop": "Dance / Pop",
  "mainstage": "Mainstage",

  // Amapiano / Brazilian
  "amapiano": "Amapiano",
  "brazilian funk": "Brazilian Funk",

  // Dubstep / DnB
  "dubstep": "Dubstep",
  "140 / deep dubstep / grime": "140 / Deep Dubstep / Grime",
  "trap / future bass": "Trap / Future Bass",
};

/**
 * Normalizza un genere estratto da una fonte esterna nel valore ufficiale
 * della lista Beatport.
 *
 * Strategia:
 * 1. Se il genere è già nella lista Beatport, ritornalo invariato
 * 2. Se il genere lowercase+trim è nella mappa di normalizzazione, ritorna il valore mappato
 * 3. Se nessun match, ritorna null (l'utente deve selezionare manualmente)
 *
 * @param genre il genere estratto (es. "Techno (Peak Time / Driving)")
 * @param beatportGenres la lista ufficiale dei generi Beatport
 * @returns il genere normalizzato, o null se non riconoscibile
 */
export function normalizeBeatportGenre(
  genre: string | null | undefined,
  beatportGenres: string[]
): string | null {
  if (!genre || !genre.trim()) return null;

  const trimmed = genre.trim();

  // 1. Match esatto (case-sensitive) con la lista Beatport
  if (beatportGenres.includes(trimmed)) {
    return trimmed;
  }

  // 2. Match esatto case-insensitive con la lista Beatport
  const lowerTrimmed = trimmed.toLowerCase();
  const caseInsensitiveMatch = beatportGenres.find(
    (g) => g.toLowerCase() === lowerTrimmed
  );
  if (caseInsensitiveMatch) {
    return caseInsensitiveMatch;
  }

  // 3. Lookup nella mappa di normalizzazione
  const normalized = GENRE_NORMALIZATION_MAP[lowerTrimmed];
  if (normalized && beatportGenres.includes(normalized)) {
    return normalized;
  }

  // 4. Tentativo di match parziale: se il genere estratto contiene
  // un genere della lista Beatport come sottostringa, usalo
  // (es. "Techno (Peak Time / Driving)" contiene "Techno Peak Time / Driving"? No.
  // Ma "Techno Peak Time" potrebbe matchare parzialmente)
  for (const bg of beatportGenres) {
    const bgLower = bg.toLowerCase();
    // Rimuovi parentesi dal genere estratto e prova di nuovo
    const genreNoParens = trimmed.replace(/[()]/g, "").trim();
    if (genreNoParens.toLowerCase() === bgLower) {
      return bg;
    }
    // Se il genere estratto (senza parentesi) contiene il genere Beatport
    if (genreNoParens.toLowerCase().includes(bgLower) && bgLower.length > 5) {
      return bg;
    }
  }

  // 5. Nessun match
  return null;
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
  const summary: Record<InterestBucket, number> = {
    max: 0,
    high: 0,
    medium: 0,
    low: 0,
  };
  for (const t of targets) {
    summary[t.priority]++;
  }
  return summary;
}

export function summarizeByConfidence(
  targets: ScoredArtist[]
): Record<ConfidenceLabel, number> {
  const summary: Record<ConfidenceLabel, number> = {
    alta: 0,
    media: 0,
    bassa: 0,
  };
  for (const t of targets) {
    summary[t.confidenceLabel]++;
  }
  return summary;
}

// ==================== BEATPORT URL HELPER ====================

export function getArtistBeatportUrl(artist: Artist): string | null {
  if (artist.slug && artist.beatportId) {
    return `https://www.beatport.com/artist/${artist.slug}/${artist.beatportId}`;
  }
  return null;
}
