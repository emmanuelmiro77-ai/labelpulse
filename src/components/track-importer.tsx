"use client";

/**
 * 🔒 RP-008 + RP-010 — Track Importer con estrazione metadati
 *
 * Workflow:
 *   1. Utente incolla URL PromoLink (o qualsiasi URL)
 *   2. Premere IMPORTA
 *   3. Frontend chiama /api/promolink-import
 *   4. Se metadati estratti:
 *      - crea automaticamente la Release con title, artists, label, genre,
 *        cover, beatportUrl, spotifyUrl, promoLink, sourceUrl
 *      - mostra la scheda completa con tutti i metadati
 *      - abilita 🎯 TROVA DJ
 *   5. Se import fallisce: mostra il motivo tecnico
 *
 * NON apre automaticamente il Promotion Workspace.
 * L'utente vede la scheda e decide quando cliccare TROVA DJ.
 */

import React, { useState } from "react";
import { useAppStore, type Release } from "@/lib/store";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Rocket,
  Loader2,
  Link as LinkIcon,
  AlertCircle,
  CheckCircle2,
  Music2,
  Disc3,
  Globe,
  ExternalLink,
} from "lucide-react";

// ==================== TYPES ====================

interface ExtractedMetadata {
  title: string | null;
  artists: string[];
  label: string | null;
  genre: string | null;
  cover: string | null;
  beatportUrl: string | null;
  spotifyUrl: string | null;
  appleMusicUrl: string | null;
  youtubeUrl: string | null;
  soundcloudUrl: string | null;
  otherStores: { platform: string; url: string }[];
}

interface ImportResponse {
  success?: boolean;
  error?: string;
  reason?: string;
  explanation?: string;
  possibleReason?: string;
  url: string;
  extracted?: ExtractedMetadata;
  diagnostics?: {
    httpStatus: number | null;
    looksLikeSpa: boolean;
    spaReason: string | null;
    fetchError: string | null;
    timeout: boolean;
  };
}

// ==================== COMPONENT ====================

export function TrackImporter() {
  const locale = useAppStore((s) => s.locale);
  const addRelease = useAppStore((s) => s.addRelease);
  const setSelectedReleaseId = useAppStore((s) => s.setSelectedReleaseId);
  const setActiveTab = useAppStore((s) => s.setActiveTab);

  const [url, setUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [createdRelease, setCreatedRelease] = useState<Release | null>(null);

  const handleImport = async () => {
    const trimmed = url.trim();
    if (!trimmed) return;

    setLoading(true);
    setError(null);
    setCreatedRelease(null);

    try {
      // 1. Call the importer API
      const res = await fetch("/api/promolink-import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: trimmed }),
      });

      const data: ImportResponse = await res.json();

      // 2. If extraction failed, show technical reason
      if (!res.ok || data.error || !data.extracted) {
        const reason = buildErrorMessage(data);
        setError(reason);
        setLoading(false);
        return;
      }

      // 3. Extract metadata
      const meta = data.extracted;

      // 4. Create the Release with extracted data
      const newId = addRelease({
        type: "single",
        title: meta.title || trimmed,
        artists: meta.artists.length > 0 ? meta.artists : [],
        trackIds: [],
        genre: meta.genre || "",
        notes: "",
        sourceUrl: trimmed,
        status: "imported",
        beatportUrl: meta.beatportUrl || undefined,
        spotifyUrl: meta.spotifyUrl || undefined,
        promoLink: trimmed.includes("promolink.app") ? trimmed : undefined,
        label: meta.label || undefined,
      });

      // 5. Fetch the created release from store
      const created = useAppStore.getState().releases.find((r) => r.id === newId);
      if (created) {
        setCreatedRelease(created);
      }

      setLoading(false);
    } catch (err: any) {
      setError(`Errore di rete: ${err.message}`);
      setLoading(false);
    }
  };

  const handleFindDjs = () => {
    if (!createdRelease) return;
    setSelectedReleaseId(createdRelease.id);
    setActiveTab("demos");
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" && !loading) {
      handleImport();
    }
  };

  const handleReset = () => {
    setUrl("");
    setError(null);
    setCreatedRelease(null);
  };

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      {/* === INPUT FORM === */}
      {!createdRelease && (
        <>
          <div className="space-y-2 text-center">
            <div className="inline-flex items-center justify-center w-14 h-14 rounded-full bg-primary/10 border border-primary/20 mb-2">
              <LinkIcon className="h-6 w-6 text-primary" />
            </div>
            <h2 className="text-xl font-bold">
              {locale === "it" ? "Nuova Traccia" : "New Track"}
            </h2>
            <p className="text-sm text-muted-foreground max-w-md mx-auto">
              {locale === "it"
                ? "Incolla il link PromoLink della tua traccia. Estraiamo automaticamente titolo, artisti, label, genere, cover e link agli store."
                : "Paste the PromoLink URL of your track. We automatically extract title, artists, label, genre, cover and store links."}
            </p>
          </div>

          <Card className="bg-card/60 border-border/40">
            <CardContent className="p-6 space-y-4">
              <div className="space-y-2">
                <label className="text-xs font-mono uppercase tracking-wider text-muted-foreground">
                  {locale === "it" ? "Link della traccia" : "Track link"}
                </label>
                <Input
                  type="url"
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder="https://promolink.app/s/..."
                  autoFocus
                  disabled={loading}
                  className="h-12 text-sm bg-secondary/50"
                />
                <p className="text-[10px] text-muted-foreground/60">
                  {locale === "it"
                    ? "Funziona meglio con link PromoLink. Accetta anche Beatport, SoundCloud, Spotify."
                    : "Works best with PromoLink URLs. Also accepts Beatport, SoundCloud, Spotify."}
                </p>
              </div>

              <Button
                onClick={handleImport}
                disabled={!url.trim() || loading}
                className="w-full h-12 gap-2 text-sm font-semibold bg-emerald-600 hover:bg-emerald-700 text-white"
                size="lg"
              >
                {loading ? (
                  <>
                    <Loader2 className="h-5 w-5 animate-spin" />
                    {locale === "it" ? "Importazione..." : "Importing..."}
                  </>
                ) : (
                  <>
                    <Rocket className="h-5 w-5" />
                    {locale === "it" ? "IMPORTA" : "IMPORT"}
                  </>
                )}
              </Button>
            </CardContent>
          </Card>

          {/* === ERROR === */}
          {error && (
            <Card className="bg-red-500/5 border-red-500/30">
              <CardContent className="p-5 space-y-3">
                <div className="flex items-start gap-2">
                  <AlertCircle className="h-5 w-5 text-red-400 flex-shrink-0 mt-0.5" />
                  <div className="space-y-1 flex-1 min-w-0">
                    <p className="font-semibold text-red-400 text-sm">
                      {locale === "it" ? "Importazione fallita" : "Import failed"}
                    </p>
                    <p className="text-xs text-muted-foreground whitespace-pre-wrap">{error}</p>
                  </div>
                </div>
                <Button variant="outline" size="sm" onClick={handleReset} className="w-full">
                  {locale === "it" ? "Riprova" : "Try again"}
                </Button>
              </CardContent>
            </Card>
          )}
        </>
      )}

      {/* === CREATED RELEASE SCHEDULE === */}
      {createdRelease && (
        <div className="space-y-5">
          {/* Success banner */}
          <div className="p-4 rounded-lg bg-emerald-500/10 border border-emerald-500/30 flex items-center gap-2">
            <CheckCircle2 className="h-5 w-5 text-emerald-400 flex-shrink-0" />
            <p className="font-semibold text-emerald-400 text-sm">
              {locale === "it" ? "Traccia importata con successo!" : "Track imported successfully!"}
            </p>
          </div>

          {/* Cover + Title + Artists */}
          <Card className="bg-card/60 border-border/40 overflow-hidden">
            {createdRelease.label && (
              <div className="px-5 pt-4">
                <Badge variant="secondary" className="text-[10px] font-mono">
                  {createdRelease.label}
                </Badge>
              </div>
            )}
            <CardContent className="p-5 space-y-4">
              <div className="flex gap-4">
                {/* Cover */}
                <div className="flex-shrink-0">
                  {/* Cover extraction not stored in Release interface — show placeholder if no cover */}
                  <div className="w-24 h-24 rounded-lg bg-secondary/50 border border-border/40 flex items-center justify-center overflow-hidden">
                    <Music2 className="h-8 w-8 text-muted-foreground/50" />
                  </div>
                </div>

                {/* Title + Artists */}
                <div className="flex-1 min-w-0 space-y-1">
                  <h2 className="text-lg font-bold text-foreground break-words">
                    {createdRelease.title}
                  </h2>
                  {createdRelease.artists.length > 0 && (
                    <p className="text-sm text-muted-foreground">
                      {createdRelease.artists.join(", ")}
                    </p>
                  )}
                  {createdRelease.genre && (
                    <Badge variant="outline" className="text-[10px] font-mono mt-1">
                      {createdRelease.genre}
                    </Badge>
                  )}
                </div>
              </div>

              {/* Store URLs */}
              {(createdRelease.beatportUrl || createdRelease.spotifyUrl || createdRelease.promoLink) && (
                <div className="space-y-2 pt-3 border-t border-border/30">
                  <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
                    {locale === "it" ? "Link disponibili" : "Available links"}
                  </p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {createdRelease.beatportUrl && (
                      <StoreLink icon={Disc3} label="Beatport" url={createdRelease.beatportUrl} />
                    )}
                    {createdRelease.spotifyUrl && (
                      <StoreLink icon={Music2} label="Spotify" url={createdRelease.spotifyUrl} />
                    )}
                    {createdRelease.promoLink && (
                      <StoreLink icon={LinkIcon} label="PromoLink" url={createdRelease.promoLink} />
                    )}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          {/* === TROVA DJ === */}
          <Button
            onClick={handleFindDjs}
            className="w-full h-14 gap-2 text-base font-bold bg-emerald-600 hover:bg-emerald-700 text-white"
            size="lg"
          >
            <Rocket className="h-5 w-5" />
            🎯 {locale === "it" ? "TROVA DJ" : "FIND DJs"}
          </Button>

          {/* Secondary: importa un'altra traccia */}
          <Button variant="ghost" size="sm" onClick={handleReset} className="w-full text-muted-foreground">
            {locale === "it" ? "Importa un'altra traccia" : "Import another track"}
          </Button>
        </div>
      )}
    </div>
  );
}

// ==================== HELPERS ====================

function buildErrorMessage(data: ImportResponse): string {
  const parts: string[] = [];

  if (data.error) parts.push(data.error);
  if (data.possibleReason) parts.push(`Causa probabile: ${data.possibleReason}`);
  if (data.explanation) parts.push(`Spiegazione: ${data.explanation}`);

  // Add diagnostic detail if available
  if (data.diagnostics) {
    const d = data.diagnostics;
    if (d.httpStatus) parts.push(`HTTP status: ${d.httpStatus}`);
    if (d.looksLikeSpa && d.spaReason) parts.push(`SPA: ${d.spaReason}`);
    if (d.fetchError) parts.push(`Errore fetch: ${d.fetchError}`);
    if (d.timeout) parts.push("Timeout: la pagina non ha risposto entro 15 secondi");
  }

  return parts.join("\n\n");
}

// ==================== STORE LINK COMPONENT ====================

function StoreLink({ icon: Icon, label, url }: { icon: typeof Disc3; label: string; url: string }) {
  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      className="flex items-center gap-2 p-2 rounded-md bg-secondary/30 hover:bg-secondary/50 transition-colors text-xs"
    >
      <Icon className="h-3.5 w-3.5 text-primary flex-shrink-0" />
      <span className="text-muted-foreground">{label}</span>
      <ExternalLink className="h-3 w-3 ml-auto opacity-50 flex-shrink-0" />
    </a>
  );
}
