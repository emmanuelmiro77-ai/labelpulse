"use client";

import { useAppStore, getLabelTier } from "@/lib/store";
import type { Label } from "@/lib/store";
import { t, type Locale } from "@/lib/i18n";
import {
  Trophy,
  TrendingUp,
  TrendingDown,
  Minus,
  ArrowUpRight,
  ArrowDownRight,
  Flame,
  Eye,
  BarChart3,
  Crown,
  Medal,
  Star,
  Filter,
  ChevronDown,
  AlertTriangle,
} from "lucide-react";
import { useState, useMemo, useCallback } from "react";
import { Button } from "@/components/ui/button";

// ==================== TYPES ====================

type SortMode = "rank" | "movement" | "points";
type MovementFilter = "all" | "rising" | "falling" | "new" | "stable";

interface RankedLabel extends Label {
  rank: number;
  prevRank: number | null; // null = not ranked before (new entry)
  points: number;
  movement: number | null; // positive = moved up, negative = moved down, null = new
}

// ==================== HELPERS ====================

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

// ==================== COMPONENT ====================

export function RankingsPage() {
  const { labels, locale, rankingsUpdatedAt } = useAppStore();
  const [selectedGenre, setSelectedGenre] = useState<string | null>(null);
  const [sortMode, setSortMode] = useState<SortMode>("rank");
  const [movementFilter, setMovementFilter] = useState<MovementFilter>("all");
  const [showGenreDropdown, setShowGenreDropdown] = useState(false);

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

  // Build ranked list for selected genre
  const rankedList = useMemo((): RankedLabel[] => {
    if (!selectedGenre) return [];

    const ranked: RankedLabel[] = [];

    for (const label of labels) {
      const rank = label.rankByGenre?.[selectedGenre];
      if (rank === undefined || rank === null) continue;

      const prevRank = label.prevRankByGenre?.[selectedGenre] ?? null;
      const points = label.pointsByGenre?.[selectedGenre] ?? 0;
      let movement: number | null = null;

      if (prevRank !== null && prevRank !== undefined) {
        // Positive movement = moved UP (lower rank number is better)
        movement = prevRank - rank;
      } else if (Object.keys(label.prevRankByGenre || {}).length > 0) {
        // Has previous data but not in this genre → new entry to this genre
        movement = null;
      }

      ranked.push({
        ...label,
        rank,
        prevRank,
        points,
        movement,
      });
    }

    return ranked;
  }, [labels, selectedGenre]);

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
    const topMover = rankedList
      .filter((l) => l.movement !== null && l.movement > 0)
      .sort((a, b) => (b.movement || 0) - (a.movement || 0))[0];
    const worstMover = rankedList
      .filter((l) => l.movement !== null && l.movement < 0)
      .sort((a, b) => (a.movement || 0) - (b.movement || 0))[0];

    return { total, rising, falling, newEntries, topMover, worstMover };
  }, [rankedList]);

  // Top rising labels across ALL genres (for the spotlight section)
  const topRisers = useMemo(() => {
    const risers: { label: Label; genre: string; movement: number; rank: number }[] = [];

    for (const label of labels) {
      if (!label.prevRankByGenre || Object.keys(label.prevRankByGenre).length === 0) continue;
      for (const genre of label.genres) {
        const currentRank = label.rankByGenre?.[genre];
        const prevRank = label.prevRankByGenre?.[genre];
        if (currentRank && prevRank) {
          const movement = prevRank - currentRank;
          if (movement > 0) {
            risers.push({ label, genre, movement, rank: currentRank });
          }
        }
      }
    }

    return risers.sort((a, b) => b.movement - a.movement).slice(0, 10);
  }, [labels]);

  const hasPreviousData = useMemo(() => {
    return labels.some((l) => l.prevRankByGenre && Object.keys(l.prevRankByGenre).length > 0);
  }, [labels]);

  return (
    <div className="space-y-6">
      {/* Alert if no previous data */}
      {!hasPreviousData && (
        <div className="flex items-start gap-3 p-4 rounded-lg bg-amber-500/10 border border-amber-500/30">
          <AlertTriangle className="h-5 w-5 text-amber-400 shrink-0 mt-0.5" />
          <div>
            <p className="text-sm text-amber-400 font-medium">{t(locale, "rankings.noHistory")}</p>
            <p className="text-xs text-muted-foreground mt-1">{t(locale, "rankings.noHistoryDesc")}</p>
          </div>
        </div>
      )}

      {/* Spotlight: Top Risers (only if we have previous data) */}
      {hasPreviousData && topRisers.length > 0 && (
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <Flame className="h-5 w-5 text-orange-400" />
            <h3 className="text-sm font-semibold text-foreground">{t(locale, "rankings.spotlight")}</h3>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-2">
            {topRisers.map((item, idx) => (
              <div
                key={`${item.label.id}-${item.genre}`}
                className="flex items-center gap-2 p-2.5 rounded-lg bg-gradient-to-r from-emerald-500/10 to-transparent border border-emerald-500/20"
              >
                <span className="text-lg font-bold text-emerald-400 shrink-0">+{item.movement}</span>
                <div className="min-w-0">
                  <p className="text-xs font-medium text-foreground truncate">{item.label.name}</p>
                  <p className="text-[10px] text-muted-foreground truncate">{item.genre}</p>
                </div>
              </div>
            ))}
          </div>
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

        {/* Stats bar */}
        {selectedGenre && stats.total > 0 && (
          <div className="flex flex-wrap gap-3 text-xs">
            <span className="flex items-center gap-1 text-muted-foreground">
              <Eye className="h-3 w-3" /> {stats.total} {t(locale, "rankings.labels")}
            </span>
            <span className="flex items-center gap-1 text-emerald-400">
              <TrendingUp className="h-3 w-3" /> {stats.rising} {t(locale, "rankings.rising")}
            </span>
            <span className="flex items-center gap-1 text-red-400">
              <TrendingDown className="h-3 w-3" /> {stats.falling} {t(locale, "rankings.falling")}
            </span>
            <span className="flex items-center gap-1 text-cyan-400">
              <ArrowUpRight className="h-3 w-3" /> {stats.newEntries} {t(locale, "rankings.newEntries")}
            </span>
            {rankingsUpdatedAt && (
              <span className="flex items-center gap-1 text-muted-foreground ml-auto">
                {t(locale, "rankings.lastUpdate")}: {new Date(rankingsUpdatedAt).toLocaleDateString(locale === "it" ? "it-IT" : "en-US")}
              </span>
            )}
          </div>
        )}

        {/* Rankings table */}
        {selectedGenre && filteredList.length > 0 && (
          <div className="rounded-lg border border-border/50 overflow-hidden">
            {/* Table header */}
            <div className="grid grid-cols-[3rem_1fr_4.5rem_4rem_4rem] sm:grid-cols-[3rem_1fr_5rem_5rem_5rem] items-center gap-1 px-3 py-2 bg-secondary/30 text-xs font-medium text-muted-foreground border-b border-border/50">
              <span>#</span>
              <span>{t(locale, "rankings.colLabel")}</span>
              <span className="text-right">{t(locale, "rankings.colRank")}</span>
              <span className="text-right">{t(locale, "rankings.colMovement")}</span>
              <span className="text-right">{t(locale, "rankings.colPoints")}</span>
            </div>

            {/* Table body */}
            <div className="divide-y divide-border/30">
              {filteredList.map((item) => {
                const tier = getLabelTier(item, selectedGenre);
                const tierBadge = getTierBadge(tier);

                return (
                  <div
                    key={item.id}
                    className={`grid grid-cols-[3rem_1fr_4.5rem_4rem_4rem] sm:grid-cols-[3rem_1fr_5rem_5rem_5rem] items-center gap-1 px-3 py-2.5 text-sm transition-colors hover:bg-secondary/20 ${
                      item.rank <= 3 ? "bg-primary/5" : ""
                    }`}
                  >
                    {/* Rank number */}
                    <span className={`font-mono font-bold ${item.rank <= 3 ? "text-primary" : "text-foreground"}`}>
                      {item.rank}
                    </span>

                    {/* Label name + tier */}
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="font-medium text-foreground truncate">{item.name}</span>
                      <span className={`shrink-0 flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] border ${tierBadge.color}`}>
                        {tierBadge.icon}
                        {tier === "top" ? "T" : tier === "mid" ? "M" : tier === "emerging" ? "E" : ""}
                      </span>
                      {item.trending && <Flame className="h-3 w-3 text-orange-400 shrink-0" />}
                    </div>

                    {/* Current rank */}
                    <span className="text-right font-mono text-foreground">
                      #{item.rank}
                    </span>

                    {/* Movement */}
                    <div className="flex items-center justify-end gap-1">
                      {getMovementIcon(item.movement)}
                      <span className={`font-mono text-xs ${getMovementColor(item.movement)}`}>
                        {getMovementText(item.movement, locale)}
                      </span>
                    </div>

                    {/* Points */}
                    <span className="text-right font-mono text-xs text-muted-foreground">
                      {item.points.toLocaleString(locale === "it" ? "it-IT" : "en-US")}
                    </span>
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
              {movementFilter !== "all"
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
