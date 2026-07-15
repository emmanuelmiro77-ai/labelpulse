"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Loader2, Search, AlertCircle, CheckCircle2 } from "lucide-react";

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

interface Diagnostics {
  httpStatus: number | null;
  contentType: string | null;
  htmlLength: number;
  hasJsonLd: boolean;
  jsonLdCount: number;
  hasOgTags: boolean;
  ogTagCount: number;
  hasNextData: boolean;
  scriptCount: number;
  linkCount: number;
  anchorCount: number;
  looksLikeSpa: boolean;
  spaReason: string | null;
  fetchError: string | null;
  redirectedTo: string | null;
  timeout: boolean;
}

interface ApiResponse {
  success?: boolean;
  error?: string;
  reason?: string;
  explanation?: string;
  possibleReason?: string;
  possibleSolutions?: string[];
  url: string;
  fetchedAt?: string;
  diagnostics?: Diagnostics;
  extracted?: ExtractedMetadata;
  raw?: {
    ogTitle: string | null;
    ogDescription: string | null;
    ogImage: string | null;
    ogUrl: string | null;
    titleTag: string | null;
    jsonLdCount: number;
    hasNextData: boolean;
  };
}

export default function PromoLinkTestPage() {
  const [url, setUrl] = useState("https://promolink.app/s/iamt522");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<ApiResponse | null>(null);

  const handleExtract = async () => {
    setLoading(true);
    setResult(null);
    try {
      const res = await fetch("/api/promolink-import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url }),
      });
      const data: ApiResponse = await res.json();
      setResult(data);
    } catch (err: any) {
      setResult({
        url,
        error: "Network error",
        reason: err.message,
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-4xl mx-auto p-6 space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold">PromoLink Importer — Diagnostica</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Estrae metadati da un URL PromoLink. Non crea la traccia, solo diagnostica.
        </p>
      </div>

      {/* Input */}
      <div className="flex gap-2">
        <Input
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="https://promolink.app/s/..."
          className="flex-1 h-11"
          onKeyDown={(e) => e.key === "Enter" && !loading && handleExtract()}
        />
        <Button onClick={handleExtract} disabled={loading || !url.trim()} className="h-11 gap-2">
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
          {loading ? "Estrazione..." : "Estrai Metadati"}
        </Button>
      </div>

      {/* Results */}
      {result && (
        <div className="space-y-4">
          {/* Error or Success banner */}
          {result.error ? (
            <div className="p-4 rounded-lg bg-red-500/10 border border-red-500/30">
              <div className="flex items-start gap-2">
                <AlertCircle className="h-5 w-5 text-red-400 flex-shrink-0 mt-0.5" />
                <div className="space-y-1">
                  <p className="font-semibold text-red-400">{result.error}</p>
                  {result.reason && <p className="text-sm text-muted-foreground">{result.reason}</p>}
                  {result.possibleReason && (
                    <p className="text-sm text-amber-400 mt-2">
                      <span className="font-semibold">Possibile causa:</span> {result.possibleReason}
                    </p>
                  )}
                  {result.explanation && (
                    <p className="text-sm text-amber-400 mt-2">
                      <span className="font-semibold">Spiegazione:</span> {result.explanation}
                    </p>
                  )}
                  {result.possibleSolutions && result.possibleSolutions.length > 0 && (
                    <div className="mt-2">
                      <p className="text-sm font-semibold text-foreground">Possibili soluzioni:</p>
                      <ul className="text-sm text-muted-foreground list-disc list-inside mt-1">
                        {result.possibleSolutions.map((s, i) => <li key={i}>{s}</li>)}
                      </ul>
                    </div>
                  )}
                </div>
              </div>
            </div>
          ) : (
            <div className="p-4 rounded-lg bg-emerald-500/10 border border-emerald-500/30">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="h-5 w-5 text-emerald-400" />
                <p className="font-semibold text-emerald-400">Pagina caricata e analizzata</p>
              </div>
            </div>
          )}

          {/* Extracted Metadata */}
          {result.extracted && (
            <div className="p-4 rounded-lg bg-card/60 border border-border/40">
              <h2 className="text-sm font-semibold uppercase tracking-wider text-primary mb-4">
                Metadati Estratti
              </h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
                <MetadataRow label="Title" value={result.extracted.title} />
                <MetadataRow label="Artists" value={result.extracted.artists.length > 0 ? result.extracted.artists.join(", ") : null} />
                <MetadataRow label="Label" value={result.extracted.label} />
                <MetadataRow label="Genre" value={result.extracted.genre} />
                <MetadataRow label="Cover" value={result.extracted.cover} isLink />
                <MetadataRow label="Beatport URL" value={result.extracted.beatportUrl} isLink />
                <MetadataRow label="Spotify URL" value={result.extracted.spotifyUrl} isLink />
                <MetadataRow label="Apple Music URL" value={result.extracted.appleMusicUrl} isLink />
                <MetadataRow label="YouTube URL" value={result.extracted.youtubeUrl} isLink />
                <MetadataRow label="SoundCloud URL" value={result.extracted.soundcloudUrl} isLink />
              </div>
              {result.extracted.otherStores.length > 0 && (
                <div className="mt-4 pt-3 border-t border-border/30">
                  <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">Altri Store</p>
                  <div className="space-y-1">
                    {result.extracted.otherStores.map((s, i) => (
                      <div key={i} className="text-sm">
                        <span className="text-muted-foreground">{s.platform}:</span>{" "}
                        <a href={s.url} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline truncate">
                          {s.url}
                        </a>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              {result.extracted.cover && (
                <div className="mt-4 pt-3 border-t border-border/30">
                  <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">Cover Art</p>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={result.extracted.cover}
                    alt="Cover"
                    className="w-32 h-32 rounded-lg object-cover border border-border/40"
                    onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
                  />
                </div>
              )}
            </div>
          )}

          {/* Cover preview */}

          {/* Raw OG/Title data */}
          {result.raw && (
            <div className="p-4 rounded-lg bg-secondary/30 border border-border/30">
              <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground mb-3">
                Dati Grezzi (og: tags, title, JSON-LD)
              </h2>
              <pre className="text-xs overflow-auto max-h-64 p-3 bg-black/20 rounded">
                {JSON.stringify(result.raw, null, 2)}
              </pre>
            </div>
          )}

          {/* Diagnostics */}
          {result.diagnostics && (
            <div className="p-4 rounded-lg bg-secondary/30 border border-border/30">
              <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground mb-3">
                Diagnostica Tecnica
              </h2>
              <pre className="text-xs overflow-auto max-h-64 p-3 bg-black/20 rounded">
                {JSON.stringify(result.diagnostics, null, 2)}
              </pre>
            </div>
          )}

          {/* Full JSON response */}
          <div className="p-4 rounded-lg bg-secondary/30 border border-border/30">
            <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground mb-3">
              Risposta Completa (JSON)
            </h2>
            <pre className="text-xs overflow-auto max-h-96 p-3 bg-black/20 rounded">
              {JSON.stringify(result, null, 2)}
            </pre>
          </div>
        </div>
      )}
    </div>
  );
}

function MetadataRow({ label, value, isLink }: { label: string; value: string | null; isLink?: boolean }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</span>
      {value ? (
        isLink ? (
          <a href={value} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline truncate text-xs">
            {value}
          </a>
        ) : (
          <span className="text-foreground truncate">{value}</span>
        )
      ) : (
        <span className="text-muted-foreground/50 italic text-xs">non disponibile</span>
      )}
    </div>
  );
}
