"use client";

/**
 * 🔒 RP-012 — Track Importer con schermata di revisione metadati
 *
 * Workflow:
 *   1. Utente incolla URL PromoLink
 *   2. Premere IMPORTA
 *   3. Frontend chiama /api/promolink-import
 *   4. Se metadati estratti: mostra schermata di revisione
 *      - Campi compilati se estratti correttamente
 *      - Campi mancanti evidenziati (editable)
 *      - Genere Beatport: Select con lista generi se non importato
 *   5. 🎯 TROVA DJ abilitato SOLO quando Genere Beatport è valorizzato
 *   6. Al click TROVA DJ: crea la Release con i dati (eventualmente editati)
 *      e apre il Promotion Workspace
 */

import React, { useState, useMemo } from "react";
import { useAppStore } from "@/lib/store";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label as UILabel } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Rocket,
  Loader2,
  Link as LinkIcon,
  AlertCircle,
  CheckCircle2,
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
  hostname?: string;
  source?: string;
  sourceType?: string;
  extracted?: ExtractedMetadata;
  diagnostics?: {
    source?: string;
    httpStatus: number | null;
    looksLikeSpa?: boolean;
    spaReason?: string | null;
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
  const getGenres = useAppStore((s) => s.getGenres);
  const beatportGenres = useMemo(() => getGenres() || [], [getGenres]);

  const [url, setUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Review state — editable fields
  const [reviewMode, setReviewMode] = useState(false);
  const [detectedSource, setDetectedSource] = useState<string>("");
  const [reviewData, setReviewData] = useState({
    title: "",
    artists: "",
    genre: "",
    label: "",
    beatportUrl: "",
    promoLinkUrl: "",
  });

  const handleImport = async () => {
    const trimmed = url.trim();
    if (!trimmed) return;

    setLoading(true);
    setError(null);
    setReviewMode(false);

    try {
      const res = await fetch("/api/track-import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: trimmed }),
      });

      const data: ImportResponse = await res.json();

      if (!res.ok || data.error || !data.extracted) {
        setError(buildErrorMessage(data));
        setLoading(false);
        return;
      }

      const meta = data.extracted;

      // Track detected source for display
      setDetectedSource(data.source || "Sconosciuta");

      // Populate review fields with extracted data
      setReviewData({
        title: meta.title || "",
        artists: meta.artists.join(", "),
        genre: meta.genre || "",
        label: meta.label || "",
        beatportUrl: meta.beatportUrl || "",
        promoLinkUrl: trimmed.includes("promolink.app") ? trimmed : (meta.soundcloudUrl || ""),
      });

      setReviewMode(true);
      setLoading(false);
    } catch (err: any) {
      setError(`Errore di rete: ${err.message}`);
      setLoading(false);
    }
  };

  const handleFindDjs = () => {
    // Validate genre is filled
    if (!reviewData.genre.trim()) return;

    // Create the Release with reviewed data
    const artists = reviewData.artists
      .split(",")
      .map((a) => a.trim())
      .filter(Boolean);

    const newId = addRelease({
      type: "single",
      title: reviewData.title || url,
      artists,
      trackIds: [],
      genre: reviewData.genre.trim(),
      notes: "",
      sourceUrl: url.trim(),
      status: "imported",
      label: reviewData.label.trim() || undefined,
      beatportUrl: reviewData.beatportUrl.trim() || undefined,
      promoLink: reviewData.promoLinkUrl.trim() || undefined,
    });

    setSelectedReleaseId(newId);
    setActiveTab("demos");
  };

  const handleReset = () => {
    setUrl("");
    setError(null);
    setReviewMode(false);
    setDetectedSource("");
    setReviewData({ title: "", artists: "", genre: "", label: "", beatportUrl: "", promoLinkUrl: "" });
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" && !loading) handleImport();
  };

  const isGenreFilled = reviewData.genre.trim().length > 0;

  // ==================== RENDER ====================

  if (reviewMode) {
    return (
      <ReviewScreen
        reviewData={reviewData}
        setReviewData={setReviewData}
        beatportGenres={beatportGenres}
        isGenreFilled={isGenreFilled}
        onFindDjs={handleFindDjs}
        onReset={handleReset}
        detectedSource={detectedSource}
        locale={locale}
      />
    );
  }

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      {/* Input form */}
      <div className="space-y-2 text-center">
        <div className="inline-flex items-center justify-center w-14 h-14 rounded-full bg-primary/10 border border-primary/20 mb-2">
          <LinkIcon className="h-6 w-6 text-primary" />
        </div>
        <h2 className="text-xl font-bold">
          {locale === "it" ? "Nuova Traccia" : "New Track"}
        </h2>
        <p className="text-sm text-muted-foreground max-w-md mx-auto">
          {locale === "it"
            ? "Incolla il link della tua traccia (PromoLink, Beatport, Spotify, SoundCloud, Linktree). Riconosciamo automaticamente la sorgente."
            : "Paste your track link (PromoLink, Beatport, Spotify, SoundCloud, Linktree). We auto-detect the source."}
        </p>
      </div>

      <Card className="bg-card/60 border-border/40">
        <CardContent className="p-6 space-y-4">
          <div className="space-y-2">
            <UILabel className="text-xs font-mono uppercase tracking-wider text-muted-foreground">
              {locale === "it" ? "Link della traccia" : "Track link"}
            </UILabel>
            <Input
              type="url"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="https://..."
              autoFocus
              disabled={loading}
              className="h-12 text-sm bg-secondary/50"
            />
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
    </div>
  );
}

// ==================== REVIEW SCREEN ====================

interface ReviewScreenProps {
  reviewData: {
    title: string;
    artists: string;
    genre: string;
    label: string;
    beatportUrl: string;
    promoLinkUrl: string;
  };
  setReviewData: React.Dispatch<React.SetStateAction<{
    title: string;
    artists: string;
    genre: string;
    label: string;
    beatportUrl: string;
    promoLinkUrl: string;
  }>>;
  beatportGenres: string[];
  isGenreFilled: boolean;
  onFindDjs: () => void;
  onReset: () => void;
  detectedSource: string;
  locale: string;
}

function ReviewScreen({
  reviewData,
  setReviewData,
  beatportGenres,
  isGenreFilled,
  onFindDjs,
  onReset,
  detectedSource,
  locale,
}: ReviewScreenProps) {
  return (
    <div className="max-w-2xl mx-auto space-y-5">
      {/* Success banner + source detected */}
      <div className="p-4 rounded-lg bg-emerald-500/10 border border-emerald-500/30 flex items-center gap-2">
        <CheckCircle2 className="h-5 w-5 text-emerald-400 flex-shrink-0" />
        <div className="flex-1">
          <p className="font-semibold text-emerald-400 text-sm">
            {locale === "it" ? "Metadati estratti!" : "Metadata extracted!"}
          </p>
          <p className="text-xs text-muted-foreground">
            {locale === "it"
              ? "Controlla i dati qui sotto. Completa i campi mancanti (evidenziati in rosso)."
              : "Review the data below. Complete missing fields (highlighted in red)."}
          </p>
        </div>
        {detectedSource && (
          <div className="flex-shrink-0 px-3 py-1.5 rounded-md bg-primary/10 border border-primary/20">
            <p className="text-[9px] uppercase tracking-wider text-muted-foreground">
              {locale === "it" ? "Sorgente" : "Source"}
            </p>
            <p className="text-xs font-semibold text-primary">{detectedSource}</p>
          </div>
        )}
      </div>

      {/* Review form */}
      <Card className="bg-card/60 border-border/40">
        <CardContent className="p-6 space-y-4">
          {/* Titolo */}
          <ReviewField
            label={locale === "it" ? "Titolo" : "Title"}
            value={reviewData.title}
            onChange={(v) => setReviewData((prev) => ({ ...prev, title: v }))}
            required
          />

          {/* Artisti */}
          <ReviewField
            label={locale === "it" ? "Artisti" : "Artists"}
            value={reviewData.artists}
            onChange={(v) => setReviewData((prev) => ({ ...prev, artists: v }))}
            placeholder={locale === "it" ? "Artist1, Artist2" : "Artist1, Artist2"}
            required
          />

          {/* Genere Beatport — CRITICO */}
          <div className="space-y-1.5">
            <UILabel className="text-xs font-mono uppercase tracking-wider text-muted-foreground">
              {locale === "it" ? "Genere Beatport" : "Beatport Genre"}
              <span className="ml-1 text-primary">*</span>
              <span className="ml-1 text-[10px] text-amber-400 normal-case font-sans">
                ({locale === "it" ? "obbligatorio per TROVA DJ" : "required for FIND DJs"})
              </span>
            </UILabel>
            {reviewData.genre ? (
              // Genre was extracted — show as read-only badge with option to change
              <div className="flex items-center gap-2">
                <Badge variant="secondary" className="text-xs font-mono px-2 py-1 bg-emerald-500/10 text-emerald-400 border-emerald-500/20">
                  {reviewData.genre}
                </Badge>
                <Select
                  value={reviewData.genre}
                  onValueChange={(v) => setReviewData((prev) => ({ ...prev, genre: v }))}
                >
                  <SelectTrigger className="h-8 text-xs flex-1 bg-secondary/50">
                    <SelectValue placeholder={locale === "it" ? "Cambia genere..." : "Change genre..."} />
                  </SelectTrigger>
                  <SelectContent>
                    {beatportGenres.map((g) => (
                      <SelectItem key={g} value={g}>{g}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            ) : (
              // Genre missing — highlight red, force selection
              <Select
                value={reviewData.genre}
                onValueChange={(v) => setReviewData((prev) => ({ ...prev, genre: v }))}
              >
                <SelectTrigger className="h-10 text-sm bg-red-500/5 border-red-500/40">
                  <SelectValue placeholder={locale === "it" ? "⚠️ Seleziona genere Beatport" : "⚠️ Select Beatport genre"} />
                </SelectTrigger>
                <SelectContent>
                  {beatportGenres.map((g) => (
                    <SelectItem key={g} value={g}>{g}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>

          {/* Label */}
          <ReviewField
            label="Label"
            value={reviewData.label}
            onChange={(v) => setReviewData((prev) => ({ ...prev, label: v }))}
            placeholder="IAMT"
          />

          {/* Beatport URL */}
          <ReviewField
            label="Beatport URL"
            value={reviewData.beatportUrl}
            onChange={(v) => setReviewData((prev) => ({ ...prev, beatportUrl: v }))}
            placeholder="https://www.beatport.com/release/..."
          />

          {/* PromoLink URL */}
          <ReviewField
            label="PromoLink URL"
            value={reviewData.promoLinkUrl}
            onChange={(v) => setReviewData((prev) => ({ ...prev, promoLinkUrl: v }))}
            placeholder="https://promolink.app/s/..."
          />
        </CardContent>
      </Card>

      {/* TROVA DJ — disabled if genre not filled */}
      <Button
        onClick={onFindDjs}
        disabled={!isGenreFilled}
        className="w-full h-14 gap-2 text-base font-bold bg-emerald-600 hover:bg-emerald-700 text-white disabled:opacity-40 disabled:cursor-not-allowed"
        size="lg"
      >
        <Rocket className="h-5 w-5" />
        🎯 {locale === "it" ? "TROVA DJ" : "FIND DJs"}
      </Button>

      {!isGenreFilled && (
        <p className="text-center text-xs text-amber-400">
          {locale === "it"
            ? "⚠️ Seleziona il Genere Beatport per abilitare TROVA DJ"
            : "⚠️ Select a Beatport Genre to enable FIND DJs"}
        </p>
      )}

      <Button variant="ghost" size="sm" onClick={onReset} className="w-full text-muted-foreground">
        {locale === "it" ? "Importa un'altra traccia" : "Import another track"}
      </Button>
    </div>
  );
}

// ==================== REVIEW FIELD ====================

function ReviewField({
  label,
  value,
  onChange,
  placeholder,
  required,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  required?: boolean;
}) {
  const isEmpty = !value.trim();
  return (
    <div className="space-y-1.5">
      <UILabel className="text-xs font-mono uppercase tracking-wider text-muted-foreground">
        {label}
        {required && <span className="ml-1 text-primary">*</span>}
        {isEmpty && (
          <span className="ml-2 text-[10px] text-red-400 normal-case font-sans">
            (mancante)
          </span>
        )}
      </UILabel>
      <Input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder || ""}
        className={`h-10 text-sm ${isEmpty ? "bg-red-500/5 border-red-500/30" : "bg-emerald-500/5 border-emerald-500/20"}`}
      />
    </div>
  );
}

// ==================== HELPERS ====================

function buildErrorMessage(data: ImportResponse): string {
  // Caso speciale: formato non supportato
  if (data.error === "Formato non ancora supportato") {
    const parts = [data.error];
    if (data.hostname) parts.push(`Dominio: ${data.hostname}`);
    parts.push("Sorgenti supportate: PromoLink, Beatport, Spotify, SoundCloud, Linktree");
    return parts.join("\n");
  }

  const parts: string[] = [];
  if (data.error) parts.push(data.error);
  if (data.possibleReason) parts.push(`Causa probabile: ${data.possibleReason}`);
  if (data.explanation) parts.push(`Spiegazione: ${data.explanation}`);
  if (data.diagnostics) {
    const d = data.diagnostics;
    if (d.source) parts.push(`Sorgente: ${d.source}`);
    if (d.httpStatus) parts.push(`HTTP status: ${d.httpStatus}`);
    if (d.looksLikeSpa && d.spaReason) parts.push(`SPA: ${d.spaReason}`);
    if (d.fetchError) parts.push(`Errore fetch: ${d.fetchError}`);
    if (d.timeout) parts.push("Timeout: la pagina non ha risposto entro 20 secondi");
  }
  return parts.join("\n\n");
}
