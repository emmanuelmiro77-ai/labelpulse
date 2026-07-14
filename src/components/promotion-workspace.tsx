"use client";

/**
 * 🔒 RP-005 — Promotion Workspace
 *
 * Workspace sequenziale per promuovere una release target per target.
 * Per ogni target mostra:
 *   - Nome artista
 *   - Interesse musicale (bucket + confidence)
 *   - Motivazioni (reasons)
 *   - Cerca Instagram (Google search)
 *   - Cerca Website (Google search)
 *   - Beatport (URL diretto)
 *   - Stato operativo (5 stati)
 *   - SALVA E PASSA AL PROSSIMO
 *
 * Lo stato è persistito in Supabase (tabella promotion_targets).
 * Cloud First, Regola Zero rispettati.
 */

import React, { useState, useEffect, useMemo, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  ArrowLeft,
  ArrowRight,
  ExternalLink,
  Instagram,
  Globe,
  Music2,
  Check,
  Loader2,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import {
  type ScoredArtist,
  type InterestBucket,
  getArtistBeatportUrl,
  PRIORITY_LABELS,
  CONFIDENCE_LABELS,
} from "@/lib/target-scoring";
import {
  type PromotionStatus,
  type PromotionTargetRow,
  apiFetchPromotionTargets,
  apiUpsertPromotionTarget,
} from "@/lib/api-client";
import type { Locale } from "@/lib/i18n";
import type { Release } from "@/lib/store";

// ==================== STATUS CONFIG ====================

interface StatusConfig {
  id: PromotionStatus;
  labelIt: string;
  labelEn: string;
  color: string;
  bgColor: string;
}

const STATUS_CONFIGS: StatusConfig[] = [
  {
    id: "pending",
    labelIt: "Da contattare",
    labelEn: "To contact",
    color: "text-muted-foreground",
    bgColor: "bg-secondary/50",
  },
  {
    id: "dm_sent",
    labelIt: "DM inviato",
    labelEn: "DM sent",
    color: "text-blue-400",
    bgColor: "bg-blue-500/15",
  },
  {
    id: "waiting",
    labelIt: "In attesa",
    labelEn: "Waiting",
    color: "text-amber-400",
    bgColor: "bg-amber-500/15",
  },
  {
    id: "replied",
    labelIt: "Ha risposto",
    labelEn: "Replied",
    color: "text-cyan-400",
    bgColor: "bg-cyan-500/15",
  },
  {
    id: "supported",
    labelIt: "Supporto ricevuto",
    labelEn: "Support received",
    color: "text-emerald-400",
    bgColor: "bg-emerald-500/15",
  },
];

// ==================== SEARCH URL HELPERS ====================

function buildGoogleSearchUrl(artistName: string, querySuffix: string): string {
  const query = `"${artistName}" ${querySuffix}`;
  return `https://www.google.com/search?q=${encodeURIComponent(query)}`;
}

// ==================== COMPONENT ====================

interface PromotionWorkspaceProps {
  release: Release;
  targets: ScoredArtist[];
  locale: Locale;
}

export function PromotionWorkspace({ release, targets, locale }: PromotionWorkspaceProps) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [statuses, setStatuses] = useState<Record<string, PromotionStatus>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [savedFlash, setSavedFlash] = useState(false);

  // Carica stati esistenti da Supabase
  useEffect(() => {
    let mounted = true;
    setLoading(true);
    apiFetchPromotionTargets(release.id).then((rows) => {
      if (!mounted) return;
      const map: Record<string, PromotionStatus> = {};
      for (const row of rows || []) {
        map[row.artist_id] = row.status;
      }
      setStatuses(map);
      setLoading(false);
    });
    return () => { mounted = false; };
  }, [release.id]);

  const currentTarget = targets[currentIndex];
  const currentArtistId = currentTarget?.artist.id;
  const currentStatus = currentArtistId ? (statuses[currentArtistId] || "pending") : "pending";

  // Statistiche progresso
  const progress = useMemo(() => {
    const total = targets.length;
    const contacted = targets.filter(t => statuses[t.artist.id] && statuses[t.artist.id] !== "pending").length;
    const replied = targets.filter(t => statuses[t.artist.id] === "replied" || statuses[t.artist.id] === "supported").length;
    return { total, contacted, replied };
  }, [targets, statuses]);

  const handleStatusChange = useCallback((newStatus: PromotionStatus) => {
    if (!currentArtistId) return;
    setStatuses(prev => ({ ...prev, [currentArtistId]: newStatus }));
  }, [currentArtistId]);

  const handleSaveAndNext = useCallback(async () => {
    if (!currentTarget || !currentArtistId) return;
    setSaving(true);
    const ok = await apiUpsertPromotionTarget({
      release_id: release.id,
      artist_id: currentArtistId,
      artist_name: currentTarget.artist.name,
      status: currentStatus,
    });
    setSaving(false);
    if (ok) {
      setSavedFlash(true);
      setTimeout(() => setSavedFlash(false), 1500);
      // Passa al prossimo
      if (currentIndex < targets.length - 1) {
        setCurrentIndex(currentIndex + 1);
      }
    }
  }, [currentTarget, currentArtistId, currentStatus, release.id, currentIndex, targets.length]);

  const handlePrev = useCallback(() => {
    if (currentIndex > 0) setCurrentIndex(currentIndex - 1);
  }, [currentIndex]);

  const handleNext = useCallback(() => {
    if (currentIndex < targets.length - 1) setCurrentIndex(currentIndex + 1);
  }, [currentIndex, targets.length]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (targets.length === 0) {
    return (
      <div className="text-center py-8 text-muted-foreground">
        <p className="text-sm">
          {locale === "it"
            ? "Nessun target disponibile per questa release."
            : "No targets available for this release."}
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* === HEADER WORKSPACE === */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h2 className="text-sm font-semibold uppercase tracking-wider text-primary">
            {locale === "it" ? "Promotion Workspace" : "Promotion Workspace"}
          </h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            {locale === "it" ? "Target" : "Target"} {currentIndex + 1} {locale === "it" ? "di" : "of"} {targets.length}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="text-xs text-muted-foreground">
            {locale === "it" ? "Contattati" : "Contacted"}: <span className="font-semibold text-foreground">{progress.contacted}</span>/{progress.total}
            {" · "}
            {locale === "it" ? "Risposte" : "Replies"}: <span className="font-semibold text-emerald-400">{progress.replied}</span>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={handlePrev}
            disabled={currentIndex === 0}
            className="h-7 px-2"
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={handleNext}
            disabled={currentIndex === targets.length - 1}
            className="h-7 px-2"
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* === PROGRESS BAR === */}
      <div className="h-1 rounded-full bg-secondary/50 overflow-hidden">
        <div
          className="h-full bg-primary transition-all duration-300"
          style={{ width: `${progress.total > 0 ? (progress.contacted / progress.total) * 100 : 0}%` }}
        />
      </div>

      {/* === TARGET CORRENTE === */}
      {currentTarget && (
        <TargetCard
          target={currentTarget}
          status={currentStatus}
          onStatusChange={handleStatusChange}
          locale={locale}
        />
      )}

      {/* === SALVA E PASSA AL PROSSIMO === */}
      <div className="flex items-center justify-between gap-3">
        {savedFlash && (
          <span className="text-xs text-emerald-400 flex items-center gap-1 animate-pulse">
            <Check className="h-3 w-3" />
            {locale === "it" ? "Salvato!" : "Saved!"}
          </span>
        )}
        <div className="ml-auto">
          <Button
            onClick={handleSaveAndNext}
            disabled={saving || currentIndex === targets.length - 1}
            className="gap-2"
          >
            {saving ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <>
                {locale === "it" ? "SALVA E PASSA AL PROSSIMO" : "SAVE AND NEXT"}
                <ArrowRight className="h-4 w-4" />
              </>
            )}
          </Button>
        </div>
      </div>

      {/* Se all'ultimo target, mostra messaggio */}
      {currentIndex === targets.length - 1 && (
        <p className="text-center text-xs text-muted-foreground">
          {locale === "it"
            ? "Ultimo target della lista."
            : "Last target in the list."}
        </p>
      )}
    </div>
  );
}

// ==================== TARGET CARD ====================

interface TargetCardProps {
  target: ScoredArtist;
  status: PromotionStatus;
  onStatusChange: (status: PromotionStatus) => void;
  locale: Locale;
}

function TargetCard({ target, status, onStatusChange, locale }: TargetCardProps) {
  const { artist, priority, confidenceLabel, confidence, reasons } = target;
  const meta = PRIORITY_LABELS[priority];
  const confMeta = CONFIDENCE_LABELS[confidenceLabel];
  const beatportUrl = getArtistBeatportUrl(artist);

  const genresToShow = (artist.genres || []).slice(0, 3);
  const labelsToShow = (artist.labelsPublishedOn || []).slice(0, 3);

  const openUrl = (url: string) => {
    window.open(url, "_blank", "noopener,noreferrer");
  };

  return (
    <Card className="bg-card/60 border-border/40">
      <CardContent className="p-5 space-y-4">
        {/* === NOME + INTERESSE === */}
        <div className="flex items-start justify-between gap-3">
          <div className="space-y-1 min-w-0 flex-1">
            <h3 className="text-lg font-bold truncate">{artist.name}</h3>
            <div className="flex flex-wrap items-center gap-1.5 text-xs">
              {genresToShow.map((g) => (
                <Badge key={g} variant="secondary" className="text-[10px] font-mono">
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
          <div className="flex flex-col items-end gap-1 flex-shrink-0">
            <span className={`flex items-center gap-1 text-xs font-medium ${meta.color}`}>
              <span>{meta.icon}</span>
              <span>{meta.label}</span>
            </span>
            <span className={`text-xs font-mono ${confMeta.color}`}>
              conf {confidence}%
            </span>
          </div>
        </div>

        {/* === MOTIVAZIONI === */}
        {reasons.length > 0 && (
          <div className="rounded-md bg-primary/5 border border-primary/15 p-3">
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

        {/* === RICERCA RAPIDA === */}
        <div>
          <p className="text-[9px] uppercase tracking-wider font-semibold text-muted-foreground mb-2">
            {locale === "it" ? "Ricerca rapida" : "Quick search"}
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => openUrl(buildGoogleSearchUrl(artist.name, "instagram"))}
              className="justify-start gap-2 text-xs h-9"
            >
              <Instagram className="h-3.5 w-3.5 text-pink-400 flex-shrink-0" />
              <span>Cerca Instagram</span>
              <ExternalLink className="h-3 w-3 ml-auto opacity-50 flex-shrink-0" />
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => openUrl(buildGoogleSearchUrl(artist.name, "official website"))}
              className="justify-start gap-2 text-xs h-9"
            >
              <Globe className="h-3.5 w-3.5 text-blue-400 flex-shrink-0" />
              <span>Cerca Website</span>
              <ExternalLink className="h-3 w-3 ml-auto opacity-50 flex-shrink-0" />
            </Button>
            {beatportUrl ? (
              <Button
                variant="outline"
                size="sm"
                onClick={() => openUrl(beatportUrl)}
                className="justify-start gap-2 text-xs h-9"
              >
                <Music2 className="h-3.5 w-3.5 text-emerald-400 flex-shrink-0" />
                <span>Beatport</span>
                <ExternalLink className="h-3 w-3 ml-auto opacity-50 flex-shrink-0" />
              </Button>
            ) : (
              <Button
                variant="outline"
                size="sm"
                onClick={() => openUrl(buildGoogleSearchUrl(artist.name, "beatport"))}
                className="justify-start gap-2 text-xs h-9"
              >
                <Music2 className="h-3.5 w-3.5 text-emerald-400 flex-shrink-0" />
                <span>Cerca Beatport</span>
                <ExternalLink className="h-3 w-3 ml-auto opacity-50 flex-shrink-0" />
              </Button>
            )}
          </div>
        </div>

        {/* === STATO OPERATIVO === */}
        <div>
          <p className="text-[9px] uppercase tracking-wider font-semibold text-muted-foreground mb-2">
            {locale === "it" ? "Stato promozione" : "Promotion status"}
          </p>
          <div className="flex flex-wrap gap-2">
            {STATUS_CONFIGS.map((config) => {
              const isActive = status === config.id;
              const label = locale === "it" ? config.labelIt : config.labelEn;
              return (
                <button
                  key={config.id}
                  type="button"
                  onClick={() => onStatusChange(config.id)}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-all border ${
                    isActive
                      ? `${config.bgColor} ${config.color} border-current`
                      : "bg-secondary/30 text-muted-foreground border-border/30 hover:bg-secondary/50"
                  }`}
                >
                  <span className="text-[10px]">{isActive ? "●" : "○"}</span>
                  {label}
                </button>
              );
            })}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
