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
  CheckCircle2,
  XCircle,
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
  // RP-005 review: stato per beta feedback, aiuta a migliorare il Musical Interest Engine
  {
    id: "not_interested",
    labelIt: "Non interessante",
    labelEn: "Not interesting",
    color: "text-red-400",
    bgColor: "bg-red-500/15",
  },
];

// 🔒 RP-005 review: Missione giornaliera — default 10 target
const DAILY_MISSION_SIZE = 10;

// ==================== SEARCH URL HELPERS ====================

function buildGoogleSearchUrl(artistName: string, querySuffix: string): string {
  const query = `"${artistName}" ${querySuffix}`;
  return `https://www.google.com/search?q=${encodeURIComponent(query)}`;
}

/**
 * Normalizza un nome artista in un handle Instagram plausibile:
 * lowercase, rimuove spazi e caratteri speciali, lascia solo [a-z0-9._].
 * Es. "Bart Skils" → "bartskils", "K?D" → "kd", "Deadmau5" → "deadmau5"
 */
function normalizeForInstagramHandle(name: string): string {
  return (name || "")
    .toLowerCase()
    .replace(/[^a-z0-9._]/g, "")
    .trim();
}

/**
 * Costruisce URL Instagram diretto: instagram.com/<handle>
 * Se il nome normalizzato è vuoto, ritorna null (fallback a Google).
 */
function buildInstagramDirectUrl(artistName: string): string | null {
  const handle = normalizeForInstagramHandle(artistName);
  if (!handle) return null;
  return `https://www.instagram.com/${handle}/`;
}

// ==================== COMPONENT ====================

interface PromotionWorkspaceProps {
  release: Release;
  targets: ScoredArtist[];
  locale: Locale;
}

export function PromotionWorkspace({ release, targets, locale }: PromotionWorkspaceProps) {
  // 🔒 RP-005 review: Missione giornaliera — solo i primi DAILY_MISSION_SIZE target
  const dailyMission = useMemo(() => targets.slice(0, DAILY_MISSION_SIZE), [targets]);

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

      // 🔒 RP-005 review: all'apertura, salta al primo target non lavorato
      // (status pending o assente). Se tutti lavorati, resta sul primo.
      if (mounted && dailyMission.length > 0) {
        const firstUnworked = dailyMission.findIndex(
          (t) => !map[t.artist.id] || map[t.artist.id] === "pending"
        );
        if (firstUnworked >= 0) {
          setCurrentIndex(firstUnworked);
        }
      }
    });
    return () => { mounted = false; };
  }, [release.id, dailyMission]);

  const currentTarget = dailyMission[currentIndex];
  const currentArtistId = currentTarget?.artist.id;
  const currentStatus = currentArtistId ? (statuses[currentArtistId] || "pending") : "pending";

  // 🔒 RP-005 review: verifica se la missione giornaliera è completata
  // Tutti i target della missione hanno uno stato != "pending"
  const missionComplete = useMemo(() => {
    if (dailyMission.length === 0) return false;
    return dailyMission.every((t) => {
      const s = statuses[t.artist.id];
      return s && s !== "pending";
    });
  }, [dailyMission, statuses]);

  // Statistiche progresso (sulla missione giornaliera)
  const progress = useMemo(() => {
    const total = dailyMission.length;
    const contacted = dailyMission.filter(t => statuses[t.artist.id] && statuses[t.artist.id] !== "pending").length;
    const replied = dailyMission.filter(t => statuses[t.artist.id] === "replied" || statuses[t.artist.id] === "supported").length;
    const notInterested = dailyMission.filter(t => statuses[t.artist.id] === "not_interested").length;
    return { total, contacted, replied, notInterested };
  }, [dailyMission, statuses]);

  const handleStatusChange = useCallback((newStatus: PromotionStatus) => {
    if (!currentArtistId) return;
    setStatuses(prev => ({ ...prev, [currentArtistId]: newStatus }));
  }, [currentArtistId]);

  /**
   * 🔒 RP-006 — APRI INSTAGRAM & AVANZA
   * Un solo click per fare 4 cose in sequenza:
   *   1. Aprire Instagram (URL diretto o fallback Google search)
   *   2. Impostare lo stato a "DM inviato"
   *   3. Salvare su Supabase
   *   4. Passare al miglior target successivo non lavorato
   *
   * Riduce la sequenza operativa da 5 step a 1 click per target.
   */
  const handleOpenInstagramAndAdvance = useCallback(async () => {
    if (!currentTarget || !currentArtistId) return;

    // 1. Apri Instagram — diretto se possibile, fallback Google
    const directUrl = buildInstagramDirectUrl(currentTarget.artist.name);
    const googleUrl = buildGoogleSearchUrl(currentTarget.artist.name, "instagram");
    const url = directUrl || googleUrl;
    window.open(url, "_blank", "noopener,noreferrer");

    // 2. Imposta stato DM inviato
    const newStatus: PromotionStatus = "dm_sent";
    const updatedStatuses = { ...statuses, [currentArtistId]: newStatus };
    setStatuses(updatedStatuses);

    // 3. Salva su Supabase (non bloccante per l'UX)
    setSaving(true);
    const ok = await apiUpsertPromotionTarget({
      release_id: release.id,
      artist_id: currentArtistId,
      artist_name: currentTarget.artist.name,
      status: newStatus,
    });
    setSaving(false);

    if (ok) {
      setSavedFlash(true);
      setTimeout(() => setSavedFlash(false), 1500);

      // 4. Passa al miglior target non lavorato
      const nextIdx = dailyMission.findIndex(
        (t) => !updatedStatuses[t.artist.id] || updatedStatuses[t.artist.id] === "pending"
      );
      if (nextIdx >= 0 && nextIdx !== currentIndex) {
        setCurrentIndex(nextIdx);
      }
    }
  }, [currentTarget, currentArtistId, release.id, statuses, dailyMission, currentIndex]);

  // 🔒 RP-005 review: SALVA E PASSA AL PROSSIMO apre il MIGLIOR target
  // ancora non lavorato. Poiché dailyMission è ordinata per score decrescente,
  // il primo target con status pending/assente è il miglior target non lavorato.
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

      // Aggiorna lo stato locale SUBITO così findBestUnworked lo vede
      const updatedStatuses = { ...statuses, [currentArtistId]: currentStatus };
      setStatuses(updatedStatuses);

      // Trova il miglior target non lavorato (primo con status pending/assente)
      const nextIdx = dailyMission.findIndex(
        (t) => !updatedStatuses[t.artist.id] || updatedStatuses[t.artist.id] === "pending"
      );

      if (nextIdx >= 0 && nextIdx !== currentIndex) {
        setCurrentIndex(nextIdx);
      }
      // Se nextIdx === -1, la missione è completata — la UI mostrerà la completion screen
    }
  }, [currentTarget, currentArtistId, currentStatus, release.id, currentIndex, dailyMission, statuses]);

  const handlePrev = useCallback(() => {
    if (currentIndex > 0) setCurrentIndex(currentIndex - 1);
  }, [currentIndex]);

  const handleNext = useCallback(() => {
    if (currentIndex < dailyMission.length - 1) setCurrentIndex(currentIndex + 1);
  }, [currentIndex, dailyMission.length]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (dailyMission.length === 0) {
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

  // 🔒 RP-005 review: Schermata MISSIONE COMPLETATA
  if (missionComplete) {
    return (
      <Card className="bg-card/60 border-border/40">
        <CardContent className="p-8 text-center space-y-5">
          <CheckCircle2 className="h-14 w-14 text-emerald-400 mx-auto" />
          <div className="space-y-1">
            <h2 className="text-lg font-bold text-foreground">
              {locale === "it" ? "Missione di oggi completata!" : "Today's mission complete!"}
            </h2>
            <p className="text-sm text-muted-foreground">
              {locale === "it"
                ? `Hai lavorato su tutti i ${dailyMission.length} target della missione giornaliera.`
                : `You've worked on all ${dailyMission.length} targets of the daily mission.`}
            </p>
          </div>

          {/* Riepilogo */}
          <div className="grid grid-cols-3 gap-3 max-w-md mx-auto pt-2">
            <div className="space-y-1 p-3 rounded-lg bg-secondary/30 border border-border/30">
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
                {locale === "it" ? "Contattati" : "Contacted"}
              </p>
              <p className="text-xl font-bold text-blue-400">
                {progress.contacted - progress.notInterested}
              </p>
            </div>
            <div className="space-y-1 p-3 rounded-lg bg-emerald-500/5 border border-emerald-500/20">
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
                {locale === "it" ? "Risposte" : "Replies"}
              </p>
              <p className="text-xl font-bold text-emerald-400">{progress.replied}</p>
            </div>
            <div className="space-y-1 p-3 rounded-lg bg-red-500/5 border border-red-500/20">
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
                {locale === "it" ? "Non interessanti" : "Not interesting"}
              </p>
              <p className="text-xl font-bold text-red-400">{progress.notInterested}</p>
            </div>
          </div>

          <p className="text-xs text-muted-foreground italic pt-2">
            {locale === "it"
              ? "Torna domani per una nuova missione, o continua a lavorare sui target della missione."
              : "Come back tomorrow for a new mission, or keep working on the mission targets."}
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {/* === HEADER WORKSPACE === */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h2 className="text-sm font-semibold uppercase tracking-wider text-primary">
            {locale === "it" ? "Missione di Oggi" : "Today's Mission"}
          </h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            {locale === "it" ? "Target" : "Target"} {currentIndex + 1} {locale === "it" ? "di" : "of"} {dailyMission.length}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="text-xs text-muted-foreground">
            {locale === "it" ? "Lavorati" : "Worked"}: <span className="font-semibold text-foreground">{progress.contacted}</span>/{progress.total}
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
            disabled={currentIndex === dailyMission.length - 1}
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
          onOpenInstagramAndAdvance={handleOpenInstagramAndAdvance}
          saving={saving}
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
            disabled={saving}
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

      {/* Se all'ultimo target della missione, mostra messaggio */}
      {currentIndex === dailyMission.length - 1 && (
        <p className="text-center text-xs text-muted-foreground">
          {locale === "it"
            ? "Ultimo target della missione di oggi."
            : "Last target of today's mission."}
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
  onOpenInstagramAndAdvance: () => void;
  saving: boolean;
  locale: Locale;
}

function TargetCard({ target, status, onStatusChange, onOpenInstagramAndAdvance, saving, locale }: TargetCardProps) {
  const { artist, priority, confidenceLabel, confidence, reasons } = target;
  const meta = PRIORITY_LABELS[priority];
  const confMeta = CONFIDENCE_LABELS[confidenceLabel];
  const beatportUrl = getArtistBeatportUrl(artist);
  const instagramDirectUrl = buildInstagramDirectUrl(artist.name);

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

        {/* === RP-006: APRI INSTAGRAM & AVANZA (azione primaria) === */}
        <div className="space-y-2">
          <Button
            onClick={onOpenInstagramAndAdvance}
            disabled={saving}
            className="w-full h-12 gap-2 text-sm font-semibold"
            size="lg"
          >
            {saving ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <>
                <Instagram className="h-5 w-5" />
                {locale === "it" ? "APRI INSTAGRAM & AVANZA" : "OPEN INSTAGRAM & ADVANCE"}
                <ArrowRight className="h-4 w-4 ml-1" />
              </>
            )}
          </Button>
          <p className="text-[10px] text-muted-foreground text-center">
            {instagramDirectUrl
              ? (locale === "it"
                  ? "Apre il profilo diretto · salva · passa al prossimo"
                  : "Opens direct profile · saves · moves to next")
              : (locale === "it"
                  ? "Nome non standardizzato · apre ricerca Google · salva · passa al prossimo"
                  : "Non-standard name · opens Google search · saves · moves to next")}
          </p>
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
