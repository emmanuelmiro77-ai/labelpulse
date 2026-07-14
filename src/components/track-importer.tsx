"use client";

/**
 * 🔒 RP-008 — Track Importer
 *
 * Schermata NUOVA TRACCIA: un solo campo URL + pulsante ANALIZZA.
 *
 * Alla pressione di ANALIZZA:
 *   1. Crea una nuova Release con:
 *      - title = URL incollata
 *      - source_url = URL
 *      - status = 'imported'
 *      - type = 'single'
 *      - trackIds = [] (vuoto, non ci sono demo collegati)
 *      - createdAt = now()
 *   2. Apre IMMEDIATAMENTE il Promotion Workspace già esistente
 *      (setSelectedReleaseId) senza chiudere dialog o chiedere altro.
 *
 * Nessuno scraping, nessun parsing, nessuna AI, nessuna richiesta esterna.
 * Lo scraping sarà implementato in uno sprint successivo.
 */

import React, { useState } from "react";
import { useAppStore } from "@/lib/store";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Rocket, Loader2, Link as LinkIcon } from "lucide-react";

export function TrackImporter() {
  const locale = useAppStore((s) => s.locale);
  const addRelease = useAppStore((s) => s.addRelease);
  const setSelectedReleaseId = useAppStore((s) => s.setSelectedReleaseId);
  const setActiveTab = useAppStore((s) => s.setActiveTab);

  const [url, setUrl] = useState("");
  const [loading, setLoading] = useState(false);

  const handleAnalyze = () => {
    const trimmed = url.trim();
    if (!trimmed) return;

    setLoading(true);

    // Crea la track come release minimale
    const newId = addRelease({
      type: "single",
      title: trimmed,
      artists: [],
      trackIds: [],
      genre: "",
      notes: "",
      sourceUrl: trimmed,
      status: "imported",
    });

    setLoading(false);

    // Apri immediatamente il Promotion Workspace per questa track
    setSelectedReleaseId(newId);
    // Switch al tab "demos" dove viene renderizzato il ReleaseDetail / Promotion Workspace
    setActiveTab("demos");
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" && !loading) {
      handleAnalyze();
    }
  };

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      {/* Header */}
      <div className="space-y-2 text-center">
        <div className="inline-flex items-center justify-center w-14 h-14 rounded-full bg-primary/10 border border-primary/20 mb-2">
          <LinkIcon className="h-6 w-6 text-primary" />
        </div>
        <h2 className="text-xl font-bold">
          {locale === "it" ? "Nuova Traccia" : "New Track"}
        </h2>
        <p className="text-sm text-muted-foreground max-w-md mx-auto">
          {locale === "it"
            ? "Incolla il link della tua traccia (Beatport, PromoLink, SoundCloud, Spotify, Linktree, YouTube) e trova subito i DJ da contattare."
            : "Paste the link to your track (Beatport, PromoLink, SoundCloud, Spotify, Linktree, YouTube) and instantly find DJs to contact."}
        </p>
      </div>

      {/* Form */}
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
              placeholder="https://..."
              autoFocus
              disabled={loading}
              className="h-12 text-sm bg-secondary/50"
            />
            <p className="text-[10px] text-muted-foreground/60">
              {locale === "it"
                ? "Accetta qualsiasi URL. Nessuna validazione del tipo."
                : "Accepts any URL. No type validation."}
            </p>
          </div>

          <Button
            onClick={handleAnalyze}
            disabled={!url.trim() || loading}
            className="w-full h-12 gap-2 text-sm font-semibold bg-emerald-600 hover:bg-emerald-700 text-white"
            size="lg"
          >
            {loading ? (
              <Loader2 className="h-5 w-5 animate-spin" />
            ) : (
              <>
                <Rocket className="h-5 w-5" />
                {locale === "it" ? "ANALIZZA" : "ANALYZE"}
              </>
            )}
          </Button>
        </CardContent>
      </Card>

      {/* Esempi */}
      <div className="text-center space-y-1">
        <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
          {locale === "it" ? "Esempi di URL supportati" : "Supported URL examples"}
        </p>
        <div className="flex flex-wrap justify-center gap-2 text-[10px] text-muted-foreground/70">
          <span className="px-2 py-1 rounded bg-secondary/40">Beatport</span>
          <span className="px-2 py-1 rounded bg-secondary/40">PromoLink</span>
          <span className="px-2 py-1 rounded bg-secondary/40">SoundCloud</span>
          <span className="px-2 py-1 rounded bg-secondary/40">Spotify</span>
          <span className="px-2 py-1 rounded bg-secondary/40">Linktree</span>
          <span className="px-2 py-1 rounded bg-secondary/40">YouTube</span>
        </div>
      </div>
    </div>
  );
}
