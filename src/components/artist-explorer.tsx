"use client";

/**
 * ArtistExplorer — Phase 2 of the artist-tracking feature.
 *
 * Two-view component controlled by `selectedArtistId` in the global store:
 *   1. List view  — searchable / filterable / sortable grid of artist cards.
 *   2. Detail view — deep-dive into a single artist: charted tracks grouped by
 *                    genre, label grid, active genres.
 *
 * The store (`@/lib/store`) is being extended IN PARALLEL by another agent to
 * add `artists`, `selectedArtistId`, and `setSelectedArtistId`. We access those
 * fields defensively through `(store as any)` so this file compiles today and
 * keeps working once the store types land.
 */

import { useAppStore } from "@/lib/store";
import { getLabelDiscoveryUrls } from "@/lib/label-links";
import { t, type Locale } from "@/lib/i18n";
import React, {
  useState,
  useMemo,
  useRef,
  useEffect,
  useCallback,
} from "react";
import { Button } from "@/components/ui/button";
import {
  Search,
  Flame,
  ArrowLeft,
  ExternalLink,
  Play,
  Pause,
  Music2,
  Disc3,
  ChevronDown,
  TrendingUp,
  Award,
  Hash,
  Calendar,
  ListMusic,
  Building2,
  BarChart3,
} from "lucide-react";

// ============================================================================
// TYPES — mirror the interfaces the store is being extended with.
// (Re-declared locally so this file is self-contained and type-safe today.)
// ============================================================================

export interface ArtistTrack {
  id: number;
  name: string;
  mixName: string;
  position: number;
  points: number;
  label: string;
  labelId: number | null;
  labelSlug: string;
  releaseDate: string;
  bpm: number | null;
  keyCamelot: string;
  keyName: string;
  coverArt: string;
  sampleUrl: string;
  seenAt: string;
}

export interface Artist {
  id: string; // 'bp_6824' or 'nm_<name>'
  beatportId: number | null;
  name: string;
  slug: string;
  imageUrl: string;
  genres: string[];
  tracksByGenre: Record<string, ArtistTrack[]>;
  labelsPublishedOn: string[];
  totalPoints: number;
  bestPosition: number;
  isRemixerOnly: boolean;
  trending: boolean;
  trendingRankByGenre?: Record<string, number>;
  trendingPointsByGenre?: Record<string, number>;
}

// ============================================================================
// CONSTANTS
// ============================================================================

const PAGE_SIZE = 50;

/** Restricted palette for the avatar fallback (warm/earth — no blue/indigo). */
const AVATAR_COLORS = [
  "bg-rose-500/80",
  "bg-amber-500/80",
  "bg-emerald-500/80",
  "bg-orange-500/80",
  "bg-fuchsia-500/80",
  "bg-teal-500/80",
  "bg-purple-500/80",
  "bg-pink-500/80",
  "bg-lime-600/80",
  "bg-red-500/80",
];

type SortMode = "points" | "bestPos" | "name" | "tracks";

// ============================================================================
// HELPERS
// ============================================================================

/** Deterministic hash → palette index for the avatar fallback color. */
function hashNameToColor(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = (hash << 5) - hash + name.charCodeAt(i);
    hash |= 0;
  }
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
}

/** Format an ISO date as DD/MM/YYYY (or locale-aware). */
function formatReleaseDate(iso: string | undefined, locale: Locale): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "—";
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const yyyy = d.getFullYear();
  // Italian default; English uses MM/DD/YYYY, others DD/MM/YYYY.
  if (locale === "en") return `${mm}/${dd}/${yyyy}`;
  return `${dd}/${mm}/${yyyy}`;
}

/** Color class for a chart position (lower = better). */
function getPositionColor(pos: number | null | undefined): string {
  if (!pos || pos <= 0) return "text-muted-foreground";
  if (pos <= 10) return "text-emerald-400";
  if (pos <= 25) return "text-amber-400";
  return "text-muted-foreground";
}

function getPositionBg(pos: number | null | undefined): string {
  if (!pos || pos <= 0) return "bg-muted/40 text-muted-foreground";
  if (pos <= 10) return "bg-emerald-500/15 text-emerald-400";
  if (pos <= 25) return "bg-amber-500/15 text-amber-400";
  return "bg-muted/40 text-muted-foreground";
}

/** Color class for a Camelot key badge (A = minor, B = major). */
function getKeyColor(camelot: string | undefined): string {
  if (!camelot) return "bg-muted/40 text-muted-foreground";
  if (camelot.trim().toUpperCase().endsWith("A")) {
    return "bg-emerald-500/15 text-emerald-400";
  }
  if (camelot.trim().toUpperCase().endsWith("B")) {
    return "bg-amber-500/15 text-amber-400";
  }
  return "bg-muted/40 text-muted-foreground";
}

/** Total track count across every genre for an artist. */
function getArtistTrackCount(artist: Artist): number {
  const tbg = artist.tracksByGenre;
  if (!tbg || typeof tbg !== "object") return 0;
  let n = 0;
  for (const g of Object.keys(tbg)) {
    const arr = tbg[g];
    if (Array.isArray(arr)) n += arr.length;
  }
  return n;
}

/** Build the Beatport artist URL when both slug and beatportId are present. */
function getArtistBeatportUrl(artist: Artist): string | null {
  if (artist.slug && artist.beatportId) {
    return `https://www.beatport.com/artist/${artist.slug}/${artist.beatportId}`;
  }
  return null;
}

/** Reverse-lookup a label name → store Label (case-insensitive). */
function findStoreLabel(
  labels: { id: string; name: string; beatportLink?: string }[] | undefined,
  name: string
): { id: string; name: string; beatportLink?: string } | undefined {
  if (!labels || !name) return undefined;
  const lc = name.toLowerCase().trim();
  return labels.find((l) => l.name && l.name.toLowerCase().trim() === lc);
}

/** Localized literal string helper (Italian default, English fallback). */
function it(loc: Locale, it: string, en: string): string {
  return loc === "en" ? en : it;
}

// ============================================================================
// SUB-COMPONENTS
// ============================================================================

/** Artist avatar with image + graceful fallback to a colored initial circle. */
function ArtistAvatar({
  artist,
  size = 64,
  className = "",
}: {
  artist: Pick<Artist, "name" | "imageUrl">;
  size?: number;
  className?: string;
}) {
  const [errored, setErrored] = useState(false);
  const showImg = artist.imageUrl && !errored;
  const initial = (artist.name || "?").trim().charAt(0).toUpperCase() || "?";
  const color = hashNameToColor(artist.name || "?");

  return (
    <div
      className={`relative shrink-0 overflow-hidden rounded-full ${className}`}
      style={{ width: size, height: size }}
    >
      {showImg ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={artist.imageUrl}
          alt={artist.name}
          width={size}
          height={size}
          loading="lazy"
          onError={() => setErrored(true)}
          className="h-full w-full object-cover"
        />
      ) : (
        <div
          className={`flex h-full w-full items-center justify-center font-bold text-white ${color}`}
          style={{ fontSize: Math.round(size * 0.42) }}
          aria-hidden="true"
        >
          {initial}
        </div>
      )}
    </div>
  );
}

/** Small genre pill. */
function GenrePill({ name }: { name: string }) {
  return (
    <span className="inline-flex items-center rounded-full bg-secondary/60 px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
      {name}
    </span>
  );
}

// ----------------------------------------------------------------------------
// Artist card (list view)
// ----------------------------------------------------------------------------

function ArtistCard({
  artist,
  locale,
  onSelect,
}: {
  artist: Artist;
  locale: Locale;
  onSelect: (id: string) => void;
}) {
  const trackCount = getArtistTrackCount(artist);
  const labelCount = artist.labelsPublishedOn?.length ?? 0;
  const topGenres = (artist.genres || []).slice(0, 3);

  return (
    <button
      type="button"
      onClick={() => onSelect(artist.id)}
      className="group flex w-full items-start gap-3 rounded-xl border border-border/40 bg-card/60 p-3 text-left transition-all hover:border-primary/30 hover:bg-card/80 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
    >
      <ArtistAvatar artist={artist} size={64} />

      <div className="min-w-0 flex-1">
        {/* Name + trending flame */}
        <div className="flex items-center gap-1.5">
          <h3 className="truncate text-sm font-semibold text-foreground">
            {artist.name}
          </h3>
          {artist.trending && (
            <Flame
              className="h-3.5 w-3.5 shrink-0 text-amber-400"
              aria-label="trending"
            />
          )}
          {artist.isRemixerOnly && (
            <span
              className="shrink-0 rounded bg-fuchsia-500/15 px-1 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-fuchsia-400"
              title={it(locale, "Solo remix", "Remixer only")}
            >
              remix
            </span>
          )}
        </div>

        {/* Genre badges (top 3) */}
        {topGenres.length > 0 && (
          <div className="mt-1 flex flex-wrap gap-1">
            {topGenres.map((g) => (
              <GenrePill key={g} name={g} />
            ))}
          </div>
        )}

        {/* Stats line */}
        <p className="mt-1.5 text-[11px] text-muted-foreground">
          <span className="font-medium text-foreground/80">{trackCount}</span>{" "}
          {it(locale, "tracce", "tracks")}
          {" · "}
          <span className="font-medium text-foreground/80">{labelCount}</span>{" "}
          {it(locale, "label", "labels")}
          {artist.bestPosition && artist.bestPosition > 0 ? (
            <>
              {" · "}
              <span className="font-medium text-emerald-400">
                #{artist.bestPosition}
              </span>{" "}
              {it(locale, "best pos", "best pos")}
            </>
          ) : null}
        </p>
      </div>
    </button>
  );
}

// ----------------------------------------------------------------------------
// Track row (detail view)
// ----------------------------------------------------------------------------

function TrackRow({
  track,
  locale,
  isPlaying,
  onTogglePlay,
  onLabelClick,
}: {
  track: ArtistTrack;
  locale: Locale;
  isPlaying: boolean;
  onTogglePlay: (track: ArtistTrack) => void;
  onLabelClick: (labelName: string) => void;
}) {
  const canPlay = !!track.sampleUrl;
  return (
    <div className="flex items-center gap-2 border-b border-border/20 px-2 py-2 last:border-0 hover:bg-secondary/30">
      {/* Position */}
      <div
        className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-xs font-bold ${getPositionBg(
          track.position
        )}`}
        title={`#${track.position ?? "—"}`}
      >
        {track.position ? `#${track.position}` : "—"}
      </div>

      {/* Cover + name + mix */}
      <div className="flex min-w-0 flex-1 items-center gap-2">
        {track.coverArt ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={track.coverArt}
            alt=""
            loading="lazy"
            className="hidden h-9 w-9 shrink-0 rounded object-cover sm:block"
          />
        ) : (
          <div className="hidden h-9 w-9 shrink-0 items-center justify-center rounded bg-secondary/60 sm:flex">
            <Music2 className="h-4 w-4 text-muted-foreground" />
          </div>
        )}
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium text-foreground">
            {track.name || "—"}
          </p>
          {track.mixName && (
            <p className="truncate text-[11px] text-muted-foreground">
              {track.mixName}
            </p>
          )}
        </div>
      </div>

      {/* BPM */}
      <div className="hidden w-12 shrink-0 text-right font-mono text-[11px] text-muted-foreground md:block">
        {track.bpm ? `${track.bpm}` : "—"}
      </div>

      {/* Key */}
      {track.keyCamelot && (
        <span
          className={`hidden shrink-0 rounded px-1.5 py-0.5 font-mono text-[10px] font-semibold sm:inline-block ${getKeyColor(
            track.keyCamelot
          )}`}
          title={track.keyName || track.keyCamelot}
        >
          {track.keyCamelot}
        </span>
      )}

      {/* Label */}
      <button
        type="button"
        onClick={() => track.label && onLabelClick(track.label)}
        className="hidden max-w-[120px] shrink-0 truncate text-[11px] text-muted-foreground transition-colors hover:text-primary hover:underline lg:block"
        title={track.label || ""}
      >
        {track.label || "—"}
      </button>

      {/* Release date */}
      <span className="hidden w-20 shrink-0 text-right font-mono text-[10px] text-muted-foreground lg:block">
        {formatReleaseDate(track.releaseDate, locale)}
      </span>

      {/* Play button */}
      <button
        type="button"
        disabled={!canPlay}
        onClick={() => onTogglePlay(track)}
        className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full transition-colors ${
          canPlay
            ? isPlaying
              ? "bg-primary text-primary-foreground"
              : "bg-primary/15 text-primary hover:bg-primary/25"
            : "cursor-not-allowed bg-muted/30 text-muted-foreground/40"
        }`}
        title={
          canPlay
            ? isPlaying
              ? it(locale, "Pausa", "Pause")
              : it(locale, "Riproduci", "Play")
            : it(locale, "Anteprima non disponibile", "No preview")
        }
        aria-label={
          canPlay
            ? isPlaying
              ? "Pause preview"
              : "Play preview"
            : "No preview"
        }
      >
        {isPlaying ? (
          <Pause className="h-3.5 w-3.5" />
        ) : (
          <Play className="h-3.5 w-3.5 translate-x-[1px]" />
        )}
      </button>
    </div>
  );
}

// ============================================================================
// DETAIL VIEW
// ============================================================================

function ArtistDetail({
  artist,
  locale,
  labels,
  onBack,
  onLabelClick,
}: {
  artist: Artist;
  locale: Locale;
  labels: { id: string; name: string; beatportLink?: string }[] | undefined;
  onBack: () => void;
  onLabelClick: (labelName: string) => void;
}) {
  // ----- Audio playback (single shared <audio> element) -----
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [playingTrackId, setPlayingTrackId] = useState<number | null>(null);

  const togglePlay = useCallback((track: ArtistTrack) => {
    const audio = audioRef.current;
    if (!audio) return;
    if (playingTrackId === track.id) {
      // Same track → toggle pause
      if (audio.paused) {
        audio.play().catch(() => {});
      } else {
        audio.pause();
      }
      return;
    }
    // New track → swap src and play
    audio.src = track.sampleUrl;
    audio.play().catch(() => {});
    setPlayingTrackId(track.id);
  }, [playingTrackId]);

  // Reset playback state when audio ends
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    const onEnded = () => setPlayingTrackId(null);
    const onPause = () => {
      // Only reset if truly paused (not just seeking)
      if (audio.ended) setPlayingTrackId(null);
    };
    audio.addEventListener("ended", onEnded);
    audio.addEventListener("pause", onPause);
    return () => {
      audio.removeEventListener("ended", onEnded);
      audio.removeEventListener("pause", onPause);
    };
  }, []);

  const beatportUrl = getArtistBeatportUrl(artist);
  const totalTracks = getArtistTrackCount(artist);
  const totalLabels = artist.labelsPublishedOn?.length ?? 0;
  const genres = artist.genres || [];

  // ----- Tracks grouped by genre, sorted by position asc -----
  const genreEntries = useMemo(() => {
    const tbg = artist.tracksByGenre || {};
    return Object.entries(tbg)
      .filter(([, arr]) => Array.isArray(arr) && arr.length > 0)
      .map(([genre, tracks]) => ({
        genre,
        tracks: [...tracks].sort(
          (a, b) => (a.position ?? 9999) - (b.position ?? 9999)
        ),
      }))
      .sort((a, b) => b.tracks.length - a.tracks.length);
  }, [artist.tracksByGenre]);

  // ----- Label grid with track counts -----
  const labelStats = useMemo(() => {
    const counts = new Map<string, number>();
    for (const g of genreEntries) {
      for (const tr of g.tracks) {
        if (!tr.label) continue;
        counts.set(tr.label, (counts.get(tr.label) || 0) + 1);
      }
    }
    // Use artist.labelsPublishedOn order, then append any extras discovered in tracks.
    const ordered: string[] = [];
    const seen = new Set<string>();
    for (const ln of artist.labelsPublishedOn || []) {
      const key = ln;
      if (!seen.has(key)) {
        seen.add(key);
        ordered.push(key);
      }
    }
    for (const k of counts.keys()) {
      if (!seen.has(k)) {
        seen.add(k);
        ordered.push(k);
      }
    }
    return ordered.map((name) => ({
      name,
      count: counts.get(name) || 0,
      storeLabel: findStoreLabel(labels, name),
    }));
  }, [genreEntries, artist.labelsPublishedOn, labels]);

  return (
    <div className="space-y-6">
      {/* Hidden shared audio element */}
      {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
      <audio ref={audioRef} preload="none" className="hidden" />

      {/* Top bar */}
      <div className="flex items-center gap-3">
        <Button
          variant="ghost"
          size="sm"
          onClick={onBack}
          className="gap-1.5 text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" />
          {it(locale, "Indietro", "Back")}
        </Button>
      </div>

      {/* Hero */}
      <div className="rounded-2xl border border-border/40 bg-card/40 p-4 sm:p-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
          <ArtistAvatar artist={artist} size={128} />

          <div className="min-w-0 flex-1 space-y-3">
            <div>
              <h2 className="text-xl font-bold text-foreground sm:text-2xl">
                {artist.name}
              </h2>
              {genres.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {genres.map((g) => (
                    <GenrePill key={g} name={g} />
                  ))}
                </div>
              )}
            </div>

            {artist.trending && (
              <span className="inline-flex items-center gap-1 rounded-full bg-orange-500/15 px-2.5 py-1 text-xs font-semibold text-orange-400">
                <Flame className="h-3.5 w-3.5" />
                {it(locale, "Trending", "Trending")}
              </span>
            )}

            {/* Stats summary card */}
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              <StatBox
                icon={<Award className="h-4 w-4" />}
                label={it(locale, "Punti", "Points")}
                value={artist.totalPoints?.toLocaleString() ?? "0"}
              />
              <StatBox
                icon={<Hash className="h-4 w-4" />}
                label={it(locale, "Best pos", "Best pos")}
                value={
                  artist.bestPosition && artist.bestPosition > 0
                    ? `#${artist.bestPosition}`
                    : "—"
                }
                valueClass={getPositionColor(artist.bestPosition)}
              />
              <StatBox
                icon={<ListMusic className="h-4 w-4" />}
                label={it(locale, "Tracce", "Tracks")}
                value={totalTracks.toString()}
              />
              <StatBox
                icon={<Building2 className="h-4 w-4" />}
                label={it(locale, "Label", "Labels")}
                value={totalLabels.toString()}
              />
            </div>

            {beatportUrl && (
              <div>
                <Button
                  asChild
                  size="sm"
                  variant="outline"
                  className="gap-1.5 border-primary/30 text-primary hover:bg-primary/10"
                >
                  <a
                    href={beatportUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    <ExternalLink className="h-3.5 w-3.5" />
                    {it(locale, "Apri su Beatport", "Open on Beatport")}
                  </a>
                </Button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Section: Tracce in classifica */}
      <section className="space-y-3">
        <div className="flex items-center gap-2">
          <Music2 className="h-4 w-4 text-primary" />
          <h3 className="text-sm font-semibold text-foreground">
            {it(locale, "Tracce in classifica", "Charted tracks")}
          </h3>
          <span className="text-xs text-muted-foreground">
            ({totalTracks})
          </span>
        </div>

        {genreEntries.length === 0 ? (
          <p className="rounded-lg border border-border/30 bg-muted/20 p-4 text-center text-xs text-muted-foreground">
            {it(
              locale,
              "Nessuna traccia in classifica per questo artista.",
              "No charted tracks for this artist."
            )}
          </p>
        ) : (
          <div className="space-y-4">
            {genreEntries.map(({ genre, tracks }) => (
              <div
                key={genre}
                className="overflow-hidden rounded-xl border border-border/40 bg-card/40"
              >
                {/* Genre header */}
                <div className="flex items-center justify-between border-b border-border/30 bg-secondary/30 px-3 py-2">
                  <h4 className="text-xs font-semibold uppercase tracking-wide text-foreground">
                    {genre}
                  </h4>
                  <span className="rounded-full bg-primary/15 px-2 py-0.5 text-[10px] font-semibold text-primary">
                    {tracks.length}
                  </span>
                </div>

                {/* Track list (with sticky BPM/Key/Label/Date header on desktop) */}
                <div>
                  <div className="hidden items-center gap-2 border-b border-border/20 px-2 py-1.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground/70 lg:flex">
                    <span className="w-8 shrink-0">#</span>
                    <span className="min-w-0 flex-1">
                      {it(locale, "Traccia", "Track")}
                    </span>
                    <span className="w-12 shrink-0 text-right">BPM</span>
                    <span className="w-12 shrink-0 text-center">
                      {it(locale, "Key", "Key")}
                    </span>
                    <span className="max-w-[120px] shrink-0 truncate">
                      {it(locale, "Label", "Label")}
                    </span>
                    <span className="w-20 shrink-0 text-right">
                      {it(locale, "Data", "Date")}
                    </span>
                    <span className="w-8 shrink-0" />
                  </div>
                  {tracks.map((tr) => (
                    <TrackRow
                      key={tr.id}
                      track={tr}
                      locale={locale}
                      isPlaying={playingTrackId === tr.id}
                      onTogglePlay={togglePlay}
                      onLabelClick={onLabelClick}
                    />
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Section: Label su cui pubblica */}
      <section className="space-y-3">
        <div className="flex items-center gap-2">
          <Disc3 className="h-4 w-4 text-primary" />
          <h3 className="text-sm font-semibold text-foreground">
            {it(locale, "Label su cui pubblica", "Labels published on")}
          </h3>
          <span className="text-xs text-muted-foreground">
            ({labelStats.length})
          </span>
        </div>

        {labelStats.length === 0 ? (
          <p className="rounded-lg border border-border/30 bg-muted/20 p-4 text-center text-xs text-muted-foreground">
            {it(
              locale,
              "Nessuna label associata.",
              "No labels associated."
            )}
          </p>
        ) : (
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {labelStats.map(({ name, count, storeLabel }) => {
              // Build discovery URLs (uses user-saved beatportLink if available,
              // otherwise falls back to a Beatport search URL by label name).
              const urls = getLabelDiscoveryUrls({
                name,
                beatportLink: storeLabel?.beatportLink,
              });
              return (
                <div
                  key={name}
                  className="group flex items-center justify-between gap-2 rounded-lg border border-border/40 bg-card/40 p-3 transition-all hover:border-primary/30 hover:bg-card/70"
                >
                  <button
                    type="button"
                    onClick={() => onLabelClick(name)}
                    className="min-w-0 flex-1 text-left"
                    title={it(locale, "Apri dettaglio label", "Open label details")}
                  >
                    <p className="truncate text-sm font-medium text-foreground group-hover:text-primary">
                      {name}
                    </p>
                    <p className="text-[11px] text-muted-foreground">
                      {count} {it(locale, "tracce", "tracks")}
                    </p>
                  </button>
                  {/* Inline discovery icons: each opens in a new tab and
                      stops propagation so the card click (label detail)
                      doesn't fire. */}
                  <div className="flex shrink-0 items-center gap-1">
                    <a
                      href={urls.beatport}
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={(e) => e.stopPropagation()}
                      title={urls.beatportIsDirect
                        ? it(locale, "Apri pagina Beatport della label", "Open label's Beatport page")
                        : it(locale, "Cerca su Beatport", "Search on Beatport")}
                      className="flex h-6 w-6 items-center justify-center rounded-md bg-emerald-500/10 text-emerald-400 transition-colors hover:bg-emerald-500/20"
                    >
                      <ExternalLink className="h-3 w-3" />
                    </a>
                    <a
                      href={urls.beatstats}
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={(e) => e.stopPropagation()}
                      title={it(locale, "Cerca su Beatstats", "Search on Beatstats")}
                      className="flex h-6 w-6 items-center justify-center rounded-md bg-cyan-500/10 text-cyan-400 transition-colors hover:bg-cyan-500/20"
                    >
                      <BarChart3 className="h-3 w-3" />
                    </a>
                    <span className="ml-1 rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-semibold text-primary">
                      {count}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* Section: Generi attivi */}
      {genres.length > 0 && (
        <section className="space-y-3">
          <div className="flex items-center gap-2">
            <Hash className="h-4 w-4 text-primary" />
            <h3 className="text-sm font-semibold text-foreground">
              {it(locale, "Generi attivi", "Active genres")}
            </h3>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {genres.map((g) => (
              <span
                key={g}
                className="rounded-full bg-secondary/60 px-2.5 py-1 text-xs font-medium text-muted-foreground"
              >
                {g}
              </span>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

/** Small stat box used in the hero summary card. */
function StatBox({
  icon,
  label,
  value,
  valueClass = "text-foreground",
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  valueClass?: string;
}) {
  return (
    <div className="rounded-lg border border-border/30 bg-secondary/20 p-2.5">
      <div className="flex items-center gap-1 text-[10px] uppercase tracking-wide text-muted-foreground">
        {icon}
        <span className="truncate">{label}</span>
      </div>
      <p className={`mt-1 text-base font-bold ${valueClass}`}>{value}</p>
    </div>
  );
}

// ============================================================================
// LIST VIEW
// ============================================================================

function ArtistList({
  artists,
  locale,
  onSelect,
}: {
  artists: Artist[];
  locale: Locale;
  onSelect: (id: string) => void;
}) {
  const [search, setSearch] = useState("");
  const [trendingOnly, setTrendingOnly] = useState(false);
  const [remixerOnly, setRemixerOnly] = useState(false);
  const [genreFilter, setGenreFilter] = useState<string | null>(null);
  const [sortMode, setSortMode] = useState<SortMode>("points");
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const [sortOpen, setSortOpen] = useState(false);

  // ----- All genres, deduped + sorted -----
  const allGenres = useMemo(() => {
    const set = new Set<string>();
    for (const a of artists) {
      if (a.genres && Array.isArray(a.genres)) {
        for (const g of a.genres) set.add(g);
      }
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [artists]);

  // ----- Filtered + sorted list -----
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    let list = artists.filter((a) => {
      if (q && !(a.name || "").toLowerCase().includes(q)) return false;
      if (trendingOnly && !a.trending) return false;
      if (remixerOnly && !a.isRemixerOnly) return false;
      if (genreFilter && !(a.genres || []).includes(genreFilter)) return false;
      return true;
    });

    list = list.sort((a, b) => {
      switch (sortMode) {
        case "bestPos": {
          const ap = a.bestPosition && a.bestPosition > 0 ? a.bestPosition : 99999;
          const bp = b.bestPosition && b.bestPosition > 0 ? b.bestPosition : 99999;
          return ap - bp;
        }
        case "name":
          return (a.name || "").localeCompare(b.name || "");
        case "tracks":
          return getArtistTrackCount(b) - getArtistTrackCount(a);
        case "points":
        default:
          return (b.totalPoints || 0) - (a.totalPoints || 0);
      }
    });

    return list;
  }, [artists, search, trendingOnly, remixerOnly, genreFilter, sortMode]);

  // Reset pagination when filters change
  useEffect(() => {
    setVisibleCount(PAGE_SIZE);
  }, [search, trendingOnly, remixerOnly, genreFilter, sortMode]);

  const trendingCount = useMemo(
    () => artists.filter((a) => a.trending).length,
    [artists]
  );

  const visible = filtered.slice(0, visibleCount);
  const hasMore = filtered.length > visibleCount;

  const sortLabel = useMemo(() => {
    switch (sortMode) {
      case "bestPos":
        return it(locale, "Posizione migliore", "Best position");
      case "name":
        return it(locale, "Nome (A-Z)", "Name (A-Z)");
      case "tracks":
        return it(locale, "Più tracce", "Most tracks");
      case "points":
      default:
        return it(locale, "Punti (alto → basso)", "Points (high → low)");
    }
  }, [sortMode, locale]);

  return (
    <div className="space-y-4">
      {/* Header */}
      <div>
        <h2 className="text-xl font-bold text-foreground">
          {it(locale, "Artisti", "Artists")}
        </h2>
        <p className="text-sm text-muted-foreground">
          {artists.length.toLocaleString()}{" "}
          {it(locale, "artisti", "artists")} · {trendingCount.toLocaleString()}{" "}
          {it(locale, "trending", "trending")}
        </p>
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={it(
            locale,
            "Cerca artista... (es. Adam Beyer)",
            "Search artist... (e.g. Adam Beyer)"
          )}
          className="h-11 w-full rounded-lg border border-border/50 bg-card/60 pl-10 pr-4 text-sm text-foreground placeholder:text-muted-foreground/60 focus:border-primary/40 focus:outline-none focus:ring-2 focus:ring-primary/20"
        />
      </div>

      {/* Filter chips (horizontally scrollable on mobile) */}
      <div className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1">
        <FilterChip
          active={!trendingOnly && !remixerOnly && genreFilter === null}
          onClick={() => {
            setTrendingOnly(false);
            setRemixerOnly(false);
            setGenreFilter(null);
          }}
        >
          {it(locale, "Tutti", "All")}
        </FilterChip>

        <FilterChip active={trendingOnly} onClick={() => setTrendingOnly((v) => !v)}>
          <Flame className="h-3 w-3" />
          {it(locale, "Trending", "Trending")}
        </FilterChip>

        <FilterChip active={remixerOnly} onClick={() => setRemixerOnly((v) => !v)}>
          <TrendingUp className="h-3 w-3" />
          {it(locale, "Remixer", "Remixer")}
        </FilterChip>

        {allGenres.map((g) => (
          <FilterChip
            key={g}
            active={genreFilter === g}
            onClick={() => setGenreFilter((prev) => (prev === g ? null : g))}
          >
            {g}
          </FilterChip>
        ))}
      </div>

      {/* Sort dropdown + result count */}
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs text-muted-foreground">
          {filtered.length.toLocaleString()}{" "}
          {it(locale, "risultati", "results")}
        </p>

        <div className="relative">
          <Button
            variant="outline"
            size="sm"
            className="gap-1.5"
            onClick={() => setSortOpen((v) => !v)}
          >
            <Award className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">{sortLabel}</span>
            <span className="sm:hidden">{it(locale, "Ordina", "Sort")}</span>
            <ChevronDown
              className={`h-3.5 w-3.5 transition-transform ${
                sortOpen ? "rotate-180" : ""
              }`}
            />
          </Button>
          {sortOpen && (
            <>
              {/* Click-away overlay */}
              <div
                className="fixed inset-0 z-40"
                onClick={() => setSortOpen(false)}
              />
              <div className="absolute right-0 z-50 mt-1 min-w-[200px] overflow-hidden rounded-lg border border-border bg-popover shadow-lg">
                {(
                  [
                    ["points", it(locale, "Punti (alto → basso)", "Points (high → low)")],
                    ["bestPos", it(locale, "Posizione migliore", "Best position")],
                    ["name", it(locale, "Nome (A-Z)", "Name (A-Z)")],
                    ["tracks", it(locale, "Più tracce", "Most tracks")],
                  ] as const
                ).map(([mode, label]) => (
                  <button
                    key={mode}
                    onClick={() => {
                      setSortMode(mode);
                      setSortOpen(false);
                    }}
                    className={`flex w-full items-center justify-between px-3 py-2 text-left text-sm transition-colors hover:bg-accent/50 ${
                      sortMode === mode
                        ? "bg-primary/10 font-medium text-primary"
                        : "text-foreground"
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </>
          )}
        </div>
      </div>

      {/* Results grid */}
      {visible.length === 0 ? (
        <div className="rounded-lg border border-border/30 bg-muted/20 py-16 text-center">
          <Search className="mx-auto mb-3 h-10 w-10 opacity-30" />
          <p className="text-sm text-muted-foreground">
            {it(locale, "Nessun artista trovato", "No artists found")}
          </p>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 gap-2 lg:grid-cols-2">
            {visible.map((a) => (
              <ArtistCard
                key={a.id}
                artist={a}
                locale={locale}
                onSelect={onSelect}
              />
            ))}
          </div>

          {hasMore && (
            <div className="flex justify-center pt-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setVisibleCount((c) => c + PAGE_SIZE)}
                className="gap-1.5"
              >
                {it(locale, "Carica altri", "Load more")} (
                {filtered.length - visible.length})
              </Button>
            </div>
          )}
        </>
      )}
    </div>
  );
}

/** Filter chip used in the list view's chip row. */
function FilterChip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex shrink-0 items-center gap-1 rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
        active
          ? "border-primary/30 bg-primary/15 text-primary"
          : "border-border/50 bg-card/40 text-muted-foreground hover:text-foreground hover:bg-secondary/50"
      }`}
    >
      {children}
    </button>
  );
}

// ============================================================================
// MAIN COMPONENT
// ============================================================================

export default function ArtistExplorer() {
  // NOTE: `artists`, `selectedArtistId`, `setSelectedArtistId` are being added
  // to the store IN PARALLEL by another agent. We cast through `unknown` so
  // this file type-checks today and keeps working once those fields land.
  const store = useAppStore() as unknown as {
    locale: Locale;
    labels: { id: string; name: string; beatportLink?: string }[];
    setActiveTab: (tab: "dashboard" | "labels" | "rankings" | "demos" | "pitch" | "profile") => void;
    artists?: Artist[];
    selectedArtistId?: string | null;
    setSelectedArtistId?: (id: string | null) => void;
    selectedLabelId?: string | null;
    setSelectedLabelId?: (id: string | null) => void;
  };

  const { locale, labels, setActiveTab } = store;
  const artists = store.artists;
  const selectedArtistId = store.selectedArtistId ?? null;
  const setSelectedArtistId = store.setSelectedArtistId;
  const setSelectedLabelId = store.setSelectedLabelId;

  // Defensive: guard against undefined arrays.
  const safeArtists = useMemo(
    () => (Array.isArray(artists) ? artists : []),
    [artists]
  );

  const selectedArtist = useMemo(
    () =>
      selectedArtistId
        ? safeArtists.find((a) => a.id === selectedArtistId) || null
        : null,
    [safeArtists, selectedArtistId]
  );

  const handleSelect = useCallback(
    (id: string) => {
      setSelectedArtistId?.(id);
      // Scroll to top so the detail hero is visible.
      if (typeof window !== "undefined") {
        window.scrollTo({ top: 0, behavior: "smooth" });
      }
    },
    [setSelectedArtistId]
  );

  const handleBack = useCallback(() => {
    setSelectedArtistId?.(null);
  }, [setSelectedArtistId]);

  const handleLabelClick = useCallback(
    (labelName: string) => {
      // Cross-tab navigation: try to resolve the label id by name (case-
      // insensitive) so the LabelFinder can open its detail dialog
      // directly. If we can't find a match (e.g. the label was scraped
      // but isn't in the user's saved labels), we still switch to the
      // Labels tab so the user can search manually.
      if (!setSelectedLabelId) {
        setActiveTab("labels");
        return;
      }
      const match = labels.find(
        (l) => l.name.toLowerCase().trim() === labelName.toLowerCase().trim()
      );
      // If we have an id, pass that. Otherwise pass the name itself —
      // LabelFinder's useEffect falls back to name matching.
      setSelectedLabelId(match?.id || labelName);
      setActiveTab("labels");
    },
    [labels, setActiveTab, setSelectedLabelId]
  );

  // ----- Empty state (no artists loaded yet) -----
  if (safeArtists.length === 0) {
    return (
      <div className="rounded-lg border border-border/30 bg-muted/20 py-16 text-center">
        <Music2 className="mx-auto mb-3 h-10 w-10 opacity-30" />
        <p className="text-sm text-muted-foreground">
          {locale === "it"
            ? "Nessun artista caricato. Avvia lo scraper per popolare la lista."
            : "No artists loaded yet. Run the scraper to populate the list."}
        </p>
      </div>
    );
  }

  // ----- Detail view -----
  if (selectedArtistId && selectedArtist) {
    return (
      <ArtistDetail
        artist={selectedArtist}
        locale={locale}
        labels={labels}
        onBack={handleBack}
        onLabelClick={handleLabelClick}
      />
    );
  }

  // If an id is set but the artist can't be found, reset and show list.
  if (selectedArtistId && !selectedArtist) {
    // Best-effort clear (defensive against stale ids).
    if (typeof window !== "undefined") {
      // Defer to avoid setState-during-render.
      setTimeout(() => setSelectedArtistId?.(null), 0);
    }
  }

  // ----- List view (default) -----
  return (
    <ArtistList
      artists={safeArtists}
      locale={locale}
      onSelect={handleSelect}
    />
  );
}
