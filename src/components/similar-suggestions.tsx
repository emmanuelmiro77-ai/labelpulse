"use client";

/**
 * SimilarSuggestions — UI panel that shows labels and artists similar to
 * the user's track, based on audio analysis (BPM, key, genre).
 *
 * Used in the Demo add/edit dialog and the Pitch generator. The parent
 * passes a TrackProfile (built from the user's audio analysis) plus the
 * full artists/labels arrays from the store. The component runs the
 * matcher via useMemo and renders two ranked lists.
 *
 * Each label row:
 *   - Name (clickable → opens label detail dialog via onOpenLabel)
 *   - Score bar (0–100)
 *   - Match count + best genre
 *   - "Use as target" button → onSelectLabel (so the user can promote a
 *     suggestion to the demo's target label)
 *
 * Each artist row:
 *   - Name (clickable → opens artist detail page via onOpenArtist)
 *   - Score bar
 *   - Track count + best chart position
 */

import React, { useMemo } from "react";
import {
  Sparkles,
  Users,
  Disc3,
  TrendingUp,
  ChevronRight,
  Loader2,
  Music2,
  Target,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import type { Artist, Label } from "@/lib/store";
import {
  findSimilarLabelsAndArtists,
  profileFromAnalysis,
  explainMatch,
  type TrackProfile,
} from "@/lib/demo-matcher";

interface SimilarSuggestionsProps {
  /** Live audio analysis from the demo form (null if not analyzed yet) */
  analysis: {
    bpm: number;
    bpmConfidence: number;
    key: { camelot: string; confidence: number };
  } | null | undefined;
  /** User-entered genre string (may be empty) */
  genre: string;
  /** Optional BPM/key override from manual form fields — used when the
   *  user typed values but didn't run analysis. */
  manualBpm?: string;
  manualKey?: string;
  /** Full scraped artists + labels arrays from the store */
  artists: Artist[];
  labels: Label[];
  /** Italian / English */
  locale: "it" | "en" | "es" | "fr" | "de" | "pt";
  /** Click on a label name → open its detail dialog */
  onOpenLabel?: (label: Label) => void;
  /** Click on an artist name → open their detail page */
  onOpenArtist?: (artistId: string) => void;
  /** "Use as target" button — promote this label to the demo's target field */
  onSelectLabel?: (label: Label) => void;
}

export function SimilarSuggestions({
  analysis,
  genre,
  manualBpm,
  manualKey,
  artists,
  labels,
  locale,
  onOpenLabel,
  onOpenArtist,
  onSelectLabel,
}: SimilarSuggestionsProps) {
  // Build a TrackProfile merging analysis + manual fields.
  // CRITICAL (2026-06-22): manual BPM/key MUST override analysis values.
  // The user may have manually corrected a wrong BPM detection (e.g. 133 → 134)
  // or typed a different key. We must honor their correction — otherwise the
  // suggestions keep using the wrong analysis value and the user feels ignored.
  const profile: TrackProfile | null = useMemo(() => {
    const fromAnalysis = profileFromAnalysis(analysis, genre);

    // Parse manual values (note: local vars MUST NOT shadow the prop names,
    // otherwise JS throws "Cannot access X before initialization" due to TDZ).
    const manualBpmNum = manualBpm ? parseInt(manualBpm, 10) : NaN;
    const parsedManualBpm = Number.isFinite(manualBpmNum) && manualBpmNum > 0 ? manualBpmNum : null;
    const manualKeyClean = manualKey?.trim() || null;

    // Manual wins over analysis when present
    const bpm = parsedManualBpm ?? fromAnalysis?.bpm ?? null;
    const camelotKey = manualKeyClean || fromAnalysis?.camelotKey || null;
    const finalGenre = genre?.trim() || null;

    if (bpm === null && !camelotKey) return null;
    return { bpm, camelotKey, genre: finalGenre };
  }, [analysis, genre, manualBpm, manualKey]);

  // Detect if the user has manually overridden the analysis values —
  // used to show a "(manuale)" badge next to the BPM display.
  const hasManualBpmOverride = useMemo(() => {
    if (!manualBpm) return false;
    const n = parseInt(manualBpm, 10);
    return Number.isFinite(n) && n > 0 && analysis?.bpm != null && n !== analysis.bpm;
  }, [manualBpm, analysis]);

  const result = useMemo(() => {
    if (!profile) return null;
    return findSimilarLabelsAndArtists(profile, artists, labels, {
      maxResults: 8,
      minScore: 0.1,
    });
  }, [profile, artists, labels]);

  // Nothing to match on — show prompt
  if (!profile) {
    return (
      <div className="rounded-md border border-dashed border-border/50 bg-secondary/20 p-3 text-center">
        <Sparkles className="h-4 w-4 text-primary/60 mx-auto mb-1.5" />
        <p className="text-[11px] text-muted-foreground">
          {locale === "it"
            ? "Carica o analizza la traccia per vedere label e artisti simili (match automatico su BPM, chiave, genere)."
            : "Upload or analyze your track to see similar labels and artists (auto-matched by BPM, key, genre)."}
        </p>
      </div>
    );
  }

  if (!result) return null;

  // Both lists empty — analysis ran but no matches in the scraped DB
  if (result.labels.length === 0 && result.artists.length === 0) {
    return (
      <div className="rounded-md border border-dashed border-border/50 bg-secondary/20 p-3 text-center">
        <Target className="h-4 w-4 text-amber-400 mx-auto mb-1.5" />
        <p className="text-[11px] text-muted-foreground">
          {locale === "it"
            ? `Nessun match trovato nei ${result.totalTracksScanned.toLocaleString()} brani del database. Prova ad allentare i filtri o cambia BPM/chiave.`
            : `No matches found across ${result.totalTracksScanned.toLocaleString()} tracks in the database. Try relaxing filters or changing BPM/key.`}
        </p>
      </div>
    );
  }

  const labelCount = result.labels.length;
  const artistCount = result.artists.length;
  const scannedK = Math.round(result.totalTracksScanned / 1000);

  return (
    <div className="space-y-3 rounded-md border border-primary/30 bg-primary/5 p-3">
      {/* Header */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-primary" />
          <p className="text-xs font-mono uppercase text-primary">
            {locale === "it" ? "Suggerimenti simili" : "Similar matches"}
          </p>
        </div>
        <span className="text-[10px] text-muted-foreground">
          {locale === "it"
            ? `basato su ${scannedK}k brani`
            : `based on ${scannedK}k tracks`}
        </span>
      </div>

      {/* Compact profile summary */}
      <div className="flex flex-wrap gap-1.5 text-[10px]">
        {profile.bpm != null && (
          <Badge variant="outline" className="bg-primary/10 border-primary/30 text-primary">
            {profile.bpm} BPM
            {hasManualBpmOverride && (
              <span className="ml-1 text-[8px] text-amber-400 font-mono">(manuale)</span>
            )}
          </Badge>
        )}
        {profile.camelotKey && (
          <Badge variant="outline" className="bg-primary/10 border-primary/30 text-primary">
            {profile.camelotKey}
          </Badge>
        )}
        {profile.genre && (
          <Badge variant="outline" className="bg-secondary/50 border-border/30 text-muted-foreground">
            {profile.genre}
          </Badge>
        )}
      </div>

      {/* Labels section */}
      {labelCount > 0 && (
        <div className="space-y-1.5">
          <div className="flex items-center gap-1.5">
            <Disc3 className="h-3.5 w-3.5 text-emerald-400" />
            <p className="text-[10px] text-muted-foreground uppercase tracking-wider font-medium">
              {locale === "it" ? "Label consigliate" : "Recommended labels"}
            </p>
            <span className="text-[10px] text-muted-foreground/60 ml-auto">{labelCount}</span>
          </div>
          <div className="space-y-1 max-h-64 overflow-y-auto pr-1">
            {result.labels.map((sl, idx) => {
              const rank = sl.label.rankByGenre?.[sl.bestGenre];
              const tier = rank && rank <= 20 ? "top" : rank && rank <= 50 ? "mid" : null;
              return (
                <div
                  key={sl.label.id || sl.label.name}
                  className="flex items-center gap-2 rounded-md border border-border/30 bg-card/60 p-2 hover:bg-secondary/40 hover:border-primary/30 transition-colors group"
                >
                  <span className="text-[10px] font-mono text-muted-foreground shrink-0 w-5 text-right">
                    {idx + 1}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <button
                        type="button"
                        onClick={() => onOpenLabel?.(sl.label)}
                        className="text-xs font-medium text-foreground hover:text-primary hover:underline truncate max-w-[180px] cursor-pointer bg-transparent border-0 p-0"
                        title={locale === "it"
                          ? `Apri la pagina di ${sl.label.name}`
                          : `Open ${sl.label.name}'s page`}
                      >
                        {sl.label.name}
                      </button>
                      {tier && (
                        <Badge className={`text-[8px] px-1 py-0 shrink-0 ${
                          tier === "top"
                            ? "bg-purple-500/20 text-purple-400 border-purple-500/30"
                            : "bg-blue-500/20 text-blue-400 border-blue-500/30"
                        }`}>
                          {tier === "top" ? "T" : "M"}
                        </Badge>
                      )}
                      {sl.label.status === "closed" && (
                        <Badge className="text-[8px] px-1 py-0 shrink-0 bg-red-500/20 text-red-400 border-red-500/30">
                          {locale === "it" ? "chiusa" : "closed"}
                        </Badge>
                      )}
                    </div>
                    <div className="flex items-center gap-2 mt-0.5">
                      {/* Score bar */}
                      <div className="flex-1 h-1 bg-secondary/60 rounded-full overflow-hidden max-w-[100px]">
                        <div
                          className="h-full bg-primary transition-all"
                          style={{ width: `${sl.score}%` }}
                        />
                      </div>
                      <span className="text-[9px] text-muted-foreground font-mono">
                        {sl.score}%
                      </span>
                      <span className="text-[9px] text-muted-foreground/60 truncate">
                        {sl.matchCount} {locale === "it" ? "tracce" : "tracks"}
                        {sl.bestGenre && ` · ${sl.bestGenre}`}
                        {rank && ` · #${rank}`}
                      </span>
                    </div>
                  </div>
                  {onSelectLabel && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="h-7 text-[10px] shrink-0 text-primary hover:bg-primary/10"
                      onClick={() => onSelectLabel(sl.label)}
                      title={locale === "it"
                        ? `Usa ${sl.label.name} come destinazione della demo`
                        : `Use ${sl.label.name} as this demo's target`}
                    >
                      <ChevronRight className="h-3 w-3" />
                    </Button>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Artists section */}
      {artistCount > 0 && (
        <div className="space-y-1.5">
          <div className="flex items-center gap-1.5">
            <Users className="h-3.5 w-3.5 text-cyan-400" />
            <p className="text-[10px] text-muted-foreground uppercase tracking-wider font-medium">
              {locale === "it" ? "Artisti simili (peer)" : "Similar artists (peers)"}
            </p>
            <span className="text-[10px] text-muted-foreground/60 ml-auto">{artistCount}</span>
          </div>
          <div className="space-y-1 max-h-64 overflow-y-auto pr-1">
            {result.artists.map((sa, idx) => (
              <div
                key={sa.artist.id}
                className="flex items-center gap-2 rounded-md border border-border/30 bg-card/60 p-2 hover:bg-secondary/40 hover:border-primary/30 transition-colors group"
              >
                <span className="text-[10px] font-mono text-muted-foreground shrink-0 w-5 text-right">
                  {idx + 1}
                </span>
                {sa.artist.imageUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={sa.artist.imageUrl}
                    alt=""
                    className="h-6 w-6 shrink-0 rounded-full object-cover"
                    loading="lazy"
                  />
                ) : (
                  <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-secondary/50">
                    <Users className="h-3 w-3 text-muted-foreground" />
                  </div>
                )}
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => onOpenArtist?.(sa.artist.id)}
                      className="text-xs font-medium text-foreground hover:text-primary hover:underline truncate max-w-[140px] cursor-pointer bg-transparent border-0 p-0 text-left"
                      title={locale === "it"
                        ? `Apri la pagina di ${sa.artist.name}`
                        : `Open ${sa.artist.name}'s page`}
                    >
                      {sa.artist.name}
                    </button>
                    {sa.artist.trending && (
                      <TrendingUp className="h-3 w-3 text-orange-400 shrink-0" />
                    )}
                  </div>
                  <div className="flex items-center gap-2 mt-0.5">
                    <div className="flex-1 h-1 bg-secondary/60 rounded-full overflow-hidden max-w-[100px]">
                      <div
                        className="h-full bg-cyan-400 transition-all"
                        style={{ width: `${sa.score}%` }}
                      />
                    </div>
                    <span className="text-[9px] text-muted-foreground font-mono">
                      {sa.score}%
                    </span>
                    <span className="text-[9px] text-muted-foreground/60 truncate">
                      {sa.matchCount} {locale === "it" ? "tracce" : "tracks"}
                      {sa.bestPosition !== null && ` · best #${sa.bestPosition}`}
                    </span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <p className="text-[9px] text-muted-foreground/60 leading-tight">
        {locale === "it"
          ? "Match basato su BPM (±5), chiave compatibile (Camelot) e genere. Il punteggio pesa anche la posizione in classifica delle tracce simili."
          : "Matched by BPM (±5), compatible key (Camelot), and genre. Score also weights the chart position of similar tracks."}
      </p>
    </div>
  );
}
