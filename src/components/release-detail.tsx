"use client";

/**
 * 🔒 RP-001 — Release Detail con Top Targets
 *
 * Vista dedicata per una release. Mostra:
 *   - Header (titolo, artisti, genere, tracce)
 *   - Sezione TOP TARGETS: lista ordinata di artisti compatibili,
 *     bucket per priorità (🔥 Massima / 🟢 Alta / 🟡 Media / ⚪ Bassa),
 *     con motivazione leggibile e bottone "Apri su Beatport".
 *
 * Business goal: aiutare il Producer a decidere chi contattare OGGI.
 * Lo score numerico è interno, la UI mostra solo bucket + motivazione.
 *
 * Nessuna chiamata di rete, nessuna nuova tabella. Tutto client-side,
 * usa esclusivamente artists cached in IndexedDB via store.
 */

import React, { useMemo, useState } from "react";
import { useAppStore, type Release } from "@/lib/store";
import { t, type Locale } from "@/lib/i18n";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  ArrowLeft,
  ExternalLink,
  Music2,
  Users,
  Sparkles,
  TrendingUp,
  Calendar,
  ThumbsUp,
  ThumbsDown,
  Check,
} from "lucide-react";
import {
  calculateTopTargets,
  getArtistBeatportUrl,
  PRIORITY_LABELS,
  CONFIDENCE_LABELS,
  summarizeByPriority,
  summarizeByConfidence,
  type ScoredArtist,
  type PriorityBucket,
  type ConfidenceLabel,
} from "@/lib/target-scoring";

// Ordine di visualizzazione dei bucket in UI
const PRIORITY_ORDER: PriorityBucket[] = ["max", "high", "medium", "low"];
const CONFIDENCE_ORDER: ConfidenceLabel[] = ["alta", "media", "bassa"];

interface ReleaseDetailProps {
  releaseId: string;
  onBack: () => void;
}

export function ReleaseDetail({ releaseId, onBack }: ReleaseDetailProps) {
  const locale = useAppStore((s) => s.locale) as Locale;
  const releases = useAppStore((s) => s.releases) as Release[] | undefined;
  const artists = useAppStore((s) => s.artists) || [];
  const demos = useAppStore((s) => s.demos) || [];
  const setSelectedArtistId = useAppStore((s) => s.setSelectedArtistId);
  const setActiveTab = useAppStore((s) => s.setActiveTab);

  const release = useMemo(
    () => (releases || []).find((r) => r.id === releaseId),
    [releases, releaseId]
  );

  // Calcolo top targets con Musical Interest Score
  const topTargets = useMemo<ScoredArtist[]>(() => {
    if (!release) return [];
    return calculateTopTargets(release, artists);
  }, [release, artists]);

  const summary = useMemo(() => summarizeByPriority(topTargets), [topTargets]);
  const confidenceSummary = useMemo(() => summarizeByConfidence(topTargets), [topTargets]);

  // Funnel metrics per la Mission
  const funnel = useMemo(() => {
    const analyzed = artists.length;
    const compatible = topTargets.length;
    const highInterest = topTargets.filter(t => t.score >= 60).length;
    const priority = topTargets.filter(t => t.priority === "max" || t.priority === "high").length;
    return { analyzed, compatible, highInterest, priority };
  }, [artists.length, topTargets]);

  // Demo appartenenti alla release (per mostrare le tracce)
  const releaseDemos = useMemo(() => {
    if (!release) return [];
    return demos.filter((d) => release.trackIds?.includes(d.id));
  }, [release, demos]);

  if (!release) {
    return (
      <div className="p-6 text-center text-muted-foreground">
        <p>Release non trovata.</p>
        <Button variant="ghost" size="sm" onClick={onBack} className="mt-3">
          <ArrowLeft className="h-4 w-4 mr-1.5" /> Torna indietro
        </Button>
      </div>
    );
  }

  const handleOpenArtist = (artistId: string) => {
    setSelectedArtistId(artistId);
    setActiveTab("artists");
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const handleOpenBeatport = (url: string) => {
    window.open(url, "_blank", "noopener,noreferrer");
  };

  return (
    <div className="space-y-6 max-w-5xl mx-auto">
      {/* ============ HEADER ============ */}
      <div className="space-y-3">
        <Button
          variant="ghost"
          size="sm"
          onClick={onBack}
          className="text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4 mr-1.5" />
          {locale === "it" ? "Indietro" : "Back"}
        </Button>

        <div className="flex flex-col gap-2">
          <h1 className="text-2xl font-bold tracking-tight">{release.title}</h1>
          <div className="flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
            {release.artists && release.artists.length > 0 && (
              <span className="flex items-center gap-1.5">
                <Users className="h-3.5 w-3.5" />
                {release.artists.join(", ")}
              </span>
            )}
            {release.genre && (
              <Badge variant="secondary" className="font-mono text-xs">
                {release.genre}
              </Badge>
            )}
            <span className="flex items-center gap-1.5">
              <Music2 className="h-3.5 w-3.5" />
              {releaseDemos.length} {locale === "it" ? "tracce" : "tracks"}
            </span>
            {release.type === "ep" && (
              <Badge variant="outline" className="text-xs">EP</Badge>
            )}
          </div>
          {release.notes && (
            <p className="text-sm text-muted-foreground italic">{release.notes}</p>
          )}
        </div>
      </div>

      {/* ============ FUNNEL MISSIONE PROMOZIONE ============ */}
      <Card className="bg-card/60 border-border/40">
        <CardContent className="p-6">
          <div className="flex items-center gap-2 mb-4">
            <Sparkles className="h-4 w-4 text-primary" />
            <h2 className="text-sm font-semibold uppercase tracking-wider">
              {locale === "it" ? "Missione Promozione" : "Promotion Mission"}
            </h2>
          </div>

          {/* Funnel metrics */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-5">
            <FunnelMetric
              label={locale === "it" ? "Analizzati" : "Analyzed"}
              value={funnel.analyzed}
              color="text-muted-foreground"
            />
            <FunnelMetric
              label={locale === "it" ? "Compatibili" : "Compatible"}
              value={funnel.compatible}
              color="text-blue-400"
            />
            <FunnelMetric
              label={locale === "it" ? "Alto interesse" : "High interest"}
              value={funnel.highInterest}
              color="text-emerald-400"
            />
            <FunnelMetric
              label={locale === "it" ? "Prioritari" : "Priority"}
              value={funnel.priority}
              color="text-red-400"
            />
          </div>

          {/* Riepilogo bucket interesse + confidence */}
          {topTargets.length > 0 && (
            <div className="space-y-2 mb-5 text-xs">
              {/* Interesse */}
              <div className="flex flex-wrap gap-2">
                <span className="text-[10px] uppercase tracking-wider text-muted-foreground self-center mr-1">
                  {locale === "it" ? "Interesse:" : "Interest:"}
                </span>
                {PRIORITY_ORDER.map((bucket) => {
                  const count = summary[bucket];
                  if (count === 0) return null;
                  const meta = PRIORITY_LABELS[bucket];
                  return (
                    <span
                      key={bucket}
                      className={`flex items-center gap-1 px-2 py-1 rounded-md bg-secondary/50 ${meta.color}`}
                    >
                      <span>{meta.icon}</span>
                      <span className="font-medium">{count}</span>
                      <span className="opacity-70 hidden sm:inline">{meta.label}</span>
                    </span>
                  );
                })}
              </div>
              {/* Confidence */}
              <div className="flex flex-wrap gap-2">
                <span className="text-[10px] uppercase tracking-wider text-muted-foreground self-center mr-1">
                  {locale === "it" ? "Confidence:" : "Confidence:"}
                </span>
                {CONFIDENCE_ORDER.map((label) => {
                  const count = confidenceSummary[label];
                  if (count === 0) return null;
                  const meta = CONFIDENCE_LABELS[label];
                  return (
                    <span
                      key={label}
                      className={`flex items-center gap-1 px-2 py-1 rounded-md ${meta.bgClass} ${meta.color}`}
                    >
                      <span className="font-medium uppercase">{label}</span>
                      <span className="opacity-70">{count}</span>
                    </span>
                  );
                })}
              </div>
            </div>
          )}

          {/* Lista target */}
          {topTargets.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <Users className="h-8 w-8 mx-auto mb-2 opacity-30" />
              <p className="text-sm">
                {locale === "it"
                  ? "Nessun target trovato. Assicurati di aver importato le classifiche Beatport recenti."
                  : "No targets found. Make sure you've imported recent Beatport charts."}
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              {topTargets.map((target, idx) => (
                <TargetRow
                  key={target.artist.id}
                  rank={idx + 1}
                  target={target}
                  onOpenArtist={() => handleOpenArtist(target.artist.id)}
                  onOpenBeatport={() => {
                    const url = getArtistBeatportUrl(target.artist);
                    if (url) handleOpenBeatport(url);
                  }}
                  locale={locale}
                />
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* ============ TRACKS ============ */}
      {releaseDemos.length > 0 && (
        <Card className="bg-card/60 border-border/40">
          <CardContent className="p-6">
            <div className="flex items-center gap-2 mb-4">
              <Music2 className="h-4 w-4 text-primary" />
              <h2 className="text-sm font-semibold uppercase tracking-wider">
                {locale === "it" ? "Tracce" : "Tracks"}
              </h2>
            </div>
            <div className="space-y-2">
              {releaseDemos.map((demo, idx) => (
                <div
                  key={demo.id}
                  className="flex items-center gap-3 p-2 rounded-md hover:bg-secondary/30 transition-colors"
                >
                  <span className="text-xs font-mono text-muted-foreground w-6">
                    {String(idx + 1).padStart(2, "0")}
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{demo.trackName}</p>
                    {demo.artists && demo.artists.length > 0 && (
                      <p className="text-xs text-muted-foreground truncate">
                        {demo.artists.join(", ")}
                      </p>
                    )}
                  </div>
                  {demo.status && (
                    <Badge variant="outline" className="text-[10px] uppercase">
                      {demo.status}
                    </Badge>
                  )}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

// ==================== TARGET ROW ====================

interface TargetRowProps {
  rank: number;
  target: ScoredArtist;
  onOpenArtist: () => void;
  onOpenBeatport: () => void;
  locale: Locale;
}

function TargetRow({ rank, target, onOpenArtist, onOpenBeatport, locale }: TargetRowProps) {
  const { artist, priority, confidenceLabel, reasons } = target;
  const meta = PRIORITY_LABELS[priority];
  const confMeta = CONFIDENCE_LABELS[confidenceLabel];
  const beatportUrl = getArtistBeatportUrl(artist);

  // 🔒 Beta feedback — stato locale temporaneo, NESSUN salvataggio.
  // I pulsanti 👍/👎 servono solo per validazione manuale durante la beta.
  // Dopo il click, il bottone resta premuto per feedback visivo.
  const [feedback, setFeedback] = useState<"up" | "down" | null>(null);

  // Generi da mostrare (max 3)
  const genresToShow = (artist.genres || []).slice(0, 3);
  // Label principali (max 3)
  const labelsToShow = (artist.labelsPublishedOn || []).slice(0, 3);

  // Icona attività recente
  const lastSeenDays = artist.lastSeenAt
    ? Math.floor((Date.now() - new Date(artist.lastSeenAt).getTime()) / 86400000)
    : null;
  const isRecent = lastSeenDays !== null && lastSeenDays <= 7;

  return (
    <div className="p-3 rounded-lg border border-border/30 bg-secondary/20 hover:bg-secondary/40 hover:border-border/50 transition-all space-y-2.5">
      {/* === RIGA SUPERIORE: rank + info + meta + azioni === */}
      <div className="flex items-start gap-3">
        {/* Rank */}
        <div className="flex-shrink-0 w-8 text-center pt-0.5">
          <span className="text-sm font-mono text-muted-foreground">#{rank}</span>
        </div>

        {/* Main info */}
        <div className="flex-1 min-w-0 space-y-1.5">
          <div className="flex items-center gap-2 flex-wrap">
            <button
              type="button"
              onClick={onOpenArtist}
              className="text-sm font-semibold hover:text-primary hover:underline transition-colors text-left"
            >
              {artist.name}
            </button>
            {isRecent && (
              <span className="flex items-center gap-0.5 text-[10px] text-emerald-400">
                <Calendar className="h-2.5 w-2.5" />
                {locale === "it" ? "questa sett." : "this week"}
              </span>
            )}
            {artist.trending && (
              <span className="flex items-center gap-0.5 text-[10px] text-amber-400">
                <TrendingUp className="h-2.5 w-2.5" />
                trending
              </span>
            )}
          </div>

          {/* Generi + label */}
          <div className="flex flex-wrap items-center gap-1.5 text-xs">
            {genresToShow.map((g) => (
              <Badge key={g} variant="secondary" className="text-[10px] font-mono px-1.5 py-0">
                {g}
              </Badge>
            ))}
            {labelsToShow.length > 0 && (
              <span className="text-muted-foreground">
                · {labelsToShow.join(" · ")}
              </span>
            )}
          </div>
        </div>

        {/* Priority + Confidence + APRI */}
        <div className="flex flex-col items-end gap-1.5 flex-shrink-0 min-w-[80px]">
          <span className={`flex items-center gap-1 text-[10px] font-medium ${meta.color}`}>
            <span>{meta.icon}</span>
            <span className="hidden sm:inline">{meta.label}</span>
          </span>
          <span
            className={`flex items-center gap-1 text-[10px] font-mono ${confMeta.color}`}
            title={target.confidenceFactors.length > 0 ? target.confidenceFactors.join(" · ") : "Dati limitati"}
          >
            <span className="opacity-60 text-[9px] uppercase">conf</span>
            <span className="font-semibold">{target.confidence}%</span>
          </span>
          {beatportUrl && (
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={onOpenBeatport}
              className="h-6 px-2 text-[10px] gap-1"
            >
              <ExternalLink className="h-2.5 w-2.5" />
              {locale === "it" ? "Apri" : "Open"}
            </Button>
          )}
        </div>
      </div>

      {/* === SEZIONE "PERCHÉ È STATO SELEZIONATO" === */}
      {reasons.length > 0 && (
        <div className="pl-11 pr-2 py-2 rounded-md bg-primary/5 border border-primary/15">
          <p className="text-[9px] uppercase tracking-wider font-semibold text-primary/80 mb-1.5">
            {locale === "it" ? "Perché è stato selezionato" : "Why selected"}
          </p>
          <ul className="space-y-1">
            {reasons.map((reason, idx) => (
              <li key={idx} className="flex items-start gap-1.5 text-xs text-foreground/80">
                <Check className="h-3 w-3 text-emerald-400 flex-shrink-0 mt-0.5" />
                <span>{reason}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* === BETA FEEDBACK — temporaneo, no salvataggio === */}
      <div className="flex items-center justify-end gap-2 pl-11">
        <span className="text-[9px] uppercase tracking-wider text-muted-foreground/60 mr-1">
          {locale === "it" ? "Beta feedback" : "Beta feedback"}
        </span>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          onClick={() => setFeedback(feedback === "up" ? null : "up")}
          className={`h-6 px-2 text-[10px] gap-1 ${
            feedback === "up"
              ? "bg-emerald-500/20 text-emerald-400"
              : "text-muted-foreground hover:text-emerald-400 hover:bg-emerald-500/10"
          }`}
          title="Target corretto"
        >
          <ThumbsUp className="h-3 w-3" />
        </Button>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          onClick={() => setFeedback(feedback === "down" ? null : "down")}
          className={`h-6 px-2 text-[10px] gap-1 ${
            feedback === "down"
              ? "bg-red-500/20 text-red-400"
              : "text-muted-foreground hover:text-red-400 hover:bg-red-500/10"
          }`}
          title="Non interessante"
        >
          <ThumbsDown className="h-3 w-3" />
        </Button>
      </div>
    </div>
  );
}

// ==================== FUNNEL METRIC ====================

interface FunnelMetricProps {
  label: string;
  value: number;
  color: string;
}

function FunnelMetric({ label, value, color }: FunnelMetricProps) {
  return (
    <div className="space-y-1 p-3 rounded-lg bg-secondary/30 border border-border/30">
      <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
        {label}
      </p>
      <p className={`text-xl font-bold ${color}`}>{value}</p>
    </div>
  );
}
