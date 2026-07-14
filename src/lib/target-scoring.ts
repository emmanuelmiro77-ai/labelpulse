/**
 * 🔒 RP-001 + RP-002 — Target Finder Scoring & Confidence Engine
 *
 * Due metriche complementari per ogni artista:
 *
 *   SCORE (RP-001) — compatibilità con la release.
 *     Misura QUANTO l'artista è adatto alla release.
 *     Basato su: genere match, recenza, trending, presenza, best position.
 *     Output: bucket priorità (🔥 Massima / 🟢 Alta / 🟡 Media / ⚪ Bassa).
 *
 *   CONFIDENCE (RP-002) — affidabilità della selezione.
 *     Misura QUANTO possiamo fidarci del punteggio assegnato.
 *     Basato su: attività recente, presenza costante, coerenza genere,
 *     vicinanza label, qualità dei dati disponibili.
 *     Output: percentuale 0-100% + label (Alta / Media / Bassa).
 *
 * Perché due metriche separate:
 *   - Score alto + Confidence alta → target solido, contattare.
 *   - Score alto + Confidence bassa → match interessante ma dati deboli,
 *     da verificare manualmente prima di contattare.
 *   - Score basso + Confidence alta → non adatto ma sappiamo perché.
 *   - Score basso + Confidence bassa → scartare.
 *
 * La Confidence filtra la lista: artisti con confidence troppo bassa
 * vengono esclusi anche se score alto, riducendo il rumore.
 *
 * Design:
 *   - SCORING_RULES: motore per la compatibilità (RP-001).
 *   - CONFIDENCE_RULES: motore separato per l'affidabilità (RP-002).
 *   - Entrambi configurabili, pesi non hardcoded nei flag.
 *   - Nessuna dipendenza da React o Zustand. Funzioni pure, testabili.
 */

import type { Artist, Release } from "./store";

// ==================== TYPES ====================

export type PriorityBucket = "max" | "high" | "medium" | "low";
export type ConfidenceLabel = "alta" | "media" | "bassa";

export interface ScoredArtist {
  artist: Artist;
  // RP-001: Score di compatibilità (interno, non in UI)
  score: number;
  rules: RuleHit[]; // regole di scoring attivate (tutte, incluse penalità)
  motivation: string; // motivazione leggibile concatenata (legacy, per compat)
  priority: PriorityBucket;
  // RP-002: Confidence di affidabilità (visibile in UI come %)
  confidence: number; // 0-100
  confidenceLabel: ConfidenceLabel;
  confidenceFactors: string[]; // fattori che hanno contribuito, leggibili
  // RP-002 review: motivazioni positive come array, per la sezione
  // "PERCHÉ È STATO SELEZIONATO" in UI. Solo regole con weight > 0.
  // Le penalità (weight < 0) NON compaiono qui: non sono motivi di selezione.
  reasons: string[];
}

interface RuleHit {
  id: string;
  label: string; // descrizione leggibile (es. "stesso genere")
}

interface ScoringRule {
  id: string;
  name: string;
  weight: number;
  enabled: boolean;
  /**
   * Ritorna `null` se la regola non si applica (no hit).
   * Ritorna una `RuleHit` con label leggibile se la regola si attiva.
   */
  evaluate: (release: Release, artist: Artist) => RuleHit | null;
}

// ==================== HELPERS ====================

function normalizeGenre(g: string): string {
  return (g || "").trim().toLowerCase();
}

/**
 * Estrae parole chiave significative da un genere (lunghezza > 3)
 * per matching parziale. Es. "Melodic House & Techno" → ["melodic", "house", "techno"].
 */
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

// ==================== RULES ENGINE ====================
//
// Pesi calibrati per privilegiare la RECENZA sopra lo storico.
// Un artista visto nelle classifiche negli ultimi giorni deve
// emergere anche se ha meno punti totali di un nome storico.
//
// Soglie di priorità (score):
//   🔥 Massima  >= 100
//   🟢 Alta     >= 60
//   🟡 Media    >= 30
//   ⚪ Bassa    >= 10 (sotto 10 → escluso)
//
// Peso della recenza:
//   - "Visto negli ultimi 7 giorni"    → +60 (massimo)
//   - "Visto negli ultimi 30 giorni"   → +40
//   - "Visto negli ultimi 90 giorni"   → +20
//   - "Inattivo da oltre 365 giorni"   → -40 (forte penalità)
//   - "Inattivo da oltre 180 giorni"   → -15 (penalità lieve)
//
// Questo fa sì che un artista con 500 punti totali ma visto ieri
// possa superare un artista con 5000 punti ma inattivo da 1 anno.

const SCORING_RULES: ScoringRule[] = [
  // ---------- GENERE ----------
  {
    id: "exact_genre_match",
    name: "Stesso genere",
    weight: 50,
    enabled: true,
    evaluate: (release, artist) => {
      const rg = normalizeGenre(release.genre);
      if (!rg) return null;
      const hit = artist.genres.some((g) => normalizeGenre(g) === rg);
      return hit ? { id: "exact_genre_match", label: "stesso genere" } : null;
    },
  },
  {
    id: "partial_genre_match",
    name: "Genere correlato",
    weight: 20,
    enabled: true,
    evaluate: (release, artist) => {
      const rg = normalizeGenre(release.genre);
      if (!rg) return null;
      // Se c'è match esatto, la regola precedente ha già coperto. Qui cerchiamo parziale.
      const exact = artist.genres.some((g) => normalizeGenre(g) === rg);
      if (exact) return null;
      const releaseKw = genreKeywords(release.genre);
      if (releaseKw.length === 0) return null;
      const hit = artist.genres.some((ag) => {
        const agKw = genreKeywords(ag);
        return releaseKw.some((k) => agKw.includes(k));
      });
      return hit ? { id: "partial_genre_match", label: "genere correlato" } : null;
    },
  },

  // ---------- RECENZA (peso dominante) ----------
  {
    id: "seen_last_7d",
    name: "Visto negli ultimi 7 giorni",
    weight: 60,
    enabled: true,
    evaluate: (_release, artist) => {
      const d = daysSince(artist.lastSeenAt);
      if (d === null) return null;
      const days = Math.floor(d);
      if (d <= 7) {
        return {
          id: "seen_last_7d",
          label: days === 0
            ? "in classifica oggi"
            : `ultima presenza ${days} giorn${days === 1 ? "o" : "i"} fa`,
        };
      }
      return null;
    },
  },
  {
    id: "seen_last_30d",
    name: "Visto negli ultimi 30 giorni",
    weight: 40,
    enabled: true,
    evaluate: (_release, artist) => {
      const d = daysSince(artist.lastSeenAt);
      if (d === null) return null;
      const days = Math.floor(d);
      if (d > 7 && d <= 30) {
        return { id: "seen_last_30d", label: `ultima presenza ${days} giorni fa` };
      }
      return null;
    },
  },
  {
    id: "seen_last_90d",
    name: "Visto negli ultimi 90 giorni",
    weight: 20,
    enabled: true,
    evaluate: (_release, artist) => {
      const d = daysSince(artist.lastSeenAt);
      if (d === null) return null;
      const days = Math.floor(d);
      if (d > 30 && d <= 90) {
        return { id: "seen_last_90d", label: `ultima presenza ${days} giorni fa` };
      }
      return null;
    },
  },

  // ---------- ATTIVITÀ / POPULARITÀ ----------
  {
    id: "trending_in_genre",
    name: "Trending nello stesso genere",
    weight: 35,
    enabled: true,
    evaluate: (release, artist) => {
      if (!artist.trending) return null;
      const rg = release.genre?.trim(); // chiave originale (case-sensitive, come da store)
      if (!rg) return null;
      const rank = artist.trendingRankByGenre?.[rg];
      if (rank === undefined || rank === null) return null;
      return {
        id: "trending_in_genre",
        label: `trending nel genere (rank #${rank})`,
      };
    },
  },
  {
    id: "frequent_in_charts",
    name: "Presenza frequente nelle classifiche",
    weight: 25,
    enabled: true,
    evaluate: (_release, artist) => {
      if (artist.totalPoints < 500) return null;
      return {
        id: "frequent_in_charts",
        label: "presenza frequente nelle classifiche",
      };
    },
  },
  {
    id: "high_best_position",
    name: "Best position in top 10",
    weight: 15,
    enabled: true,
    evaluate: (_release, artist) => {
      if (artist.bestPosition <= 0 || artist.bestPosition > 10) return null;
      return {
        id: "high_best_position",
        label: `in top 10 (best #${artist.bestPosition})`,
      };
    },
  },

  // ---------- COMPATIBILITÀ LABEL ----------
  {
    id: "labels_overlap",
    name: "Pubblica su label compatibili",
    weight: 20,
    enabled: true,
    evaluate: (release, artist) => {
      // Se uno degli artisti della release pubblica su una label su cui pubblica anche l'artista candidato,
      // c'è compatibilità di scena. Confronto per nome case-insensitive.
      // NOTA: release.artists è string[] (nomi), artist.labelsPublishedOn è string[] (nomi label).
      // Non possiamo confrontare artist con artist via questo campo. Usiamo invece un proxy:
      // se l'artista ha almeno 3 label note, è "radicato" nella scena → leggero bonus.
      // (matching label-to-label richiederebbe una release.label, che non esiste nello schema).
      if ((artist.labelsPublishedOn?.length || 0) >= 3) {
        return {
          id: "labels_overlap",
          label: `radicato su ${artist.labelsPublishedOn.length} label`,
        };
      }
      return null;
    },
  },

  // ---------- PENALITÀ ----------
  {
    id: "inactive_over_365d",
    name: "Inattivo da oltre 1 anno",
    weight: -40,
    enabled: true,
    evaluate: (_release, artist) => {
      const d = daysSince(artist.lastSeenAt);
      if (d === null) return null;
      if (d > 365) {
        return { id: "inactive_over_365d", label: "inattivo da oltre 1 anno" };
      }
      return null;
    },
  },
  {
    id: "inactive_over_180d",
    name: "Inattivo da oltre 6 mesi",
    weight: -15,
    enabled: true,
    evaluate: (_release, artist) => {
      const d = daysSince(artist.lastSeenAt);
      if (d === null) return null;
      if (d > 180 && d <= 365) {
        return { id: "inactive_over_180d", label: "inattivo da oltre 6 mesi" };
      }
      return null;
    },
  },
  {
    id: "remixer_only_penalty",
    name: "Solo remixer (non produce proprie release)",
    weight: -10,
    enabled: true,
    evaluate: (_release, artist) => {
      if (!artist.isRemixerOnly) return null;
      return { id: "remixer_only_penalty", label: "solo remixer" };
    },
  },
];

// ==================== CONFIDENCE RULES (RP-002) ====================
//
// La Confidence misura l'AFFIDABILITÀ della selezione, non la compatibilità.
// Risponde alla domanda: "Possiamo fidarci che questo sia un buon target?"
//
// Scale 0-100. Massimo teorico raggiungibile sommando tutti i pesi: 100.
// Soglie:
//   Alta   >= 70%
//   Media  >= 40%
//   Bassa  < 40%
//
// Fattori:
//   1. ATTIVITÀ RECENTE (max 30) — più recente = più affidabile
//   2. PRESENZA COSTANTE (max 25) — punteggio storico solido
//   3. COERENZA GENERE (max 25) — match forte con il genere della release
//   4. VICINANZA LABEL (max 10) — artista radicato su più label (proxy di scena)
//   5. QUALITÀ DATI (max 10) — beatportId, slug, image, tracks popolati
//
// Nota: la Confidence è volutamente separata dallo Score.
//   - Score = "questo artista è adatto?" (compatibilità)
//   - Confidence = "siamo sicuri di quello che diciamo?" (affidabilità dati)
// Un artista può avere score alto (match perfetto) ma confidence bassa
// (dati vecchi, poche informazioni) → è un target da verificare manualmente.

interface ConfidenceRule {
  id: string;
  name: string;
  weight: number; // punti contribuiti alla confidence (0-100 scale)
  enabled: boolean;
  /**
   * Ritorna `null` se il fattore non contribuisce.
   * Ritorna una stringa descrittiva se il fattore è attivo (per il tooltip).
   */
  evaluate: (release: Release, artist: Artist) => string | null;
}

const CONFIDENCE_RULES: ConfidenceRule[] = [
  // ---------- 1. ATTIVITÀ RECENTE (max 30) ----------
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

  // ---------- 2. PRESENZA COSTANTE (max 25) ----------
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

  // ---------- 3. COERENZA GENERE (max 25) ----------
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
      // Se c'è match esatto, la regola precedente ha già coperto.
      const exact = artist.genres.some((g) => normalizeGenre(g) === rg);
      if (exact) return null;
      const releaseKw = genreKeywords(release.genre);
      if (releaseKw.length === 0) return null;
      const hit = artist.genres.some((ag) => {
        const agKw = genreKeywords(ag);
        return releaseKw.some((k) => agKw.includes(k));
      });
      return hit ? "genere parzialmente coerente" : null;
    },
  },

  // ---------- 4. VICINANZA LABEL (max 10) ----------
  // Proxy: un artista con 3+ label note è radicato nella scena,
  // quindi più probabile che sia un target attivo e raggiungibile.
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

  // ---------- 5. QUALITÀ DATI (max 10) ----------
  // Verifica che l'artista abbia dati completi nel database.
  // Un artista con solo nome e 0 tracce ha dati deboli → confidence più bassa.
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

// ==================== SOGLIE CONFIDENCE ====================

const CONFIDENCE_THRESHOLDS = {
  alta: 70, // %
  media: 40, // %
} as const;

const DEFAULT_MIN_CONFIDENCE = 30; // sotto il 30% → escluso dalla lista
const CONFIDENCE_MAX_THEORETICAL = 100; // somma di tutti i pesi delle regole abilitate

// ==================== SOGLIE PRIORITÀ ====================

const PRIORITY_THRESHOLDS = {
  max: 100, // 🔥
  high: 60, // 🟢
  medium: 30, // 🟡
  low: 10, // ⚪ (sotto 10 → escluso)
} as const;

const MIN_SCORE_TO_INCLUDE = PRIORITY_THRESHOLDS.low; // 10
const DEFAULT_LIMIT = 50;

// ==================== CORE FUNCTIONS ====================

/**
 * Calcola lo score di un artista rispetto a una release.
 * Itera tutte le regole abilitate, somma i pesi, raccoglie le motivazioni.
 * Calcola anche la confidence (RP-002) come metrica separata.
 */
export function scoreArtistForRelease(
  release: Release,
  artist: Artist
): ScoredArtist {
  let score = 0;
  const hits: RuleHit[] = [];

  for (const rule of SCORING_RULES) {
    if (!rule.enabled) continue;
    const hit = rule.evaluate(release, artist);
    if (hit) {
      score += rule.weight;
      hits.push(hit);
    }
  }

  // Separa le motivazioni positive da quelle negative (penalità).
  // In UI mostriamo prima le positive, le negative sono informative
  // ma non le esponiamo come "motivazione" principale (l'utente non deve
  // leggere "inattivo" come motivo per contattare).
  const positiveHits = hits.filter((h) => {
    const rule = SCORING_RULES.find((r) => r.id === h.id);
    return rule ? rule.weight > 0 : true;
  });

  const motivation =
    positiveHits.length > 0
      ? positiveHits.map((h) => h.label).join(" · ")
      : "nessuna corrispondenza forte";

  // RP-002 review: reasons è l'array di label positive, per la sezione
  // "PERCHÉ È STATO SELEZIONATO" in UI. Solo regole con weight > 0.
  const reasons = positiveHits.map((h) => h.label);

  // RP-002: calcola la confidence separatamente dallo score.
  const { confidence, factors } = calculateConfidence(release, artist);

  return {
    artist,
    score,
    rules: hits,
    motivation,
    priority: bucketForScore(score),
    confidence,
    confidenceLabel: bucketForConfidence(confidence),
    confidenceFactors: factors,
    reasons,
  };
}

/**
 * RP-002 — Calcola la confidence (affidabilità della selezione).
 *
 * La confidence è normalizzata a 0-100: somma i pesi delle regole attive,
 * diviso il massimo teorico raggiungibile, moltiplicato per 100.
 * Questo garantisce che anche se alcune regole sono disabilitate,
 * la percentuale resti coerente.
 */
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

  // Normalizza a 0-100. Arrotonda all'intero più vicino.
  const confidence = Math.round((raw / maxTheoretical) * 100);

  return { confidence: Math.min(100, confidence), factors };
}

function bucketForScore(score: number): PriorityBucket {
  if (score >= PRIORITY_THRESHOLDS.max) return "max";
  if (score >= PRIORITY_THRESHOLDS.high) return "high";
  if (score >= PRIORITY_THRESHOLDS.medium) return "medium";
  return "low";
}

function bucketForConfidence(confidence: number): ConfidenceLabel {
  if (confidence >= CONFIDENCE_THRESHOLDS.alta) return "alta";
  if (confidence >= CONFIDENCE_THRESHOLDS.media) return "media";
  return "bassa";
}

/**
 * Calcola la lista ordinata di top targets per una release.
 *
 * RP-002: la lista è filtrata ANCHE per confidence. Artisti con confidence
 * troppo bassa (dati deboli, attività assente) vengono esclusi anche se
 * lo score di compatibilità è alto. Questo riduce il rumore e porta
 * alla superficie solo target affidabili.
 *
 * Ordinamento: per score decrescente (compatibilità prima di tutto).
 * A parità di score, confidence più alta vince (tiebreaker implicito
 * perché la sort è stabile e gli artisti sono processati in ordine).
 *
 * @param release la release di riferimento
 * @param artists tutti gli artisti cached localmente
 * @param options.minScore score minimo per inclusione (default 10)
 * @param options.minConfidence confidence minima % per inclusione (default 30)
 * @param options.limit numero massimo di risultati (default 50)
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
      // Primary: score decrescente
      if (b.score !== a.score) return b.score - a.score;
      // Tiebreaker: confidence decrescente
      return b.confidence - a.confidence;
    })
    .slice(0, limit);
}

// ==================== UI HELPERS ====================

export const PRIORITY_LABELS: Record<PriorityBucket, { icon: string; label: string; color: string }> = {
  max: { icon: "🔥", label: "Priorità Massima", color: "text-red-400" },
  high: { icon: "🟢", label: "Alta", color: "text-emerald-400" },
  medium: { icon: "🟡", label: "Media", color: "text-amber-400" },
  low: { icon: "⚪", label: "Bassa", color: "text-muted-foreground" },
};

// RP-002 — Confidence labels per la UI
export const CONFIDENCE_LABELS: Record<ConfidenceLabel, { color: string; bgClass: string }> = {
  alta: { color: "text-emerald-400", bgClass: "bg-emerald-500/10" },
  media: { color: "text-amber-400", bgClass: "bg-amber-500/10" },
  bassa: { color: "text-muted-foreground", bgClass: "bg-secondary/50" },
};

/**
 *Conta quanti target ci sono per bucket di priorità.
 * Utile per mostrare un riepilogo in UI ("12 massima · 18 alta · ...").
 */
export function summarizeByPriority(
  targets: ScoredArtist[]
): Record<PriorityBucket, number> {
  const summary: Record<PriorityBucket, number> = {
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

/**
 * RP-002 — Conta quanti target ci sono per bucket di confidence.
 */
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
//
// Duplicato intenzionale di getArtistBeatportUrl in artist-explorer.tsx
// per evitare una dipendenza circolare (artist-explorer importa dallo store,
// store non importa da artist-explorer). Mantenere allineate le due copie
// se si modifica il pattern URL.

export function getArtistBeatportUrl(artist: Artist): string | null {
  if (artist.slug && artist.beatportId) {
    return `https://www.beatport.com/artist/${artist.slug}/${artist.beatportId}`;
  }
  return null;
}
