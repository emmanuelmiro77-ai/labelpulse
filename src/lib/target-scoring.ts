/**
 * 🔒 RP-001 — Target Finder Scoring Engine
 *
 * Motore a regole configurabili per calcolare la compatibilità
 * tra una release e ogni artista del database locale.
 *
 * Obiettivo business: aiutare il Producer a decidere chi contattare OGGI.
 * Lo score numerico è interno. La UI mostra bucket di priorità
 * (🔥 Massima / 🟢 Alta / 🟡 Media / ⚪ Bassa) + motivazione leggibile.
 *
 * Design:
 *   - Le regole sono dichiarate in un array SCORING_RULES.
 *   - Ogni regola ha: id, name, weight, enabled, evaluate(release, artist) → boolean.
 *   - Il motore itera le regole abilitate, somma i pesi di quelle attive.
 *   - Le motivazioni sono generate dinamicamente dalle regole attivate.
 *   - La recenza ha peso dominante (un artista attivo oggi vale più di uno storico).
 *
 * Nessuna dipendenza da React o Zustand. Funzione pura, testabile.
 */

import type { Artist, Release } from "./store";

// ==================== TYPES ====================

export type PriorityBucket = "max" | "high" | "medium" | "low";

export interface ScoredArtist {
  artist: Artist;
  score: number;
  rules: RuleHit[]; // regole attivate, con label leggibile
  motivation: string; // stringa leggibile concatenata
  priority: PriorityBucket;
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
      if (d <= 7) {
        return { id: "seen_last_7d", label: "in classifica questa settimana" };
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
      if (d > 7 && d <= 30) {
        return { id: "seen_last_30d", label: "in classifica nell'ultimo mese" };
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
      if (d > 30 && d <= 90) {
        return { id: "seen_last_90d", label: "attivo negli ultimi 3 mesi" };
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
        label: `presenza frequente (${artist.totalPoints} punti)`,
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

  return {
    artist,
    score,
    rules: hits,
    motivation,
    priority: bucketForScore(score),
  };
}

function bucketForScore(score: number): PriorityBucket {
  if (score >= PRIORITY_THRESHOLDS.max) return "max";
  if (score >= PRIORITY_THRESHOLDS.high) return "high";
  if (score >= PRIORITY_THRESHOLDS.medium) return "medium";
  return "low";
}

/**
 * Calcola la lista ordinata di top targets per una release.
 *
 * @param release la release di riferimento
 * @param artists tutti gli artisti cached localmente
 * @param options.minScore score minimo per inclusione (default 10)
 * @param options.limit numero massimo di risultati (default 50)
 */
export function calculateTopTargets(
  release: Release,
  artists: Artist[],
  options?: { minScore?: number; limit?: number }
): ScoredArtist[] {
  const minScore = options?.minScore ?? MIN_SCORE_TO_INCLUDE;
  const limit = options?.limit ?? DEFAULT_LIMIT;

  return artists
    .map((a) => scoreArtistForRelease(release, a))
    .filter((s) => s.score >= minScore)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}

// ==================== UI HELPERS ====================

export const PRIORITY_LABELS: Record<PriorityBucket, { icon: string; label: string; color: string }> = {
  max: { icon: "🔥", label: "Priorità Massima", color: "text-red-400" },
  high: { icon: "🟢", label: "Alta", color: "text-emerald-400" },
  medium: { icon: "🟡", label: "Media", color: "text-amber-400" },
  low: { icon: "⚪", label: "Bassa", color: "text-muted-foreground" },
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
