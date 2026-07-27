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
// 🔒 WP-005 — Project Context: hook opzionale per leggere il Project
// corrente. Ritorna null quando Artist Explorer è usato fuori da un
// <ProjectProvider> (es. tab Artists della home): in quel caso il
// comportamento del componente è IDENTICO a prima.
import { useProject } from "@/context/project-context";
import React, {
  useState,
  useMemo,
  useRef,
  useEffect,
  useCallback,
} from "react";
import { Button } from "@/components/ui/button";
import { SmartSearch } from "@/components/smart-search";
import { AiOutreachAdvisor } from "@/components/ai-outreach-advisor";
import { calculateTargets, type ScoredArtist } from "@/lib/target-scoring";
import {
  type ArtistCustomRow,
  apiFetchCustomArtists,
  apiFetchCustomArtistByBeatportId,
  apiCreateCustomArtist,
  apiUpdateCustomArtist,
} from "@/lib/api-client";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label as UILabel } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Plus, Loader2, UserPlus, Pencil } from "lucide-react";
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
  id: string; // 'bp_6824' or 'nm_<name>' or 'custom_<ts>_<rand>'
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
  // RP-034 PATCH — custom artist data (artist_custom_data table).
  // Populated only for manually-created artists; NULL for Beatport artists.
  beatportUrl?: string | null;
  instagramUrl?: string | null;
  spotifyUrl?: string | null;
  soundcloudUrl?: string | null;
  websiteUrl?: string | null;
  email?: string | null;
  // RP-035 — true per gli artisti creati manualmente (artist_custom_data).
  // Usato per mostrare il pulsante "Edit Artist" nel detail.
  isCustom?: boolean;
  // RP-036 — id del record in artist_custom_data collegato a questo artista.
  // - Per artisti custom standalone: uguale a `id` (es. "custom_123_abc").
  // - Per artisti Beatport con CRM record: l'id del CRM record (es. "custom_456_def")
  //   mentre `id` resta "bp_6824". Permette di sapere se l'artista ha un CRM
  //   e di aggiornarlo via PATCH.
  // - Per artisti Beatport senza CRM: undefined.
  customId?: string;
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
  onBackToLabel,
  returnToLabelName,
  selectedRelease,
  scoredArtist,
  onEditArtist,
  editCrmLoading,
}: {
  artist: Artist;
  locale: Locale;
  labels: { id: string; name: string; beatportLink?: string }[] | undefined;
  onBack: () => void;
  onLabelClick: (labelName: string) => void;
  onBackToLabel?: () => void;
  returnToLabelName?: string;
  selectedRelease?: any | null;
  scoredArtist?: ScoredArtist | null;
  // RP-036 — passato dal parent per TUTTI gli artisti (non solo custom).
  // La logica che decide EDIT vs CREATE-from-Beatport è nel parent (handleEditCrm).
  onEditArtist?: (artist: Artist) => void;
  // RP-036 — true mentre handleEditCrm cerca il CRM via beatport_id (solo per
  // artisti Beatport senza customId). Mostra uno spinner nel pulsante Edit CRM.
  editCrmLoading?: boolean;
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

  // RP-034 PATCH — Beatport URL resolution
  // Priority: artist.beatportUrl (custom, from artist_custom_data) > getArtistBeatportUrl(artist) (Beatport dataset slug+id)
  // Beatport artists have beatportUrl === undefined → falls back to existing logic (UNCHANGED).
  // Custom artists with beatport_url set → uses the saved link directly.
  const beatportUrl = artist.beatportUrl?.trim() || getArtistBeatportUrl(artist);
  const totalTracks = getArtistTrackCount(artist);
  const totalLabels = artist.labelsPublishedOn?.length ?? 0;
  const genres = artist.genres || [];

  // RP-034 PATCH — custom streaming links (only shown when saved by the user)
  const spotifyUrl = artist.spotifyUrl?.trim() || null;
  const soundcloudUrl = artist.soundcloudUrl?.trim() || null;

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
      <div className="flex items-center gap-2 flex-wrap">
        <Button
          variant="ghost"
          size="sm"
          onClick={onBack}
          className="gap-1.5 text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" />
          {it(locale, "Indietro", "Back")}
        </Button>
        {onBackToLabel && (
          <Button
            variant="ghost"
            size="sm"
            onClick={onBackToLabel}
            className="gap-1.5 text-primary hover:text-primary/80 border border-primary/30 hover:border-primary/50 bg-primary/5"
            title={it(locale, `Torna alla label ${returnToLabelName ?? ""}`.trim(), `Back to label ${returnToLabelName ?? ""}`.trim())}
          >
            <Building2 className="h-3.5 w-3.5" />
            <span className="truncate max-w-[200px]">
              {it(locale, "Torna a", "Back to")} <span className="font-medium">{returnToLabelName}</span>
            </span>
          </Button>
        )}
        {/* RP-036 — Edit CRM button, visibile per TUTTI gli artisti.
            Il parent passa onEditArtist sempre (non più filtrato per isCustom).
            La logica di decide-mode (EDIT vs CREATE-from-Beatport) è nel parent. */}
        {onEditArtist && (
          <Button
            variant="outline"
            size="sm"
            onClick={() => onEditArtist(artist)}
            disabled={editCrmLoading}
            className="gap-1.5 ml-auto border-primary/30 text-primary hover:bg-primary/10"
            title={it(locale, "Modifica CRM", "Edit CRM")}
          >
            {editCrmLoading ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Pencil className="h-3.5 w-3.5" />
            )}
            {it(locale, "Modifica CRM", "Edit CRM")}
          </Button>
        )}
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

            {/* RP-034 PATCH — Links row.
                Beatport button: shown when (a) Beatport dataset artist with slug+id, OR
                                  (b) custom artist with beatport_url saved.
                Spotify / SoundCloud buttons: shown only when the user saved the link
                                                in artist_custom_data. */}
            {(beatportUrl || spotifyUrl || soundcloudUrl) && (
              <div className="flex flex-wrap gap-2">
                {beatportUrl && (
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
                )}
                {spotifyUrl && (
                  <Button
                    asChild
                    size="sm"
                    variant="outline"
                    className="gap-1.5 border-emerald-500/40 text-emerald-300 hover:bg-emerald-500/10"
                    title={it(
                      locale,
                      "Link Spotify salvato",
                      "Saved Spotify link",
                    )}
                  >
                    <a
                      href={spotifyUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      <ExternalLink className="h-3.5 w-3.5" />
                      Spotify
                    </a>
                  </Button>
                )}
                {soundcloudUrl && (
                  <Button
                    asChild
                    size="sm"
                    variant="outline"
                    className="gap-1.5 border-orange-500/40 text-orange-300 hover:bg-orange-500/10"
                    title={it(
                      locale,
                      "Link SoundCloud salvato",
                      "Saved SoundCloud link",
                    )}
                  >
                    <a
                      href={soundcloudUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      <ExternalLink className="h-3.5 w-3.5" />
                      SoundCloud
                    </a>
                  </Button>
                )}
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

      {/* 🔒 RP-003A: Smart Search — 4 pulsanti di ricerca rapida Google.
          🔒 RP-034 PATCH — override Instagram/Website/Contact quando valorizzati
                             in artist_custom_data (link diretto o mailto:). */}
      <section className="space-y-3">
        <SmartSearch
          artistName={artist.name}
          locale={locale}
          instagramUrl={artist.instagramUrl}
          websiteUrl={artist.websiteUrl}
          email={artist.email}
        />
      </section>

      {/* 🔒 RP-024: AI Outreach Advisor — compatibilità + strategia + DM generator */}
      <AiOutreachAdvisor
        artist={artist}
        scored={scoredArtist || null}
        release={selectedRelease || null}
        locale={locale}
      />
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
//
// 🔒 RP-037 — Lo stato della lista (search, filters, sort, pagination, sort
// dropdown open) è HOISTATO nel parent ArtistExplorer, così sopravvive alla
// navigazione verso il dettaglio artista. ArtistList riceve i valori e i
// setter come props controllate. Lo scroll della lista viene salvato nel
// parent (listScrollRef) prima di aprire il dettaglio e ripristinato al ritorno.

interface ArtistListState {
  search: string;
  trendingOnly: boolean;
  remixerOnly: boolean;
  genreFilter: string | null;
  sortMode: SortMode;
  visibleCount: number;
  sortOpen: boolean;
}

const INITIAL_LIST_STATE: ArtistListState = {
  search: "",
  trendingOnly: false,
  remixerOnly: false,
  genreFilter: null,
  sortMode: "points",
  visibleCount: PAGE_SIZE,
  sortOpen: false,
};

function ArtistList({
  artists,
  locale,
  onSelect,
  listState,
  setListState,
  listScrollRef,
}: {
  artists: Artist[];
  locale: Locale;
  onSelect: (id: string) => void;
  // 🔒 RP-037 — stato controllato dal parent per preservarlo tra navigazioni
  listState: ArtistListState;
  setListState: React.Dispatch<React.SetStateAction<ArtistListState>>;
  // 🔒 RP-037 — ref al container scrollabile per salvare/ripristinare lo scroll
  listScrollRef: React.RefObject<HTMLDivElement | null>;
}) {
  const {
    search,
    trendingOnly,
    remixerOnly,
    genreFilter,
    sortMode,
    visibleCount,
    sortOpen,
  } = listState;

  // Helper per aggiornare un singolo campo dello stato (evita di passare 7 setter separati)
  const update = useCallback(
    <K extends keyof ArtistListState>(key: K, value: ArtistListState[K]) => {
      setListState((prev) => ({ ...prev, [key]: value }));
    },
    [setListState],
  );

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

  // RP-037 — Reset pagination quando i filtri cambiano (come prima, ma via setListState)
  useEffect(() => {
    setListState((prev) =>
      prev.visibleCount === PAGE_SIZE
        ? prev
        : { ...prev, visibleCount: PAGE_SIZE },
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
          onChange={(e) => update("search", e.target.value)}
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
            setListState((prev) => ({
              ...prev,
              trendingOnly: false,
              remixerOnly: false,
              genreFilter: null,
            }));
          }}
        >
          {it(locale, "Tutti", "All")}
        </FilterChip>

        <FilterChip active={trendingOnly} onClick={() => update("trendingOnly", !trendingOnly)}>
          <Flame className="h-3 w-3" />
          {it(locale, "Trending", "Trending")}
        </FilterChip>

        <FilterChip active={remixerOnly} onClick={() => update("remixerOnly", !remixerOnly)}>
          <TrendingUp className="h-3 w-3" />
          {it(locale, "Remixer", "Remixer")}
        </FilterChip>

        {allGenres.map((g) => (
          <FilterChip
            key={g}
            active={genreFilter === g}
            onClick={() => update("genreFilter", genreFilter === g ? null : g)}
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
            onClick={() => update("sortOpen", !sortOpen)}
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
                onClick={() => update("sortOpen", false)}
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
                      setListState((prev) => ({ ...prev, sortMode: mode, sortOpen: false }));
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

      {/* 🔒 RP-037 — Container scrollabile. listScrollRef salva la posizione
          scroll prima di aprire il dettaglio e la ripristina al ritorno. */}
      <div ref={listScrollRef}>
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
                  onClick={() => update("visibleCount", visibleCount + PAGE_SIZE)}
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
// HELPERS — Convert custom artist DB row to Artist interface
// ============================================================================

function customArtistToArtist(row: ArtistCustomRow): Artist {
  return {
    id: row.id || `custom_${Date.now()}`,
    beatportId: row.beatport_artist_id || null,
    name: row.artist_name,
    slug: "",
    imageUrl: row.image_url || "",
    genres: [],
    tracksByGenre: {},
    labelsPublishedOn: [],
    totalPoints: 0,
    bestPosition: 0,
    isRemixerOnly: false,
    trending: false,
    // RP-034 PATCH — propagate every saved link/email so the detail page
    // can open them directly instead of falling back to Smart Search.
    beatportUrl: row.beatport_url || null,
    instagramUrl: row.instagram_url || null,
    spotifyUrl: row.spotify_url || null,
    soundcloudUrl: row.soundcloud_url || null,
    websiteUrl: row.website_url || null,
    email: row.email || null,
    // RP-035 — flag per distinguere gli artisti custom (mostra "Edit Artist").
    isCustom: true,
    // RP-036 — customId = id del record in artist_custom_data.
    // Per artisti custom standalone coincide con `id`.
    customId: row.id,
  };
}

/**
 * 🔒 RP-036 — Merge di un artista Beatport con il suo record CRM (già convertito in Artist).
 *
 * Ritorna un nuovo Artist che preserva tutti i dati musicali Beatport
 * (tracks, genres, labels, points, trending, ecc.) ma sovrascrive i
 * campi CRM (instagram_url, spotify_url, soundcloud_url, website_url,
 * email, beatport_url) con i valori salvati nel CRM. Il CRM ha priorità:
 * se un campo CRM è NULL, viene comunque sovrascritto (a null) SOLO se
 * l'artista Beatport non aveva un valore equivalente. In pratica, gli
 * artisti Beatport non hanno questi campi valorizzati, quindi il merge
 * è semplice: i campi CRM vengono aggiunti.
 *
 * Il risultato ha:
 *   - id = id Beatport (es. "bp_6824") → il detail page continua a funzionare
 *   - customId = id del CRM record → PATCH ha il target giusto
 *   - isCustom = true → il pulsante Edit CRM apre il dialog in EDIT mode
 *   - Tutti i campi musicali Beatport intatti
 *   - Tutti i campi CRM valorizzati dal record
 *
 * Nota: il parametro `crmArtist` è un Artist già convertito da ArtistCustomRow
 * via customArtistToArtist (non l'ArtistCustomRow grezzo).
 */
function mergeCrmIntoArtist(
  beatportArtist: Artist,
  crmArtist: Artist,
): Artist {
  return {
    ...beatportArtist,
    // CRM fields — sovrascrivono eventuali valori precedenti
    beatportUrl: crmArtist.beatportUrl || beatportArtist.beatportUrl || null,
    instagramUrl: crmArtist.instagramUrl || null,
    spotifyUrl: crmArtist.spotifyUrl || null,
    soundcloudUrl: crmArtist.soundcloudUrl || null,
    websiteUrl: crmArtist.websiteUrl || null,
    email: crmArtist.email || null,
    // RP-036 flags
    isCustom: true,
    customId: crmArtist.customId || crmArtist.id,
  };
}

// ============================================================================
// ADD / EDIT / CREATE-FROM-BEATPORT DIALOG (RP-034 + RP-035 + RP-036, same component)
// ============================================================================
//
// RP-035 — Il dialog esistente viene riutilizzato in modalità EDIT.
// RP-036 — Terza modalità: CREATE-from-Beatport.
//
// Tre modalità selezionate in base alle props:
//
//   1. editArtist != null    → EDIT MODE
//      - Tutti i campi precaricati dal CRM record.
//      - Titolo: "Modifica CRM" / "Edit CRM".
//      - Pulsante: "Aggiorna CRM" / "Update CRM".
//      - Salvataggio: PATCH /api/artist-custom?id=<editArtist.customId>.
//      - Callback: onUpdated(artist).
//
//   2. createFromArtist != null → CREATE-FROM-BEATPORT MODE (RP-036)
//      - name e beatportUrl precaricati dall'artista Beatport.
//      - beatport_artist_id estratto dall'URL.
//      - image_url preso dall'artista Beatport.
//      - Campi CRM (instagram, spotify, soundcloud, website, email, notes)
//        lasciati vuoti (l'utente li compilerà).
//      - Titolo: "Crea CRM" / "Create CRM".
//      - Pulsante: "Crea CRM" / "Create CRM".
//      - Salvataggio: POST /api/artist-custom (crea nuovo record CRM
//        collegato al beatport_artist_id).
//      - Callback: onCrmCreated(artist).
//
//   3. editArtist == null && createFromArtist == null → CREATE MODE (originale)
//      - Form vuoto.
//      - Titolo: "Aggiungi artista" / "Add artist".
//      - Pulsante: "Aggiungi" / "Add".
//      - Salvataggio: POST /api/artist-custom.
//      - Callback: onCreated(artist).

type DialogMode = "create" | "edit" | "create-from-beatport";

function AddArtistDialog({
  open,
  onClose,
  onCreated,
  onUpdated,
  onCrmCreated,
  editArtist,
  createFromArtist,
  locale,
}: {
  open: boolean;
  onClose: () => void;
  onCreated: (artist: Artist) => void;
  onUpdated?: (artist: Artist) => void;
  onCrmCreated?: (artist: Artist) => void;
  editArtist?: Artist | null;
  createFromArtist?: Artist | null;
  locale: Locale;
}) {
  const mode: DialogMode = editArtist
    ? "edit"
    : createFromArtist
      ? "create-from-beatport"
      : "create";

  const [name, setName] = useState("");
  const [beatportUrl, setBeatportUrl] = useState("");
  const [instagram, setInstagram] = useState("");
  const [spotify, setSpotify] = useState("");
  const [soundcloud, setSoundcloud] = useState("");
  const [website, setWebsite] = useState("");
  const [email, setEmail] = useState("");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);

  // Popola i campi quando il dialog si apre. Rieseguito solo quando cambia
  // la "chiave" della modalità (id artista in edit, o id Beatport in create-from,
  // o nessuno per create pura).
  useEffect(() => {
    if (!open) return;

    if (mode === "edit" && editArtist) {
      // EDIT MODE — precompila TUTTI i campi dal CRM.
      setName(editArtist.name || "");
      setBeatportUrl(editArtist.beatportUrl || "");
      setInstagram(editArtist.instagramUrl || "");
      setSpotify(editArtist.spotifyUrl || "");
      setSoundcloud(editArtist.soundcloudUrl || "");
      setWebsite(editArtist.websiteUrl || "");
      setEmail(editArtist.email || "");
      setNotes("");
    } else if (mode === "create-from-beatport" && createFromArtist) {
      // CREATE-FROM-BEATPORT — precompila solo i dati Beatport.
      // I campi CRM restano vuoti (li compilerà l'utente).
      setName(createFromArtist.name || "");
      setBeatportUrl(createFromArtist.beatportUrl || "");
      setInstagram("");
      setSpotify("");
      setSoundcloud("");
      setWebsite("");
      setEmail("");
      setNotes("");
    } else {
      // CREATE MODE — form vuoto
      setName("");
      setBeatportUrl("");
      setInstagram("");
      setSpotify("");
      setSoundcloud("");
      setWebsite("");
      setEmail("");
      setNotes("");
    }
  }, [open, mode, editArtist, createFromArtist]);

  const handleSave = async () => {
    if (!name.trim()) return;
    setSaving(true);

    // Try to extract Beatport artist ID from URL
    let beatportArtistId: number | null = null;
    if (beatportUrl.trim()) {
      const match = beatportUrl.match(/\/artist\/[^/]+\/(\d+)/);
      if (match) {
        beatportArtistId = parseInt(match[1], 10);
      }
    }

    // RP-036 — in CREATE-from-Beatport, usa il beatportId dell'artista Beatport
    // anche se la URL non lo contiene (non dovrebbe mai capitare, ma fallback sicuro).
    if (!beatportArtistId && mode === "create-from-beatport" && createFromArtist?.beatportId) {
      beatportArtistId = createFromArtist.beatportId;
    }

    const payload = {
      artist_name: name.trim(),
      beatport_url: beatportUrl.trim() || null,
      beatport_artist_id: beatportArtistId,
      instagram_url: instagram.trim() || null,
      spotify_url: spotify.trim() || null,
      soundcloud_url: soundcloud.trim() || null,
      website_url: website.trim() || null,
      email: email.trim() || null,
      notes: notes.trim() || null,
    };

    if (mode === "edit" && editArtist && editArtist.customId && onUpdated) {
      // EDIT — UPDATE del CRM record esistente.
      const updated = await apiUpdateCustomArtist(editArtist.customId, payload);
      setSaving(false);
      if (updated) {
        onUpdated(customArtistToArtist(updated));
        onClose();
      }
    } else if (mode === "create-from-beatport" && createFromArtist && onCrmCreated) {
      // CREATE-FROM-BEATPORT — POST crea nuovo CRM record collegato al Beatport artist.
      // image_url viene preso dall'artista Beatport (il CRM lo memorizza).
      const created = await apiCreateCustomArtist({
        ...payload,
        image_url: createFromArtist.imageUrl || null,
      });
      setSaving(false);
      if (created) {
        onCrmCreated(customArtistToArtist(created));
        onClose();
      }
    } else {
      // CREATE — flow originale (invariato).
      const created = await apiCreateCustomArtist({
        ...payload,
        image_url: null,
      });
      setSaving(false);
      if (created) {
        onCreated(customArtistToArtist(created));
        // Reset form
        setName(""); setBeatportUrl(""); setInstagram(""); setSpotify("");
        setSoundcloud(""); setWebsite(""); setEmail(""); setNotes("");
        onClose();
      }
    }
  };

  // RP-036 — titoli, icone e testi pulsante per le 3 modalità
  const titleIcon = mode === "create" ? <UserPlus className="h-4 w-4 text-primary" /> : <Pencil className="h-4 w-4 text-primary" />;
  const titleText = mode === "edit"
    ? locale === "it" ? "Modifica CRM" : "Edit CRM"
    : mode === "create-from-beatport"
      ? locale === "it" ? "Crea CRM" : "Create CRM"
      : locale === "it" ? "Aggiungi artista" : "Add artist";

  const buttonText = mode === "edit"
    ? locale === "it" ? "Aggiorna CRM" : "Update CRM"
    : mode === "create-from-beatport"
      ? locale === "it" ? "Crea CRM" : "Create CRM"
      : locale === "it" ? "Aggiungi" : "Add";

  const buttonIcon = saving
    ? <Loader2 className="h-4 w-4 animate-spin" />
    : mode === "create" ? <Plus className="h-4 w-4" /> : <Pencil className="h-4 w-4" />;

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {titleIcon}
            {titleText}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-3 max-h-[60vh] overflow-y-auto">
          <div className="space-y-1.5">
            <UILabel className="text-xs font-mono uppercase text-muted-foreground">
              {locale === "it" ? "Nome artista" : "Artist name"} *
            </UILabel>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="DJ Name" autoFocus className="bg-secondary/50" />
          </div>
          <div className="space-y-1.5">
            <UILabel className="text-xs font-mono uppercase text-muted-foreground">Beatport URL</UILabel>
            <Input value={beatportUrl} onChange={(e) => setBeatportUrl(e.target.value)} placeholder="https://www.beatport.com/artist/..." className="bg-secondary/50" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <UILabel className="text-xs font-mono uppercase text-muted-foreground">Instagram</UILabel>
              <Input value={instagram} onChange={(e) => setInstagram(e.target.value)} placeholder="@username" className="bg-secondary/50" />
            </div>
            <div className="space-y-1.5">
              <UILabel className="text-xs font-mono uppercase text-muted-foreground">Spotify</UILabel>
              <Input value={spotify} onChange={(e) => setSpotify(e.target.value)} placeholder="URL" className="bg-secondary/50" />
            </div>
            <div className="space-y-1.5">
              <UILabel className="text-xs font-mono uppercase text-muted-foreground">SoundCloud</UILabel>
              <Input value={soundcloud} onChange={(e) => setSoundcloud(e.target.value)} placeholder="URL" className="bg-secondary/50" />
            </div>
            <div className="space-y-1.5">
              <UILabel className="text-xs font-mono uppercase text-muted-foreground">Website</UILabel>
              <Input value={website} onChange={(e) => setWebsite(e.target.value)} placeholder="https://..." className="bg-secondary/50" />
            </div>
          </div>
          <div className="space-y-1.5">
            <UILabel className="text-xs font-mono uppercase text-muted-foreground">Email</UILabel>
            <Input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="contact@..." className="bg-secondary/50" />
          </div>
          <div className="space-y-1.5">
            <UILabel className="text-xs font-mono uppercase text-muted-foreground">{locale === "it" ? "Note" : "Notes"}</UILabel>
            <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} className="bg-secondary/50 resize-none" />
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>{locale === "it" ? "Annulla" : "Cancel"}</Button>
          <Button onClick={handleSave} disabled={!name.trim() || saving} className="gap-2">
            {buttonIcon}
            {buttonText}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
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
    navigationReturnTo?: { kind: "label"; labelId: string; labelName?: string } | null;
    setNavigationReturnTo?: (target: { kind: "label"; labelId: string; labelName?: string } | null) => void;
    releases?: any[];
    selectedReleaseId?: string | null;
  };

  const { locale, labels, setActiveTab } = store;
  const artists = store.artists;
  const selectedArtistId = store.selectedArtistId ?? null;
  const setSelectedArtistId = store.setSelectedArtistId;
  const setSelectedLabelId = store.setSelectedLabelId;
  const navigationReturnTo = store.navigationReturnTo ?? null;
  const setNavigationReturnTo = store.setNavigationReturnTo;
  const releases = store.releases || [];
  const selectedReleaseId = store.selectedReleaseId ?? null;

  // 🔒 WP-005 — Project Context. `project` è null quando Artist Explorer è
  // montato fuori da <ProjectProvider> (es. tab Artists della home). In
  // quel caso tutte le letture `project?.*` cadono su undefined e il
  // comportamento è IDENTICO a prima.
  //
  // `projectArtistHint` è un contesto iniziale OPZIONALE: espone
  // l'artista del Project corrente (se presente). NON viene applicato a
  // `listState.search`, NON triggera filtri, NON effettua ricerche
  // automatiche. È disponibile come dato per futuri task (es. suggerire
  // l'artista del Project nell'Add Dialog). In questo task viene solo
  // incluso nel log di debug esistente (nessun effetto visibile).
  const project = useProject();
  const projectArtistHint = useMemo(
    () => (project && project.artist ? project.artist.trim() : ""),
    [project],
  );
  const projectGoalHint = useMemo(
    () => (project && project.goal ? project.goal : ""),
    [project],
  );

  // 🔒 DEBUG RP-027: log render + state changes
  console.log(`[DEBUG ArtistExplorer] ${new Date().toISOString()} RENDER`, {
    selectedArtistId,
    selectedReleaseId,
    activeTab: store.activeTab,
    artistsCount: artists?.length || 0,
    releasesCount: releases.length,
    // 🔒 WP-005 — Project hints (opzionali, solo per debug). Non modificano
    // filtri né flusso utente. Sono null/"" fuori dal ProjectProvider.
    projectArtistHint: projectArtistHint || null,
    projectGoalHint: projectGoalHint || null,
  });

  // Defensive: guard against undefined arrays.
  const safeArtists = useMemo(
    () => (Array.isArray(artists) ? artists : []),
    [artists]
  );

  // RP-034: custom artists from Supabase
  const [customArtists, setCustomArtists] = useState<Artist[]>([]);
  const [showAddDialog, setShowAddDialog] = useState(false);

  // RP-035 — stato per la modalità EDIT del dialog.
  // editingArtist !== null → il dialog esiste in versione EDIT (precompilata).
  const [editingArtist, setEditingArtist] = useState<Artist | null>(null);

  // RP-036 — stato per la modalità CREATE-from-Beatport del dialog.
  // createFromArtist !== null → il dialog precompila solo i dati Beatport
  // (name, beatportUrl) e lascia vuoti i campi CRM.
  const [createFromArtist, setCreateFromArtist] = useState<Artist | null>(null);

  // RP-036 — flag di caricamento mentre handleEditCrm cerca il CRM via
  // beatport_id. Mostra uno spinner nel pulsante Edit CRM.
  const [editCrmLoading, setEditCrmLoading] = useState(false);

  // 🔒 RP-037 — Stato della lista (search, filters, sort, pagination)
  // HOISTATO nel parent ArtistExplorer. Survive alla navigazione verso il
  // dettaglio artista e ritorno. ArtistList è ora un componente controllato.
  const [listState, setListState] = useState<ArtistListState>(INITIAL_LIST_STATE);

  // 🔒 RP-037 — Ref al container scrollabile della lista. Salviamo la
  // posizione scroll qui dentro prima di aprire il dettaglio, e la
  // ripristiniamo quando l'utente preme Back.
  // NB: usiamo window.scrollY perché la lista scorre sulla window (non in un
  // container interno con overflow). Se in futuro la lista venisse messa in
  // un container scrollabile, basterà cambiare listScrollRef.current.scrollTop.
  const listScrollRef = useRef<HTMLDivElement | null>(null);
  const savedScrollY = useRef<number>(0);

  // Load custom artists on mount
  useEffect(() => {
    let mounted = true;
    apiFetchCustomArtists().then((rows) => {
      if (!mounted || !rows) return;
      const converted = rows.map(customArtistToArtist);
      setCustomArtists(converted);
    });
    return () => { mounted = false; };
  }, []);

  // RP-036 — Handler universale per Edit CRM.
  // Logica:
  //   1. Se artist.customId è presente → CRM record esiste già → EDIT mode.
  //   2. Se artist.customId è assente MA artist.beatportId è presente →
  //      fetch del CRM via beatport_id:
  //        a. Se trovato → EDIT mode (merge CRM + Beatport artist).
  //        b. Se non trovato → CREATE-from-Beatport mode (precompila
  //           name + beatportUrl dall'artista Beatport, CRM vuoti).
  //   3. Se artist non ha né customId né beatportId → fallback EDIT mode
  //      (artista custom senza id valido, caso edge).
  const handleEditCrm = useCallback(async (artist: Artist) => {
    // Caso 1: CRM già collegato (artista custom standalone o Beatport merged)
    if (artist.customId) {
      setEditingArtist(artist);
      return;
    }

    // Caso 2: artista Beatport — cerca CRM via beatport_id
    if (artist.beatportId) {
      setEditCrmLoading(true);
      try {
        const crmRow = await apiFetchCustomArtistByBeatportId(artist.beatportId);
        if (crmRow) {
          // CRM trovato → EDIT mode con CRM mergeato nell'artista Beatport.
          // Convertiamo prima il row in Artist (via customArtistToArtist) e poi
          // facciamo il merge con l'artista Beatport per preservare i dati musicali.
          const crmArtist = customArtistToArtist(crmRow);
          const merged = mergeCrmIntoArtist(artist, crmArtist);
          setEditingArtist(merged);
        } else {
          // CRM non trovato → CREATE-from-Beatport mode
          setCreateFromArtist(artist);
        }
      } catch (err) {
        console.error("[handleEditCrm] lookup failed:", err);
        // In caso di errore di rete, fallback a CREATE-from-Beatport
        // (l'utente può comunque compilare il form)
        setCreateFromArtist(artist);
      } finally {
        setEditCrmLoading(false);
      }
      return;
    }

    // Caso 3: fallback (artista custom senza id valido)
    setEditingArtist(artist);
  }, []);

  // RP-035 — Handler per l'aggiornamento post-PATCH.
  // Sostituisce l'artista aggiornato dentro customArtists (match per customId),
  // così allArtists e selectedArtist si ricalcolano automaticamente via
  // useMemo → la pagina dettaglio si aggiorna senza refresh manuale e
  // senza perdere lo stato (selectedArtistId resta invariato).
  const handleArtistUpdated = useCallback((updated: Artist) => {
    setCustomArtists((prev) =>
      prev.map((a) => (a.customId === updated.customId ? updated : a)),
    );
    setEditingArtist(null);
  }, []);

  // RP-036 — Handler per la CREAZIONE di un CRM record da un artista Beatport.
  // Aggiunge il nuovo CRM artist in customArtists. allArtists verrà ricalcolato
  // e il Beatport artist (match per beatportId) verrà automaticamente merged
  // con il nuovo CRM → il detail page mostra istantaneamente i nuovi campi.
  const handleCrmCreated = useCallback((newCrmArtist: Artist) => {
    setCustomArtists((prev) => {
      // Evita duplicati: se esiste già un CRM con lo stesso customId, sostituiscilo.
      const filtered = prev.filter((a) => a.customId !== newCrmArtist.customId);
      return [newCrmArtist, ...filtered];
    });
    setCreateFromArtist(null);
  }, []);

  // RP-036 — Merge Beatport + custom artists into a single list.
  // Per ogni artista Beatport, se esiste un CRM record con lo stesso beatportId,
  // lo mergia dentro (CRM fields hanno priorità). I CRM record senza match
  // Beatport (es. artista custom senza URL Beatport) sono mostrati standalone.
  const allArtists = useMemo(() => {
    // Index CRM artists by beatport_id for fast lookup
    const crmByBeatportId = new Map<number, Artist>();
    for (const c of customArtists) {
      if (c.beatportId && !crmByBeatportId.has(c.beatportId)) {
        crmByBeatportId.set(c.beatportId, c);
      }
    }

    // Merge CRM into Beatport artists (CRM fields take priority when set)
    const mergedBeatport = safeArtists.map((a) => {
      const crm = a.beatportId ? crmByBeatportId.get(a.beatportId) : undefined;
      return crm ? mergeCrmIntoArtist(a, crm) : a;
    });

    // Standalone custom artists: quelli senza beatportId OPPORA con un beatportId
    // che non corrisponde a nessun artista Beatport nel dataset locale.
    // (evita di mostrarli due volte: una merged nel Beatport artist + una standalone)
    const beatportIds = new Set(
      safeArtists
        .map((a) => a.beatportId)
        .filter((id): id is number => typeof id === "number"),
    );
    const standaloneCustom = customArtists.filter((c) => {
      if (!c.beatportId) return true; // custom senza URL Beatport
      return !beatportIds.has(c.beatportId); // custom con Beatport URL ma artista non nel dataset
    });

    return [...mergedBeatport, ...standaloneCustom];
  }, [safeArtists, customArtists]);

  // 🔒 DEBUG RP-030: log when safeArtists reference changes
  const prevArtistsRef = React.useRef<number>(-1);
  if (prevArtistsRef.current !== safeArtists.length) {
    console.log(`[DEBUG ArtistExplorer] ${new Date().toISOString()} safeArtists CHANGED`, {
      prevLength: prevArtistsRef.current,
      newLength: safeArtists.length,
    });
    prevArtistsRef.current = safeArtists.length;
  }

  const selectedArtist = useMemo(
    () => {
      const found = selectedArtistId
        ? allArtists.find((a) => a.id === selectedArtistId) || null
        : null;
      console.log(`[DEBUG ArtistExplorer] ${new Date().toISOString()} selectedArtist useMemo`, {
        selectedArtistId,
        found: !!found,
        foundId: found?.id,
        foundName: found?.name,
        artistsCount: safeArtists.length,
      });
      return found;
    },
    // RP-035A BUG 1+2 FIX — la dipendenza deve essere `allArtists` (che include
    // customArtists), NON `safeArtists` (solo Beatport). Prima di questo fix,
    // quando customArtists veniva aggiornato dopo un EDIT (es. email salvata),
    // selectedArtist NON veniva ricalcolato perché safeArtists non era cambiato
    // → selectedArtist restava stale (oggetto vecchio senza email)
    // → Edit Artist riapriva con email vuota (BUG 1)
    // → SmartSearch riceveva email=null → Contact usava Google Search (BUG 2).
    [allArtists, selectedArtistId]
  );

  const handleSelect = useCallback(
    (id: string) => {
      // 🔒 RP-037 — Salva la posizione scroll corrente PRIMA di aprire il
      // dettaglio. Verrà ripristinata quando l'utente preme Back.
      if (typeof window !== "undefined") {
        savedScrollY.current = window.scrollY;
      }
      setSelectedArtistId?.(id);
      // Scroll to top so the detail hero is visible.
      if (typeof window !== "undefined") {
        window.scrollTo({ top: 0, behavior: "smooth" });
      }
    },
    [setSelectedArtistId]
  );

  const handleBack = useCallback(() => {
    console.log(`[DEBUG ArtistExplorer] ${new Date().toISOString()} handleBack CALLED`, {
      selectedArtistId, selectedReleaseId, willSwitchToDemos: !!selectedReleaseId,
    });
    setSelectedArtistId?.(null);
    if (selectedReleaseId) {
      setActiveTab("demos");
      return;
    }
    // 🔒 RP-037 — Ripristina la posizione scroll salvata in handleSelect.
    // Usiamo requestAnimationFrame per essere sicuri che la lista sia stata
    // renderizzata (selectedArtistId è già null, ma React non ha ancora
    // committato il re-render). Senza rAF, window.scrollTo avrebbe luogo
    // mentre il DOM è ancora quello del dettaglio → scroll perso.
    if (typeof window !== "undefined") {
      const targetY = savedScrollY.current;
      window.requestAnimationFrame(() => {
        window.scrollTo({ top: targetY, behavior: "auto" });
      });
    }
  }, [setSelectedArtistId, selectedReleaseId, setActiveTab]);

  // Back to the label the user was viewing before navigating to this artist.
  // Triggered by the dedicated "Back to label" button — only shown when
  // navigationReturnTo is set. Switches to Labels tab and sets selectedLabelId
  // so LabelFinder's useEffect re-opens the detail dialog automatically.
  const handleBackToLabel = useCallback(() => {
    if (!navigationReturnTo || navigationReturnTo.kind !== "label") return;
    const target = navigationReturnTo;
    // Clear return-to FIRST so the button disappears and we don't loop.
    setNavigationReturnTo?.(null);
    // Clear the artist selection
    setSelectedArtistId?.(null);
    // Set the label id so LabelFinder re-opens the dialog. Pass the id
    // directly; LabelFinder falls back to name matching if id doesn't match.
    setSelectedLabelId?.(target.labelId);
    setActiveTab("labels");
    // Scroll to top in case the dialog needs to be in view.
    if (typeof window !== "undefined") {
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
  }, [navigationReturnTo, setNavigationReturnTo, setSelectedArtistId, setSelectedLabelId, setActiveTab]);

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
      const target = (labelName || "").toLowerCase().trim();
      const match = labels.find(
        (l) => l && l.name && l.name.toLowerCase().trim() === target
      );
      // If we have an id, pass that. Otherwise pass the name itself —
      // LabelFinder's useEffect falls back to name matching.
      setSelectedLabelId(match?.id || labelName);
      setActiveTab("labels");
    },
    [labels, setActiveTab, setSelectedLabelId]
  );

  // RP-024: calcola score per l'artista selezionato rispetto alla release selezionata
  // Memoizzato per evitare re-render di AiOutreachAdvisor ad ogni render del parent
  const selectedRelease = useMemo(() => {
    if (!selectedReleaseId) return null;
    const found = releases.find((r: any) => r.id === selectedReleaseId) || null;
    console.log(`[DEBUG ArtistExplorer] ${new Date().toISOString()} useMemo selectedRelease`, {
      selectedReleaseId, found: !!found, releaseTitle: found?.title,
    });
    return found;
  }, [selectedReleaseId, releases]);

  const scoredArtist = useMemo<ScoredArtist | null>(() => {
    if (!selectedRelease || !selectedArtist || safeArtists.length === 0) {
      console.log(`[DEBUG ArtistExplorer] ${new Date().toISOString()} useMemo scoredArtist SKIP`, {
        hasRelease: !!selectedRelease, hasArtist: !!selectedArtist, artistsCount: safeArtists.length,
      });
      return null;
    }
    console.log(`[DEBUG ArtistExplorer] ${new Date().toISOString()} useMemo scoredArtist CALCULATING calculateTargets()`, {
      artistId: selectedArtist.id, artistName: selectedArtist.name,
    });
    const result = calculateTargets(selectedRelease, safeArtists);
    const found = result.targets.find((t) => t.artist.id === selectedArtist.id) || null;
    console.log(`[DEBUG ArtistExplorer] ${new Date().toISOString()} useMemo scoredArtist RESULT`, {
      found: !!found, score: found?.score, targetsCount: result.targets.length,
    });
    return found;
  }, [selectedRelease, selectedArtist, safeArtists]);

  // ----- Empty state (no artists loaded yet) -----
  if (allArtists.length === 0) {
    return (
      <>
        <div className="rounded-lg border border-border/30 bg-muted/20 py-16 text-center">
          <Music2 className="mx-auto mb-3 h-10 w-10 opacity-30" />
          <p className="text-sm text-muted-foreground mb-4">
            {locale === "it"
              ? "Nessun artista caricato."
              : "No artists loaded yet."}
          </p>
          <Button onClick={() => setShowAddDialog(true)} variant="outline" className="gap-2">
            <UserPlus className="h-4 w-4" />
            {locale === "it" ? "Aggiungi artista" : "Add artist"}
          </Button>
        </div>
        <AddArtistDialog
          open={showAddDialog}
          onClose={() => setShowAddDialog(false)}
          onCreated={(artist) => setCustomArtists((prev) => [artist, ...prev])}
          locale={locale}
        />
        {/* RP-035 — Edit dialog (mounted in ogni branch; apre solo quando editingArtist !== null) */}
        <AddArtistDialog
          open={!!editingArtist}
          onClose={() => setEditingArtist(null)}
          onCreated={() => { /* no-op in edit mode */ }}
          onUpdated={handleArtistUpdated}
          editArtist={editingArtist}
          locale={locale}
        />
        {/* RP-036 — Create-from-Beatport dialog (apre solo quando createFromArtist !== null) */}
        <AddArtistDialog
          open={!!createFromArtist}
          onClose={() => setCreateFromArtist(null)}
          onCreated={() => { /* no-op in create-from-beatport mode */ }}
          onCrmCreated={handleCrmCreated}
          createFromArtist={createFromArtist}
          locale={locale}
        />
      </>
    );
  }

  // ----- Detail view -----
  if (selectedArtistId && selectedArtist) {
    return (
      <>
        <ArtistDetail
          artist={selectedArtist}
          locale={locale}
          labels={labels}
          onBack={handleBack}
          onLabelClick={handleLabelClick}
          onBackToLabel={navigationReturnTo ? handleBackToLabel : undefined}
          returnToLabelName={navigationReturnTo?.labelName}
          selectedRelease={selectedRelease}
          scoredArtist={scoredArtist}
          // RP-036 — onEditArtist passato per TUTTI gli artisti (CRM universale).
          // La logica di mode-decision (EDIT vs CREATE-from-Beatport) è in handleEditCrm.
          onEditArtist={handleEditCrm}
          editCrmLoading={editCrmLoading}
        />
        {/* RP-035 — Edit dialog (same component, edit mode) */}
        <AddArtistDialog
          open={!!editingArtist}
          onClose={() => setEditingArtist(null)}
          onCreated={() => { /* no-op in edit mode */ }}
          onUpdated={handleArtistUpdated}
          editArtist={editingArtist}
          locale={locale}
        />
        {/* RP-036 — Create-from-Beatport dialog (apre solo quando createFromArtist !== null) */}
        <AddArtistDialog
          open={!!createFromArtist}
          onClose={() => setCreateFromArtist(null)}
          onCreated={() => { /* no-op in create-from-beatport mode */ }}
          onCrmCreated={handleCrmCreated}
          createFromArtist={createFromArtist}
          locale={locale}
        />
      </>
    );
  }

  // If an id is set but the artist can't be found, reset and show list.
  if (selectedArtistId && !selectedArtist) {
    if (typeof window !== "undefined") {
      setTimeout(() => setSelectedArtistId?.(null), 0);
    }
  }

  // ----- List view (default) -----
  return (
    <>
      <div className="flex justify-end mb-2">
        <Button onClick={() => setShowAddDialog(true)} variant="outline" size="sm" className="gap-1.5">
          <UserPlus className="h-3.5 w-3.5" />
          {locale === "it" ? "Aggiungi artista" : "Add artist"}
        </Button>
      </div>
      <ArtistList
        artists={allArtists}
        locale={locale}
        onSelect={handleSelect}
        // 🔒 RP-037 — stato + ref passati dal parent per preservare filtri,
        // sort, paginazione e scroll tra navigazioni detail → list.
        listState={listState}
        setListState={setListState}
        listScrollRef={listScrollRef}
      />
      <AddArtistDialog
        open={showAddDialog}
        onClose={() => setShowAddDialog(false)}
        onCreated={(artist) => setCustomArtists((prev) => [artist, ...prev])}
        locale={locale}
      />
      {/* RP-035 — Edit dialog (same component, edit mode) */}
      <AddArtistDialog
        open={!!editingArtist}
        onClose={() => setEditingArtist(null)}
        onCreated={() => { /* no-op in edit mode */ }}
        onUpdated={handleArtistUpdated}
        editArtist={editingArtist}
        locale={locale}
      />
      {/* RP-036 — Create-from-Beatport dialog (apre solo quando createFromArtist !== null) */}
      <AddArtistDialog
        open={!!createFromArtist}
        onClose={() => setCreateFromArtist(null)}
        onCreated={() => { /* no-op in create-from-beatport mode */ }}
        onCrmCreated={handleCrmCreated}
        createFromArtist={createFromArtist}
        locale={locale}
      />
    </>
  );
}
