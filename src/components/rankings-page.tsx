"use client";

import { useAppStore, getLabelTier, readSnapshotsSidecar, restoreSnapshotsFromSidecar, loadFromCloud } from "@/lib/store";
import type { Label, RankingSnapshot, RankingTimePeriod } from "@/lib/store";
import { t, type Locale } from "@/lib/i18n";
import { getLabelDiscoveryUrls } from "@/lib/label-links";
import {
  Trophy,
  TrendingUp,
  TrendingDown,
  Minus,
  ArrowUpRight,
  Flame,
  Eye,
  BarChart3,
  Crown,
  Medal,
  Star,
  Filter,
  ChevronDown,
  AlertTriangle,
  Clock,
  Calendar,
  Infinity,
  History,
  ExternalLink,
  Music2,
  RotateCcw,
  RefreshCw,
} from "lucide-react";
import React, { useState, useMemo, useCallback, useEffect } from "react";
import { Button } from "@/components/ui/button";

// ==================== TYPES ====================

type SortMode = "rank" | "movement" | "points";
type MovementFilter = "all" | "rising" | "falling" | "new" | "stable";

interface RankedLabel {
  label: Label;
  rank: number;
  prevRank: number | null; // null = not ranked before (new entry)
  points: number;
  movement: number | null; // positive = moved up, negative = moved down, null = new
  snapshotCount: number; // how many snapshots contributed to this period
}

// ==================== HELPERS ====================

/**
 * Find the "previous rank" for a label in a given genre by walking the
 * historical snapshots from most-recent to oldest, returning the FIRST
 * snapshot whose rank for that label/genre DIFFERS from currentRank.
 *
 * WHY: prevRankByGenre on the label can be clobbered by an identical
 * re-import (the merge logic snapshots the live rank into prev even when
 * nothing changed). When that happens, prevRankByGenre[genre] === currentRank
 * → movement = 0 → Spotlight risers disappear. Snapshots, on the other hand,
 * are immutable historical records and are never clobbered, so they are the
 * authoritative source of "what was the rank before it became what it is now".
 *
 * @param snapshots        all ranking snapshots (will be sorted DESC here)
 * @param labelName        label name to look up (snapshots key by name, not id)
 * @param genre            genre key
 * @param currentRank      the label's CURRENT rank in this genre
 * @returns                the previous rank (different from currentRank), or
 *                         undefined if no historical snapshot has a different
 *                         rank for this label/genre.
 */
function findPrevRankFromSnapshots(
  snapshots: RankingSnapshot[],
  labelName: string,
  genre: string,
  currentRank: number,
): number | undefined {
  // Sort by timestamp DESC — we want the most recent DIFFERENT rank.
  const sorted = [...snapshots].sort(
    (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime(),
  );
  for (const snap of sorted) {
    const entry = snap.genres?.[genre]?.[labelName];
    if (entry && typeof entry.rank === "number" && entry.rank !== currentRank) {
      return entry.rank;
    }
  }
  return undefined;
}

/**
 * Check if a label has EVER appeared (at any rank) in any historical snapshot
 * for the given genre. Used to distinguish:
 *
 *   - TRUE new entry  → label never seen before in any snapshot → show "NUOVA"
 *   - Stable incumbent → label seen before but always at the same rank      → show "—"
 *                        (e.g. Drumcode has been #1 in Techno Peak Time forever)
 *
 * Without this check, dominant labels that never change rank would be
 * permanently flagged "NUOVA" because findPrevRankFromSnapshots returns
 * undefined (it only finds DIFFERENT ranks, not identical ones).
 */
function labelEverAppearedInSnapshots(
  snapshots: RankingSnapshot[],
  labelName: string,
  genre: string,
): boolean {
  for (const snap of snapshots) {
    const entry = snap.genres?.[genre]?.[labelName];
    if (entry && typeof entry.rank === "number") {
      return true;
    }
  }
  return false;
}

/**
 * Compact row of clickable discovery icons for a label.
 * Renders tiny icon-buttons that open Beatport / Beatstats / SoundCloud /
 * Website in a new tab. Hidden entirely if the label has no name (defensive).
 *
 * @param size icon size in px (default 12 for inline use in dense rows)
 */
function LabelDiscoveryIcons({
  label,
  size = 12,
  showLabels = false,
}: {
  label: Label;
  size?: number;
  showLabels?: boolean;
}) {
  if (!label?.name) return null;
  const urls = getLabelDiscoveryUrls(label);

  const btnClass =
    "inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium transition-colors hover:bg-accent/40 shrink-0";

  return (
    <div className="inline-flex items-center gap-0.5 ml-1">
      {/* Beatport — direct (green) if user-saved, search (muted) otherwise */}
      <a
        href={urls.beatport}
        target="_blank"
        rel="noopener noreferrer"
        title={
          urls.beatportIsDirect
            ? `Apri ${label.name} su Beatport (link diretto)`
            : `Cerca ${label.name} su Beatport`
        }
        className={`${btnClass} ${
          urls.beatportIsDirect
            ? "text-emerald-400 hover:text-emerald-300"
            : "text-muted-foreground hover:text-emerald-400"
        }`}
        onClick={(e) => e.stopPropagation()}
      >
        <ExternalLink style={{ width: size, height: size }} />
        {showLabels && <span>Beatport</span>}
      </a>

      {/* Beatstats — always search (no direct-link field in schema yet) */}
      <a
        href={urls.beatstats}
        target="_blank"
        rel="noopener noreferrer"
        title={`Cerca ${label.name} su Beatstats`}
        className={`${btnClass} text-muted-foreground hover:text-amber-400`}
        onClick={(e) => e.stopPropagation()}
      >
        <BarChart3 style={{ width: size, height: size }} />
        {showLabels && <span>Beatstats</span>}
      </a>

      {/* SoundCloud — only if a direct link exists (skip search, too noisy) */}
      {label.soundcloudLink && (
        <a
          href={urls.soundcloud}
          target="_blank"
          rel="noopener noreferrer"
          title={`Apri ${label.name} su SoundCloud`}
          className={`${btnClass} text-muted-foreground hover:text-orange-400`}
          onClick={(e) => e.stopPropagation()}
        >
          <Music2 style={{ width: size, height: size }} />
          {showLabels && <span>SoundCloud</span>}
        </a>
      )}

      {/* Website — only if user provided one */}
      {label.website && (
        <a
          href={urls.website}
          target="_blank"
          rel="noopener noreferrer"
          title={`Apri sito ufficiale di ${label.name}`}
          className={`${btnClass} text-muted-foreground hover:text-primary`}
          onClick={(e) => e.stopPropagation()}
        >
          <ExternalLink style={{ width: size, height: size }} />
          {showLabels && <span>Sito</span>}
        </a>
      )}
    </div>
  );
}

/**
 * Clickable label name — opens the LABEL DETAIL PAGE (the dialog inside
 * LabelFinder) instead of going to Beatport. The Beatport / Beatstats
 * icons next to the name (LabelDiscoveryIcons) remain the only way to
 * jump to those external sites — clicking the NAME itself navigates
 * internally so the user can edit data, listen to top tracks, see the
 * label's top artists, etc.
 *
 * The navigation works by setting `selectedLabelId` in the global store
 * (matches by id OR by name as fallback) and switching to the "labels"
 * tab. LabelFinder has a useEffect that watches selectedLabelId and
 * auto-opens its detail dialog.
 */
function ClickableLabelName({
  label,
  className = "",
  onOpen,
}: {
  label: Label;
  className?: string;
  onOpen?: (label: Label) => void;
}) {
  if (!label?.name) return null;
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        onOpen?.(label);
      }}
      title={`Apri la pagina dedicata di ${label.name} (dati, top tracce, artisti)`}
      className={`hover:text-primary hover:underline cursor-pointer transition-colors text-left bg-transparent border-0 p-0 min-w-0 flex-1 truncate ${className}`}
    >
      {label.name}
    </button>
  );
}

function getMovementIcon(movement: number | null): React.ReactNode {
  if (movement === null) return <ArrowUpRight className="h-3.5 w-3.5 text-cyan-400" />;
  if (movement > 0) return <TrendingUp className="h-3.5 w-3.5 text-emerald-400" />;
  if (movement < 0) return <TrendingDown className="h-3.5 w-3.5 text-red-400" />;
  return <Minus className="h-3.5 w-3.5 text-muted-foreground" />;
}

function getMovementText(movement: number | null, locale: Locale): string {
  if (movement === null) return t(locale, "rankings.newEntry");
  if (movement > 0) return `+${movement}`;
  if (movement < 0) return `${movement}`;
  return "—";
}

function getMovementColor(movement: number | null): string {
  if (movement === null) return "text-cyan-400";
  if (movement > 5) return "text-emerald-400 font-bold";
  if (movement > 0) return "text-emerald-400";
  if (movement < -5) return "text-red-400 font-bold";
  if (movement < 0) return "text-red-400";
  return "text-muted-foreground";
}

function getTierBadge(tier: "top" | "mid" | "emerging" | null): { icon: React.ReactNode; color: string } {
  switch (tier) {
    case "top":
      return { icon: <Crown className="h-3 w-3" />, color: "bg-purple-500/20 text-purple-400 border-purple-500/30" };
    case "mid":
      return { icon: <Medal className="h-3 w-3" />, color: "bg-blue-500/20 text-blue-400 border-blue-500/30" };
    case "emerging":
      return { icon: <Star className="h-3 w-3" />, color: "bg-amber-500/20 text-amber-400 border-amber-500/30" };
    default:
      return { icon: null, color: "bg-secondary/50 text-muted-foreground border-border/30" };
  }
}

function getPeriodLabel(period: RankingTimePeriod, locale: Locale): string {
  return t(locale, `rankings.period.${period}`);
}

function getPeriodIcon(period: RankingTimePeriod): React.ComponentType<{ className?: string }> {
  switch (period) {
    case "current": return Flame;
    case "1m": return Clock;
    case "3m": return Calendar;
    case "1y": return History;
    case "all": return Infinity;
  }
}

/**
 * Get the time cutoff for a period (in milliseconds from now).
 */
function getPeriodCutoff(period: RankingTimePeriod): number {
  const now = Date.now();
  switch (period) {
    case "current": return now; // Only current data
    case "1m": return now - 30 * 24 * 60 * 60 * 1000;
    case "3m": return now - 90 * 24 * 60 * 60 * 1000;
    case "1y": return now - 365 * 24 * 60 * 60 * 1000;
    case "all": return 0; // All time
  }
}

// ==================== AGGREGATION LOGIC ====================

/**
 * Aggregate ranking snapshots for a given genre and time period.
 * Returns a map of labelName -> { totalPoints, bestRank, snapshotCount, averageRank }
 */
function aggregateSnapshots(
  snapshots: RankingSnapshot[],
  genre: string,
  period: RankingTimePeriod
): Map<string, { totalPoints: number; bestRank: number; snapshotCount: number; averageRank: number; rankSum: number }> {
  const cutoff = getPeriodCutoff(period);
  const result = new Map<string, { totalPoints: number; bestRank: number; snapshotCount: number; averageRank: number; rankSum: number }>();

  // Helper to get or create entry with defaults
  function getOrCreate(name: string): { totalPoints: number; bestRank: number; snapshotCount: number; averageRank: number; rankSum: number } {
    let entry = result.get(name);
    if (!entry) {
      entry = { totalPoints: 0, bestRank: 999, snapshotCount: 0, averageRank: 0, rankSum: 0 };
      result.set(name, entry);
    }
    return entry;
  }

  for (const snapshot of snapshots) {
    if (new Date(snapshot.timestamp).getTime() < cutoff) continue;
    if (period === "current") continue; // Current period doesn't use snapshots

    const genreData = snapshot.genres[genre];
    if (!genreData) continue;

    for (const [labelName, data] of Object.entries(genreData)) {
      const existing = getOrCreate(labelName);
      existing.totalPoints += data.points;
      existing.rankSum += data.rank;
      existing.snapshotCount++;
      if (data.rank < existing.bestRank) existing.bestRank = data.rank;
    }
  }

  // Calculate average rank
  for (const [, val] of result) {
    (val as any).averageRank = Math.round(val.rankSum / val.snapshotCount);
  }

  return result;
}

/**
 * Build ranked list for a genre, considering the time period.
 * - "current": uses live label data (rankByGenre)
 * - Other periods: aggregates snapshots and re-ranks by cumulative points
 */
function buildRankedList(
  labels: Label[],
  snapshots: RankingSnapshot[],
  genre: string,
  period: RankingTimePeriod
): RankedLabel[] {
  if (period === "current") {
    // Current view: use live label data
    const ranked: RankedLabel[] = [];
    for (const label of labels) {
      const rank = label.rankByGenre?.[genre];
      if (rank === undefined || rank === null) continue;

      // PRIORITY 1: look up "previous rank" from immutable historical snapshots.
      // This is robust against identical re-imports that would otherwise zero
      // out prevRankByGenre. We fall back to label.prevRankByGenre only if no
      // snapshot has a different rank (label was never ranked differently).
      let prevRank: number | null = findPrevRankFromSnapshots(snapshots, label.name, genre, rank) ?? null;
      if (prevRank === null) {
        // No snapshot with a different rank → fall back to label.prevRankByGenre
        // (which may still be set from a previous import).
        prevRank = label.prevRankByGenre?.[genre] ?? null;
        // If prevRankByGenre[genre] equals current rank, treat as "no previous"
        // (the label has never actually changed rank — show as stable, not as a
        // riser with movement=0 which is misleading).
        if (prevRank !== null && prevRank === rank) {
          prevRank = null;
        }
      }

      const points = label.pointsByGenre?.[genre] ?? 0;
      let movement: number | null = null;

      if (prevRank !== null && prevRank !== undefined) {
        movement = prevRank - rank;
      } else {
        // prevRank is null — but is the label REALLY new, or just stable?
        // Check if it has EVER appeared in any snapshot for this genre.
        // - NEVER appeared → true new entry → movement = null → "NUOVA"
        // - Appeared before (at any rank, even same) → stable → movement = 0 → "—"
        // This fixes the bug where dominant labels like Drumcode (#1 forever in
        // Techno Peak Time) were permanently flagged "NUOVA".
        const appearedBefore = labelEverAppearedInSnapshots(snapshots, label.name, genre);
        if (appearedBefore) {
          movement = 0; // stable incumbent, not a new entry
        } else if (Object.keys(label.prevRankByGenre || {}).length > 0) {
          // No snapshot history but label has prevRankByGenre populated from a
          // previous import — preserve old behavior (treat as new entry).
          movement = null;
        }
        // else: truly never seen before → movement stays null → "NUOVA"
      }

      ranked.push({ label, rank, prevRank, points, movement, snapshotCount: 1 });
    }
    return ranked;
  }

  // Historical/cumulative view: aggregate snapshots
  const aggregated = aggregateSnapshots(snapshots, genre, period);
  if (aggregated.size === 0) return [];

  // Sort by total points descending to determine cumulative rank
  const sorted = Array.from(aggregated.entries()).sort((a, b) => b[1].totalPoints - a[1].totalPoints);

  // For movement in cumulative view, compare with the current live data
  const ranked: RankedLabel[] = [];
  for (let i = 0; i < sorted.length; i++) {
    const [labelName, data] = sorted[i];
    const cumulativeRank = i + 1;

    // Find matching label in current data
    const matchingLabel = labels.find(l => l.name === labelName);
    const currentRank = matchingLabel?.rankByGenre?.[genre] ?? null;

    // Movement: compare current live rank with cumulative rank
    let movement: number | null = null;
    if (currentRank !== null) {
      movement = currentRank - cumulativeRank; // positive = label is better live than cumulative (hot right now)
    }

    // Use the label if found, otherwise create a minimal reference
    const label = matchingLabel || {
      id: `snapshot_${labelName.toLowerCase().replace(/[^a-z0-9]+/g, '_')}`,
      name: labelName,
      genre: genre,
      submissionType: "email" as const,
      contactInfo: "",
      status: "unknown" as const,
      notes: "",
      createdAt: new Date().toISOString(),
      emails: [],
      website: "",
      demoLink: "",
      socialLink: "",
      soundcloudLink: "",
      beatportLink: "",
      customLinks: [],
      genres: [genre],
      rankByGenre: { [genre]: currentRank || 999 },
      pointsByGenre: {},
      trending: false,
      trendingRankByGenre: {},
      trendingPointsByGenre: {},
      prevRankByGenre: {},
    };

    ranked.push({
      label,
      rank: cumulativeRank,
      prevRank: currentRank,
      points: data.totalPoints,
      movement,
      snapshotCount: data.snapshotCount,
    });
  }

  return ranked;
}

// ==================== COMPONENT ====================

export function RankingsPage() {
  const { labels, locale, rankingsUpdatedAt, rankingSnapshots, setActiveTab, setSelectedLabelId } = useAppStore();
  const snapshots = rankingSnapshots || []; // defensive: might be undefined for existing users
  const [selectedGenre, setSelectedGenre] = useState<string | null>(null);
  const [sortMode, setSortMode] = useState<SortMode>("rank");
  const [movementFilter, setMovementFilter] = useState<MovementFilter>("all");
  const [timePeriod, setTimePeriod] = useState<RankingTimePeriod>("current");
  const [showGenreDropdown, setShowGenreDropdown] = useState(false);
  const [spotlightShowAll, setSpotlightShowAll] = useState(false); // when true + genre selected, show global risers instead of genre-filtered

  // ---- Manual "refresh rankings" button state (for non-admin users) ----
  // Shows whether a cloud refresh is in progress, and provides feedback after.
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [refreshFeedback, setRefreshFeedback] = useState<null | "done" | "error">(null);

  // Click on a label name → navigate to the LabelFinder tab and auto-open
  // the detail dialog for that label. Matches by id when possible, falls
  // back to name (LabelFinder's useEffect handles both).
  const handleOpenLabel = useCallback(
    (label: Label) => {
      setSelectedLabelId?.(label.id || label.name);
      setActiveTab("labels");
    },
    [setActiveTab, setSelectedLabelId]
  );

  // Manual "refresh rankings" — pulls the latest global cloud data and
  // re-merges it into the local store. Useful for non-admin users who
  // want to see if the admin has pushed a new scrape since they opened
  // the app (realtime should already handle this, but the button gives
  // a visible "force refresh" affordance + user feedback).
  const handleManualRefresh = useCallback(async () => {
    if (isRefreshing) return;
    setIsRefreshing(true);
    setRefreshFeedback(null);
    try {
      await loadFromCloud();
      setRefreshFeedback("done");
    } catch (err) {
      console.error("[RankingsPage] Manual refresh failed:", err);
      setRefreshFeedback("error");
    } finally {
      setIsRefreshing(false);
      // Auto-clear feedback after 3 seconds
      setTimeout(() => setRefreshFeedback(null), 3000);
    }
  }, [isRefreshing]);

  // Format the rankingsUpdatedAt timestamp with date + time, locale-aware.
  // Returns null if no update timestamp is available.
  const formattedLastUpdate = useMemo(() => {
    if (!rankingsUpdatedAt) return null;
    try {
      const d = new Date(rankingsUpdatedAt);
      const localeStr = locale === "it" ? "it-IT" : locale === "es" ? "es-ES" : locale === "fr" ? "fr-FR" : locale === "de" ? "de-DE" : "en-US";
      return d.toLocaleString(localeStr, {
        day: "2-digit",
        month: "short",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      });
    } catch {
      return null;
    }
  }, [rankingsUpdatedAt, locale]);

  // Get all genres from labels, sorted alphabetically
  const allGenres = useMemo(() => {
    const genreSet = new Set<string>();
    for (const label of labels) {
      if (label.genres) {
        for (const g of label.genres) {
          genreSet.add(g);
        }
      }
    }
    return Array.from(genreSet).sort((a, b) => a.localeCompare(b));
  }, [labels]);

  // Build ranked list for selected genre and period
  const rankedList = useMemo((): RankedLabel[] => {
    if (!selectedGenre) return [];
    return buildRankedList(labels, snapshots, selectedGenre, timePeriod);
  }, [labels, snapshots, selectedGenre, timePeriod]);

  // Apply filters
  const filteredList = useMemo(() => {
    let result = [...rankedList];

    // Movement filter
    switch (movementFilter) {
      case "rising":
        result = result.filter((l) => l.movement !== null && l.movement > 0);
        break;
      case "falling":
        result = result.filter((l) => l.movement !== null && l.movement < 0);
        break;
      case "new":
        result = result.filter((l) => l.movement === null);
        break;
      case "stable":
        result = result.filter((l) => l.movement === 0);
        break;
    }

    // Sort
    switch (sortMode) {
      case "rank":
        result.sort((a, b) => a.rank - b.rank);
        break;
      case "movement":
        result.sort((a, b) => {
          if (a.movement === null && b.movement === null) return a.rank - b.rank;
          if (a.movement === null) return -1;
          if (b.movement === null) return 1;
          return b.movement - a.movement;
        });
        break;
      case "points":
        result.sort((a, b) => b.points - a.points);
        break;
    }

    return result;
  }, [rankedList, movementFilter, sortMode]);

  // Stats summary
  const stats = useMemo(() => {
    const total = rankedList.length;
    const rising = rankedList.filter((l) => l.movement !== null && l.movement > 0).length;
    const falling = rankedList.filter((l) => l.movement !== null && l.movement < 0).length;
    const newEntries = rankedList.filter((l) => l.movement === null).length;

    return { total, rising, falling, newEntries };
  }, [rankedList]);

  // Top rising labels across ALL genres (for the global spotlight section)
  // Reads "previous rank" directly from immutable historical snapshots — this
  // is robust against identical re-imports that would otherwise zero out
  // label.prevRankByGenre and make Spotlight risers disappear.
  const topRisers = useMemo(() => {
    const risers: { label: Label; genre: string; movement: number; rank: number }[] = [];

    for (const label of labels) {
      if (!label.rankByGenre || Object.keys(label.rankByGenre).length === 0) continue;
      for (const genre of label.genres) {
        const currentRank = label.rankByGenre?.[genre];
        if (!currentRank) continue;
        // Look up the most recent DIFFERENT rank in historical snapshots.
        const prevRank = findPrevRankFromSnapshots(snapshots, label.name, genre, currentRank);
        if (prevRank !== undefined && prevRank > currentRank) {
          const movement = prevRank - currentRank;
          risers.push({ label, genre, movement, rank: currentRank });
        }
      }
    }

    return risers.sort((a, b) => b.movement - a.movement).slice(0, 10);
  }, [labels, snapshots]);

  // Top rising labels for the SELECTED genre (genre-specific spotlight)
  // Same snapshot-based logic as topRisers above.
  const topRisersForGenre = useMemo(() => {
    if (!selectedGenre) return [];
    const risers: { label: Label; genre: string; movement: number; rank: number }[] = [];

    for (const label of labels) {
      const currentRank = label.rankByGenre?.[selectedGenre];
      if (!currentRank) continue;
      const prevRank = findPrevRankFromSnapshots(snapshots, label.name, selectedGenre, currentRank);
      if (prevRank !== undefined && prevRank > currentRank) {
        const movement = prevRank - currentRank;
        risers.push({ label, genre: selectedGenre, movement, rank: currentRank });
      }
    }

    return risers.sort((a, b) => b.movement - a.movement).slice(0, 10);
  }, [labels, snapshots, selectedGenre]);

  const hasPreviousData = useMemo(() => {
    // Consider "previous data" present if either:
    // - At least one label has prevRankByGenre populated, OR
    // - There is at least one historical snapshot with genre data.
    //   (Snapshots are the authoritative source for risers — checking them
    //   here ensures the Spotlight section renders even when prevRankByGenre
    //   has been clobbered by an identical re-import.)
    const labelsHavePrev = labels.some((l) => l.prevRankByGenre && Object.keys(l.prevRankByGenre).length > 0);
    const hasSnapshots = snapshots.length > 0 && snapshots.some(s => Object.keys(s.genres || {}).length > 0);
    return labelsHavePrev || hasSnapshots;
  }, [labels, snapshots]);

  // ⚠️ FIX (2026-06-22): Don't show the "no history" alert until cloud sync
  // has completed. The cloud-first architecture loads data asynchronously
  // after login — at mount time, `labels` may be the seed-only set with no
  // prevRankByGenre. Showing the alert immediately confuses users who DO
  // have history in the cloud but haven't received it yet.
  // We wait for either:
  //   1. hasCloudSynced = true (cloud sync finished, data is final), OR
  //   2. hasPreviousData = true (already has prev ranks, no need to wait)
  const { hasCloudSynced } = useAppStore();
  const hideNoHistoryAlert = hasPreviousData || !hasCloudSynced;

  // Snapshot stats for info display
  const snapshotStats = useMemo(() => {
    if (!snapshots || snapshots.length === 0) return { count: 0, oldest: null as string | null, newest: null as string | null };
    const sorted = [...snapshots].sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
    return {
      count: snapshots.length,
      oldest: sorted[0].timestamp,
      newest: sorted[sorted.length - 1].timestamp,
    };
  }, [snapshots]);

  // Spotlight risers: genre-filtered or global, based on toggle
  const spotlightRisers = useMemo(() => {
    if (!hasPreviousData) return [];
    const isGenreFiltered = selectedGenre && !spotlightShowAll;
    return isGenreFiltered ? topRisersForGenre : topRisers;
  }, [hasPreviousData, selectedGenre, spotlightShowAll, topRisers, topRisersForGenre]);

  const hasSnapshots = snapshots.length > 0;

  // === EMERGENCY HISTORY RECOVERY ===
  // If the live store has 0 snapshots but the dedicated sidecar backup slot
  // (labelpulse-snapshots-backup) has snapshots, show a one-click "restore history"
  // button. This is the safety-net UI for the scenario where a bad cloud sync,
  // a partial import, or a localStorage hiccup wipes the live rankingSnapshots
  // array but the sidecar survived.
  const [sidecarCount, setSidecarCount] = useState(0);
  const [restoredMsg, setRestoredMsg] = useState<string | null>(null);
  useEffect(() => {
    setSidecarCount(readSnapshotsSidecar().length);
  }, [snapshots.length]);
  const showRestoreHistoryBtn =
    !hasSnapshots && sidecarCount > 0 && labels.length > 0;
  const handleRestoreHistory = () => {
    const added = restoreSnapshotsFromSidecar();
    if (added > 0) {
      setRestoredMsg(
        locale === "it"
          ? `Storico recuperato: ${added} snapshot importati dal backup di emergenza.`
          : `History recovered: ${added} snapshot(s) imported from emergency backup.`
      );
    } else {
      setRestoredMsg(
        locale === "it"
          ? "Nessuno snapshot nuovo da recuperare (già sincronizzati)."
          : "No new snapshots to recover (already in sync)."
      );
    }
    setSidecarCount(readSnapshotsSidecar().length);
  };

  return (
    <div className="space-y-6">
      {/* Alert if no previous data */}
      {!hideNoHistoryAlert && timePeriod === "current" && (
        <div className="flex items-start gap-3 p-4 rounded-lg bg-amber-500/10 border border-amber-500/30">
          <AlertTriangle className="h-5 w-5 text-amber-400 shrink-0 mt-0.5" />
          <div className="flex-1">
            <p className="text-sm text-amber-400 font-medium">{t(locale, "rankings.noHistory")}</p>
            <p className="text-xs text-muted-foreground mt-1">{t(locale, "rankings.noHistoryDesc")}</p>
            {showRestoreHistoryBtn && (
              <div className="mt-3 flex flex-col gap-2">
                <Button
                  onClick={handleRestoreHistory}
                  size="sm"
                  variant="outline"
                  className="gap-1.5 border-cyan-500/50 text-cyan-400 hover:bg-cyan-500/10 w-fit"
                >
                  <RotateCcw className="h-3.5 w-3.5" />
                  {locale === "it"
                    ? `Recupera storico dal backup di emergenza (${sidecarCount} snapshot)`
                    : `Restore history from emergency backup (${sidecarCount} snapshots)`}
                </Button>
                {restoredMsg && (
                  <p className="text-xs text-emerald-400">{restoredMsg}</p>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ⚠️ FIX (2026-06-22): Show "loading from cloud" banner while cloud
          sync is in progress and we don't have prev data yet. This replaces
          the misleading "no history" alert during the async cloud load. */}
      {!hasPreviousData && !hasCloudSynced && timePeriod === "current" && (
        <div className="flex items-start gap-3 p-4 rounded-lg bg-cyan-500/10 border border-cyan-500/30">
          <div className="h-5 w-5 rounded-full border-2 border-cyan-400 border-t-transparent animate-spin shrink-0 mt-0.5" />
          <div>
            <p className="text-sm text-cyan-400 font-medium">
              {locale === "it" ? "Caricamento dati dal cloud..." : "Loading data from cloud..."}
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              {locale === "it"
                ? "Stiamo recuperando le tue classifiche e il tuo profilo dal cloud. Un attimo di pazienza."
                : "We're retrieving your charts and profile from the cloud. One moment please."}
            </p>
          </div>
        </div>
      )}

      {/* If restore happened while history is now present, show success banner */}
      {restoredMsg && hasPreviousData && (
        <div className="flex items-start gap-3 p-3 rounded-lg bg-emerald-500/10 border border-emerald-500/30">
          <History className="h-4 w-4 text-emerald-400 shrink-0 mt-0.5" />
          <p className="text-xs text-emerald-400">{restoredMsg}</p>
        </div>
      )}

      {/* Snapshot info banner */}
      {timePeriod !== "current" && !hasSnapshots && (
        <div className="flex items-start gap-3 p-4 rounded-lg bg-cyan-500/10 border border-cyan-500/30">
          <History className="h-5 w-5 text-cyan-400 shrink-0 mt-0.5" />
          <div>
            <p className="text-sm text-cyan-400 font-medium">{t(locale, "rankings.noSnapshots")}</p>
            <p className="text-xs text-muted-foreground mt-1">{t(locale, "rankings.noSnapshotsDesc")}</p>
          </div>
        </div>
      )}

      {/* Snapshot stats (when viewing historical data) */}
      {timePeriod !== "current" && hasSnapshots && (
        <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/30 border border-border/50">
          <History className="h-4 w-4 text-muted-foreground shrink-0" />
          <div className="flex flex-wrap gap-4 text-xs text-muted-foreground">
            <span>{snapshotStats.count} {t(locale, "rankings.snapshots")}</span>
            {snapshotStats.oldest && (
              <span>{t(locale, "rankings.from")}: {new Date(snapshotStats.oldest).toLocaleDateString(locale === "it" ? "it-IT" : "en-US")}</span>
            )}
            {snapshotStats.newest && (
              <span>{t(locale, "rankings.to")}: {new Date(snapshotStats.newest).toLocaleDateString(locale === "it" ? "it-IT" : "en-US")}</span>
            )}
          </div>
        </div>
      )}

      {/* Spotlight: Top Risers */}
      {timePeriod === "current" && hasPreviousData && (spotlightRisers.length > 0 || (selectedGenre && !spotlightShowAll)) && (
        <div className="space-y-3">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <Flame className="h-5 w-5 text-orange-400" />
              <h3 className="text-sm font-semibold text-foreground">
                {selectedGenre && !spotlightShowAll
                  ? t(locale, "rankings.spotlightGenre")
                  : t(locale, "rankings.spotlight")}
              </h3>
            </div>
            {/* Toggle: only show when a genre is selected */}
            {selectedGenre && (
              <div className="flex rounded-lg border border-border overflow-hidden">
                <button
                  onClick={() => setSpotlightShowAll(false)}
                  className={`px-2.5 py-1 text-[11px] font-medium transition-colors ${
                    !spotlightShowAll
                      ? "bg-primary/15 text-primary"
                      : "text-muted-foreground hover:text-foreground hover:bg-secondary/50"
                  }`}
                >
                  {selectedGenre}
                </button>
                <button
                  onClick={() => setSpotlightShowAll(true)}
                  className={`px-2.5 py-1 text-[11px] font-medium transition-colors ${
                    spotlightShowAll
                      ? "bg-primary/15 text-primary"
                      : "text-muted-foreground hover:text-foreground hover:bg-secondary/50"
                  }`}
                >
                  {t(locale, "rankings.spotlightAll")}
                </button>
              </div>
            )}
          </div>
          {spotlightRisers.length > 0 ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-2">
              {spotlightRisers.map((item, idx) => (
                <div
                  key={`${item.label.id}-${item.genre}`}
                  className="flex items-center gap-2 p-2.5 rounded-lg bg-gradient-to-r from-emerald-500/10 to-transparent border border-emerald-500/20"
                >
                  <span className="text-lg font-bold text-emerald-400 shrink-0">+{item.movement}</span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1 min-w-0">
                      <ClickableLabelName
                        label={item.label}
                        className="text-xs font-medium text-foreground truncate"
                        onOpen={handleOpenLabel}
                      />
                    </div>
                    <div className="flex items-center gap-1 mt-0.5">
                      <p className="text-[10px] text-muted-foreground truncate">
                        {selectedGenre && !spotlightShowAll
                          ? `#${item.rank} · +${item.movement}`
                          : item.genre}
                      </p>
                      <LabelDiscoveryIcons label={item.label} size={10} />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-xs text-muted-foreground py-4 text-center">
              {t(locale, "rankings.noRisersForGenre")}
            </p>
          )}
        </div>
      )}


      {/* Last-update badge + manual refresh button (visible to all users) */}
      {formattedLastUpdate && (
        <div className="flex items-center justify-between gap-3 flex-wrap px-3 py-2 rounded-md bg-secondary/30 border border-border/40">
          <span className="flex items-center gap-2 text-xs text-muted-foreground">
            <Clock className="h-3.5 w-3.5 text-cyan-400 shrink-0" />
            <span className="text-muted-foreground/70">{t(locale, "rankings.lastUpdateFull")}:</span>
            <span className="font-medium text-foreground">{formattedLastUpdate}</span>
          </span>
          <button
            type="button"
            onClick={handleManualRefresh}
            disabled={isRefreshing}
            className={`flex items-center gap-1.5 px-2 py-1 rounded-md text-xs font-medium transition-colors border ${
              refreshFeedback === "done"
                ? "bg-emerald-500/15 text-emerald-300 border-emerald-500/40"
                : refreshFeedback === "error"
                  ? "bg-red-500/15 text-red-300 border-red-500/40"
                  : "bg-cyan-500/10 text-cyan-300 border-cyan-500/30 hover:bg-cyan-500/20"
            } ${isRefreshing ? "opacity-60 cursor-wait" : ""}`}
            title={t(locale, "rankings.refreshButton")}
          >
            <RefreshCw className={`h-3 w-3 ${isRefreshing ? "animate-spin" : ""}`} />
            {isRefreshing
              ? t(locale, "rankings.refreshing")
              : refreshFeedback === "done"
                ? t(locale, "rankings.refreshDone")
                : refreshFeedback === "error"
                  ? t(locale, "rankings.refreshError")
                  : t(locale, "rankings.refreshButton")}
          </button>
        </div>
      )}

      {/* Genre selector + Filters */}
      <div className="space-y-4">
        {/* Genre dropdown */}
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <Button
              variant="outline"
              className="w-full justify-between text-sm"
              onClick={() => setShowGenreDropdown(!showGenreDropdown)}
            >
              <span className="flex items-center gap-2">
                <BarChart3 className="h-4 w-4 text-primary" />
                {selectedGenre || t(locale, "rankings.selectGenre")}
              </span>
              <ChevronDown className={`h-4 w-4 transition-transform ${showGenreDropdown ? "rotate-180" : ""}`} />
            </Button>
            {showGenreDropdown && (
              <div className="absolute z-50 mt-1 w-full max-h-64 overflow-y-auto rounded-lg border border-border bg-popover shadow-lg">
                {allGenres.map((genre) => {
                  const count = labels.filter((l) => l.rankByGenre?.[genre]).length;
                  return (
                    <button
                      key={genre}
                      onClick={() => {
                        setSelectedGenre(genre);
                        setSpotlightShowAll(false);
                        setShowGenreDropdown(false);
                      }}
                      className={`w-full flex items-center justify-between px-3 py-2 text-sm hover:bg-accent/50 transition-colors ${
                        selectedGenre === genre ? "bg-primary/10 text-primary font-medium" : "text-foreground"
                      }`}
                    >
                      <span className="truncate">{genre}</span>
                      <span className="text-xs text-muted-foreground shrink-0 ml-2">{count}</span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {/* Sort & Filter controls */}
          {selectedGenre && (
            <div className="flex gap-2 flex-wrap">
              {/* Sort */}
              <div className="flex rounded-lg border border-border overflow-hidden">
                {([["rank", Trophy], ["movement", TrendingUp], ["points", BarChart3]] as const).map(([mode, Icon]) => (
                  <button
                    key={mode}
                    onClick={() => setSortMode(mode)}
                    className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium transition-colors ${
                      sortMode === mode
                        ? "bg-primary/15 text-primary"
                        : "text-muted-foreground hover:text-foreground hover:bg-secondary/50"
                    }`}
                  >
                    <Icon className="h-3.5 w-3.5" />
                    {t(locale, `rankings.sort.${mode}`)}
                  </button>
                ))}
              </div>

              {/* Movement filter */}
              <div className="flex rounded-lg border border-border overflow-hidden">
                {([["all", Filter], ["rising", TrendingUp], ["falling", TrendingDown], ["new", ArrowUpRight]] as const).map(([filter, Icon]) => (
                  <button
                    key={filter}
                    onClick={() => setMovementFilter(filter)}
                    className={`flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium transition-colors ${
                      movementFilter === filter
                        ? "bg-primary/15 text-primary"
                        : "text-muted-foreground hover:text-foreground hover:bg-secondary/50"
                    }`}
                    title={t(locale, `rankings.filter.${filter}`)}
                  >
                    <Icon className="h-3.5 w-3.5" />
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Time Period Selector */}
        {selectedGenre && (
          <div className="flex flex-col sm:flex-row items-start sm:items-center gap-2">
            <span className="text-xs text-muted-foreground font-medium shrink-0">{t(locale, "rankings.periodLabel")}:</span>
            <div className="flex rounded-lg border border-border overflow-hidden">
              {(["current", "1m", "3m", "1y", "all"] as RankingTimePeriod[]).map((period) => {
                const Icon = getPeriodIcon(period);
                const isDisabled = period !== "current" && !hasSnapshots;
                return (
                  <button
                    key={period}
                    onClick={() => !isDisabled && setTimePeriod(period)}
                    className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium transition-colors ${
                      timePeriod === period
                        ? "bg-cyan-500/15 text-cyan-400"
                        : isDisabled
                          ? "text-muted-foreground/40 cursor-not-allowed"
                          : "text-muted-foreground hover:text-foreground hover:bg-secondary/50"
                    }`}
                    title={isDisabled ? t(locale, "rankings.periodDisabled") : getPeriodLabel(period, locale)}
                  >
                    <Icon className="h-3.5 w-3.5" />
                    {getPeriodLabel(period, locale)}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* Stats bar — click numbers to filter the list by movement */}
        {selectedGenre && stats.total > 0 && (
          <div className="flex flex-wrap gap-2 text-xs">
            <button
              type="button"
              onClick={() => setMovementFilter("all")}
              className={`flex items-center gap-1 px-2 py-1 rounded-md transition-colors ${
                movementFilter === "all"
                  ? "bg-cyan-500/20 text-cyan-300 border border-cyan-500/40"
                  : "text-muted-foreground hover:bg-muted/40 hover:text-foreground border border-transparent"
              }`}
              title={locale === "it" ? "Mostra tutte" : "Show all"}
            >
              <Eye className="h-3 w-3" /> {stats.total} {t(locale, "rankings.labels")}
            </button>
            {timePeriod === "current" && (
              <>
                <button
                  type="button"
                  onClick={() => setMovementFilter(movementFilter === "rising" ? "all" : "rising")}
                  disabled={stats.rising === 0}
                  className={`flex items-center gap-1 px-2 py-1 rounded-md transition-colors ${
                    movementFilter === "rising"
                      ? "bg-emerald-500/20 text-emerald-300 border border-emerald-500/40"
                      : stats.rising === 0
                        ? "text-muted-foreground/40 border border-transparent cursor-not-allowed"
                        : "text-emerald-400 hover:bg-emerald-500/15 border border-transparent"
                  }`}
                  title={locale === "it" ? "Mostra solo le label salite" : "Show only rising labels"}
                >
                  <TrendingUp className="h-3 w-3" /> {stats.rising} {t(locale, "rankings.rising")}
                </button>
                <button
                  type="button"
                  onClick={() => setMovementFilter(movementFilter === "falling" ? "all" : "falling")}
                  disabled={stats.falling === 0}
                  className={`flex items-center gap-1 px-2 py-1 rounded-md transition-colors ${
                    movementFilter === "falling"
                      ? "bg-red-500/20 text-red-300 border border-red-500/40"
                      : stats.falling === 0
                        ? "text-muted-foreground/40 border border-transparent cursor-not-allowed"
                        : "text-red-400 hover:bg-red-500/15 border border-transparent"
                  }`}
                  title={locale === "it" ? "Mostra solo le label scese" : "Show only falling labels"}
                >
                  <TrendingDown className="h-3 w-3" /> {stats.falling} {t(locale, "rankings.falling")}
                </button>
                <button
                  type="button"
                  onClick={() => setMovementFilter(movementFilter === "new" ? "all" : "new")}
                  disabled={stats.newEntries === 0}
                  className={`flex items-center gap-1 px-2 py-1 rounded-md transition-colors ${
                    movementFilter === "new"
                      ? "bg-cyan-500/20 text-cyan-300 border border-cyan-500/40"
                      : stats.newEntries === 0
                        ? "text-muted-foreground/40 border border-transparent cursor-not-allowed"
                        : "text-cyan-400 hover:bg-cyan-500/15 border border-transparent"
                  }`}
                  title={locale === "it" ? "Mostra solo le nuove entrate" : "Show only new entries"}
                >
                  <ArrowUpRight className="h-3 w-3" /> {stats.newEntries} {t(locale, "rankings.newEntries")}
                </button>
              </>
            )}
            {timePeriod !== "current" && (
              <span className="flex items-center gap-1 text-cyan-400">
                <History className="h-3 w-3" /> {t(locale, "rankings.cumulativeView")}
              </span>
            )}
            {rankingsUpdatedAt && (
              <span className="flex items-center gap-1 text-muted-foreground ml-auto">
                {t(locale, "rankings.lastUpdate")}: {new Date(rankingsUpdatedAt).toLocaleDateString(locale === "it" ? "it-IT" : "en-US")}
              </span>
            )}
          </div>
        )}

        {/* Active filter banner — appears when a movement filter is set */}
        {selectedGenre && movementFilter !== "all" && filteredList.length > 0 && (
          <div className="flex items-center justify-between gap-3 px-3 py-2 rounded-md bg-cyan-500/10 border border-cyan-500/30 text-xs">
            <span className="flex items-center gap-2 text-cyan-300">
              <Filter className="h-3.5 w-3.5" />
              {locale === "it"
                ? `Filtro attivo: ${filteredList.length} ${movementFilter === "rising" ? "salite" : movementFilter === "falling" ? "scese" : "nuove entrate"} su ${stats.total}`
                : `Filter active: ${filteredList.length} ${movementFilter === "rising" ? "rising" : movementFilter === "falling" ? "falling" : "new entries"} of ${stats.total}`}
            </span>
            <button
              type="button"
              onClick={() => setMovementFilter("all")}
              className="flex items-center gap-1 text-cyan-300 hover:text-cyan-200 hover:underline"
              title={locale === "it" ? "Rimuovi filtro" : "Clear filter"}
            >
              <RotateCcw className="h-3 w-3" />
              {locale === "it" ? "Mostra tutte" : "Show all"}
            </button>
          </div>
        )}

        {/* Rankings table */}
        {selectedGenre && filteredList.length > 0 && (
          <div className="rounded-lg border border-border/50 overflow-hidden">
            {/* Table header */}
            <div className={`grid items-center gap-1 px-3 py-2 bg-secondary/30 text-xs font-medium text-muted-foreground border-b border-border/50 ${
              timePeriod !== "current"
                ? "grid-cols-[2.5rem_1fr_auto] sm:grid-cols-[3rem_1fr_5rem_5rem_5.5rem_4rem]"
                : "grid-cols-[2.5rem_1fr_auto] sm:grid-cols-[3rem_1fr_5rem_5rem_5rem]"
            }`}>
              <span>#</span>
              <span>{t(locale, "rankings.colLabel")}</span>
              {/* Mobile: rank hidden, movement hidden, only label + points */}
              <span className="text-right sm:hidden">
                {timePeriod !== "current" ? t(locale, "rankings.colCumPoints") : t(locale, "rankings.colPoints")}
              </span>
              {/* Desktop: full columns */}
              <span className="hidden text-right sm:block">{t(locale, "rankings.colRank")}</span>
              <span className="hidden text-right sm:block">{t(locale, "rankings.colMovement")}</span>
              <span className="hidden text-right sm:block">
                {timePeriod !== "current" ? t(locale, "rankings.colCumPoints") : t(locale, "rankings.colPoints")}
              </span>
              {timePeriod !== "current" && (
                <span className="hidden text-right sm:block">{t(locale, "rankings.colUpdates")}</span>
              )}
            </div>

            {/* Table body */}
            <div className="divide-y divide-border/30">
              {filteredList.map((item) => {
                const tier = getLabelTier(item.label, selectedGenre!);
                const tierBadge = getTierBadge(tier);

                return (
                  <div
                    key={`${item.label.id}-${item.rank}`}
                    className={`grid items-center gap-1 px-3 py-2.5 text-sm transition-colors hover:bg-secondary/20 ${
                      timePeriod !== "current"
                        ? "grid-cols-[2.5rem_1fr_auto] sm:grid-cols-[3rem_1fr_5rem_5rem_5.5rem_4rem]"
                        : "grid-cols-[2.5rem_1fr_auto] sm:grid-cols-[3rem_1fr_5rem_5rem_5rem]"
                    } ${item.rank <= 3 ? "bg-primary/5" : ""}`}
                  >
                    {/* Rank number */}
                    <span className={`font-mono font-bold ${item.rank <= 3 ? "text-primary" : "text-foreground"}`}>
                      {item.rank}
                    </span>

                    {/* Label name + tier + (mobile: movement inline) */}
                    <div className="flex items-center gap-1.5 min-w-0">
                      <ClickableLabelName
                        label={item.label}
                        className="font-medium text-foreground"
                        onOpen={handleOpenLabel}
                      />
                      {timePeriod === "current" && (
                        <>
                          <span className={`shrink-0 flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] border ${tierBadge.color}`}>
                            {tierBadge.icon}
                            {tier === "top" ? "T" : tier === "mid" ? "M" : tier === "emerging" ? "E" : ""}
                          </span>
                          {item.label.trending && <Flame className="h-3 w-3 text-orange-400 shrink-0" />}
                          {/* Mobile: movement inline as icon + small number */}
                          <span className="shrink-0 flex items-center gap-0.5 sm:hidden">
                            {getMovementIcon(item.movement)}
                            <span className={`font-mono text-[10px] ${getMovementColor(item.movement)}`}>
                              {getMovementText(item.movement, locale)}
                            </span>
                          </span>
                        </>
                      )}
                      {/* Discovery icons only on desktop */}
                      <div className="hidden sm:block">
                        <LabelDiscoveryIcons label={item.label} size={11} />
                      </div>
                    </div>

                    {/* Mobile: points only (compact) */}
                    <span className="text-right font-mono text-xs text-muted-foreground sm:hidden">
                      {item.points.toLocaleString(locale === "it" ? "it-IT" : "en-US")}
                    </span>

                    {/* Desktop: Current rank */}
                    <span className="hidden text-right font-mono text-foreground sm:block">
                      #{item.rank}
                    </span>

                    {/* Desktop: Movement */}
                    <div className="hidden items-center justify-end gap-1 sm:flex">
                      {timePeriod === "current" ? (
                        <>
                          {getMovementIcon(item.movement)}
                          <span className={`font-mono text-xs ${getMovementColor(item.movement)}`}>
                            {getMovementText(item.movement, locale)}
                          </span>
                        </>
                      ) : (
                        <span className="font-mono text-xs text-muted-foreground">—</span>
                      )}
                    </div>

                    {/* Desktop: Points */}
                    <span className="hidden text-right font-mono text-xs text-muted-foreground sm:block">
                      {item.points.toLocaleString(locale === "it" ? "it-IT" : "en-US")}
                    </span>

                    {/* Desktop: Snapshot count (only for cumulative views) */}
                    {timePeriod !== "current" && (
                      <span className="hidden text-right font-mono text-[10px] text-muted-foreground sm:block">
                        {item.snapshotCount}×
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Empty state */}
        {selectedGenre && filteredList.length === 0 && (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <BarChart3 className="h-10 w-10 text-muted-foreground/30 mb-3" />
            <p className="text-sm text-muted-foreground">
              {timePeriod !== "current" && !hasSnapshots
                ? t(locale, "rankings.noSnapshots")
                : movementFilter !== "all"
                  ? t(locale, "rankings.noResultsFilter")
                  : t(locale, "rankings.noResults")}
            </p>
          </div>
        )}

        {/* No genre selected */}
        {!selectedGenre && (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <Trophy className="h-14 w-14 text-primary/30 mb-4" />
            <h3 className="text-lg font-semibold text-foreground mb-2">{t(locale, "rankings.title")}</h3>
            <p className="text-sm text-muted-foreground max-w-md">
              {t(locale, "rankings.selectGenrePrompt")}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
